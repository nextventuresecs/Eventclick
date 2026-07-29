import { describe, it, expect, vi, beforeEach } from "vitest";
import { loginUser } from "../services/auth/auth-login.service";

vi.mock("../db", () => {
  const eq = (...args: any[]) => ({ type: "eq", args });
  return {
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
    },
    pool: {
      query: vi.fn(),
    },
    eq,
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

describe("Auth Service Integration Tests", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("rejects login when user does not exist", async () => {
    const { db } = await import("../db");
    vi.mocked((db as any).limit).mockResolvedValueOnce([]);

    await expect(
      loginUser({ email: "wrong@test.com", password: "password123" }, {
        userAgent: "test",
        ipAddress: "127.0.0.1",
      })
    ).rejects.toMatchObject({ statusCode: 401 });
  });
});
