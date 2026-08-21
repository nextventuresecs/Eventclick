import { desc, eq } from "drizzle-orm";
import {
  ChannelRouter,
  NotificationPreferencesSchema,
  type NotificationEvent,
  type NotificationPreferences,
} from "@application/shared";
import { db } from "../db";
import { roomRecordings } from "../db/schema";
import { notificationService } from "./notification.service";
import { resolveRoomStaffRecipients } from "./room-recipients.service";
import { sendToUser as sendPush } from "./push.service";
import { dispatchEmail } from "./email-delivery.service";
import { buildPublicUrl } from "./storage.service";
import { env } from "../config/env";
import { logger } from "../utils/logger";

/**
 * EVENT_STARTED / EVENT_ENDED — the typed replacement for the retired
 * "room_starting_soon" poll job (#72). Both fire synchronously from
 * room-live.controller.ts's startLive/stopLive, inside the request's own
 * tenant context — unlike the debounced EVENT_STREAM_STATE_CHANGED fan-out
 * (event-stream-notification.service.ts), there's no background poll loop
 * here, so runInBackgroundTenantContext is not needed.
 */

interface StartedRoom {
  id: string;
  title: string;
  organizationId: string;
  createdBy: string;
  shareToken: string;
  notifyEmailOnStart: boolean;
}

/**
 * EVENT_STARTED: in-app + web push always; email only when the room opted
 * in via notifyEmailOnStart (NOTIFICATION_EVENT_CHANNELS lists "email" for
 * this event kind unconditionally — the flag gate happens here, at the call
 * site, per the comment on that entry in @application/shared).
 */
export const notifyEventStarted = async (room: StartedRoom): Promise<void> => {
  const recipients = await resolveRoomStaffRecipients(room.id, room.createdBy);
  const watchUrl = `${env.APP_URL}/watch/${room.shareToken}`;

  const event: NotificationEvent = {
    type: "EVENT_STARTED",
    scope: { kind: "eventMembers", roomId: room.id },
    payload: { roomId: room.id, startedAt: new Date().toISOString() },
  };

  await Promise.all(
    recipients.map(async (recipient) => {
      try {
        const parsed = NotificationPreferencesSchema.safeParse(recipient.preferences ?? {});
        const preferences: NotificationPreferences = parsed.success ? parsed.data : NotificationPreferencesSchema.parse({});
        const channels = ChannelRouter(event, preferences).filter(
          (channel) => channel !== "email" || room.notifyEmailOnStart,
        );

        if (channels.includes("in_app")) {
          await notificationService.createNotification({
            userId: recipient.id,
            organizationId: room.organizationId,
            type: "EVENT_STARTED",
            title: room.title,
            message: `"${room.title}" is now live.`,
            metadata: event.payload,
          });
        }

        if (channels.includes("web_push")) {
          await sendPush(recipient.id, { title: room.title, body: `"${room.title}" is now live.`, url: watchUrl });
        }

        if (channels.includes("email")) {
          await dispatchEmail({
            userId: recipient.id,
            recipientEmail: recipient.email,
            type: "event-started",
            payload: { roomTitle: room.title, watchUrl },
          });
        }
      } catch (err) {
        logger.error({ err, roomId: room.id, userId: recipient.id }, "Failed to notify recipient of EVENT_STARTED");
      }
    }),
  );
};

interface EndedRoom {
  id: string;
  title: string;
  organizationId: string;
  createdBy: string;
}

/**
 * EVENT_ENDED: in-app + email, with a recording link when one is already
 * available. At stopLive time the recording (if any) is very often still
 * uploading via async egress — recordingUrl is omitted, not stubbed, when
 * no "completed" room_recordings row exists yet. There is no "summary" page
 * in this codebase today, so summaryUrl is never populated.
 */
export const notifyEventEnded = async (room: EndedRoom): Promise<void> => {
  const recipients = await resolveRoomStaffRecipients(room.id, room.createdBy);

  const [recording] = await db
    .select()
    .from(roomRecordings)
    .where(eq(roomRecordings.roomId, room.id))
    .orderBy(desc(roomRecordings.startedAt))
    .limit(1);
  const recordingUrl =
    recording && recording.status === "completed" && recording.s3Key ? buildPublicUrl(recording.s3Key) : undefined;

  const event: NotificationEvent = {
    type: "EVENT_ENDED",
    scope: { kind: "eventMembers", roomId: room.id },
    payload: { roomId: room.id, recordingUrl },
  };

  await Promise.all(
    recipients.map(async (recipient) => {
      try {
        const parsed = NotificationPreferencesSchema.safeParse(recipient.preferences ?? {});
        const preferences: NotificationPreferences = parsed.success ? parsed.data : NotificationPreferencesSchema.parse({});
        const channels = ChannelRouter(event, preferences);

        if (channels.includes("in_app")) {
          await notificationService.createNotification({
            userId: recipient.id,
            organizationId: room.organizationId,
            type: "EVENT_ENDED",
            title: room.title,
            message: `"${room.title}" has ended.`,
            metadata: event.payload,
          });
        }

        if (channels.includes("email")) {
          await dispatchEmail({
            userId: recipient.id,
            recipientEmail: recipient.email,
            type: "event-ended",
            payload: { roomTitle: room.title, recordingUrl },
          });
        }
      } catch (err) {
        logger.error({ err, roomId: room.id, userId: recipient.id }, "Failed to notify recipient of EVENT_ENDED");
      }
    }),
  );
};
