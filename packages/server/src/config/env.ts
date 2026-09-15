import path from "node:path";
import dotenv from "dotenv";
import { z } from "zod";
import { senderAddressSchema } from "./emailSender";

const candidates = [
  path.resolve(process.cwd(), ".env"),
  path.resolve(process.cwd(), "../../.env"),
];
for (const p of candidates) {
  dotenv.config({ path: p });
}

const cleanString = (val: unknown): string | undefined => {
  if (typeof val !== "string") return undefined;
  const trimmed = val.trim().replace(/^["']|["']$/g, "").trim();
  return trimmed === "" ? undefined : trimmed;
};

const optionalUrlSchema = z.preprocess((val) => cleanString(val), z.string().url().optional());

const urlSchema = z.preprocess(
  (val) => cleanString(val),
  z.string({ message: "This URL is missing from SSM or .env" }).url("Must be a valid HTTP URL")
);

const EnvSchema = z.object({
  NODE_ENV: z
    .enum(["development", "test", "production"])
    .default("development"),
  PORT: z.coerce.number().int().nonnegative().default(4000),
  API_PORT: z.coerce.number().int().nonnegative().default(4000),
  LOG_LEVEL: z
    .enum(["fatal", "error", "warn", "info", "debug", "trace", "silent"])
    .optional(),

  DATABASE_URL: optionalUrlSchema,
  AUTH_DATABASE_URL: urlSchema,
  APP_DATABASE_URL: urlSchema,
  DB_POOL_MAX: z.coerce.number().int().positive().default(10),
  // How long a caller waits for a free pooled connection before failing. Left
  // unset, `pg` waits forever, so tenantContext's "Failed to acquire tenant
  // connection" error path never runs and the request just hangs until
  // SERVER_REQUEST_TIMEOUT_MS kills it with nothing in the logs.
  DB_ACQUIRE_TIMEOUT_MS: z.coerce.number().int().positive().default(5_000),
  // Applied per runtime connection (see db/index.ts), never to the migration
  // connection — migrations legitimately run for minutes. Postgres interval
  // strings, e.g. "15s", "2min".
  DB_STATEMENT_TIMEOUT: z.string().default("15s"),
  DB_IDLE_TX_TIMEOUT: z.string().default("30s"),
  // Background jobs that legitimately outrun the request-shaped default raise
  // it for their own transaction rather than the pool default being loosened
  // for everyone. See jobs/dataRetention.ts.
  DB_JOB_STATEMENT_TIMEOUT: z.string().default("5min"),
  REDIS_URL: urlSchema,

  JWT_SECRET: z.string().min(16, "JWT_SECRET must be at least 16 chars"),
  JWT_REFRESH_SECRET: z
    .string()
    .min(16, "JWT_REFRESH_SECRET must be at least 16 chars"),
  JWT_ACCESS_TTL: z.string().default("15m"),
  JWT_REFRESH_TTL: z.string().default("7d"),

  CORS_ORIGIN: z.string().default("http://localhost:3000"),
  RATE_LIMIT_WINDOW_MS: z.coerce.number().int().positive().default(60_000),
  // A real ceiling, not a formality: 10,000/min per client was high enough
  // that nothing legitimate or otherwise ever reached it. Credential
  // endpoints do not read this — see routes/auth.routes.ts.
  RATE_LIMIT_MAX: z.coerce.number().int().positive().default(600),

  ATTENDANCE_WINDOW_BEFORE_MINUTES: z.coerce
    .number()
    .int()
    .nonnegative()
    .default(15),
  ATTENDANCE_WINDOW_AFTER_MINUTES: z.coerce
    .number()
    .int()
    .nonnegative()
    .default(30),

  APP_URL: urlSchema.default("http://localhost:3000"),
  COOKIE_DOMAIN: z.string(),

  GOOGLE_CLIENT_ID: z.string(),
  
  BCRYPT_ROUNDS: z.coerce.number().int().min(10).max(15).default(12),

  // ─── Email ────────────────────────────────────────
  RESEND_API_KEY: z.string(),
  RESEND_FROM_EMAIL: senderAddressSchema.default("noreply@eventclick.live"),
  // Where marketing-site demo and support requests are delivered. This is a
  // `to:` address, not a sender — `from:` stays RESEND_FROM_EMAIL, which is
  // the verified sending domain.
  CONTACT_NOTIFY_EMAIL: z.string().email().default("demo@ustuealkai.resend.app"),

  // ─── LiveKit ──────────────────────────────────────
  LIVEKIT_URL: z.string().min(1, "LIVEKIT_URL is required"),
  LIVEKIT_PUBLIC_URL: z.string().min(1, "LIVEKIT_PUBLIC_URL is required"),
  LIVEKIT_API_KEY: z.string().min(1, "LIVEKIT_API_KEY is required"),
  LIVEKIT_API_SECRET: z
    .string()
    .min(16, "LIVEKIT_API_SECRET must be at least 16 chars"),

  // ─── AWS ──────────────────────────────────────
  AWS_REGION: z.string().default("ap-south-1"),

  // ─── AWS SQS ──────────────────────────────────────
  SQS_QUEUE_URL: optionalUrlSchema,
  SQS_PDF_QUEUE_URL: optionalUrlSchema,
  SQS_WORKER_ENABLED: z.string().default("true"),
  SQS_DLQ_URL:optionalUrlSchema,

  // ─── S3 (MinIO dev / Cloudflare R2 prod) ──────────
  S3_ENDPOINT: urlSchema,
  S3_PUBLIC_ENDPOINT: urlSchema,
  S3_REGION: z.string().default("auto"),
  S3_BUCKET: z.string().min(1),
  S3_ACCESS_KEY: z.string().min(1),
  S3_SECRET_KEY: z.string().min(1),
  S3_FORCE_PATH_STYLE: z
    .string()
    .default("false")
    .transform((v) => v === "true"),

  GOTENBERG_URL: urlSchema.default(process.env.GOTENBERG_URL || "http://localhost:8686"),

  // ─── Server timeouts (production hardening) ─────────
  SERVER_HEADERS_TIMEOUT_MS: z.coerce.number().int().positive().default(60_000),
  SERVER_KEEPALIVE_TIMEOUT_MS: z.coerce.number().int().positive().default(5_000),
  SERVER_REQUEST_TIMEOUT_MS: z.coerce.number().int().positive().default(30_000),

  // ─── Data retention (GDPR) ─────────────────────────
  // 365 days is what docs/GDPR_COMPLIANCE_REPORT.md publishes as the retention
  // period for attendance, photos, submissions and recordings. The number
  // lives here rather than in the job so the published figure and the enforced
  // one can be reconciled without reading code.
  DATA_RETENTION_DAYS: z.coerce.number().int().positive().default(365),
  // Ships ENABLED. The purge has never run, so its first pass faces a backlog
  // nobody has measured — it reports what it would delete until an operator
  // deliberately turns this off. See docs/runbooks/data-retention.md.
  DATA_RETENTION_DRY_RUN: z
    .string()
    .default("true")
    .transform((v) => v !== "false"),

  // ─── Audit log retention ───────────────────────────
  // 365 days, the standard retention period for security and audit logs:
  //   - PCI DSS v4.0 req. 10.5.1 — at least 12 months of audit log history
  //   - CIS Controls v8, control 8.10 — 90 days minimum, 12 months recommended
  //   - SOC 2 / ISO 27001 programmes conventionally evidence 12 months
  // GDPR sets no audit retention period at all; art. 5(1)(e) storage limitation
  // pushes the other way, so a longer period needs a reason rather than a
  // shorter one needing an excuse.
  //
  // This replaces an uncited "7 years" that the compliance report asserted and
  // nothing enforced. 7 years is a tax and financial records convention; it
  // applies if Eventclick is under such an obligation, and that obligation has
  // not been established. If it is later, raise this and cite it in the report
  // in the same change — see docs/runbooks/audit-retention.md.
  AUDIT_RETENTION_DAYS: z.coerce.number().int().positive().default(365),
  // Ships ENABLED, for the same reason as the data purge and one more: the
  // audit trail is the record used to reconstruct what happened, so a wrong
  // cutoff destroys the evidence needed to investigate the mistake.
  AUDIT_RETENTION_DRY_RUN: z
    .string()
    .default("true")
    .transform((v) => v !== "false"),

  // ─── Audit log archive (WORM) ──────────────────────
  // R2 bucket the purge writes expired rows to before deleting them. Must be a
  // bucket with a lock rule (R2 bucket locks / S3 Object Lock), and must NOT be
  // S3_BUCKET: a lock rule there would make recordings and activity photos
  // undeletable too, breaking the data retention purge and any erasure request.
  // Credentials and endpoint are shared with S3_* — same R2 account.
  //
  // Empty means no archive is configured. The purge then refuses to delete
  // anything unless AUDIT_ARCHIVE_DISABLED says the destruction was intended.
  AUDIT_ARCHIVE_BUCKET: z.string().default(""),
  // The explicit acknowledgement that expired audit rows are to be destroyed
  // with no archived copy. Deliberately a separate variable from an empty
  // bucket name, so deleting the backlog is something somebody chose rather
  // than something that happened because a value was missing.
  AUDIT_ARCHIVE_DISABLED: z
    .string()
    .default("false")
    .transform((v) => v === "true"),

  // ─── Observability (optional) ──────────────────────
  SENTRY_SERVER_DSN: z.string().optional(),
  // Sampling is environment policy, not a code constant: production runs on a
  // two-vCPU box that also hosts Postgres, Redis and the PDF renderer, so it
  // cannot afford the tracing and profiling that are useful in development.
  // Defaults are applied per NODE_ENV in instrument.ts when these are unset.
  SENTRY_TRACES_SAMPLE_RATE: z.coerce.number().min(0).max(1).optional(),
  SENTRY_PROFILES_SAMPLE_RATE: z.coerce.number().min(0).max(1).optional(),
  // The deployed image tag, so an issue can be attributed to the deploy that
  // introduced it. Supplied as IMAGE_TAG by scripts/deploy.sh.
  SENTRY_RELEASE: z.string().optional(),

  // ─── Web Push (optional — push is disabled if unset) ─────
  VAPID_PUBLIC_KEY: z.string().optional(),
  VAPID_PRIVATE_KEY: z.string().optional(),
  VAPID_SUBJECT: z.string().default("mailto:support@eventclick.live"),
}).refine(
  (e) => {
    if (e.NODE_ENV === "production") {
      return !!e.AUTH_DATABASE_URL && !!e.APP_DATABASE_URL;
    }
    return !!e.DATABASE_URL || (!!e.AUTH_DATABASE_URL && !!e.APP_DATABASE_URL);
  },
  {
    message: "In production, AUTH_DATABASE_URL and APP_DATABASE_URL are required for RLS isolation. In dev, DATABASE_URL or both RLS URLs are required.",
    path: ["DATABASE_URL"],
  }
).refine((e) => e.AUDIT_RETENTION_DAYS >= e.DATA_RETENTION_DAYS, {
  // The audit trail has to outlive the data it describes, or the system reaches
  // a state where a record still exists and the log of who touched it does not
  // — which is precisely the question an audit trail exists to answer. Both
  // have defaults, so this comparison always runs.
  message:
    "AUDIT_RETENTION_DAYS must be >= DATA_RETENTION_DAYS: purging the audit trail " +
    "before the data it describes leaves records nobody can account for.",
  path: ["AUDIT_RETENTION_DAYS"],
});


const parsed = EnvSchema.safeParse(process.env);

if (!parsed.success) {
  console.error("\n❌ Invalid environment variables:");
  console.error(z.flattenError(parsed.error).fieldErrors);
  process.exit(1);
}

export const env = parsed.data;
export type Env = z.infer<typeof EnvSchema>;
