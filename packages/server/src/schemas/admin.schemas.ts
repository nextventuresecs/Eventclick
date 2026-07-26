// Admin schemas are defined in @application/shared for cross-package type safety.
// Re-export them here for use in admin.routes.ts validation middleware.
export { CreateOrgUserSchema, DeleteUserSchema } from "@application/shared";
export type { CreateOrgUserInput, DeleteUserInput } from "@application/shared";

// Alias for route-level usage
export { CreateOrgUserSchema as CreateUserSchema } from "@application/shared";
