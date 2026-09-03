import { and, eq, isNull } from "drizzle-orm";
import {
  ChannelRouter,
  NotificationPreferencesSchema,
  type NotificationEvent,
  type NotificationPreferences,
  type OrgBroadcastInput,
  type OrgBroadcastResult,
} from "@application/shared";
import { db } from "../db";
import { organizations, users } from "../db/schema";
import { notificationService } from "./notification.service";
import { sendToUser as sendPush } from "./push.service";
import { dispatchEmail } from "./email-delivery.service";
import { ApiError } from "../utils/errors";
import { env } from "../config/env";
import { logger } from "../utils/logger";

/**
 * ORG_BROADCAST — an admin-composed message to every member of their own
 * organisation, across all three channels.
 *
 * Priority is the whole point of this event kind. `urgent` makes
 * isCriticalNotificationEvent return true in @application/shared, which makes
 * ChannelRouter skip mute filtering entirely — so an urgent broadcast reaches
 * a member who has muted email or push, and a `normal` one does not. This is
 * the first caller of that rule; nothing had ever constructed an
 * ORG_BROADCAST event before.
 *
 * Runs inside the request's own tenant context (called from the admin
 * controller), like event-lifecycle-notification.service.ts and unlike the
 * SQS worker — so no runInBackgroundTenantContext wrapper. If this ever moves
 * onto a queue it will need one, or every RLS-scoped write below will be
 * denied with no tenant set.
 */

/**
 * Every active, non-soft-deleted member of one organisation — the `orgWide`
 * counterpart to resolveRoomStaffRecipients' room scope, and deliberately the
 * same shape of query. If a second org-scoped dispatcher ever appears, move
 * this and resolveRoomStaffRecipients into one shared recipients module
 * rather than growing a third copy.
 */
export const resolveOrgRecipients = async (organizationId: string) =>
  db
    .select()
    .from(users)
    .where(
      and(
        eq(users.organizationId, organizationId),
        isNull(users.deletedAt),
        eq(users.isActive, true),
      ),
    );

export const sendOrgBroadcast = async (
  organizationId: string,
  sentByUserId: string,
  input: OrgBroadcastInput,
): Promise<OrgBroadcastResult> => {
  const [organization] = await db
    .select({ id: organizations.id, name: organizations.name })
    .from(organizations)
    .where(eq(organizations.id, organizationId))
    .limit(1);

  if (!organization) throw ApiError.notFound("Organization not found");

  const recipients = await resolveOrgRecipients(organizationId);

  const event: NotificationEvent = {
    type: "ORG_BROADCAST",
    scope: { kind: "orgWide", organizationId },
    payload: {
      organizationId,
      title: input.title,
      body: input.body,
      priority: input.priority,
    },
  };

  const result: OrgBroadcastResult = {
    recipients: recipients.length,
    inApp: 0,
    webPush: 0,
    email: 0,
    failed: 0,
  };

  await Promise.all(
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
            organizationId,
            type: "ORG_BROADCAST",
            title: input.title,
            message: input.body,
            metadata: event.payload,
          });
          result.inApp += 1;
        }

        if (channels.includes("web_push")) {
          // "high" urgency tells the push service and the receiving OS to wake
          // the device rather than batch for power saving — the same treatment
          // an attendance deadline gets. A normal broadcast can wait.
          await sendPush(
            recipient.id,
            { title: input.title, body: input.body, url: `${env.APP_URL}/dashboard` },
            input.priority === "urgent" ? { urgency: "high" } : undefined,
          );
          result.webPush += 1;
        }

        if (channels.includes("email") && recipient.email) {
          await dispatchEmail({
            userId: recipient.id,
            recipientEmail: recipient.email,
            type: "org-broadcast",
            payload: {
              title: input.title,
              body: input.body,
              orgName: organization.name,
              priority: input.priority,
            },
          });
          result.email += 1;
        }
      } catch (err) {
        // One bad recipient row must not abort the broadcast for everyone
        // else — same isolation the room-scoped dispatchers use.
        result.failed += 1;
        logger.error(
          { err, organizationId, userId: recipient.id, priority: input.priority },
          "Failed to deliver ORG_BROADCAST to recipient",
        );
      }
    }),
  );

  logger.info(
    { organizationId, sentByUserId, priority: input.priority, ...result, event: "notification.org_broadcast_sent" },
    "Org broadcast dispatched",
  );

  return result;
};
