import { describe, it, expect, vi } from "vitest";
import type { User } from "../../db/schema";
import { toAuthUser } from "../auth/auth-helpers";

vi.mock("../../db", () => ({
  authDb: {},
  db: {},
  pool: {},
  authPool: {},
}));

vi.mock("../../config/redis", () => ({
  redisClient: { isOpen: false, get: vi.fn(), setEx: vi.fn(), del: vi.fn() },
}));

// Every field on the User row that toAuthUser is expected to forward into
// AuthUser. Regression guard for the class of bug where toAuthUser silently
// drops a field (organizationDescription/organizationLogoUrl were dropped via
// missing call-site args; preferences was missing from the object literal
// entirely) so it never survives login/refresh/`/auth/me`.
const fakeUser = {
  id: "user-1",
  email: "user@example.com",
  fullName: "Test User",
  role: "admin",
  organizationId: "org-1",
  emailVerifiedAt: new Date("2026-01-01T00:00:00Z"),
  preferences: { notifyRoomCreated: false, notifyLiveStart: true, notifyAttendance: true },
} as unknown as User;

describe("toAuthUser", () => {
  it("forwards preferences from the user row", () => {
    const result = toAuthUser(fakeUser, "Acme", "About Acme", "https://logo.example/acme.png");
    expect(result.preferences).toEqual(fakeUser.preferences);
  });

  it("forwards organization name/description/logo when supplied", () => {
    const result = toAuthUser(fakeUser, "Acme", "About Acme", "https://logo.example/acme.png");
    expect(result.organizationName).toBe("Acme");
    expect(result.organizationDescription).toBe("About Acme");
    expect(result.organizationLogoUrl).toBe("https://logo.example/acme.png");
  });

  it("derives emailVerified from emailVerifiedAt", () => {
    expect(toAuthUser(fakeUser).emailVerified).toBe(true);
    expect(toAuthUser({ ...fakeUser, emailVerifiedAt: null }).emailVerified).toBe(false);
  });

  it("does not drop preferences when org args are omitted", () => {
    const result = toAuthUser(fakeUser);
    expect(result.preferences).toEqual(fakeUser.preferences);
  });
});
