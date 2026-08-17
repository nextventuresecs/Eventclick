import { Router } from "express";
import { requireAuth } from "../middleware/requireAuth";
import { requireRole } from "../middleware/requireRole";
import { validate } from "../middleware/validate";
import {
  BrandingUploadRequestSchema,
  UpdateOrganizationSchema,
  UpdatePreferencesSchema,
} from "@application/shared";
import * as settingsController from "../controllers/settings.controller";

export const settingsRouter = Router();

// Organizations settings
settingsRouter.patch("/organizations", requireAuth, requireRole("admin"), validate(UpdateOrganizationSchema), settingsController.updateOrganization);

// Presigned uploads for branding images (logo / avatar)
settingsRouter.post(
  "/organizations/logo-upload",
  requireAuth,
  requireRole("admin"),
  validate(BrandingUploadRequestSchema),
  settingsController.presignOrganizationLogo,
);
settingsRouter.post(
  "/auth/avatar-upload",
  requireAuth,
  validate(BrandingUploadRequestSchema),
  settingsController.presignUserAvatar,
);

// User preferences
settingsRouter.patch("/auth/preferences", requireAuth, validate(UpdatePreferencesSchema), settingsController.updatePreferences);

export default settingsRouter;
