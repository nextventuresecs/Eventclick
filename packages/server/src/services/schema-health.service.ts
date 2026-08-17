import { pool } from "../db";
import { logger } from "../utils/logger";

/**
 * Database privilege invariants for the RLS model.
 *
 * Production once ran for months with `app_user` holding no privileges on
 * schema public: every tenant-scoped SELECT silently returned zero rows and
 * every INSERT failed its RLS WITH CHECK predicate. Neither the test suite nor
 * `/ready` noticed, because `SELECT 1` needs no schema privilege and the tests
 * mocked the database away.
 *
 * This probe asserts properties that must hold in every environment, forever —
 * deliberately NOT counts of tables or policies, which change with each
 * migration and turn a real signal into a number people bump until it passes.
 *
 *   error    a security or availability invariant is broken
 *   degraded a table is RLS-enabled but unusable or unprotected
 *   ok       all invariants hold
 *
 * Catalog-only: no application tables are read, so it is cheap and leaks no
 * tenant data. Exposed via /health/deep (deploy smoke tests), never /ready.
 */
const INVARIANT_QUERY = `
  WITH role_state AS (
    SELECT
      EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'app_user') AS role_exists,
      COALESCE((SELECT rolbypassrls FROM pg_roles WHERE rolname = 'app_user'), false) AS bypasses_rls
  ),
  rls_tables AS (
    SELECT c.oid
    FROM pg_class c
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public' AND c.relkind = 'r' AND c.relrowsecurity
  ),
  identity_tables AS (
    SELECT c.oid
    FROM pg_class c
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public'
      AND c.relname IN ('sessions', 'password_resets', 'email_verifications')
  )
  SELECT
    rs.role_exists,
    rs.bypasses_rls,
    CASE WHEN rs.role_exists
         THEN has_schema_privilege('app_user', 'public', 'USAGE')
         ELSE false END AS schema_usage,
    (SELECT count(*) FROM rls_tables t
      WHERE NOT EXISTS (SELECT 1 FROM pg_policy p WHERE p.polrelid = t.oid)
    )::int AS rls_tables_without_policy,
    CASE WHEN rs.role_exists THEN (
      SELECT count(*) FROM rls_tables t
       WHERE NOT has_table_privilege('app_user', t.oid, 'SELECT')
    ) ELSE 0 END::int AS rls_tables_without_grant,
    CASE WHEN rs.role_exists THEN (
      SELECT count(*) FROM identity_tables t
       WHERE has_table_privilege('app_user', t.oid, 'SELECT')
    ) ELSE 0 END::int AS identity_tables_exposed
  FROM role_state rs
`;

interface InvariantRow {
  role_exists: boolean;
  schema_usage: boolean;
  bypasses_rls: boolean;
  rls_tables_without_policy: number;
  rls_tables_without_grant: number;
  identity_tables_exposed: number;
}

export type SchemaHealth = "ok" | "degraded" | "error";

export async function checkSchemaInvariants(): Promise<SchemaHealth> {
  try {
    const result = await pool.query<InvariantRow>(INVARIANT_QUERY);
    const row = result.rows[0];

    if (!row) {
      logger.error({ check: "schema" }, "Schema invariant probe returned no row");
      return "error";
    }

    // Broken security or availability invariants — the application cannot work
    // correctly, or the tenant boundary is not being enforced.
    const violations: string[] = [];
    if (!row.role_exists) violations.push("app_user role is missing");
    if (!row.schema_usage) violations.push("app_user lacks USAGE on schema public");
    if (row.bypasses_rls) violations.push("app_user has BYPASSRLS — tenant isolation is off");
    if (row.identity_tables_exposed > 0) {
      violations.push(`app_user can read ${row.identity_tables_exposed} identity table(s)`);
    }

    if (violations.length > 0) {
      logger.error({ check: "schema", violations, row }, "Database privilege invariants violated");
      return "error";
    }

    // Individual tables misconfigured: RLS on but unusable, or unprotected.
    const warnings: string[] = [];
    if (row.rls_tables_without_grant > 0) {
      warnings.push(`${row.rls_tables_without_grant} RLS table(s) not readable by app_user`);
    }
    if (row.rls_tables_without_policy > 0) {
      warnings.push(`${row.rls_tables_without_policy} RLS table(s) have no policy`);
    }

    if (warnings.length > 0) {
      logger.warn({ check: "schema", warnings, row }, "Database privilege drift detected");
      return "degraded";
    }

    return "ok";
  } catch (err) {
    logger.error({ err, check: "schema" }, "Schema invariant probe failed");
    return "error";
  }
}
