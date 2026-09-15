import { describe, it, expect, beforeAll, afterAll } from "vitest";
import http from "node:http";
import type { AddressInfo, Socket } from "node:net";
import { randomBytes, randomUUID } from "crypto";
import { Pool } from "pg";
import request from "supertest";
import { pino } from "pino";
import { SignJWT, generateKeyPair, exportJWK, createLocalJWKSet } from "jose";
import type { OpsBacklog, OpsUsageOrg } from "@application/shared";
import { createOpsApp } from "../ops/app";

/**
 * #149 acceptance criteria 1, 3-8 against a migrated database, as the real
 * maintainer login roles. The tenant server is a local HTTP stand-in.
 *
 * Backlog counts and usage totals are global, and other suites write to the
 * same database concurrently, so counts are asserted as deltas from a baseline
 * and org order is asserted relative to this suite's own orgs.
 *
 * Skips without a reachable migrated database locally; fails under CI.
 */
const ownerUrl = process.env.DATABASE_URL ?? "";
const loginUrl = (user: string, password: string): string => {
  const u = new URL(ownerUrl);
  u.username = user;
  u.password = password;
  return u.toString();
};

const TEAM = "https://nvces.cloudflareaccess.com";
const AUD = "ops-health-aud";
const RUN = randomBytes(6).toString("hex");
const MAINTAINER_EMAIL = `ops-health-${RUN}@nvces.test`;

const ORG_LOGIN = randomUUID(); // a member logged in 2 days ago
const ORG_ROOM = randomUUID(); // a room created 20 days ago
const ORG_IDLE = randomUUID(); // nothing
const ORG_DELETED = randomUUID(); // soft-deleted, with a fresh login
const USER_LOGIN = randomUUID();
const USER_ROOM = randomUUID();
const USER_DELETED_ORG = randomUUID();
const ROOM_ID = randomUUID();

const ALL_OK = { database: "ok", redis: "ok", jwt: "ok", schema: "ok", storage: "ok", gotenberg: "ok", livekit: "ok" };

let owner: Pool;
let ro: Pool;
let audit: Pool;
let available = false;
let skipReason = "";
let privateKey: CryptoKey;
let keys: ReturnType<typeof createLocalJWKSet>;

let tenant: http.Server;
let tenantUrl = "";
let tenantMode: "ok" | "hang" = "ok";
const sockets = new Set<Socket>();

const jwt = () =>
  new SignJWT({ email: MAINTAINER_EMAIL })
    .setProtectedHeader({ alg: "RS256", kid: "k1" })
    .setIssuer(TEAM)
    .setAudience(AUD)
    .setIssuedAt()
    .setExpirationTime("5m")
    .sign(privateKey);

const appWith = (opts: { timeoutMs?: number } = {}) =>
  createOpsApp({
    env: {
      NODE_ENV: "production",
      CF_ACCESS_TEAM_DOMAIN: TEAM,
      CF_ACCESS_AUD: AUD,
      OPS_STATIC_DIR: "does-not-exist",
      SENTRY_RELEASE: "test-release",
      OPS_AUTH_BYPASS_EMAIL: undefined,
      OPS_APP_INTERNAL_URL: tenantUrl,
      OPS_SQS_DLQ_URL: undefined,
    },
    readPool: ro,
    auditPool: audit,
    logger: pino({ level: "silent" }),
    keys,
    health: { timeoutMs: opts.timeoutMs },
  });

const get = async (path: string, opts?: { timeoutMs?: number }) =>
  request(appWith(opts)).get(`/ops-api/v1${path}`).set("Cf-Access-Jwt-Assertion", await jwt());

const auditRows = async (requestId: string) =>
  (await owner.query("SELECT action, result_count FROM maintainer_access_log WHERE request_id = $1", [requestId])).rows;

const backlogOf = async (): Promise<{ backlog: OpsBacklog; overall: string }> => {
  const res = await get("/health");
  expect(res.status).toBe(200);
  expect(res.body.backlog.status).toBe("ok");
  return { backlog: res.body.backlog.data, overall: res.body.overall };
};

const failedEmails = (n: number, age = "10 minutes") =>
  owner.query(
    `INSERT INTO email_deliveries (user_id, recipient_email, email_type, payload, status, created_at, failed_at)
     SELECT $1, $2, 'verification', '{}', 'FAILED', now() - interval '1 day', now() - $3::interval FROM generate_series(1, $4)`,
    [USER_LOGIN, `ops-health-${RUN}@nvces.test`, age, n],
  );

