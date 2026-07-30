import { Router } from "express";
import { requireAuth } from "../middleware/requireAuth";
import { requireRole } from "../middleware/requireRole";
import { validate } from "../middleware/validate";
import { UpdateOrganizationSchema, UpdatePreferencesSchema } from "@application/shared";
import * as settingsController from "../controllers/settings.controller";

export const settingsRouter = Router();

// Organizations settings
settingsRouter.patch("/organizations", requireAuth, requireRole("admin"), validate(UpdateOrganizationSchema), settingsController.updateOrganization);

// User preferences
settingsRouter.patch("/auth/preferences", requireAuth, validate(UpdatePreferencesSchema), settingsController.updatePreferences);

export default settingsRouter;
