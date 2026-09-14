import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { randomUUID } from "crypto";
import type { PoolClient } from "pg";
import { pool } from "../db";
import { claimPdfJob } from "../queues/worker";

/**
 * The PDF job claim against a real Postgres: a worker that dies mid-render
 * must not leave its job `processing` forever, and two workers redelivered the
 * same abandoned job must not both claim it. The conditional UPDATE is what
 * guarantees the second; a mock cannot.
 *
 * Skips without a reachable migrated database locally; CI always has one.
 */
const ORG_ID = randomUUID();
const USER_ID = randomUUID();
const ROOM_ID = randomUUID();

let available = false;
let skipReason = "";

const job = (jobId: string) => ({ jobId, roomId: ROOM_ID, orgId: ORG_ID, userId: USER_ID });

const row = async (jobId: string) =>
  (await pool.query<{ status: string; attempts: number }>("SELECT status, attempts FROM pdf_jobs WHERE job_id = $1", [jobId]))
    .rows[0];

const backdate = (jobId: string, minutes: number) =>
  pool.query(`UPDATE pdf_jobs SET updated_at = now() - ($2 || ' minutes')::interval WHERE job_id = $1`, [jobId, minutes]);

beforeAll(async () => {
  let probe: PoolClient | undefined;
  try {
    probe = await pool.connect();
    await probe.query("SELECT 1 FROM pdf_jobs LIMIT 0");
    await probe.query(
      "INSERT INTO organizations (id, name, slug, is_active) VALUES ($1, 'Claim Org', $2, true)",
      [ORG_ID, `claim-${ORG_ID}`],
    );
    await probe.query(
      "INSERT INTO users (id, email, full_name, role, organization_id, is_active, password_hash) VALUES ($1, $2, 'Claim', 'admin', $3, true, 'x')",
      [USER_ID, `claim-${USER_ID}@test.local`, ORG_ID],
    );
    await probe.query(
      `INSERT INTO event_rooms (id, organization_id, created_by, title, status, scheduled_start, scheduled_end, share_token)
       VALUES ($1, $2, $3, 'Claim room', 'scheduled', now(), now() + interval '1 hour', $4)`,
      [ROOM_ID, ORG_ID, USER_ID, ROOM_ID.replace(/-/g, "")],
    );
    available = true;
  } catch (err) {
    skipReason = (err as { code?: string; message?: string }).code ?? String((err as Error).message);
    if (process.env.CI) throw err;
  } finally {
    probe?.release();
  }
});

afterAll(async () => {
  if (available) {
    await pool.query("DELETE FROM notifications WHERE user_id = $1", [USER_ID]);
    await pool.query("DELETE FROM pdf_jobs WHERE org_id = $1", [ORG_ID]);
    await pool.query("DELETE FROM event_rooms WHERE id = $1", [ROOM_ID]);
    await pool.query("DELETE FROM users WHERE id = $1", [USER_ID]);
    await pool.query("DELETE FROM organizations WHERE id = $1", [ORG_ID]);
  }
  await pool.end().catch(() => {});
});

describe("claimPdfJob against Postgres", () => {
  it("claims a new job, defers a fresh duplicate, and reclaims it once abandoned", async (ctx) => {
    if (!available) ctx.skip(`no migrated database: ${skipReason}`);
    const id = `pdf_${randomUUID()}`;

    expect(await claimPdfJob(job(id))).toEqual({ action: "insert" });
    expect(await row(id)).toEqual({ status: "processing", attempts: 1 });

    expect(await claimPdfJob(job(id))).toEqual({ action: "defer" });

    await backdate(id, 10);
    expect(await claimPdfJob(job(id))).toEqual({ action: "retry", attempts: 2 });
    expect(await row(id)).toEqual({ status: "processing", attempts: 2 });
  });

  it("lets exactly one of two workers reclaim the same abandoned job", async (ctx) => {
    if (!available) ctx.skip(`no migrated database: ${skipReason}`);
    const id = `pdf_${randomUUID()}`;
    await claimPdfJob(job(id));
    await backdate(id, 10);

    const results = await Promise.all([claimPdfJob(job(id)), claimPdfJob(job(id))]);

    expect(results.map((r) => r.action).sort()).toEqual(["defer", "retry"]);
    expect(await row(id)).toEqual({ status: "processing", attempts: 2 });
  });

  it("fails an abandoned job with no attempts left and notifies the requester once", async (ctx) => {
    if (!available) ctx.skip(`no migrated database: ${skipReason}`);
    const id = `pdf_${randomUUID()}`;
    await claimPdfJob(job(id));
    await pool.query("UPDATE pdf_jobs SET attempts = 3 WHERE job_id = $1", [id]);
    await backdate(id, 10);

    expect(await claimPdfJob(job(id))).toEqual({ action: "abandon", attempts: 3 });
    expect(await row(id)).toEqual({ status: "failed", attempts: 3 });
    expect(await claimPdfJob(job(id))).toEqual({ action: "skip", reason: "max_attempts" });

    const { rows } = await pool.query(
      "SELECT count(*)::int AS n FROM notifications WHERE user_id = $1 AND type = 'report_failed' AND metadata->>'jobId' = $2",
      [USER_ID, id],
    );
    expect(rows[0].n).toBe(1);
  });

  it("skips a completed job", async (ctx) => {
    if (!available) ctx.skip(`no migrated database: ${skipReason}`);
    const id = `pdf_${randomUUID()}`;
    await claimPdfJob(job(id));
    await pool.query("UPDATE pdf_jobs SET status = 'completed' WHERE job_id = $1", [id]);

    expect(await claimPdfJob(job(id))).toEqual({ action: "skip", reason: "completed" });
  });
});
