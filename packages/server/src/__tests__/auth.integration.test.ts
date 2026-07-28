import { describe, it, expect, vi, beforeEach } from "vitest";
import request from "supertest";
import { app } from "../index";
import { db } from "../db";

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
  },
  pool: {
    query: vi.fn(),
  },
}));

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
      return 1;
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

describe("Auth Integration Tests", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("should fail login with invalid credentials", async () => {
    // Mock db to return empty
    vi.mocked((db as any).limit).mockResolvedValueOnce([]);

    const response = await request(app)
      .post("/api/v1/auth/login")
      .send({ email: "wrong@test.com", password: "password123" });

    expect(response.status).toBe(401);
  });
});
