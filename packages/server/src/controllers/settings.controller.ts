import type { RequestHandler } from "express";
import type { BrandingUploadRequestInput, PhotoUploadResponse } from "@application/shared";
import { db } from "../db";
import { organizations, users } from "../db/schema";
import { ApiError } from "../utils/errors";
import { eq } from "drizzle-orm";
import {
  buildOrgLogoKey,
  buildPublicUrl,
  buildUserAvatarKey,
  createPresignedPut,
} from "../services/storage.service";
import { recordAuditSafely } from "../services/audit.service";

export const updateOrganization: RequestHandler = async (req, res, next) => {
  try {
    if (!req.user || !req.user.organizationId) throw ApiError.unauthorized();
    const orgId = req.user.organizationId;
    
    const [updatedOrg] = await db
      .update(organizations)
      .set({
        name: req.body.name,
        description: req.body.description,
        logoUrl: req.body.logoUrl,
        updatedAt: new Date(),
      })
      .where(eq(organizations.id, orgId))
      .returning();

    if (!updatedOrg) throw ApiError.notFound("Organization not found");

    await recordAuditSafely({
      organizationId: orgId,
      actorUserId: req.user.id,
      actorEmail: req.user.email,
      action: "settings.updated",
      resourceType: "organization",
      resourceId: orgId,
      newValues: { name: updatedOrg.name, description: updatedOrg.description, logoUrl: updatedOrg.logoUrl },
      ipAddress: req.ip,
      userAgent: req.get("user-agent") ?? undefined,
    });

    res.json({ organization: updatedOrg });
  } catch (err) {
    next(err);
  }
};

export const updatePreferences: RequestHandler = async (req, res, next) => {
  try {
    if (!req.user) throw ApiError.unauthorized();
    const userId = req.user.id;

    // Body only carries the toggles the client changed (validate() strips the
    // rest), so a plain .set() would blow away every other saved preference.
    const [existingUser] = await db.select().from(users).where(eq(users.id, userId)).limit(1);
    if (!existingUser) throw ApiError.notFound("User not found");

    const [updatedUser] = await db
      .update(users)
      .set({
        preferences: { ...(existingUser.preferences as object | null), ...req.body },
        updatedAt: new Date(),
      })
      .where(eq(users.id, userId))
      .returning();

    if (!updatedUser) throw ApiError.notFound("User not found");

    // Only audited when the user belongs to an organisation: audit_logs is
    // tenant-scoped by RLS, so an entry with no organisation cannot be
    // written or read. A user editing their own notification toggles before
    // onboarding has no tenant to record against.
    if (req.user.organizationId) {
      await recordAuditSafely({
        organizationId: req.user.organizationId,
        actorUserId: userId,
        actorEmail: req.user.email,
        action: "settings.updated",
        resourceType: "user_preferences",
        resourceId: userId,
        oldValues: (existingUser.preferences as Record<string, unknown> | null) ?? undefined,
        newValues: (updatedUser.preferences as Record<string, unknown> | null) ?? undefined,
        ipAddress: req.ip,
        userAgent: req.get("user-agent") ?? undefined,
      });
    }

    res.json({ user: updatedUser });
  } catch (err) {
    next(err);
  }
};

// Issue a short-lived presigned PUT so the browser uploads the image straight to
// object storage. Only the resulting public URL is ever persisted — never a data URL,
// which would blow past the 1000-char limit on logoUrl/photoUrl.
export const presignOrganizationLogo: RequestHandler = async (req, res, next) => {
  try {
    if (!req.user || !req.user.organizationId) throw ApiError.unauthorized();
    const { contentType, sizeBytes } = req.body as BrandingUploadRequestInput;

    const key = buildOrgLogoKey(req.user.organizationId, contentType);
    const { uploadUrl, expiresIn } = await createPresignedPut(key, contentType, sizeBytes);

    const body: PhotoUploadResponse = {
      uploadUrl,
      key,
      publicUrl: buildPublicUrl(key),
      expiresIn,
    };
    res.json(body);
  } catch (err) {
    next(err);
  }
};

export const presignUserAvatar: RequestHandler = async (req, res, next) => {
  try {
    if (!req.user) throw ApiError.unauthorized();
    const { contentType, sizeBytes } = req.body as BrandingUploadRequestInput;

    const key = buildUserAvatarKey(req.user.id, contentType);
    const { uploadUrl, expiresIn } = await createPresignedPut(key, contentType, sizeBytes);

    const body: PhotoUploadResponse = {
      uploadUrl,
      key,
      publicUrl: buildPublicUrl(key),
      expiresIn,
    };
    res.json(body);
  } catch (err) {
    next(err);
  }
};
