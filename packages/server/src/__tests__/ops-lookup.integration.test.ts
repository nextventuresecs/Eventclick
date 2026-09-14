import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { randomBytes, randomUUID, createHash } from "crypto";
import { Pool } from "pg";
import request from "supertest";
import { pino } from "pino";
import { SignJWT, generateKeyPair, exportJWK, createLocalJWKSet } from "jose";
import { createOpsApp } from "../ops/app";

/**
 * #148 acceptance criteria 1-11 against a migrated database, as the real
 * maintainer login roles, through the full Access JWT path.
 *
 * Fixture emails and names are random tokens, so finding any substring of one
 * in a response is a leak rather than a coincidence of masking.
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
const AUD = "ops-lookup-aud";
const token = () => randomBytes(6).toString("hex");
const RUN = token();

const ORG_A = randomUUID();
const ORG_B = randomUUID();
const SLUG_A = `zq-${RUN}`;
const MAINTAINER_EMAIL = `ops-lookup-${RUN}@nvces.test`;
const DENIED_ROLE = `ops_lookup_denied_${RUN}`;

type Fixture = { id: string; email: string; fullName: string };
const person = (): Fixture => {
  const a = token();
  const b = token();
  return { id: randomUUID(), email: `${a}.${b}@${token()}.test`, fullName: `Zq${a} Xv${b}` };
};

const PRIMARY = person();
const DELETED = person();
const MEMBER_ONLY = person();
const BIG_ORG_USERS = Array.from({ length: 59 }, person);
const ALL_PEOPLE = [PRIMARY, DELETED, MEMBER_ONLY, ...BIG_ORG_USERS];
const CONTACT_EMAIL = `${token()}@${token()}.test`;

let owner: Pool;
let ro: Pool;
let audit: Pool;
let denied: Pool;
let available = false;
let skipReason = "";
let privateKey: CryptoKey;
let keys: ReturnType<typeof createLocalJWKSet>;
let maintainerId = "";

const jwt = () =>
  new SignJWT({ email: MAINTAINER_EMAIL })
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
      SENTRY_RELEASE: undefined,
      OPS_AUTH_BYPASS_EMAIL: undefined,
    },
    readPool: ro,
    auditPool,
    logger: pino({ level: "silent" }),
    keys,
  });

const get = async (path: string, auditPool: Pool = audit) =>
  request(appWith(auditPool)).get(`/ops-api/v1${path}`).set("Cf-Access-Jwt-Assertion", await jwt());

const auditRows = async (requestId: string) =>
  (
    await owner.query(
      "SELECT action, target_type, target_id, organization_id, query, reason, result_count FROM maintainer_access_log WHERE request_id = $1",
      [requestId],
    )
  ).rows;

/** Criterion 5: no raw email, local part, domain or name of any fixture in the response text. */
const expectNoRawPii = (text: string) => {
  for (const p of ALL_PEOPLE) {
    const [local, domain] = p.email.split("@") as [string, string];
    for (const fragment of [p.email, local, domain, p.fullName, ...p.fullName.split(" ")]) {
      expect(text.toLowerCase()).not.toContain(fragment.toLowerCase());
    }
  }
  expect(text.toLowerCase()).not.toContain(CONTACT_EMAIL.toLowerCase());
};

