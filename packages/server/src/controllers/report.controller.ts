import type { RequestHandler } from "express";
import { ApiError } from "../utils/errors";
import { generateRoomReport, getRoomReports } from "../services/report.service";

const requireOrgId = (organizationId: string | null | undefined): string => {
  if (!organizationId) throw ApiError.unauthorized("No organization associated with user");
  return organizationId;
};

/**
 * POST /rooms/:id/reports/generate
 * Generates an event PDF report and returns the details with download URL.
 */
export const generateReport: RequestHandler = async (req, res, next) => {
  try {
    const orgId = requireOrgId(req.user?.organizationId);
    const userId = req.user!.id;
    const roomId = req.params.id as string;

    if (!roomId) {
      throw ApiError.badRequest("Room ID is required");
    }

    const report = await generateRoomReport(roomId, orgId, userId);
    res.status(201).json(report);
  } catch (err) {
    next(err);
  }
};

/**
 * GET /rooms/:id/reports
 * Lists all generated PDF reports for an event room.
 */
export const listReports: RequestHandler = async (req, res, next) => {
  try {
    const orgId = requireOrgId(req.user?.organizationId);
    const roomId = req.params.id as string;

    if (!roomId) {
      throw ApiError.badRequest("Room ID is required");
    }

    const reports = await getRoomReports(roomId, orgId);
    res.json({ items: reports });
  } catch (err) {
    next(err);
  }
};
