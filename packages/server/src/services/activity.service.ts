import { and, eq, isNull } from "drizzle-orm";
import type {
  ActivitySubmission,
  SubmitActivityPhotoInput,
  ActivityPhotoUploadRequestInput,
  PhotoUploadResponse,
  UserRole,
} from "@application/shared";
import { buildMediaPath } from "@application/shared";
import { db, withTransaction } from "../db";
import {
  eventRooms,
  activitySubmissions,
  activityPhotos,
} from "../db/schema";
import { sql } from "drizzle-orm";
import { ApiError } from "../utils/errors";
import {
  buildActivityPhotoKey,
  buildPublicUrl,
  createPresignedPut,
  verifyStorageObject,
} from "./storage.service";
import { assertRoomAccessForUser, assertRoomAccessWithRoom } from "./event-assignment.service";
import { redisClient } from "../config/redis";
import { logger } from "../utils/logger";

/**
 * Minimal principal shape required for room-access checks.
 * Matches the pattern used by attendance.service.ts and form.service.ts.
 */
interface RoomAccessPrincipal {
  id: string;
  role: UserRole;
}

/**
 * Generates a presigned URL to upload a photo proof for a specific activity.
 */
export const presignActivityPhoto = async (
  roomId: string,
  orgId: string,
  user: RoomAccessPrincipal,
  input: ActivityPhotoUploadRequestInput,
): Promise<PhotoUploadResponse> => {
  const [room] = await db
    .select()
    .from(eventRooms)
    .where(
      and(
        eq(eventRooms.id, roomId),
        eq(eventRooms.organizationId, orgId),
        isNull(eventRooms.deletedAt),
      ),
    )
    .limit(1);

  if (!room) throw ApiError.notFound("Room not found");
  await assertRoomAccessWithRoom({ ...user, organizationId: orgId }, orgId, roomId);

  // Validate that the activityId is defined in the room's activity definitions
  const defExists = room.activityDefinitions.some((def) => def.id === input.activityId);
  if (!defExists) {
    throw ApiError.badRequest(`Activity with ID "${input.activityId}" is not defined for this room`);
  }

  const key = buildActivityPhotoKey(roomId, input.activityId);
  const { uploadUrl, expiresIn } = await createPresignedPut(key, input.contentType, input.sizeBytes);
  const publicUrl = buildPublicUrl(key);

  return { uploadUrl, key, publicUrl, expiresIn };
};

/**
 * Submits a completed photo proof, appending it to the activity's submissions.
 *
 * Uses an upsert (INSERT ... ON CONFLICT DO NOTHING) on the unique
 * (room_id, activity_id) index to prevent duplicate submissions from
 * concurrent requests. The photo-count check + insert is wrapped in a
 * transaction to prevent overshooting the 50-photo limit.
 */
export const submitActivityPhoto = async (
  roomId: string,
  orgId: string,
  user: RoomAccessPrincipal,
  input: SubmitActivityPhotoInput,
): Promise<ActivitySubmission> => {
  // Check idempotency if key provided
  const idempKey = input.idempotencyKey
    ? `idemp:activity:${orgId}:${roomId}:${input.activityId}:${input.idempotencyKey}`
    : null;

  if (idempKey && redisClient.isOpen) {
    try {
      const cached = await redisClient.get(idempKey);
      if (cached) {
        return JSON.parse(cached) as ActivitySubmission;
      }
    } catch (err) {
      logger.warn({ err, idempKey }, "[activity] failed to read idempotency cache");
    }
  }

  const [room] = await db
    .select()
    .from(eventRooms)
    .where(
      and(
        eq(eventRooms.id, roomId),
        eq(eventRooms.organizationId, orgId),
        isNull(eventRooms.deletedAt),
      ),
    )
    .limit(1);

  if (!room) throw ApiError.notFound("Room not found");
  await assertRoomAccessWithRoom({ ...user, organizationId: orgId }, orgId, roomId);

  // Validate activity definition exists
  const def = room.activityDefinitions.find((d) => d.id === input.activityId);
  if (!def) {
    throw ApiError.badRequest(`Activity with ID "${input.activityId}" is not defined for this room`);
  }

  // Upsert: insert if not exists, do nothing on conflict.
  // The unique index on (room_id, activity_id) prevents duplicates from concurrent requests.
  await db
    .insert(activitySubmissions)
    .values({
      roomId,
      organizationId: orgId,
      activityId: input.activityId,
    })
    .onConflictDoNothing({
      target: [activitySubmissions.roomId, activitySubmissions.activityId],
    });

  // Re-select to get the canonical row (whether just inserted or already existing)
  const [existingSub] = await db
    .select()
    .from(activitySubmissions)
    .where(
      and(
        eq(activitySubmissions.roomId, roomId),
        eq(activitySubmissions.activityId, input.activityId),
      ),
    )
    .limit(1);

  if (!existingSub) {
    throw ApiError.internal("Failed to create activity submission");
  }

  // Verify that the photo proof actually exists in storage and belongs to this room & activity
  await verifyStorageObject(input.photoKey, {
    expectedPrefix: `rooms/${roomId}/activities/${input.activityId}_`,
  });

  // Keep the photo-count-check + insert atomic. withTransaction, not
  // db.transaction: inside a request this already runs in the tenant
  // transaction, and opening a nested one there commits it early and drops
  // app.current_tenant — which silently emptied the read-back below.
  await withTransaction(async (tx) => {
    const countResult = await tx
      .select({ count: sql<number>`count(*)` })
      .from(activityPhotos)
      .where(eq(activityPhotos.submissionId, existingSub.id));

    const currentCount = countResult[0]?.count ?? 0;

    if (Number(currentCount) >= 50) {
      throw ApiError.badRequest("Maximum of 50 photos allowed per activity");
    }

    await tx.insert(activityPhotos).values({
      submissionId: existingSub.id,
      roomId,
      organizationId: orgId,
      activityId: input.activityId,
      photoKey: input.photoKey,
      photoUrl: buildPublicUrl(input.photoKey),
      latitude: input.latitude ?? null,
      longitude: input.longitude ?? null,
      location:
        input.latitude != null && input.longitude != null
          ? { x: input.longitude, y: input.latitude }
          : null,
      submittedBy: user.id,
    });
  });

  const allPhotos = await db
    .select()
    .from(activityPhotos)
    .where(eq(activityPhotos.submissionId, existingSub.id))
    .orderBy(activityPhotos.createdAt);

  const result: ActivitySubmission = {
    id: existingSub.id,
    roomId: existingSub.roomId,
    activityId: existingSub.activityId,
    photos: allPhotos.map((p) => ({
      // A media reference, not the stored public URL: the bucket is private,
      // so the object is reachable only through the authenticated route that
      // signs on demand. The stored photo_url is left in place for rows
      // written before this changed.
      url: buildMediaPath("activity-photo", p.id),
      key: p.photoKey,
      uploadedAt: p.createdAt.toISOString(),
    })),
    createdAt: existingSub.createdAt.toISOString(),
    updatedAt: existingSub.updatedAt.toISOString(),
  };

  if (idempKey && redisClient.isOpen) {
    try {
      await redisClient.set(idempKey, JSON.stringify(result), { EX: 86400 });
    } catch (err) {
      logger.warn({ err, idempKey }, "[activity] failed to write idempotency cache");
    }
  }

  return result;
};

