/**
 * Redaction lists shared by every process that writes logs or error reports.
 *
 * Lives in its own module with no imports so a second entrypoint (ops-server)
 * can reuse it: `logger.ts` imports `config/env`, which validates the tenant
 * runtime variables and exits when they are absent.
 */

/**
 * The single source of truth for what must never be written down.
 *
 * Exported because Sentry scrubs against the same list (see instrument.ts):
 * two independently maintained redaction lists drift, and the half that drifts
 * is discovered by finding a password in a bug report.
 */
export const REDACT_PATHS = [
  "req.headers.authorization",
  "req.headers.cookie",
  'req.headers["set-cookie"]',
  'res.headers["set-cookie"]',
  "req.body.password",
  "req.body.idToken",
  "req.body.refreshToken",
  "password",
  "passwordHash",
  "refreshToken",
  "tokenHash",
  "idToken",
  "accessToken",
  "*.password",
  "*.passwordHash",
  "*.tokenHash",
  "*.refreshToken",
  "*.idToken",
  "*.accessToken",
];

/**
 * Leaf field names extracted from REDACT_PATHS — "req.body.password" and
 * "*.passwordHash" both reduce to the property name a scrubber has to match
 * wherever it appears in a nested object. Derived rather than restated, so
 * adding a path above automatically protects the Sentry payload too.
 */
export const SENSITIVE_FIELD_NAMES: readonly string[] = [
  ...new Set(
    REDACT_PATHS.map((path) =>
      path
        .split(".")
        .pop()!
        .replace(/^\[?"?/, "")
        .replace(/"?\]?$/, "")
        .toLowerCase(),
    ).filter((name) => name && name !== "*"),
  ),
];
