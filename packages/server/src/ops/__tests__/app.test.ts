import { describe, it, expect, vi, beforeAll, afterAll } from "vitest";
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from "fs";
import { tmpdir } from "os";
import path from "path";
import request from "supertest";
import { pino } from "pino";
import { SignJWT, generateKeyPair, exportJWK, createLocalJWKSet } from "jose";
import { createOpsApp } from "../app";

const TEAM = "https://nvces.cloudflareaccess.com";
const AUD = "ops-aud-tag";
const MAINTAINER_ROW = { id: "7d5b3c1e-0000-4000-8000-000000000001", email: "maint@nvces.test", display_name: "Maint" };

let staticDir: string;
let privateKey: CryptoKey;
let keys: ReturnType<typeof createLocalJWKSet>;

beforeAll(async () => {
  staticDir = mkdtempSync(path.join(tmpdir(), "ops-static-"));
  mkdirSync(path.join(staticDir, "assets"));
  writeFileSync(path.join(staticDir, "index.html"), "<!doctype html><title>Ops Console</title>");
  writeFileSync(path.join(staticDir, "assets", "app-abc123.js"), "console.log('ops')");

  const pair = await generateKeyPair("RS256");
  privateKey = pair.privateKey;
  keys = createLocalJWKSet({ keys: [{ ...(await exportJWK(pair.publicKey)), kid: "k1", alg: "RS256" }] });
});

afterAll(() => rmSync(staticDir, { recursive: true, force: true }));

const token = (email: string) =>
  new SignJWT({ email })
    .setProtectedHeader({ alg: "RS256", kid: "k1" })
    .setIssuer(TEAM)
    .setAudience(AUD)
    .setIssuedAt()
    .setExpirationTime("5m")
    .sign(privateKey);

function build(isMaintainer = true) {
  const readPool = {
    query: vi.fn(async () => ({ rows: isMaintainer ? [MAINTAINER_ROW] : [] })),
  };
  const auditPool = { query: vi.fn(async () => ({ rows: [] })) };
  const app = createOpsApp({
    env: {
      NODE_ENV: "production",
      CF_ACCESS_TEAM_DOMAIN: TEAM,
      CF_ACCESS_AUD: AUD,
      OPS_STATIC_DIR: staticDir,
      SENTRY_RELEASE: "abc1234",
      OPS_AUTH_BYPASS_EMAIL: undefined,
    },
    readPool,
    auditPool,
    logger: pino({ level: "silent" }),
    keys,
  });
  return { app, readPool, auditPool };
}

describe("ops app", () => {
  it("serves healthz without auth, a database call or an audit row", async () => {
    const { app, readPool, auditPool } = build();
    const res = await request(app).get("/ops-api/v1/healthz");
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ status: "ok" });
    expect(res.headers["cache-control"]).toBe("no-store");
    expect(readPool.query).not.toHaveBeenCalled();
    expect(auditPool.query).not.toHaveBeenCalled();
  });

  it("returns 401 on whoami without the Access header", async () => {
    const { app } = build();
    const res = await request(app).get("/ops-api/v1/whoami");
    expect(res.status).toBe(401);
    expect(res.headers["cache-control"]).toBe("no-store");
  });

  it("answers whoami for a maintainer, with the release and a cf-ray request id", async () => {
    const { app, auditPool } = build();
    const res = await request(app)
      .get("/ops-api/v1/whoami")
      .set("Cf-Access-Jwt-Assertion", await token("maint@nvces.test"))
      .set("cf-ray", "8a1b2c3d4e5f6a7b-BOM");
    expect(res.status).toBe(200);
    expect(res.body.maintainer).toEqual({ id: MAINTAINER_ROW.id, email: MAINTAINER_ROW.email, displayName: "Maint" });
    expect(res.body.release).toBe("abc1234");
    expect(Number.isNaN(Date.parse(res.body.serverTime))).toBe(false);
    expect(res.headers["x-request-id"]).toBe("8a1b2c3d4e5f6a7b-BOM");
    expect(auditPool.query).toHaveBeenCalledTimes(1);
  });

  it("ignores a cf-ray that is not a plausible ray id", async () => {
    const { app } = build();
    const res = await request(app)
      .get("/ops-api/v1/whoami")
      .set("Cf-Access-Jwt-Assertion", await token("maint@nvces.test"))
      .set("cf-ray", "x".repeat(65));
    expect(res.headers["x-request-id"]).toMatch(/^[A-Za-z0-9_-]{12}$/);
  });

  it("returns 404 JSON for an unknown ops-api route after auth", async () => {
    const { app } = build();
    const res = await request(app)
      .get("/ops-api/v1/nope")
      .set("Cf-Access-Jwt-Assertion", await token("maint@nvces.test"));
    expect(res.status).toBe(404);
    expect(res.body).toEqual({ error: "NOT_FOUND" });
    expect(res.headers["cache-control"]).toBe("no-store");
  });

  it("does not serve the bundle to a non-maintainer", async () => {
    const { app } = build(false);
    const auth = await token("stranger@nvces.test");
    const root = await request(app).get("/").set("Cf-Access-Jwt-Assertion", auth);
    expect(root.status).toBe(403);
    expect(root.text).not.toContain("Ops Console");
    const asset = await request(app).get("/assets/app-abc123.js").set("Cf-Access-Jwt-Assertion", auth);
    expect(asset.status).toBe(403);
    const whoami = await request(app).get("/ops-api/v1/whoami").set("Cf-Access-Jwt-Assertion", auth);
    expect(whoami.status).toBe(403);
  });

  it("does not serve the bundle without the Access header", async () => {
    const { app } = build();
    const res = await request(app).get("/");
    expect(res.status).toBe(401);
  });

  it("serves the SPA shell to a maintainer with the security headers and no-cache", async () => {
    const { app } = build();
    const auth = await token("maint@nvces.test");
    const res = await request(app).get("/users/123").set("Cf-Access-Jwt-Assertion", auth);
    expect(res.status).toBe(200);
    expect(res.text).toContain("Ops Console");
    expect(res.headers["cache-control"]).toBe("no-cache");
    expect(res.headers["content-security-policy"]).toBe(
      "default-src 'self';script-src 'self';style-src 'self';img-src 'self' data:;connect-src 'self';frame-ancestors 'none';base-uri 'none';form-action 'self'",
    );
    expect(res.headers["x-frame-options"]).toBe("DENY");
    expect(res.headers["referrer-policy"]).toBe("no-referrer");

    const asset = await request(app).get("/assets/app-abc123.js").set("Cf-Access-Jwt-Assertion", auth);
    expect(asset.status).toBe(200);
    expect(asset.headers["cache-control"]).toBe("public, max-age=3600");
  });

  it("rate limits a maintainer at 120 requests a minute", async () => {
    const { app } = build();
    const auth = await token("maint@nvces.test");
    let last = 0;
    for (let i = 0; i < 121; i++) {
      last = (await request(app).get("/ops-api/v1/whoami").set("Cf-Access-Jwt-Assertion", auth)).status;
    }
    expect(last).toBe(429);
  });
});
