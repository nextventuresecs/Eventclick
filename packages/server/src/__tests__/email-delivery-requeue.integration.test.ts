import { describe, it, expect, vi, beforeAll, afterAll, beforeEach } from "vitest";
import { randomUUID } from "crypto";
import { authPool } from "../db";

/**
 * Recovery after a mass failure: a bad deploy makes the provider reject every
 * email of one type, each row goes FAILED at once, and after the fix those
 * rows are re-sent with requeueFailedEmailDeliveries. Tested against Postgres
 * because the selection (status, type, window, link lifetime, lease) is SQL.
 *
 * Re-sent rows go out inline, as they do in production today: the file clears
 * SQS_QUEUE_URL, which CI sets for the whole job. Only the enqueue test sets it.
 *
 * Skips without a reachable migrated database locally; CI always has one.
 */
const mockSend = vi.fn();
vi.mock("../services/email.service", () => ({
  sendVerificationEmail: (...args: unknown[]) => mockSend("verification", ...args),
  sendPasswordResetEmail: (...args: unknown[]) => mockSend("reset-password", ...args),
  sendOrgBroadcastEmail: (...args: unknown[]) => mockSend("org-broadcast", ...args),
  sendInviteEmail: (...args: unknown[]) => mockSend("invite", ...args),
}));

const mockSqsSend = vi.fn();
vi.mock("../queues/sqs.client", () => ({ sqsClient: { send: (...args: unknown[]) => mockSqsSend(...args) } }));

import { env } from "../config/env";
import { requeueFailedEmailDeliveries } from "../services/email-delivery.service";

const USER_ID = randomUUID();
const QUEUE_URL_FROM_ENV = env.SQS_QUEUE_URL;
let available = false;
let skipReason = "";

/** A FAILED row as a mass failure leaves it: failed at `failedAgo`, created at `createdAgo`. */
const failedDelivery = async (type: string, createdAgo: string, failedAgo = createdAgo) =>
  (
    await authPool.query<{ id: string }>(
      `INSERT INTO email_deliveries
         (user_id, recipient_email, email_type, payload, status, attempts, created_at, last_attempt_at, failed_at, failure_reason)
       VALUES ($1, 'requeue@test.local', $2, '{"token":"t","title":"T","body":"B","orgName":"O","priority":"normal","s3Url":"s","roomLabel":"r","roomTitle":"R","watchUrl":"w","scheduledStart":"s"}', 'FAILED', 1,
               now() - $3::interval, now() - $4::interval, now() - $4::interval, 'validation_error 422: bad template')
       RETURNING id`,
      [USER_ID, type, createdAgo, failedAgo],
    )
  ).rows[0]!.id;

const statusOf = async (id: string) =>
  (await authPool.query<{ status: string }>("SELECT status FROM email_deliveries WHERE id = $1", [id])).rows[0]!.status;

beforeAll(async () => {
  env.SQS_QUEUE_URL = undefined;
  try {
    await authPool.query("SELECT claimed_until FROM email_deliveries LIMIT 0");
    await authPool.query(
      "INSERT INTO users (id, email, full_name, role, is_active, password_hash) VALUES ($1, $2, 'Requeue', 'volunteer', true, 'x')",
      [USER_ID, `email-requeue-${USER_ID}@test.local`],
    );
    available = true;
  } catch (err) {
    skipReason = (err as { code?: string; message?: string }).code ?? String((err as Error).message);
    if (process.env.CI) throw err;
  }
});

afterAll(async () => {
  env.SQS_QUEUE_URL = QUEUE_URL_FROM_ENV;
  if (available) await authPool.query("DELETE FROM users WHERE id = $1", [USER_ID]);
  await authPool.end().catch(() => {});
});

beforeEach(async () => {
  mockSend.mockReset();
  mockSend.mockResolvedValue(undefined);
  mockSqsSend.mockReset();
  mockSqsSend.mockResolvedValue({ MessageId: "m-1" });
  // Each test owns the FAILED rows it counts.
  if (available) await authPool.query("DELETE FROM email_deliveries WHERE user_id = $1", [USER_ID]);
});

