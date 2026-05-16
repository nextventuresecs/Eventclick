import type { RequestHandler } from "express";
import type { AssignEventAdminInput, UpdateEventAdminAssignmentInput } from "@application/shared";
import { ApiError } from "../utils/errors";
import {
  assignEventAdminToRoom,
  listEventAssignments,
  listOrgUsers,
  revokeEventAssignment,
  updateEventAssignmentRoom,
} from "../services/event-assignment.service";

const requireOrgId = (organizationId: string | null): string => {
  if (!organizationId) throw ApiError.badRequest("User has no organization");
  return organizationId;
};

export const listAssignmentUsers: RequestHandler = async (req, res, next) => {
  try {
    const orgId = requireOrgId(req.user!.organizationId);
    const users = await listOrgUsers(orgId);
    res.json({ items: users });
  } catch (err) {
    next(err);
  }
};

export const listAssignments: RequestHandler = async (req, res, next) => {
  try {
    const orgId = requireOrgId(req.user!.organizationId);
    const assignments = await listEventAssignments(orgId);
    res.json({ items: assignments });
  } catch (err) {
    next(err);
  }
};

export const createAssignment: RequestHandler = async (req, res, next) => {
  try {
    const orgId = requireOrgId(req.user!.organizationId);
    const { userId, roomId } = req.body as AssignEventAdminInput;

    const assignment = await assignEventAdminToRoom({
      orgId,
      assignedBy: req.user!.id,
      userId,
      roomId,
    });
    res.status(201).json(assignment);
  } catch (err) {
    next(err);
  }
};

export const updateAssignment: RequestHandler = async (req, res, next) => {
  try {
    const orgId = requireOrgId(req.user!.organizationId);
    const { roomId } = req.body as UpdateEventAdminAssignmentInput;
    const id = req.params.id as string;

    const assignment = await updateEventAssignmentRoom({
      orgId,
      assignmentId: id,
      roomId,
      assignedBy: req.user!.id,
    });
    res.json(assignment);
  } catch (err) {
    next(err);
  }
};

export const revokeAssignment: RequestHandler = async (req, res, next) => {
  try {
    const orgId = requireOrgId(req.user!.organizationId);
    const id = req.params.id as string;
    await revokeEventAssignment(orgId, id);
    res.status(204).end();
  } catch (err) {
    next(err);
  }
};
