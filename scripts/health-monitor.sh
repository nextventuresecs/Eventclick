#!/usr/bin/env bash
# ─────────────────────────────────────────────────────────────────────────────
# health-monitor.sh — Simple health monitoring via cron
# ─────────────────────────────────────────────────────────────────────────────
# Setup cron (as deploy user):
#   crontab -e
#   # Every 5 minutes
#   */5 * * * * /home/deploy/app/scripts/health-monitor.sh >> /home/deploy/backups/health.log 2>&1
#
# Checks:
#   1. API health endpoint
#   2. Docker container status
#   3. Disk usage (alert if >85%)
#   4. Memory usage (alert if >90%)
# ─────────────────────────────────────────────────────────────────────────────

set -uo pipefail

# ── Config ──────────────────────────────────────────
HEALTH_URL="http://localhost:4000/api/v1/health"
READY_URL="http://localhost:4000/api/v1/ready"
COMPOSE_FILE="docker-compose.prod.yml"
DISK_THRESHOLD=85
MEMORY_THRESHOLD=90

# Load .env for alert config
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(dirname "$SCRIPT_DIR")"
if [[ -f "${PROJECT_ROOT}/.env" ]]; then
  set -a
  source "${PROJECT_ROOT}/.env"
  set +a
fi

ALERT_EMAIL="${RESEND_FROM_EMAIL:-admin@eventclick.com}"
TIMESTAMP=$(date +%Y-%m-%dT%H:%M:%S)

ALERTS=()

# ═══════════════════════════════════════════════════════════════════════════
# 1. API Health Check
# ═══════════════════════════════════════════════════════════════════════════
HTTP_CODE=$(curl -sf -o /dev/null -w "%{http_code}" "$HEALTH_URL" --max-time 10 2>/dev/null || echo "000")
if [[ "$HTTP_CODE" != "200" ]]; then
  ALERTS+=("🔴 API health check FAILED (HTTP ${HTTP_CODE})")
fi

# Deep readiness check
READY_CODE=$(curl -sf -o /dev/null -w "%{http_code}" "$READY_URL" --max-time 10 2>/dev/null || echo "000")
if [[ "$READY_CODE" != "200" ]]; then
  ALERTS+=("🟡 API readiness check FAILED (HTTP ${READY_CODE}) — database or Redis may be down")
fi

# ═══════════════════════════════════════════════════════════════════════════
# 2. Docker Container Status
# ═══════════════════════════════════════════════════════════════════════════
cd "$PROJECT_ROOT"
REQUIRED_CONTAINERS=("eventclick_server_prod" "eventclick_postgres_prod" "eventclick_redis_prod" "eventclick_client_prod" "eventclick_gotenberg_prod")

for CONTAINER in "${REQUIRED_CONTAINERS[@]}"; do
  STATUS=$(docker inspect -f '{{.State.Status}}' "$CONTAINER" 2>/dev/null || echo "not_found")
  if [[ "$STATUS" != "running" ]]; then
    ALERTS+=("🔴 Container ${CONTAINER} is ${STATUS}")
  fi

  # Check for restart loops (restarted more than 3 times in last hour)
  RESTART_COUNT=$(docker inspect -f '{{.RestartCount}}' "$CONTAINER" 2>/dev/null || echo "0")
  if [[ "$RESTART_COUNT" -gt 10 ]]; then
    ALERTS+=("🟡 Container ${CONTAINER} has restarted ${RESTART_COUNT} times (possible crash loop)")
  fi
done

# ═══════════════════════════════════════════════════════════════════════════
# 3. Disk Usage Check
# ═══════════════════════════════════════════════════════════════════════════
DISK_USAGE=$(df / | tail -1 | awk '{print $5}' | tr -d '%')
if [[ "$DISK_USAGE" -gt "$DISK_THRESHOLD" ]]; then
  ALERTS+=("🟡 Disk usage is ${DISK_USAGE}% (threshold: ${DISK_THRESHOLD}%)")
fi

# ═══════════════════════════════════════════════════════════════════════════
# 4. Memory Usage Check
# ═══════════════════════════════════════════════════════════════════════════
MEMORY_USAGE=$(free | awk '/Mem:/ {printf "%.0f", ($3/$2)*100}')
if [[ "$MEMORY_USAGE" -gt "$MEMORY_THRESHOLD" ]]; then
  ALERTS+=("🟡 Memory usage is ${MEMORY_USAGE}% (threshold: ${MEMORY_THRESHOLD}%)")
fi

# ═══════════════════════════════════════════════════════════════════════════
# 5. Report
# ═══════════════════════════════════════════════════════════════════════════
if [[ ${#ALERTS[@]} -eq 0 ]]; then
  # All good — only log (no alert)
  echo "${TIMESTAMP} ✅ All checks passed (API: ${HTTP_CODE}, Disk: ${DISK_USAGE}%, Mem: ${MEMORY_USAGE}%)"
  exit 0
fi

# ── Alert! ──────────────────────────────────────────
echo "${TIMESTAMP} ⚠️ ${#ALERTS[@]} alert(s) detected:"
for ALERT in "${ALERTS[@]}"; do
  echo "  ${ALERT}"
done

# Log container status for debugging
echo "  Container status:"
docker compose -f "$COMPOSE_FILE" ps --format "table {{.Name}}\t{{.Status}}" 2>/dev/null | sed 's/^/    /'

# Log resource usage
echo "  Resource usage:"
docker stats --no-stream --format "  {{.Name}}: CPU={{.CPUPerc}} MEM={{.MemUsage}}" 2>/dev/null

# ── Send alert via curl to your notification endpoint (optional) ─────
# Uncomment and configure one of these notification methods:

# Option 1: Resend email alert
# curl -s -X POST "https://api.resend.com/emails" \
#   -H "Authorization: Bearer ${RESEND_API_KEY}" \
#   -H "Content-Type: application/json" \
#   -d "{
#     \"from\": \"${RESEND_FROM_EMAIL}\",
#     \"to\": [\"your-alert-email@example.com\"],
#     \"subject\": \"⚠️ Eventclick Health Alert\",
#     \"text\": \"$(printf '%s\\n' "${ALERTS[@]}")\"
#   }"

# Option 2: Discord webhook
# DISCORD_WEBHOOK="https://discord.com/api/webhooks/YOUR_WEBHOOK_URL"
# ALERT_TEXT=$(printf '%s\\n' "${ALERTS[@]}")
# curl -s -X POST "$DISCORD_WEBHOOK" \
#   -H "Content-Type: application/json" \
#   -d "{\"content\": \"⚠️ **Eventclick Health Alert**\n${ALERT_TEXT}\"}"

exit 1
