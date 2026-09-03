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
import { notifyEventStarted, notifyEventEnded } from "../../services/event-lifecycle-notification.service";
import {
  forgetActiveRoom,
  notifyUserLeftEvent,
  rememberActiveRoom,
} from "../../services/user-left-notification.service";
import { logger } from "../../utils/logger";
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

    // Issuing a token is the only server-side signal that this user is
    // entering this room. Remembered so that logout — which carries no room
    // and no org — can still report which event the user vanished from.
    // Best-effort and deliberately not awaited: nothing in this response
    // depends on the write having landed, and a degraded-but-open Redis
    // would otherwise add its latency to every room join. The helper
    // swallows its own errors.
    void rememberActiveRoom(req.user!.id, { roomId: id, organizationId: orgId });

    res.json(token);
  } catch (err) {
    next(err);
  }
};

/**
 * Client-driven, and therefore best-effort: it fires from RoomLive's
 * onDisconnected handler, so a hard tab close, a crash or a dropped network
 * never reaches here. Acceptable for a live-presence signal — attendance is
 * recorded separately and does not depend on this.
 */
export const leaveRoom: RequestHandler = async (req, res, next) => {
  try {
    const orgId = requireOrgId(req.user!.organizationId);
    const id = req.params.id as string;
    await assertRoomAccessForUser(req.user!, orgId, id);

    await forgetActiveRoom(req.user!.id);
    notifyUserLeftEvent(id, orgId, req.user!.id, "left");

    res.status(204).end();
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

    // Atomic claim: guards EVENT_STARTED against a double-clicked/retried
    // startLive request firing it twice.
    const startedClaim = await db
      .update(eventRooms)
      .set({ eventStartedNotifiedAt: new Date() })
      .where(and(eq(eventRooms.id, id), isNull(eventRooms.eventStartedNotifiedAt)))
      .returning();
    if (startedClaim[0]) {
      // Awaited before the response ends, NOT fire-and-forget: tenantContext
      // commits and releases this request's pinned connection on
      // res.on("finish"), and the `db` proxy inside the fan-out would still be
      // resolving to that released client — the writes then fail into the
      // .catch() below, or land on a connection already reissued to another
      // request. Same reasoning as the report controller in fe831bb.
      //
      // The .catch() stays: the room has started either way, so a notification
      // failure must not fail the request.
      await notifyEventStarted({
        id: row.id,
        title: row.title,
        organizationId: orgId,
        createdBy: row.createdBy,
        shareToken: row.shareToken,
        notifyEmailOnStart: row.notifyEmailOnStart,
      }).catch((err) => logger.error({ err, roomId: id }, "EVENT_STARTED fan-out failed"));
    }

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

    const endedClaim = await db
      .update(eventRooms)
      .set({ eventEndedNotifiedAt: new Date() })
      .where(and(eq(eventRooms.id, id), isNull(eventRooms.eventEndedNotifiedAt)))
      .returning();
    if (endedClaim[0]) {
      // Awaited for the same reason as EVENT_STARTED above: the pinned
      // connection is released the moment this response finishes.
      await notifyEventEnded({
        id: row.id,
        title: row.title,
        organizationId: orgId,
        createdBy: row.createdBy,
      }).catch((err) => logger.error({ err, roomId: id }, "EVENT_ENDED fan-out failed"));
    }

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