/**
 * Lists defined activities and their current submissions in the room.
 */
export const listRoomActivities = async (
  roomId: string,
  orgId: string,
  user: RoomAccessPrincipal,
) => {
  const [room] = await db
    .select()
    .from(eventRooms)
    .where(
      and(
        eq(eventRooms.id, roomId),
        eq(eventRooms.organizationId, orgId),
        isNull(eventRooms.deletedAt),
      ),
    )
    .limit(1);

  if (!room) throw ApiError.notFound("Room not found");
  await assertRoomAccessForUser({ ...user, organizationId: orgId }, orgId, roomId);

  const submissions = await db
    .select()
    .from(activitySubmissions)
    .where(eq(activitySubmissions.roomId, roomId));

  const allPhotos = await db
    .select()
    .from(activityPhotos)
    .where(eq(activityPhotos.roomId, roomId));

  const photosBySubmission = new Map<string, typeof allPhotos>();
  for (const photo of allPhotos) {
    if (!photosBySubmission.has(photo.submissionId)) {
      photosBySubmission.set(photo.submissionId, []);
    }
    photosBySubmission.get(photo.submissionId)!.push(photo);
  }

  const submissionsDto: ActivitySubmission[] = submissions.map((s) => ({
    id: s.id,
    roomId: s.roomId,
    activityId: s.activityId,
    photos: (photosBySubmission.get(s.id) || []).map((p) => ({
      // A media reference, not the stored public URL: the bucket is private,
      // so the object is reachable only through the authenticated route that
      // signs on demand. The stored photo_url is left in place for rows
      // written before this changed.
      url: buildMediaPath("activity-photo", p.id),
      key: p.photoKey,
      uploadedAt: p.createdAt.toISOString(),
    })),
    createdAt: s.createdAt.toISOString(),
    updatedAt: s.updatedAt.toISOString(),
  }));

  return {
    activityDefinitions: room.activityDefinitions || [],
    submissions: submissionsDto,
  };
};

/**
 * Validates that all required activities in the room have met their minimum photo quotas.
 * Throws 400 BadRequestError on failure.
 */
export const validateActivityQuotas = async (
  roomId: string,
  orgId: string,
  user: { id: string; role: UserRole; organizationId: string | null },
): Promise<void> => {
  const [room] = await db
    .select()
    .from(eventRooms)
    .where(
      and(
        eq(eventRooms.id, roomId),
        eq(eventRooms.organizationId, orgId),
        isNull(eventRooms.deletedAt),
      ),
    )
    .limit(1);

  if (!room) throw ApiError.notFound("Room not found");
  await assertRoomAccessForUser({ ...user, organizationId: orgId }, orgId, roomId);

  if (!room.activityDefinitions || room.activityDefinitions.length === 0) {
    return;
  }

  const allPhotos = await db
    .select()
    .from(activityPhotos)
    .where(eq(activityPhotos.roomId, roomId));

  const photoCountByActivity = new Map<string, number>();
  for (const photo of allPhotos) {
    photoCountByActivity.set(photo.activityId, (photoCountByActivity.get(photo.activityId) || 0) + 1);
  }

  for (const definition of room.activityDefinitions) {
    const photoCount = photoCountByActivity.get(definition.id) || 0;

    if (photoCount < definition.min_photos) {
      throw ApiError.badRequest(
        `Activity "${definition.title}" requires at least ${definition.min_photos} photos, but only has ${photoCount}.`,
      );
    }
  }
};
