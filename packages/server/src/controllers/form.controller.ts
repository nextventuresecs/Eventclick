import type { RequestHandler } from "express";
import type { FormDefinitionInput } from "@application/shared";
import { ApiError } from "../utils/errors";
import {
  getLatestFormDefinition,
  saveFormDefinition,
} from "../services/form.service";

const requireOrgId = (organizationId: string | null): string => {
  if (!organizationId) throw ApiError.badRequest("User has no organization");
  return organizationId;
};

export const getRoomForm: RequestHandler = async (req, res, next) => {
  try {
    const orgId = requireOrgId(req.user!.organizationId);
    const roomId = req.params.id as string;
    const form = await getLatestFormDefinition(roomId, orgId);
    res.json(form);
  } catch (err) {
    next(err);
  }
};

export const saveRoomForm: RequestHandler = async (req, res, next) => {
  try {
    const orgId = requireOrgId(req.user!.organizationId);
    const roomId = req.params.id as string;
    const { fields } = req.body as FormDefinitionInput;
    const form = await saveFormDefinition(roomId, orgId, fields);
    res.status(200).json(form);
  } catch (err) {
    next(err);
  }
};
