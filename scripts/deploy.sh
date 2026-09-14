#!/usr/bin/env bash
# ─────────────────────────────────────────────────────────────────────────────
# deploy.sh — Zero-downtime deployment for Eventclick
# ─────────────────────────────────────────────────────────────────────────────
# Usage (from project root on EC2):
#   ./scripts/deploy.sh                  # Deploy latest from current branch
#   ./scripts/deploy.sh v1.2.3           # Deploy specific tag
#   SKIP_PULL=1 ./scripts/deploy.sh      # Deploy without git pull (local build)
#
# What this does:
#   1. Pull latest code (or checkout tag)
#   2. Start infrastructure (postgres, redis, gotenberg)
#   3. Pull Docker images from registry (or build locally)
#   4. Run database migrations
#   5. Rolling restart of services
#   6. Health check verification
#   7. Rollback on failure
# ─────────────────────────────────────────────────────────────────────────────

set -euo pipefail

# ── Config ──────────────────────────────────────────
COMPOSE_FILE="docker-compose.prod.yml"
# NOTE: port 4000 uses 'expose' not 'ports' — only accessible inside Docker network.
# Health check uses 'docker inspect', NOT curl localhost:4000

HEALTH_RETRIES=20
HEALTH_INTERVAL=5
DEPLOY_LOG="/tmp/deploy-$(date +%Y%m%d-%H%M%S).log"
GHCR_NAMESPACE="nextventuresecs/eventclick"
export GHCR_NAMESPACE

# ── Colors ──────────────────────────────────────────
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

log()  { echo -e "${GREEN}[DEPLOY]${NC} $(date +%H:%M:%S) $1" | tee -a "$DEPLOY_LOG"; }
warn() { echo -e "${YELLOW}[WARN]${NC}   $(date +%H:%M:%S) $1" | tee -a "$DEPLOY_LOG"; }
err()  { echo -e "${RED}[ERROR]${NC}  $(date +%H:%M:%S) $1" | tee -a "$DEPLOY_LOG" >&2; }
info() { echo -e "${BLUE}[INFO]${NC}   $(date +%H:%M:%S) $1" | tee -a "$DEPLOY_LOG"; }

# Docker compose wrapper that always reads secrets from the runtime-only path.
dc() {
  docker compose --env-file "$SECRETS_FILE" -f "$COMPOSE_FILE" "$@"
}

MIGRATION_SNAPSHOT=""

rollback() {
  warn "Rolling back to previous version..."
  if [[ "$PREV_SERVER_IMAGE" != "none" ]]; then
    log "Rolling back server..."
    dc stop server
    docker tag "$PREV_SERVER_IMAGE" "ghcr.io/${GHCR_NAMESPACE}/server:${IMAGE_TAG}"
    dc up -d --no-deps server
    # pdf-worker runs the server image; keep the two on the same version.
    dc up -d --no-deps pdf-worker
    log "Server rollback complete."
  fi
  if [[ "$PREV_CLIENT_IMAGE" != "none" ]]; then
    log "Rolling back client..."
    dc stop client
    docker tag "$PREV_CLIENT_IMAGE" "ghcr.io/${GHCR_NAMESPACE}/client:${IMAGE_TAG}"
    dc up -d --no-deps client
    log "Client rollback complete."
  fi
  warn "Rollback finished. Check deploy log: ${DEPLOY_LOG}"
}

rollback_db() {
  if [[ -n "$MIGRATION_SNAPSHOT" && -f "$MIGRATION_SNAPSHOT" ]]; then
    log "Restoring pre-migration DB snapshot..."
    docker exec "${DB_CONTAINER:-eventclick_postgres_prod}" pg_restore \
      -U "${DB_USER}" -d "${DB_NAME}" \
      --clean --no-owner --no-acl \
      -v < "$MIGRATION_SNAPSHOT" 2>&1 | tee -a "$DEPLOY_LOG" || warn "DB restore failed — manual intervention may be needed"
  fi
}

# ── Navigate to project root ───────────────────────
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(dirname "$SCRIPT_DIR")"
cd "$PROJECT_ROOT"

log "Starting deployment from ${PROJECT_ROOT}"
log "Compose file: ${COMPOSE_FILE}"
log "Deploy log: ${DEPLOY_LOG}"

