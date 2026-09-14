import { SENSITIVE_FIELD_NAMES } from "./redact";

export const SCRUB_PLACEHOLDER = "[REDACTED]";

/**
 * Depth and breadth caps. A Sentry event is arbitrary user-shaped data and may
 * contain cycles or very large arrays; scrubbing must not become the reason a
 * process stalls while reporting an error.
 */
const MAX_DEPTH = 12;

const sensitive = new Set(SENSITIVE_FIELD_NAMES.map((name) => name.toLowerCase()));

const isSensitiveKey = (key: string): boolean => sensitive.has(key.toLowerCase());

/**
 * Recursively replaces the value of any field whose name appears in the
 * logger's redaction list, wherever it sits in the object.
 *
 * The match is on the **field name**, not a path, because a Sentry event nests
 * request data differently from a log record — `request.data.password`,
 * `contexts.state.password`, `extra.body.password` are all the same secret. A
 * path-based list would have to enumerate every shape the SDK produces.
 *
 * The list is imported from the logger rather than restated, so the two cannot
 * drift: the drifting half is discovered by finding a password in a bug
 * report.
 */
export const scrubSensitive = <T>(value: T, depth = 0, seen = new WeakSet<object>()): T => {
  if (depth > MAX_DEPTH || value === null || typeof value !== "object") return value;

  // Cycles are legal in captured context (an Express req referencing its res,
  // for one) and would otherwise recurse forever.
  if (seen.has(value as object)) return value;
  seen.add(value as object);

  if (Array.isArray(value)) {
    return value.map((item) => scrubSensitive(item, depth + 1, seen)) as unknown as T;
  }

  const out: Record<string, unknown> = {};
  for (const [key, item] of Object.entries(value as Record<string, unknown>)) {
    out[key] = isSensitiveKey(key) ? SCRUB_PLACEHOLDER : scrubSensitive(item, depth + 1, seen);
  }
  return out as unknown as T;
};
