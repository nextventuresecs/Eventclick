import { describe, it, expect, vi, beforeEach } from "vitest";
import request from "supertest";
import { app } from "../index";
import { verifyAccessToken } from "../services/jwt.service";

vi.mock("rate-limit-redis", () => ({
  default: class MockRedisStore {
    increment() {
      return Promise.resolve({ total: 1, resetTime: new Date() });
    }
    decrement() {}
    resetKey() {}
  },
}));

vi.mock("../db", () => ({
  db: {
    select: vi.fn().mockReturnThis(),
    from: vi.fn().mockReturnThis(),
    where: vi.fn().mockReturnThis(),
    limit: vi.fn().mockReturnThis(),
    insert: vi.fn().mockReturnThis(),
    values: vi.fn().mockReturnThis(),
    returning: vi.fn().mockReturnThis(),
    update: vi.fn().mockReturnThis(),
    set: vi.fn().mockReturnThis(),
    delete: vi.fn().mockReturnThis(),
    leftJoin: vi.fn().mockReturnThis(),
    inArray: vi.fn().mockReturnThis(),
  },
  pool: {
    query: vi.fn(),
  },
}));

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
  verifyAccessToken: vi.fn().mockReturnValue({
    sub: "user-123",
    role: "volunteer",
    orgId: "org-123",
  }),
  signAccessToken: vi.fn(),
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
    });
  });
});
