import type { UserRole } from "@application/shared";

declare global {
  namespace Express {
    interface UserPrincipal {
      id: string;
      role: UserRole;
      organizationId: string | null;
      email?:string;
    }
    interface Request {
      user?: UserPrincipal;
    }
  }
}

export {};
