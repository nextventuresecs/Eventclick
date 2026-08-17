-- ─────────────────────────────────────────────────────────────────────────────
-- init-db.sql — Postgres first-boot bootstrap for Eventclick
-- ─────────────────────────────────────────────────────────────────────────────
--
-- SCOPE — read before editing:
--   Docker runs everything in /docker-entrypoint-initdb.d exactly ONCE, when the
--   data directory is empty. On any cluster that already has data this file is
--   never executed again, so changes here reach NEW environments only.
--
--   Anything an EXISTING database must also receive belongs in a migration
--   (packages/server/drizzle/*.sql), which every environment replays on deploy.
--   Table privileges for app_user live in 0003_rls_privileges_converge.sql for
--   exactly this reason — a production cluster once ran for months without them
--   because they were added here instead.
--
--   This file therefore owns only what a migration cannot: extensions and the
--   login roles that hold credentials.
--
-- CREDENTIALS
--   Passwords come from the environment (APP_DB_PASSWORD / AUTH_DB_PASSWORD,
--   supplied from AWS SSM in production). The local_dev_* fallbacks exist so a
--   developer can `docker compose up` with no secrets configured; a warning is
--   emitted whenever a fallback is used so it can never pass unnoticed in a
--   production log.
--
-- Every statement is idempotent.
-- ─────────────────────────────────────────────────────────────────────────────

\set ON_ERROR_STOP on

-- ── Extensions ───────────────────────────────────────────────────────────────
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";
CREATE EXTENSION IF NOT EXISTS "postgis";

-- ── Resolve credentials from the environment ─────────────────────────────────
-- Defaults first so an unset variable can never break interpolation below.
\set app_db_password ''
\set auth_db_password ''
\getenv app_db_password APP_DB_PASSWORD
\getenv auth_db_password AUTH_DB_PASSWORD

SELECT
  COALESCE(NULLIF(:'app_db_password',  ''), 'local_dev_app')  AS app_pw,
  COALESCE(NULLIF(:'auth_db_password', ''), 'local_dev_auth') AS auth_pw,
  (NULLIF(:'app_db_password', '') IS NULL OR NULLIF(:'auth_db_password', '') IS NULL) AS using_dev_defaults
\gset

\if :using_dev_defaults
\echo '*** WARNING: APP_DB_PASSWORD / AUTH_DB_PASSWORD not set — using local dev defaults.'
\echo '*** Never acceptable outside local development. Populate them from SSM.'
\endif

-- ── Roles ────────────────────────────────────────────────────────────────────
-- app_user: NOLOGIN group role. Every application query runs with its
-- privileges and is filtered by the RLS policies attached to each table.
SELECT 'CREATE ROLE app_user NOLOGIN'
WHERE NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'app_user')
\gexec

-- app_user_login: the credential the application pool authenticates with
-- (APP_DATABASE_URL). Inherits app_user, so RLS applies.
SELECT format('CREATE ROLE app_user_login LOGIN PASSWORD %L IN ROLE app_user', :'app_pw')
WHERE NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'app_user_login')
\gexec

SELECT format('ALTER ROLE app_user_login WITH LOGIN PASSWORD %L', :'app_pw')
WHERE EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'app_user_login')
\gexec

-- auth_svc_role: pre-tenant identity work (login, sessions, password resets,
-- share-token -> organization resolution). BYPASSRLS because the tenant is not
-- known until the user has been identified.
SELECT format('CREATE ROLE auth_svc_role LOGIN BYPASSRLS PASSWORD %L', :'auth_pw')
WHERE NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'auth_svc_role')
\gexec

SELECT format('ALTER ROLE auth_svc_role WITH LOGIN BYPASSRLS PASSWORD %L', :'auth_pw')
WHERE EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'auth_svc_role')
\gexec

-- app_user must never bypass RLS, whatever a previous run may have set.
ALTER ROLE app_user NOBYPASSRLS;
ALTER ROLE app_user_login NOBYPASSRLS;

-- ── Schema-level privileges ──────────────────────────────────────────────────
-- Postgres 15+ no longer grants schema usage implicitly. Without USAGE,
-- unqualified table names fail to resolve and Postgres reports
-- 'relation "..." does not exist' rather than a permission error.
--
-- Table-level grants and default privileges are NOT set here — migration
-- 0003_rls_privileges_converge.sql owns them, so existing clusters converge too.
GRANT USAGE ON SCHEMA public TO app_user, auth_svc_role;

SELECT 'Eventclick_db database initialized' AS status;
