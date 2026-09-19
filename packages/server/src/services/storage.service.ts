import { S3Client, PutObjectCommand, GetObjectCommand, DeleteObjectsCommand, HeadObjectCommand } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { nanoid } from "nanoid";
import crypto from "crypto";
import { MAX_UPLOAD_BYTES } from "@application/shared";
import { env } from "../config/env";
import { S3_DELETE_BATCH_SIZE } from "../config/constants";
import { logger } from "../utils/logger";
import { ApiError } from "../utils/errors";

const credentials = {
  accessKeyId: env.S3_ACCESS_KEY,
  secretAccessKey: env.S3_SECRET_KEY,
};

// Internal client: server-to-S3 operations (GetObject, ListObjects, …).
// Reachable via in-network DNS (minio:9000 in dev, R2 hostname in prod).
export const s3 = new S3Client({
  endpoint: env.S3_ENDPOINT,
  region: env.S3_REGION,
  forcePathStyle: env.S3_FORCE_PATH_STYLE,
  credentials,
});

// Presign client: signs URLs using the main API endpoint.
const s3Presign = new S3Client({
  endpoint: env.S3_ENDPOINT,
  region: env.S3_REGION,
  forcePathStyle: env.S3_FORCE_PATH_STYLE,
  credentials,
});

const EXT_BY_MIME: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
};

export const buildPhotoKey = (roomId: string, contentType: string): string => {
  const ext = EXT_BY_MIME[contentType] ?? "bin";
  return `attendance/${roomId}/${nanoid(24)}.${ext}`;
};

export const buildOrgLogoKey = (orgId: string, contentType: string): string => {
  const ext = EXT_BY_MIME[contentType] ?? "bin";
  return `branding/organizations/${orgId}/${nanoid(24)}.${ext}`;
};

export const buildUserAvatarKey = (userId: string, contentType: string): string => {
  const ext = EXT_BY_MIME[contentType] ?? "bin";
  return `branding/users/${userId}/${nanoid(24)}.${ext}`;
};

export const buildActivityPhotoKey = (roomId: string, activityId: string): string => {
  const timestampUuid = `${Date.now()}_${crypto.randomUUID()}`;
  return `rooms/${roomId}/activities/${activityId}_${timestampUuid}.jpg`;
};

/**
 * Issues a pre-signed PUT that is **bound to the declared size**.
 *
 * The size was previously validated by the request schema and then thrown
 * away: a pre-signed PUT with an unsigned Content-Length accepts a body of
 * any length, so the 5 MB limit was client-honesty only — worse than no
 * limit, because it read as enforced.
 *
 * The fix is to sign `content-length`. SigV4 covers every header named in
 * `signableHeaders`, so S3 (and MinIO in development) rejects any upload
 * whose actual length differs from the one signed into the URL. Since the
 * declared size is itself capped at MAX_UPLOAD_BYTES by the schema and again
 * below, the stored object cannot exceed the limit.
 *
 * Chosen over the alternatives deliberately:
 *   - a pre-signed POST with a content-length-range condition would enforce
 *     the same thing, but changes the upload from PUT to multipart form POST
 *     — a client-visible contract change the issue rules out;
 *   - checking the object's size after the fact leaves oversized objects in
 *     the bucket for the window before the check, and needs a cleanup path
 *     for uploads whose record is never persisted.
 */
