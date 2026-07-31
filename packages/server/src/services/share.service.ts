import { and, eq, isNull } from "drizzle-orm";
import type { LiveTokenResponse, SharedRoom } from "@application/shared";
import { db } from "../db";
import { eventRooms, type EventRoomRow } from "../db/schema";
import { ApiError } from "../utils/errors";
import { streamingService } from "./streaming";

const toSharedRoom = (row: EventRoomRow): SharedRoom => ({
  id: row.id,
  title: row.title,
  description: row.description,
  status: row.status,
  scheduledStart: row.scheduledStart.toISOString(),
  scheduledEnd: row.scheduledEnd.toISOString(),
  actualStart: row.actualStart?.toISOString() ?? null,
  actualEnd: row.actualEnd?.toISOString() ?? null,
  streamProvider: row.streamProvider,
  youtubeEmbedUrl: row.youtubeEmbedUrl,
  attendanceWindowBefore: row.attendanceWindowBefore,
  attendanceWindowAfter: row.attendanceWindowAfter,
});

const findRoomByShareToken = async (token: string): Promise<EventRoomRow> => {
  const [row] = await db
    .select()
    .from(eventRooms)
    .where(and(eq(eventRooms.shareToken, token), isNull(eventRooms.deletedAt)))
    .limit(1);

  if (!row) throw ApiError.notFound("Room not found");
  if (row.status === "cancelled") throw ApiError.forbidden("Room cancelled");
  return row;
};

export const getSharedRoomByToken = async (token: string): Promise<SharedRoom> => {
  const row = await findRoomByShareToken(token);
  return toSharedRoom(row);
};

export const issueShareViewerToken = async (
  token: string,
  guestIdentity: string,
  guestName: string,
): Promise<LiveTokenResponse> => {
  const row = await findRoomByShareToken(token);

  if (row.streamProvider !== "livekit") {
    throw ApiError.badRequest("Room is not using LiveKit");
  }

  return streamingService.issueGuestToken(row.id, guestIdentity, guestName);
};
