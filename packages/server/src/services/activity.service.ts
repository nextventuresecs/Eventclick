import { and, eq, isNull } from "drizzle-orm";
import type {
  ActivityDefinition,
  ActivitySubmission,
  SubmitActivityPhotoInput,
  ActivityPhotoUploadRequestInput,
  PhotoUploadResponse,
} from "@application/shared";
import { db } from "../db";
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
} from "./storage.service";
import { assertRoomAccessForUser, assertRoomAccessWithRoom } from "./event-assignment.service";

/**
 * Generates a presigned URL to upload a photo proof for a specific activity.
 */
export const presignActivityPhoto = async (
  roomId: string,
  orgId: string,
  user: any,
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
  const { uploadUrl, expiresIn } = await createPresignedPut(key, input.contentType);
  const publicUrl = buildPublicUrl(key);

  return { uploadUrl, key, publicUrl, expiresIn };
};

/**
 * Submits a completed photo proof, appending it to the activity's submissions.
 */
export const submitActivityPhoto = async (
  roomId: string,
  orgId: string,
  user: any,
  input: SubmitActivityPhotoInput,
): Promise<ActivitySubmission> => {
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

  // Check if a submission already exists for this activity in this room
  const [existingSubRow] = await db
    .select()
    .from(activitySubmissions)
    .where(
      and(
        eq(activitySubmissions.roomId, roomId),
        eq(activitySubmissions.activityId, input.activityId),
      ),
    )
    .limit(1);

  let existingSub = existingSubRow;
  if (!existingSub) {
    const [insertedRow] = await db
      .insert(activitySubmissions)
      .values({
        roomId,
        activityId: input.activityId,
      })
      .returning();
    existingSub = insertedRow;
  }

  if (!existingSub) {
    throw ApiError.internal("Failed to create activity submission");
  }

  // Count existing photos to enforce 50-limit
  const countResult = await db
    .select({ count: sql<number>`count(*)` })
    .from(activityPhotos)
    .where(eq(activityPhotos.submissionId, existingSub.id));
  
  const currentCount = countResult[0]?.count ?? 0;
  
  if (Number(currentCount) >= 50) {
    throw ApiError.badRequest("Maximum of 50 photos allowed per activity");
  }

  await db.insert(activityPhotos).values({
    submissionId: existingSub.id,
    roomId,
    activityId: input.activityId,
    photoKey: input.photoKey,
    photoUrl: buildPublicUrl(input.photoKey),
    submittedBy: user.id,
  });

  const allPhotos = await db
    .select()
    .from(activityPhotos)
    .where(eq(activityPhotos.submissionId, existingSub.id))
    .orderBy(activityPhotos.createdAt);

  return {
    id: existingSub.id,
    roomId: existingSub.roomId,
    activityId: existingSub.activityId,
    photos: allPhotos.map((p) => ({
      url: p.photoUrl,
      key: p.photoKey,
      uploadedAt: p.createdAt.toISOString(),
    })),
    createdAt: existingSub.createdAt.toISOString(),
    updatedAt: existingSub.updatedAt.toISOString(),
  };
};

/**
 * Lists defined activities and their current submissions in the room.
 */
export const listRoomActivities = async (
  roomId: string,
  orgId: string,
  user: any,
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
  await assertRoomAccessWithRoom({ ...user, organizationId: orgId }, orgId, roomId);

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
      url: p.photoUrl,
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

  if (!room.activityDefinitions || room.activityDefinitions.length === 0) {
    return;
  }

  const submissions = await db
    .select()
    .from(activitySubmissions)
    .where(eq(activitySubmissions.roomId, roomId));

  const submissionMap = new Map(submissions.map((s) => [s.activityId, s]));
  
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
