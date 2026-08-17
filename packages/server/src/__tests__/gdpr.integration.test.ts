import { describe, it, expect, vi, beforeEach } from "vitest";
import { AsyncLocalStorage } from "async_hooks";
import request from "supertest";
import { app } from "../index";
import { verifyAccessToken } from "../services/jwt.service";
import { recordAudit } from "../services/audit.service";
import { deleteUserAccount } from "../services/admin.service";

vi.mock("rate-limit-redis", () => ({
  default: class MockRedisStore {
    increment() {
      return Promise.resolve({ total: 1, resetTime: new Date() });
    }
    decrement() {}
    resetKey() {}
  },
}));

function makeChain(limitReturn?: any) {
  const chain: any = {};
  const methods = [
    "select",
    "from",
    "where",
    "insert",
    "values",
    "returning",
    "update",
    "set",
    "delete",
    "leftJoin",
    "inArray",
    "transaction",
  ];
  for (const method of methods) {
    chain[method] = vi.fn().mockReturnValue(chain);
  }
  if (limitReturn !== undefined) {
    chain.limit = vi.fn().mockReturnValue(limitReturn);
  } else {
    chain.limit = vi.fn().mockReturnValue(chain);
  }
  return chain;
}

vi.mock("../db", () => {
  const db = makeChain();
  // setTenantContext checks out a dedicated client per authenticated request
  // (BEGIN + SET LOCAL app.current_tenant), so the pool mock must support
  // connect() and hand back a client, not just query().
  const client = {
    query: vi.fn().mockResolvedValue({ rows: [] }),
    release: vi.fn(),
    on: vi.fn(),
  };
  const pool = { query: vi.fn(), connect: vi.fn().mockResolvedValue(client) };
  return {
    db,
    pool,
    authDb: db,
    authPool: pool,
    tenantContextStorage: new AsyncLocalStorage(),
  };
});

vi.mock("../config/redis", () => ({
  redisClient: {
    set: vi.fn(),
    setEx: vi.fn(),
    get: vi.fn(),
    del: vi.fn(),
    sendCommand: vi.fn().mockImplementation(async (args: any[]) => {
      if (args[0] === "SCRIPT" && args[1] === "LOAD") return "dummy_sha";
      return [1];
    }),
    duplicate: vi.fn().mockReturnValue({
      connect: vi.fn(),
      subscribe: vi.fn(),
      publish: vi.fn(),
      on: vi.fn(),
    }),
    isOpen: true,
  },
  connectRedis: vi.fn(),
  disconnectRedis: vi.fn(),
}));

vi.mock("@sentry/node", () => ({
  init: vi.fn(),
  setupExpressErrorHandler: vi.fn(),
}));

vi.mock("../services/jwt.service", () => ({
  verifyAccessToken: vi.fn(),
  signAccessToken: vi.fn(),
}));

vi.mock("../services/admin.service", () => ({
  deleteUserAccount: vi.fn(),
}));

vi.mock("../services/audit.service", () => ({
  recordAudit: vi.fn().mockResolvedValue(undefined),
}));

const authHeader = {
  authorization: `Bearer test-token`,
  origin: "http://localhost:3000",
};

