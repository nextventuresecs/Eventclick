import { describe, it, expect, vi, beforeEach } from "vitest";
import { MAX_UPLOAD_BYTES } from "@application/shared";

const hoisted = vi.hoisted(() => ({ commands: [] as any[], signOptions: [] as any[] }));

vi.mock("@aws-sdk/client-s3", () => ({
  S3Client: class {},
  GetObjectCommand: class {
    constructor(public input: any) {}
    middlewareStack = { add: () => {} };
  },
  PutObjectCommand: class {
    middlewareStack = { add: () => {} };
    constructor(public input: any) {
      hoisted.commands.push(input);
    }
  },
}));

vi.mock("@aws-sdk/s3-request-presigner", () => ({
  getSignedUrl: async (_client: unknown, _cmd: unknown, options: any) => {
    hoisted.signOptions.push(options);
    return "https://s3.example.test/signed";
  },
}));

import { createPresignedPut } from "../storage.service";

describe("presigned upload size enforcement (#87)", () => {
  beforeEach(() => {
    hoisted.commands.length = 0;
    hoisted.signOptions.length = 0;
  });

  it("binds the URL to the declared length", async () => {
    // Previously the size was validated by the schema and then dropped, so
    // the issued URL accepted a body of any length — client-honesty only.
    await createPresignedPut("photos/a.jpg", "image/jpeg", 1234);

    expect(hoisted.commands[0].ContentLength).toBe(1234);
  });

  it("signs content-length, which is what makes the limit enforceable", async () => {
    // SigV4 covers every header named here, so S3 rejects an upload whose
    // actual length differs from the signed one.
    await createPresignedPut("photos/a.jpg", "image/jpeg", 1234);

    const signable: Set<string> = hoisted.signOptions[0].signableHeaders;
    expect(signable.has("content-length")).toBe(true);
    // Existing behaviour must survive: content-type is what enforces the
    // file-type allowlist at the object store.
    expect(signable.has("content-type")).toBe(true);
  });

  it("refuses to mint a URL above the shared limit", async () => {
    // Defence in depth: callers validate with zod first, but a future caller
    // that forgets must not be able to issue an unlimited URL.
    await expect(
      createPresignedPut("photos/a.jpg", "image/jpeg", MAX_UPLOAD_BYTES + 1),
    ).rejects.toThrow(/5MB/);
    expect(hoisted.commands).toHaveLength(0);
  });

  it("accepts a size exactly at the limit", async () => {
    await expect(
      createPresignedPut("photos/a.jpg", "image/jpeg", MAX_UPLOAD_BYTES),
    ).resolves.toMatchObject({ uploadUrl: expect.any(String) });
  });

  it("rejects zero, negative and non-integer sizes", async () => {
    for (const bad of [0, -1, 1.5, Number.NaN]) {
      await expect(createPresignedPut("k", "image/jpeg", bad)).rejects.toThrow();
    }
  });

  it("still sets the content type and cache headers", async () => {
    await createPresignedPut("photos/a.jpg", "image/webp", 10);

    expect(hoisted.commands[0]).toMatchObject({
      ContentType: "image/webp",
      CacheControl: "public, max-age=31536000, immutable",
    });
  });
});
