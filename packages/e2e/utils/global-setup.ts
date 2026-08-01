import { chromium } from "@playwright/test";
import { Client } from "pg";
import argon2 from "argon2";

const API_BASE = process.env.PLAYWRIGHT_API_BASE_URL || "http://localhost:4000";
const BASE_URL = process.env.PLAYWRIGHT_TEST_BASE_URL || "http://localhost:3000";

const DATABASE_URL =
  process.env.DATABASE_URL ||
  process.env.PLAYWRIGHT_DATABASE_URL ||
  "postgresql://Eventclick_admin:1234@localhost:5433/Eventclick_db";

async function createUserInDb(
  client: Client,
  email: string,
  password: string,
  fullName: string,
  role: "admin" | "volunteer",
  orgId: string | null,
) {
  const passwordHash = await argon2.hash(password);

  await client.query("BEGIN");

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

  await client.query("COMMIT");
}

async function loginAndGetToken(email: string, password: string): Promise<{ accessToken: string | null; refreshToken: string | null }> {
  const res = await fetch(`${API_BASE}/api/v1/auth/login`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Origin": API_BASE,
      "Referer": API_BASE,
    },
    body: JSON.stringify({ email, password }),
  });

  if (res.ok) {
    const body = await res.json();
    const setCookie = res.headers.get("set-cookie") || "";
    const refreshMatch = setCookie.match(/Eventclick_rt=([^;]+)/);
    const refreshToken = refreshMatch ? refreshMatch[1] : null;
    return { accessToken: body.accessToken, refreshToken };
  }
  return { accessToken: null, refreshToken: null };
}

export default async function globalSetup() {
  console.log("[globalSetup] starting");
  const client = new Client({ connectionString: DATABASE_URL });
  await client.connect();
  console.log("[globalSetup] connected to DB");

  try {
    await client.query("BEGIN");
    console.log("[globalSetup] transaction started");

    const result = await client.query(`
      SELECT tablename
      FROM pg_tables
      WHERE schemaname = 'public'
        AND tablename NOT LIKE 'spatial_ref_sys'
        AND tablename != 'schema_migrations'
    `);

    const tables = result.rows.map((r) => `"${r.tablename}"`).join(", ");
    console.log("[globalSetup] tables:", tables);

    if (tables) {
      await client.query(`TRUNCATE TABLE ${tables} RESTART IDENTITY CASCADE`);
      console.log("[globalSetup] tables truncated");
    }

    await client.query("COMMIT");
    console.log("[globalSetup] transaction committed");
  } catch (error) {
    await client.query("ROLLBACK");
    console.error("[globalSetup] error:", error.message);
    throw error;
  } finally {
    await client.end();
  }

  const adminEmail = process.env.PLAYWRIGHT_ADMIN_EMAIL || "admin@test.com";
  const adminPassword = process.env.PLAYWRIGHT_ADMIN_PASSWORD || "E2eStrong!2024XyZ";

  console.log("[globalSetup] creating admin user");
  const adminClient = new Client({ connectionString: DATABASE_URL });
  await adminClient.connect();
  await createUserInDb(adminClient, adminEmail, adminPassword, "E2E Admin", "admin", null);
  console.log("[globalSetup] admin user created");

  console.log("[globalSetup] creating organization");
  const orgResult = await adminClient.query(
    `INSERT INTO organizations (name, slug, contact_email, is_active, created_at, updated_at)
     VALUES ($1, $2, $3, $4, NOW(), NOW())
     RETURNING id`,
    ["E2E Test Org", "e2e-test-org", adminEmail, true]
  );
  const orgId = orgResult.rows[0].id;
  console.log("[globalSetup] organization created:", orgId);

  console.log("[globalSetup] updating admin org");
  await adminClient.query(
    `UPDATE users SET organization_id = $1, updated_at = NOW() WHERE email = $2`,
    [orgId, adminEmail]
  );

  await adminClient.query(
    `INSERT INTO org_members (user_id, organization_id, role, created_at, updated_at)
     SELECT id, $1, $2, NOW(), NOW() FROM users WHERE email = $3`,
    [orgId, "admin", adminEmail]
  );
  console.log("[globalSetup] admin org membership created");
  await adminClient.end();

  console.log("[globalSetup] logging in admin");
  const { accessToken: adminAccessToken, refreshToken: adminRefreshToken } = await loginAndGetToken(adminEmail, adminPassword);
  console.log("[globalSetup] admin token:", adminAccessToken ? " obtained" : "null");

  console.log("[globalSetup] launching browser");
  const browser = await chromium.launch();
  console.log("[globalSetup] browser launched");
  const context = await browser.newContext({ baseURL: BASE_URL });
  console.log("[globalSetup] context created");

  if (adminAccessToken) {
    const adminCookies = [
      {
        name: "Eventclick_at",
        value: adminAccessToken,
        domain: "localhost",
        path: "/",
        httpOnly: true,
        sameSite: "Lax",
      } as any,
    ];
    if (adminRefreshToken) {
      adminCookies.push({
        name: "Eventclick_rt",
        value: adminRefreshToken,
        domain: "localhost",
        path: "/api/v1/auth",
        httpOnly: true,
        sameSite: "Lax",
      } as any);
    }
    await context.addCookies(adminCookies);
  }

  console.log("[globalSetup] saving admin storageState");
  await context.storageState({ path: ".auth/admin.json" });

  const volunteerEmail = process.env.PLAYWRIGHT_VOLUNTEER_EMAIL || "volunteer@test.com";
  const volunteerPassword = process.env.PLAYWRIGHT_VOLUNTEER_PASSWORD || "E2eStrong!2024XyZ";

  console.log("[globalSetup] creating volunteer user");
  const volunteerClient = new Client({ connectionString: DATABASE_URL });
  await volunteerClient.connect();
  await createUserInDb(volunteerClient, volunteerEmail, volunteerPassword, "E2E Volunteer", "volunteer", orgId);
  console.log("[globalSetup] volunteer user created");
  await volunteerClient.end();

  console.log("[globalSetup] logging in volunteer");
  const { accessToken: volunteerAccessToken, refreshToken: volunteerRefreshToken } = await loginAndGetToken(volunteerEmail, volunteerPassword);
  console.log("[globalSetup] volunteer token:", volunteerAccessToken ? " obtained" : "null");

  console.log("[globalSetup] creating volunteer context");
  const volunteerContext = await browser.newContext({ baseURL: BASE_URL });

  if (volunteerAccessToken) {
    const volunteerCookies = [
      {
        name: "Eventclick_at",
        value: volunteerAccessToken,
        domain: "localhost",
        path: "/",
        httpOnly: true,
        sameSite: "Lax",
      } as any,
    ];
    if (volunteerRefreshToken) {
      volunteerCookies.push({
        name: "Eventclick_rt",
        value: volunteerRefreshToken,
        domain: "localhost",
        path: "/api/v1/auth",
        httpOnly: true,
        sameSite: "Lax",
      } as any);
    }
    await volunteerContext.addCookies(volunteerCookies);
  }

  console.log("[globalSetup] saving volunteer storageState");
  await volunteerContext.storageState({ path: ".auth/volunteer.json" });

  console.log("[globalSetup] closing browser");
  await browser.close();
  console.log("[globalSetup] complete");
}
