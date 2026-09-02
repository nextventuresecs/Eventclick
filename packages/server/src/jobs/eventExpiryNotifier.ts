import { and, eq, gte, isNull, lt } from "drizzle-orm";
import { authDb } from "../db";
import { runInBackgroundTenantContext } from "../db/backgroundTenantContext";
import { eventRooms } from "../db/schema";
import { notifyEventCancelledOrExpired } from "../services/event-cancellation-notification.service";
import { redisClient } from "../config/redis";
import { logger } from "../utils/logger";
import {
  EVENT_EXPIRY_LOOKBACK_HOURS,
  EVENT_EXPIRY_NOTIFIER_LOCK_TTL_SEC,
  EVENT_EXPIRY_NOTIFIER_POLL_MS,
} from "../config/constants";

const LOCK_KEY = "lock:eventExpiryNotifier";

/**
 * The oldest scheduledEnd the poll will consider. Exported so the bound is
 * directly testable: it is the guard that stops the first run against real
 * data from notifying everyone about every event that ever failed to happen.
 */
export const expiryLookbackStart = (now: Date): Date =>
  new Date(now.getTime() - EVENT_EXPIRY_LOOKBACK_HOURS * 60 * 60 * 1000);

/**
 * EVENT_CANCELLED_OR_EXPIRED, "expired" half — scheduled events whose whole
 * window passed without them ever starting.
 *
 * The condition is deliberately `scheduledEnd < now`, not `scheduledStart`:
 * an event that has not started yet may still start late, and telling an
 * organiser running twenty minutes behind that their event "did not take
 * place" would be both wrong and alarming. Once the scheduled window has
 * closed with no actualStart, it did not happen — that is the earliest moment
 * the claim is unambiguously true.
 *
 * Cancelled rooms are excluded for free: cancelling sets status='cancelled'
 * and this only matches status='scheduled', so the two triggers can share one
 * marker column without racing each other.
 */
export const runEventExpiryNotifications = async (now: Date = new Date()): Promise<void> => {
  const lookbackStart = expiryLookbackStart(now);

  // Cross-tenant by design — one poll covers every organisation, so it runs on
  // authDb (auth_svc_role, BYPASSRLS). db (app_user_login) would enforce RLS
  // by organization_id and match nothing here. The per-room writes inside
  // notifyEventCancelledOrExpired open their own tenant context below.
  const expired = await authDb
    .select()
    .from(eventRooms)
    .where(
      and(
        isNull(eventRooms.deletedAt),
        isNull(eventRooms.eventCancelledOrExpiredNotifiedAt),
        eq(eventRooms.status, "scheduled"),
        isNull(eventRooms.actualStart),
        lt(eventRooms.scheduledEnd, now),
        gte(eventRooms.scheduledEnd, lookbackStart),
      ),
    );

  for (const room of expired) {
    try {
      const { attempted, succeeded } = await runInBackgroundTenantContext(
        room.organizationId,
        room.createdBy,
        () =>
          notifyEventCancelledOrExpired(
            {
              id: room.id,
              title: room.title,
              organizationId: room.organizationId,
              createdBy: room.createdBy,
              scheduledStart: room.scheduledStart,
              cancellationReason: null,
            },
            "expired",
          ),
      );

      // Leave the marker unset so the next poll retries, but only when every
      // recipient failed — a partial success must still be claimed or the
      // members who did get notified would be notified again.
      if (attempted > 0 && succeeded === 0) {
        logger.error(
          { roomId: room.id, attempted },
          "All event-expiry notifications failed — will retry next poll",
        );
        continue;
      }

      await authDb
        .update(eventRooms)
        .set({ eventCancelledOrExpiredNotifiedAt: new Date() })
        .where(
          and(
            eq(eventRooms.id, room.id),
            isNull(eventRooms.eventCancelledOrExpiredNotifiedAt),
          ),
        );

      logger.info(
        { roomId: room.id, attempted, succeeded, event: "notification.event_expired_sent" },
        "Event expiry notifications sent",
      );
    } catch (err) {
      logger.error({ err, roomId: room.id }, "Failed to send event-expiry notifications");
    }
  }
};

/**
 * Redis lock so multiple server instances do not all run the same poll and
 * notify everyone several times over. Same pattern as
 * jobs/attendanceWindowNotifier.ts; the TTL must stay below the poll interval
 * so a crashed holder's lock expires before the next tick.
 */
export const pollEventExpiryNotifications = async (): Promise<void> => {
  if (!redisClient.isOpen) {
    logger.warn({ event: "eventExpiryNotifier.skipped" }, "Redis unavailable — skipping poll");
    return;
  }

  const acquired = await redisClient.set(LOCK_KEY, "1", {
    NX: true,
    EX: EVENT_EXPIRY_NOTIFIER_LOCK_TTL_SEC,
  });
  if (!acquired) return; // another instance is already running this poll

  try {
    await runEventExpiryNotifications();
  } catch (err) {
    logger.error({ err }, "eventExpiryNotifier poll failed");
  } finally {
    await redisClient.del(LOCK_KEY).catch(() => {});
  }
};

export const startEventExpiryNotifierJob = (): void => {
  pollEventExpiryNotifications();
  setInterval(pollEventExpiryNotifications, EVENT_EXPIRY_NOTIFIER_POLL_MS);
};
