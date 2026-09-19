import type { RequestHandler } from "express";
import type { SubmitBugReportInput } from "@application/shared";
import { db } from "../db";
import { bugReports } from "../db/schema";
import { ApiError } from "../utils/errors";

export const createBugReport: RequestHandler = async (req, res, next) => {
  try {
    if (!req.user) throw ApiError.unauthorized();
    const { severity, component, title, steps, expected, actual, systemInfo } = req.body as SubmitBugReportInput;
    const [bugReport] = await db
      .insert(bugReports)
      .values({
        userId: req.user.id,
        organizationId: req.user.organizationId,
        severity,
        component,
        title,
        steps,
        expected,
        actual,
        systemInfo: systemInfo ?? null,
      })
      .returning();
    res.status(201).json({ bugReport });
  } catch (err) {
    next(err);
  }
};
