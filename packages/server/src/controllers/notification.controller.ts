import { Request, Response } from "express";
import type { SavePushSubscriptionInput, RevokePushSubscriptionInput } from "@application/shared";
import { notificationService } from "../services/notification.service";
import { pubsub } from "../services/pubsub.service";
import * as pushService from "../services/push.service";
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

  req.setTimeout(0);

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

/**
 * Save (or update, if the endpoint already exists) a push subscription for
 * the current user.
 */
export const savePushSubscription = async (req: Request, res: Response) => {
  const userId = req.user!.id;
  const organizationId = req.user!.organizationId;
  if (!organizationId) throw ApiError.badRequest("Complete onboarding before enabling push notifications");
  const input = req.body as SavePushSubscriptionInput;

  const subscription = await pushService.saveSubscription(userId, organizationId, input);
  res.status(201).json({ id: subscription.id });
};

/**
 * Revoke a push subscription for the current user (e.g. user toggles push
 * notifications off in Settings).
 */
export const revokePushSubscription = async (req: Request, res: Response) => {
  const userId = req.user!.id;
  const { endpoint } = req.body as RevokePushSubscriptionInput;

  await pushService.revokeSubscription(userId, endpoint);
  res.status(204).end();
};

/**
 * Send a test push to every subscription the current user has registered.
 * Exists so the opt-in flow has something to verify against before any
 * notification event kind is actually wired to the push channel.
 */
export const sendTestPush = async (req: Request, res: Response) => {
  const userId = req.user!.id;

  if (!pushService.isPushConfigured()) {
    throw ApiError.badRequest("Push notifications are not configured on this server");
  }

  const result = await pushService.sendToUser(userId, {
    title: "Eventclick",
    body: "Push notifications are working.",
    url: "/dashboard",
  });

  if (result.attempted === 0) {
    throw ApiError.badRequest("No push subscription registered for this account");
  }

  res.json(result);
};
