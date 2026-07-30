import type { RequestHandler } from "express";
import type { CreateOrgUserInput } from "../services/admin.service";
import { ApiError } from "../utils/errors";
import { listOrgUsersForAdmin, createOrgUser, deleteUserAccount } from "../services/admin.service";

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
      res.clearCookie("Evently_rt");
    }

    res.json(result);
  } catch (err) {
    next(err);
  }
};
