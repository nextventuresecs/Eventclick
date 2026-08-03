import { Client } from "pg";
import argon2 from "argon2";
import { createClient } from "redis";

const API_BASE = process.env.PLAYWRIGHT_API_BASE_URL || "http://localhost:4000";

const DATABASE_URL =
  process.env.DATABASE_URL ||
  process.env.PLAYWRIGHT_DATABASE_URL;

const adminEmail = process.env.PLAYWRIGHT_ADMIN_EMAIL || "admin@test.com";
const adminPassword = process.env.PLAYWRIGHT_ADMIN_PASSWORD;
const volunteerEmail = process.env.PLAYWRIGHT_VOLUNTEER_EMAIL || "volunteer@test.com";
const volunteerPassword = process.env.PLAYWRIGHT_VOLUNTEER_PASSWORD;

if (!adminPassword || !volunteerPassword) {
  throw new Error("[globalSetup] PLAYWRIGHT_ADMIN_PASSWORD and PLAYWRIGHT_VOLUNTEER_PASSWORD must be set");
}

async function createUserInDb(
  client: Client,
  email: string,
  password: string,
  fullName: string,
  role: "admin" | "volunteer",
  orgId: string | null,
) {
  const passwordHash = await argon2.hash(password);
  await client.query(
    `INSERT INTO users (email, password_hash, full_name, role, organization_id, is_active, email_verified_at, created_at, updated_at)
     VALUES ($1, $2, $3, $4, $5, $6, NOW(), NOW(), NOW())
     ON CONFLICT (email) DO UPDATE SET password_hash = EXCLUDED.password_hash`,
    [email, passwordHash, fullName, role, orgId, true]
  );

  if (orgId) {
    await client.query(
      `INSERT INTO org_members (user_id, organization_id, role, created_at, updated_at)
       SELECT id, $1, $2, NOW(), NOW() FROM users WHERE email = $3
       ON CONFLICT (user_id, organization_id) DO UPDATE SET role = EXCLUDED.role`,
      [orgId, role, email]
    );
  }
}

async function waitForServer(url: string, retries = 60, delayMs = 1000) {
  console.log(`[globalSetup] waiting for server at ${url}`);
  for (let i = 0; i < retries; i++) {
    try {
      const res = await fetch(url);
      if (res.ok) {
        console.log("[globalSetup] server is ready");
        return;
      }
    } catch {
      // ignore
    }
    await new Promise(r => setTimeout(r, delayMs));
  }
  throw new Error(`[globalSetup] server at ${url} failed to become ready`);
}

export default async function globalSetup() {
  console.log("[globalSetup] starting");
  
  await waitForServer(`${API_BASE}/api/v1/health`);

  if (!DATABASE_URL) {
    throw new Error("[globalSetup] DATABASE_URL must be set");
  }

  const client = new Client({ connectionString: DATABASE_URL });
  await client.connect();
  console.log("[globalSetup] connected to DB");

  const redisClient = createClient({ url: process.env.REDIS_URL || "redis://localhost:6379" });
  await redisClient.connect();
  console.log("[globalSetup] connected to Redis");

  try {
    console.log("[globalSetup] flushing redis cache");
    await redisClient.flushAll();

    await client.query("BEGIN");
    const result = await client.query(`
      SELECT tablename
      FROM pg_tables
      WHERE schemaname = 'public'
        AND tablename NOT LIKE 'spatial_ref_sys'
        AND tablename != 'schema_migrations'
    `);
    const tables = result.rows.map((r) => `"${r.tablename}"`).join(", ");
    if (tables) {
      await client.query(`TRUNCATE TABLE ${tables} RESTART IDENTITY CASCADE`);
      console.log("[globalSetup] tables truncated");
    }
    await client.query("COMMIT");

    console.log("[globalSetup] creating admin user");
    await client.query("BEGIN");
    await createUserInDb(client, adminEmail, adminPassword!, "E2E Admin", "admin", null);

    console.log("[globalSetup] creating organization");
    const orgResult = await client.query(
      `INSERT INTO organizations (name, slug, contact_email, is_active, created_at, updated_at)
       VALUES ($1, $2, $3, $4, NOW(), NOW())
       RETURNING id`,
      ["E2E Test Org", "e2e-test-org", adminEmail, true]
    );
    const orgId = orgResult.rows[0].id;

    await client.query(
      `UPDATE users SET organization_id = $1, updated_at = NOW() WHERE email = $2`,
      [orgId, adminEmail]
    );
    await client.query(
      `INSERT INTO org_members (user_id, organization_id, role, created_at, updated_at)
       SELECT id, $1, $2, NOW(), NOW() FROM users WHERE email = $3`,
      [orgId, "admin", adminEmail]
    );
    
    console.log("[globalSetup] creating volunteer user");
    await createUserInDb(client, volunteerEmail, volunteerPassword!, "E2E Volunteer", "volunteer", orgId);
    await client.query("COMMIT");
  } catch (error: any) {
    await client.query("ROLLBACK");
    console.error("[globalSetup] db setup error:", error.message);
    throw error;
  } finally {
    await client.end();
    await redisClient.disconnect();
  }

  console.log("[globalSetup] complete");
}
