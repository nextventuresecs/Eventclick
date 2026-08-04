#!/usr/bin/env bash
set -euo pipefail

psql -v ON_ERROR_STOP=1 --username "$POSTGRES_USER" --dbname "$POSTGRES_DB" <<-EOSQL
  CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
  CREATE EXTENSION IF NOT EXISTS "pgcrypto";
  CREATE EXTENSION IF NOT EXISTS "postgis";

  DO \$\$
  BEGIN
    IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'app_user') THEN
      CREATE ROLE app_user NOLOGIN;
    END IF;
  END
  \$\$;

  DO \$\$
  BEGIN
    IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'app_user_login') THEN
      CREATE ROLE app_user_login LOGIN PASSWORD '${APP_DB_PASSWORD}' IN ROLE app_user;
    ELSE
      ALTER ROLE app_user_login PASSWORD '${APP_DB_PASSWORD}';
    END IF;
  END
  \$\$;

  DO \$\$
  BEGIN
    IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'auth_svc_role') THEN
      CREATE ROLE auth_svc_role LOGIN PASSWORD '${AUTH_DB_PASSWORD}' BYPASSRLS;
    ELSE
      ALTER ROLE auth_svc_role PASSWORD '${AUTH_DB_PASSWORD}' BYPASSRLS;
    END IF;
  END
  \$\$;

  ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO app_user;
  ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT USAGE, SELECT ON SEQUENCES TO app_user;

  REVOKE CONNECT ON DATABASE ${POSTGRES_DB} FROM PUBLIC;
  GRANT CONNECT ON DATABASE ${POSTGRES_DB} TO app_user_login, auth_svc_role;

  SELECT 'Eventclick_db database initialized' AS status;
EOSQL