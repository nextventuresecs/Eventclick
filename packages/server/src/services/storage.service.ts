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
    signableHeaders: new Set(["host", "content-type"]),
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
