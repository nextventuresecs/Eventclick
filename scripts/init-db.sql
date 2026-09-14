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
--   Passwords come from the environment (APP_DB_PASSWORD / AUTH_DB_PASSWORD /
--   MAINTAINER_RO_DB_PASSWORD / MAINTAINER_AUDIT_DB_PASSWORD, supplied from AWS
--   SSM in production). The local_dev_* fallbacks exist so a
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
\set maint_ro_db_password ''
\set maint_audit_db_password ''
\getenv app_db_password APP_DB_PASSWORD
\getenv auth_db_password AUTH_DB_PASSWORD
\getenv maint_ro_db_password MAINTAINER_RO_DB_PASSWORD
\getenv maint_audit_db_password MAINTAINER_AUDIT_DB_PASSWORD

SELECT
  COALESCE(NULLIF(:'app_db_password',  ''), 'local_dev_app')  AS app_pw,
  COALESCE(NULLIF(:'auth_db_password', ''), 'local_dev_auth') AS auth_pw,
  COALESCE(NULLIF(:'maint_ro_db_password',    ''), 'local_dev_maint_ro')    AS maint_ro_pw,
  COALESCE(NULLIF(:'maint_audit_db_password', ''), 'local_dev_maint_audit') AS maint_audit_pw,
  (NULLIF(:'app_db_password', '') IS NULL OR NULLIF(:'auth_db_password', '') IS NULL
   OR NULLIF(:'maint_ro_db_password', '') IS NULL OR NULLIF(:'maint_audit_db_password', '') IS NULL) AS using_dev_defaults
\gset

\if :using_dev_defaults
\echo '*** WARNING: APP_DB_PASSWORD / AUTH_DB_PASSWORD / MAINTAINER_RO_DB_PASSWORD / MAINTAINER_AUDIT_DB_PASSWORD'
\echo '*** not all set — using local dev defaults for the missing ones.'
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

-- Ops Console roles (#146). The NOLOGIN group roles and every privilege they
-- carry belong to migration 0013_ops_console_foundation.sql; they are created
-- here only so the login roles below can join them before migrations run.
SELECT 'CREATE ROLE maintainer_ro NOLOGIN BYPASSRLS'
WHERE NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'maintainer_ro')
\gexec

SELECT 'CREATE ROLE maintainer_audit_writer NOLOGIN NOBYPASSRLS'
WHERE NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'maintainer_audit_writer')
\gexec

-- maintainer_ro_login: cross-tenant, read-only. BYPASSRLS is repeated here
-- because role attributes are not inherited through membership.
SELECT format('CREATE ROLE maintainer_ro_login LOGIN BYPASSRLS PASSWORD %L IN ROLE maintainer_ro', :'maint_ro_pw')
WHERE NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'maintainer_ro_login')
\gexec

SELECT format('ALTER ROLE maintainer_ro_login WITH LOGIN BYPASSRLS PASSWORD %L', :'maint_ro_pw')
WHERE EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'maintainer_ro_login')
\gexec

-- maintainer_audit_login: INSERT on maintainer_access_log and nothing else.
SELECT format('CREATE ROLE maintainer_audit_login LOGIN NOBYPASSRLS PASSWORD %L IN ROLE maintainer_audit_writer', :'maint_audit_pw')
WHERE NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'maintainer_audit_login')
\gexec

SELECT format('ALTER ROLE maintainer_audit_login WITH LOGIN NOBYPASSRLS PASSWORD %L', :'maint_audit_pw')
WHERE EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'maintainer_audit_login')
\gexec

-- Membership is re-asserted in case either login role predates its group.
GRANT maintainer_ro TO maintainer_ro_login;
GRANT maintainer_audit_writer TO maintainer_audit_login;

-- ── Schema-level privileges ──────────────────────────────────────────────────
-- Postgres 15+ no longer grants schema usage implicitly. Without USAGE,
-- unqualified table names fail to resolve and Postgres reports
-- 'relation "..." does not exist' rather than a permission error.
--
-- Table-level grants and default privileges are NOT set here — migration
-- 0003_rls_privileges_converge.sql owns them, so existing clusters converge too.
GRANT USAGE ON SCHEMA public TO app_user, auth_svc_role;

SELECT 'Eventclick_db database initialized' AS status;
