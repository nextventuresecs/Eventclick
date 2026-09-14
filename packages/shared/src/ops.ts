import { z } from "zod";
import type { UserRole } from "./index";

/**
 * Ops Console lookup contracts (#148). Shared by ops-server and packages/ops.
 *
 * Raw emails and names appear only in OpsUnmaskResponse. Every other shape
 * carries masked values produced server-side.
 */

export const OpsSearchQuerySchema = z.object({ q: z.string().trim().min(1).max(320) });
export type OpsSearchQuery = z.infer<typeof OpsSearchQuerySchema>;

export const OpsIdParamSchema = z.object({ id: z.uuid() });

export const OpsOrgUsersQuerySchema = z.object({
  cursor: z.string().min(1).max(200).optional(),
  limit: z.coerce.number().int().min(1).max(50).default(25),
});

export type MaskedUser = {
  id: string;
  emailMasked: string;
  fullNameMasked: string;
  role: UserRole;
  organizationId: string | null;
  organizationName: string | null;
  isActive: boolean;
  emailVerified: boolean;
  lastLoginAt: string | null;
  createdAt: string;
  deletedAt: string | null;
  /** Sessions with revoked_at IS NULL AND expires_at > now(). */
  activeSessionCount: number;
  lastSessionAt: string | null;
};

export type OrgRoleCounts = { admin: number; event_manager: number; volunteer: number };

export type OrgSummary = {
  id: string;
  name: string;
  slug: string;
  isActive: boolean;
  legalHold: boolean;
  contactEmailMasked: string | null;
  createdAt: string;
  deletedAt: string | null;
  memberCount: number;
  roleCounts: OrgRoleCounts;
  roomCount: number;
};

export type OpsSearchResult =
  | { kind: "user"; user: MaskedUser }
  | { kind: "org"; org: OrgSummary }
  /** A hint only: nothing is read for a request id until log search (#150). */
  | { kind: "request"; requestId: string };

export type OpsSearchResponse = { results: OpsSearchResult[] };

export type OpsMembership = {
  organizationId: string;
  organizationName: string | null;
  role: UserRole;
  joinedAt: string;
};

export type OpsUserDetailResponse = { user: MaskedUser; memberships: OpsMembership[] };
export type OpsOrgDetailResponse = { org: OrgSummary };
export type OpsOrgUsersResponse = { users: MaskedUser[]; nextCursor: string | null };

export const OPS_UNMASK_REASON_MIN = 10;
export const OPS_UNMASK_REASON_MAX = 500;

export const OpsUnmaskSchema = z.object({
  reason: z.string().trim().min(OPS_UNMASK_REASON_MIN).max(OPS_UNMASK_REASON_MAX),
});
export type OpsUnmaskInput = z.infer<typeof OpsUnmaskSchema>;
export type OpsUnmaskResponse = { email: string; fullName: string };
