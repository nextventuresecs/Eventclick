import { describe, it, expect, vi, beforeEach } from "vitest";

let mockVerifyReqResult: any[] = [];

vi.mock("../../../db", () => ({
  authDb: {
    update: () => ({
      set: () => ({
        where: () => ({
          returning: () => Promise.resolve(mockVerifyReqResult),
        }),
      }),
    }),
  },
}));

const mockFindUserById = vi.fn();
const mockIssueTokensFor = vi.fn();
vi.mock("../auth-helpers", () => ({
  invalidateUserCache: vi.fn().mockResolvedValue(undefined),
  findUserById: (...args: unknown[]) => mockFindUserById(...args),
  issueTokensFor: (...args: unknown[]) => mockIssueTokensFor(...args),
  toAuthUser: vi.fn(),
  slugify: vi.fn(),
}));

vi.mock("../../../db/schema", () => ({
  users: "users-table",
  organizations: "organizations-table",
  orgMembers: "org-members-table",
  emailVerifications: "email-verifications-table",
}));

import { verifyEmailToken } from "../auth-registration.service";

describe("verifyEmailToken — passwordSetupRequired (#70)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockVerifyReqResult = [{ id: "ver-1", userId: "user-1" }];
    mockIssueTokensFor.mockResolvedValue({
      user: { id: "user-1" },
      accessToken: "access-tok",
      refreshToken: "refresh-tok",
    });
  });

  it("is true for a USER_INVITED user with no password set yet", async () => {
    mockFindUserById.mockResolvedValue({ id: "user-1", passwordHash: null });

    const result = await verifyEmailToken("raw-token", { userAgent: null, ipAddress: null });

    expect(result.passwordSetupRequired).toBe(true);
  });

  it("is false for a normal self-registered user who already has a password", async () => {
    mockFindUserById.mockResolvedValue({ id: "user-1", passwordHash: "already-hashed" });

    const result = await verifyEmailToken("raw-token", { userAgent: null, ipAddress: null });

    expect(result.passwordSetupRequired).toBe(false);
  });

  it("still returns a working AuthResult alongside the flag", async () => {
    mockFindUserById.mockResolvedValue({ id: "user-1", passwordHash: null });

    const result = await verifyEmailToken("raw-token", { userAgent: null, ipAddress: null });

    expect(result.accessToken).toBe("access-tok");
    expect(result.refreshToken).toBe("refresh-tok");
  });
});
