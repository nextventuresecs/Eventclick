import {
  pino,
  stdSerializers,
  type SerializedRequest,
  type SerializedResponse,
} from "pino";
import { env } from "../config/env";

const defaultLevel =
  env.NODE_ENV === "production"
    ? "info"
    : env.NODE_ENV === "test"
      ? "silent"
      : "debug";

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

export const logger = pino({
  level: env.LOG_LEVEL ?? defaultLevel,
  base: { service: "Eventclick-server", env: env.NODE_ENV },
  redact: { paths: REDACT_PATHS, censor: "[REDACTED]" },
  serializers: {
    req(req: SerializedRequest) {
      return {
        id: (req as SerializedRequest & { id?: string }).id,
        method: req.method,
        url: req.url,
        remoteAddress: req.remoteAddress,
      };
    },
    res(res: SerializedResponse) {
      return { statusCode: res.statusCode };
    },
    err: stdSerializers.err,
  },
  ...(env.NODE_ENV !== "production"
    ? {
        transport: {
          target: "pino-pretty",
          options: {
            colorize: true,
            translateTime: "SYS:HH:MM:ss.l",
            ignore: "pid,hostname,service,env",
            singleLine: false,
          },
        },
      }
    : {}),
});

export type Logger = typeof logger;