describe("requeueFailedEmailDeliveries against Postgres", () => {
  it("re-sends a recent FAILED verification email and leaves one whose link has expired", async (ctx) => {
    if (!available) ctx.skip(`no migrated database: ${skipReason}`);
    const recent = await failedDelivery("verification", "30 minutes");
    const expired = await failedDelivery("verification", "25 hours", "10 minutes");

    const result = await requeueFailedEmailDeliveries({ type: "verification", failedSince: new Date(Date.now() - 60 * 60_000) });

    expect(result).toEqual({ requeued: 1 });
    expect(await statusOf(recent)).toBe("SENT");
    expect(await statusOf(expired)).toBe("FAILED");
    expect(mockSend).toHaveBeenCalledTimes(1);
  });

  it.for([
    ["reset-password", "50 minutes", "70 minutes"],
    ["invite", "23 hours", "25 hours"],
  ] as const)("re-sends a %s email only while its link is still valid", async ([type, validAge, expiredAge], ctx) => {
    if (!available) ctx.skip(`no migrated database: ${skipReason}`);
    const valid = await failedDelivery(type, validAge, "5 minutes");
    const expired = await failedDelivery(type, expiredAge, "5 minutes");

    expect(await requeueFailedEmailDeliveries({ type, failedSince: new Date(Date.now() - 60 * 60_000) })).toEqual({ requeued: 1 });

    expect(await statusOf(valid)).toBe("SENT");
    expect(await statusOf(expired)).toBe("FAILED");
  });

  it("touches only FAILED rows of the requested type that failed inside the window", async (ctx) => {
    if (!available) ctx.skip(`no migrated database: ${skipReason}`);
    const target = await failedDelivery("org-broadcast", "2 hours", "20 minutes");
    const otherType = await failedDelivery("reset-password", "10 minutes");
    const failedBefore = await failedDelivery("org-broadcast", "3 hours", "2 hours");
    const sent = await failedDelivery("org-broadcast", "20 minutes");
    await authPool.query("UPDATE email_deliveries SET status = 'SENT', failed_at = NULL WHERE id = $1", [sent]);

    expect(await requeueFailedEmailDeliveries({ type: "org-broadcast", failedSince: new Date(Date.now() - 60 * 60_000) })).toEqual({
      requeued: 1,
    });

    expect([await statusOf(target), await statusOf(otherType), await statusOf(failedBefore), await statusOf(sent)]).toEqual([
      "SENT",
      "FAILED",
      "FAILED",
      "SENT",
    ]);
    expect(mockSend).toHaveBeenCalledTimes(1);
  });

  // The DLQ drain can mark a row FAILED while a send is still in flight (it
  // clears the lease). Re-sending that row under a new key could deliver twice,
  // so a row attempted within the claim lease is left for a later requeue.
  it("leaves a FAILED row whose last attempt may still be in flight", async (ctx) => {
    if (!available) ctx.skip(`no migrated database: ${skipReason}`);
    const inFlight = await failedDelivery("org-broadcast", "10 minutes", "10 minutes");
    await authPool.query("UPDATE email_deliveries SET last_attempt_at = now() - interval '30 seconds' WHERE id = $1", [inFlight]);

    expect(await requeueFailedEmailDeliveries({ type: "org-broadcast", failedSince: new Date(Date.now() - 60 * 60_000) })).toEqual({
      requeued: 0,
    });
    expect(await statusOf(inFlight)).toBe("FAILED");
    expect(mockSend).not.toHaveBeenCalled();
  });

  it("re-sends at most `limit` rows per call, oldest failure first", async (ctx) => {
    if (!available) ctx.skip(`no migrated database: ${skipReason}`);
    const oldest = await failedDelivery("org-broadcast", "1 hour", "40 minutes");
    const middle = await failedDelivery("org-broadcast", "1 hour", "30 minutes");
    const newest = await failedDelivery("org-broadcast", "1 hour", "20 minutes");
    const since = new Date(Date.now() - 60 * 60_000);

    expect(await requeueFailedEmailDeliveries({ type: "org-broadcast", failedSince: since, limit: 2 })).toEqual({ requeued: 2 });
    expect([await statusOf(oldest), await statusOf(middle), await statusOf(newest)]).toEqual(["SENT", "SENT", "FAILED"]);

    expect(await requeueFailedEmailDeliveries({ type: "org-broadcast", failedSince: since, limit: 2 })).toEqual({ requeued: 1 });
    expect(await statusOf(newest)).toBe("SENT");
  });

  it("enqueues re-sent rows for the email worker when the queue is configured, instead of sending inline", async (ctx) => {
    if (!available) ctx.skip(`no migrated database: ${skipReason}`);
    const id = await failedDelivery("org-broadcast", "1 hour", "20 minutes");
    const original = env.SQS_QUEUE_URL;
    env.SQS_QUEUE_URL = "https://sqs.test/eventclick-email-queue";
    try {
      expect(await requeueFailedEmailDeliveries({ type: "org-broadcast", failedSince: new Date(Date.now() - 60 * 60_000) })).toEqual({
        requeued: 1,
      });
    } finally {
      env.SQS_QUEUE_URL = original;
    }

    expect(mockSend).not.toHaveBeenCalled();
    expect(mockSqsSend).toHaveBeenCalledTimes(1);
    expect(mockSqsSend.mock.calls[0]![0].input).toEqual({
      QueueUrl: "https://sqs.test/eventclick-email-queue",
      MessageBody: JSON.stringify({ deliveryId: id }),
    });
    expect(await statusOf(id)).toBe("PENDING");
  });

  // Resend does not document whether it caches a rejected request against its
  // idempotency key. If it does, re-sending under the original key would return
  // the cached rejection and deliver nothing, so each recovery needs a new key.
  it("re-sends under a new idempotency key each time the row is requeued", async (ctx) => {
    if (!available) ctx.skip(`no migrated database: ${skipReason}`);
    const id = await failedDelivery("verification", "30 minutes");
    const since = new Date(Date.now() - 60 * 60_000);
    const keyOfCall = (n: number) => (mockSend.mock.calls[n]!.at(-1) as { idempotencyKey: string }).idempotencyKey;

    mockSend.mockRejectedValueOnce({ name: "validation_error", statusCode: 422, message: "still broken" });
    await requeueFailedEmailDeliveries({ type: "verification", failedSince: since });
    expect(await statusOf(id)).toBe("FAILED");
    // The second recovery comes after another fix is deployed, not seconds later.
    await authPool.query("UPDATE email_deliveries SET last_attempt_at = now() - interval '10 minutes' WHERE id = $1", [id]);
    await requeueFailedEmailDeliveries({ type: "verification", failedSince: since });
    expect(await statusOf(id)).toBe("SENT");

    const keys = [keyOfCall(0), keyOfCall(1)];
    expect(new Set([`email-delivery/${id}`, ...keys]).size).toBe(3);
  });
});