# ═══════════════════════════════════════════════════════════════════════════
# 0. Fetch secrets from AWS SSM Parameter Store
# ═══════════════════════════════════════════════════════════════════════════
# SSM is the single source of truth for production environment variables.
# fetch-secrets.sh pulls all params under /eventclick/prod/* and writes
# /etc/eventclick/.env (runtime-only, never committed to git).
# If fetch-secrets.sh is missing or fails, we fall back to the existing file.

export IMAGE_TAG="${IMAGE_TAG:-latest}"

SECRETS_FILE="/etc/eventclick/.env"

if [[ -x "${SCRIPT_DIR}/fetch-secrets.sh" ]]; then
  log "Fetching environment from SSM Parameter Store..."
  if "${SCRIPT_DIR}/fetch-secrets.sh" "$SECRETS_FILE"; then
    log "SSM secrets fetched → /etc/eventclick/.env generated ✅"
  else
    warn "fetch-secrets.sh failed (exit $?) — falling back to existing file"
    if [[ ! -f "$SECRETS_FILE" ]]; then
      err "No existing /etc/eventclick/.env to fall back to. Cannot continue."
      exit 1
    fi
  fi
else
  warn "fetch-secrets.sh not found or not executable — using existing /etc/eventclick/.env"
fi

# ═══════════════════════════════════════════════════════════════════════════
# Pre-flight checks
# ═══════════════════════════════════════════════════════════════════════════
log "Running pre-flight checks..."

# Check secrets file exists
if [[ ! -f "$SECRETS_FILE" ]]; then
  err "Secrets file not found at ${SECRETS_FILE}!"
  err "Either populate SSM Parameter Store or manually create the file."
  err "SSM: Ensure params exist under /eventclick/prod/* and EC2 IAM role has SSM read access."
  exit 1
fi

# Check Docker is running
if ! docker info &>/dev/null; then
  err "Docker daemon is not running!"
  exit 1
fi

# Check compose file exists
if [[ ! -f "$COMPOSE_FILE" ]]; then
  err "Compose file '${COMPOSE_FILE}' not found!"
  exit 1
fi

# Export secrets into shell environment for docker compose interpolation
if [[ -f "$SECRETS_FILE" ]]; then
  set -a
  source "$SECRETS_FILE" 2>/dev/null || true
  set +a
fi

# Ensure dynamic runtime variables are present in SECRETS_FILE for docker compose --env-file
grep -q "^IMAGE_TAG=" "$SECRETS_FILE" 2>/dev/null || echo "IMAGE_TAG=\"${IMAGE_TAG}\"" >> "$SECRETS_FILE"
grep -q "^GHCR_NAMESPACE=" "$SECRETS_FILE" 2>/dev/null || echo "GHCR_NAMESPACE=\"${GHCR_NAMESPACE}\"" >> "$SECRETS_FILE"

export IMAGE_TAG
export GHCR_NAMESPACE

log "Pre-flight checks passed ✅"

# ═══════════════════════════════════════════════════════════════════════════
# 1. Pull latest code
# ═══════════════════════════════════════════════════════════════════════════
TAG="${1:-}"
if [[ "${SKIP_PULL:-0}" != "1" ]]; then
  if [[ -n "$TAG" ]]; then
    log "Checking out tag: ${TAG}"
    git fetch --all --tags
    git checkout "tags/${TAG}" -B "deploy-${TAG}"
  else
    log "Pulling latest code..."
    git pull --ff-only origin "$(git branch --show-current)"
  fi
  log "Code updated ✅"
else
  warn "SKIP_PULL=1 — skipping git pull"
fi

# Save current image IDs for rollback
# NOTE: docker container names are case-sensitive — must match actual running
# names exactly (lowercase, per docker-compose.prod.yml). Output is sanitized
# with `tr -d` to strip any stray whitespace/newlines that could otherwise
# corrupt the later `!= "none"` string comparison in rollback().
PREV_SERVER_IMAGE=$(docker inspect --format='{{.Image}}' eventclick_server_prod 2>/dev/null | tr -d '[:space:]' || true)
PREV_SERVER_IMAGE="${PREV_SERVER_IMAGE:-none}"
if [[ -z "$PREV_SERVER_IMAGE" ]]; then PREV_SERVER_IMAGE="none"; fi

