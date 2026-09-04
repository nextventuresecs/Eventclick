import { and, eq, isNull } from "drizzle-orm";
import { db } from "../db";
import {
  activityPhotos,
  attendanceEntries,
  eventRooms,
  organizations,
  users,
} from "../db/schema";
import { createPresignedGet } from "./storage.service";
import { MEDIA_URL_TTL_SECONDS } from "../config/constants";
import { ApiError } from "../utils/errors";

/**
 * Resolves a media reference to a short-lived signed URL.
 *
 * **Why an indirection rather than a URL in the payload.** Uploads live in a
 * private bucket, so something has to sign a URL before a browser can fetch
 * one. Signing at serialisation time and embedding the result would put an
 * expiring URL into every list response — it would rot inside a downloaded CSV
 * export, break a bookmark, and cost one signature per row whether or not the
 * image is ever displayed. Signing here instead keeps the reference the API
 * hands out (`/api/v1/media/<resource>/<id>`) stable and permanent, and defers
 * the signature to the moment something actually asks for the bytes.
 *
 * **The access check is the point.** A presigned URL is a bearer capability: it
 * grants whoever holds it access for its whole lifetime and cannot be revoked
 * early. Keeping the signing behind an authenticated route means the tenant
 * check runs per request, against current state — a user removed from an
 * organisation stops seeing its photos on their next request rather than when
 * some previously-issued URL happens to expire.
 *
 * Every lookup goes through the request-scoped `db`, so RLS applies: a row
 * belonging to another tenant is not found rather than found-and-refused, and
 * the caller cannot distinguish "wrong tenant" from "does not exist".
 */

/** The media kinds the route can resolve, and how each finds its storage key. */
export type MediaResource = "attendance" | "activity-photo" | "org-logo" | "user-avatar";

export const MEDIA_RESOURCES: readonly MediaResource[] = [
  "attendance",
  "activity-photo",
  "org-logo",
  "user-avatar",
] as const;

export const isMediaResource = (value: string): value is MediaResource =>
  (MEDIA_RESOURCES as readonly string[]).includes(value);

/**
 * The storage key behind one media reference, or null when the row exists but
 * carries no image.
 *
 * `organizations.logo_url` and `users.photo_url` hold a full public URL rather
 * than a bare key — they predate the key/URL split that `attendance_entries`
 * and `activity_photos` use. The key is recovered by taking the path after the
 * public endpoint's origin, which is exactly what `buildPublicUrl` prepended.
 */
const keyFromStoredUrl = (url: string | null): string | null => {
  if (!url) return null;
  try {
    // Leading slash stripped: object keys are relative, URL paths are not.
    const path = new URL(url).pathname.replace(/^\/+/, "");
    return path.length > 0 ? decodeURIComponent(path) : null;
  } catch {
    // Not a URL at all — some rows may already hold a bare key.
    return url.replace(/^\/+/, "");
  }
};

const resolveKey = async (
  resource: MediaResource,
  id: string,
  organizationId: string,
): Promise<string | null> => {
  switch (resource) {
    case "attendance": {
      const [row] = await db
        .select({ key: attendanceEntries.photoKey })
        .from(attendanceEntries)
        .where(eq(attendanceEntries.id, id))
        .limit(1);
      return row?.key ?? null;
    }
    case "activity-photo": {
      const [row] = await db
        .select({ key: activityPhotos.photoKey })
        .from(activityPhotos)
        .where(and(eq(activityPhotos.id, id), isNull(activityPhotos.deletedAt)))
        .limit(1);
      return row?.key ?? null;
    }
    case "org-logo": {
      // Scoped to the caller's own organisation rather than the id in the path:
      // an organisation's branding is not readable across tenants, and RLS on
      // `organizations` already restricts the row to the current tenant.
      if (id !== organizationId) throw ApiError.forbidden("Not your organization");
      const [row] = await db
        .select({ url: organizations.logoUrl })
        .from(organizations)
        .where(eq(organizations.id, organizationId))
        .limit(1);
      return keyFromStoredUrl(row?.url ?? null);
    }
    case "user-avatar": {
      const [row] = await db
        .select({ url: users.photoUrl })
        .from(users)
        .where(and(eq(users.id, id), isNull(users.deletedAt)))
        .limit(1);
      return keyFromStoredUrl(row?.url ?? null);
    }
  }
};

/**
 * Signs a URL for one media reference, or throws if the caller may not have it.
 *
 * Throws `notFound` for both a missing row and a row without an image, so the
 * endpoint never reveals which of the two it was.
 */
export const resolveMediaUrl = async (
  resource: MediaResource,
  id: string,
  organizationId: string,
): Promise<string> => {
  const key = await resolveKey(resource, id, organizationId);
  if (!key) throw ApiError.notFound("Media not found");
  return createPresignedGet(key, MEDIA_URL_TTL_SECONDS);
};

/** Rooms are the access boundary for attendance photos; exported for tests. */
export const roomBelongsToOrg = async (roomId: string, organizationId: string): Promise<boolean> => {
  const [row] = await db
    .select({ id: eventRooms.id })
    .from(eventRooms)
    .where(and(eq(eventRooms.id, roomId), eq(eventRooms.organizationId, organizationId)))
    .limit(1);
  return !!row;
};
