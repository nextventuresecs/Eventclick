import { db } from "../db";
import { feedback } from "../db/schema";
import type { SubmitFeedbackInput } from "@application/shared";
import { ApiError } from "../utils/errors";
import { logger } from "../utils/logger";

export const submitFeedback = async (
  userId: string,
  organizationId: string | null,
  input: SubmitFeedbackInput
) => {
  const [createdFeedback] = await db
    .insert(feedback)
    .values({
      userId,
      organizationId: organizationId || null,
      category: input.category,
      rating: input.rating,
      subject: input.subject,
      comments: input.comments,
    })
    .returning();

  if (!createdFeedback) {
    throw ApiError.internal("Failed to submit feedback");
  }

  logger.info({ userId, event: "feedback.submitted" }, "Feedback submitted");
  return createdFeedback;
};
