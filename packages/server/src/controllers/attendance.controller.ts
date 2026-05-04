import type { RequestHandler } from "express";
import type {
  PhotoUploadRequestInput,
  PhotoUploadResponse,
  SubmitAttendanceInput,
} from "@application/shared";
import { ApiError } from "../utils/errors";
import {
  listAttendance,
  submitAttendance,
} from "../services/attendance.service";
import {
  buildPhotoKey,
  buildPublicUrl,
  createPresignedPut,
} from "../services/storage.service";

const requireOrgId = (organizationId: string | null): string => {
  if (!organizationId) throw ApiError.badRequest("User has no organization");
  return organizationId;
};

export const presignAttendancePhoto: RequestHandler = async (req, res, next) => {
  try {
    const roomId = req.params.id as string;
    const { contentType } = req.body as PhotoUploadRequestInput;

    const key = buildPhotoKey(roomId, contentType);
    const { uploadUrl, expiresIn } = await createPresignedPut(key, contentType);
    const publicUrl = buildPublicUrl(key);

    const body: PhotoUploadResponse = { uploadUrl, key, publicUrl, expiresIn };
    res.json(body);
  } catch (err) {
    next(err);
  }
};

export const postAttendance: RequestHandler = async (req, res, next) => {
  try {
    const orgId = requireOrgId(req.user!.organizationId);
    const roomId = req.params.id as string;
    const input = req.body as SubmitAttendanceInput;

    const entry = await submitAttendance({
      roomId,
      orgId,
      submittedBy: req.user!.id,
      input,
      ipAddress: req.ip,
      userAgent: req.get("user-agent") ?? undefined,
    });
    res.status(201).json(entry);
  } catch (err) {
    next(err);
  }
};

export const listRoomAttendance: RequestHandler = async (req, res, next) => {
  try {
    const orgId = requireOrgId(req.user!.organizationId);
    const roomId = req.params.id as string;
    const limit = req.query.limit ? Number(req.query.limit) : undefined;
    const offset = req.query.offset ? Number(req.query.offset) : undefined;

    const items = await listAttendance(roomId, orgId, { limit, offset });
    res.json({ items });
  } catch (err) {
    next(err);
  }
};
