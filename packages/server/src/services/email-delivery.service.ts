import { eq, and, notInArray, sql } from "drizzle-orm";
import { SendMessageCommand } from "@aws-sdk/client-sqs";
import { authDb } from "../db";
import { emailDeliveries, type EmailDelivery } from "../db/schema/emailDeliveries";
import { sqsClient } from "../queues/sqs.client";
import { env } from "../config/env";
import { logger } from "../utils/logger";
import {
  sendVerificationEmail,
  sendPasswordResetEmail,
  sendReportReadyEmail,
  sendInviteEmail,
  sendEventStartedEmail,
  sendEventEndedEmail,
  sendOrgBroadcastEmail,
  sendEventCancelledEmail,
} from "./email.service";

export type EmailType =
  | "verification"
  | "reset-password"
  | "report-ready"
  | "invite"
  | "event-started"
  | "event-ended"
  | "org-broadcast"
  | "event-cancelled";

export interface DispatchEmailParams {
  userId: string;
  recipientEmail: string;
  type: EmailType;
  /**
   * { token } for verification/reset-password, { s3Url, roomLabel } for
   * report-ready, { token, orgName } for invite, { roomTitle, watchUrl } for
   * event-started, { roomTitle, recordingUrl?, summaryUrl? } for event-ended.
   */
  payload: Record<string, unknown>;
}

const sendEmailByType = (type: string, email: string, payload: Record<string, unknown>): Promise<void> => {
  switch (type) {
    case "verification":
      return sendVerificationEmail(email, payload.token as string);
    case "reset-password":
      return sendPasswordResetEmail(email, payload.token as string);
    case "report-ready":
      return sendReportReadyEmail(email, payload.s3Url as string, payload.roomLabel as string);
    case "invite":
      return sendInviteEmail(email, payload.token as string, payload.orgName as string);
    case "event-started":
      return sendEventStartedEmail(email, payload.roomTitle as string, payload.watchUrl as string);
    case "event-ended":
      return sendEventEndedEmail(
        email,
        payload.roomTitle as string,
        payload.recordingUrl as string | undefined,
        payload.summaryUrl as string | undefined,
      );
    case "org-broadcast":
      return sendOrgBroadcastEmail(
        email,
        payload.title as string,
        payload.body as string,
        payload.orgName as string,
        payload.priority as "normal" | "urgent",
      );
    case "event-cancelled":
      return sendEventCancelledEmail(
        email,
        payload.roomTitle as string,
        payload.reason as "cancelled" | "expired",
        payload.scheduledStart as string,
        payload.cancellationReason as string | null | undefined,
      );
    default:
      throw new Error(`Unknown email type: ${type}`);
  }
};

/**
 * Creates the delivery-tracking row and enqueues (or, with no SQS configured,
 * sends inline) — the row's id is the idempotency key a retried worker
 * checks before ever calling the email provider again.
 *
 * Never throws to the caller when SQS is unconfigured: registerUser,
 * forgotPassword, etc. should not 500 because Resend hiccuped. When SQS is
 * configured, an enqueue failure *does* throw — the caller decides whether
 * that's fatal to the triggering request.
 */
export async function dispatchEmail(params: DispatchEmailParams): Promise<void> {
  const [row] = await authDb
    .insert(emailDeliveries)
    .values({
      userId: params.userId,
      recipientEmail: params.recipientEmail,
      emailType: params.type,
      payload: params.payload,
    })
    .returning();

  if (!row) throw new Error("Failed to create email delivery record");

  const queueUrl = env.SQS_QUEUE_URL;
  if (!queueUrl) {
    logger.info(
      { deliveryId: row.id, type: params.type, event: "email.inline_fallback" },
      "SQS_QUEUE_URL not configured — sending email inline",
    );
    await attemptEmailDelivery(row.id).catch((err) => {
      logger.error({ err, deliveryId: row.id }, "Inline email delivery failed");
    });
    return;
  }

  try {
    const command = new SendMessageCommand({
      QueueUrl: queueUrl,
      MessageBody: JSON.stringify({ deliveryId: row.id }),
    });
    const response = await sqsClient.send(command);
    logger.info(
      { messageId: response.MessageId, deliveryId: row.id, type: params.type, event: "sqs.enqueue_success" },
      "Enqueued email delivery",
    );
  } catch (error) {
    logger.error({ error, deliveryId: row.id, event: "sqs.enqueue_failed" }, "Failed to enqueue email delivery");
    throw error;
  }
}

/**
 * The single send path — called by the SQS consumer loop (worker.ts) and,
 * for local dev without SQS, directly by dispatchEmail above. Idempotent:
 * a delivery already SENT/DELIVERED is skipped without calling the provider
 * again. Throws on failure so the caller's retry mechanism (SQS's native
 * redelivery + redrive policy) can engage — retry/backoff authority lives
 * entirely in SQS, not in the `attempts` column, which is observational only.
 */
export async function attemptEmailDelivery(deliveryId: string): Promise<void> {
  // Atomic claim: read-then-write would let two concurrent consumers (e.g. a
  // second SQS poller, or the deprecated email.lambda.ts still wired to the
  // same queue) both observe PENDING and both send. The UPDATE...WHERE
  // status='PENDING' collapses check-and-claim into one statement — only the
  // worker whose UPDATE actually matched a row proceeds to send.
  const claimed = await authDb
    .update(emailDeliveries)
    .set({ attempts: sql`${emailDeliveries.attempts} + 1`, lastAttemptAt: new Date() })
    .where(and(eq(emailDeliveries.id, deliveryId), eq(emailDeliveries.status, "PENDING")))
    .returning();

  const row = claimed[0];

  if (!row) {
    const [existing] = await authDb.select().from(emailDeliveries).where(eq(emailDeliveries.id, deliveryId)).limit(1);
    if (!existing) {
      logger.error({ deliveryId }, "Email delivery row not found — dropping message");
      return;
    }
    logger.info(
      { deliveryId, status: existing.status },
      "Email delivery already claimed or terminal — skipping (idempotent)",
    );
    return;
  }

  try {
    await sendEmailByType(row.emailType, row.recipientEmail, row.payload as Record<string, unknown>);
    await authDb.update(emailDeliveries).set({ status: "SENT" }).where(eq(emailDeliveries.id, deliveryId));
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    await authDb.update(emailDeliveries).set({ failureReason: message }).where(eq(emailDeliveries.id, deliveryId));
    throw err;
  }
}

/**
 * Terminal failure — called by the DLQ consumer once a delivery has
 * exhausted SQS's redrive policy. Does not attempt to send.
 *
 * Never downgrades a delivery that went out: a message can reach the DLQ
 * after a successful send when its SQS delete failed, and that email must
 * stay SENT/DELIVERED. Returns whether the row was marked FAILED.
 */
export async function markEmailDeliveryFailed(deliveryId: string, reason: string): Promise<boolean> {
  const updated = await authDb
    .update(emailDeliveries)
    .set({ status: "FAILED", failureReason: reason })
    .where(and(eq(emailDeliveries.id, deliveryId), notInArray(emailDeliveries.status, ["SENT", "DELIVERED"])))
    .returning({ id: emailDeliveries.id });
  return updated.length > 0;
}

export type { EmailDelivery };
