import { eq, and, or, isNull, lt, notInArray, sql } from "drizzle-orm";
import { SendMessageCommand } from "@aws-sdk/client-sqs";
import { authDb } from "../db";
import { emailDeliveries, type EmailDelivery } from "../db/schema/emailDeliveries";
import { sqsClient } from "../queues/sqs.client";
import { env } from "../config/env";
import { logger } from "../utils/logger";
import { TOKEN_EXPIRY_1H_MS, TOKEN_EXPIRY_24H_MS } from "../config/constants";
import { describeEmailError, isPermanentEmailError } from "./email-error";
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

/**
 * One idempotency key per delivery row and send epoch, so every retry of the
 * same delivery is the same request to Resend, and a requeued delivery is a new
 * one. See SendEmailOptions in email.service.ts.
 */
export const emailIdempotencyKey = (deliveryId: string, sendEpoch = 0) =>
  sendEpoch > 0 ? `email-delivery/${deliveryId}/${sendEpoch}` : `email-delivery/${deliveryId}`;

const sendEmailByType = (
  idempotencyKey: string,
  type: string,
  email: string,
  payload: Record<string, unknown>,
): Promise<void> => {
  const options = { idempotencyKey };
  switch (type) {
    case "verification":
      return sendVerificationEmail(email, payload.token as string, options);
    case "reset-password":
      return sendPasswordResetEmail(email, payload.token as string, options);
    case "report-ready":
      return sendReportReadyEmail(email, payload.s3Url as string, payload.roomLabel as string, options);
    case "invite":
      return sendInviteEmail(email, payload.token as string, payload.orgName as string, options);
    case "event-started":
      return sendEventStartedEmail(email, payload.roomTitle as string, payload.watchUrl as string, options);
    case "event-ended":
      return sendEventEndedEmail(
        email,
        payload.roomTitle as string,
        payload.recordingUrl as string | undefined,
        payload.summaryUrl as string | undefined,
        options,
      );
    case "org-broadcast":
      return sendOrgBroadcastEmail(
        email,
        payload.title as string,
        payload.body as string,
        payload.orgName as string,
        payload.priority as "normal" | "urgent",
        options,
      );
    case "event-cancelled":
      return sendEventCancelledEmail(
        email,
        payload.roomTitle as string,
        payload.reason as "cancelled" | "expired",
        payload.scheduledStart as string,
        payload.cancellationReason as string | null | undefined,
        options,
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

  await deliverOrEnqueue(row.id, params.type);
}

/**
 * Sends a PENDING delivery on its way: enqueued for the email worker when SQS
 * is configured, otherwise sent inline. Throws only when enqueueing fails.
 */
async function deliverOrEnqueue(deliveryId: string, type: string): Promise<void> {
  const queueUrl = env.SQS_QUEUE_URL;
  if (!queueUrl) {
    logger.info(
      { deliveryId, type, event: "email.inline_fallback" },
      "SQS_QUEUE_URL not configured — sending email inline",
    );
    // A freshly dispatched or requeued row holds no lease, so the attempt
    // never defers. A permanent rejection is marked FAILED inside; a retryable
    // one throws, and with no queue message nothing retries it: the row stays
    // PENDING until the outbox sweeper (#162) re-enqueues it.
    await attemptEmailDelivery(deliveryId).catch((err) => {
      logger.error(
        { err, deliveryId, type, event: "email.inline_failed_not_retried" },
        "Inline email delivery failed — no queue, so it is not retried",
      );
    });
    return;
  }

  try {
    const command = new SendMessageCommand({
      QueueUrl: queueUrl,
      MessageBody: JSON.stringify({ deliveryId }),
    });
    const response = await sqsClient.send(command);
    logger.info(
      { messageId: response.MessageId, deliveryId, type, event: "sqs.enqueue_success" },
      "Enqueued email delivery",
    );
  } catch (error) {
    logger.error({ error, deliveryId, event: "sqs.enqueue_failed" }, "Failed to enqueue email delivery");
    throw error;
  }
}

/**
 * How long a claim holds a delivery. A send is one provider call that takes
 * seconds; the lease only has to outlast that. If the worker dies mid-send the
 * row becomes claimable again once the lease runs out.
 */
export const EMAIL_CLAIM_LEASE_SECONDS = 120;

/**
 * - `sent`: this call sent the email.
 * - `skipped`: nothing to do, ever (already SENT/DELIVERED/FAILED, or no row).
 * - `failed`: the provider rejected this email in a way a retry cannot fix
 *   (see isPermanentEmailError); the row is now FAILED.
 * - `deferred`: another consumer holds the claim right now. The caller must
 *   keep its queue message so the delivery is tried again if that consumer
 *   dies without finishing.
 */
export type EmailDeliveryOutcome = "sent" | "skipped" | "deferred" | "failed";

/**
 * The single send path — called by the SQS consumer loop (worker.ts) and,
 * for local dev without SQS, directly by dispatchEmail above. Idempotent:
 * a delivery already SENT/DELIVERED is skipped without calling the provider
 * again. Throws on a retryable failure so the caller's retry mechanism (SQS
 * redelivery with backoff, then the redrive policy) can engage — retry
 * authority lives in SQS, not in the `attempts` column, which is observational
 * only. A permanent failure is marked FAILED here and returns `failed`.
 */
export async function attemptEmailDelivery(deliveryId: string): Promise<EmailDeliveryOutcome> {
  // Exclusive claim. The status stays PENDING during the send, so matching on
  // status alone let a second consumer claim the row while the first was still
  // sending. The lease closes that window: the UPDATE matches only when no
  // unexpired claim exists, and a concurrent UPDATE re-checks the lease after
  // the winner commits. Both sides use the database clock.
  const claimed = await authDb
    .update(emailDeliveries)
    .set({
      attempts: sql`${emailDeliveries.attempts} + 1`,
      lastAttemptAt: new Date(),
      claimedUntil: sql`now() + make_interval(secs => ${EMAIL_CLAIM_LEASE_SECONDS})`,
    })
    .where(
      and(
        eq(emailDeliveries.id, deliveryId),
        eq(emailDeliveries.status, "PENDING"),
        or(isNull(emailDeliveries.claimedUntil), lt(emailDeliveries.claimedUntil, sql`now()`)),
      ),
    )
    .returning();

  const row = claimed[0];

  if (!row) {
    const [existing] = await authDb.select().from(emailDeliveries).where(eq(emailDeliveries.id, deliveryId)).limit(1);
    if (!existing) {
      logger.error({ deliveryId }, "Email delivery row not found — dropping message");
      return "skipped";
    }
    if (existing.status === "PENDING") {
      logger.info(
        { deliveryId, claimedUntil: existing.claimedUntil, event: "email.delivery_deferred" },
        "Email delivery is claimed by another consumer — deferring",
      );
      return "deferred";
    }
    logger.info({ deliveryId, status: existing.status }, "Email delivery already terminal — skipping (idempotent)");
    return "skipped";
  }

  try {
    await sendEmailByType(emailIdempotencyKey(deliveryId, row.sendEpoch), row.emailType, row.recipientEmail, row.payload as Record<string, unknown>);
    // Unguarded on purpose: if the DLQ drain marked this row FAILED while the
    // send was in flight, the email still went out, and SENT is the truth.
    await authDb
      .update(emailDeliveries)
      .set({ status: "SENT", claimedUntil: null })
      .where(eq(emailDeliveries.id, deliveryId));
    return "sent";
  } catch (err) {
    const reason = describeEmailError(err);
    if (isPermanentEmailError(err)) {
      await markEmailDeliveryFailed(deliveryId, reason);
      logger.warn(
        { deliveryId, type: row.emailType, reason, event: "email.delivery_failed_permanently" },
        "Email provider rejected the delivery — marked FAILED without retrying",
      );
      return "failed";
    }
    // Release the claim so the redelivered message is not deferred until the
    // lease runs out.
    await authDb
      .update(emailDeliveries)
      .set({ failureReason: reason, claimedUntil: null })
      .where(eq(emailDeliveries.id, deliveryId));
    throw err;
  }
}

/**
 * Terminal failure — called by the DLQ consumer once a delivery has
 * exhausted SQS's redrive policy, and by attemptEmailDelivery for a permanent
 * provider error. Does not attempt to send.
 *
 * Never downgrades a delivery that went out: a message can reach the DLQ
 * after a successful send when its SQS delete failed, and that email must
 * stay SENT/DELIVERED. Returns whether the row was marked FAILED.
 */
export async function markEmailDeliveryFailed(deliveryId: string, reason: string): Promise<boolean> {
  const updated = await authDb
    .update(emailDeliveries)
    // failed_at keeps the first failure: a duplicate DLQ message must not
    // bring an old failure back into the Ops Console's recent window.
    .set({ status: "FAILED", failureReason: reason, failedAt: sql`coalesce(${emailDeliveries.failedAt}, now())`, claimedUntil: null })
    .where(and(eq(emailDeliveries.id, deliveryId), notInArray(emailDeliveries.status, ["SENT", "DELIVERED"])))
    .returning({ id: emailDeliveries.id });
  return updated.length > 0;
}

/**
 * How long an email's link stays usable, from when the delivery row (and its
 * token) was created. A FAILED row older than this is not re-sent: it would
 * deliver a dead link.
 */
const LINK_LIFETIME_SECONDS: Partial<Record<EmailType, number>> = {
  verification: TOKEN_EXPIRY_24H_MS / 1000,
  invite: TOKEN_EXPIRY_24H_MS / 1000, // admin.service.ts mints invite tokens for 24 hours
  "reset-password": TOKEN_EXPIRY_1H_MS / 1000,
};

export interface RequeueFailedEmailDeliveriesParams {
  type: EmailType;
  /** Only rows that failed at or after this moment. */
  failedSince: Date;
  /** Most rows re-sent by one call, oldest failure first. Call again for the rest. */
  limit?: number;
}

const DEFAULT_REQUEUE_LIMIT = 500;

/**
 * Recovery after a mass failure (a deploy that made the provider reject every
 * email of one type): puts matching FAILED rows back to PENDING and delivers
 * them again, the same way dispatchEmail does. Run it after the fix is
 * deployed; the runbook is docs/runbooks/email-mass-failure.md.
 *
 * Skipped: rows whose link has expired (LINK_LIFETIME_SECONDS), and rows
 * attempted within the claim lease. Each re-send increments send_epoch, so it
 * goes to the provider under a new idempotency key.
 */
export async function requeueFailedEmailDeliveries(
  params: RequeueFailedEmailDeliveriesParams,
): Promise<{ requeued: number }> {
  const lifetime = LINK_LIFETIME_SECONDS[params.type];
  const limit = params.limit ?? DEFAULT_REQUEUE_LIMIT;
  // A MATERIALIZED CTE, not UPDATE ... WHERE id IN (SELECT ... LIMIT ... FOR
  // UPDATE SKIP LOCKED): Postgres can rescan that subquery once per outer row,
  // and a rescan that re-checks a row this statement already set PENDING skips
  // it and takes the next one, so the LIMIT stops holding. The CTE runs once.
  // SKIP LOCKED lets two concurrent recoveries take disjoint rows.
  const reset = await authDb.execute<{ id: string }>(sql`
    WITH batch AS MATERIALIZED (
      SELECT id FROM email_deliveries
      WHERE status = 'FAILED'
        AND email_type = ${params.type}
        AND failed_at >= ${params.failedSince.toISOString()}::timestamptz
        -- The DLQ drain can mark a row FAILED mid-send; a row attempted within
        -- the claim lease may still go out, and a re-send under a new
        -- idempotency key would then deliver twice.
        AND (last_attempt_at IS NULL OR last_attempt_at < now() - make_interval(secs => ${EMAIL_CLAIM_LEASE_SECONDS}))
        ${lifetime === undefined ? sql`` : sql`AND created_at > now() - make_interval(secs => ${lifetime})`}
      ORDER BY failed_at ASC
      LIMIT ${limit}
      FOR UPDATE SKIP LOCKED
    )
    UPDATE email_deliveries d
    SET status = 'PENDING', failed_at = NULL, claimed_until = NULL, send_epoch = d.send_epoch + 1
    FROM batch
    WHERE d.id = batch.id
    RETURNING d.id`);

  for (const { id } of reset.rows) {
    // An enqueue failure is logged (sqs.enqueue_failed) and leaves the row
    // PENDING, for the outbox sweeper planned in #162 step 3.
    await deliverOrEnqueue(id, params.type).catch(() => {});
  }
  return { requeued: reset.rows.length };
}

export type { EmailDelivery };
