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

  const client = await pool.connect();
  const lockId = 7777777; // arbitrary lock ID for migrations

  try {
    console.log("[migrate] acquiring advisory lock…");
    await client.query("SELECT pg_advisory_lock($1)", [lockId]);

    console.log("[migrate] ensuring required extensions…");
    await client.query('CREATE EXTENSION IF NOT EXISTS "uuid-ossp"');
    await client.query('CREATE EXTENSION IF NOT EXISTS "pgcrypto"');
    await client.query('CREATE EXTENSION IF NOT EXISTS "postgis"');

    console.log("[migrate] running migrations…");
    const db = drizzle(client);
    await migrate(db, { migrationsFolder: "./drizzle" });
    console.log("[migrate] ✅ done");
  } finally {
    console.log("[migrate] releasing advisory lock…");
    await client.query("SELECT pg_advisory_unlock($1)", [lockId]);
    client.release();
    await pool.end();
  }
}

main().catch((err) => {
  console.error("[migrate] ❌", err);
  process.exit(1);
});
