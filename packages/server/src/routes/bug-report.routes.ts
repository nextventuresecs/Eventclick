import { Router } from "express";
import { requireAuth } from "../middleware/requireAuth";
import { validate } from "../middleware/validate";
import { SubmitBugReportSchema } from "@application/shared";
import * as bugReportController from "../controllers/bug-report.controller";

export const bugReportRouter = Router();

bugReportRouter.post("/", requireAuth, validate(SubmitBugReportSchema), bugReportController.createBugReport);

export default bugReportRouter;
