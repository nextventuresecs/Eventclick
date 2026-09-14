import { ROLE_LABELS, type UserRole } from "@application/shared";

export const formatDate = (iso: string | null): string => (iso ? new Date(iso).toLocaleString() : "—");

export const roleLabel = (role: UserRole): string => ROLE_LABELS[role] ?? role;

const RELATIVE_UNITS: Array<[Intl.RelativeTimeFormatUnit, number]> = [
  ["year", 365 * 24 * 3600],
  ["month", 30 * 24 * 3600],
  ["day", 24 * 3600],
  ["hour", 3600],
  ["minute", 60],
];

/** "3 days ago"; pair with formatDate in a title for the absolute time. */
export function formatRelative(iso: string | null, now: number = Date.now()): string {
  if (!iso) return "—";
  const seconds = Math.round((new Date(iso).getTime() - now) / 1000);
  const rtf = new Intl.RelativeTimeFormat("en", { numeric: "auto" });
  for (const [unit, size] of RELATIVE_UNITS) {
    if (Math.abs(seconds) >= size) return rtf.format(Math.trunc(seconds / size), unit);
  }
  return "just now";
}
