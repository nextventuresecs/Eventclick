import { and, eq, inArray, isNull } from "drizzle-orm";
import { db } from "../db";
import { eventRooms, eventAdminAssignments, users } from "../db/schema";
import { notificationService } from "./notification.service";
import { debounceByKey } from "../utils/debounce";
import { logger } from "../utils/logger";
import { EVENT_STREAM_STATE_DEBOUNCE_MS } from "../config/constants";

export type EventStreamState = "live" | "recording_started" | "recording_paused" | "ended";

const STATE_LABEL: Record<EventStreamState, string> = {
  live: "is now live",
  recording_started: "recording started",
  recording_paused: "recording paused",
  ended: "has ended",
};

/**
 * Recipients mirror jobs/eventStartNotifier.ts's notifyRoomRecipients: the
 * room's creator plus non-revoked event_admin_assignments. There is no
 * general room-attendee table today, so "eventMembers" for this event kind
 * resolves to assigned staff, not every attendee.
 */
export const fanOutEventStreamStateChanged = async (
  roomId: string,
  organizationId: string,
  state: EventStreamState,
): Promise<void> => {
  const [room] = await db
    .select({ id: eventRooms.id, title: eventRooms.title, createdBy: eventRooms.createdBy })
    .from(eventRooms)
    .where(and(eq(eventRooms.id, roomId), isNull(eventRooms.deletedAt)))
    .limit(1);

  if (!room) {
    logger.warn({ roomId }, "EVENT_STREAM_STATE_CHANGED: room not found — skipping notification fan-out");
    return;
  }

  const assignments = await db
    .select({ userId: eventAdminAssignments.userId })
    .from(eventAdminAssignments)
    .where(and(eq(eventAdminAssignments.roomId, roomId), isNull(eventAdminAssignments.revokedAt)));

  const recipientIds = [...new Set([room.createdBy, ...assignments.map((a) => a.userId)])];

  const recipients = await db
    .select({ id: users.id })
    .from(users)
    .where(and(inArray(users.id, recipientIds), isNull(users.deletedAt), eq(users.isActive, true)));

  await Promise.all(
    recipients.map((u) =>
      notificationService
        .createNotification({
          userId: u.id,
          organizationId,
          type: "EVENT_STREAM_STATE_CHANGED",
          title: room.title,
          message: `"${room.title}" ${STATE_LABEL[state]}`,
          metadata: { roomId, state },
        })
        .catch((err) => {
          logger.error({ err, roomId, userId: u.id, state }, "Failed to notify recipient of stream state change");
        }),
    ),
  );
};

/**
 * Debounced per-room: rapid start/pause/resume toggles on the same room
 * within EVENT_STREAM_STATE_DEBOUNCE_MS collapse into a single notification
 * carrying only the latest state, instead of one per toggle. Fire-and-forget
 * by design — callers (room-live/room-recording controllers) shouldn't block
 * their HTTP response on notification fan-out.
 */
export const notifyEventStreamStateChanged = (roomId: string, organizationId: string, state: EventStreamState): void => {
  debounceByKey(
    `event-stream-state:${roomId}`,
    () => fanOutEventStreamStateChanged(roomId, organizationId, state),
    EVENT_STREAM_STATE_DEBOUNCE_MS,
  );
};
