import { and, eq, gte, inArray, isNull, lte } from "drizzle-orm";
import { NotificationPreferencesSchema } from "@application/shared";
import { db } from "../db";
import { eventRooms, eventAdminAssignments, users } from "../db/schema";
import { notificationService } from "../services/notification.service";
import { redisClient } from "../config/redis";
import { logger } from "../utils/logger";
import {
  EVENT_START_NOTIFIER_LOCK_TTL_SEC,
  EVENT_START_NOTIFIER_LOOKAHEAD_MIN,
  EVENT_START_NOTIFIER_POLL_MS,
} from "../config/constants";

export interface RoomStartCandidate {
  id: string;
  scheduledStart: Date;
  status: string;
  startNotifiedAt: Date | null;
}

/**
 * Pure selection logic for the "room starting soon" notification job — no DB,
 * no timers, so it's cheap to pin with tests independent of the poll loop.
 */
export const selectRoomsDueForStartNotification = <T extends RoomStartCandidate>(
  rooms: T[],
  now: Date,
  lookaheadMinutes: number,
): T[] => {
  const horizon = new Date(now.getTime() + lookaheadMinutes * 60_000);
  return rooms.filter(
    (room) =>
      room.status === "scheduled" &&
      room.startNotifiedAt === null &&
      room.scheduledStart >= now &&
      room.scheduledStart <= horizon,
  );
};

const LOCK_KEY = "lock:eventStartNotifier";

/**
 * Notify a room's assigned staff (creator + non-revoked event_admin_assignments)
 * that it's starting soon, skipping anyone who opted out via
 * preferences.notifyLiveStart (see settings.controller.ts updatePreferences).
 */
interface NotifyResult {
  attempted: number;
  succeeded: number;
}

const notifyRoomRecipients = async (room: {
  id: string;
  title: string;
  organizationId: string;
  createdBy: string;
  scheduledStart: Date;
}): Promise<NotifyResult> => {
  const assignments = await db
    .select({ userId: eventAdminAssignments.userId })
    .from(eventAdminAssignments)
    .where(and(eq(eventAdminAssignments.roomId, room.id), isNull(eventAdminAssignments.revokedAt)));

  const recipientIds = [...new Set([room.createdBy, ...assignments.map((a) => a.userId)])];

  const recipients = await db
    .select()
    .from(users)
    .where(and(inArray(users.id, recipientIds), isNull(users.deletedAt)));

  const targets = recipients.filter((u) => {
    if (!u.isActive) return false;
    // jsonb has no schema enforcement at the DB layer, so a malformed
    // preferences blob falls back to defaults (notifyLiveStart: true) rather
    // than throwing and dropping every recipient on the floor.
    const parsed = NotificationPreferencesSchema.safeParse(u.preferences ?? {});
    return parsed.success ? parsed.data.notifyLiveStart : true;
  });

  const outcomes = await Promise.all(
    targets.map((u) =>
      notificationService
        .createNotification({
          userId: u.id,
          organizationId: room.organizationId,
          type: "room_starting_soon",
          title: `"${room.title}" starts soon`,
          message: `Starts at ${room.scheduledStart.toLocaleString()}`,
          metadata: { roomId: room.id },
        })
        .then(() => true)
        .catch((err) => {
          logger.error({ err, roomId: room.id, userId: u.id }, "Failed to notify recipient");
          return false;
        }),
    ),
  );

  return { attempted: targets.length, succeeded: outcomes.filter(Boolean).length };
};

export const runEventStartNotifications = async (): Promise<void> => {
  const now = new Date();
  const horizon = new Date(now.getTime() + EVENT_START_NOTIFIER_LOOKAHEAD_MIN * 60_000);

  const candidates = await db
    .select()
    .from(eventRooms)
    .where(
      and(
        eq(eventRooms.status, "scheduled"),
        isNull(eventRooms.startNotifiedAt),
        isNull(eventRooms.deletedAt),
        gte(eventRooms.scheduledStart, now),
        lte(eventRooms.scheduledStart, horizon),
      ),
    );

  const due = selectRoomsDueForStartNotification(candidates, now, EVENT_START_NOTIFIER_LOOKAHEAD_MIN);

  for (const room of due) {
    try {
      const { attempted, succeeded } = await notifyRoomRecipients(room);
      // Leave the marker unset if every attempted send failed, so the next
      // poll retries instead of silently dropping the notification forever.
      // (No recipients at all is not a failure — mark it so we stop looking.)
      if (attempted > 0 && succeeded === 0) {
        logger.error({ roomId: room.id, attempted }, "All room-starting-soon notifications failed — will retry next poll");
        continue;
      }
      // Guard against a still-in-flight overlapping run (belt-and-suspenders
      // alongside the Redis lock below, which may be absent/unconfigured).
      await db
        .update(eventRooms)
        .set({ startNotifiedAt: new Date() })
        .where(and(eq(eventRooms.id, room.id), isNull(eventRooms.startNotifiedAt)));
    } catch (err) {
      logger.error({ err, roomId: room.id }, "Failed to send room-starting-soon notifications");
    }
  }
};

export const pollEventStartNotifications = async (): Promise<void> => {
  if (!redisClient.isOpen) {
    // Without Redis there's no way to guard against a duplicate run on another
    // instance — skip this poll rather than risk double-sending. The next
    // successful poll (once Redis is back) still catches any due room.
    logger.warn({ event: "eventStartNotifier.skipped" }, "Redis unavailable — skipping room-start notification poll");
    return;
  }

  const acquired = await redisClient.set(LOCK_KEY, "1", { NX: true, EX: EVENT_START_NOTIFIER_LOCK_TTL_SEC });
  if (!acquired) return; // another instance is already running this poll

  try {
    await runEventStartNotifications();
  } catch (err) {
    logger.error({ err }, "eventStartNotifier poll failed");
  } finally {
    await redisClient.del(LOCK_KEY).catch(() => {});
  }
};

export const startEventStartNotifierJob = (): void => {
  pollEventStartNotifications();
  setInterval(pollEventStartNotifications, EVENT_START_NOTIFIER_POLL_MS);
};
