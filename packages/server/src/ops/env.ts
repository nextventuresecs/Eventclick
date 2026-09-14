import { z } from "zod";

/**
 * Ops Console runtime configuration.
 *
 * Deliberately separate from `config/env.ts`: that module validates the tenant
 * server's variables (JWT secrets, LiveKit, S3, tenant database URLs) and exits
 * when they are absent. ops-server holds none of those, and must not.
 */

const blankToUndefined = (val: unknown): unknown => {
  if (typeof val !== "string") return val;
  const trimmed = val.trim();
  return trimmed === "" ? undefined : trimmed;
};

const LOG_LEVELS = ["fatal", "error", "warn", "info", "debug", "trace", "silent"] as const;

const OpsEnvSchema = z
  .object({
    NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
    OPS_PORT: z.coerce.number().int().nonnegative().default(4100),
    MAINTAINER_RO_DATABASE_URL: z.preprocess(blankToUndefined, z.url()),
    MAINTAINER_AUDIT_DATABASE_URL: z.preprocess(blankToUndefined, z.url()),
    // Cloudflare's `iss` claim has no trailing slash; a pasted one would fail
    // every token with an issuer mismatch.
    CF_ACCESS_TEAM_DOMAIN: z.preprocess(
      blankToUndefined,
      z.url().transform((u) => u.replace(/\/+$/, "")).optional(),
    ),
    CF_ACCESS_AUD: z.preprocess(blankToUndefined, z.string().optional()),
    OPS_AUTH_BYPASS_EMAIL: z.preprocess(
      (val) => (typeof blankToUndefined(val) === "string" ? String(val).trim().toLowerCase() : undefined),
      z.email().optional(),
    ),
    OPS_STATIC_DIR: z.preprocess(blankToUndefined, z.string().default("packages/ops/dist")),
    SENTRY_RELEASE: z.preprocess(blankToUndefined, z.string().optional()),
    LOG_LEVEL: z.preprocess(blankToUndefined, z.enum(LOG_LEVELS).optional()),
  })
  .superRefine((env, ctx) => {
    if (env.OPS_AUTH_BYPASS_EMAIL) return;
    if (!env.CF_ACCESS_TEAM_DOMAIN) {
      ctx.addIssue({
        code: "custom",
        path: ["CF_ACCESS_TEAM_DOMAIN"],
        message: "Required unless OPS_AUTH_BYPASS_EMAIL is set",
      });
    }
    if (!env.CF_ACCESS_AUD) {
      ctx.addIssue({
        code: "custom",
        path: ["CF_ACCESS_AUD"],
        message: "Required unless OPS_AUTH_BYPASS_EMAIL is set",
      });
    }
  })
  .transform((env) => ({
    ...env,
    LOG_LEVEL:
      env.LOG_LEVEL ??
      (env.NODE_ENV === "production" ? "info" : env.NODE_ENV === "test" ? "silent" : "debug"),
  }));

export type OpsEnv = z.infer<typeof OpsEnvSchema>;

export type ParseOpsEnvResult =
  | { success: true; data: OpsEnv }
  | { success: false; errors: Record<string, string[] | undefined> };

export function parseOpsEnv(source: Record<string, string | undefined>): ParseOpsEnvResult {
  const parsed = OpsEnvSchema.safeParse(source);
  if (!parsed.success) {
    return { success: false, errors: z.flattenError(parsed.error).fieldErrors };
  }
  return { success: true, data: parsed.data };
}

/**
 * Validates configuration or exits. The production bypass check runs first and
 * on the raw value, so a malformed bypass email still cannot slip past it.
 */
export function loadOpsEnv(source: Record<string, string | undefined> = process.env): OpsEnv {
  if (source.NODE_ENV === "production" && blankToUndefined(source.OPS_AUTH_BYPASS_EMAIL) !== undefined) {
    console.error("OPS_AUTH_BYPASS_EMAIL must never be set in production");
    process.exit(1);
  }

  const result = parseOpsEnv(source);
  if (!result.success) {
    console.error("\n❌ Invalid ops-server environment variables:");
    console.error(result.errors);
    process.exit(1);
  }
  return result.data;
}
