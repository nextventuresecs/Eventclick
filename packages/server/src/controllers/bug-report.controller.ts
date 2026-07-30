import type { RequestHandler } from "express";
import { submitBugReport } from "../services/bug-report.service";
import { ApiError } from "../utils/errors";

export const createBugReport: RequestHandler = async (req, res, next) => {
  try {
    if (!req.user) throw ApiError.unauthorized();
    const bugReport = await submitBugReport(req.user.id, req.user.organizationId, req.body);
    res.status(201).json({ bugReport });
  } catch (err) {
    next(err);
  }
};
