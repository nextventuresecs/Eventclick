import type { RequestHandler } from "express";
import type { CreateOrgUserInput } from "../services/admin.service";
import { ApiError } from "../utils/errors";
import { listOrgUsersForAdmin, createOrgUser, deleteUserAccount } from "../services/admin.service";
import { listAuditLogs } from "../services/audit.service";
import { sendOrgBroadcast } from "../services/org-broadcast.service";
import { AuditLogQuerySchema, OrgUserQuerySchema, type OrgBroadcastInput } from "@application/shared";

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
    // Parsed here rather than by validate(..., "query") — Express 5 exposes
    // req.query through a getter that re-derives the object, so the
    // middleware's assignment is silently discarded. See middleware/validate.ts.
    const query = OrgUserQuerySchema.parse(req.query);
    const page = await listOrgUsersForAdmin(orgId, query);
    res.json(page);
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

/**
 * GET /admin/audit-logs — this organisation's audit trail, newest first.
 *
 * `requireOrgId` runs for the 401 it gives a user with no organisation, not
 * to scope the query: scoping is RLS (`audit_logs_tenant_isolation`) applied
 * to the tenant-pinned connection this request already holds.
 */
export const listAuditLog: RequestHandler = async (req, res, next) => {
  try {
    requireOrgId(req.user?.organizationId);
    // Parsed here rather than by validate(..., "query") — see the route.
    // A ZodError from this reaches errorHandler as a 400, same as body
    // validation would.
    const query = AuditLogQuerySchema.parse(req.query);
    const page = await listAuditLogs(query);
    res.json(page);
  } catch (err) {
    next(err);
  }
};
