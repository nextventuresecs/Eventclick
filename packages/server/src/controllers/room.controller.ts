import type { RequestHandler } from "express";
import { eq, and, desc, inArray, isNull, sql } from "drizzle-orm";
import { nanoid } from "nanoid";
import type {
  CreateRoomInput,
  EventRoom,
  LiveRole,
  SetYouTubeFallbackInput,
  UpdateRoomInput,
} from "@application/shared";
import { extractYouTubeVideoId } from "@application/shared";
import { db } from "../db";
import { attendanceEntries, eventRooms, users, type EventRoomRow } from "../db/schema";
import { env } from "../config/env";
import { ApiError } from "../utils/errors";
import { issueLiveToken } from "../services/livekit.service";
import { getRoomPresence } from "../services/presence.service";
import {
  attendanceCountForRoom,
  buildAttendanceCountMap,
} from "../services/attendance-counts.service";

const toEventRoom = (row: EventRoomRow): EventRoom => ({
  id: row.id,
  organizationId: row.organizationId,
  createdBy: row.createdBy,
  title: row.title,
  description: row.description,
  status: row.status,
  scheduledStart: row.scheduledStart.toISOString(),
  scheduledEnd: row.scheduledEnd.toISOString(),
  actualStart: row.actualStart?.toISOString() ?? null,
  actualEnd: row.actualEnd?.toISOString() ?? null,
  maxParticipants: row.maxParticipants,
  shareToken: row.shareToken,
  shareUrl: `${env.APP_URL}/watch/${row.shareToken}`,
  streamProvider: row.streamProvider,
  youtubeWatchUrl: row.youtubeWatchUrl,
  youtubeEmbedUrl: row.youtubeEmbedUrl,
  createdAt: row.createdAt.toISOString(),
  updatedAt: row.updatedAt.toISOString(),
});

const requireOrgId = (organizationId: string | null): string => {
  if (!organizationId) throw ApiError.badRequest("User has no organization");
  return organizationId;
};

export const listRooms: RequestHandler = async (req, res, next) => {
  try {
    const orgId = requireOrgId(req.user!.organizationId);
    const limit = Math.min(Math.max(Number(req.query.limit) || 50, 1), 100);
    const offset = Math.max(Number(req.query.offset) || 0, 0);

    const rows = await db
      .select()
      .from(eventRooms)
      .where(and(eq(eventRooms.organizationId, orgId), isNull(eventRooms.deletedAt)))
      .orderBy(desc(eventRooms.createdAt))
      .limit(limit)
      .offset(offset);

    const roomIds = rows.map((row) => row.id);
    const attendanceCounts =
      roomIds.length === 0
        ? []
        : await db
            .select({
              roomId: attendanceEntries.roomId,
              count: sql<number>`count(*)`.mapWith(Number),
            })
            .from(attendanceEntries)
            .where(inArray(attendanceEntries.roomId, roomIds))
            .groupBy(attendanceEntries.roomId);

    const countsByRoomId = buildAttendanceCountMap(attendanceCounts);
    const items = rows.map((row) => ({
      ...toEventRoom(row),
      attendanceCount: attendanceCountForRoom(countsByRoomId, row.id),
    }));

    res.json({ items, limit, offset });
  } catch (err) {
    next(err);
  }
};

export const createRoom: RequestHandler = async (req, res, next) => {
  try {
    const orgId = requireOrgId(req.user!.organizationId);
    const input = req.body as CreateRoomInput;

    const [row] = await db
      .insert(eventRooms)
      .values({
        organizationId: orgId,
        createdBy: req.user!.id,
        title: input.title,
        description: input.description,
        scheduledStart: new Date(input.scheduledStart),
        scheduledEnd: new Date(input.scheduledEnd),
        maxParticipants: input.maxParticipants,
        shareToken: nanoid(32),
      })
      .returning();

    if (!row) throw ApiError.internal("Failed to create room");
    res.status(201).json(toEventRoom(row));
  } catch (err) {
    next(err);
  }
};

