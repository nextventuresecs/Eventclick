import { AccessToken } from "livekit-server-sdk";
import { and, eq, isNull } from "drizzle-orm";
import type { LiveRole, LiveTokenResponse } from "@application/shared";
import { db } from "../db";
import { eventRooms } from "../db/schema";
import { env } from "../config/env";
import { ApiError } from "../utils/errors";

const TOKEN_TTL_SECONDS = 2 * 60 * 60;

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
