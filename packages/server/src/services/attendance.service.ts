import { and, desc, eq, gte, isNull, lte } from "drizzle-orm";
import { z } from "zod";
import type {
  AttendanceEntry,
  FormField,
  SubmitAttendanceInput,
  UserRole,
  RoomStatus,
} from "@application/shared";
import { buildMediaPath } from "@application/shared";
import { db } from "../db";
import {
  attendanceEntries,
  eventRooms,
  formDefinitions,
  type AttendanceEntryRow,
  type FormDefinitionRow,
} from "../db/schema";
import { ApiError } from "../utils/errors";
import { buildLiveAttendanceWindow, isWithinAttendanceWindow } from "./attendance-live-window.service";
import { buildPublicUrl, verifyStorageObject } from "./storage.service";
import { assertRoomAccessWithRoom } from "./event-assignment.service";
import { env } from "../config/env";
import { redisClient } from "../config/redis";
import { logger } from "../utils/logger";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const PHONE_RE = /^\+?[0-9\s\-()]{7,20}$/;

const toAttendanceEntry = (row: AttendanceEntryRow): AttendanceEntry => ({
  id: row.id,
  roomId: row.roomId,
  formDefinitionId: row.formDefinitionId,
  data: row.data,
  // A media reference when the entry has a photo, so the private object is
  // reachable through the authenticated route rather than a public URL.
  photoUrl: row.photoKey ? buildMediaPath("attendance", row.id) : null,
  submittedAt: row.submittedAt.toISOString(),
});