export const getRoom: RequestHandler = async (req, res, next) => {
  try {
    const orgId = requireOrgId(req.user!.organizationId);
    const id = req.params.id as string;

    const [row] = await db
      .select()
      .from(eventRooms)
      .where(
        and(
          eq(eventRooms.id, id),
          eq(eventRooms.organizationId, orgId),
          isNull(eventRooms.deletedAt),
        ),
      )
      .limit(1);

    if (!row) throw ApiError.notFound("Room not found");
    res.json(toEventRoom(row));
  } catch (err) {
    next(err);
  }
};

export const updateRoom: RequestHandler = async (req, res, next) => {
  try {
    const orgId = requireOrgId(req.user!.organizationId);
    const id = req.params.id as string;
    const input = req.body as UpdateRoomInput;

    const patch: Partial<typeof eventRooms.$inferInsert> = { updatedAt: new Date() };
    if (input.title !== undefined) patch.title = input.title;
    if (input.description !== undefined) patch.description = input.description;
    if (input.scheduledStart !== undefined) patch.scheduledStart = new Date(input.scheduledStart);
    if (input.scheduledEnd !== undefined) patch.scheduledEnd = new Date(input.scheduledEnd);
    if (input.maxParticipants !== undefined) patch.maxParticipants = input.maxParticipants;
    if (input.status !== undefined) {
      patch.status = input.status;
      if (input.status === "live") patch.actualStart = new Date();
      if (input.status === "ended" || input.status === "cancelled") patch.actualEnd = new Date();
    }

    const [row] = await db
      .update(eventRooms)
      .set(patch)
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

export const setYouTubeFallback: RequestHandler = async (req, res, next) => {
  try {
    const orgId = requireOrgId(req.user!.organizationId);
    const id = req.params.id as string;
    const { youtubeWatchUrl } = req.body as SetYouTubeFallbackInput;

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

export const deleteRoom: RequestHandler = async (req, res, next) => {
  try {
    const orgId = requireOrgId(req.user!.organizationId);
    const id = req.params.id as string;

    const [deleted] = await db
      .update(eventRooms)
      .set({ deletedAt: new Date(), updatedAt: new Date() })
      .where(
        and(
          eq(eventRooms.id, id),
          eq(eventRooms.organizationId, orgId),
          isNull(eventRooms.deletedAt),
        ),
      )
      .returning({ id: eventRooms.id });

    if (!deleted) throw ApiError.notFound("Room not found");
    res.status(204).end();
  } catch (err) {
    next(err);
  }
};

const roleForUser = (userRole: string): LiveRole =>
  userRole === "super_admin" || userRole === "event_admin" || userRole === "organizer"
    ? "publisher"
    : "viewer";

export const getLiveToken: RequestHandler = async (req, res, next) => {
  try {
    const orgId = requireOrgId(req.user!.organizationId);
    const id = req.params.id as string;

    const [user] = await db
      .select({ fullName: users.fullName })
      .from(users)
      .where(eq(users.id, req.user!.id))
      .limit(1);

    const token = await issueLiveToken({
      roomId: id,
      orgId,
      userId: req.user!.id,
      userName: user?.fullName ?? req.user!.id,
      role: roleForUser(req.user!.role),
    });

    res.json(token);
  } catch (err) {
    next(err);
  }
};

export const startLive: RequestHandler = async (req, res, next) => {
  try {
    const orgId = requireOrgId(req.user!.organizationId);
    const id = req.params.id as string;

    const [row] = await db
      .update(eventRooms)
      .set({ status: "live", actualStart: new Date(), updatedAt: new Date() })
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

export const stopLive: RequestHandler = async (req, res, next) => {
  try {
    const orgId = requireOrgId(req.user!.organizationId);
    const id = req.params.id as string;

    const [row] = await db
      .update(eventRooms)
      .set({ status: "ended", actualEnd: new Date(), updatedAt: new Date() })
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

export const getPresence: RequestHandler = async (req, res, next) => {
  try {
    const orgId = requireOrgId(req.user!.organizationId);
    const id = req.params.id as string;
    res.json(await getRoomPresence(id, orgId));
  } catch (err) {
    next(err);
  }
};
