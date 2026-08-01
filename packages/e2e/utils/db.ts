import { Client } from "pg";

const DATABASE_URL =
  process.env.DATABASE_URL ||
  process.env.PLAYWRIGHT_DATABASE_URL ||
  "postgresql://Eventclick_admin:1234@localhost:5433/Eventclick_db";

const TABLES_TO_PRESERVE = [
  "users",
  "organizations",
  "org_members",
  "email_verifications",
  "sessions",
  "password_resets",
];

export async function truncateAllTables() {
  const client = new Client({ connectionString: DATABASE_URL });
  await client.connect();

  try {
    await client.query("BEGIN");

    const result = await client.query(`
      SELECT tablename
      FROM pg_tables
      WHERE schemaname = 'public'
        AND tablename NOT LIKE 'spatial_ref_sys'
        AND tablename != 'schema_migrations'
    `);

    const tables = result.rows
      .map((r) => r.tablename)
      .filter((t) => !TABLES_TO_PRESERVE.includes(t))
      .map((t) => `"${t}"`)
      .join(", ");

    if (tables) {
      await client.query(`TRUNCATE TABLE ${tables} RESTART IDENTITY CASCADE`);
    }

    await client.query("COMMIT");
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    await client.end();
  }
}

export async function resetDb() {
  const client = new Client({ connectionString: DATABASE_URL });
  await client.connect();

  try {
    await client.query("BEGIN");

    const result = await client.query(`
      SELECT tablename
      FROM pg_tables
      WHERE schemaname = 'public'
        AND tablename NOT LIKE 'spatial_ref_sys'
        AND tablename != 'schema_migrations'
    `);

    const tables = result.rows
      .map((r) => r.tablename)
      .filter((t) => !TABLES_TO_PRESERVE.includes(t))
      .map((t) => `"${t}"`)
      .join(", ");

    if (tables) {
      await client.query(`TRUNCATE TABLE ${tables} RESTART IDENTITY CASCADE`);
    }

    await client.query("COMMIT");
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    await client.end();
  }
}
