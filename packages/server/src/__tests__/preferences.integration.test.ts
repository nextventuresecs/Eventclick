import { describe, it, expect, vi, beforeEach } from "vitest";
import request from "supertest";
import { app } from "../app";
import { signAccessToken } from "../services/jwt.service";

vi.mock("rate-limit-redis", () => ({
  default: class MockRedisStore {
    increment() {
      return Promise.resolve({ total: 1, resetTime: new Date() });
    }
    decrement() {}
    resetKey() {}
  },
}));

// Existing row before either PATCH lands — used to prove the fix merges into
// this instead of discarding it.
const { existingPreferences, dbState } = vi.hoisted(() => ({
  existingPreferences: { notifyRoomCreated: true },
  dbState: { setArg: undefined as Record<string, unknown> | undefined },
}));

vi.mock("../db", async () => {
  const db = {
    select: vi.fn().mockReturnThis(),
    from: vi.fn().mockReturnThis(),
    where: vi.fn().mockReturnThis(),
    limit: vi.fn().mockResolvedValue([{ id: "user-1", preferences: existingPreferences }]),
    insert: vi.fn().mockReturnThis(),
    values: vi.fn().mockReturnThis(),
    update: vi.fn().mockReturnThis(),
    set: vi.fn(function (this: any, arg: Record<string, unknown>) {
      dbState.setArg = arg;
      return this;
    }),
    delete: vi.fn().mockReturnThis(),
    returning: vi.fn().mockImplementation(() =>
      Promise.resolve([{ id: "user-1", preferences: dbState.setArg?.preferences }]),
    ),
  };
  const pool = { query: vi.fn() };
  const { AsyncLocalStorage } = await import("node:async_hooks");
  return { db, pool, authDb: db, authPool: pool, tenantContextStorage: new AsyncLocalStorage() };
});

vi.mock("@sentry/node", () => ({
  init: vi.fn(),
  setupExpressErrorHandler: vi.fn(),
}));

vi.mock("../config/redis", () => ({
  redisClient: {
    set: vi.fn(),
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

describe("PATCH /api/v1/auth/preferences", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    dbState.setArg = undefined;
  });

  // orgId: null skips setTenantContext's RLS connection pinning (needs a real
  // pg pool.connect()), keeping this test scoped to the preferences merge logic.
  const token = signAccessToken({ sub: "user-1", role: "volunteer", orgId: null });

  it("merges a single toggle into existing preferences instead of overwriting them", async () => {
    const res = await request(app)
      .patch("/api/v1/auth/preferences")
      .set("Authorization", `Bearer ${token}`)
      .set("Origin", "http://localhost:3000")
      .send({ notifyAttendance: true });

    expect(res.status).toBe(200);
    expect(res.body.user.preferences).toEqual({
      notifyRoomCreated: true,
      notifyAttendance: true,
    });
  });
});
