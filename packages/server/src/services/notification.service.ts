import { eq, and, desc } from "drizzle-orm";
import type { WritableNotificationType } from "@application/shared";
import { db } from "../db";
import { notifications } from "../db/schema/notifications";
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

    // Broadcast the new notification immediately via Redis Pub/Sub
    // Channel is user-specific: `notifications:{userId}`
    const channel = `notifications:${params.userId}`;
    await pubsub.publish(channel, notification);

    logger.debug({ notificationId: notification.id, userId: params.userId }, "Notification created and broadcasted");

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
