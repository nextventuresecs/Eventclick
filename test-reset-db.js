const { Client } = require("pg");

async function resetDb() {
  const client = new Client({ connectionString: "postgresql://Eventclick_admin:1234@localhost:5433/Eventclick_db" });
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

    const TABLES_TO_PRESERVE = [
      "users",
      "organizations",
      "org_members",
      "email_verifications",
      "sessions",
      "password_resets",
    ];

    const tables = result.rows
      .map((r) => r.tablename)
      .filter((t) => !TABLES_TO_PRESERVE.includes(t))
      .map((t) => `"${t}"`)
      .join(", ");

    console.log("Tables to truncate:", tables);

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

async function check() {
  await resetDb();
  const client = new Client({ connectionString: "postgresql://Eventclick_admin:1234@localhost:5433/Eventclick_db" });
  await client.connect();
  const r1 = await client.query('SELECT COUNT(*) FROM users');
  const r2 = await client.query('SELECT COUNT(*) FROM organizations');
  const r3 = await client.query('SELECT COUNT(*) FROM event_rooms');
  console.log("users:", r1.rows[0].count);
  console.log("orgs:", r2.rows[0].count);
  console.log("rooms:", r3.rows[0].count);
  await client.end();
}

check().catch(console.error);
