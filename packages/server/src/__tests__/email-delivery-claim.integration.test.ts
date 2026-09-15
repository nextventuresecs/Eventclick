import { describe, it, expect, vi, beforeAll, afterAll, beforeEach } from "vitest";
import { randomUUID } from "crypto";
import { authPool } from "../db";

/**
 * The email send claim against a real Postgres. The status stays PENDING while
 * a send is in flight, so an SQS redelivery or the outbox sweeper arriving
 * mid-send used to claim the same row and send the email twice. The lease in
 * the claim's WHERE clause is what stops that, and only a real database
 * evaluates it (including the re-check a blocked concurrent UPDATE does).
 *
 * Skips without a reachable migrated database locally; CI always has one.
 */
const mockSend = vi.fn();
vi.mock("../services/email.service", () => ({
  sendVerificationEmail: (...args: unknown[]) => mockSend(...args),
}));

import { attemptEmailDelivery } from "../services/email-delivery.service";

const USER_ID = randomUUID();
let available = false;
let skipReason = "";

const insertDelivery = async () =>
  (
    await authPool.query<{ id: string }>(
      `INSERT INTO email_deliveries (user_id, recipient_email, email_type, payload)
       VALUES ($1, 'claim@test.local', 'verification', '{"token":"t"}') RETURNING id`,
      [USER_ID],
    )
  ).rows[0]!.id;

const rowOf = async (id: string) =>
  (
    await authPool.query<{ status: string; attempts: number; leased: boolean }>(
      "SELECT status, attempts, claimed_until > now() AS leased FROM email_deliveries WHERE id = $1",
      [id],
    )
  ).rows[0];

/** A send that stays in flight until release() is called. */
const holdSend = () => {
  let release!: (err?: Error) => void;
  const started = new Promise<void>((onStart) => {
    mockSend.mockImplementationOnce(
      () =>
        new Promise<void>((resolve, reject) => {
          release = (err) => (err ? reject(err) : resolve());
          onStart();
        }),
    );
  });
  return { started, release: (err?: Error) => release(err) };
};

beforeAll(async () => {
  try {
    await authPool.query("SELECT claimed_until FROM email_deliveries LIMIT 0");
    await authPool.query(
      "INSERT INTO users (id, email, full_name, role, is_active, password_hash) VALUES ($1, $2, 'Claim', 'volunteer', true, 'x')",
      [USER_ID, `email-claim-${USER_ID}@test.local`],
    );
    available = true;
  } catch (err) {
    skipReason = (err as { code?: string; message?: string }).code ?? String((err as Error).message);
    if (process.env.CI) throw err;
  }
});

afterAll(async () => {
  if (available) await authPool.query("DELETE FROM users WHERE id = $1", [USER_ID]);
  await authPool.end().catch(() => {});
});

beforeEach(() => {
  mockSend.mockReset();
  mockSend.mockResolvedValue(undefined);
});

describe("attemptEmailDelivery claim against Postgres", () => {
  it("defers a second consumer that arrives while the first is still sending", async (ctx) => {
    if (!available) ctx.skip(`no migrated database: ${skipReason}`);
    const id = await insertDelivery();
    const first = holdSend();

    const firstAttempt = attemptEmailDelivery(id);
    await first.started;

    expect(await rowOf(id)).toEqual({ status: "PENDING", attempts: 1, leased: true });
    expect(await attemptEmailDelivery(id)).toBe("deferred");

    first.release();
    expect(await firstAttempt).toBe("sent");
    expect(await attemptEmailDelivery(id)).toBe("skipped");

    expect(mockSend).toHaveBeenCalledTimes(1);
    expect(await rowOf(id)).toEqual({ status: "SENT", attempts: 1, leased: null });
  });

  it("sends exactly once when many consumers claim the same row at the same moment", async (ctx) => {
    if (!available) ctx.skip(`no migrated database: ${skipReason}`);
    const id = await insertDelivery();

    const outcomes = await Promise.all(Array.from({ length: 8 }, () => attemptEmailDelivery(id)));

    expect(mockSend).toHaveBeenCalledTimes(1);
    expect(outcomes.filter((o) => o === "sent")).toHaveLength(1);
    expect(outcomes.every((o) => o === "sent" || o === "deferred" || o === "skipped")).toBe(true);
    expect((await rowOf(id))!.status).toBe("SENT");
  });

  it("lets a consumer reclaim a row whose lease expired (worker died mid-send)", async (ctx) => {
    if (!available) ctx.skip(`no migrated database: ${skipReason}`);
    const id = await insertDelivery();
    await authPool.query(
      "UPDATE email_deliveries SET attempts = 1, claimed_until = now() - interval '1 second' WHERE id = $1",
      [id],
    );

    expect(await attemptEmailDelivery(id)).toBe("sent");
    expect(await rowOf(id)).toEqual({ status: "SENT", attempts: 2, leased: null });
  });

  it("releases the lease when the send fails, so the retry is not deferred", async (ctx) => {
    if (!available) ctx.skip(`no migrated database: ${skipReason}`);
    const id = await insertDelivery();
    mockSend.mockRejectedValueOnce(new Error("Resend is down"));

    await expect(attemptEmailDelivery(id)).rejects.toThrow("Resend is down");
    expect(await rowOf(id)).toEqual({ status: "PENDING", attempts: 1, leased: null });

    expect(await attemptEmailDelivery(id)).toBe("sent");
    expect(mockSend).toHaveBeenCalledTimes(2);
  });

  it("fails a permanent provider rejection at once, and a redelivery does not send again", async (ctx) => {
    if (!available) ctx.skip(`no migrated database: ${skipReason}`);
    const id = await insertDelivery();
    mockSend.mockRejectedValueOnce({ name: "validation_error", statusCode: 422, message: "Invalid `to` field." });

    expect(await attemptEmailDelivery(id)).toBe("failed");
    const { rows } = await authPool.query<{ status: string; failure_reason: string; recent: boolean; leased: boolean | null }>(
      `SELECT status, failure_reason, failed_at > now() - interval '1 minute' AS recent, claimed_until > now() AS leased
       FROM email_deliveries WHERE id = $1`,
      [id],
    );
    expect(rows[0]).toEqual({
      status: "FAILED",
      failure_reason: "validation_error 422: Invalid `to` field.",
      recent: true,
      leased: null,
    });

    expect(await attemptEmailDelivery(id)).toBe("skipped");
    expect(mockSend).toHaveBeenCalledTimes(1);
  });
});
