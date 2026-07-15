import type { RequestHandler } from "express";
import { ApiError } from "../utils/errors";
import { generateVerificationReportPdf } from "../services/report.service";
import { enqueuePdfJob } from "../queues/sqs.client";

const requireOrgId = (organizationId: string | null): string => {
  if (!organizationId) throw ApiError.badRequest("User has no organization");
  return organizationId;
};

/**
 * Downloads a fieldwork verification PDF report for a specific event room.
 */
export const downloadRoomReportPdf: RequestHandler = async (req, res, next) => {
  try {
    const orgId = requireOrgId(req.user!.organizationId);
    const roomId = req.params.id as string;

    const { jobId } = await enqueuePdfJob({
      roomId,
      orgId,
      userId: req.user!.id,
    });

    res.status(202).json({
      jobId,
      statusUrl: `/api/v1/rooms/${roomId}/report/status/${jobId}`
    });
  } catch (err) {
    next(err);
  }
};

export const getReportStatus: RequestHandler = async (req, res, next) => {
  try {
    const { jobId } = req.params;
    // In a full implementation, we'd look up the job status in Redis or Postgres.
    // For now, return a placeholder status.
    res.json({
      jobId,
      status: "processing"
    });
  } catch (err) {
    next(err);
  }
};
