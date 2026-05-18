import type { RequestHandler } from "express";
import { ApiError } from "../utils/errors";
import { generateVerificationReportPdf } from "../services/report.service";

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

    const pdfBuffer = await generateVerificationReportPdf(roomId, orgId, req.user!);

    // Configure headers for direct binary stream download
    res.setHeader("Content-Type", "application/pdf");
    res.setHeader(
      "Content-Disposition",
      `attachment; filename="Official-Event-Report-${roomId}.pdf"`
    );
    res.setHeader("Content-Length", pdfBuffer.length);

    res.end(pdfBuffer);
  } catch (err) {
    next(err);
  }
};