export const createPresignedPut = async (
  key: string,
  contentType: string,
  sizeBytes: number,
): Promise<{ uploadUrl: string; expiresIn: number }> => {
  // Defence in depth: every caller validates through a zod schema first, but
  // a future one that forgets must not be able to mint an unlimited URL.
  if (!Number.isInteger(sizeBytes) || sizeBytes <= 0 || sizeBytes > MAX_UPLOAD_BYTES) {
    throw ApiError.badRequest(
      `Upload must be between 1 byte and ${Math.floor(MAX_UPLOAD_BYTES / (1024 * 1024))}MB`,
    );
  }

  const cmd = new PutObjectCommand({
    Bucket: env.S3_BUCKET,
    Key: key,
    ContentType: contentType,
    ContentLength: sizeBytes,
    CacheControl: "public, max-age=31536000, immutable",
  });

  // Attach middleware directly to the command so it absolutely runs during presigning.
  // Use priority 'low' so it runs AFTER the flexibleChecksums middleware injects the bad headers!
  cmd.middlewareStack.add(
    (next) => async (args: any) => {
      const req = args.request;
      if (req.headers) {
        delete req.headers["x-amz-checksum-crc32"];
        delete req.headers["x-amz-sdk-checksum-algorithm"];
      }
      if (req.query) {
        delete req.query["x-amz-checksum-crc32"];
        delete req.query["x-amz-sdk-checksum-algorithm"];
      }
      return next(args);
    },
    { step: "build", priority: "low", name: "forceRemoveChecksums" }
  );

  const expiresIn = 300;
  
  const uploadUrl = await getSignedUrl(s3Presign, cmd, { 
    expiresIn,
    // content-length is what makes the size limit real — see the doc comment.
    signableHeaders: new Set(["host", "content-type", "content-length"]),
    unhoistableHeaders: new Set(["x-amz-sdk-checksum-algorithm", "x-amz-checksum-crc32"])
  });
  return { uploadUrl, expiresIn };
};

export const buildPublicUrl = (key: string): string => {
  const base = env.S3_PUBLIC_ENDPOINT.replace(/\/+$/, "");
  if (env.S3_FORCE_PATH_STYLE) {
    return `${base}/${env.S3_BUCKET}/${key}`;
  }
  return `${base}/${key}`;
};

// Key helpers live in utils/storage-keys so they can be imported (and tested)
// without constructing the S3 client this module creates at load.
export { keyFromPublicUrl, isUploadedObjectUrl } from "../utils/storage-keys";

export const createPresignedGet = async (
  key: string,
  expiresIn = 3600,
): Promise<string> => {
  const cmd = new GetObjectCommand({
    Bucket: env.S3_BUCKET,
    Key: key,
  });
  return await getSignedUrl(s3, cmd, { expiresIn });
};

export interface VerifyStorageObjectOptions {
  expectedPrefix: string;
  allowedContentTypes?: RegExp;
  maxBytes?: number;
}

/**
 * Verifies that an object exists in storage, belongs to the expected resource prefix,
 * and contains valid non-empty data within configured limits before database persistence.
 */
export const verifyStorageObject = async (
  key: string,
  options: VerifyStorageObjectOptions,
): Promise<{ contentLength: number; contentType: string }> => {
  if (!key || typeof key !== "string") {
    throw ApiError.badRequest("Storage key must be a non-empty string");
  }

  // Security: Prevent path traversal and enforce exact prefix
  if (key.includes("..") || key.startsWith("/") || key.startsWith("\\")) {
    throw ApiError.badRequest("Invalid storage key path");
  }

  if (!key.startsWith(options.expectedPrefix)) {
    throw ApiError.badRequest(
      "Invalid storage key: does not match expected prefix for this resource",
    );
  }

  const maxBytes = options.maxBytes ?? MAX_UPLOAD_BYTES;
  const allowedTypes = options.allowedContentTypes ?? /^image\/(jpeg|png|webp)$/;

  try {
    const head = await s3.send(
      new HeadObjectCommand({
        Bucket: env.S3_BUCKET,
        Key: key,
      }),
      {
        abortSignal: AbortSignal.timeout(5000),
      },
    );

    const contentLength = head.ContentLength ?? 0;
    if (contentLength <= 0) {
      throw ApiError.badRequest("Uploaded storage object is empty (0 bytes)");
    }

    if (contentLength > maxBytes) {
      throw ApiError.badRequest(
        `Uploaded storage object (${Math.round(contentLength / 1024)}KB) exceeds the limit of ${Math.round(maxBytes / 1024)}KB`,
      );
    }

    const contentType = head.ContentType ?? "";
    if (!allowedTypes.test(contentType)) {
      throw ApiError.badRequest(
        `Invalid storage object type "${contentType}". Must be image/jpeg, image/png, or image/webp`,
      );
    }

    return { contentLength, contentType };
  } catch (err: unknown) {
    if (err instanceof ApiError) throw err;

    const errorObj = err && typeof err === "object" ? (err as Record<string, unknown>) : {};
    const metadata = errorObj.$metadata && typeof errorObj.$metadata === "object"
      ? (errorObj.$metadata as Record<string, unknown>)
      : {};
    const statusCode = metadata.httpStatusCode;
    const errName = typeof errorObj.name === "string" ? errorObj.name : "";

    if (statusCode === 404 || errName === "NotFound" || errName === "NoSuchKey") {
      throw ApiError.badRequest("Photo proof does not exist in storage. Please upload the photo first.");
    }

    if (statusCode === 403 || errName === "AccessDenied") {
      logger.error({ err, key, bucket: env.S3_BUCKET }, "[storage] Access denied checking S3 object");
      throw ApiError.internal("Storage service access error");
    }

    if (errName === "TimeoutError" || errName === "AbortError") {
      logger.warn({ err, key }, "[storage] HeadObject timed out");
      throw ApiError.gatewayTimeout("Storage verification timed out. Please try again.");
    }

    logger.error({ err, key }, "[storage] Unexpected error verifying S3 object");
    throw ApiError.internal("Failed to verify photo proof in storage");
  }
};

