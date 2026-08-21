import { eq } from "drizzle-orm";
import type { AuthUser, UpdateProfileInput } from "@application/shared";
import { db } from "../../db";
import { users } from "../../db/schema";
import { ApiError } from "../../utils/errors";
import { findUserById, invalidateUserCache, toAuthUser } from "./auth-helpers";

export const getCurrentUser = async (userId: string): Promise<AuthUser> => {
  const user = await findUserById(userId);
  if (!user || !user.isActive) throw ApiError.unauthorized("Account no longer active");
  return toAuthUser(user, user.organizationName, user.organizationDescription, user.organizationLogoUrl);
};

export const updateUserProfile = async (
  userId: string,
  input: UpdateProfileInput
): Promise<AuthUser> => {
  const [updatedUser] = await db
    .update(users)
    .set({
      fullName: input.fullName,
      photoUrl: input.photoUrl,
      updatedAt: new Date(),
    })
    .where(eq(users.id, userId))
    .returning();

  if (!updatedUser) throw ApiError.notFound("User not found");

  await invalidateUserCache(userId);
  const userWithOrg = await findUserById(userId);
  if (!userWithOrg) throw ApiError.notFound("User not found");
  return toAuthUser(userWithOrg, userWithOrg.organizationName, userWithOrg.organizationDescription, userWithOrg.organizationLogoUrl);
};
