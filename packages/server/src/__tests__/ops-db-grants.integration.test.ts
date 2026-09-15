import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { randomUUID } from "crypto";
import { readFileSync } from "fs";
import path from "path";
import { Pool, type PoolClient } from "pg";
import { main as maintainersCli } from "../scripts/maintainers";

/**
 * Proves the Ops Console's "read-only, no secrets" promise is enforced by
 * Postgres itself (migration 0013 + the login roles from init-db.sql), not by
 * application code.
 *
 * Connects as the real login roles, not SET ROLE from the owner: the claim
 * under test includes "maintainer_ro_login exists, can log in, and bypasses
 * RLS", and role attributes are not inherited through membership, so SET ROLE
 * on the group role would prove less. SET ROLE is used only for app_user and
 * auth_svc_role, as tenant-transaction.integration.test.ts does.
 *
 * Login URLs are derived from DATABASE_URL (host/port/db differ between CI and
 * local docker) with the dev-default passwords init-db.sql falls back to.
 *
 * Skips, loudly in the test name, when no migrated database is reachable —
 * except under CI, where that is a failure.
 */
const ownerUrl = process.env.DATABASE_URL ?? "";

const loginUrl = (user: string, password: string): string => {
  const u = new URL(ownerUrl);
  u.username = user;
  u.password = password;
  return u.toString();
};

const RUN = randomUUID().slice(0, 8);
const ORG_A = randomUUID();
const ORG_B = randomUUID();
const USER_A = randomUUID();
const USER_B = randomUUID();
const MAINTAINER_ID = randomUUID();
const MAINTAINER_EMAIL = `ops-grants-${RUN}@nvces.test`;
const CLI_EMAIL = `ops-cli-${RUN}@nvces.test`;

let owner: Pool;
let ro: Pool;
let audit: Pool;
let available = false;
let skipReason = "";

beforeAll(async () => {
  if (!ownerUrl) {
    skipReason = "DATABASE_URL unset";
    return;
  }
  owner = new Pool({ connectionString: ownerUrl, max: 2 });
  ro = new Pool({
    connectionString: loginUrl("maintainer_ro_login", process.env.MAINTAINER_RO_DB_PASSWORD || "local_dev_maint_ro"),
    max: 1,
  });
  audit = new Pool({
    connectionString: loginUrl(
      "maintainer_audit_login",
      process.env.MAINTAINER_AUDIT_DB_PASSWORD || "local_dev_maint_audit",
    ),
    max: 1,
  });
  try {
    // Fails unless 0013 has run and both login roles exist.
    await owner.query("SELECT 1 FROM maintainer_access_log LIMIT 0");
    await ro.query("SELECT 1");
    await audit.query("SELECT 1");
  } catch (err) {
    skipReason = (err as { code?: string; message?: string }).code ?? String((err as Error).message);
    // CI provisions these roles; skipping there would turn a broken PII
    // boundary into a green check.
    if (process.env.CI) throw new Error(`ops grants suite cannot run in CI: ${skipReason}`);
    return;
  }

  // Committed fixtures: the login roles use other connections and must see them.
  await owner.query(
    `INSERT INTO organizations (id, name, slug, contact_email, is_active)
     VALUES ($1, 'Grants Org A', $3, 'a@grants.test', true), ($2, 'Grants Org B', $4, 'b@grants.test', true)`,
    [ORG_A, ORG_B, `grants-a-${ORG_A}`, `grants-b-${ORG_B}`],
  );
  await owner.query(
    `INSERT INTO users (id, email, full_name, role, organization_id, is_active, password_hash)
     VALUES ($1, $3, 'Grants A', 'admin', $5, true, 'secret-hash'),
            ($2, $4, 'Grants B', 'admin', $6, true, 'secret-hash')`,
    [USER_A, USER_B, `grants-a-${USER_A}@grants.test`, `grants-b-${USER_B}@grants.test`, ORG_A, ORG_B],
  );
  await owner.query(`INSERT INTO maintainers (id, email, display_name, added_by) VALUES ($1, $2, 'Grants', 'ci@nvces.test')`, [
    MAINTAINER_ID,
    MAINTAINER_EMAIL,
  ]);
  available = true;
});

