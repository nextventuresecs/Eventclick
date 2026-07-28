import type { RequestHandler } from "express";
import { eq, and, isNull } from "drizzle-orm";
import type { SetYouTubeFallbackInput } from "@application/shared";
import { extractYouTubeVideoId } from "@application/shared";
import { db } from "../../db";
import { eventRooms } from "../../db/schema";
import { ApiError } from "../../utils/errors";
import { assertRoomAccessWithRoom } from "../../services/event-assignment.service";
import { requireOrgId, toEventRoom } from "./room-helpers";

export const setYouTubeFallback: RequestHandler = async (req, res, next) => {
  try {
    const orgId = requireOrgId(req.user!.organizationId);
    const id = req.params.id as string;
    const { youtubeWatchUrl } = req.body as SetYouTubeFallbackInput;
    await assertRoomAccessWithRoom(req.user!, orgId, id);

    const videoId = extractYouTubeVideoId(youtubeWatchUrl);
    if (!videoId) throw ApiError.badRequest("Could not extract YouTube video ID");
    const youtubeEmbedUrl = `https://www.youtube.com/embed/${videoId}?autoplay=1`;

    const [row] = await db
      .update(eventRooms)
      .set({
        streamProvider: "youtube",
        youtubeWatchUrl,
        youtubeEmbedUrl,
        updatedAt: new Date(),
      })
      .where(
        and(
          eq(eventRooms.id, id),
          eq(eventRooms.organizationId, orgId),
          isNull(eventRooms.deletedAt),
        ),
      )
      .returning();

    if (!row) throw ApiError.notFound("Room not found");
    res.json(toEventRoom(row));
  } catch (err) {
    next(err);
  }
};

export const clearFallback: RequestHandler = async (req, res, next) => {
  try {
    const orgId = requireOrgId(req.user!.organizationId);
    const id = req.params.id as string;
    await assertRoomAccessWithRoom(req.user!, orgId, id);

    const [row] = await db
      .update(eventRooms)
      .set({
        streamProvider: "livekit",
        youtubeWatchUrl: null,
        youtubeEmbedUrl: null,
        updatedAt: new Date(),
      })
      .where(
        and(
          eq(eventRooms.id, id),
          eq(eventRooms.organizationId, orgId),
          isNull(eventRooms.deletedAt),
        ),
      )
      .returning();

    if (!row) throw ApiError.notFound("Room not found");
    res.json(toEventRoom(row));
  } catch (err) {
    next(err);
  }
};
