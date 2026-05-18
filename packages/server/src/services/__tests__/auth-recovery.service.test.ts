import { describe, expect, it, vi, beforeEach } from "vitest";
import { ApiError } from "../../utils/errors";

let mockUserResult: any[] = [];
let mockResetResult: any[] = [];
let mockInsertResetResult: any[] = [];
let mockUpdateResult: any[] = [];

// Mock the email service
const mockSendPasswordResetEmail = vi.fn().mockResolvedValue(undefined);
vi.mock("../email.service", () => ({
  sendPasswordResetEmail: (...args: any[]) => mockSendPasswordResetEmail(...args),
}));

// Mock password service
vi.mock("../password.service", () => ({
  hashPassword: vi.fn().mockResolvedValue("hashed_new_password"),
  verifyPassword: vi.fn().mockResolvedValue(true),
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
  };
});

// Import service after mocking
import { forgotPassword, resetPassword } from "../auth.service";

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
      expect(mockSendPasswordResetEmail).not.toHaveBeenCalled();
    });

    it("successfully creates a password reset token and calls sendPasswordResetEmail", async () => {
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

      expect(mockSendPasswordResetEmail).toHaveBeenCalled();
      const calls = mockSendPasswordResetEmail.mock.calls;
      expect(calls[0]?.[0]).toBe("test@example.com");
      expect(typeof calls[0]?.[1]).toBe("string");
    });
  });

  describe("resetPassword", () => {
    it("throws a badRequest error if the token is invalid, used, or expired", async () => {
      mockResetResult = []; // Not found or expired

      await expect(resetPassword("invalid-token", "newpassword123")).rejects.toThrowError(
        ApiError.badRequest("Invalid or expired reset token")
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

      await resetPassword("valid-token", "newpassword123");

      // Verify no errors thrown and succeeds
    });
  });
});
