import { S3Client, PutObjectCommand, GetObjectCommand } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { nanoid } from "nanoid";
import crypto from "crypto";
import { MAX_UPLOAD_BYTES } from "@application/shared";
import { env } from "../config/env";
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
