import type { RequestHandler } from "express";
import { submitFeedback } from "../services/feedback.service";
import { ApiError } from "../utils/errors";

export const createFeedback: RequestHandler = async (req, res, next) => {
  try {
    if (!req.user) throw ApiError.unauthorized();
    const feedback = await submitFeedback(req.user.id, req.user.organizationId, req.body);
    res.status(201).json({ feedback });
  } catch (err) {
    next(err);
  }
};
