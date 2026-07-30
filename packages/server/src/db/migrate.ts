import "dotenv/config";
import { Pool } from "pg";
import { drizzle } from "drizzle-orm/node-postgres";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import { env } from "../config/env";

async function main() {
  const url = env.DATABASE_URL;
  if (!url) {
    console.error("DATABASE_URL is required");
    process.exit(1);
  }

  const pool = new Pool({ connectionString: url, max: 1 });
  const db = drizzle(pool);

  console.log("[migrate] ensuring required extensions…");
  await pool.query('CREATE EXTENSION IF NOT EXISTS "uuid-ossp"');
  await pool.query('CREATE EXTENSION IF NOT EXISTS "pgcrypto"');

  console.log("[migrate] running migrations…");
  await migrate(db, { migrationsFolder: "./drizzle" });
  console.log("[migrate] ✅ done");
  await pool.end();
}

main().catch((err) => {
  console.error("[migrate] ❌", err);
  process.exit(1);
});
