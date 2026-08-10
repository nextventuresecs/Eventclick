#!/usr/bin/env bash
# ─────────────────────────────────────────────────────────────────────────────
# fetch-secrets.sh — Pull production secrets from AWS SSM Parameter Store
# ─────────────────────────────────────────────────────────────────────────────
#
# This script is the SINGLE SOURCE OF TRUTH bridge between SSM and Docker.
# It fetches all parameters under /eventclick/prod/* and writes them to
# /etc/eventclick/.env (runtime-only, not committed to git)
#
# Prerequisites:
#   - AWS CLI v2 installed
#   - EC2 instance must have IAM role with these permissions:
#       ssm:GetParametersByPath
#       ssm:GetParameter
#   - Parameters stored in SSM under /eventclick/prod/*
#
# Usage (called automatically by deploy.sh, or manually):
#   ./scripts/fetch-secrets.sh                  # writes to /etc/eventclick/.env
#   ./scripts/fetch-secrets.sh /tmp/.env        # writes to custom path
#
# How to populate SSM (from your local machine with AWS credentials):
#   aws ssm put-parameter --name "/eventclick/prod/JWT_SECRET" \
#     --value "your-secret" --type SecureString --region ap-south-1
#
#   aws ssm put-parameter --name "/eventclick/prod/CORS_ORIGIN" \
#     --value "https://app.eventclick.live,https://www.eventclick.live,https://eventclick.live" \
#     --type String --region ap-south-1
#
# To update an existing parameter, add --overwrite:
#   aws ssm put-parameter --name "/eventclick/prod/CORS_ORIGIN" \
#     --value "new-value" --type String --overwrite --region ap-south-1
#
# ─────────────────────────────────────────────────────────────────────────────

set -euo pipefail

# ── Config ────────────────────────────────────────────────────────────────────
SSM_PATH="/eventclick/prod"
AWS_REGION="${AWS_REGION:-ap-south-1}"
OUTPUT_FILE="${1:-/etc/eventclick/.env}"

# ── Colors ────────────────────────────────────────────────────────────────────
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m'

log()  { echo -e "${GREEN}[SSM]${NC}  $(date +%H:%M:%S) $1"; }
warn() { echo -e "${YELLOW}[WARN]${NC} $(date +%H:%M:%S) $1"; }
err()  { echo -e "${RED}[ERROR]${NC} $(date +%H:%M:%S) $1" >&2; }

# ── Check AWS CLI available ───────────────────────────────────────────────────
if ! command -v aws &>/dev/null; then
  err "AWS CLI not found. Install with: sudo yum install -y aws-cli"
  exit 1
fi

# ── Check IAM credentials are available (EC2 instance role or env vars) ──────
if ! aws sts get-caller-identity --region "$AWS_REGION" &>/dev/null; then
  err "AWS credentials not available. Ensure EC2 IAM role has SSM read permissions."
  err "Required: ssm:GetParametersByPath, ssm:GetParameter"
  exit 1
fi

log "Fetching secrets from SSM path: ${SSM_PATH} (region: ${AWS_REGION})"

# ── Fetch all parameters with pagination ──────────────────────────────────────
# SSM returns a limited number of params per page — paginate via NextToken
# until exhausted. Each page's raw JSON is streamed into a python helper via
# STDIN (never interpolated into the python source as a string literal) so
# that secret values containing quotes, backslashes, or any other shell/python
# metacharacters can never break the merge or leak into a syntax error.
RAW_PAGES_FILE=$(mktemp)
trap 'rm -f "$RAW_PAGES_FILE"' EXIT

NEXT_TOKEN=""
PAGE_COUNT=0