beforeAll(async () => {
  const pair = await generateKeyPair("RS256");
  privateKey = pair.privateKey;
  keys = createLocalJWKSet({ keys: [{ ...(await exportJWK(pair.publicKey)), kid: "k1", alg: "RS256" }] });

  if (!ownerUrl) {
    skipReason = "DATABASE_URL unset";
    return;
  }
  owner = new Pool({ connectionString: ownerUrl, max: 2 });
  ro = new Pool({
    connectionString: loginUrl("maintainer_ro_login", process.env.MAINTAINER_RO_DB_PASSWORD || "local_dev_maint_ro"),
    max: 2,
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
    if (process.env.CI) throw new Error(`ops lookup suite cannot run in CI: ${skipReason}`);
    return;
  }

  const inserted = await owner.query<{ id: string }>(
    "INSERT INTO maintainers (email, display_name, added_by) VALUES ($1, 'Lookup Test', 'ci@nvces.test') RETURNING id",
    [MAINTAINER_EMAIL],
  );
  maintainerId = inserted.rows[0]!.id;

  await owner.query(
    `INSERT INTO organizations (id, name, slug, contact_email, is_active, created_at, updated_at)
     VALUES ($1, $2, $3, $4, true, now(), now()), ($5, $6, $7, NULL, true, now(), now())`,
    [ORG_A, `Org A ${RUN}`, SLUG_A, CONTACT_EMAIL, ORG_B, `Org B ${RUN}`, `zq-b-${RUN}`],
  );

  const insertUser = (p: Fixture, orgId: string | null, extra = "") =>
    owner.query(
      `INSERT INTO users (id, email, password_hash, full_name, role, organization_id, is_active, email_verified_at, created_at, updated_at${extra ? ", deleted_at" : ""})
       VALUES ($1, $2, 'x', $3, 'volunteer', $4, true, now(), now(), now()${extra ? ", now()" : ""})`,
      [p.id, p.email, p.fullName, orgId],
    );

  await insertUser(PRIMARY, ORG_A);
  await insertUser(DELETED, ORG_A, "deleted");
  await insertUser(MEMBER_ONLY, ORG_B);
  // Linked to ORG_A only through org_members.
  await owner.query(
    "INSERT INTO org_members (user_id, organization_id, role, created_at, updated_at) VALUES ($1, $2, 'event_manager', now(), now())",
    [MEMBER_ONLY.id, ORG_A],
  );
  for (const p of BIG_ORG_USERS) await insertUser(p, ORG_A);
  await owner.query(
    "INSERT INTO sessions (user_id, token_hash, family_id, expires_at, created_at) VALUES ($1, $2, gen_random_uuid(), now() + interval '1 day', now())",
    [PRIMARY.id, token()],
  );

  await owner.query(`CREATE ROLE ${DENIED_ROLE} LOGIN PASSWORD '${RUN}'`);
  denied = new Pool({ connectionString: loginUrl(DENIED_ROLE, RUN), max: 1 });

  available = true;
});

afterAll(async () => {
  await denied?.end();
  if (available) await owner.query(`DROP ROLE IF EXISTS ${DENIED_ROLE}`);
  await Promise.allSettled([owner?.end(), ro?.end(), audit?.end()]);
});

describe("Ops Console lookup against Postgres", () => {
  it("1, 4, 5: finds a user by exact email in any case, masked, and audits only the hash", async (ctx) => {
    if (!available) ctx.skip(`no migrated database: ${skipReason}`);

    const res = await get(`/search?q=${encodeURIComponent(PRIMARY.email.toUpperCase())}`);
    expect(res.status).toBe(200);
    expect(res.body.results).toHaveLength(1);
    expect(res.body.results[0].kind).toBe("user");
    expect(res.body.results[0].user.id).toBe(PRIMARY.id);
    expect(res.body.results[0].user.emailMasked).toMatch(/^.{2}\*\*\*@.\*\*\*\.test$/);
    expect(res.body.results[0].user.activeSessionCount).toBe(1);
    expectNoRawPii(res.text);

    const rows = await auditRows(res.headers["x-request-id"] as string);
    expect(rows).toHaveLength(1);
    expect(rows[0].action).toBe("search");
    expect(rows[0].result_count).toBe(1);
    expect(rows[0].query).toEqual({
      kind: "email",
      qSha256: createHash("sha256").update(PRIMARY.email.toLowerCase()).digest("hex"),
    });
    expect(JSON.stringify(rows[0].query).toLowerCase()).not.toContain(PRIMARY.email.split("@")[0]);
  });

  it("2, 4: an email missing its last character finds nothing, and is still audited", async (ctx) => {
    if (!available) ctx.skip(`no migrated database: ${skipReason}`);

    const res = await get(`/search?q=${encodeURIComponent(PRIMARY.email.slice(0, -1))}`);
    expect(res.body).toEqual({ results: [] });
    const rows = await auditRows(res.headers["x-request-id"] as string);
    expect(rows).toHaveLength(1);
    expect(rows[0].result_count).toBe(0);
  });

  it("3: finds an org by exact slug; a slug prefix is only a request-id hint, never an org", async (ctx) => {
    if (!available) ctx.skip(`no migrated database: ${skipReason}`);

    const hit = await get(`/search?q=${SLUG_A}`);
    expect(hit.body.results).toHaveLength(1);
    expect(hit.body.results[0].kind).toBe("org");
    expect(hit.body.results[0].org.id).toBe(ORG_A);
    expect(hit.body.results[0].org.memberCount).toBe(61);
    expect(hit.body.results[0].org.roleCounts).toEqual({ admin: 0, event_manager: 1, volunteer: 60 });
    expect(hit.body.results[0].org.contactEmailMasked).toMatch(/\*\*\*/);
    expectNoRawPii(hit.text);

    const prefix = await get(`/search?q=${SLUG_A.slice(0, -1)}`);
    expect(prefix.body.results.filter((r: { kind: string }) => r.kind === "org")).toEqual([]);
  });

  it("5, 10: user detail is masked, includes memberships, and shows soft-deleted users", async (ctx) => {
    if (!available) ctx.skip(`no migrated database: ${skipReason}`);

    const member = await get(`/users/${MEMBER_ONLY.id}`);
    expect(member.status).toBe(200);
    expect(member.body.memberships.map((m: { organizationId: string }) => m.organizationId).sort()).toEqual(
      [ORG_A, ORG_B].sort(),
    );
    expectNoRawPii(member.text);
    const [row] = await auditRows(member.headers["x-request-id"] as string);
    expect(row).toMatchObject({ action: "user.view", target_type: "user", target_id: MEMBER_ONLY.id, organization_id: ORG_B });

    const deleted = await get(`/users/${DELETED.id}`);
    expect(deleted.status).toBe(200);
    expect(deleted.body.user.deletedAt).not.toBeNull();
    expectNoRawPii(deleted.text);
  });

  it("8: a non-UUID id is 400, an unknown UUID is 404 with no audit row", async (ctx) => {
    if (!available) ctx.skip(`no migrated database: ${skipReason}`);

    expect((await get("/users/not-a-uuid")).status).toBe(400);
    const missing = await get(`/users/${randomUUID()}`);
    expect(missing.status).toBe(404);
    expect(await auditRows(missing.headers["x-request-id"] as string)).toEqual([]);
  });

  it("5, 9: org users paginate every member exactly once, including an org_members-only member", async (ctx) => {
    if (!available) ctx.skip(`no migrated database: ${skipReason}`);

    const org = await get(`/orgs/${ORG_A}`);
    expect(org.status).toBe(200);
    expectNoRawPii(org.text);

    const seen: string[] = [];
    let cursor: string | null = null;
    let pages = 0;
    do {
      const res = await get(`/orgs/${ORG_A}/users?limit=25${cursor ? `&cursor=${cursor}` : ""}`);
      expect(res.status).toBe(200);
      expectNoRawPii(res.text);
      seen.push(...res.body.users.map((u: { id: string }) => u.id));
      cursor = res.body.nextCursor;
      pages++;
    } while (cursor && pages < 10);

    const expected = [PRIMARY, DELETED, MEMBER_ONLY, ...BIG_ORG_USERS].map((p) => p.id);
    expect(pages).toBe(3);
    expect(seen).toHaveLength(expected.length);
    expect(new Set(seen)).toEqual(new Set(expected));

    expect((await get(`/orgs/${ORG_A}/users?cursor=garbage`)).status).toBe(400);
  });

  it("11: an audit failure on user detail returns 503 with no user data", async (ctx) => {
    if (!available) ctx.skip(`no migrated database: ${skipReason}`);

    const res = await get(`/users/${PRIMARY.id}`, denied);
    expect(res.status).toBe(503);
    expect(res.body).toEqual({ error: "AUDIT_UNAVAILABLE" });
    expect(res.text).not.toContain(PRIMARY.id);
    expectNoRawPii(res.text);
  });

  it("6, 7: unmask needs a real reason, returns raw values once audited, and stops at 20 an hour", async (ctx) => {
    if (!available) ctx.skip(`no migrated database: ${skipReason}`);
    const app = appWith(audit);
    const unmask = async (reason: string) =>
      request(app)
        .post(`/ops-api/v1/users/${PRIMARY.id}/unmask`)
        .set("Cf-Access-Jwt-Assertion", await jwt())
        .send({ reason });

    const short = await unmask("123456789");
    expect(short.status).toBe(400);
    expect(await auditRows(short.headers["x-request-id"] as string)).toEqual([]);

    const ok = await unmask("Customer ticket 4411: login failing");
    expect(ok.status).toBe(200);
    expect(ok.body).toEqual({ email: PRIMARY.email, fullName: PRIMARY.fullName });
    const [row] = await auditRows(ok.headers["x-request-id"] as string);
    expect(row).toMatchObject({
      action: "user.unmask",
      target_id: PRIMARY.id,
      organization_id: ORG_A,
      reason: "Customer ticket 4411: login failing",
    });

    for (let i = 2; i <= 20; i++) expect((await unmask(`Customer ticket 4411 check ${i}`)).status).toBe(200);

    const limited = await unmask("Customer ticket 4411 one more");
    expect(limited.status).toBe(429);
    expect(limited.body).toEqual({ error: "UNMASK_LIMIT" });
    expect(await auditRows(limited.headers["x-request-id"] as string)).toEqual([]);
    const { rows } = await owner.query(
      "SELECT count(*)::int AS n FROM maintainer_access_log WHERE maintainer_id = $1 AND action = 'user.unmask'",
      [maintainerId],
    );
    expect(rows[0].n).toBe(20);
  });
});
