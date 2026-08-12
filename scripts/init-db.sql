-- Extensions
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";
CREATE EXTENSION IF NOT EXISTS "postgis";

-- Create app_user group role
DO $$
BEGIN
  IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'app_user') THEN
    CREATE ROLE app_user NOLOGIN;
  END IF;
END
$$;

-- Create app_user_login (for dev)
DO $$
BEGIN
  IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'app_user_login') THEN
    CREATE ROLE app_user_login LOGIN PASSWORD 'local_dev_app' IN ROLE app_user;
  END IF;
END
$$;

-- Create auth_svc_role (for dev)
DO $$
BEGIN
  IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'auth_svc_role') THEN
    CREATE ROLE auth_svc_role LOGIN PASSWORD 'local_dev_auth' BYPASSRLS;
  ELSE
    ALTER ROLE auth_svc_role BYPASSRLS;
  END IF;
END
$$;

-- Default privileges for app_user (applies to tables created by migrations)
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO app_user;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT USAGE, SELECT ON SEQUENCES TO app_user;


-- Postgres 15+ no longer auto-grants schema usage — required for roles to
-- see/query any table in the schema, independent of table-level grants
GRANT USAGE ON SCHEMA public TO app_user, auth_svc_role;

-- Auth tables are locked from app_user via REVOKE statements in migration
-- 0001_clumsy_bloodstrike.sql (tables don't exist at this point — they're
-- created by migrations which run after this script)

-- Confirm DB is ready
SELECT 'Eventclick_db database initialized' AS status;