while true; do
  if [[ -n "$NEXT_TOKEN" ]]; then
    RESPONSE=$(aws ssm get-parameters-by-path \
      --path "$SSM_PATH" \
      --with-decryption \
      --recursive \
      --output json \
      --region "$AWS_REGION" \
      --next-token "$NEXT_TOKEN")
  else
    RESPONSE=$(aws ssm get-parameters-by-path \
      --path "$SSM_PATH" \
      --with-decryption \
      --recursive \
      --output json \
      --region "$AWS_REGION")
  fi

  PAGE_COUNT=$((PAGE_COUNT + 1))
  echo "$RESPONSE" >> "$RAW_PAGES_FILE"
  echo "---PAGE-BREAK---" >> "$RAW_PAGES_FILE"

  NEXT_TOKEN=$(echo "$RESPONSE" | python3 -c "
import sys, json
data = json.load(sys.stdin)
print(data.get('NextToken', ''))
")

  if [[ -z "$NEXT_TOKEN" ]]; then
    break
  fi
  log "  ...fetching next page of parameters (page ${PAGE_COUNT} done)"
done

# ── Merge all pages via a single python pass over the raw-pages file ──────────
# Reads every JSON blob written above, split on the page-break marker, and
# merges Name/Value pairs. No secret value ever passes through a shell
# string-interpolation boundary.
ALL_PARAMS_JSON=$(python3 -c "
import json

with open('$RAW_PAGES_FILE') as f:
    raw = f.read()

merged = []
for chunk in raw.split('---PAGE-BREAK---'):
    chunk = chunk.strip()
    if not chunk:
        continue
    data = json.loads(chunk)
    for p in data.get('Parameters', []):
        merged.append({'Name': p['Name'], 'Value': p['Value']})

print(json.dumps(merged))
")

PARAM_COUNT=$(echo "$ALL_PARAMS_JSON" | python3 -c "import sys,json; print(len(json.load(sys.stdin)))")

if [[ "$PARAM_COUNT" -eq 0 ]]; then
  err "No parameters found at SSM path '${SSM_PATH}'."
  err "Have you populated SSM? See the usage comments at the top of this script."
  exit 1
fi

# ── Ensure runtime-only directory exists ────────────────────────────────
SECRETS_DIR="$(dirname "$OUTPUT_FILE")"
mkdir -p "$SECRETS_DIR"
chmod 700 "$SECRETS_DIR"

log "Found ${PARAM_COUNT} parameters from SSM. Writing to ${OUTPUT_FILE}..."

# ── Write .env file ──────────────────────────────────────────────────────
# Remove existing file first (security: don't append stale values)
rm -f "$OUTPUT_FILE"
touch "$OUTPUT_FILE"
chmod 600 "$OUTPUT_FILE"  # Owner read/write only — no group/other access

# Write header
cat >> "$OUTPUT_FILE" << EOF
# ─────────────────────────────────────────────────────────────────────────────
# AUTO-GENERATED by fetch-secrets.sh from AWS SSM Parameter Store
# Generated at: $(date -u +%Y-%m-%dT%H:%M:%SZ)
# SSM path: ${SSM_PATH}
# DO NOT EDIT MANUALLY — update values in SSM Parameter Store instead:
#   aws ssm put-parameter --name "${SSM_PATH}/VARIABLE_NAME" \\
#     --value "new_value" --type SecureString --overwrite --region ${AWS_REGION}
# ─────────────────────────────────────────────────────────────────────────────
EOF

# Convert SSM JSON output to KEY=VALUE pairs.
# SSM param name: /eventclick/prod/JWT_SECRET → env key: JWT_SECRET
# Uses json.dumps() for the value so quotes/backslashes/newlines in a secret
# are always escaped correctly and can never break the resulting .env line —
# no manual replace() escaping.
echo "$ALL_PARAMS_JSON" | python3 -c "
import sys, json

data = json.load(sys.stdin)
prefix = '${SSM_PATH}/'

for item in sorted(data, key=lambda x: x['Name']):
    key = item['Name'].replace(prefix, '').replace('/', '_').upper()
    value = item['Value']
    print(f'{key}={json.dumps(value)}')
" >> "$OUTPUT_FILE"

log "SSM secrets written to ${OUTPUT_FILE} (${PARAM_COUNT} variables, mode 600)"

# ── Extract individual secret files for Docker secrets ──────────────
SECRETS_DIR="/etc/eventclick/secrets"
mkdir -p "$SECRETS_DIR"
chmod 700 "$SECRETS_DIR"

# Sensitive keys that should also be exposed as individual Docker secret files
# (in addition to living in the .env file), for services that mount secrets
# as files rather than reading environment variables.
SECRET_KEYS=(
  "JWT_SECRET"
  "JWT_REFRESH_SECRET"
  "DB_PASSWORD"
  "REDIS_PASSWORD"
  "S3_ACCESS_KEY"
  "S3_SECRET_KEY"
  "LIVEKIT_API_KEY"
  "LIVEKIT_API_SECRET"
  "RESEND_API_KEY"
  "SQS_QUEUE_URL"
  "SQS_PDF_QUEUE_URL"
  "DATABASE_URL"
  "APP_DATABASE_URL"
  "AUTH_DATABASE_URL"
  "AUTH_DB_PASSWORD"
  "APP_DB_PASSWORD"
  "SENTRY_SERVER_DSN"
)

for key in "${SECRET_KEYS[@]}"; do
  value=$(python3 -c "
import json
with open('$OUTPUT_FILE') as f:
    for line in f:
        if line.startswith('${key}='):
            print(json.loads(line.strip().split('=', 1)[1]))
            break
" 2>/dev/null || echo "")
  if [[ -n "$value" ]]; then
    printf '%s' "$value" > "${SECRETS_DIR}/${key}"
    chmod 600 "${SECRETS_DIR}/${key}"
  fi
done

log "Secret files created in ${SECRETS_DIR} for Docker secrets"

# ── Append hardcoded defaults for non-secret values ──────────────────────────
# NODE_ENV is the only remaining hardcoded default — it is deliberately forced
# to "production" here regardless of what (if anything) is in SSM, since this
# script only ever runs against the production path.
#
# NOTE: GOTENBERG_URL used to be hardcoded here too, but it is now an SSM-
# managed parameter (see the confirmed param list). Do NOT re-add a hardcoded
# GOTENBERG_URL line below — docker compose's --env-file takes the LAST
# occurrence of a duplicate key, so a hardcoded line here would silently
# override the real SSM value written above.
cat >> "$OUTPUT_FILE" << 'DEFAULTS'

# ── Hardcoded defaults (forced regardless of SSM) ─────────────────────────
NODE_ENV="production"
DEFAULTS

log "Appended hardcoded defaults (NODE_ENV)"

# ── Verify required secrets are present ──────────────────────────────────────
# This list matches the confirmed set of 44 parameters under /eventclick/prod/*.
# Keep in sync with SSM — if you add/remove a param there, update this list too.
REQUIRED_KEYS=(
  "APP_DATABASE_URL"
  "APP_DB_PASSWORD"
  "APP_URL"
  "ATTENDANCE_WINDOW_AFTER_MINUTES"
  "ATTENDANCE_WINDOW_BEFORE_MINUTES"
  "AUTH_DATABASE_URL"
  "AUTH_DB_PASSWORD"
  "BCRYPT_ROUNDS"
  "COOKIE_DOMAIN"
  "CORS_ORIGIN"
  "DATABASE_URL"
  "DB_HOST"
  "DB_NAME"
  "DB_PASSWORD"
  "DB_USER"
  "GOOGLE_CLIENT_ID"
  "GOTENBERG_URL"
  "JWT_ACCESS_TTL"
  "JWT_REFRESH_SECRET"
  "JWT_REFRESH_TTL"
  "JWT_SECRET"
  "LIVEKIT_API_KEY"
  "LIVEKIT_API_SECRET"
  "LIVEKIT_PUBLIC_URL"
  "LIVEKIT_URL"
  "RATE_LIMIT_MAX"
  "RATE_LIMIT_WINDOW_MS"
  "REDIS_PASSWORD"
  "REDIS_URL"
  "RESEND_API_KEY"
  "RESEND_FROM_EMAIL"
  "S3_ACCESS_KEY"
  "S3_BUCKET"
  "S3_ENDPOINT"
  "S3_FORCE_PATH_STYLE"
  "S3_PUBLIC_ENDPOINT"
  "S3_REGION"
  "S3_SECRET_KEY"
  "SENTRY_SERVER_DSN"
  "SQS_PDF_QUEUE_URL"
  "SQS_QUEUE_URL"
  "SQS_DLQ_URL"
  "VITE_API_URL"
  "VITE_GOOGLE_CLIENT_ID"
  "VITE_LIVEKIT_URL"
  "VITE_SENTRY_CLIENT_DSN"
  "AWS_REGION"
)

MISSING=()
for key in "${REQUIRED_KEYS[@]}"; do
  if ! grep -q "^${key}=" "$OUTPUT_FILE" 2>/dev/null; then
    MISSING+=("$key")
  fi
done

if [[ ${#MISSING[@]} -gt 0 ]]; then
  warn "The following required secrets are MISSING from SSM:"
  for k in "${MISSING[@]}"; do
    warn "  - ${k}  →  aws ssm put-parameter --name '${SSM_PATH}/${k}' --value '...' --type SecureString --region ${AWS_REGION}"
  done
  err "Deployment may fail. Add missing secrets to SSM and retry."
  exit 1
fi

log "All ${#REQUIRED_KEYS[@]} required secrets verified ✅"