const getRoomInOrg = async (
  roomId: string,
  orgId: string,
): Promise<{
  id: string;
  status: RoomStatus;
  scheduledStart: Date;
  scheduledEnd: Date;
  actualStart: Date | null;
  actualEnd: Date | null;
  attendanceWindowBefore: number;
  attendanceWindowAfter: number;
}> => {
  const [room] = await db
    .select({
      id: eventRooms.id,
      status: eventRooms.status,
      scheduledStart: eventRooms.scheduledStart,
      scheduledEnd: eventRooms.scheduledEnd,
      actualStart: eventRooms.actualStart,
      actualEnd: eventRooms.actualEnd,
      attendanceWindowBefore: eventRooms.attendanceWindowBefore,
      attendanceWindowAfter: eventRooms.attendanceWindowAfter,
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
  if (!room) throw ApiError.notFound("Room not found");
  return room;
};

export const assertRoomInOrg = async (roomId: string, orgId: string): Promise<void> => {
  await getRoomInOrg(roomId, orgId);
};

interface RoomAccessPrincipal {
  id: string;
  role: UserRole;
}

const assertRoomAccess = async (
  roomId: string,
  orgId: string,
  user: RoomAccessPrincipal,
): Promise<{
  id: string;
  status: RoomStatus;
  scheduledStart: Date;
  scheduledEnd: Date;
  actualStart: Date | null;
  actualEnd: Date | null;
  attendanceWindowBefore: number;
  attendanceWindowAfter: number;
}> => {
  const room = await getRoomInOrg(roomId, orgId);
  await assertRoomAccessWithRoom({ ...user, organizationId: orgId }, orgId, roomId);
  return room;
};

const fieldSchema = (field: FormField): z.ZodTypeAny => {
  switch (field.type) {
    case "text": {
      let s: z.ZodString = z.string().max(500);
      if (field.required) s = s.min(1, "required");
      return s;
    }
    case "email": {
      let s: z.ZodString = z.string().regex(EMAIL_RE, "invalid email");
      if (field.required) s = s.min(1, "required");
      return s;
    }
    case "phone": {
      let s: z.ZodString = z.string().regex(PHONE_RE, "invalid phone");
      if (field.required) s = s.min(1, "required");
      return s;
    }
    case "number":
      return z.number();
    case "select":
      return z.enum(field.options && field.options.length > 0 ? field.options as [string, ...string[]] : ["__empty__"]);
    case "checkbox":
      return z.boolean();
    case "date": {
      let s: z.ZodString = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "invalid date");
      if (field.required) s = s.min(1, "required");
      return s;
    }
  }
};

export const validateAndCoerceData = (
  fields: FormField[],
  raw: Record<string, unknown>,
): Record<string, string | number | boolean | null> => {
  const result: Record<string, string | number | boolean | null> = {};
  const issues: Record<string, string> = {};

  for (const field of fields) {
    const value = raw[field.id];
    const optional = !field.required;

    if (value === undefined || value === null || value === "") {
      if (field.required) issues[field.id] = "required";
      else result[field.id] = null;
      continue;
    }

    const schema = fieldSchema(field);
    const parsed = schema.safeParse(value);
    if (!parsed.success) {
      issues[field.id] = parsed.error.issues[0]?.message ?? "invalid";
      continue;
    }
    result[field.id] = parsed.data as string | number | boolean;
    void optional;
  }

  if (Object.keys(issues).length > 0) {
    throw ApiError.badRequest("Attendance data validation failed", issues);
  }

  return result;
};

interface SubmitContext {
  roomId: string;
  orgId: string;
  submittedBy: string | null;
  user: RoomAccessPrincipal;
  input: SubmitAttendanceInput;
  ipAddress?: string;
  userAgent?: string;
}

export const submitAttendance = async (
  ctx: SubmitContext,
): Promise<AttendanceEntry> => {
  const room = await assertRoomAccess(ctx.roomId, ctx.orgId, ctx.user);

  // 1. Check idempotency if key provided
  const idempKey = ctx.input.idempotencyKey
    ? `idemp:attendance:${ctx.orgId}:${ctx.roomId}:${ctx.input.idempotencyKey}`
    : null;

  if (idempKey && redisClient.isOpen) {
    try {
      const cached = await redisClient.get(idempKey);
      if (cached) {
        return JSON.parse(cached) as AttendanceEntry;
      }
    } catch (err) {
      logger.warn({ err, idempKey }, "[attendance] failed to read idempotency cache");
    }
  }

  const now = new Date();
  const isAllowed = isWithinAttendanceWindow(
    room,
    now,
    room.attendanceWindowBefore ?? env.ATTENDANCE_WINDOW_BEFORE_MINUTES,
    room.attendanceWindowAfter ?? env.ATTENDANCE_WINDOW_AFTER_MINUTES,
  );
  if (!isAllowed) {
    throw ApiError.badRequest("Attendance can only be submitted during the active window");
  }

  const [formDef] = await db
    .select()
    .from(formDefinitions)
    .where(eq(formDefinitions.id, ctx.input.formDefinitionId))
    .limit(1) as FormDefinitionRow[];

  if (!formDef || formDef.roomId !== ctx.roomId) {
    throw ApiError.badRequest("Form definition does not belong to this room");
  }

  const data = validateAndCoerceData(formDef.fields, ctx.input.data);

  if (ctx.input.photoKey) {
    await verifyStorageObject(ctx.input.photoKey, {
      expectedPrefix: `attendance/${ctx.roomId}/`,
    });
  }

  const photoUrl = ctx.input.photoKey ? buildPublicUrl(ctx.input.photoKey) : null;

  const [row] = await db
    .insert(attendanceEntries)
    .values({
      roomId: ctx.roomId,
      organizationId: ctx.orgId,
      formDefinitionId: formDef.id,
      submittedBy: ctx.submittedBy,
      data,
      photoKey: ctx.input.photoKey ?? null,
      photoUrl,
      latitude: ctx.input.latitude ?? null,
      longitude: ctx.input.longitude ?? null,
      location:
        ctx.input.latitude != null && ctx.input.longitude != null
          ? { x: ctx.input.longitude, y: ctx.input.latitude }
          : null,
      ipAddress: ctx.ipAddress ?? null,
      userAgent: ctx.userAgent ?? null,
    })
    .returning();

  if (!row) throw ApiError.internal("Failed to record attendance");
  const entry = toAttendanceEntry(row);

  // 2. Cache response under idempotency key for 24 hours
  if (idempKey && redisClient.isOpen) {
    try {
      await redisClient.set(idempKey, JSON.stringify(entry), { EX: 86400 });
    } catch (err) {
      logger.warn({ err, idempKey }, "[attendance] failed to write idempotency cache");
    }
  }

  return entry;
};

export const listAttendance = async (
  roomId: string,
  orgId: string,
  user: RoomAccessPrincipal,
  opts: { limit?: number; offset?: number; liveOnly?: boolean } = {},
): Promise<AttendanceEntry[]> => {
  const room = await assertRoomAccess(roomId, orgId, user);

  const limit = Math.min(Math.max(opts.limit ?? 50, 1), 200);
  const offset = Math.max(opts.offset ?? 0, 0);
  const whereClauses = [eq(attendanceEntries.roomId, roomId)];

  if (user.role === "volunteer") {
    whereClauses.push(eq(attendanceEntries.submittedBy, user.id));
  }

  if (opts.liveOnly) {
    const liveWindow = buildLiveAttendanceWindow(room.actualStart, room.actualEnd);
    if (!liveWindow) return [];
    whereClauses.push(gte(attendanceEntries.submittedAt, liveWindow.start));
    if (liveWindow.end) {
      whereClauses.push(lte(attendanceEntries.submittedAt, liveWindow.end));
    }
  }

  const rows = await db
    .select()
    .from(attendanceEntries)
    .where(and(...whereClauses))
    .orderBy(desc(attendanceEntries.submittedAt))
    .limit(limit)
    .offset(offset);

  return rows.map(toAttendanceEntry);
};
