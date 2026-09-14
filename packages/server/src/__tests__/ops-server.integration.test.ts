import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { randomUUID } from "crypto";
import { Pool } from "pg";
import request from "supertest";
import { pino } from "pino";
import { SignJWT, generateKeyPair, exportJWK, createLocalJWKSet } from "jose";
import { createOpsApp } from "../ops/app";
import { main as maintainersCli } from "../scripts/maintainers";

/**
 * ops-server against a migrated database, connected as the real maintainer
 * login roles: whoami writes exactly one audit row, deactivation takes effect
 * on the next request, and a failed audit insert withholds the response.
 *
 * The Access JWT is signed with a local key so the full verification path runs.
 *
 * "Audit INSERT revoked" uses a throwaway login role with no grants rather than
 * revoking from maintainer_audit_writer: vitest runs files in parallel and the
 * grants suite asserts that INSERT works on the same database.
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
const AUD = "ops-integration-aud";
const RUN = randomUUID().slice(0, 8);
const EMAIL = `ops-shell-${RUN}@nvces.test`;
const DENIED_ROLE = `ops_audit_denied_${RUN}`;
const DENIED_PASSWORD = `denied_${RUN}`;

let owner: Pool;
let ro: Pool;
let audit: Pool;
let denied: Pool;
let available = false;
let skipReason = "";
let privateKey: CryptoKey;
let keys: ReturnType<typeof createLocalJWKSet>;
let maintainerId = "";

const token = () =>
  new SignJWT({ email: EMAIL.toUpperCase() })
    .setProtectedHeader({ alg: "RS256", kid: "k1" })
    .setIssuer(TEAM)
    .setAudience(AUD)
    .setIssuedAt()
    .setExpirationTime("5m")
    .sign(privateKey);

const appWith = (auditPool: Pool) =>
  createOpsApp({
    env: {
      NODE_ENV: "production",
      CF_ACCESS_TEAM_DOMAIN: TEAM,
      CF_ACCESS_AUD: AUD,
      OPS_STATIC_DIR: "does-not-exist",
      SENTRY_RELEASE: "integration",
      OPS_AUTH_BYPASS_EMAIL: undefined,
    },
    readPool: ro,
    auditPool,
    logger: pino({ level: "silent" }),
    keys,
  });

const cli = async (argv: string[]) =>
  maintainersCli(argv, { DATABASE_URL: ownerUrl }, { out: () => {}, err: () => {} });

beforeAll(async () => {
  const pair = await generateKeyPair("RS256");
  privateKey = pair.privateKey;
  keys = createLocalJWKSet({ keys: [{ ...(await exportJWK(pair.publicKey)), kid: "k1", alg: "RS256" }] });

  if (!ownerUrl) {
    skipReason = "DATABASE_URL unset";
    return;
  }
  owner = new Pool({ connectionString: ownerUrl, max: 1 });
  ro = new Pool({
    connectionString: loginUrl("maintainer_ro_login", process.env.MAINTAINER_RO_DB_PASSWORD || "local_dev_maint_ro"),
    max: 2,
  });
  audit = new Pool({
    connectionString: loginUrl(
      "maintainer_audit_login",
      process.env.MAINTAINER_AUDIT_DB_PASSWORD || "local_dev_maint_audit",
    ),
    max: 1,
  });
  try {
    await owner.query("SELECT 1 FROM maintainer_access_log LIMIT 0");
    await ro.query("SELECT 1");
    await audit.query("SELECT 1");
  } catch (err) {
    skipReason = (err as { code?: string; message?: string }).code ?? String((err as Error).message);
    if (process.env.CI) throw new Error(`ops-server integration suite cannot run in CI: ${skipReason}`);
    return;
  }

  expect(await cli(["add", "--email", EMAIL, "--name", "Ops Shell Test", "--added-by", "ci@nvces.test"])).toBe(0);
  ({
    rows: [{ id: maintainerId }],
  } = await owner.query("SELECT id FROM maintainers WHERE email = $1", [EMAIL]));

  await owner.query(`CREATE ROLE ${DENIED_ROLE} LOGIN PASSWORD '${DENIED_PASSWORD}'`);
  denied = new Pool({ connectionString: loginUrl(DENIED_ROLE, DENIED_PASSWORD), max: 1 });

  available = true;
});

afterAll(async () => {
  await denied?.end();
  if (available) await owner.query(`DROP ROLE IF EXISTS ${DENIED_ROLE}`);
  // Maintainer and log rows stay: the log is append-only and references the maintainer.
  await Promise.allSettled([owner?.end(), ro?.end(), audit?.end()]);
});

const auditRows = async (requestId: string) =>
  (
    await owner.query(
      "SELECT action, maintainer_id, maintainer_email FROM maintainer_access_log WHERE request_id = $1",
      [requestId],
    )
  ).rows;

describe("ops-server against Postgres", () => {
  it("whoami writes exactly one session.whoami row with the response's request id", async (ctx) => {
    if (!available) ctx.skip(`no migrated database: ${skipReason}`);

    const res = await request(appWith(audit)).get("/ops-api/v1/whoami").set("Cf-Access-Jwt-Assertion", await token());

    expect(res.status).toBe(200);
    expect(res.body.maintainer).toEqual({ id: maintainerId, email: EMAIL, displayName: "Ops Shell Test" });
    const requestId = res.headers["x-request-id"] as string;
    expect(await auditRows(requestId)).toEqual([
      { action: "session.whoami", maintainer_id: maintainerId, maintainer_email: EMAIL },
    ]);
  });

  it("withholds maintainer data with 503 when the audit insert is refused", async (ctx) => {
    if (!available) ctx.skip(`no migrated database: ${skipReason}`);

    const res = await request(appWith(denied)).get("/ops-api/v1/whoami").set("Cf-Access-Jwt-Assertion", await token());

    expect(res.status).toBe(503);
    expect(res.body).toEqual({ error: "AUDIT_UNAVAILABLE" });
    expect(res.text).not.toContain(EMAIL);
    expect(res.text).not.toContain(maintainerId);
    expect(await auditRows(res.headers["x-request-id"] as string)).toEqual([]);
  });

  it("refuses a deactivated maintainer on the very next request", async (ctx) => {
    if (!available) ctx.skip(`no migrated database: ${skipReason}`);
    const app = appWith(audit);

    const before = await request(app).get("/ops-api/v1/whoami").set("Cf-Access-Jwt-Assertion", await token());
    expect(before.status).toBe(200);

    expect(await cli(["deactivate", "--email", EMAIL])).toBe(0);

    const after = await request(app).get("/ops-api/v1/whoami").set("Cf-Access-Jwt-Assertion", await token());
    expect(after.status).toBe(403);
    expect(after.body).toEqual({ error: "FORBIDDEN" });
    expect(await auditRows(after.headers["x-request-id"] as string)).toEqual([]);
  });
});