PREV_CLIENT_IMAGE=$(docker inspect --format='{{.Image}}' eventclick_client_prod 2>/dev/null | tr -d '[:space:]' || true)
PREV_CLIENT_IMAGE="${PREV_CLIENT_IMAGE:-none}"
if [[ -z "$PREV_CLIENT_IMAGE" ]]; then PREV_CLIENT_IMAGE="none"; fi

info "Previous server image: ${PREV_SERVER_IMAGE:0:12}"
info "Previous client image: ${PREV_CLIENT_IMAGE:0:12}"

# ═══════════════════════════════════════════════════════════════════════════
# 1. Start Infrastructure
# ═══════════════════════════════════════════════════════════════════════════
log "Starting infrastructure services..."
dc up -d postgres redis gotenberg
sleep 5

# ═══════════════════════════════════════════════════════════════════════════
# 2. Pull/Build Docker Images
# ═══════════════════════════════════════════════════════════════════════════
if [[ "${SKIP_BUILD:-1}" != "0" ]]; then
  log "Pulling Docker images..."
  dc pull
  log "Docker images pulled ✅"
else
  log "Building Docker images..."
  dc build --no-cache server client
  log "Docker images built ✅"
fi

# ═══════════════════════════════════════════════════════════════════════════
# 3. Run database migrations
# ═══════════════════════════════════════════════════════════════════════════

# Load secrets for DB snapshot (needed before migrations)
set -a
source "$SECRETS_FILE"
set +a

log "Creating pre-migration DB snapshot..."
DB_CONTAINER=$(dc ps --format '{{.Name}}' postgres | head -1)
SNAPSHOT_TS=$(date +%Y%m%d-%H%M%S)
MIGRATION_SNAPSHOT="/tmp/db-pre-migrate-${SNAPSHOT_TS}.dump"
if docker exec -e PGPASSWORD="${DB_PASSWORD}" "$DB_CONTAINER" pg_dump -U "${DB_USER}" -d "${DB_NAME}" --format=custom \
  > "$MIGRATION_SNAPSHOT"; then
  log "Pre-migration snapshot saved: ${MIGRATION_SNAPSHOT}"
else
  warn "Pre-migration snapshot failed — continuing without DB rollback safety"
  MIGRATION_SNAPSHOT=""
fi

log "Running database migrations..."

# --- AUTO-HEAL LEGACY SCHEMA (DESTRUCTIVE — requires explicit opt-in) ---
# If the database contains the old pre-multi-tenant schema (form_definitions
# exists but is missing organization_id), this WOULD wipe the public schema
# so Drizzle can initialize cleanly.
#
# DISABLED BY DEFAULT. A partially-applied migration (e.g. a prior deploy that
# failed mid-way through 0000_slow_firestar.sql) looks IDENTICAL to this
# heuristic and would trigger a full DROP SCHEMA CASCADE — permanent,
# unrecoverable data loss across every organization — with zero confirmation.
#
# To run this intentionally for a genuine legacy-schema migration, a human
# must set ALLOW_SCHEMA_WIPE=1 explicitly for that single invocation:
#   ALLOW_SCHEMA_WIPE=1 ./scripts/deploy.sh
# Never set this in CI/automated pipelines.
if [[ "${ALLOW_SCHEMA_WIPE:-0}" == "1" ]]; then
  if docker exec -e PGPASSWORD="${DB_PASSWORD}" "$DB_CONTAINER" psql -U "${DB_USER}" -d "${DB_NAME}" -tAc "SELECT 1 FROM information_schema.tables WHERE table_schema='public' AND table_name='form_definitions'" | grep -q 1; then
    if ! docker exec -e PGPASSWORD="${DB_PASSWORD}" "$DB_CONTAINER" psql -U "${DB_USER}" -d "${DB_NAME}" -tAc "SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='form_definitions' AND column_name='organization_id'" | grep -q 1; then
      warn "ALLOW_SCHEMA_WIPE=1 set AND legacy schema detected (form_definitions missing organization_id)."
      warn "Wiping public schema in 10s — Ctrl+C now to abort..."
      sleep 10
      docker exec -e PGPASSWORD="${DB_PASSWORD}" "$DB_CONTAINER" psql -U "${DB_USER}" -d "${DB_NAME}" -c "DROP SCHEMA IF EXISTS public CASCADE; CREATE SCHEMA public; CREATE EXTENSION IF NOT EXISTS \"uuid-ossp\" SCHEMA public; CREATE EXTENSION IF NOT EXISTS \"pgcrypto\" SCHEMA public; CREATE EXTENSION IF NOT EXISTS \"postgis\" SCHEMA public;"
      log "Legacy schema wiped successfully."
    fi
  fi
