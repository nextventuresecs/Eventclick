import type { RequestHandler } from "express";
import { ApiError } from "../utils/errors";
import { generateVerificationReportPdf } from "../services/report.service";
import { logger } from "../utils/logger";

const requireOrgId = (organizationId: string | null): string => {
  if (!organizationId) throw ApiError.badRequest("User has no organization");
  return organizationId;
};

/**
 * Downloads a fieldwork verification PDF report for a specific event room.
 *
 * Generates the report synchronously via Gotenberg and streams the resulting
 * PDF buffer back as an `application/pdf` response.
 */
export const downloadRoomReportPdf: RequestHandler = async (req, res, next) => {
  try {
    const orgId = requireOrgId(req.user!.organizationId);
    const roomId = req.params.id as string;

    logger.info(
      { roomId, orgId, userId: req.user!.id },
      "PDF report generation requested"
    );

    const pdfBuffer = await generateVerificationReportPdf(roomId, orgId, req.user!);

    res.setHeader("Content-Type", "application/pdf");
    res.setHeader(
      "Content-Disposition",
      `attachment; filename="Official-Event-Report-${roomId}.pdf"`
    );
    res.setHeader("Content-Length", pdfBuffer.length);
    res.status(200).end(pdfBuffer);
  } catch (err) {
    next(err);
  }
};
