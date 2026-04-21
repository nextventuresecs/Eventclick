import type { RequestHandler } from "express";
import { eq, and, desc, isNull } from "drizzle-orm";
import { nanoid } from "nanoid";
import type {
  CreateRoomInput,
  EventRoom,
  UpdateRoomInput,
} from "@application/shared";
import { db } from "../db";
import { eventRooms, type EventRoomRow } from "../db/schema";
import { env } from "../config/env";
import { ApiError } from "../utils/errors";

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
  shareUrl: `${env.APP_URL}/rooms/share/${row.shareToken}`,
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

    const rows = await db
      .select()
      .from(eventRooms)
      .where(and(eq(eventRooms.organizationId, orgId), isNull(eventRooms.deletedAt)))
      .orderBy(desc(eventRooms.createdAt));

    res.json({ items: rows.map(toEventRoom) });
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