beforeAll(async () => {
  const pair = await generateKeyPair("RS256");
  privateKey = pair.privateKey;
  keys = createLocalJWKSet({ keys: [{ ...(await exportJWK(pair.publicKey)), kid: "k1", alg: "RS256" }] });

  tenant = http.createServer((_req, res) => {
    if (tenantMode === "hang") return;
    res.writeHead(200, { "Content-Type": "application/json" }).end(JSON.stringify({ status: "ok", checks: ALL_OK }));
  });
  tenant.on("connection", (s) => {
    sockets.add(s);
    s.on("close", () => sockets.delete(s));
  });
  await new Promise<void>((resolve) => tenant.listen(0, "127.0.0.1", resolve));
  tenantUrl = `http://127.0.0.1:${(tenant.address() as AddressInfo).port}`;

  if (!ownerUrl) {
    skipReason = "DATABASE_URL unset";
    return;
  }
  owner = new Pool({ connectionString: ownerUrl, max: 2 });
  ro = new Pool({
    connectionString: loginUrl("maintainer_ro_login", process.env.MAINTAINER_RO_DB_PASSWORD || "local_dev_maint_ro"),
    max: 2,
    statement_timeout: 5_000,
  });
  audit = new Pool({
    connectionString: loginUrl("maintainer_audit_login", process.env.MAINTAINER_AUDIT_DB_PASSWORD || "local_dev_maint_audit"),
    max: 1,
  });
  try {
    await owner.query("SELECT 1 FROM maintainer_access_log LIMIT 0");
    await ro.query("SELECT 1");
    await audit.query("SELECT 1");
  } catch (err) {
    skipReason = (err as { code?: string; message?: string }).code ?? String((err as Error).message);
    if (process.env.CI) throw new Error(`ops health suite cannot run in CI: ${skipReason}`);
    return;
  }

  await owner.query("INSERT INTO maintainers (email, display_name, added_by) VALUES ($1, 'Health Test', 'ci@nvces.test')", [
    MAINTAINER_EMAIL,
  ]);

  // The idle org's name sorts first among orgs with no activity, so it stays inside the 200-row limit.
  await owner.query(
    `INSERT INTO organizations (id, name, slug, is_active, created_at, updated_at, deleted_at) VALUES
       ($1, $5, $6, true, now(), now(), NULL),
       ($2, $7, $8, true, now(), now(), NULL),
       ($3, $9, $10, true, now(), now(), NULL),
       ($4, $11, $12, true, now(), now(), now())`,
    [
      ORG_LOGIN, ORG_ROOM, ORG_IDLE, ORG_DELETED,
      `Health login ${RUN}`, `oh-login-${RUN}`,
      `Health room ${RUN}`, `oh-room-${RUN}`,
      `0000 health idle ${RUN}`, `oh-idle-${RUN}`,
      `Health deleted ${RUN}`, `oh-deleted-${RUN}`,
    ],
  );
  await owner.query(
    `INSERT INTO users (id, email, password_hash, full_name, role, organization_id, is_active, last_login_at, created_at, updated_at) VALUES
       ($1, $4, 'x', 'Health Login', 'admin', $5, true, now() - interval '2 days', now(), now()),
       ($2, $6, 'x', 'Health Room', 'admin', $7, true, NULL, now(), now()),
       ($3, $8, 'x', 'Health Deleted Org', 'admin', $9, true, now(), now(), now())`,
    [
      USER_LOGIN, USER_ROOM, USER_DELETED_ORG,
      `login-${RUN}@nvces.test`, ORG_LOGIN,
      `room-${RUN}@nvces.test`, ORG_ROOM,
      `deleted-${RUN}@nvces.test`, ORG_DELETED,
    ],
  );
  await owner.query(
    `INSERT INTO event_rooms (id, organization_id, created_by, title, status, scheduled_start, scheduled_end, share_token, created_at, updated_at)
     VALUES ($1, $2, $3, 'Health room', 'scheduled', now(), now() + interval '1 hour', $4, now() - interval '20 days', now())`,
    [ROOM_ID, ORG_ROOM, USER_ROOM, ROOM_ID.replace(/-/g, "")],
  );

  available = true;
});

afterAll(async () => {
  for (const s of sockets) s.destroy();
  await new Promise((resolve) => tenant?.close(resolve));
  if (available) {
    // maintainer_access_log is append-only, so the maintainer row stays (as in the lookup suite).
    await owner.query("DELETE FROM pdf_jobs WHERE room_id = $1", [ROOM_ID]);
    await owner.query("DELETE FROM email_deliveries WHERE user_id = $1", [USER_LOGIN]);
    await owner.query("DELETE FROM event_rooms WHERE id = $1", [ROOM_ID]);
    await owner.query("DELETE FROM users WHERE id = ANY($1)", [[USER_LOGIN, USER_ROOM, USER_DELETED_ORG]]);
    await owner.query("DELETE FROM organizations WHERE id = ANY($1)", [[ORG_LOGIN, ORG_ROOM, ORG_IDLE, ORG_DELETED]]);
  }
  await Promise.allSettled([owner?.end(), ro?.end(), audit?.end()]);
});