/**
 * Deletes objects from the uploads bucket, and reports which keys survived.
 *
 * **Why this exists.** Nothing in the codebase deleted an object until now.
 * Rows that point at storage — `attendance_entries.photo_key`,
 * `activity_photos.photo_key`, `room_recordings.s3_key` — have always been
 * removed while their objects stayed, so the bucket has been accumulating
 * files no row references since launch.
 *
 * **Deliberately tolerant, unlike the audit archive.** That archive fails
 * closed because re-uploading an object is harmless, so refusing to proceed
 * costs nothing. Deleting is not idempotent in the same way: the caller
 * removes the row straight after, and once the row is gone the key is
 * unrecoverable. So a failure here must not abort the run — it returns the
 * keys that failed, the caller keeps those rows, and the next pass tries
 * again. A row kept one more day is recoverable; a row deleted whose object
 * leaked is not.
 *
 * S3 and R2 both treat deleting a key that does not exist as success, so a
 * re-run over a partially-deleted batch is safe.
 *
 * Batched at 1,000, the `DeleteObjects` maximum.
 *
 * @returns the keys that could **not** be deleted.
 */
export const deleteObjects = async (keys: string[]): Promise<string[]> => {
  if (keys.length === 0) return [];

  const failed: string[] = [];
  for (let i = 0; i < keys.length; i += S3_DELETE_BATCH_SIZE) {
    const chunk = keys.slice(i, i + S3_DELETE_BATCH_SIZE);
    try {
      const result = await s3.send(
        new DeleteObjectsCommand({
          Bucket: env.S3_BUCKET,
          Delete: { Objects: chunk.map((Key) => ({ Key })), Quiet: true },
        }),
      );
      for (const err of result.Errors ?? []) {
        if (err.Key) failed.push(err.Key);
      }
    } catch (err) {
      // A whole-request failure (credentials, network, bucket policy) fails
      // the entire chunk rather than the run: the caller keeps those rows and
      // the next pass retries them.
      logger.error(
        { err, keys: chunk.length, bucket: env.S3_BUCKET, event: "storage.delete_failed" },
        `Failed to delete ${chunk.length} objects from ${env.S3_BUCKET}`,
      );
      failed.push(...chunk);
    }
  }

  if (failed.length > 0) {
    logger.warn(
      { failed: failed.length, requested: keys.length, event: "storage.delete_partial" },
      `${failed.length} of ${keys.length} objects could not be deleted`,
    );
  }

  return failed;
};
