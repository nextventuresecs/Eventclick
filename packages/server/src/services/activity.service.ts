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
} from "../db/schema";
import { ApiError } from "../utils/errors";
import {
  buildActivityPhotoKey,
  buildPublicUrl,
  createPresignedPut,
} from "./storage.service";
import { assertRoomAccessForUser } from "./event-assignment.service";

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
  await assertRoomAccessForUser(user, orgId, roomId);

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
  await assertRoomAccessForUser(user, orgId, roomId);

  // Validate activity definition exists
  const def = room.activityDefinitions.find((d) => d.id === input.activityId);
  if (!def) {
    throw ApiError.badRequest(`Activity with ID "${input.activityId}" is not defined for this room`);
  }

  // Check if a submission already exists for this activity in this room
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

  const newPhoto = {
    url: buildPublicUrl(input.photoKey),
    key: input.photoKey,
    uploadedAt: new Date().toISOString(),
  };

  let resultRow;

  if (existingSub) {
    const updatedPhotos = [...(existingSub.photos || []), newPhoto];
    const [updatedRow] = await db
      .update(activitySubmissions)
      .set({
        photos: updatedPhotos,
        updatedAt: new Date(),
      })
      .where(eq(activitySubmissions.id, existingSub.id))
      .returning();
    resultRow = updatedRow;
  } else {
    const [insertedRow] = await db
      .insert(activitySubmissions)
      .values({
        roomId,
        activityId: input.activityId,
        photos: [newPhoto],
      })
      .returning();
    resultRow = insertedRow;
  }

  if (!resultRow) {
    throw ApiError.internal("Failed to submit activity photo proof");
  }

  return {
    id: resultRow.id,
    roomId: resultRow.roomId,
    activityId: resultRow.activityId,
    photos: resultRow.photos,
    createdAt: resultRow.createdAt.toISOString(),
    updatedAt: resultRow.updatedAt.toISOString(),
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
  await assertRoomAccessForUser(user, orgId, roomId);

  const submissions = await db
    .select()
    .from(activitySubmissions)
    .where(eq(activitySubmissions.roomId, roomId));

  const submissionsDto: ActivitySubmission[] = submissions.map((s) => ({
    id: s.id,
    roomId: s.roomId,
    activityId: s.activityId,
    photos: s.photos || [],
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

  for (const definition of room.activityDefinitions) {
    const submission = submissionMap.get(definition.id);
    const photoCount = submission?.photos?.length || 0;

    if (photoCount < definition.min_photos) {
      throw ApiError.badRequest(
        `Activity "${definition.title}" requires at least ${definition.min_photos} photos, but only has ${photoCount}.`,
      );
    }
  }
};