else
  # Still surface the same diagnostic info, just without acting on it, so
  # an ambiguous partial-migration state is visible in the logs instead of
  # silently nuking the DB.
  if docker exec -e PGPASSWORD="${DB_PASSWORD}" "$DB_CONTAINER" psql -U "${DB_USER}" -d "${DB_NAME}" -tAc "SELECT 1 FROM information_schema.tables WHERE table_schema='public' AND table_name='form_definitions'" | grep -q 1; then
    if ! docker exec -e PGPASSWORD="${DB_PASSWORD}" "$DB_CONTAINER" psql -U "${DB_USER}" -d "${DB_NAME}" -tAc "SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='form_definitions' AND column_name='organization_id'" | grep -q 1; then
      warn "form_definitions exists without organization_id (legacy schema OR a partially-applied migration)."
      warn "Auto-wipe is disabled by default. If this is a genuine legacy DB, re-run with ALLOW_SCHEMA_WIPE=1."
      warn "If this is a partially-applied migration instead, fix the migration to be idempotent rather than wiping data."
    fi
  fi
fi
# -------------------------------

# -------------------------------

log "Ensuring database roles exist..."
docker exec -i -e PGPASSWORD="${DB_PASSWORD}" "$DB_CONTAINER" psql -U "${DB_USER}" -d "${DB_NAME}" -v ON_ERROR_STOP=1 <<-EOSQL
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
  ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO auth_svc_role;
  ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT USAGE, SELECT ON SEQUENCES TO auth_svc_role;
EOSQL
log "Database roles verified."

# Ops Console roles (#146). Migration 0013 owns the NOLOGIN group roles and
# every privilege on them; they are created here only so the login roles can
# join them before `migrate` runs on a database that has never seen 0013.
# No default privileges for these roles, deliberately: they get exactly the
# column grants 0013 lists and nothing a future table would add.
#
# Passwords are converged on every deploy, so rotating one is: update SSM,
# redeploy. Until both SSM parameters exist the login roles are skipped with a
# warning rather than failing the deploy — nothing connects as them before the
# ops-server (#147) ships.
[[ "$-" == *x* ]] && XTRACE_ON=1 || XTRACE_ON=0
set +x
MAINTAINER_RO_DB_PASSWORD="${MAINTAINER_RO_DB_PASSWORD:-}"
MAINTAINER_AUDIT_DB_PASSWORD="${MAINTAINER_AUDIT_DB_PASSWORD:-}"
if [[ -z "$MAINTAINER_RO_DB_PASSWORD" || -z "$MAINTAINER_AUDIT_DB_PASSWORD" ]]; then
  warn "MAINTAINER_RO_DB_PASSWORD / MAINTAINER_AUDIT_DB_PASSWORD not in SSM — skipping Ops Console login roles."
fi
docker exec -i -e PGPASSWORD="${DB_PASSWORD}" "$DB_CONTAINER" psql -U "${DB_USER}" -d "${DB_NAME}" \
  -v ON_ERROR_STOP=1 \
  -v maint_ro_pw="${MAINTAINER_RO_DB_PASSWORD}" \
  -v maint_audit_pw="${MAINTAINER_AUDIT_DB_PASSWORD}" \
  <<'SQL'
SELECT 'CREATE ROLE maintainer_ro NOLOGIN BYPASSRLS'
WHERE NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'maintainer_ro')
\gexec
SELECT 'CREATE ROLE maintainer_audit_writer NOLOGIN NOBYPASSRLS'
WHERE NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'maintainer_audit_writer')
\gexec

SELECT format('CREATE ROLE maintainer_ro_login LOGIN BYPASSRLS PASSWORD %L IN ROLE maintainer_ro', :'maint_ro_pw')
WHERE :'maint_ro_pw' <> '' AND NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'maintainer_ro_login')
\gexec
SELECT format('ALTER ROLE maintainer_ro_login WITH LOGIN BYPASSRLS PASSWORD %L', :'maint_ro_pw')
WHERE :'maint_ro_pw' <> '' AND EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'maintainer_ro_login')
\gexec

