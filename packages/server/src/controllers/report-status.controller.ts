import type { RequestHandler } from "express";
import { and, eq } from "drizzle-orm";
import { PdfJobStatusParamsSchema } from "@application/shared";
import { db } from "../db";
import { pdfJobs } from "../db/schema";
import { ApiError } from "../utils/errors";

export const getPdfJobStatus: RequestHandler = async (req, res, next) => {
  try {
    const { id: roomId, jobId } = PdfJobStatusParamsSchema.parse(req.params);

    const orgId = req.user?.organizationId;
    const conditions = [eq(pdfJobs.jobId, jobId), eq(pdfJobs.roomId, roomId)];
    if (orgId) {
      conditions.push(eq(pdfJobs.orgId, orgId));
    }

    const [job] = await db
      .select()
      .from(pdfJobs)
      .where(and(...conditions))
      .limit(1);

    if (!job) {
      throw ApiError.notFound("Job not found");
    }

    res.json({
      jobId: job.jobId,
      status: job.status,
      s3Url: job.s3Url,
      errorMessage: job.errorMessage,
      attempts: job.attempts,
      createdAt: job.createdAt,
      updatedAt: job.updatedAt,
      completedAt: job.completedAt,
    });
  } catch (err) {
    next(err);
  }
};
