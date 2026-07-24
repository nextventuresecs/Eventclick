import path from "node:path";
import dotenv from "dotenv";
import type { Config } from "drizzle-kit";
import { env } from "./src/config/env";

const candidates = [
  path.resolve(process.cwd(), ".env"),
  path.resolve(process.cwd(), "../.env"),
];
for (const p of candidates) {
  dotenv.config({ path: p });
}

export default {
  schema: "./src/db/schema/index.ts",
  out: "./drizzle",
  dialect: "postgresql",
  dbCredentials: {
    url: env.DATABASE_URL ?? "",
  },
  strict: true,
  verbose: true,
} satisfies Config;
