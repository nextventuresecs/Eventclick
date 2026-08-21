import type { RequestHandler } from "express";
import { eq, desc, and } from "drizzle-orm";
import { db } from "../../db";
import { roomRecordings } from "../../db/schema";
import { ApiError } from "../../utils/errors";
import { streamingService } from "../../services/streaming";
import { assertRoomAccessForUser } from "../../services/event-assignment.service";
import { notifyEventStreamStateChanged } from "../../services/event-stream-notification.service";
import { requireOrgId } from "./room-helpers";

export const startRoomRecording: RequestHandler = async (req, res, next) => {
  try {
    const orgId = requireOrgId(req.user!.organizationId);
    const id = req.params.id as string;
    await assertRoomAccessForUser(req.user!, orgId, id);

    const recording = await streamingService.startRecording(id, orgId);
    notifyEventStreamStateChanged(id, orgId, "recording_started");
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

    const recording = await streamingService.stopRecording(egressId, orgId);
    notifyEventStreamStateChanged(id, orgId, "recording_paused");
    res.json(recording);
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
        and(
          eq(roomRecordings.roomId, id),
          eq(roomRecordings.organizationId, orgId),
        )
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
