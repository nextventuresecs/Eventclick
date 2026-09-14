import { describe, it, expect, vi } from "vitest";
import express, { type NextFunction, type Request, type Response } from "express";
import request from "supertest";
import { z } from "zod";
import { createRespondAudited, type AuditPool, type AuditedRead } from "../audit";
import { opsErrorHandler } from "../errors";

const MAINTAINER = { id: "7d5b3c1e-0000-4000-8000-000000000001", email: "maint@nvces.test", displayName: "Maint" };

function build(options: { auditPool: AuditPool; read: AuditedRead<unknown> }) {
  const logger = { error: vi.fn(), warn: vi.fn() };
  const respondAudited = createRespondAudited({ pool: options.auditPool, logger });
  const app = express();
  app.use((req: Request, _res: Response, next: NextFunction) => {
    (req as Request & { id: string }).id = "req-123";
    req.maintainer = MAINTAINER;
    next();
  });
  app.get("/probe", (req, res) =>
    respondAudited(req, res, { action: "session.whoami" }, options.read),
  );
  app.use(opsErrorHandler({ logger, production: true }));
  return { app, logger };
}

describe("respondAudited", () => {
  it("reads, then writes the audit row, then responds", async () => {
    const order: string[] = [];
    const auditPool = {
      query: vi.fn(async () => {
        order.push("audit");
        return { rows: [] };
      }),
    };
    const { app } = build({
      auditPool,
      read: async () => {
        order.push("read");
        return { body: { ok: true }, resultCount: 1 };
      },
    });

    const res = await request(app)
      .get("/probe")
      .set("cf-connecting-ip", "203.0.113.9")
      .set("user-agent", "probe-agent");

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ ok: true });
    expect(order).toEqual(["read", "audit"]);
    const [sql, values] = auditPool.query.mock.calls[0] as unknown as [string, unknown[]];
    expect(sql).toMatch(/^INSERT INTO maintainer_access_log/);
    expect(values).toEqual([
      MAINTAINER.id,
      MAINTAINER.email,
      "session.whoami",
      null,
      null,
      null,
      null,
      null,
      1,
      "req-123",
      "203.0.113.9",
      "probe-agent",
    ]);
  });

  it("returns 503 AUDIT_UNAVAILABLE and discards the body when the audit insert fails", async () => {
    const auditPool = { query: vi.fn(async () => Promise.reject(Object.assign(new Error("denied"), { code: "42501" }))) };
    const { app, logger } = build({
      auditPool,
      read: async () => ({ body: { secret: "maint@nvces.test" } }),
    });

    const res = await request(app).get("/probe");
    expect(res.status).toBe(503);
    expect(res.body).toEqual({ error: "AUDIT_UNAVAILABLE" });
    expect(res.text).not.toContain("maint@nvces.test");
    expect(logger.error).toHaveBeenCalled();
  });

  it("writes no audit row when the read fails and returns a message-free 500", async () => {
    const auditPool = { query: vi.fn(async () => ({ rows: [] })) };
    const { app } = build({
      auditPool,
      read: async () => {
        throw new Error("relation users does not exist");
      },
    });

    const res = await request(app).get("/probe");
    expect(res.status).toBe(500);
    expect(res.body).toEqual({ error: "INTERNAL" });
    expect(auditPool.query).not.toHaveBeenCalled();
  });

  it("lets the read supply audit fields it discovers, such as the target's organisation", async () => {
    const auditPool = { query: vi.fn(async () => ({ rows: [] })) };
    const { app } = build({
      auditPool,
      read: async () => ({
        body: { ok: true },
        resultCount: 1,
        audit: { targetType: "user", targetId: "u-1", organizationId: "o-1" },
      }),
    });

    expect((await request(app).get("/probe")).status).toBe(200);
    const [, values] = auditPool.query.mock.calls[0] as unknown as [string, unknown[]];
    expect(values.slice(2, 6)).toEqual(["session.whoami", "user", "u-1", "o-1"]);
  });

  it("maps a not-found read to 404 and writes no audit row", async () => {
    const auditPool = { query: vi.fn(async () => ({ rows: [] })) };
    const { app } = build({
      auditPool,
      read: async () => {
        throw Object.assign(new Error("no such user"), { status: 404 });
      },
    });

    const res = await request(app).get("/probe");
    expect(res.status).toBe(404);
    expect(res.body).toEqual({ error: "NOT_FOUND" });
    expect(auditPool.query).not.toHaveBeenCalled();
  });

  it("maps a zod validation error to 400 VALIDATION_ERROR", async () => {
    const auditPool = { query: vi.fn(async () => ({ rows: [] })) };
    const { app } = build({
      auditPool,
      read: async () => {
        z.object({ id: z.uuid() }).parse({ id: "nope" });
        return { body: {} };
      },
    });

    const res = await request(app).get("/probe");
    expect(res.status).toBe(400);
    expect(res.body).toEqual({ error: "VALIDATION_ERROR" });
  });

  it("maps a statement timeout to 504 QUERY_TIMEOUT", async () => {
    const auditPool = { query: vi.fn(async () => ({ rows: [] })) };
    const { app } = build({
      auditPool,
      read: async () => {
        throw Object.assign(new Error("canceling statement due to statement timeout"), { code: "57014" });
      },
    });

    const res = await request(app).get("/probe");
    expect(res.status).toBe(504);
    expect(res.body).toEqual({ error: "QUERY_TIMEOUT" });
    expect(auditPool.query).not.toHaveBeenCalled();
  });
});
