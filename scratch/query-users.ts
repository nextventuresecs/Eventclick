import { Pool } from "pg";
import { drizzle } from "drizzle-orm/node-postgres";
import * as schema from "../packages/server/src/db/schema";
import * as dotenv from "dotenv";
import * as path from "path";

dotenv.config({ path: path.join(__dirname, "../.env") });

const connectionString = process.env.DATABASE_URL;
if (!connectionString) {
  console.error("DATABASE_URL is not set");
  process.exit(1);
}

const pool = new Pool({ connectionString });
const db = drizzle(pool, { schema });

async function main() {
  const users = await db.select().from(schema.users);
  console.log("Registered Users count:", users.length);
  users.forEach(u => {
    console.log(`- ID: ${u.id}, Email: ${u.email}, Name: ${u.fullName}`);
  });

  const resets = await db.select().from(schema.passwordResets);
  console.log("\nPassword Resets count:", resets.length);
  resets.forEach(r => {
    console.log(`- ID: ${r.id}, UserID: ${r.userId}, Token: ${r.token}, ExpiresAt: ${r.expiresAt}, UsedAt: ${r.usedAt}`);
  });

  await pool.end();
}

main().catch(err => {
  console.error(err);
  pool.end();
});
