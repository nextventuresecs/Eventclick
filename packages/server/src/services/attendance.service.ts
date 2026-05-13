import { and, desc, eq, gte, isNull, lte } from "drizzle-orm";
import { z } from "zod";
import type {
  AttendanceEntry,
  FormField,
  SubmitAttendanceInput,
} from "@application/shared";
import { db } from "../db";
import {
  attendanceEntries,
  eventRooms,
  formDefinitions,
  type AttendanceEntryRow,
  type FormDefinitionRow,
} from "../db/schema";
import { ApiError } from "../utils/errors";
import { buildPublicUrl } from "./storage.service";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const PHONE_RE = /^\+?[0-9\s\-()]{7,20}$/;

const toAttendanceEntry = (row: AttendanceEntryRow): AttendanceEntry => ({
  id: row.id,
  roomId: row.roomId,
  formDefinitionId: row.formDefinitionId,
  data: row.data,
  photoUrl: row.photoUrl,
  submittedAt: row.submittedAt.toISOString(),
});

const getRoomInOrg = async (
  roomId: string,
  orgId: string,
): Promise<{
  id: string;
  actualStart: Date | null;
  actualEnd: Date | null;
}> => {
  const [room] = await db
    .select({
      id: eventRooms.id,
      actualStart: eventRooms.actualStart,
      actualEnd: eventRooms.actualEnd,
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

export const buildLiveAttendanceWindow = (
  actualStart: Date | null,
  actualEnd: Date | null,
): { start: Date; end: Date | null } | null => {
  if (!actualStart) return null;
  return { start: actualStart, end: actualEnd };
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
  }
};

const validateAndCoerceData = (
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
  input: SubmitAttendanceInput;
  ipAddress?: string;
  userAgent?: string;
}

export const submitAttendance = async (
  ctx: SubmitContext,
): Promise<AttendanceEntry> => {
  await assertRoomInOrg(ctx.roomId, ctx.orgId);

  const [formDef] = await db
    .select()
    .from(formDefinitions)
    .where(eq(formDefinitions.id, ctx.input.formDefinitionId))
    .limit(1) as FormDefinitionRow[];

  if (!formDef || formDef.roomId !== ctx.roomId) {
    throw ApiError.badRequest("Form definition does not belong to this room");
  }

  const data = validateAndCoerceData(formDef.fields, ctx.input.data);
  const photoUrl = ctx.input.photoKey ? buildPublicUrl(ctx.input.photoKey) : null;

  const [row] = await db
    .insert(attendanceEntries)
    .values({
      roomId: ctx.roomId,
      formDefinitionId: formDef.id,
      submittedBy: ctx.submittedBy,
      data,
      photoKey: ctx.input.photoKey ?? null,
      photoUrl,
      ipAddress: ctx.ipAddress ?? null,
      userAgent: ctx.userAgent ?? null,
    })
    .returning();

  if (!row) throw ApiError.internal("Failed to record attendance");
  return toAttendanceEntry(row);
};

export const listAttendance = async (
  roomId: string,
  orgId: string,
  opts: { limit?: number; offset?: number; liveOnly?: boolean } = {},
): Promise<AttendanceEntry[]> => {
  const room = await getRoomInOrg(roomId, orgId);

  const limit = Math.min(Math.max(opts.limit ?? 50, 1), 200);
  const offset = Math.max(opts.offset ?? 0, 0);
  const whereClauses = [eq(attendanceEntries.roomId, roomId)];

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
