import { ROLE_LABELS, type UserRole } from "@application/shared";

export const formatDate = (iso: string | null): string => (iso ? new Date(iso).toLocaleString() : "—");

export const roleLabel = (role: UserRole): string => ROLE_LABELS[role] ?? role;
