import { S3Client, PutObjectCommand } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { nanoid } from "nanoid";
import crypto from "crypto";
import { env } from "../config/env";

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

// Presign client: signs URLs with the public endpoint so the browser's
// Host header matches the signature. Never performs network I/O itself.
// Checksum calc disabled — SDK v3 default adds CRC32 query params that
// clients (browser / curl) can't supply without computing + sending them,
// which causes presigned PUTs to fail with 403 on MinIO/R2.
const s3Presign = new S3Client({
  endpoint: env.S3_PUBLIC_ENDPOINT,
  region: env.S3_REGION,
  forcePathStyle: env.S3_FORCE_PATH_STYLE,
  credentials,
});

// SDK v3 injects flexible-checksums middleware that adds
// x-amz-sdk-checksum-algorithm + x-amz-checksum-crc32 into the presigned URL.
// Browsers/curl can't supply a valid CRC32 header, so the PUT 403s.
// Remove the middleware so presigned URLs only sign Host + standard params.
s3Presign.middlewareStack.remove("flexibleChecksumsMiddleware");

const EXT_BY_MIME: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
};

export const buildPhotoKey = (roomId: string, contentType: string): string => {
  const ext = EXT_BY_MIME[contentType] ?? "bin";
  return `attendance/${roomId}/${nanoid(24)}.${ext}`;
};

export const buildActivityPhotoKey = (roomId: string, activityId: string): string => {
  const timestampUuid = `${Date.now()}_${crypto.randomUUID()}`;
  return `rooms/${roomId}/activities/${activityId}_${timestampUuid}.jpg`;
};

export const createPresignedPut = async (
  key: string,
  contentType: string,
): Promise<{ uploadUrl: string; expiresIn: number }> => {
  const cmd = new PutObjectCommand({
    Bucket: env.S3_BUCKET,
    Key: key,
    ContentType: contentType,
  });
  const expiresIn = 300;
  const uploadUrl = await getSignedUrl(s3Presign, cmd, { expiresIn });
  return { uploadUrl, expiresIn };
};

export const buildPublicUrl = (key: string): string => {
  const base = env.S3_PUBLIC_ENDPOINT.replace(/\/+$/, "");
  if (env.S3_FORCE_PATH_STYLE) {
    return `${base}/${env.S3_BUCKET}/${key}`;
  }
  return `${base}/${key}`;
};
