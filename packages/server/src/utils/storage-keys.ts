import { env } from "../config/env";

/**
 * Object-key helpers, kept apart from storage.service.
 *
 * storage.service constructs the S3 client at module load, so importing it
 * pulls credentials and a network client into anything that only wants to
 * reason about a key — including unit tests, which then mock the whole module
 * and stop exercising the real logic. These functions need nothing but
 * configuration.
 */

/** Object keys we mint ourselves all live under this prefix. */
export const UPLOAD_KEY_PREFIX = "branding/";

/**
 * Recovers the object key from a URL `buildPublicUrl` produced.
 *
 * The exact inverse, path style included: with S3_FORCE_PATH_STYLE the bucket
 * name is a path segment, so the pathname is `/<bucket>/<key>` and returning
 * the whole path yields a key with the bucket name baked into it. That signs
 * an object that does not exist, and it surfaces as a missing image rather
 * than as a malformed key — which is how it survived.
 *
 * Returns null for an empty result.
 */
export const keyFromPublicUrl = (url: string): string | null => {
  let path: string;
  try {
    path = new URL(url).pathname;
  } catch {
    // Some rows may hold a bare key rather than a URL.
    path = url;
  }
  let key = decodeURIComponent(path.replace(/^\/+/, ""));
  const bucketPrefix = `${env.S3_BUCKET}/`;
  if (key.startsWith(bucketPrefix)) key = key.slice(bucketPrefix.length);
  return key.length > 0 ? key : null;
};

/**
 * Whether a stored URL points at an object in our own uploads bucket.
 *
 * `users.photo_url` and `organizations.logo_url` hold either an uploaded
 * object's URL or an arbitrary external one — a preset avatar, or an address
 * an admin pasted. Only the former can be served through the media route; the
 * latter has to be handed to the browser untouched.
 *
 * Discriminates on the key prefix rather than the origin. S3_PUBLIC_ENDPOINT
 * differs between local MinIO and production R2 and can be changed, which
 * would strand every row written under the previous value; the `branding/`
 * prefix is baked into the key at upload time and never moves.
 */
export const isUploadedObjectUrl = (url: string | null | undefined): boolean => {
  if (!url) return false;
  const key = keyFromPublicUrl(url);
  return key !== null && key.startsWith(UPLOAD_KEY_PREFIX);
};
