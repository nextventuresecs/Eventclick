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
# SSM returns max 10 params per page. We need to paginate to get all of them.
ALL_PARAMS="[]"
NEXT_TOKEN=""

while true; do
  if [[ -n "$NEXT_TOKEN" ]]; then
    RESPONSE=$(aws ssm get-parameters-by-path \
      --path "$SSM_PATH" \
      --with-decryption \
      --recursive \
      --output json \
      --region "$AWS_REGION" \
      --next-token "$NEXT_TOKEN" 2>/dev/null)
  else
    RESPONSE=$(aws ssm get-parameters-by-path \
      --path "$SSM_PATH" \
      --with-decryption \
      --recursive \
      --output json \
      --region "$AWS_REGION" 2>/dev/null)
  fi

  # Extract parameters from this page and merge into ALL_PARAMS
  PAGE_PARAMS=$(echo "$RESPONSE" | python3 -c "
import sys, json
data = json.load(sys.stdin)
params = data.get('Parameters', [])
print(json.dumps([{'Name': p['Name'], 'Value': p['Value']} for p in params]))
" 2>/dev/null || echo "[]")

  ALL_PARAMS=$(python3 -c "
import sys, json
existing = json.loads('$ALL_PARAMS' if len('$ALL_PARAMS') < 10000 else sys.stdin.read())
new_page = json.loads('''$PAGE_PARAMS''')
existing.extend(new_page)
print(json.dumps(existing))
" 2>/dev/null <<< "$ALL_PARAMS")

  # Check for NextToken (more pages)
  NEXT_TOKEN=$(echo "$RESPONSE" | python3 -c "
import sys, json
data = json.load(sys.stdin)
print(data.get('NextToken', ''))
" 2>/dev/null || echo "")

  if [[ -z "$NEXT_TOKEN" ]]; then
    break
  fi
  log "  ...fetching next page of parameters"
done

PARAM_COUNT=$(echo "$ALL_PARAMS" | python3 -c "import sys,json; data=json.load(sys.stdin); print(len(data))" 2>/dev/null || echo "0")

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

# Convert SSM JSON output to KEY=VALUE pairs
# SSM param name: /eventclick/prod/JWT_SECRET → env key: JWT_SECRET
echo "$ALL_PARAMS" | python3 -c "
import sys, json
data = json.load(sys.stdin)
prefix = '${SSM_PATH}/'
for item in sorted(data, key=lambda x: x['Name']):
    key = item['Name'].replace(prefix, '').replace('/', '_').upper()
    value = item['Value']
    # Escape any double quotes in value
    value = value.replace('\"', '\\\\\"')
    print(f'{key}=\"{value}\"')
" >> "$OUTPUT_FILE"

log "SSM secrets written to ${OUTPUT_FILE} (${PARAM_COUNT} variables, mode 600)"

# ── Extract individual secret files for Docker secrets ──────────────
SECRETS_DIR="/etc/eventclick/secrets"
mkdir -p "$SECRETS_DIR"
chmod 700 "$SECRETS_DIR"

# Sensitive keys that should be Docker secrets (not environment variables)
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
)

for key in "${SECRET_KEYS[@]}"; do
  value=$(grep "^${key}=" "$OUTPUT_FILE" 2>/dev/null | cut -d'"' -f2)
  if [[ -n "$value" ]]; then
    echo "$value" > "${SECRETS_DIR}/${key}"
    chmod 600 "${SECRETS_DIR}/${key}"
  fi
done

log "Secret files created in ${SECRETS_DIR} for Docker secrets"

# ── Append hardcoded defaults for non-secret values ──────────────────────────
# These are internal Docker network values that never change and don't belong in SSM
cat >> "$OUTPUT_FILE" << 'DEFAULTS'

# ── Hardcoded defaults (internal Docker network, not managed by SSM) ─────────
GOTENBERG_URL="http://gotenberg:3000"
NODE_ENV="production"
DEFAULTS

log "Appended hardcoded defaults (GOTENBERG_URL, NODE_ENV)"

# ── Verify required secrets are present ──────────────────────────────────────
REQUIRED_KEYS=(
  "JWT_SECRET"
  "JWT_REFRESH_SECRET"
  "DB_PASSWORD"
  "DATABASE_URL"
  "REDIS_PASSWORD"
  "REDIS_URL"
  "CORS_ORIGIN"
  "APP_URL"
  "COOKIE_DOMAIN"
  "LIVEKIT_API_KEY"
  "LIVEKIT_API_SECRET"
  "RESEND_API_KEY"
  "RESEND_FROM_EMAIL"
  "S3_ACCESS_KEY"
  "S3_SECRET_KEY"
  "SQS_QUEUE_URL"
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
