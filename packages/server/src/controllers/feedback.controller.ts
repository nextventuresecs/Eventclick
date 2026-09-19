import type { RequestHandler } from "express";
import type { SubmitFeedbackInput } from "@application/shared";
import { db } from "../db";
import { feedback } from "../db/schema";
import { ApiError } from "../utils/errors";

export const createFeedback: RequestHandler = async (req, res, next) => {
  try {
    if (!req.user) throw ApiError.unauthorized();
    const { category, rating, subject, comments } = req.body as SubmitFeedbackInput;
    const [insertedFeedback] = await db
      .insert(feedback)
      .values({
        userId: req.user.id,
        organizationId: req.user.organizationId,
        category,
        rating,
        subject,
        comments,
      })
      .returning();
    res.status(201).json({ feedback: insertedFeedback });
  } catch (err) {
    next(err);
  }
};