describe("GDPR Profile Endpoints", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("GET /api/v1/profile/me/export", () => {
    it("requires authentication", async () => {
      const res = await request(app).get("/api/v1/profile/me/export");
      expect([401, 403]).toContain(res.status);
    });

    it("returns 400 when user has no organization", async () => {
      vi.mocked(verifyAccessToken).mockReturnValueOnce({
        sub: "user-123",
        role: "volunteer",
        orgId: null,
      });

      const res = await request(app)
        .get("/api/v1/profile/me/export")
        .set(authHeader);

      expect(res.status).toBe(400);
      expect(res.body).toHaveProperty("message");
      expect(res.body.message).toContain("organization");
    });

    it("returns 200 and records audit log when user has organization", async () => {
      vi.mocked(verifyAccessToken).mockReturnValueOnce({
        sub: "user-123",
        role: "volunteer",
        orgId: "org-123",
      });

      const userChain = makeChain([{
        id: "user-123",
        email: "test@example.com",
        fullName: "Test User",
        role: "volunteer",
        organizationId: "org-123",
        passwordHash: "hashed",
        twoFactorSecret: "secret",
        isActive: true,
        emailVerifiedAt: new Date(),
        createdAt: new Date(),
        updatedAt: new Date(),
      }]);
      const membershipChain = makeChain([]);
      membershipChain.where = vi.fn().mockReturnValue([]);
      const roomChain = makeChain([{ id: "room-1" }]);
      roomChain.where = vi.fn().mockReturnValue([{ id: "room-1" }]);
      const attendanceChain = makeChain([]);
      attendanceChain.where = vi.fn().mockReturnValue([]);
      const submissionsChain = makeChain([]);
      submissionsChain.where = vi.fn().mockReturnValue([]);
      const photosChain = makeChain([]);
      photosChain.where = vi.fn().mockReturnValue([]);

      const { db } = await import("../db");
      (db.select as any)
        .mockReturnValueOnce(userChain)
        .mockReturnValueOnce(membershipChain)
        .mockReturnValueOnce(roomChain)
        .mockReturnValueOnce(attendanceChain)
        .mockReturnValueOnce(submissionsChain)
        .mockReturnValueOnce(photosChain);

      const res = await request(app)
        .get("/api/v1/profile/me/export")
        .set(authHeader);

      expect(res.status).toBe(200);
      expect(res.headers["content-disposition"]).toContain(
        "eventclick-export-user-123.json",
      );
      expect(res.body).toHaveProperty("exportedAt");
      expect(res.body).toHaveProperty("user");
      expect(res.body.user).not.toHaveProperty("passwordHash");
      expect(res.body.user).not.toHaveProperty("twoFactorSecret");
      expect(recordAudit).toHaveBeenCalledWith(
        expect.objectContaining({
          action: "user.updated",
          resourceType: "user_export",
          actorUserId: "user-123",
        }),
      );
    });
  });

  describe("DELETE /api/v1/profile/me/account", () => {
    it("requires authentication", async () => {
      const res = await request(app).delete("/api/v1/profile/me/account");
      expect([401, 403]).toContain(res.status);
    });

    it("returns 400 when user has no organization", async () => {
      vi.mocked(verifyAccessToken).mockReturnValueOnce({
        sub: "user-123",
        role: "volunteer",
        orgId: null,
      });

      const res = await request(app)
        .delete("/api/v1/profile/me/account")
        .set(authHeader)
        .send({ confirmEmail: "test@example.com" });

      expect(res.status).toBe(400);
      expect(res.body).toHaveProperty("message");
      expect(res.body.message).toContain("organization");
    });

    it("delegates to deleteUserAccount service and clears refresh cookie", async () => {
      vi.mocked(verifyAccessToken).mockReturnValueOnce({
        sub: "user-123",
        role: "volunteer",
        orgId: "org-123",
      });

      vi.mocked(deleteUserAccount).mockResolvedValue({
        success: true,
        message: "User account deleted successfully",
      });

      const res = await request(app)
        .delete("/api/v1/profile/me/account")
        .set(authHeader)
        .send({ confirmEmail: "test@example.com" });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.message).toContain("deleted");
      expect(res.headers["set-cookie"]).toBeDefined();
      const cookieHeader = (res.headers["set-cookie"] as unknown as string[]).find((c: string) =>
        c.startsWith("Eventclick_rt="),
      );
      expect(cookieHeader).toBeDefined();
      expect(cookieHeader).toContain("Expires=Thu, 01 Jan 1970");
      expect(deleteUserAccount).toHaveBeenCalledWith(
        "user-123",
        "volunteer",
        "org-123",
        "user-123",
        "test@example.com",
        expect.any(Object),
      );
    });
  });
});
