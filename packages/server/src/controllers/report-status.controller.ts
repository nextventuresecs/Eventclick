import type { RequestHandler } from "express";
import { eq } from "drizzle-orm";
import { db } from "../db";
import { pdfJobs } from "../db/schema";
import { ApiError } from "../utils/errors";

export const getPdfJobStatus: RequestHandler = async (req, res, next) => {
  try {
    const jobId = req.params.jobId as string;
    if (!jobId) {
      throw ApiError.badRequest("jobId is required");
    }

    const [job] = await db
      .select()
      .from(pdfJobs)
      .where(eq(pdfJobs.jobId, jobId))
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
