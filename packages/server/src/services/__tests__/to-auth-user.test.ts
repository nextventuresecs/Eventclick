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

// storage.service (imported by auth-helpers for the private-bucket check)
// pulls in env, and so does jwt.service further down the same import graph.
vi.mock("../../config/env", () => ({
  env: {
    S3_BUCKET: "eventclick-uploads",
    S3_PUBLIC_ENDPOINT: "https://pub-abc123.r2.dev",
    S3_FORCE_PATH_STYLE: true,
    S3_ENDPOINT: "https://pub-abc123.r2.dev",
    S3_REGION: "auto",
    S3_ACCESS_KEY_ID: "test",
    S3_SECRET_ACCESS_KEY: "test",
    JWT_SECRET: "test-secret-value-for-unit-tests-only",
    JWT_ACCESS_TTL: "15m",
    JWT_REFRESH_TTL: "7d",
    NODE_ENV: "test",
  },
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

  // photoUrl was absent from the object literal entirely: an uploaded avatar
  // was written to the row and never sent back, so it vanished on reload
  // whatever the client did with it.
  it("forwards photoUrl", () => {
    const result = toAuthUser({ ...fakeUser, photoUrl: "https://cdn.example/a.png" } as User);
    expect(result.photoUrl).toBe("https://cdn.example/a.png");
  });

  describe("private-bucket images", () => {
    // Exactly what buildPublicUrl emits under S3_FORCE_PATH_STYLE.
    const uploadedAvatar =
      "https://pub-abc123.r2.dev/eventclick-uploads/branding/users/user-1/xyz.png";
    const uploadedLogo =
      "https://pub-abc123.r2.dev/eventclick-uploads/branding/organizations/org-1/xyz.png";

    it("hands out a media path for an uploaded avatar", () => {
      // The bucket is private: this URL in an <img src> is an unauthenticated
      // request the object store refuses.
      const result = toAuthUser({ ...fakeUser, photoUrl: uploadedAvatar } as User);
      expect(result.photoUrl).toBe("/media/user-avatar/user-1");
    });

    it("hands out a media path for an uploaded logo", () => {
      const result = toAuthUser(fakeUser, "Acme", null, uploadedLogo);
      expect(result.organizationLogoUrl).toBe("/media/org-logo/org-1");
    });

    it("leaves an external URL untouched", () => {
      // Preset avatars and pasted URLs are already loadable; routing them
      // through the media route would sign a key that does not exist.
      const preset = "https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=150";
      const result = toAuthUser({ ...fakeUser, photoUrl: preset } as User, "Acme", null, preset);
      expect(result.photoUrl).toBe(preset);
      expect(result.organizationLogoUrl).toBe(preset);
    });

    it("returns null for no image", () => {
      const result = toAuthUser({ ...fakeUser, photoUrl: null } as User, "Acme", null, null);
      expect(result.photoUrl).toBeNull();
      expect(result.organizationLogoUrl).toBeNull();
    });

    it("returns null when an uploaded image has no id to address it by", () => {
      const result = toAuthUser(
        { ...fakeUser, organizationId: null } as User,
        "Acme",
        null,
        uploadedLogo,
      );
      expect(result.organizationLogoUrl).toBeNull();
    });
  });
});
