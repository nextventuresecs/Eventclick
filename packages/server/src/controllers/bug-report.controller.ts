import type { RequestHandler } from "express";
import { db } from "../db";
import { bugReports } from "../db/schema";
import { ApiError } from "../utils/errors";

export const createBugReport: RequestHandler = async (req, res, next) => {
  try {
    if (!req.user) throw ApiError.unauthorized();
    const [bugReport] = await db
      .insert(bugReports)
      .values({
        userId: req.user.id,
        organizationId: req.user.organizationId,
        ...req.body,
      })
      .returning();
    res.status(201).json({ bugReport });
  } catch (err) {
    next(err);
  }
};
