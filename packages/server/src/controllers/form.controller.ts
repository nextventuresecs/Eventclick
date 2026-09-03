import type { RequestHandler } from "express";
import type { FormDefinitionInput } from "@application/shared";
import { ApiError } from "../utils/errors";
import {
  getLatestFormDefinition,
  saveFormDefinition,
} from "../services/form.service";
import { recordAuditSafely } from "../services/audit.service";

const requireOrgId = (organizationId: string | null): string => {
  if (!organizationId) throw ApiError.badRequest("User has no organization");
  return organizationId;
};

export const getRoomForm: RequestHandler = async (req, res, next) => {
  try {
    const orgId = requireOrgId(req.user!.organizationId);
    const roomId = req.params.id as string;
    const form = await getLatestFormDefinition(roomId, orgId, req.user!);
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
    const form = await saveFormDefinition(roomId, orgId, req.user!, fields);

    // The field list is the thing worth being able to reconstruct: an
    // attendance record only means something alongside the form that produced
    // it, and that form is edited in place.
    await recordAuditSafely({
      organizationId: orgId,
      actorUserId: req.user!.id,
      actorEmail: req.user!.email,
      action: "form.updated",
      resourceType: "form",
      resourceId: roomId,
      newValues: { fieldCount: fields.length, fields },
      ipAddress: req.ip,
      userAgent: req.get("user-agent") ?? undefined,
    });

    res.status(200).json(form);
  } catch (err) {
    next(err);
  }
};