afterAll(async () => {
  if (available) {
    // No access-log rows are ever committed by this file, so the maintainers
    // rows are deletable despite ON DELETE RESTRICT.
    await owner.query("DELETE FROM maintainers WHERE email = ANY($1)", [[MAINTAINER_EMAIL, CLI_EMAIL]]).catch(() => {});
    await owner.query("DELETE FROM users WHERE id = ANY($1)", [[USER_A, USER_B]]).catch(() => {});
    await owner.query("DELETE FROM organizations WHERE id = ANY($1)", [[ORG_A, ORG_B]]).catch(() => {});
  }
  await Promise.all([owner?.end(), ro?.end(), audit?.end()].map((p) => p?.catch(() => {})));
});

const sqlstate = async (run: () => Promise<unknown>): Promise<string | undefined> => {
  try {
    await run();
    return undefined;
  } catch (err) {
    return (err as { code?: string }).code;
  }
};

const logRow = (overrides: Record<string, unknown> = {}) => {
  const row = {
    maintainer_id: MAINTAINER_ID,
    maintainer_email: MAINTAINER_EMAIL,
    action: "user.view",
    reason: null as string | null,
    request_id: `req-${randomUUID()}`,
    ...overrides,
  };
  return {
    text: `INSERT INTO maintainer_access_log (maintainer_id, maintainer_email, action, reason, request_id)
           VALUES ($1, $2, $3, $4, $5)`,
    values: [row.maintainer_id, row.maintainer_email, row.action, row.reason, row.request_id],
  };
};

/** Runs fn in a transaction that is always rolled back. */
const rolledBack = async (pool: Pool, fn: (c: PoolClient) => Promise<void>) => {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    await fn(client);
  } finally {
    await client.query("ROLLBACK").catch(() => {});
    client.release();
  }
};

/** Expects `text` to fail inside a savepoint, leaving the transaction usable. */
const failsInSavepoint = async (client: PoolClient, text: string, values: unknown[] = []) => {
  await client.query("SAVEPOINT s");
  try {
    await client.query(text, values);
  } catch (err) {
    await client.query("ROLLBACK TO SAVEPOINT s");
    return err as { code?: string; message?: string };
  }
  await client.query("RELEASE SAVEPOINT s");
  return undefined;
};

