import { and, eq, isNull } from "drizzle-orm";
import { db } from "../db";
import { runInBackgroundTenantContext } from "../db/backgroundTenantContext";
import { eventRooms, users } from "../db/schema";
import { redisClient } from "../config/redis";
import { notificationService } from "./notification.service";
import { resolveRoomStaffRecipients } from "./room-recipients.service";
import { debounceByKey } from "../utils/debounce";
import { logger } from "../utils/logger";
import { ACTIVE_ROOM_TTL_SEC, USER_LEFT_EVENT_DEBOUNCE_MS } from "../config/constants";

export type UserLeftReason = "left" | "logged_out";

const REASON_LABEL: Record<UserLeftReason, string> = {
  left: "left",
  logged_out: "logged out of",
};

const activeRoomKey = (userId: string) => `active-room:${userId}`;

export interface ActiveRoom {
  roomId: string;
  organizationId: string;
}

/**
 * Remembers which room a user is currently in, so logout — which has no room
 * in its request at all (POST /auth/logout is not requireAuth'd and carries
 * only a refresh cookie) — can still say which event the user disappeared
 * from. Written when a live token is issued, the only server-side signal
 * that a user is entering a room.
 *
 * Redis-only and best-effort on purpose: the fact expires on its own, and
 * losing it costs one presence alert, not any durable record. Every Redis
 * touch in this codebase is `isOpen`-guarded; this is no different.
 */
export const rememberActiveRoom = async (userId: string, active: ActiveRoom): Promise<void> => {
  if (!redisClient.isOpen) return;
  try {
    await redisClient.setEx(activeRoomKey(userId), ACTIVE_ROOM_TTL_SEC, JSON.stringify(active));
  } catch (err) {
    logger.warn({ err, userId }, "Failed to record active room for user");
  }
};

export const forgetActiveRoom = async (userId: string): Promise<void> => {
  if (!redisClient.isOpen) return;
  try {
    await redisClient.del(activeRoomKey(userId));
  } catch (err) {
    logger.warn({ err, userId }, "Failed to clear active room for user");
  }
};

export const readActiveRoom = async (userId: string): Promise<ActiveRoom | null> => {
  if (!redisClient.isOpen) return null;
  try {
    const raw = await redisClient.get(activeRoomKey(userId));
    if (!raw) return null;
    const parsed = JSON.parse(raw) as ActiveRoom;
    if (!parsed?.roomId || !parsed?.organizationId) return null;
    return parsed;
  } catch (err) {
    logger.warn({ err, userId }, "Failed to read active room for user");
    return null;
  }
};

/**
 * In-app only, by construction: this file calls notificationService.create-
 * Notification and nothing else. That method inserts the row, publishes it
 * on the recipient's pub/sub channel for SSE, and records an `in_app`
 * delivery. Push and email live in separate services which are deliberately
 * not imported here — USER_LEFT_EVENT is a live-presence signal, not a
 * durable notification worth waking someone's phone for.
 *
 * Recipients come from room-recipients.service.ts: the room's creator plus
 * non-revoked event_admin_assignments. There is no room-attendee table, so
 * this is staff, not every attendee. The leaver is filtered out — otherwise
 * an admin leaving their own room would be told that they left it.
 */
export const fanOutUserLeftEvent = async (
  roomId: string,
  organizationId: string,
  userId: string,
  reason: UserLeftReason,
): Promise<void> => {
  // Runs off a debounce timer, after the request that scheduled it has
  // finished and released its tenant-pinned connection — so every RLS-scoped
  // query below needs a fresh tenant context of its own. See
  // db/backgroundTenantContext.ts.
  await runInBackgroundTenantContext(organizationId, "", async () => {
    const [room] = await db
      .select({ id: eventRooms.id, title: eventRooms.title, createdBy: eventRooms.createdBy })
      .from(eventRooms)
      .where(and(eq(eventRooms.id, roomId), isNull(eventRooms.deletedAt)))
      .limit(1);

    if (!room) {
      logger.warn({ roomId }, "USER_LEFT_EVENT: room not found — skipping notification fan-out");
      return;
    }

    const [leaver] = await db
      .select({ id: users.id, fullName: users.fullName })
      .from(users)
      .where(eq(users.id, userId))
      .limit(1);

    const leaverName = leaver?.fullName ?? "A participant";
    const recipients = (await resolveRoomStaffRecipients(roomId, room.createdBy)).filter(
      (u) => u.id !== userId,
    );

    await Promise.all(
      recipients.map((u) =>
        notificationService
          .createNotification({
            userId: u.id,
            organizationId,
            type: "USER_LEFT_EVENT",
            title: room.title,
            message: `${leaverName} ${REASON_LABEL[reason]} "${room.title}"`,
            metadata: { roomId, userId, reason },
          })
          .catch((err) => {
            logger.error({ err, roomId, userId: u.id, reason }, "Failed to notify recipient that a user left");
          }),
      ),
    );
  });
};

/**
 * Debounced per (room, user) — not per room. Keying on the room alone would
 * make two different people leaving inside the same window collapse into a
 * single alert, silently dropping the second. Per-user keying also handles
 * churn the way the spec asks: a rapid leave/rejoin, or a disconnect
 * immediately followed by a logout, coalesces into exactly one alert.
 *
 * Fire-and-forget: callers (the leave endpoint, logout) must not block on
 * notification fan-out.
 */
export const notifyUserLeftEvent = (
  roomId: string,
  organizationId: string,
  userId: string,
  reason: UserLeftReason,
): void => {
  debounceByKey(
    `user-left:${roomId}:${userId}`,
    () => fanOutUserLeftEvent(roomId, organizationId, userId, reason),
    USER_LEFT_EVENT_DEBOUNCE_MS,
  );
};
