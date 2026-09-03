import {
  ChannelRouter,
  NotificationPreferencesSchema,
  type NotificationEvent,
  type NotificationPreferences,
} from "@application/shared";
import { notificationService } from "./notification.service";
import { resolveRoomStaffRecipients } from "./room-recipients.service";
import { dispatchEmail } from "./email-delivery.service";
import { logger } from "../utils/logger";

/**
 * EVENT_CANCELLED_OR_EXPIRED — in-app plus email to everyone associated with
 * a room that will not happen, for one of two reasons:
 *
 *   "cancelled" — an organiser set status to "cancelled" (room-crud.controller)
 *   "expired"   — the scheduled window passed and it never started
 *                 (jobs/eventExpiryNotifier.ts)
 *
 * isCriticalNotificationEvent returns true for this event kind, so
 * ChannelRouter skips mute filtering: a member who muted email still gets one.
 * That is the point of the event — "the thing you were going to attend is not
 * happening" is not a preference.
 *
 * Callers must supply their own tenant context: the cancel path runs inside
 * the request's, the expiry poll opens one per room with
 * runInBackgroundTenantContext. This service opens none of its own.
 */

export type CancellationReasonKind = "cancelled" | "expired";

export interface CancelledRoom {
  id: string;
  title: string;
  organizationId: string;
  createdBy: string;
  scheduledStart: Date;
  cancellationReason?: string | null;
}

const formatWhen = (date: Date): string =>
  date.toLocaleString("en-GB", {
    dateStyle: "full",
    timeStyle: "short",
    timeZone: "UTC",
  }) + " UTC";

export const notifyEventCancelledOrExpired = async (
  room: CancelledRoom,
  reason: CancellationReasonKind,
): Promise<{ attempted: number; succeeded: number }> => {
  const recipients = await resolveRoomStaffRecipients(room.id, room.createdBy);

  const event: NotificationEvent = {
    type: "EVENT_CANCELLED_OR_EXPIRED",
    scope: { kind: "eventMembers", roomId: room.id },
    payload: { roomId: room.id, reason },
  };

  const when = formatWhen(room.scheduledStart);
  const message =
    reason === "cancelled"
      ? `"${room.title}" on ${when} has been cancelled.`
      : `"${room.title}" was scheduled for ${when} and did not take place.`;

  const outcomes = await Promise.all(
    recipients.map(async (recipient) => {
      try {
        const parsed = NotificationPreferencesSchema.safeParse(recipient.preferences ?? {});
        const preferences: NotificationPreferences = parsed.success
          ? parsed.data
          : NotificationPreferencesSchema.parse({});
        const channels = ChannelRouter(event, preferences);

        if (channels.includes("in_app")) {
          await notificationService.createNotification({
            userId: recipient.id,
            organizationId: room.organizationId,
            type: "EVENT_CANCELLED_OR_EXPIRED",
            title: room.title,
            message,
            metadata: event.payload,
          });
        }

        if (channels.includes("email") && recipient.email) {
          await dispatchEmail({
            userId: recipient.id,
            recipientEmail: recipient.email,
            type: "event-cancelled",
            payload: {
              roomTitle: room.title,
              reason,
              scheduledStart: when,
              cancellationReason: room.cancellationReason ?? null,
            },
          });
        }

        return true;
      } catch (err) {
        logger.error(
          { err, roomId: room.id, userId: recipient.id, reason },
          "Failed to notify recipient of EVENT_CANCELLED_OR_EXPIRED",
        );
        return false;
      }
    }),
  );

  return { attempted: recipients.length, succeeded: outcomes.filter(Boolean).length };
};
