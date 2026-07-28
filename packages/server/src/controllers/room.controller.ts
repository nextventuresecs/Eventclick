import type { RequestHandler } from "express";
import { eq, and, desc, inArray, isNull, sql } from "drizzle-orm";
import { nanoid } from "nanoid";
import type {
  CreateRoomInput,
  EventRoom,
  LiveRole,
  SetYouTubeFallbackInput,
  UpdateRoomInput,
  UserRole,
} from "@application/shared";
import { extractYouTubeVideoId, hasRolePermission } from "@application/shared";
import { db } from "../db";
import { attendanceEntries, eventAdminAssignments, eventRooms, users, roomRecordings, type EventRoomRow } from "../db/schema";
import { env } from "../config/env";
import { ApiError } from "../utils/errors";
import { issueLiveToken, startRecording as livekitStartRecording, stopRecording as livekitStopRecording } from "../services/livekit.service";
import { getRoomPresence } from "../services/presence.service";
import { validateActivityQuotas } from "../services/activity.service";
import {
  attendanceCountForRoom,
  buildAttendanceCountMap,
} from "../services/attendance-counts.service";
import {
  assertRoomAccessForUser,
  assertRoomAccessWithRoom,
  listAssignedRoomIdsForUser,
} from "../services/event-assignment.service";
import { findUserById } from "../services/auth.service";

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
  attendanceWindowBefore: row.attendanceWindowBefore,
  attendanceWindowAfter: row.attendanceWindowAfter,
  location: row.location ?? null,
  latitude: row.latitude ?? null,
  longitude: row.longitude ?? null,
  activityDefinitions: row.activityDefinitions,
  cancellationReason: row.cancellationReason ?? null,
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
    const user = req.user!;

    // Default-deny: only admin sees all rooms; others see assigned only
    const needsAssignmentFilter = !hasRolePermission(user.role, "manage_users");
    const assignedRoomIds = needsAssignmentFilter
      ? await listAssignedRoomIdsForUser(orgId, user.id)
      : null;

    if (assignedRoomIds && assignedRoomIds.length === 0) {
      res.json({ items: [], limit, offset });
      return;
    }

    const rows = await db
      .select({
        room: eventRooms,
        attendanceCount: sql<number>`cast(count(${attendanceEntries.id}) as int)`,
      })
      .from(eventRooms)
      .leftJoin(
        attendanceEntries,
        and(
          eq(eventRooms.id, attendanceEntries.roomId),
          ...(user.role === "volunteer" ? [eq(attendanceEntries.submittedBy, user.id)] : [])
        )
      )
      .where(
        and(
          eq(eventRooms.organizationId, orgId),
          isNull(eventRooms.deletedAt),
          ...(assignedRoomIds ? [inArray(eventRooms.id, assignedRoomIds)] : []),
        ),
      )
      .groupBy(eventRooms.id)
      .orderBy(desc(eventRooms.createdAt))
      .limit(limit)
      .offset(offset);

    const items = rows.map(({ room, attendanceCount }) => ({
      ...toEventRoom(room),
      attendanceCount,
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
        attendanceWindowBefore: input.attendanceWindowBefore !== undefined ? input.attendanceWindowBefore : undefined,
        attendanceWindowAfter: input.attendanceWindowAfter !== undefined ? input.attendanceWindowAfter : undefined,
        location: input.location,
        latitude: input.latitude,
        longitude: input.longitude,
        activityDefinitions: input.activityDefinitions !== undefined ? input.activityDefinitions : undefined,
      })
      .returning();

    if (!row) throw ApiError.internal("Failed to create room");

    // Auto-assign the creator to the room if they need assignment-based access
    if (req.user!.role !== "admin") {
      await db
        .insert(eventAdminAssignments)
        .values({
          organizationId: orgId,
          userId: req.user!.id,
          roomId: row.id,
          assignedRole: req.user!.role,
          assignedBy: req.user!.id,
        })
        .onConflictDoUpdate({
          target: [eventAdminAssignments.userId, eventAdminAssignments.roomId],
          set: {
            revokedAt: null,
            assignedRole: req.user!.role,
            assignedBy: req.user!.id,
            updatedAt: new Date(),
          },
        });
    }

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
    await assertRoomAccessWithRoom(req.user!, orgId, id);

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
    await assertRoomAccessWithRoom(req.user!, orgId, id);

    const patch: Partial<typeof eventRooms.$inferInsert> = { updatedAt: new Date() };
    if (input.title !== undefined) patch.title = input.title;
    if (input.description !== undefined) patch.description = input.description;
    if (input.scheduledStart !== undefined) patch.scheduledStart = new Date(input.scheduledStart);
    if (input.scheduledEnd !== undefined) patch.scheduledEnd = new Date(input.scheduledEnd);
    if (input.maxParticipants !== undefined) patch.maxParticipants = input.maxParticipants;
    if (input.attendanceWindowBefore !== undefined) patch.attendanceWindowBefore = input.attendanceWindowBefore;
    if (input.attendanceWindowAfter !== undefined) patch.attendanceWindowAfter = input.attendanceWindowAfter;
    if (input.activityDefinitions !== undefined) patch.activityDefinitions = input.activityDefinitions;
    if (input.status !== undefined) {
      if (input.status === "ended") {
        await validateActivityQuotas(id, orgId, req.user!);
      }
      patch.status = input.status;
      if (input.status === "live") patch.actualStart = new Date();
      if (input.status === "ended" || input.status === "cancelled") patch.actualEnd = new Date();
    }
    if (input.cancellationReason !== undefined) {
      patch.cancellationReason = input.cancellationReason;
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

export const deleteRoom: RequestHandler = async (req, res, next) => {
  try {
    const orgId = requireOrgId(req.user!.organizationId);
    const id = req.params.id as string;
    await assertRoomAccessWithRoom(req.user!, orgId, id);

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

const roleForUser = (userRole: UserRole): LiveRole =>
  hasRolePermission(userRole, "manage_live_session")
    ? "publisher"
    : "viewer";

export const getLiveToken: RequestHandler = async (req, res, next) => {
  try {
    const orgId = requireOrgId(req.user!.organizationId);
    const id = req.params.id as string;
    await assertRoomAccessForUser(req.user!, orgId, id);

    const user = await findUserById(req.user!.id);

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
    await assertRoomAccessWithRoom(req.user!, orgId, id);

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
    await assertRoomAccessForUser(req.user!, orgId, id);

    await validateActivityQuotas(id, orgId, req.user!);

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

export const startRoomRecording: RequestHandler = async (req, res, next) => {
  try {
    const orgId = requireOrgId(req.user!.organizationId);
    const id = req.params.id as string;
    await assertRoomAccessForUser(req.user!, orgId, id);

    const recording = await livekitStartRecording(id);
    res.json(recording);
  } catch (err) {
    next(err);
  }
};

export const stopRoomRecording: RequestHandler = async (req, res, next) => {
  try {
    const orgId = requireOrgId(req.user!.organizationId);
    const id = req.params.id as string;
    await assertRoomAccessForUser(req.user!, orgId, id);

    const { egressId } = req.body;
    if (!egressId) throw ApiError.badRequest("egressId is required to stop recording");

    const recording = await livekitStopRecording(egressId);
    res.json(recording);
  } catch (err) {
    next(err);
  }
};

export const getPresence: RequestHandler = async (req, res, next) => {
  try {
    const orgId = requireOrgId(req.user!.organizationId);
    const id = req.params.id as string;
    await assertRoomAccessForUser(req.user!, orgId, id);
    res.json(await getRoomPresence(id, orgId));
  } catch (err) {
    next(err);
  }
};

export const getActiveRecording: RequestHandler = async (req, res, next) => {
  try {
    const orgId = requireOrgId(req.user!.organizationId);
    const id = req.params.id as string;
    await assertRoomAccessForUser(req.user!, orgId, id);

    const [recording] = await db
      .select()
      .from(roomRecordings)
      .where(
        eq(roomRecordings.roomId, id)
      )
      .orderBy(desc(roomRecordings.startedAt))
      .limit(1);

    if (!recording || recording.status === "completed") {
      res.json(null);
      return;
    }

    res.json(recording);
  } catch (err) {
    next(err);
  }
};