SELECT format('CREATE ROLE maintainer_audit_login LOGIN NOBYPASSRLS PASSWORD %L IN ROLE maintainer_audit_writer', :'maint_audit_pw')
WHERE :'maint_audit_pw' <> '' AND NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'maintainer_audit_login')
\gexec
SELECT format('ALTER ROLE maintainer_audit_login WITH LOGIN NOBYPASSRLS PASSWORD %L', :'maint_audit_pw')
WHERE :'maint_audit_pw' <> '' AND EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'maintainer_audit_login')
\gexec
SQL
[[ $XTRACE_ON -eq 1 ]] && set -x
log "Ops Console roles verified."

if ! dc up migrate --abort-on-container-exit; then
  err "Database migration failed!"
  err "Aborting deployment. Fix migrations before retrying."
  rollback_db
  rollback
  exit 1
fi
log "Migrations complete ✅"

# ═══════════════════════════════════════════════════════════════════════════
# 3.5 Rotate hardcoded DB role passwords using values from SSM
# ═══════════════════════════════════════════════════════════════════════════
log "Rotating database role passwords..."

# Temporarily disable set -x if it was enabled, to prevent logging passwords
[[ "$-" == *x* ]] && XTRACE_ON=1 || XTRACE_ON=0
set +x

  # Execute ALTER ROLE inside postgres container using DB credentials from SSM
  docker exec -i "$DB_CONTAINER" psql -U "${DB_USER}" -d "${DB_NAME}" \
  -v ON_ERROR_STOP=1 \
  -v app_pw="${APP_DB_PASSWORD}" \
  -v auth_pw="${AUTH_DB_PASSWORD}" \
  <<'SQL'
ALTER ROLE app_user_login PASSWORD :'app_pw';
ALTER ROLE auth_svc_role PASSWORD :'auth_pw';
SQL

[[ $XTRACE_ON -eq 1 ]] && set -x

log "Passwords rotated ✅"

# ═══════════════════════════════════════════════════════════════════════════
# 4. Rolling restart
# ═══════════════════════════════════════════════════════════════════════════
log "Starting rolling restart..."

# Restart the server
log "Restarting server..."
dc up -d --no-deps server
sleep "$HEALTH_INTERVAL"

# ═══════════════════════════════════════════════════════════════════════════
# 5. Health check
# ═══════════════════════════════════════════════════════════════════════════
log "Waiting for server health check..."
HEALTHY=false
for i in $(seq 1 $HEALTH_RETRIES); do
  STATUS=$(docker inspect --format='{{.State.Health.Status}}' eventclick_server_prod 2>/dev/null || echo "failed")
  if [[ "$STATUS" == "healthy" ]]; then
    HEALTHY=true
    break
  fi
  info "Health check attempt ${i}/${HEALTH_RETRIES} (status: ${STATUS})... waiting ${HEALTH_INTERVAL}s"
  sleep "$HEALTH_INTERVAL"
done

if [[ "$HEALTHY" != "true" ]]; then
  err "Health check failed after ${HEALTH_RETRIES} attempts!"
  err "Server logs:"
  dc logs --tail=50 server | tee -a "$DEPLOY_LOG"
  rollback
  exit 1
fi

log "Server health check passed ✅"

