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

const EnvSchema = z.object({
  NODE_ENV: z
    .enum(["development", "test", "production"])
    .default("development"),
  PORT: z.coerce.number().int().nonnegative().default(4000),
  API_PORT: z.coerce.number().int().nonnegative().default(4000),
  LOG_LEVEL: z
    .enum(["fatal", "error", "warn", "info", "debug", "trace", "silent"])
    .optional(),

  DATABASE_URL: z.url(),
  AUTH_DATABASE_URL: z.url().optional(),
  DB_POOL_MAX: z.coerce.number().int().positive().default(10),
  REDIS_URL: z.url(),

  JWT_SECRET: z.string().min(16, "JWT_SECRET must be at least 16 chars"),
  JWT_REFRESH_SECRET: z
    .string()
    .min(16, "JWT_REFRESH_SECRET must be at least 16 chars"),
  JWT_ACCESS_TTL: z.string().default("15m"),
  JWT_REFRESH_TTL: z.string().default("7d"),

  CORS_ORIGIN: z.string().default("http://localhost:3000"),
  RATE_LIMIT_WINDOW_MS: z.coerce.number().int().positive().default(60_000),
  RATE_LIMIT_MAX: z.coerce.number().int().positive().default(100),

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

  APP_URL: z.url().default("http://localhost:3000"),
  COOKIE_DOMAIN: z.string().optional(),

  GOOGLE_CLIENT_ID: z.string().optional(),

  BCRYPT_ROUNDS: z.coerce.number().int().min(10).max(15).default(12),

  // ─── Email ────────────────────────────────────────
  RESEND_API_KEY: z.string().optional(),
  RESEND_FROM_EMAIL: z.string().default("noreply@Eventclick.com"),

  // ─── LiveKit ──────────────────────────────────────
  LIVEKIT_URL: z.string().min(1, "LIVEKIT_URL is required"),
  LIVEKIT_PUBLIC_URL: z.string().min(1, "LIVEKIT_PUBLIC_URL is required"),
  LIVEKIT_API_KEY: z.string().min(1, "LIVEKIT_API_KEY is required"),
  LIVEKIT_API_SECRET: z
    .string()
    .min(16, "LIVEKIT_API_SECRET must be at least 16 chars"),

  // ─── S3 (MinIO dev / Cloudflare R2 prod) ──────────
  S3_ENDPOINT: z.url(),
  S3_PUBLIC_ENDPOINT: z.url(),
  S3_REGION: z.string().default("us-east-1"),
  S3_BUCKET: z.string().min(1),
  S3_ACCESS_KEY: z.string().min(1),
  S3_SECRET_KEY: z.string().min(1),
  S3_FORCE_PATH_STYLE: z
    .string()
    .default("false")
    .transform((v) => v === "true"),

  // ─── Gotenberg (PDF generation) ────────────────────
  GOTENBERG_URL: z.string().url().default("http://gotenberg:3000"),

  // ─── AWS SQS ──────────────────────────────────────
  SQS_QUEUE_URL: z.string().url().optional(),
  SQS_WORKER_ENABLED: z.string().optional(),

  // ─── Server timeouts (production hardening) ─────────
  SERVER_HEADERS_TIMEOUT_MS: z.coerce.number().int().positive().default(60_000),
  SERVER_KEEPALIVE_TIMEOUT_MS: z.coerce.number().int().positive().default(5_000),
  SERVER_REQUEST_TIMEOUT_MS: z.coerce.number().int().positive().default(30_000),

  // ─── Observability (optional) ──────────────────────
  SENTRY_DSN: z.string().optional(),
});

const parsed = EnvSchema.safeParse(process.env);

if (!parsed.success) {
  console.error("\n❌ Invalid environment variables:");
  console.error(z.flattenError(parsed.error).fieldErrors);
  process.exit(1);
}

export const env = parsed.data;
export type Env = z.infer<typeof EnvSchema>;
