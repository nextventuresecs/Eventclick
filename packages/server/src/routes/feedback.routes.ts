import { Router } from "express";
import { requireAuth } from "../middleware/requireAuth";
import { validate } from "../middleware/validate";
import { SubmitFeedbackSchema } from "@application/shared";
import * as feedbackController from "../controllers/feedback.controller";

export const feedbackRouter = Router();

feedbackRouter.post("/", requireAuth, validate(SubmitFeedbackSchema), feedbackController.createFeedback);

export default feedbackRouter;
