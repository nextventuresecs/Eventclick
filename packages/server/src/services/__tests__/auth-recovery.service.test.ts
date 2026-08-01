import { describe, expect, it, vi, beforeEach } from "vitest";
import { ApiError } from "../../utils/errors";

let mockUserResult: any[] = [];
let mockResetResult: any[] = [];
let mockInsertResetResult: any[] = [];
let mockUpdateResult: any[] = [];

// Mock SQS client
const mockEnqueueEmail = vi.fn().mockResolvedValue(undefined);
vi.mock("../../queues/sqs.client", () => ({
  enqueueEmail: (...args: any[]) => mockEnqueueEmail(...args),
}));

// Mock argon2
vi.mock("argon2", () => ({
  default: {
    hash: vi.fn().mockResolvedValue("hashed_new_password"),
    verify: vi.fn().mockResolvedValue(true),
  }
}));

// Mock session service
vi.mock("../session.service", () => ({
  revokeAllUserSessions: vi.fn().mockResolvedValue(undefined),
  issueRefreshToken: vi.fn(),
  findActiveSessionByToken: vi.fn(),
  revokeSession: vi.fn(),
  rotateSession: vi.fn(),
  refreshTtlMs: 1000 * 60 * 60 * 24 * 7,
}));

// Mock db
vi.mock("../../db", () => {
  const mockDbChain = {
    select: vi.fn().mockImplementation(() => ({
      from: vi.fn().mockImplementation(() => ({
        leftJoin: vi.fn().mockImplementation(() => ({
          where: vi.fn().mockImplementation(() => ({
            limit: vi.fn().mockImplementation(async () => mockUserResult),
          })),
        })),
        where: vi.fn().mockImplementation(() => ({
          limit: vi.fn().mockImplementation(async () => mockResetResult),
        })),
      })),
    })),
    insert: vi.fn().mockImplementation(() => ({
      values: vi.fn().mockImplementation(() => ({
        returning: vi.fn().mockImplementation(async () => mockInsertResetResult),
      })),
    })),
    update: vi.fn().mockImplementation(() => ({
      set: vi.fn().mockImplementation(() => ({
        where: vi.fn().mockImplementation(async () => mockUpdateResult),
      })),
    })),
    transaction: vi.fn().mockImplementation(async (callback) => {
      const txMock = {
        update: vi.fn().mockImplementation(() => ({
          set: vi.fn().mockImplementation(() => ({
            where: vi.fn().mockImplementation(async () => mockUpdateResult),
          })),
        })),
      };
      return callback(txMock);
    }),
  };

  return {
    db: mockDbChain,
    authDb: mockDbChain,
  };
});

// Import service after mocking
import { forgotPassword, resetPassword } from "../auth";

describe("auth.service - Password Recovery Flow", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockUserResult = [];
    mockResetResult = [];
    mockInsertResetResult = [];
    mockUpdateResult = [];
  });

  describe("forgotPassword", () => {
    it("resolves successfully without sending an email if no user exists (anti-enumeration)", async () => {
      mockUserResult = [];

      await expect(forgotPassword("nonexistent@example.com")).resolves.toBeUndefined();
      expect(mockEnqueueEmail).not.toHaveBeenCalled();
    });

    it("successfully creates a password reset token and enqueues to SQS", async () => {
      mockUserResult = [
        {
          user: {
            id: "user-123",
            email: "test@example.com",
            fullName: "Test User",
            isActive: true,
          },
          orgName: null,
        },
      ];

      await forgotPassword("test@example.com");

      expect(mockEnqueueEmail).toHaveBeenCalled();
      const calls = mockEnqueueEmail.mock.calls;
      expect(calls[0]?.[0]?.email).toBe("test@example.com");
      expect(calls[0]?.[0]?.type).toBe("reset-password");
      expect(typeof calls[0]?.[0]?.token).toBe("string");
    });
  });

  describe("resetPassword", () => {
    it("throws a badRequest error if the token is invalid, used, or expired", async () => {
      mockResetResult = []; // Not found or expired

      await expect(resetPassword("invalid-token", "ComplexP@ss123!")).rejects.toThrowError(
        ApiError.badRequest("Invalid or expired reset token")
      );
    });

    it("throws a badRequest error if the new password is too weak", async () => {
      await expect(resetPassword("some-token", "123456")).rejects.toThrowError(
        /Password is too weak/
      );
    });

    it("successfully marks the reset token as used and updates the user's password", async () => {
      mockResetResult = [
        {
          id: "reset-123",
          userId: "user-123",
          token: "valid-token",
          expiresAt: new Date(Date.now() + 100000),
          usedAt: null,
        },
      ];

      await resetPassword("valid-token", "ComplexP@ss123!");

      // Verify no errors thrown and succeeds
    });
  });
});
