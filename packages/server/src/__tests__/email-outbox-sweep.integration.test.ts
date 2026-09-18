import { describe, it, expect, vi, beforeAll, afterAll, beforeEach } from "vitest";
import { randomUUID } from "crypto";
import { authPool } from "../db";

/**
 * The outbox sweeper against a real Postgres. A delivery row can be left
 * PENDING with no queue message behind it: the enqueue failed after the row was
 * saved, an inline send failed with nothing to retry it, or its message
 * redrived to the DLQ and was never drained. sweepPendingEmailDeliveries finds
 * those rows and sends them on again, and closes the ones it is too late for.
 * Which rows qualify is SQL, so it is tested here.
 *
 * Swept rows go out inline, as they do in production today: the file clears
 * SQS_QUEUE_URL, which CI sets for the whole job. Only the enqueue test sets it.
 *
 * Skips without a reachable migrated database locally; CI always has one.
 */
const mockSend = vi.fn();
vi.mock("../services/email.service", () => ({
  sendVerificationEmail: (...args: unknown[]) => mockSend("verification", ...args),
  sendPasswordResetEmail: (...args: unknown[]) => mockSend("reset-password", ...args),
  sendEventStartedEmail: (...args: unknown[]) => mockSend("event-started", ...args),
}));

const mockSqsSend = vi.fn();
vi.mock("../queues/sqs.client", () => ({ sqsClient: { send: (...args: unknown[]) => mockSqsSend(...args) } }));

import { env } from "../config/env";
import { sweepPendingEmailDeliveries } from "../services/email-delivery.service";

const USER_ID = randomUUID();
const QUEUE_URL_FROM_ENV = env.SQS_QUEUE_URL;
let available = false;
let skipReason = "";

interface PendingRow {
  type?: string;
  createdAgo: string;
  attempts?: number;
  lastAttemptAgo?: string;
  leasedFor?: string;
}

/** A PENDING row created `createdAgo`, attempted `attempts` times, the last `lastAttemptAgo`. */
const pendingDelivery = async ({ type = "verification", createdAgo, attempts = 0, lastAttemptAgo, leasedFor }: PendingRow) =>
  (
    await authPool.query<{ id: string }>(
      `INSERT INTO email_deliveries
         (user_id, recipient_email, email_type, payload, status, attempts, created_at, last_attempt_at, claimed_until)
       VALUES ($1, 'sweep@test.local', $2, '{"token":"t","roomTitle":"R","watchUrl":"https://w"}', 'PENDING', $3,
               now() - $4::interval, now() - $5::interval, now() + $6::interval)
       RETURNING id`,
      [USER_ID, type, attempts, createdAgo, lastAttemptAgo ?? null, leasedFor ?? null],
    )
  ).rows[0]!.id;

const rowOf = async (id: string) =>
  (
    await authPool.query<{ status: string; failure_reason: string | null; failed: boolean; send_epoch: number }>(
      "SELECT status, failure_reason, failed_at IS NOT NULL AS failed, send_epoch FROM email_deliveries WHERE id = $1",
      [id],
    )
  ).rows[0]!;

const statusOf = async (id: string) => (await rowOf(id)).status;

/**
 * Sends to this file's recipient. The sweep reads the whole table, and files
 * run in parallel, so counts are taken over this file's rows only.
 */
const sendsHere = () => mockSend.mock.calls.filter((call) => call[1] === "sweep@test.local");

