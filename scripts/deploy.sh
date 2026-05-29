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
#   2. Build Docker images
#   3. Run database migrations (via init container)
#   4. Rolling restart of services
#   5. Health check verification
#   6. Rollback on failure
# ─────────────────────────────────────────────────────────────────────────────

set -euo pipefail

# ── Config ──────────────────────────────────────────
COMPOSE_FILE="docker-compose.prod.yml"
# NOTE: port 4000 uses 'expose' not 'ports' — only accessible inside Docker network.
# Health check uses 'docker inspect', NOT curl localhost:4000

HEALTH_RETRIES=20
HEALTH_INTERVAL=3
DEPLOY_LOG="/tmp/deploy-$(date +%Y%m%d-%H%M%S).log"

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

# ── Navigate to project root ───────────────────────
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(dirname "$SCRIPT_DIR")"
cd "$PROJECT_ROOT"

log "Starting deployment from ${PROJECT_ROOT}"
log "Compose file: ${COMPOSE_FILE}"
log "Deploy log: ${DEPLOY_LOG}"

# ═══════════════════════════════════════════════════════════════════════════
# Pre-flight checks
# ═══════════════════════════════════════════════════════════════════════════
log "Running pre-flight checks..."

# Check .env exists
if [[ ! -f .env ]]; then
  err ".env file not found! Copy .env.production.example → .env and fill in values."
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
PREV_SERVER_IMAGE=$(docker inspect --format='{{.Image}}' eventclick_server_prod 2>/dev/null || echo "none")
PREV_CLIENT_IMAGE=$(docker inspect --format='{{.Image}}' eventclick_client_prod 2>/dev/null || echo "none")
info "Previous server image: ${PREV_SERVER_IMAGE:0:12}"
info "Previous client image: ${PREV_CLIENT_IMAGE:0:12}"

# ═══════════════════════════════════════════════════════════════════════════
# 2. Build Docker images (skipped when images pre-pulled from ghcr.io)
# ═══════════════════════════════════════════════════════════════════════════
if [[ "${SKIP_BUILD:-0}" != "1" ]]; then
  log "Building Docker images..."
  docker compose -f "$COMPOSE_FILE" build --no-cache server client
  log "Docker images built ✅"
else
  warn "SKIP_BUILD=1 — using pre-pulled images (ghcr.io)"
fi

# ═══════════════════════════════════════════════════════════════════════════
# 3. Run database migrations
# ═══════════════════════════════════════════════════════════════════════════
log "Running database migrations..."
docker compose -f "$COMPOSE_FILE" up migrate --build --abort-on-container-exit
MIGRATE_EXIT=$?
if [[ $MIGRATE_EXIT -ne 0 ]]; then
  err "Database migration failed with exit code ${MIGRATE_EXIT}!"
  err "Aborting deployment. Fix migrations before retrying."
  exit 1
fi
log "Migrations complete ✅"

# ═══════════════════════════════════════════════════════════════════════════
# 4. Rolling restart
# ═══════════════════════════════════════════════════════════════════════════
log "Starting rolling restart..."

# Start infrastructure first (postgres, redis, gotenberg should already be running)
docker compose -f "$COMPOSE_FILE" up -d postgres redis gotenberg
sleep 5

# Restart the server
log "Restarting server..."
docker compose -f "$COMPOSE_FILE" up -d --no-deps server
sleep 3

# ═══════════════════════════════════════════════════════════════════════════
# 5. Health check
# ═══════════════════════════════════════════════════════════════════════════
log "Waiting for server health check..."
HEALTHY=false
for i in $(seq 1 $HEALTH_RETRIES); do
  STATUS=$(docker inspect --format='{{.State.Health.Status}}' Eventclick_server_prod 2>/dev/null || echo "failed")
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
  docker compose -f "$COMPOSE_FILE" logs --tail=50 server | tee -a "$DEPLOY_LOG"

  # ═══════════════════════════════════════════════════════════════════════
  # Rollback
  # ═══════════════════════════════════════════════════════════════════════
  warn "Rolling back to previous version..."
  if [[ "$PREV_SERVER_IMAGE" != "none" ]]; then
    docker compose -f "$COMPOSE_FILE" stop server
    # git reset --hard moves HEAD back cleanly (no dirty working tree)
    # git checkout HEAD~1 -- was leaving repo in dirty state, breaking next deploy
    git reset --hard HEAD~1
    docker compose -f "$COMPOSE_FILE" up -d --no-deps --build server
    warn "Rollback complete. Previous version restored."
    warn "Check the deploy log: ${DEPLOY_LOG}"
  else
    err "No previous image to rollback to!"
  fi
  exit 1
fi

log "Server health check passed ✅"

# Restart the client
log "Restarting client..."
docker compose -f "$COMPOSE_FILE" up -d --no-deps client
sleep 3

# ═══════════════════════════════════════════════════════════════════════════
# 6. Final verification
# ═══════════════════════════════════════════════════════════════════════════
log "Final verification..."
echo ""
echo "═══════════════════════════════════════════════════════════════════"
echo -e "${GREEN} Deployment Successful! ✅${NC}"
echo "═══════════════════════════════════════════════════════════════════"
echo ""
docker compose -f "$COMPOSE_FILE" ps
echo ""

# Show resource usage
info "Container resource usage:"
docker stats --no-stream --format "table {{.Name}}\t{{.CPUPerc}}\t{{.MemUsage}}\t{{.MemPerc}}" \
  $(docker compose -f "$COMPOSE_FILE" ps -q) 2>/dev/null || true

echo ""
log "Deploy log saved to: ${DEPLOY_LOG}"
