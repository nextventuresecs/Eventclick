import type { RequestHandler } from "express";
import { db } from "../db";
import { organizations, users } from "../db/schema";
import { ApiError } from "../utils/errors";
import { eq } from "drizzle-orm";

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
    res.json({ organization: updatedOrg });
  } catch (err) {
    next(err);
  }
};

export const updatePreferences: RequestHandler = async (req, res, next) => {
  try {
    if (!req.user) throw ApiError.unauthorized();
    const userId = req.user.id;
    
    const [updatedUser] = await db
      .update(users)
      .set({
        preferences: req.body,
        updatedAt: new Date(),
      })
      .where(eq(users.id, userId))
      .returning();

    if (!updatedUser) throw ApiError.notFound("User not found");
    res.json({ user: updatedUser });
  } catch (err) {
    next(err);
  }
};
