/**
 * Server-side masking for the Ops Console (#148). Raw emails and names leave
 * ops-server only from the audited unmask route; every other response carries
 * these. Masking in the browser would still ship the raw value.
 */

const MASK = "***";

/** "jane.doe@example.org" → "ja***@e***.org". Malformed input → "***". */
export function maskEmail(email: string): string {
  const value = email.trim().toLowerCase();
  const at = value.lastIndexOf("@");
  if (at <= 0 || at === value.length - 1) return MASK;

  const local = value.slice(0, at);
  const labels = value.slice(at + 1).split(".").filter(Boolean);
  if (labels.length === 0) return MASK;

  const localPart = local.slice(0, local.length <= 2 ? 1 : 2) + MASK;
  const first = labels[0]!.charAt(0) + MASK;
  const domainPart = labels.length > 1 ? `${first}.${labels[labels.length - 1]}` : first;
  return `${localPart}@${domainPart}`;
}

/** "Jane Doe" → "J. D.", at most three initials. Empty → "***". */
export function maskName(name: string): string {
  const words = name.trim().split(/\s+/).filter(Boolean).slice(0, 3);
  if (words.length === 0) return MASK;
  return words.map((w) => `${w.charAt(0).toUpperCase()}.`).join(" ");
}