describe("Ops Console health and usage against Postgres", () => {
  it("1, 5, 8: reports all seven checks, a disabled DLQ, and writes one health.view row", async (ctx) => {
    if (!available) ctx.skip(`no migrated database: ${skipReason}`);

    const res = await get("/health");
    expect(res.status).toBe(200);
    expect(res.body.app).toEqual({ status: "ok", data: { httpStatus: 200, checks: ALL_OK } });
    expect(Object.keys(res.body.app.data.checks)).toHaveLength(7);
    expect(res.body.dlq).toEqual({ status: "disabled" });
    expect(res.body.release).toBe("test-release");
    expect(["green", "amber", "red"]).toContain(res.body.overall);

    const rows = await auditRows(res.headers["x-request-id"] as string);
    expect(rows).toEqual([{ action: "health.view", result_count: null }]);
  });

  it("3: a tenant server that never answers times out while the backlog still reads", async (ctx) => {
    if (!available) ctx.skip(`no migrated database: ${skipReason}`);

    tenantMode = "hang";
    try {
      const started = Date.now();
      const res = await get("/health", { timeoutMs: 500 });
      expect(Date.now() - started).toBeLessThan(6_000);
      expect(res.status).toBe(200);
      expect(res.body.app).toEqual({ status: "error", error: "TIMEOUT" });
      expect(res.body.backlog.status).toBe("ok");
    } finally {
      tenantMode = "ok";
    }
  });

  it("4: counts stuck PDF jobs and failed emails inside their windows only", async (ctx) => {
    if (!available) ctx.skip(`no migrated database: ${skipReason}`);

    const before = await backlogOf();
    const quietBefore = Object.values(before.backlog).every((n) => n === 0);

    // Outside every window: must not count.
    await failedEmails(1, "2 hours");
    await owner.query(
      `INSERT INTO pdf_jobs (job_id, room_id, org_id, user_id, status, updated_at) VALUES
         ($1, $4, $5, $6, 'pending', now() - interval '5 minutes'),
         ($2, $4, $5, $6, 'failed', now() - interval '25 hours'),
         ($3, $4, $5, $6, 'completed', now() - interval '1 hour')`,
      [`h-fresh-${RUN}`, `h-oldfail-${RUN}`, `h-done-${RUN}`, ROOM_ID, ORG_ROOM, USER_ROOM],
    );

    await failedEmails(2);
    const amber = await backlogOf();
    expect(amber.backlog.emailFailed1h - before.backlog.emailFailed1h).toBe(2);
    expect(amber.backlog.pdfStuck).toBe(before.backlog.pdfStuck);
    expect(amber.backlog.pdfFailed24h).toBe(before.backlog.pdfFailed24h);
    if (quietBefore) expect(amber.overall).toBe("amber");

    await failedEmails(3);
    const red = await backlogOf();
    expect(red.backlog.emailFailed1h - before.backlog.emailFailed1h).toBe(5);
    expect(red.overall).toBe("red");

    await owner.query(
      `INSERT INTO pdf_jobs (job_id, room_id, org_id, user_id, status, updated_at)
       VALUES ($1, $2, $3, $4, 'processing', now() - interval '20 minutes')`,
      [`h-stuck-${RUN}`, ROOM_ID, ORG_ROOM, USER_ROOM],
    );
    const stuck = await backlogOf();
    expect(stuck.backlog.pdfStuck - before.backlog.pdfStuck).toBe(1);
    expect(stuck.overall).toBe("red");
  });

  it("6, 7, 8: flags activity windows, orders by last activity, excludes soft-deleted orgs, audits the row count", async (ctx) => {
    if (!available) ctx.skip(`no migrated database: ${skipReason}`);

    const nonDeleted = async () =>
      (await owner.query<{ n: number }>("SELECT count(*)::int AS n FROM organizations WHERE deleted_at IS NULL")).rows[0]!.n;
    const low = await nonDeleted();
    const res = await get("/usage");
    const high = await nonDeleted();

    expect(res.status).toBe(200);
    const orgs = res.body.orgs as OpsUsageOrg[];
    const byId = (id: string) => orgs.find((o) => o.id === id);

    expect(byId(ORG_LOGIN)).toMatchObject({ active7d: true, active30d: true, members: 1, lastRoomCreatedAt: null });
    expect(byId(ORG_LOGIN)!.lastActivityAt).toBe(byId(ORG_LOGIN)!.lastLoginAt);
    expect(byId(ORG_ROOM)).toMatchObject({ active7d: false, active30d: true, lastLoginAt: null });
    expect(byId(ORG_ROOM)!.lastActivityAt).toBe(byId(ORG_ROOM)!.lastRoomCreatedAt);
    expect(byId(ORG_IDLE)).toMatchObject({ active7d: false, active30d: false, members: 0, lastActivityAt: null });

    const index = (id: string) => orgs.findIndex((o) => o.id === id);
    expect(index(ORG_LOGIN)).toBeLessThan(index(ORG_ROOM));
    expect(index(ORG_ROOM)).toBeLessThan(index(ORG_IDLE));

    expect(byId(ORG_DELETED)).toBeUndefined();
    expect(res.body.totals.orgs).toBeGreaterThanOrEqual(low);
    expect(res.body.totals.orgs).toBeLessThanOrEqual(high);
    expect(res.body.totals.activeOrgs7d).toBeGreaterThanOrEqual(1);
    expect(res.body.totals.activeOrgs30d).toBeGreaterThanOrEqual(res.body.totals.activeOrgs7d);
    expect(res.body.totals.rooms30d).toBeGreaterThanOrEqual(1);

    const rows = await auditRows(res.headers["x-request-id"] as string);
    expect(rows).toEqual([{ action: "usage.view", result_count: orgs.length }]);
  });
});
