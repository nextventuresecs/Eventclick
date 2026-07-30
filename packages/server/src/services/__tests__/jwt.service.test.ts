import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock env before importing the module under test
vi.mock("../../config/env", () => ({
  env: {
    JWT_SECRET: "test-jwt-secret-at-least-16",
    JWT_ACCESS_TTL: "15m",
  },
}));

import { signAccessToken, verifyAccessToken } from "../jwt.service";

describe("jwt.service", () => {
  describe("signAccessToken", () => {
    it("returns a signed JWT string", () => {
      const token = signAccessToken({
        sub: "user-123",
        role: "event_manager",
        orgId: "org-456",
      });
      expect(typeof token).toBe("string");
      expect(token.split(".")).toHaveLength(3);
    });

    it("embeds the correct claims", () => {
      const token = signAccessToken({
        sub: "user-123",
        role: "volunteer",
        orgId: null,
      });
      const claims = verifyAccessToken(token);
      expect(claims.sub).toBe("user-123");
      expect(claims.role).toBe("volunteer");
      expect(claims.orgId).toBeNull();
    });
  });

  describe("verifyAccessToken", () => {
    it("round-trips sign → verify", () => {
      const token = signAccessToken({
        sub: "u1",
        role: "event_manager",
        orgId: "o1",
      });
      const decoded = verifyAccessToken(token);
      expect(decoded.sub).toBe("u1");
      expect(decoded.role).toBe("event_manager");
      expect(decoded.orgId).toBe("o1");
    });

    it("throws on a tampered token", () => {
      const token = signAccessToken({
        sub: "u1",
        role: "volunteer",
        orgId: null,
      });
      // Tamper with the payload section
      const parts = token.split(".");
      parts[1] = parts[1]! + "x";
      const tampered = parts.join(".");
      expect(() => verifyAccessToken(tampered)).toThrow();
    });

    it("throws on a completely invalid token", () => {
      expect(() => verifyAccessToken("garbage.token.here")).toThrow();
    });
  });
});
