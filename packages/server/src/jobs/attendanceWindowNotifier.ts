import { and, eq, gte, inArray, isNull, lte } from "drizzle-orm";
import {
  ChannelRouter,
  isCriticalNotificationEvent,
  NotificationPreferencesSchema,
  type NotificationEvent,
  type NotificationPreferences,
} from "@application/shared";
import { db, authDb } from "../db";
import { runInBackgroundTenantContext } from "../db/backgroundTenantContext";
import { eventRooms, attendanceEntries } from "../db/schema";
import { notificationService } from "../services/notification.service";
import { sendToUser as sendPush } from "../services/push.service";
import { resolveRoomStaffRecipients } from "../services/room-recipients.service";
import { redisClient } from "../config/redis";
import { logger } from "../utils/logger";
import {
  ATTENDANCE_WINDOW_CLOSING_LOOKAHEAD_MIN,
  ATTENDANCE_WINDOW_NOTIFIER_POLL_MS,
  ATTENDANCE_WINDOW_NOTIFIER_LOCK_TTL_SEC,
} from "../config/constants";

const OPEN_LOCK_KEY = "lock:attendanceWindowOpenedNotifier";
const CLOSING_LOCK_KEY = "lock:attendanceWindowClosingNotifier";

export interface RoomWindowOpenCandidate {
  id: string;
  status: string;
  scheduledStart: Date;
  attendanceWindowBefore: number;
  attendanceWindowOpenedNotifiedAt: Date | null;
}

/**
 * Pure selection logic — no DB, no timers — so it's cheap to pin with tests
 * independent of the poll loop.
 *
 * The window opens at scheduledStart - attendanceWindowBefore minutes (see
 * services/attendance-live-window.service.ts::isWithinAttendanceWindow,
 * the "scheduled" branch) — fire once that threshold is reached, while the
 * room is still scheduled or has since gone live (defensive: covers a room
 * that started before this poll ever caught its window-open moment).
 */
export const selectRoomsDueForWindowOpenNotification = <T extends RoomWindowOpenCandidate>(
  rooms: T[],
  now: Date,
): T[] =>
  rooms.filter((room) => {
    if (room.attendanceWindowOpenedNotifiedAt !== null) return false;
    if (room.status !== "scheduled" && room.status !== "live") return false;
    const opensAt = new Date(room.scheduledStart.getTime() - room.attendanceWindowBefore * 60_000);
    return now >= opensAt;
  });

export interface RoomWindowClosingCandidate {
  id: string;
  status: string;
  actualEnd: Date | null;
  attendanceWindowAfter: number;
  attendanceWindowClosingNotifiedAt: Date | null;
}

/**
 * The attendance window's close boundary is only deterministic once a room
 * has ended: scheduled rooms have no fixed close time until they start
 * (isWithinAttendanceWindow's "live" branch stays open indefinitely with no
 * actualEnd), so a "5 minutes before close" warning can only be computed
 * against actualEnd + attendanceWindowAfter, once actualEnd is set.
 */
export const selectRoomsDueForWindowClosingNotification = <T extends RoomWindowClosingCandidate>(
  rooms: T[],
  now: Date,
  lookaheadMinutes: number,
): T[] =>
  rooms.filter((room) => {
    if (room.attendanceWindowClosingNotifiedAt !== null) return false;
    if (room.status !== "ended" || !room.actualEnd) return false;
    const closesAt = new Date(room.actualEnd.getTime() + room.attendanceWindowAfter * 60_000);
    const warnAt = new Date(closesAt.getTime() - lookaheadMinutes * 60_000);
    return now >= warnAt && now <= closesAt;
  });

interface NotifyResult {
  attempted: number;
  succeeded: number;
}

const dispatchToRecipient = async (
  recipient: { id: string; organizationId: string | null; preferences: unknown },
  event: NotificationEvent,
  title: string,
  message: string,
): Promise<void> => {
  if (!recipient.organizationId) return;

  const parsed = NotificationPreferencesSchema.safeParse(recipient.preferences ?? {});
  const preferences: NotificationPreferences = parsed.success ? parsed.data : NotificationPreferencesSchema.parse({});
  const channels = ChannelRouter(event, preferences);
  const critical = isCriticalNotificationEvent(event);

  if (channels.includes("in_app")) {
    await notificationService.createNotification({
      userId: recipient.id,
      organizationId: recipient.organizationId,
      type: event.type,
      title,
      message,
      metadata: event.payload as Record<string, unknown>,
    });
  }

  if (channels.includes("web_push")) {
    // Critical events (ATTENDANCE_WINDOW_CLOSING) get high urgency + a short
    // TTL — arriving after the window has already closed helps no one, and
    // high urgency tells the OS to wake the device rather than batch it.
    await sendPush(
      recipient.id,
      { title, body: message },
      critical ? { urgency: "high", ttlSeconds: 5 * 60 } : undefined,
    );
  }
};

