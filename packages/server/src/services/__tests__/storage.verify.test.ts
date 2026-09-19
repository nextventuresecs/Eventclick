import { describe, it, expect, vi, beforeEach } from "vitest";
import { MAX_UPLOAD_BYTES } from "@application/shared";

const hoisted = vi.hoisted(() => ({
  sendFn: vi.fn(),
  headCommands: [] as any[],
}));

vi.mock("@aws-sdk/client-s3", () => ({
  S3Client: class {
    send = (...args: any[]) => hoisted.sendFn(...args);
  },
  HeadObjectCommand: class {
    constructor(public input: any) {
      hoisted.headCommands.push(input);
    }
  },
  GetObjectCommand: class {},
  PutObjectCommand: class {
    middlewareStack = { add: () => {} };
  },
  DeleteObjectsCommand: class {},
}));

vi.mock("@aws-sdk/s3-request-presigner", () => ({
  getSignedUrl: vi.fn().mockResolvedValue("https://s3.example.test/signed"),
}));

import { verifyStorageObject } from "../storage.service";

describe("verifyStorageObject (DEF-004 S3 object verification)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    hoisted.headCommands.length = 0;
  });

  it("succeeds when object exists with valid prefix, image type, and valid size", async () => {
    hoisted.sendFn.mockResolvedValueOnce({
      ContentLength: 1024 * 100, // 100 KB
      ContentType: "image/jpeg",
    });

    const result = await verifyStorageObject("attendance/room-123/proof-abc.jpg", {
      expectedPrefix: "attendance/room-123/",
    });

    expect(result.contentLength).toBe(1024 * 100);
    expect(result.contentType).toBe("image/jpeg");
    expect(hoisted.headCommands).toHaveLength(1);
    expect(hoisted.headCommands[0].Key).toBe("attendance/room-123/proof-abc.jpg");
  });

  it("rejects when key does not match expected prefix", async () => {
    await expect(
      verifyStorageObject("attendance/other-room/photo.jpg", {
        expectedPrefix: "attendance/room-123/",
      }),
    ).rejects.toMatchObject({
      statusCode: 400,
      code: "BAD_REQUEST",
      message: expect.stringContaining("does not match expected prefix"),
    });

    expect(hoisted.sendFn).not.toHaveBeenCalled();
  });

  it("rejects path traversal attempts", async () => {
    await expect(
      verifyStorageObject("attendance/room-123/../../../etc/passwd", {
        expectedPrefix: "attendance/room-123/",
      }),
    ).rejects.toMatchObject({
      statusCode: 400,
      code: "BAD_REQUEST",
      message: "Invalid storage key path",
    });

    await expect(
      verifyStorageObject("/attendance/room-123/photo.jpg", {
        expectedPrefix: "attendance/room-123/",
      }),
    ).rejects.toMatchObject({
      statusCode: 400,
      code: "BAD_REQUEST",
      message: "Invalid storage key path",
    });

    expect(hoisted.sendFn).not.toHaveBeenCalled();
  });

  it("rejects with 400 when S3 returns NotFound / NoSuchKey", async () => {
    const notFoundError = new Error("Object not found");
    notFoundError.name = "NotFound";
    (notFoundError as any).$metadata = { httpStatusCode: 404 };
    hoisted.sendFn.mockRejectedValueOnce(notFoundError);

    await expect(
      verifyStorageObject("attendance/room-123/ghost-photo.jpg", {
        expectedPrefix: "attendance/room-123/",
      }),
    ).rejects.toMatchObject({
      statusCode: 400,
      code: "BAD_REQUEST",
      message: expect.stringContaining("Photo proof does not exist in storage"),
    });
  });

  it("rejects with 400 when S3 returns empty object (0 bytes)", async () => {
    hoisted.sendFn.mockResolvedValueOnce({
      ContentLength: 0,
      ContentType: "image/jpeg",
    });

    await expect(
      verifyStorageObject("attendance/room-123/empty.jpg", {
        expectedPrefix: "attendance/room-123/",
      }),
    ).rejects.toMatchObject({
      statusCode: 400,
      code: "BAD_REQUEST",
      message: expect.stringContaining("empty (0 bytes)"),
    });
  });

  it("rejects with 400 when S3 returns oversized object", async () => {
    hoisted.sendFn.mockResolvedValueOnce({
      ContentLength: MAX_UPLOAD_BYTES + 1024,
      ContentType: "image/jpeg",
    });

    await expect(
      verifyStorageObject("attendance/room-123/huge.jpg", {
        expectedPrefix: "attendance/room-123/",
      }),
    ).rejects.toMatchObject({
      statusCode: 400,
      code: "BAD_REQUEST",
      message: expect.stringContaining("exceeds the limit"),
    });
  });

  it("rejects with 400 when S3 returns invalid MIME type", async () => {
    hoisted.sendFn.mockResolvedValueOnce({
      ContentLength: 5000,
      ContentType: "application/pdf",
    });

    await expect(
      verifyStorageObject("attendance/room-123/doc.pdf", {
        expectedPrefix: "attendance/room-123/",
      }),
    ).rejects.toMatchObject({
      statusCode: 400,
      code: "BAD_REQUEST",
      message: expect.stringContaining("Invalid storage object type"),
    });
  });

  it("throws 500 internal error on S3 AccessDenied", async () => {
    const accessDeniedError = new Error("Access Denied");
    accessDeniedError.name = "AccessDenied";
    (accessDeniedError as any).$metadata = { httpStatusCode: 403 };
    hoisted.sendFn.mockRejectedValueOnce(accessDeniedError);

    await expect(
      verifyStorageObject("attendance/room-123/photo.jpg", {
        expectedPrefix: "attendance/room-123/",
      }),
    ).rejects.toMatchObject({
      statusCode: 500,
      code: "INTERNAL",
      message: "Storage service access error",
    });
  });

  it("throws 504 gateway timeout on S3 AbortError / TimeoutError", async () => {
    const timeoutError = new Error("The operation was aborted");
    timeoutError.name = "AbortError";
    hoisted.sendFn.mockRejectedValueOnce(timeoutError);

    await expect(
      verifyStorageObject("attendance/room-123/photo.jpg", {
        expectedPrefix: "attendance/room-123/",
      }),
    ).rejects.toMatchObject({
      statusCode: 504,
      code: "GATEWAY_TIMEOUT",
      message: expect.stringContaining("Storage verification timed out"),
    });
  });
});
