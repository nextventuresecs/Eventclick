import type { RequestHandler } from "express";
import { eq, and, desc, inArray, isNull, sql } from "drizzle-orm";
import { nanoid } from "nanoid";
import type { CreateRoomInput, UpdateRoomInput } from "@application/shared";
import { hasRolePermission } from "@application/shared";
import { db } from "../../db";
import { eventRooms, attendanceEntries, eventAdminAssignments } from "../../db/schema";
import { ApiError } from "../../utils/errors";
import { validateActivityQuotas } from "../../services/activity.service";
import {
  assertRoomAccessWithRoom,
  listAssignedRoomIdsForUser,
} from "../../services/event-assignment.service";
import { requireOrgId, toEventRoom } from "./room-helpers";

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

    // Step 1: Fetch paginated rooms first (Eliminates massive JOIN/GROUP BY bottleneck)
    const rooms = await db
      .select()
      .from(eventRooms)
      .where(
        and(
          eq(eventRooms.organizationId, orgId),
          isNull(eventRooms.deletedAt),
          ...(assignedRoomIds ? [inArray(eventRooms.id, assignedRoomIds)] : []),
        ),
      )
      .orderBy(desc(eventRooms.createdAt))
      .limit(limit)
      .offset(offset);

    if (rooms.length === 0) {
      res.json({ items: [], limit, offset });
      return;
    }

    // Step 2: Fetch attendance counts ONLY for the paginated room IDs
    const roomIds = rooms.map(r => r.id);
    const countRows = await db
      .select({
        roomId: attendanceEntries.roomId,
        count: sql<number>`cast(count(${attendanceEntries.id}) as int)`,
      })
      .from(attendanceEntries)
      .where(
        and(
          inArray(attendanceEntries.roomId, roomIds),
          ...(user.role === "volunteer" ? [eq(attendanceEntries.submittedBy, user.id)] : [])
        )
      )
      .groupBy(attendanceEntries.roomId);

    const countMap = Object.fromEntries(countRows.map(r => [r.roomId, r.count]));

    const items = rooms.map((room) => ({
      ...toEventRoom(room),
      attendanceCount: countMap[room.id] || 0,
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
        notifyEmailOnStart: input.notifyEmailOnStart !== undefined ? input.notifyEmailOnStart : undefined,
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
    if (input.notifyEmailOnStart !== undefined) patch.notifyEmailOnStart = input.notifyEmailOnStart;
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
