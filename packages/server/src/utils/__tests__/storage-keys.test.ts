import { describe, it, expect, vi } from "vitest";

vi.mock("../../config/env", () => ({
  env: { S3_BUCKET: "eventclick-uploads" },
}));

import { keyFromPublicUrl, isUploadedObjectUrl } from "../storage-keys";

describe("keyFromPublicUrl", () => {
  it("strips the bucket segment from a path-style URL", () => {
    // The production shape: S3_FORCE_PATH_STYLE puts the bucket in the path.
    // Returning the whole pathname here yielded
    // "eventclick-uploads/branding/..." — a key no object has, so the media
    // route signed a URL for nothing and the image simply never appeared.
    expect(
      keyFromPublicUrl(
        "https://pub-abc.r2.dev/eventclick-uploads/branding/users/u1/a.png",
      ),
    ).toBe("branding/users/u1/a.png");
  });

  it("handles a virtual-hosted URL, which carries no bucket segment", () => {
    expect(keyFromPublicUrl("https://pub-abc.r2.dev/branding/users/u1/a.png")).toBe(
      "branding/users/u1/a.png",
    );
  });

  it("does not strip a path segment that merely starts like the bucket name", () => {
    expect(keyFromPublicUrl("https://pub-abc.r2.dev/eventclick-uploads-old/x.png")).toBe(
      "eventclick-uploads-old/x.png",
    );
  });

  it("decodes percent-escapes", () => {
    expect(keyFromPublicUrl("https://pub-abc.r2.dev/branding/users/u1/a%20b.png")).toBe(
      "branding/users/u1/a b.png",
    );
  });

  it("treats a bare key as a key", () => {
    expect(keyFromPublicUrl("branding/users/u1/a.png")).toBe("branding/users/u1/a.png");
  });

  it("returns null when nothing is left", () => {
    expect(keyFromPublicUrl("https://pub-abc.r2.dev/")).toBeNull();
    expect(keyFromPublicUrl("")).toBeNull();
  });
});

describe("isUploadedObjectUrl", () => {
  it("recognises our own uploads in both URL styles", () => {
    expect(
      isUploadedObjectUrl("https://pub-abc.r2.dev/eventclick-uploads/branding/users/u1/a.png"),
    ).toBe(true);
    expect(isUploadedObjectUrl("https://pub-abc.r2.dev/branding/organizations/o1/l.png")).toBe(
      true,
    );
  });

  it("rejects an external URL", () => {
    // A preset avatar. Routing this through the media route would sign a key
    // that does not exist, breaking an image that already worked.
    expect(
      isUploadedObjectUrl("https://images.unsplash.com/photo-1534528741775?w=150"),
    ).toBe(false);
  });

  it("rejects an object outside the uploads prefix", () => {
    // Attendance and activity photos are addressed by row id, not by URL.
    expect(isUploadedObjectUrl("https://pub-abc.r2.dev/eventclick-uploads/rooms/r1/x.jpg")).toBe(
      false,
    );
  });

  it("rejects empty values", () => {
    expect(isUploadedObjectUrl(null)).toBe(false);
    expect(isUploadedObjectUrl(undefined)).toBe(false);
    expect(isUploadedObjectUrl("")).toBe(false);
  });
});
