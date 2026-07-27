import { Request, Response } from "express";
import { notificationService } from "../services/notification.service";
import { pubsub } from "../services/pubsub.service";
import { logger } from "../utils/logger";
import { ApiError } from "../utils/errors";

/**
 * Get all notifications for the current user
 */
export const getNotifications = async (req: Request, res: Response) => {
  const userId = req.user!.id;
  const organizationId = req.user!.organizationId!;

  const notifications = await notificationService.getUserNotifications(userId, organizationId);
  res.json(notifications);
};

/**
 * Mark a single notification as read
 */
export const markNotificationRead = async (req: Request, res: Response) => {
  const userId = req.user!.id;
  const organizationId = req.user!.organizationId!;
  const id = req.params.id as string;

  const notification = await notificationService.markAsRead(id, userId, organizationId);
  res.json(notification);
};

/**
 * Mark all notifications as read
 */
export const markAllNotificationsRead = async (req: Request, res: Response) => {
  const userId = req.user!.id;
  const organizationId = req.user!.organizationId!;

  await notificationService.markAllAsRead(userId, organizationId);
  res.json({ success: true });
};

/**
 * Server-Sent Events (SSE) endpoint for real-time notifications
 */
export const streamNotifications = async (req: Request, res: Response) => {
  const userId = req.user!.id;

  // Set SSE headers
  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache");
  res.setHeader("Connection", "keep-alive");
  // Flush headers immediately
  res.flushHeaders();

  // Send initial ping to establish connection
  res.write(`data: ${JSON.stringify({ type: "ping" })}\n\n`);

  const channel = `notifications:${userId}`;
  logger.debug({ userId, channel }, "Client connected to SSE notification stream");

  // Keep-alive interval (every 30 seconds) to prevent load balancers/Nginx from closing connection
  const keepAlive = setInterval(() => {
    res.write(`data: ${JSON.stringify({ type: "ping" })}\n\n`);
  }, 30000);

  // Subscribe to Redis Pub/Sub for this user's channel
  const unsubscribe = pubsub.subscribe(channel, (message) => {
    // Forward the published message to the SSE client
    res.write(`data: ${message}\n\n`);
  });

  // Handle client disconnect
  req.on("close", () => {
    logger.debug({ userId, channel }, "Client disconnected from SSE stream");
    clearInterval(keepAlive);
    unsubscribe();
  });
};