beforeAll(async () => {
  env.SQS_QUEUE_URL = undefined;
  try {
    await authPool.query("SELECT send_epoch FROM email_deliveries LIMIT 0");
    await authPool.query(
      "INSERT INTO users (id, email, full_name, role, is_active, password_hash) VALUES ($1, $2, 'Sweep', 'volunteer', true, 'x')",
      [USER_ID, `email-sweep-${USER_ID}@test.local`],
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
});

beforeEach(async (ctx) => {
  if (!available) ctx.skip(`no migrated database: ${skipReason}`);
  mockSend.mockReset();
  mockSend.mockResolvedValue(undefined);
  mockSqsSend.mockReset();
  mockSqsSend.mockResolvedValue({ MessageId: "m-1" });
  await authPool.query("DELETE FROM email_deliveries WHERE user_id = $1", [USER_ID]);
});

describe("sweepPendingEmailDeliveries against Postgres", () => {
  it("sends a row whose enqueue never happened, once it is past the grace period", async () => {
    const stranded = await pendingDelivery({ createdAgo: "11 minutes" });
    const fresh = await pendingDelivery({ createdAgo: "2 minutes" });

    await sweepPendingEmailDeliveries();

    expect(await statusOf(stranded)).toBe("SENT");
    expect(await statusOf(fresh)).toBe("PENDING");
    expect(sendsHere()).toHaveLength(1);
  });

  // An attempted row may still have a message in the SQS retry ladder (up to
  // about 100 minutes, then the DLQ drain). A second message would start its own
  // ladder, so the sweeper waits until no message can still be retrying the row.
  it("sends an attempted row only once no queue message can still be retrying it", async () => {
    const retrying = await pendingDelivery({ createdAgo: "40 minutes", attempts: 3, lastAttemptAgo: "30 minutes" });
    const abandoned = await pendingDelivery({ createdAgo: "3 hours", attempts: 3, lastAttemptAgo: "2 hours" });

    await sweepPendingEmailDeliveries();

    expect(await statusOf(retrying)).toBe("PENDING");
    expect(await statusOf(abandoned)).toBe("SENT");
    expect(sendsHere()).toHaveLength(1);
  });

  it("does not enqueue a row another consumer holds the claim on", async () => {
    const held = await pendingDelivery({ createdAgo: "3 hours", attempts: 1, lastAttemptAgo: "2 hours", leasedFor: "1 minute" });
    env.SQS_QUEUE_URL = "https://sqs.test/eventclick-email-queue";
    try {
      await sweepPendingEmailDeliveries();
    } finally {
      env.SQS_QUEUE_URL = undefined;
    }

    const enqueuedHere = mockSqsSend.mock.calls.filter((call) => call[0].input.MessageBody === JSON.stringify({ deliveryId: held }));
    expect(enqueuedHere).toHaveLength(0);
    expect(await statusOf(held)).toBe("PENDING");
  });

  // A late email can do harm: its link is dead, or the idempotency key that
  // stops a duplicate (24 hours at Resend) has lapsed. The row is closed FAILED
  // so the Ops Console counts it, keeping the provider's last error.
  it.for([
    ["reset-password", "70 minutes", "its 1-hour link has expired"],
    ["verification", "25 hours", "its 24-hour link has expired"],
    ["event-started", "25 hours", "it is past the 24-hour idempotency window"],
  ] as const)("closes a %s row created %s ago as FAILED instead of sending it: %s", async ([type, createdAgo]) => {
    const late = await pendingDelivery({ type, createdAgo, attempts: 1, lastAttemptAgo: "3 hours" });
    await authPool.query("UPDATE email_deliveries SET failure_reason = 'rate_limit_exceeded 429: slow down' WHERE id = $1", [late]);

    await sweepPendingEmailDeliveries();

    const row = await rowOf(late);
    expect(row).toMatchObject({ status: "FAILED", failed: true });
    expect(row.failure_reason).toMatch(/^rate_limit_exceeded 429: slow down; .*expired/i);
    expect(sendsHere()).toHaveLength(0);
  });

  it("sends a stranded row of a type with no link, which only the 24-hour limit applies to", async () => {
    const started = await pendingDelivery({ type: "event-started", createdAgo: "2 hours" });

    await sweepPendingEmailDeliveries();

    expect(await statusOf(started)).toBe("SENT");
  });

  it("closes a row that has used up its attempts instead of starting it again", async () => {
    const exhausted = await pendingDelivery({ createdAgo: "4 hours", attempts: 24, lastAttemptAgo: "2 hours" });

    await sweepPendingEmailDeliveries();

    const row = await rowOf(exhausted);
    expect(row.status).toBe("FAILED");
    expect(row.failure_reason).toMatch(/24 attempts/);
    expect(sendsHere()).toHaveLength(0);
  });

  it("does not send an expired row the close-out had no room for in this run", async () => {
    await pendingDelivery({ type: "reset-password", createdAgo: "3 hours" });
    await pendingDelivery({ type: "reset-password", createdAgo: "2 hours" });

    await sweepPendingEmailDeliveries(1);

    expect(sendsHere()).toHaveLength(0);
  });

  // A stranded row may already have gone out (its SENT write failed). Only the
  // same idempotency key lets Resend drop the repeat, so unlike a requeue of a
  // FAILED row, the sweep does not start a new send epoch.
  it("sends a row again under the idempotency key it already had", async () => {
    const id = await pendingDelivery({ createdAgo: "3 hours", attempts: 2, lastAttemptAgo: "2 hours" });
    await authPool.query("UPDATE email_deliveries SET send_epoch = 2 WHERE id = $1", [id]);

    await sweepPendingEmailDeliveries();

    expect(sendsHere()).toHaveLength(1);
    expect(sendsHere()[0]!.at(-1)).toEqual({ idempotencyKey: `email-delivery/${id}/2` });
    expect((await rowOf(id)).send_epoch).toBe(2);
  });

  it("enqueues a stranded row for the email worker when the queue is configured", async () => {
    const id = await pendingDelivery({ createdAgo: "15 minutes" });
    env.SQS_QUEUE_URL = "https://sqs.test/eventclick-email-queue";
    try {
      await sweepPendingEmailDeliveries();
    } finally {
      env.SQS_QUEUE_URL = undefined;
    }

    const enqueuedHere = mockSqsSend.mock.calls.filter((call) => call[0].input.MessageBody === JSON.stringify({ deliveryId: id }));
    expect(enqueuedHere).toHaveLength(1);
    expect(enqueuedHere[0]![0].input.QueueUrl).toBe("https://sqs.test/eventclick-email-queue");
    expect(sendsHere()).toHaveLength(0);
    expect(await statusOf(id)).toBe("PENDING");
  });
});
