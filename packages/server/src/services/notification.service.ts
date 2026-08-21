import { eq, and, desc } from "drizzle-orm";
import type { WritableNotificationType } from "@application/shared";
import { db } from "../db";
import { notifications, notificationDeliveries } from "../db/schema/notifications";
import { pubsub } from "./pubsub.service";
import { ApiError } from "../utils/errors";
import { logger } from "../utils/logger";

export interface CreateNotificationParams {
  userId: string;
  organizationId: string;
  type: WritableNotificationType;
  title: string;
  message: string;
  metadata?: Record<string, any>;
}

export class NotificationService {
  /**
   * Create a new notification in the database and broadcast it via Pub/Sub
   */
  public async createNotification(params: CreateNotificationParams) {
    const [notification] = await db
      .insert(notifications)
      .values({
        userId: params.userId,
        organizationId: params.organizationId,
        type: params.type,
        title: params.title,
        message: params.message,
        metadata: params.metadata ?? null,
      })
      .returning();

    if (!notification) {
      throw ApiError.internal("Failed to create notification");
    }

    // Broadcast the new notification immediately via Redis Pub/Sub, and
    // record the outcome as a notification_deliveries row for the in_app
    // channel — the delivery row is the source of truth for "did the SSE
    // send actually happen", independent of whether the notification itself
    // was created. A publish failure (Redis blip) does NOT fail the whole
    // call: the notification row is already durable and visible via the
    // REST history endpoint on next fetch, so only the live-push side of it
    // is degraded. Re-throwing here would make poll-loop callers (see
    // jobs/attendanceWindowNotifier.ts) retry the whole notification next
    // poll, creating a duplicate row for a recipient whose only problem was
    // a momentarily-unavailable pub/sub channel.
    const channel = `notifications:${params.userId}`;
    try {
      await pubsub.publish(channel, notification);
      await db.insert(notificationDeliveries).values({
        notificationId: notification.id,
        userId: params.userId,
        organizationId: params.organizationId,
        channel: "in_app",
        status: "SENT",
        attempts: 1,
        lastAttemptAt: new Date().toISOString(),
      });
      logger.debug({ notificationId: notification.id, userId: params.userId }, "Notification created and broadcasted");
    } catch (err) {
      logger.error(
        { err, notificationId: notification.id, userId: params.userId },
        "Failed to broadcast notification via SSE — notification row still created",
      );
      await db
        .insert(notificationDeliveries)
        .values({
          notificationId: notification.id,
          userId: params.userId,
          organizationId: params.organizationId,
          channel: "in_app",
          status: "FAILED",
          attempts: 1,
          lastAttemptAt: new Date().toISOString(),
          failureReason: err instanceof Error ? err.message : "Unknown error",
        })
        .catch((insertErr) => {
          logger.error({ insertErr, notificationId: notification.id }, "Failed to record failed in_app delivery row");
        });
    }

    return notification;
  }

  /**
   * Get all notifications for a user, scoped to their current organization
   */
  public async getUserNotifications(userId: string, organizationId: string, limit = 50) {
    return await db
      .select()
      .from(notifications)
      .where(
        and(
          eq(notifications.userId, userId),
          eq(notifications.organizationId, organizationId)
        )
      )
      .orderBy(desc(notifications.createdAt))
      .limit(limit);
  }

  /**
   * Mark a specific notification as read
   */
  public async markAsRead(notificationId: string, userId: string, organizationId: string) {
    const [updated] = await db
      .update(notifications)
      .set({ isRead: true })
      .where(
        and(
          eq(notifications.id, notificationId),
          eq(notifications.userId, userId),
          eq(notifications.organizationId, organizationId)
        )
      )
      .returning();

    if (!updated) {
      throw ApiError.notFound("Notification not found");
    }

    return updated;
  }

  /**
   * Mark all unread notifications as read for a user in an org
   */
  public async markAllAsRead(userId: string, organizationId: string) {
    await db
      .update(notifications)
      .set({ isRead: true })
      .where(
        and(
          eq(notifications.userId, userId),
          eq(notifications.organizationId, organizationId),
          eq(notifications.isRead, false)
        )
      );
  }
}

export const notificationService = new NotificationService();
