import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { randomUUID } from "crypto";
import { authPool } from "../db";
import { markEmailDeliveryFailed } from "../services/email-delivery.service";

/**
 * The DLQ drain marks deliveries FAILED. A message can reach the DLQ after
 * the email already went out (its SQS delete failed), so the update must never
 * downgrade SENT or DELIVERED. The guard is in the WHERE clause, which only a
 * real database can check.
 *
 * Skips without a reachable migrated database locally; CI always has one.
 */
const USER_ID = randomUUID();
let available = false;
let skipReason = "";

const insertDelivery = async (status: string) =>
  (
    await authPool.query<{ id: string }>(
      `INSERT INTO email_deliveries (user_id, recipient_email, email_type, payload, status)
       VALUES ($1, 'dlq-guard@test.local', 'verification', '{}', $2) RETURNING id`,
      [USER_ID, status],
    )
  ).rows[0]!.id;

const statusOf = async (id: string) =>
  (await authPool.query<{ status: string; failure_reason: string | null }>(
    "SELECT status, failure_reason FROM email_deliveries WHERE id = $1",
    [id],
  )).rows[0];

beforeAll(async () => {
  try {
    await authPool.query("SELECT 1 FROM email_deliveries LIMIT 0");
    await authPool.query(
      "INSERT INTO users (id, email, full_name, role, is_active, password_hash) VALUES ($1, $2, 'DLQ Guard', 'volunteer', true, 'x')",
      [USER_ID, `dlq-guard-${USER_ID}@test.local`],
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

describe("markEmailDeliveryFailed against Postgres", () => {
  it.for(["PENDING", "FAILED"])("marks a %s delivery FAILED", async (status, ctx) => {
    if (!available) ctx.skip(`no migrated database: ${skipReason}`);
    const id = await insertDelivery(status);

    expect(await markEmailDeliveryFailed(id, "moved to DLQ")).toBe(true);
    expect(await statusOf(id)).toEqual({ status: "FAILED", failure_reason: "moved to DLQ" });
  });

  it.for(["SENT", "DELIVERED"])("never downgrades a %s delivery", async (status, ctx) => {
    if (!available) ctx.skip(`no migrated database: ${skipReason}`);
    const id = await insertDelivery(status);

    expect(await markEmailDeliveryFailed(id, "moved to DLQ")).toBe(false);
    expect(await statusOf(id)).toEqual({ status, failure_reason: null });
  });
});