/**
 * ATTENDANCE_WINDOW_OPENED — every staff recipient, subject to normal mute
 * preferences (not critical, per shared's isCriticalNotificationEvent).
 */
export const notifyWindowOpened = async (room: {
  id: string;
  title: string;
  organizationId: string;
  createdBy: string;
  attendanceWindowAfter: number;
  scheduledEnd: Date;
}): Promise<NotifyResult> =>
  // Runs from a poll loop with no ambient request — every RLS-scoped query
  // below needs a tenant context opened for this specific room's org. See
  // db/backgroundTenantContext.ts.
  runInBackgroundTenantContext(room.organizationId, "", async () => {
    const recipients = await resolveRoomStaffRecipients(room.id, room.createdBy);

    const outcomes = await Promise.all(
      recipients.map((u) => {
        const event: NotificationEvent = {
          type: "ATTENDANCE_WINDOW_OPENED",
          scope: { kind: "eventMembers", roomId: room.id },
          payload: { roomId: room.id, windowClosesAt: room.scheduledEnd.toISOString() },
        };
        return dispatchToRecipient(u, event, "Attendance window open", `Attendance is now open for "${room.title}".`)
          .then(() => true)
          .catch((err) => {
            logger.error({ err, roomId: room.id, userId: u.id }, "Failed to notify recipient of attendance window opening");
            return false;
          });
      }),
    );

    return { attempted: recipients.length, succeeded: outcomes.filter(Boolean).length };
  });

/**
 * ATTENDANCE_WINDOW_CLOSING — only staff recipients who haven't marked
 * attendance for this room yet, and always critical (bypasses mutes, per
 * #66's isCriticalNotificationEvent).
 */
export const notifyWindowClosing = async (room: {
  id: string;
  title: string;
  organizationId: string;
  createdBy: string;
}): Promise<NotifyResult> =>
  runInBackgroundTenantContext(room.organizationId, "", async () => {
    const recipients = await resolveRoomStaffRecipients(room.id, room.createdBy);
    if (recipients.length === 0) return { attempted: 0, succeeded: 0 };

    const submitted = await db
      .select({ submittedBy: attendanceEntries.submittedBy })
      .from(attendanceEntries)
      .where(eq(attendanceEntries.roomId, room.id));
    const submittedIds = new Set(submitted.map((s) => s.submittedBy).filter((id): id is string => id !== null));

    const unmarked = recipients.filter((u) => !submittedIds.has(u.id));

    const outcomes = await Promise.all(
      unmarked.map((u) => {
        const event: NotificationEvent = {
          type: "ATTENDANCE_WINDOW_CLOSING",
          scope: { kind: "eventMembers", roomId: room.id },
          payload: { roomId: room.id, closesInMinutes: ATTENDANCE_WINDOW_CLOSING_LOOKAHEAD_MIN },
        };
        return dispatchToRecipient(
          u,
          event,
          "Attendance window closing soon",
          `Attendance for "${room.title}" closes in ${ATTENDANCE_WINDOW_CLOSING_LOOKAHEAD_MIN} minutes — you haven't marked yours yet.`,
        )
          .then(() => true)
          .catch((err) => {
            logger.error({ err, roomId: room.id, userId: u.id }, "Failed to notify recipient of attendance window closing");
            return false;
          });
      }),
    );

    return { attempted: unmarked.length, succeeded: outcomes.filter(Boolean).length };
  });

