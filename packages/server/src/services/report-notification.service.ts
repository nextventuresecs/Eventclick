import { eq, isNull, and } from "drizzle-orm";
import {
  ChannelRouter,
  NotificationPreferencesSchema,
  type NotificationEvent,
  type NotificationPreferences,
} from "@application/shared";
import { db } from "../db";
import { eventRooms } from "../db/schema";
import { notificationService } from "./notification.service";
import { resolveRoomStaffRecipients } from "./room-recipients.service";
import { logger } from "../utils/logger";

/**
 * REPORT_GENERATED — in-app only (NOTIFICATION_EVENT_CHANNELS lists just
 * "in_app" for this event kind), fanned out to room staff (creator +
 * non-revoked event_admin_assignments) so anyone watching the room sees who
 * generated a report, not just the requester (who already gets the personal
 * "report_ready" notification with the download link — see queues/worker.ts).
 * Called from inside the worker's own runInBackgroundTenantContext wrapper.
 */
export const notifyReportGenerated = async (
  roomId: string,
  organizationId: string,
  reportId: string,
  generatedByUserId: string,
  generatedByName: string,
): Promise<void> => {
  const [room] = await db
    .select({ id: eventRooms.id, title: eventRooms.title, createdBy: eventRooms.createdBy })
    .from(eventRooms)
    .where(and(eq(eventRooms.id, roomId), isNull(eventRooms.deletedAt)))
    .limit(1);

  if (!room) {
    logger.warn({ roomId }, "REPORT_GENERATED: room not found — skipping notification fan-out");
    return;
  }

  const recipients = await resolveRoomStaffRecipients(roomId, room.createdBy);

  const event: NotificationEvent = {
    type: "REPORT_GENERATED",
    scope: { kind: "eventMembers", roomId },
    payload: { roomId, reportId, generatedBy: generatedByUserId },
  };

  await Promise.all(
    recipients.map(async (recipient) => {
      try {
        const parsed = NotificationPreferencesSchema.safeParse(recipient.preferences ?? {});
        const preferences: NotificationPreferences = parsed.success ? parsed.data : NotificationPreferencesSchema.parse({});
        const channels = ChannelRouter(event, preferences);
        if (!channels.includes("in_app")) return;

        await notificationService.createNotification({
          userId: recipient.id,
          organizationId,
          type: "REPORT_GENERATED",
          title: room.title,
          message: `${generatedByName} generated a report for "${room.title}".`,
          metadata: event.payload,
        });
      } catch (err) {
        logger.error({ err, roomId, userId: recipient.id }, "Failed to notify recipient of REPORT_GENERATED");
      }
    }),
  );
};
