import type { RequestHandler } from "express";
import { db } from "../db";
import { feedback } from "../db/schema";
import { ApiError } from "../utils/errors";

export const createFeedback: RequestHandler = async (req, res, next) => {
  try {
    if (!req.user) throw ApiError.unauthorized();
    const [insertedFeedback] = await db
      .insert(feedback)
      .values({
        userId: req.user.id,
        organizationId: req.user.organizationId,
        ...req.body,
      })
      .returning();
    res.status(201).json({ feedback: insertedFeedback });
  } catch (err) {
    next(err);
  }
};
