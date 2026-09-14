import { describe, it, expect, vi, beforeAll } from "vitest";
import express from "express";
import request from "supertest";
import { createHash } from "crypto";
import { SignJWT, generateKeyPair, exportJWK, createLocalJWKSet, type JWK } from "jose";
import { createRequireMaintainer, type MaintainerLookup } from "../middleware/requireMaintainer";

const TEAM = "https://nvces.cloudflareaccess.com";
const AUD = "ops-aud-tag";
const EMAIL = "Maint@NVCES.test";
const ROW = { id: "7d5b3c1e-0000-4000-8000-000000000001", email: "maint@nvces.test", display_name: "Maint" };

let signingKey: CryptoKey;
let otherKey: CryptoKey;
let keys: ReturnType<typeof createLocalJWKSet>;

beforeAll(async () => {
  const pair = await generateKeyPair("RS256");
  const other = await generateKeyPair("RS256");
  signingKey = pair.privateKey;
  otherKey = other.privateKey;
  const jwk: JWK = { ...(await exportJWK(pair.publicKey)), kid: "k1", alg: "RS256" };
  keys = createLocalJWKSet({ keys: [jwk] });
});

type Claims = Record<string, unknown>;

const sign = (
  claims: Claims = { email: EMAIL },
  opts: { key?: CryptoKey; iss?: string; aud?: string; exp?: string | number } = {},
) =>
  new SignJWT(claims)
    .setProtectedHeader({ alg: "RS256", kid: "k1" })
    .setIssuer(opts.iss ?? TEAM)
    .setAudience(opts.aud ?? AUD)
    .setIssuedAt()
    .setExpirationTime(opts.exp ?? "5m")
    .sign(opts.key ?? signingKey);

const makeLogger = () => ({ warn: vi.fn(), error: vi.fn() });

function build(options: { bypassEmail?: string; lookup?: MaintainerLookup } = {}) {
  const logger = makeLogger();
  const query = vi.fn(async () => ({ rows: [ROW] }));
  const pool = options.lookup ?? { query };
  const app = express();
  app.use(
    createRequireMaintainer({
      pool,
      logger,
      bypassEmail: options.bypassEmail,
      teamDomain: TEAM,
      audience: AUD,
      keys,
    }),
  );
  app.get("/probe", (req, res) => {
    res.json({ maintainer: req.maintainer });
  });
  return { app, logger, query: (pool as { query: typeof query }).query };
}

describe("requireMaintainer", () => {
  it("accepts a valid Access token and looks the maintainer up by lowercased email, every request", async () => {
    const { app, query } = build();
    const token = await sign();

    for (let i = 0; i < 2; i++) {
      const res = await request(app).get("/probe").set("Cf-Access-Jwt-Assertion", token);
      expect(res.status).toBe(200);
      expect(res.body.maintainer).toEqual({ id: ROW.id, email: ROW.email, displayName: ROW.display_name });
    }
    expect(query).toHaveBeenCalledTimes(2);
    expect(query).toHaveBeenLastCalledWith(expect.stringContaining("is_active"), ["maint@nvces.test"]);
  });

  it("uses the bypass email without a token when configured", async () => {
    const { app, query } = build({ bypassEmail: "maint@nvces.test" });
    const res = await request(app).get("/probe");
    expect(res.status).toBe(200);
    expect(query).toHaveBeenCalledWith(expect.any(String), ["maint@nvces.test"]);
  });

  it("returns 401 when the Access header is missing", async () => {
    const { app, query } = build();
    const res = await request(app).get("/probe");
    expect(res.status).toBe(401);
    expect(res.body).toEqual({ error: "UNAUTHENTICATED" });
    expect(query).not.toHaveBeenCalled();
  });

  const invalid: Array<[string, () => Promise<string>]> = [
    ["wrong audience", () => sign(undefined, { aud: "someone-else" })],
    ["wrong issuer", () => sign(undefined, { iss: "https://evil.cloudflareaccess.com" })],
    ["expired", () => sign(undefined, { exp: Math.floor(Date.now() / 1000) - 600 })],
    ["signed by a different key", () => sign(undefined, { key: otherKey })],
    [
      "alg none",
      async () => {
        const enc = (o: object) => Buffer.from(JSON.stringify(o)).toString("base64url");
        const now = Math.floor(Date.now() / 1000);
        return `${enc({ alg: "none", typ: "JWT" })}.${enc({ email: EMAIL, iss: TEAM, aud: AUD, iat: now, exp: now + 300 })}.`;
      },
    ],
    ["missing email claim", () => sign({ sub: "no-email" })],
  ];

  it.each(invalid)("returns 401 for a token with %s, without logging the token", async (_name, make) => {
    const { app, logger, query } = build();
    const token = await make();
    const res = await request(app).get("/probe").set("Cf-Access-Jwt-Assertion", token);
    expect(res.status).toBe(401);
    expect(res.body).toEqual({ error: "UNAUTHENTICATED" });
    expect(query).not.toHaveBeenCalled();
    expect(logger.warn).toHaveBeenCalled();
    expect(JSON.stringify(logger.warn.mock.calls)).not.toContain(token);
  });

  it("returns 403 when the email is not an active maintainer, logging only a hash", async () => {
    const lookup = { query: vi.fn(async () => ({ rows: [] })) };
    const { app, logger } = build({ lookup });
    const res = await request(app).get("/probe").set("Cf-Access-Jwt-Assertion", await sign());
    expect(res.status).toBe(403);
    expect(res.body).toEqual({ error: "FORBIDDEN" });
    const logged = JSON.stringify(logger.warn.mock.calls);
    expect(logged).toContain(createHash("sha256").update("maint@nvces.test").digest("hex"));
    expect(logged.toLowerCase()).not.toContain("maint@nvces.test");
  });

  it("returns 503 when the maintainer lookup fails", async () => {
    const lookup = { query: vi.fn(async () => Promise.reject(new Error("connection refused"))) };
    const { app } = build({ lookup });
    const res = await request(app).get("/probe").set("Cf-Access-Jwt-Assertion", await sign());
    expect(res.status).toBe(503);
    expect(res.body).toEqual({ error: "AUTH_UNAVAILABLE" });
  });
});
