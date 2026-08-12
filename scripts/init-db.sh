#!/usr/bin/env bash
# ═══════════════════════════════════════════════════════════════════════════
# init-db-remote.sh
#
# Fetches DB init credentials from AWS SSM Parameter Store and runs the
# Eventclick database bootstrap SQL (extensions, roles, default privileges)
# against the target Postgres instance.
#
# Usage:
#   ./init-db-remote.sh
#
# Required environment (set directly, or leave unset to pull matching
# SSM_PATH parameters automatically):
#   AWS_REGION        (default: ap-south-1 — override to match your infra)
#   SSM_PATH           SSM parameter path prefix (default: /eventclick/prod)
#   PGHOST             Postgres host (falls back to SSM /db/host)
#   PGPORT             Postgres port (default: 5432)
# ═══════════════════════════════════════════════════════════════════════════

set -euo pipefail

# ── Logging helpers ──────────────────────────────────────────────────────
RED='\033[0;31m'; GREEN='\033[0;32m'; YELLOW='\033[1;33m'; BLUE='\033[0;34m'; NC='\033[0m'
log()  { echo -e "${BLUE}[INIT-DB]${NC} $(date +%H:%M:%S) $1"; }
warn() { echo -e "${YELLOW}[WARN]${NC}    $(date +%H:%M:%S) $1"; }
err()  { echo -e "${RED}[ERROR]${NC}   $(date +%H:%M:%S) $1" >&2; }
ok()   { echo -e "${GREEN}[OK]${NC}      $(date +%H:%M:%S) $1"; }

# ── Use injected environment variables ──────────────────────────────────────
log "Using DB init credentials from container environment"

POSTGRES_USER="${POSTGRES_USER:-}"
POSTGRES_PASSWORD="${POSTGRES_PASSWORD:-}"
APP_DB_PASSWORD="${APP_DB_PASSWORD:-}"
AUTH_DB_PASSWORD="${AUTH_DB_PASSWORD:-}"
POSTGRES_DB="${POSTGRES_DB:-}"
PGHOST="${PGHOST:-localhost}"
PGPORT="${PGPORT:-5432}"

if [[ -z "$POSTGRES_USER" || -z "$POSTGRES_PASSWORD" || -z "$APP_DB_PASSWORD" || -z "$AUTH_DB_PASSWORD" || -z "$POSTGRES_DB" ]]; then
  err "Missing required database credentials in environment."
  exit 1
fi

ok "Credentials fetched (5 secrets, host resolved)"

# ── Sanity check required values are non-empty before touching the DB ──────
for var_name in POSTGRES_USER POSTGRES_PASSWORD POSTGRES_DB APP_DB_PASSWORD AUTH_DB_PASSWORD; do
  if [[ -z "${!var_name}" ]]; then
    err "Missing required value: ${var_name}"
    exit 1
  fi
done

export PGHOST PGPORT PGUSER="$POSTGRES_USER" PGPASSWORD="$POSTGRES_PASSWORD"

log "Connecting to ${PGHOST}:${PGPORT}/${POSTGRES_DB} as ${POSTGRES_USER}"

# ── Run init SQL ─────────────────────────────────────────────────────────
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

  GRANT USAGE ON SCHEMA public TO app_user, auth_svc_role;

  REVOKE CONNECT ON DATABASE ${POSTGRES_DB} FROM PUBLIC;
  GRANT CONNECT ON DATABASE ${POSTGRES_DB} TO app_user_login, auth_svc_role;

  SELECT 'Eventclick_db database initialized' AS status;
EOSQL

# ── Clear sensitive vars from this shell's environment ──────────────────
unset PGPASSWORD APP_DB_PASSWORD AUTH_DB_PASSWORD POSTGRES_PASSWORD

ok "Database initialization complete"