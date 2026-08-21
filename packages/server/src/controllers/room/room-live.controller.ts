import type { RequestHandler } from "express";
import { eq, and, isNull } from "drizzle-orm";
import type { LiveRole, UserRole } from "@application/shared";
import { hasRolePermission } from "@application/shared";
import { db } from "../../db";
import { eventRooms } from "../../db/schema";
import { ApiError } from "../../utils/errors";
import { streamingService } from "../../services/streaming";
import { getRoomPresence } from "../../services/presence.service";
import { validateActivityQuotas } from "../../services/activity.service";
import {
  assertRoomAccessForUser,
  assertRoomAccessWithRoom,
} from "../../services/event-assignment.service";
import { findUserById } from "../../services/auth";
import { notifyEventStreamStateChanged } from "../../services/event-stream-notification.service";
import { requireOrgId, toEventRoom } from "./room-helpers";

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

    const token = await streamingService.issueToken({
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
    notifyEventStreamStateChanged(id, orgId, "live");
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
    notifyEventStreamStateChanged(id, orgId, "ended");
    res.json(toEventRoom(row));
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
