import webpush from "web-push";
import { eq, and } from "drizzle-orm";
import { env } from "../config/env";
import { db } from "../db";
import { pushSubscriptions, type PushSubscriptionRow } from "../db/schema/pushSubscriptions";
import { logger } from "../utils/logger";
import type { SavePushSubscriptionInput } from "@application/shared";

const vapidConfigured = Boolean(env.VAPID_PUBLIC_KEY && env.VAPID_PRIVATE_KEY);

if (vapidConfigured) {
  webpush.setVapidDetails(env.VAPID_SUBJECT, env.VAPID_PUBLIC_KEY!, env.VAPID_PRIVATE_KEY!);
} else {
  logger.warn(
    { event: "push.vapid_not_configured" },
    "VAPID_PUBLIC_KEY/VAPID_PRIVATE_KEY not set — web push is disabled",
  );
}

export const isPushConfigured = (): boolean => vapidConfigured;

export interface PushPayload {
  title: string;
  body: string;
  url?: string;
}

export const saveSubscription = async (
  userId: string,
  organizationId: string,
  input: SavePushSubscriptionInput,
): Promise<PushSubscriptionRow> => {
  const [row] = await db
    .insert(pushSubscriptions)
    .values({
      userId,
      organizationId,
      endpoint: input.endpoint,
      p256dh: input.keys.p256dh,
      auth: input.keys.auth,
    })
    .onConflictDoUpdate({
      target: pushSubscriptions.endpoint,
      set: { userId, organizationId, p256dh: input.keys.p256dh, auth: input.keys.auth },
    })
    .returning();

  if (!row) throw new Error("Failed to persist push subscription");
  return row;
};

export const revokeSubscription = async (userId: string, endpoint: string): Promise<void> => {
  await db
    .delete(pushSubscriptions)
    .where(and(eq(pushSubscriptions.userId, userId), eq(pushSubscriptions.endpoint, endpoint)));
};

const revokeByEndpoint = async (endpoint: string): Promise<void> => {
  await db.delete(pushSubscriptions).where(eq(pushSubscriptions.endpoint, endpoint));
};

/**
 * Send one push message to one subscription. On a 404/410 from the push
 * service (endpoint gone — user uninstalled, cleared site data, etc.) the
 * subscription is deleted rather than retried, since it will never succeed
 * again. Any other failure is logged and left alone for the next send.
 */
export const sendToSubscription = async (
  subscription: PushSubscriptionRow,
  payload: PushPayload,
): Promise<{ ok: true } | { ok: false; revoked: boolean }> => {
  if (!vapidConfigured) return { ok: false, revoked: false };

  try {
    await webpush.sendNotification(
      {
        endpoint: subscription.endpoint,
        keys: { p256dh: subscription.p256dh, auth: subscription.auth },
      },
      JSON.stringify(payload),
    );
    return { ok: true };
  } catch (err: any) {
    const statusCode = err?.statusCode;
    if (statusCode === 404 || statusCode === 410) {
      await revokeByEndpoint(subscription.endpoint);
      logger.info(
        { event: "push.subscription_revoked", subscriptionId: subscription.id, statusCode },
        "Push subscription gone — revoked",
      );
      return { ok: false, revoked: true };
    }
    logger.error({ err, subscriptionId: subscription.id, statusCode }, "Push send failed");
    return { ok: false, revoked: false };
  }
};

export const sendToUser = async (
  userId: string,
  payload: PushPayload,
): Promise<{ attempted: number; sent: number }> => {
  const subscriptions = await db
    .select()
    .from(pushSubscriptions)
    .where(eq(pushSubscriptions.userId, userId));

  const results = await Promise.all(
    subscriptions.map((subscription) => sendToSubscription(subscription, payload)),
  );

  return {
    attempted: subscriptions.length,
    sent: results.filter((r) => r.ok).length,
  };
};
