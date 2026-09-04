import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { randomUUID } from "crypto";
import type { PoolClient } from "pg";
import { drizzle } from "drizzle-orm/node-postgres";
import { sql } from "drizzle-orm";
import { pool, db, withTransaction, tenantContextStorage } from "../db";
import * as schema from "../db/schema";

/**
 * The one test in this suite that talks to a real Postgres.
 *
 * Everything else mocks `drizzle-orm/node-postgres`, which is precisely why
 * EVENTCLICK-SERVER-9 survived a green suite: the bug lived in the interaction
 * between drizzle's driver and a real pg connection — `isPool` is false for a
 * bound PoolClient, so `transaction()` emitted raw `begin`/`commit` instead of
 * a savepoint, Postgres downgraded the nested `begin` to a warning, and the
 * inner `commit` ended the request transaction and took
 * `SET LOCAL app.current_tenant` with it. A mock cannot express any of that.
 *
 * Runs as `app_user` explicitly. CI connects as the database owner, for whom
 * the `to: app_user` policies simply do not apply — without SET ROLE this test
 * would pass against the broken code and prove nothing. scripts/rls-live-test.sql
 * takes the same precaution for the same reason.
 *
 * Skips (loudly, in the test name) when no migrated database is reachable, so
 * a developer without docker running is not blocked. CI always has one.
 */
// Fresh per run, deliberately. Fixed ids collide with rows a *failing* run
// leaves behind: when the bug is present the inner commit makes the fixture
// durable and the closing ROLLBACK has nothing left to undo, so the next run
// dies on a primary-key conflict instead of on the assertion that matters.
const ORG_ID = randomUUID();
const USER_ID = randomUUID();
const ROOM_ID = randomUUID();

let available = false;
let skipReason = "";

beforeAll(async () => {
  let probe: PoolClient | undefined;
  try {
    probe = await pool.connect();
    // Fails unless migrations have run, which is what this test needs.
    await probe.query("SELECT 1 FROM event_rooms LIMIT 0");
    available = true;
  } catch (err) {
    skipReason = (err as { code?: string; message?: string }).code ?? String((err as Error).message);
  } finally {
    probe?.release();
  }
});

afterAll(async () => {
  await pool.end().catch(() => {});
});

describe("tenant transaction integrity against a live database", () => {
  /**
   * Mirrors runInTenantContext: one pinned connection, BEGIN, SET LOCAL
   * app.current_tenant, drizzle bound to that client in tenantContextStorage.
   * Rolls back at the end, so it leaves nothing behind.
   */
  const inTenantRequest = async <T>(fn: () => Promise<T>): Promise<T> => {
    const client = await pool.connect();
    try {
      await client.query("BEGIN");

      // Seed the FK parents as the connecting role, before dropping to
      // app_user — organizations/users carry their own policies and this is
      // fixture setup, not the behaviour under test.
      await client.query(
        `INSERT INTO organizations (id, name, slug, contact_email, is_active)
         VALUES ($1, 'Tx Integrity Org', $2, $3, true)
         ON CONFLICT (id) DO NOTHING`,
        [ORG_ID, `tx-integrity-${ORG_ID}`, `tx-${ORG_ID}@test.local`],
      );
      await client.query(
        `INSERT INTO users (id, email, full_name, role, organization_id, is_active, password_hash)
         VALUES ($1, $3, 'Tx User', 'admin', $2, true, 'dummy')
         ON CONFLICT (id) DO NOTHING`,
        [USER_ID, ORG_ID, `tx-${USER_ID}@test.local`],
      );

      await client.query("SET LOCAL ROLE app_user");
      await client.query("SELECT set_config('app.current_tenant', $1, true), set_config('app.current_user_id', $2, true)", [
        ORG_ID,
        USER_ID,
      ]);

      const tx = drizzle(client, { schema });
      return await tenantContextStorage.run(tx, fn);
    } finally {
      await client.query("ROLLBACK").catch(() => {});
      client.release();
    }
  };

  const insertRoom = (target: typeof db) =>
    target.execute(sql`
      INSERT INTO event_rooms (
        id, organization_id, created_by, title, description, status,
        scheduled_start, scheduled_end, max_participants, share_token,
        stream_provider, activity_definitions,
        attendance_window_before, attendance_window_after
      ) VALUES (
        ${ROOM_ID}, ${ORG_ID}, ${USER_ID}, 'Tx Integrity Room', 'row must survive to the read-back',
        'scheduled', '2026-01-01T10:00:00Z', '2026-01-01T12:00:00Z', 10,
        ${ROOM_ID.replace(/-/g, "")}, 'livekit', '[]', 15, 30
      )
    `);

  it("keeps the tenant visible after withTransaction, so a write is readable back", async (ctx) => {
    if (!available) return ctx.skip(`no migrated database reachable (${skipReason})`);

    await inTenantRequest(async () => {
      await withTransaction(async (tx) => {
        await insertRoom(tx as unknown as typeof db);
      });

      // The assertion that fails on the old code: with the request
      // transaction committed out from under us, app.current_tenant is gone,
      // the RLS predicate compares against NULL and this matches zero rows.
      const tenant = await db.execute(sql`SELECT current_setting('app.current_tenant', true) AS tenant`);
      expect((tenant.rows[0] as { tenant: string | null }).tenant).toBe(ORG_ID);

      const rows = await db.execute(sql`SELECT id FROM event_rooms WHERE id = ${ROOM_ID}`);
      expect(rows.rows).toHaveLength(1);
    });
  });

  it("refuses db.transaction() inside a tenant-scoped request", async (ctx) => {
    if (!available) return ctx.skip(`no migrated database reachable (${skipReason})`);

    await inTenantRequest(async () => {
      expect(() => db.transaction).toThrow(/withTransaction/);
    });
  });

  it("still opens a real transaction outside a request", async (ctx) => {
    if (!available) return ctx.skip(`no migrated database reachable (${skipReason})`);

    expect(tenantContextStorage.getStore()).toBeUndefined();
    expect(typeof db.transaction).toBe("function");
  });
});
