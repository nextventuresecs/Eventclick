import type { RequestHandler } from "express";
import type { CreateOrgUserInput } from "../services/admin.service";
import { ApiError } from "../utils/errors";
import { listOrgUsersForAdmin, createOrgUser, deleteUserAccount } from "../services/admin.service";
import { sendOrgBroadcast } from "../services/org-broadcast.service";
import type { OrgBroadcastInput } from "@application/shared";

const requireOrgId = (organizationId: string | null | undefined): string => {
  if (!organizationId) throw ApiError.unauthorized("No organization");
  return organizationId;
};

/**
 * GET /admin/users — list all users in the Admin's organization
 */
export const listOrgUsers: RequestHandler = async (req, res, next) => {
  try {
    const orgId = requireOrgId(req.user?.organizationId);
    const users = await listOrgUsersForAdmin(orgId);
    res.json({ items: users });
  } catch (err) {
    next(err);
  }
};

/**
 * POST /admin/users — create a new user in the Admin's organization
 */
export const createUser: RequestHandler = async (req, res, next) => {
  try {
    const orgId = requireOrgId(req.user?.organizationId);
    const input = req.body as CreateOrgUserInput;
    const user = await createOrgUser(orgId, req.user!.id, input);
    res.status(201).json(user);
  } catch (err) {
    next(err);
  }
};

/**
 * DELETE /admin/users/:id — delete user account based on role hierarchy
 */
export const deleteUser: RequestHandler = async (req, res, next) => {
  try {
    const requester = req.user;
    if (!requester) throw ApiError.unauthorized();

    const rawId = req.params.id;
    const targetUserId = Array.isArray(rawId) ? rawId[0] : rawId;
    if (!targetUserId) throw ApiError.badRequest("Target user ID is required");

    const { confirmEmail } = req.body as { confirmEmail: string };
    if (!confirmEmail) throw ApiError.badRequest("confirmEmail parameter is required");

    const result = await deleteUserAccount(
      requester.id,
      requester.role,
      requester.organizationId,
      targetUserId,
      confirmEmail,
      req,
    );

    // If self deletion, clear refresh cookie
    if (requester.id === targetUserId) {
      res.clearCookie("Eventclick_rt");
    }

    res.json(result);
  } catch (err) {
    next(err);
  }
};

/**
 * POST /admin/broadcasts — send an org-wide message to every member.
 *
 * Returns per-channel counts rather than a bare success: an admin who just
 * messaged their whole organisation should be told what actually went out,
 * including how many recipients failed, since individual failures are
 * isolated and swallowed by the dispatcher.
 */
export const sendBroadcast: RequestHandler = async (req, res, next) => {
  try {
    const orgId = requireOrgId(req.user?.organizationId);
    const input = req.body as OrgBroadcastInput;

    const result = await sendOrgBroadcast(orgId, req.user!.id, input);

    res.status(201).json(result);
  } catch (err) {
    next(err);
  }
};
