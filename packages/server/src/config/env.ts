import path from "node:path";
import dotenv from "dotenv";
import { z } from "zod";

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
  REDIS_URL: urlSchema,

  JWT_SECRET: z.string().min(16, "JWT_SECRET must be at least 16 chars"),
  JWT_REFRESH_SECRET: z
    .string()
    .min(16, "JWT_REFRESH_SECRET must be at least 16 chars"),
  JWT_ACCESS_TTL: z.string().default("15m"),
  JWT_REFRESH_TTL: z.string().default("7d"),

  CORS_ORIGIN: z.string().default("http://localhost:3000"),
  RATE_LIMIT_WINDOW_MS: z.coerce.number().int().positive().default(60_000),
  RATE_LIMIT_MAX: z.coerce.number().int().positive().default(10000),

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
  RESEND_FROM_EMAIL: z.string().default("noreply@eventclick.live"),

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
  SQS_PDF_QUEUE_URL: urlSchema,
  SQS_WORKER_ENABLED: z.string().default("true"),
  SQS_DLQ_URL:urlSchema,

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

  // ─── Observability (optional) ──────────────────────
  SENTRY_SERVER_DSN: z.string().optional(),
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
);


const parsed = EnvSchema.safeParse(process.env);

if (!parsed.success) {
  console.error("\n❌ Invalid environment variables:");
  console.error(z.flattenError(parsed.error).fieldErrors);
  process.exit(1);
}

export const env = parsed.data;
export type Env = z.infer<typeof EnvSchema>;
