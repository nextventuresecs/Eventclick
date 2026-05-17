import type { RequestHandler } from "express";
import type {
  ActivityPhotoUploadRequestInput,
  SubmitActivityPhotoInput,
} from "@application/shared";
import { ApiError } from "../utils/errors";
import {
  presignActivityPhoto,
  submitActivityPhoto,
  listRoomActivities,
} from "../services/activity.service";

const requireOrgId = (organizationId: string | null): string => {
  if (!organizationId) throw ApiError.badRequest("User has no organization");
  return organizationId;
};

export const getActivitiesAndSubmissions: RequestHandler = async (req, res, next) => {
  try {
    const orgId = requireOrgId(req.user!.organizationId);
    const roomId = req.params.id as string;

    const data = await listRoomActivities(roomId, orgId, req.user!);
    res.json(data);
  } catch (err) {
    next(err);
  }
};

export const presignActivityPhotoUrl: RequestHandler = async (req, res, next) => {
  try {
    const orgId = requireOrgId(req.user!.organizationId);
    const roomId = req.params.id as string;
    const input = req.body as ActivityPhotoUploadRequestInput;

    const data = await presignActivityPhoto(roomId, orgId, req.user!, input);
    res.json(data);
  } catch (err) {
    next(err);
  }
};

export const postActivityPhotoSubmission: RequestHandler = async (req, res, next) => {
  try {
    const orgId = requireOrgId(req.user!.organizationId);
    const roomId = req.params.id as string;
    const input = req.body as SubmitActivityPhotoInput;

    const data = await submitActivityPhoto(roomId, orgId, req.user!, input);
    res.status(201).json(data);
  } catch (err) {
    next(err);
  }
};
