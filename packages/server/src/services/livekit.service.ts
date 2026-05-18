import { AccessToken, EgressClient, EncodedFileOutput, EncodedFileType, S3Upload } from "livekit-server-sdk";
import { and, eq, isNull } from "drizzle-orm";
import type { LiveRole, LiveTokenResponse } from "@application/shared";
import { db } from "../db";
import { eventRooms, roomRecordings } from "../db/schema";
import { env } from "../config/env";
import { ApiError } from "../utils/errors";

const TOKEN_TTL_SECONDS = 2 * 60 * 60;

const egressClient = new EgressClient(
  env.LIVEKIT_URL,
  env.LIVEKIT_API_KEY,
  env.LIVEKIT_API_SECRET
);

export const roomNameFor = (roomId: string) => `evently-${roomId}`;

export interface SignTokenInput {
  roomId: string;
  identity: string;
  userName: string;
  role: LiveRole;
}

export const signLiveToken = async (
  input: SignTokenInput,
): Promise<LiveTokenResponse> => {
  const roomName = roomNameFor(input.roomId);

  const at = new AccessToken(env.LIVEKIT_API_KEY, env.LIVEKIT_API_SECRET, {
    identity: input.identity,
    name: input.userName,
    ttl: TOKEN_TTL_SECONDS,
  });

  at.addGrant({
    room: roomName,
    roomJoin: true,
    canSubscribe: true,
    canPublish: input.role === "publisher",
    canPublishData: input.role === "publisher",
  });

  const token = await at.toJwt();

  return {
    token,
    url: env.LIVEKIT_PUBLIC_URL,
    identity: input.identity,
    roomName,
    role: input.role,
  };
};

export interface IssueTokenInput {
  roomId: string;
  orgId: string;
  userId: string;
  userName: string;
  role: LiveRole;
}

export const issueLiveToken = async (
  input: IssueTokenInput,
): Promise<LiveTokenResponse> => {
  const [room] = await db
    .select({
      id: eventRooms.id,
      streamProvider: eventRooms.streamProvider,
    })
    .from(eventRooms)
    .where(
      and(
        eq(eventRooms.id, input.roomId),
        eq(eventRooms.organizationId, input.orgId),
        isNull(eventRooms.deletedAt),
      ),
    )
    .limit(1);

  if (!room) throw ApiError.notFound("Room not found");
  if (room.streamProvider !== "livekit") {
    throw ApiError.badRequest(
      "Room is using a non-LiveKit provider. Clear fallback first.",
    );
  }

  return signLiveToken({
    roomId: input.roomId,
    identity: input.userId,
    userName: input.userName,
    role: input.role,
  });
};

export const startRecording = async (roomId: string) => {
  const roomName = roomNameFor(roomId);
  const s3Key = `recordings/${roomName}/${Date.now()}.mp4`;

  // Start the Egress job in LiveKit
  const info = await egressClient.startRoomCompositeEgress(
    roomName,
    {
      file: new EncodedFileOutput({
        filepath: s3Key,
        fileType: EncodedFileType.MP4,
        output: {
          case: "s3",
          value: new S3Upload({
            accessKey: env.S3_ACCESS_KEY,
            secret: env.S3_SECRET_KEY,
            bucket: env.S3_BUCKET,
            endpoint: env.S3_ENDPOINT,
            region: env.S3_REGION,
            forcePathStyle: env.S3_FORCE_PATH_STYLE,
          }),
        },
      })
    }
  );

  // Save the metadata in our local database
  const [recording] = await db
    .insert(roomRecordings)
    .values({
      roomId,
      egressId: info.egressId,
      s3Key,
      status: "pending",
      startedAt: new Date(),
    })
    .returning();

  return recording;
};

export const stopRecording = async (egressId: string) => {
  await egressClient.stopEgress(egressId);

  const [recording] = await db
    .update(roomRecordings)
    .set({
      status: "completed",
      endedAt: new Date(),
    })
    .where(eq(roomRecordings.egressId, egressId))
    .returning();

  return recording;
};
