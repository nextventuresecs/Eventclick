import { Client } from "pg";

const DATABASE_URL =
  process.env.DATABASE_URL ||
  process.env.PLAYWRIGHT_DATABASE_URL ||
  "postgresql://test:test@localhost:5432/eventclick_test";

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

    const tables = result.rows.map((r) => `"${r.tablename}"`).join(", ");

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
