#!/usr/bin/env bash
# ─────────────────────────────────────────────────────────────────────────────
# backup-db.sh — Daily PostgreSQL backup to Cloudflare R2
# ─────────────────────────────────────────────────────────────────────────────
# Setup cron (as deploy user):
#   crontab -e
#   # Daily at 2 AM UTC
#   0 2 * * * /home/deploy/app/scripts/backup-db.sh >> /home/deploy/backups/backup.log 2>&1
#
# Retention policy:
#   - Daily backups: kept for 7 days
#   - Weekly backups (Sunday): kept for 30 days
# ─────────────────────────────────────────────────────────────────────────────

set -euo pipefail

# ── Config (loaded from .env) ───────────────────────
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(dirname "$SCRIPT_DIR")"

# Load environment variables
if [[ -f "${PROJECT_ROOT}/.env" ]]; then
  set -a
  source "${PROJECT_ROOT}/.env"
  set +a
fi

BACKUP_DIR="/home/deploy/backups"
TIMESTAMP=$(date +%Y%m%d_%H%M%S)
DAY_OF_WEEK=$(date +%u)  # 1=Monday, 7=Sunday
BACKUP_FILE="eventclick_${TIMESTAMP}.sql.gz"
CONTAINER_NAME="eventclick_postgres_prod"

# R2 config (uses same S3 creds from .env)
R2_BUCKET="${S3_BUCKET:-eventclick-recordings}"
R2_BACKUP_PREFIX="backups/db"

# ── Colors ──────────────────────────────────────────
GREEN='\033[0;32m'
RED='\033[0;31m'
NC='\033[0m'

log() { echo -e "${GREEN}[BACKUP]${NC} $(date +%Y-%m-%dT%H:%M:%S) $1"; }
err() { echo -e "${RED}[ERROR]${NC} $(date +%Y-%m-%dT%H:%M:%S) $1" >&2; }

# ═══════════════════════════════════════════════════════════════════════════
# 1. Create backup
# ═══════════════════════════════════════════════════════════════════════════
log "Starting PostgreSQL backup..."
mkdir -p "$BACKUP_DIR"

# Dump from Docker container, compress with gzip
docker exec "$CONTAINER_NAME" \
  pg_dump -U "${DB_USER}" -d "${DB_NAME}" --format=plain --no-owner --no-acl \
  | gzip > "${BACKUP_DIR}/${BACKUP_FILE}"

BACKUP_SIZE=$(du -sh "${BACKUP_DIR}/${BACKUP_FILE}" | awk '{print $1}')
log "Backup created: ${BACKUP_FILE} (${BACKUP_SIZE})"

# ═══════════════════════════════════════════════════════════════════════════
# 2. Upload to R2 (optional — requires aws CLI configured)
# ═══════════════════════════════════════════════════════════════════════════
if command -v aws &>/dev/null && [[ -n "${S3_ENDPOINT:-}" ]]; then
  log "Uploading to R2..."

  # Determine prefix (daily vs weekly)
  if [[ "$DAY_OF_WEEK" == "7" ]]; then
    R2_PATH="${R2_BACKUP_PREFIX}/weekly/${BACKUP_FILE}"
  else
    R2_PATH="${R2_BACKUP_PREFIX}/daily/${BACKUP_FILE}"
  fi

  aws s3 cp \
    "${BACKUP_DIR}/${BACKUP_FILE}" \
    "s3://${R2_BUCKET}/${R2_PATH}" \
    --endpoint-url "${S3_ENDPOINT}" \
    --region "${S3_REGION:-auto}" \
    --no-progress

  log "Uploaded to R2: s3://${R2_BUCKET}/${R2_PATH} ✅"
else
  err "AWS CLI not installed or S3_ENDPOINT not set — backup upload FAILED"
  exit 1
fi

# ═══════════════════════════════════════════════════════════════════════════
# 3. Cleanup old local backups
# ═══════════════════════════════════════════════════════════════════════════
log "Cleaning up old local backups..."

# Keep last 7 daily backups locally
DELETED_COUNT=$(find "$BACKUP_DIR" -name "eventclick_*.sql.gz" -mtime +7 -delete -print | wc -l)
log "Deleted ${DELETED_COUNT} local backups older than 7 days"

# ═══════════════════════════════════════════════════════════════════════════
# 4. Cleanup old R2 backups (daily > 7 days, weekly > 30 days)
# ═══════════════════════════════════════════════════════════════════════════
if command -v aws &>/dev/null && [[ -n "${S3_ENDPOINT:-}" ]]; then
  log "Cleaning up old R2 daily backups (>7 days)..."
  CUTOFF_DAILY=$(date -d "7 days ago" +%Y%m%d 2>/dev/null || date -v-7d +%Y%m%d)

  # List and delete old daily backups
  aws s3 ls "s3://${R2_BUCKET}/${R2_BACKUP_PREFIX}/daily/" \
    --endpoint-url "${S3_ENDPOINT}" \
    --region "${S3_REGION:-auto}" 2>/dev/null | while read -r line; do
    FILE=$(echo "$line" | awk '{print $4}')
    if [[ -n "$FILE" ]]; then
      FILE_DATE=$(echo "$FILE" | grep -oP '\d{8}' | head -1)
      if [[ -n "$FILE_DATE" && "$FILE_DATE" < "$CUTOFF_DAILY" ]]; then
        aws s3 rm "s3://${R2_BUCKET}/${R2_BACKUP_PREFIX}/daily/${FILE}" \
          --endpoint-url "${S3_ENDPOINT}" \
          --region "${S3_REGION:-auto}" 2>/dev/null
        log "Deleted old R2 daily backup: ${FILE}"
      fi
    fi
  done

  log "Cleaning up old R2 weekly backups (>30 days)..."
  CUTOFF_WEEKLY=$(date -d "30 days ago" +%Y%m%d 2>/dev/null || date -v-30d +%Y%m%d)

  aws s3 ls "s3://${R2_BUCKET}/${R2_BACKUP_PREFIX}/weekly/" \
    --endpoint-url "${S3_ENDPOINT}" \
    --region "${S3_REGION:-auto}" 2>/dev/null | while read -r line; do
    FILE=$(echo "$line" | awk '{print $4}')
    if [[ -n "$FILE" ]]; then
      FILE_DATE=$(echo "$FILE" | grep -oP '\d{8}' | head -1)
      if [[ -n "$FILE_DATE" && "$FILE_DATE" < "$CUTOFF_WEEKLY" ]]; then
        aws s3 rm "s3://${R2_BUCKET}/${R2_BACKUP_PREFIX}/weekly/${FILE}" \
          --endpoint-url "${S3_ENDPOINT}" \
          --region "${S3_REGION:-auto}" 2>/dev/null
        log "Deleted old R2 weekly backup: ${FILE}"
      fi
    fi
  done
fi

# ═══════════════════════════════════════════════════════════════════════════
# Done
# ═══════════════════════════════════════════════════════════════════════════
log "Backup completed successfully ✅"