export const runAttendanceWindowOpenedNotifications = async (): Promise<void> => {
  const now = new Date();
  // Widest possible pre-filter (scheduledStart within a day either side of
  // now) — selectRoomsDueForWindowOpenNotification does the precise check.
  // Rooms use a per-room attendanceWindowBefore, so this can't be narrowed
  // further in SQL without duplicating that arithmetic in the query.
  const dayMs = 24 * 60 * 60 * 1000;
  // Cross-tenant by design (every org's due rooms in one poll) — authDb
  // (auth_svc_role, BYPASSRLS) is required since db (app_user_login) enforces
  // RLS by organization_id and this poll has no single tenant to scope to.
  // Per-room writes inside notifyWindowOpened open their own tenant context.
  const candidates = await authDb
    .select()
    .from(eventRooms)
    .where(
      and(
        isNull(eventRooms.deletedAt),
        isNull(eventRooms.attendanceWindowOpenedNotifiedAt),
        inArray(eventRooms.status, ["scheduled", "live"]),
        gte(eventRooms.scheduledStart, new Date(now.getTime() - dayMs)),
        lte(eventRooms.scheduledStart, new Date(now.getTime() + dayMs)),
      ),
    );

  const due = selectRoomsDueForWindowOpenNotification(candidates, now);

  for (const room of due) {
    try {
      const { attempted, succeeded } = await notifyWindowOpened(room);
      if (attempted > 0 && succeeded === 0) {
        logger.error({ roomId: room.id, attempted }, "All attendance-window-opened notifications failed — will retry next poll");
        continue;
      }
      await authDb
        .update(eventRooms)
        .set({ attendanceWindowOpenedNotifiedAt: new Date() })
        .where(and(eq(eventRooms.id, room.id), isNull(eventRooms.attendanceWindowOpenedNotifiedAt)));
    } catch (err) {
      logger.error({ err, roomId: room.id }, "Failed to send attendance-window-opened notifications");
    }
  }
};

export const runAttendanceWindowClosingNotifications = async (): Promise<void> => {
  const now = new Date();
  // Only rooms that have actually ended have a deterministic close time
  // (actualEnd + attendanceWindowAfter) — see the module doc comment above
  // selectRoomsDueForWindowClosingNotification.
  const dayMs = 24 * 60 * 60 * 1000;
  const candidates = await authDb
    .select()
    .from(eventRooms)
    .where(
      and(
        isNull(eventRooms.deletedAt),
        isNull(eventRooms.attendanceWindowClosingNotifiedAt),
        eq(eventRooms.status, "ended"),
        gte(eventRooms.actualEnd, new Date(now.getTime() - dayMs)),
        lte(eventRooms.actualEnd, new Date(now.getTime() + dayMs)),
      ),
    );

  const due = selectRoomsDueForWindowClosingNotification(candidates, now, ATTENDANCE_WINDOW_CLOSING_LOOKAHEAD_MIN);

  for (const room of due) {
    try {
      const { attempted, succeeded } = await notifyWindowClosing(room);
      if (attempted > 0 && succeeded === 0) {
        logger.error({ roomId: room.id, attempted }, "All attendance-window-closing notifications failed — will retry next poll");
        continue;
      }
      await authDb
        .update(eventRooms)
        .set({ attendanceWindowClosingNotifiedAt: new Date() })
        .where(and(eq(eventRooms.id, room.id), isNull(eventRooms.attendanceWindowClosingNotifiedAt)));
    } catch (err) {
      logger.error({ err, roomId: room.id }, "Failed to send attendance-window-closing notifications");
    }
  }
};

const pollWithLock = async (lockKey: string, run: () => Promise<void>): Promise<void> => {
  if (!redisClient.isOpen) {
    logger.warn({ event: "attendanceWindowNotifier.skipped", lockKey }, "Redis unavailable — skipping poll");
    return;
  }

  const acquired = await redisClient.set(lockKey, "1", { NX: true, EX: ATTENDANCE_WINDOW_NOTIFIER_LOCK_TTL_SEC });
  if (!acquired) return; // another instance is already running this poll

  try {
    await run();
  } catch (err) {
    logger.error({ err, lockKey }, "attendanceWindowNotifier poll failed");
  } finally {
    await redisClient.del(lockKey).catch(() => {});
  }
};

export const pollAttendanceWindowNotifications = async (): Promise<void> => {
  // Two independent locks so a slow window-open pass never blocks the
  // time-sensitive closing-soon pass (or vice versa).
  await Promise.all([
    pollWithLock(OPEN_LOCK_KEY, runAttendanceWindowOpenedNotifications),
    pollWithLock(CLOSING_LOCK_KEY, runAttendanceWindowClosingNotifications),
  ]);
};

export const startAttendanceWindowNotifierJob = (): void => {
  pollAttendanceWindowNotifications();
  setInterval(pollAttendanceWindowNotifications, ATTENDANCE_WINDOW_NOTIFIER_POLL_MS);
};
