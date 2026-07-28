import { and, eq, isNull } from "drizzle-orm";
import type { PresenceSnapshot } from "@application/shared";
import { db } from "../db";
import { eventRooms } from "../db/schema";
import { ApiError } from "../utils/errors";
import { streamingService } from "./streaming";
import { cacheGet, cacheSet } from "./cache.service";

const countParticipants = async (roomId: string): Promise<number> => {
  const cacheKey = `presence:${roomId}`;
  const cached = await cacheGet<number>(cacheKey);
  if (cached !== null) {
    return cached;
  }

  const count = await streamingService.getParticipantCount(roomId);
  await cacheSet(cacheKey, count, 10);
  return count;
};

const snapshot = (roomId: string, count: number): PresenceSnapshot => ({
  roomId,
  count,
  updatedAt: new Date().toISOString(),
});

export const getRoomPresence = async (
  roomId: string,
  orgId: string,
): Promise<PresenceSnapshot> => {
  const [row] = await db
    .select({
      id: eventRooms.id,
      streamProvider: eventRooms.streamProvider,
    })
    .from(eventRooms)
    .where(
      and(
        eq(eventRooms.id, roomId),
        eq(eventRooms.organizationId, orgId),
        isNull(eventRooms.deletedAt),
      ),
    )
    .limit(1);

  if (!row) throw ApiError.notFound("Room not found");

  const count =
    row.streamProvider === "livekit" ? await countParticipants(roomId) : 0;
  return snapshot(roomId, count);
};

export const getSharePresence = async (
  token: string,
): Promise<PresenceSnapshot> => {
  const [row] = await db
    .select({
      id: eventRooms.id,
      streamProvider: eventRooms.streamProvider,
      status: eventRooms.status,
    })
    .from(eventRooms)
    .where(and(eq(eventRooms.shareToken, token), isNull(eventRooms.deletedAt)))
    .limit(1);

  if (!row || row.status === "cancelled") {
    throw ApiError.notFound("Room not found");
  }

  const count =
    row.streamProvider === "livekit" ? await countParticipants(row.id) : 0;
  return snapshot(row.id, count);
};