describe("Ops Console database grants against a live database", () => {
  describe("as maintainer_ro_login", () => {
    it("1. reads users across tenants (RLS bypass)", async (ctx) => {
      if (!available) return ctx.skip(`no migrated database with maintainer roles reachable (${skipReason})`);
      const { rows } = await ro.query("SELECT email FROM users WHERE id = ANY($1)", [[USER_A, USER_B]]);
      expect(rows).toHaveLength(2);
    });

    it("reads every granted column", async (ctx) => {
      if (!available) return ctx.skip(`no migrated database with maintainer roles reachable (${skipReason})`);
      const granted = [
        "SELECT id, name, slug, is_active, legal_hold, contact_email, created_at, updated_at, deleted_at FROM organizations",
        "SELECT id, email, full_name, role, organization_id, is_active, email_verified_at, last_login_at, created_at, updated_at, deleted_at FROM users",
        "SELECT id, user_id, organization_id, role, joined_at, created_at FROM org_members",
        "SELECT id, user_id, expires_at, revoked_at, created_at FROM sessions",
        "SELECT id, organization_id, status, created_at, deleted_at FROM event_rooms",
        "SELECT id, organization_id, submitted_at, deleted_at FROM attendance_entries",
        "SELECT id, organization_id, severity, component, title, status, created_at FROM bug_reports",
        "SELECT id, email_type, status, attempts, last_attempt_at, created_at, failed_at FROM email_deliveries",
        "SELECT id, organization_id, channel, status, attempts, last_attempt_at, created_at FROM notification_deliveries",
        "SELECT id, status, attempts, max_attempts, error_message, created_at, updated_at FROM pdf_jobs",
        "SELECT * FROM maintainers",
        "SELECT * FROM maintainer_access_log",
      ];
      for (const q of granted) {
        await expect(ro.query(`${q} LIMIT 0`), q).resolves.toBeDefined();
      }
    });

    it("2. cannot read users.password_hash", async (ctx) => {
      if (!available) return ctx.skip(`no migrated database with maintainer roles reachable (${skipReason})`);
      expect(await sqlstate(() => ro.query("SELECT password_hash FROM users LIMIT 1"))).toBe("42501");
    });

    it("3. cannot read secrets, attendance content, or ungranted tables", async (ctx) => {
      if (!available) return ctx.skip(`no migrated database with maintainer roles reachable (${skipReason})`);
      for (const q of [
        "SELECT token_hash FROM sessions",
        "SELECT data FROM attendance_entries",
        "SELECT * FROM activity_submissions",
        "SELECT * FROM users",
        "SELECT google_id FROM users",
        "SELECT ip_address FROM sessions",
        "SELECT recipient_email FROM email_deliveries",
        "SELECT * FROM audit_logs",
      ]) {
        expect(await sqlstate(() => ro.query(`${q} LIMIT 1`)), q).toBe("42501");
      }
    });

    it("4. cannot write to users, organizations, maintainers, or maintainer_access_log", async (ctx) => {
      if (!available) return ctx.skip(`no migrated database with maintainer roles reachable (${skipReason})`);
      const log = logRow();
      const writes: Array<[string, unknown[]]> = [
        ["INSERT INTO users (email, full_name, password_hash) VALUES ('x@grants.test', 'x', 'x')", []],
        ["UPDATE users SET full_name = 'x' WHERE id = $1", [USER_A]],
        ["DELETE FROM users WHERE id = $1", [USER_A]],
        ["INSERT INTO organizations (name, slug) VALUES ('x', 'x')", []],
        ["UPDATE organizations SET name = 'x' WHERE id = $1", [ORG_A]],
        ["DELETE FROM organizations WHERE id = $1", [ORG_A]],
        ["INSERT INTO maintainers (email, display_name, added_by) VALUES ('x@grants.test', 'x', 'x')", []],
        ["UPDATE maintainers SET display_name = 'x' WHERE id = $1", [MAINTAINER_ID]],
        ["DELETE FROM maintainers WHERE id = $1", [MAINTAINER_ID]],
        [log.text, log.values],
        ["UPDATE maintainer_access_log SET reason = 'x'", []],
        ["DELETE FROM maintainer_access_log", []],
      ];
      for (const [text, values] of writes) {
        expect(await sqlstate(() => ro.query(text, values)), text).toBe("42501");
      }
    });
  });

  describe("as maintainer_audit_login", () => {
    it("5. inserts a valid access-log row", async (ctx) => {
      if (!available) return ctx.skip(`no migrated database with maintainer roles reachable (${skipReason})`);
      await rolledBack(audit, async (c) => {
        const log = logRow();
        const res = await c.query(log.text, log.values);
        expect(res.rowCount).toBe(1);
      });
    });

    it("6. cannot read the log, maintainers, or users", async (ctx) => {
      if (!available) return ctx.skip(`no migrated database with maintainer roles reachable (${skipReason})`);
      for (const q of ["SELECT * FROM maintainer_access_log", "SELECT * FROM maintainers", "SELECT email FROM users"]) {
        expect(await sqlstate(() => audit.query(`${q} LIMIT 1`)), q).toBe("42501");
      }
    });
  });

  it.for(["app_user", "auth_svc_role"])(
    "7. %s can neither read nor write maintainers or maintainer_access_log",
    async (role, ctx) => {
      if (!available) return ctx.skip(`no migrated database with maintainer roles reachable (${skipReason})`);
      const log = logRow();
      const attempts: Array<[string, unknown[]]> = [
        ["SELECT * FROM maintainers", []],
        ["SELECT * FROM maintainer_access_log", []],
        ["INSERT INTO maintainers (email, display_name, added_by) VALUES ('x@grants.test', 'x', 'x')", []],
        [log.text, log.values],
      ];
      await rolledBack(owner, async (c) => {
        await c.query(`SET LOCAL ROLE ${role}`);
        for (const [text, values] of attempts) {
          expect((await failsInSavepoint(c, text, values))?.code, text).toBe("42501");
        }
      });
    },
  );

  describe("as the table owner", () => {
    it("8. UPDATE, DELETE and TRUNCATE on maintainer_access_log are refused by the trigger", async (ctx) => {
      if (!available) return ctx.skip(`no migrated database with maintainer roles reachable (${skipReason})`);
      await rolledBack(owner, async (c) => {
        const log = logRow();
        await c.query(log.text, log.values);
        // Grant failures and the trigger share SQLSTATE 42501; the message is
        // what shows the trigger, not a missing privilege, did the refusing.
        for (const text of [
          "UPDATE maintainer_access_log SET reason = 'tampered' WHERE maintainer_id = $1",
          "DELETE FROM maintainer_access_log WHERE maintainer_id = $1",
        ]) {
          const err = await failsInSavepoint(c, text, [MAINTAINER_ID]);
          expect(err?.message, text).toMatch(/maintainer_access_log is append-only/);
        }
        const err = await failsInSavepoint(c, "TRUNCATE maintainer_access_log");
        expect(err?.message).toMatch(/maintainer_access_log is append-only/);
      });
    });

    it("9. user.unmask needs a reason of at least 10 characters", async (ctx) => {
      if (!available) return ctx.skip(`no migrated database with maintainer roles reachable (${skipReason})`);
      await rolledBack(owner, async (c) => {
        const short = logRow({ action: "user.unmask", reason: "123456789" });
        expect((await failsInSavepoint(c, short.text, short.values))?.code).toBe("23514");
        const padded = logRow({ action: "user.unmask", reason: "   123456789   " });
        expect((await failsInSavepoint(c, padded.text, padded.values))?.code).toBe("23514");
        const ok = logRow({ action: "user.unmask", reason: "1234567890" });
        expect(await failsInSavepoint(c, ok.text, ok.values)).toBeUndefined();
      });
    });

    it("10. rejects an action outside the allowed set", async (ctx) => {
      if (!available) return ctx.skip(`no migrated database with maintainer roles reachable (${skipReason})`);
      await rolledBack(owner, async (c) => {
        const bad = logRow({ action: "user.delete" });
        const err = await failsInSavepoint(c, bad.text, bad.values);
        expect(err?.code).toBe("23514");
        expect(err?.message).toMatch(/mal_action_valid/);
      });
    });

    it("11. rejects a maintainer email that is not lowercase", async (ctx) => {
      if (!available) return ctx.skip(`no migrated database with maintainer roles reachable (${skipReason})`);
      await rolledBack(owner, async (c) => {
        const err = await failsInSavepoint(
          c,
          "INSERT INTO maintainers (email, display_name, added_by) VALUES ('Jane@Example.org', 'Jane', 'ci@nvces.test')",
        );
        expect(err?.code).toBe("23514");
        expect(err?.message).toMatch(/maintainers_email_lowercase/);
      });
    });
  });

  it("12. migration 0013 is safe to replay on an already-migrated database", async (ctx) => {
    if (!available) return ctx.skip(`no migrated database with maintainer roles reachable (${skipReason})`);
    // drizzle's migrator never re-runs a journaled migration, so db:migrate
    // twice proves nothing about the SQL. Replay the file itself, twice.
    const file = readFileSync(path.resolve(__dirname, "../../drizzle/0013_ops_console_foundation.sql"), "utf8");
    await rolledBack(owner, async (c) => {
      await c.query(file);
      await c.query(file);
      const { rows } = await c.query(
        "SELECT has_column_privilege('maintainer_ro', 'users', 'password_hash', 'SELECT') AS leaked",
      );
      expect(rows[0].leaked).toBe(false);
    });
  });

  describe("maintainers CLI", () => {
    const run = async (...argv: string[]) => {
      const out: string[] = [];
      const err: string[] = [];
      const code = await maintainersCli(argv, { DATABASE_URL: ownerUrl }, {
        out: (l) => out.push(l),
        err: (l) => err.push(l),
      });
      return { code, out: out.join("\n"), err: err.join("\n") };
    };

    it("14. add twice with a differently-cased email exits 1 with 'already exists'", async (ctx) => {
      if (!available) return ctx.skip(`no migrated database with maintainer roles reachable (${skipReason})`);
      expect((await run("add", "--email", CLI_EMAIL, "--name", "CLI Test", "--added-by", "ci@nvces.test")).code).toBe(0);
      const again = await run("add", "--email", CLI_EMAIL.toUpperCase(), "--name", "CLI Test", "--added-by", "ci@nvces.test");
      expect(again.code).toBe(1);
      expect(again.err).toContain("already exists");
    });

    it("15. deactivate sets is_active=false and deactivated_at; list shows it", async (ctx) => {
      if (!available) return ctx.skip(`no migrated database with maintainer roles reachable (${skipReason})`);
      expect((await run("deactivate", "--email", CLI_EMAIL)).code).toBe(0);
      const { rows } = await owner.query("SELECT is_active, deactivated_at FROM maintainers WHERE email = $1", [CLI_EMAIL]);
      expect(rows[0].is_active).toBe(false);
      expect(rows[0].deactivated_at).not.toBeNull();

      const list = await run("list");
      const line = list.out.split("\n").find((l) => l.startsWith(`${CLI_EMAIL}\t`));
      expect(line?.split("\t")[2]).toBe("false");
      expect(line?.split("\t")[4]).not.toBe("");

      const add = await run("add", "--email", CLI_EMAIL, "--name", "CLI Test", "--added-by", "ci@nvces.test");
      expect(add.code).toBe(1);
      expect(add.err).toContain("use reactivate");
      expect((await run("reactivate", "--email", CLI_EMAIL, "--added-by", "ci@nvces.test")).code).toBe(0);
    });
  });
});