# ═══════════════════════════════════════════════════════════════════════════
# Smoke test — verify the deep health endpoint responds correctly from outside
# the container (confirms secrets are loaded and all dependencies are reachable)
# ═══════════════════════════════════════════════════════════════════════════
log "Running deep health smoke test..."
SMOKE_OK=false
for i in $(seq 1 5); do
  SMOKE_RESP=$(docker exec eventclick_server_prod wget -qO- http://localhost:4000/api/v1/health/deep | grep -o '"status":"ok"' | wc -l )
  if [[ "$SMOKE_RESP" -eq 1 ]]; then
    SMOKE_OK=true
    break
  fi
  info "Smoke test attempt ${i}/5 — no response, waiting 3s..."
  sleep 3
done

if [[ "$SMOKE_OK" != "true" ]]; then
  err "Deep health smoke test failed — server is not responding correctly"
  docker exec eventclick_server_prod wget -qO- http://localhost:4000/api/v1/health/deep 2>&1 | tee -a "$DEPLOY_LOG" || true
  rollback
  exit 1
fi

log "Deep health smoke test passed ✅"

# Restart the client
log "Restarting client..."
dc up -d --no-deps client
sleep 3

# ═══════════════════════════════════════════════════════════════════════════
# 5.4 PDF worker
# ═══════════════════════════════════════════════════════════════════════════
# Runs the server image (worker-entry.js), so it must be recreated on every
# deploy or it keeps running whatever image it was first started with. Until
# this step existed it was never restarted, and the DLQ drain added to it in
# #161 never reached prod. It has no HTTP port and so no healthcheck: a worker
# that is still running with no restarts after a short wait counts as started.
# Not fatal, like the Ops Console below: the tenant server and client are live
# and healthy, and PDF jobs wait in SQS until the worker is fixed.
log "Restarting pdf-worker..."
dc up -d --no-deps pdf-worker
sleep 15
WORKER_STATE=$(docker inspect --format='{{.State.Status}} {{.RestartCount}}' eventclick_pdf_worker_prod 2>/dev/null || echo "missing -")
if [[ "$WORKER_STATE" == "running 0" ]]; then
  log "pdf-worker running ✅"
else
  warn "pdf-worker not running cleanly (status, restarts: ${WORKER_STATE}). PDF jobs and the DLQ drain are stalled until it is fixed."
  dc logs --tail 40 pdf-worker 2>&1 | tee -a "$DEPLOY_LOG" || true
fi

# ═══════════════════════════════════════════════════════════════════════════
# 5.5 Ops Console (#147)
# ═══════════════════════════════════════════════════════════════════════════
# Started only when every ops secret is present, and never fatal: the tenant
# server and client are already live and healthy at this point, and a broken
# maintainer console must not roll them back. Without the secrets ops-server
# would exit at startup (missing CF_ACCESS_*) and cloudflared would loop on an
# empty token, so they are skipped with a warning instead.
OPS_MISSING=()
for key in MAINTAINER_RO_DB_PASSWORD MAINTAINER_AUDIT_DB_PASSWORD CF_ACCESS_TEAM_DOMAIN CF_ACCESS_AUD CLOUDFLARE_TUNNEL_TOKEN; do
  [[ -n "${!key:-}" ]] || OPS_MISSING+=("$key")
done

if [[ ${#OPS_MISSING[@]} -gt 0 ]]; then
  warn "Ops Console not started — missing in SSM: ${OPS_MISSING[*]} (see docs/runbooks/ops-console.md)."
else
  log "Restarting ops-server..."
  dc --profile ops up -d --no-deps ops-server

  OPS_STATUS="starting"
  for i in $(seq 1 20); do
    OPS_STATUS=$(docker inspect --format='{{.State.Health.Status}}' eventclick_ops_server_prod 2>/dev/null || echo "missing")
    [[ "$OPS_STATUS" == "healthy" ]] && break
    sleep 3
  done

  if [[ "$OPS_STATUS" == "healthy" ]]; then
    log "ops-server healthy ✅ — starting cloudflared..."
    dc --profile ops up -d --no-deps cloudflared
    log "Ops Console started ✅"
  else
    warn "ops-server not healthy (status: ${OPS_STATUS}); leaving cloudflared untouched. Tenant deploy is unaffected."
    dc --profile ops logs --tail 40 ops-server 2>&1 | tee -a "$DEPLOY_LOG" || true
  fi
fi

# ═══════════════════════════════════════════════════════════════════════════
# 6. Final verification
# ═══════════════════════════════════════════════════════════════════════════
log "Final verification..."
echo ""
echo "═══════════════════════════════════════════════════════════════════"
echo -e "${GREEN} Deployment Successful! ✅${NC}"
echo "═══════════════════════════════════════════════════════════════════"
echo ""
dc ps
echo ""

# Show resource usage
info "Container resource usage:"
docker stats --no-stream --format "table {{.Name}}\t{{.CPUPerc}}\t{{.MemUsage}}\t{{.MemPerc}}" \
  $(dc ps -q) 2>/dev/null || true

echo ""
log "Deploy log saved to: ${DEPLOY_LOG}"