// Admin schemas are defined in @application/shared for cross-package type safety.
// Re-export them here for use in admin.routes.ts validation middleware.
export { CreateOrgUserSchema } from "@application/shared";
export type { CreateOrgUserInput } from "@application/shared";

// Alias for route-level usage
export { CreateOrgUserSchema as CreateUserSchema } from "@application/shared";
