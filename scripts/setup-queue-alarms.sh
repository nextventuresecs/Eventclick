#!/usr/bin/env bash
# ─────────────────────────────────────────────────────────────────────────────
# setup-queue-alarms.sh — email alerts for queues, DLQs and worker failures
# ─────────────────────────────────────────────────────────────────────────────
# Creates (or updates in place) the SNS topic `eventclick-alerts`, subscribes
# an email address to it, and points every queue alarm at it. Before this, the
# one existing alarm targeted a topic that did not exist, so nothing reached a
# human (#163).
#
# Every call here is an upsert: create-topic returns the existing topic,
# put-metric-filter and put-metric-alarm replace by name, and the subscription
# is skipped when the address is already on the topic. Rerun it freely after
# changing a threshold.
#
# Run with admin credentials, never the EC2 instance role.
#
# Usage (from the repo root):
#   ALERT_EMAIL=you@example.com scripts/setup-queue-alarms.sh
#   scripts/setup-queue-alarms.sh --test   # force every alarm to ALARM once
#
# A new subscription must be confirmed from the email AWS sends before any
# alert is delivered. What each alarm means and what to do when it fires:
# docs/runbooks/queue-alerts.md.
# ─────────────────────────────────────────────────────────────────────────────

set -euo pipefail

# Git Bash on Windows rewrites a leading "/" in arguments into a Windows path,
# which breaks the log group name.
export MSYS_NO_PATHCONV=1

REGION="${AWS_REGION:-ap-south-1}"
TOPIC_NAME="eventclick-alerts"
LOG_GROUP="/eventclick/prod/containers"
METRIC_NAMESPACE="Eventclick/Workers"
PDF_QUEUE="eventclick-pdf-queue"
PDF_DLQ="eventclick-pdf-dlq"

ALARMS=(
  eventclick-pdf-dlq-not-empty
  eventclick-dlq-old-messages
  eventclick-pdf-queue-old
  eventclick-worker-dlq-drain-errors
  eventclick-pdf-abandoned
  eventclick-lambda-errors
)

aws_() { aws --region "$REGION" "$@"; }

# The instance role deliberately cannot create or change alarms: a compromised
# host must not be able to silence its own alerts. Fail with the fix rather
# than an AuthorizationError halfway through.
CALLER=$(aws_ sts get-caller-identity --query Arn --output text)
if [[ "$CALLER" == *":assumed-role/EventclickEC2Role/"* ]]; then
  echo "Running as the EC2 instance role ($CALLER)." >&2
  echo "Run this from a workstation with admin credentials, not on the prod host." >&2
  exit 1
fi
echo "Caller: $CALLER"

if [[ "${1:-}" == "--test" ]]; then
  for name in "${ALARMS[@]}"; do
    aws_ cloudwatch set-alarm-state --alarm-name "$name" --state-value ALARM \
      --state-reason "Manual test from scripts/setup-queue-alarms.sh --test"
    echo "ALARM forced: $name"
  done
  echo "Each should email within a minute or two, then return to OK at its next evaluation."
  exit 0
fi

# ─── Topic and subscription ─────────────────────────────────────────────────
TOPIC_ARN=$(aws_ sns create-topic --name "$TOPIC_NAME" --query TopicArn --output text)
echo "Topic: $TOPIC_ARN"

if [[ -n "${ALERT_EMAIL:-}" ]]; then
  existing=$(aws_ sns list-subscriptions-by-topic --topic-arn "$TOPIC_ARN" \
    --query "Subscriptions[?Protocol=='email' && Endpoint=='${ALERT_EMAIL}'].SubscriptionArn" --output text)
  if [[ -n "$existing" ]]; then
    echo "Already subscribed ($existing): $ALERT_EMAIL"
  else
    aws_ sns subscribe --topic-arn "$TOPIC_ARN" --protocol email --notification-endpoint "$ALERT_EMAIL" >/dev/null
    echo "Subscription requested: $ALERT_EMAIL. Confirm it from the email AWS sends."
  fi
else
  count=$(aws_ sns list-subscriptions-by-topic --topic-arn "$TOPIC_ARN" \
    --query "length(Subscriptions[?SubscriptionArn!='PendingConfirmation'])" --output text)
  echo "ALERT_EMAIL not set; topic has ${count} confirmed subscription(s)."
  [[ "$count" -gt 0 ]] || echo "WARNING: nobody will receive these alarms until an address is subscribed and confirmed." >&2
fi

# ─── Log metric filters ─────────────────────────────────────────────────────
# Container logs are pino JSON lines, one per event, with an `event` field.
# No default value: minutes without a match publish nothing, and the alarms
# treat missing data as OK.
aws_ logs put-metric-filter --log-group-name "$LOG_GROUP" \
  --filter-name eventclick-dlq-drain-errors \
  --filter-pattern '{ ($.event = "dlq.drain_failed") || ($.event = "dlq.process_failed") }' \
  --metric-transformations "metricName=DlqDrainErrors,metricNamespace=${METRIC_NAMESPACE},metricValue=1"

aws_ logs put-metric-filter --log-group-name "$LOG_GROUP" \
  --filter-name eventclick-pdf-abandoned \
  --filter-pattern '{ $.event = "sqs.pdf_abandoned" }' \
  --metric-transformations "metricName=PdfJobsAbandoned,metricNamespace=${METRIC_NAMESPACE},metricValue=1"
echo "Metric filters on $LOG_GROUP: eventclick-dlq-drain-errors, eventclick-pdf-abandoned"

# ─── Alarms ─────────────────────────────────────────────────────────────────
# alarm NAME DESCRIPTION NAMESPACE METRIC STAT PERIOD EVAL_PERIODS OPERATOR THRESHOLD [DIMENSIONS]
alarm() {
  local name=$1 desc=$2 ns=$3 metric=$4 stat=$5 period=$6 evals=$7 op=$8 threshold=$9 dims=${10:-}
  local args=(
    --alarm-name "$name" --alarm-description "$desc"
    --namespace "$ns" --metric-name "$metric" --statistic "$stat"
    --period "$period" --evaluation-periods "$evals"
    --comparison-operator "$op" --threshold "$threshold"
    --treat-missing-data notBreaching
    --alarm-actions "$TOPIC_ARN" --ok-actions "$TOPIC_ARN"
  )
  [[ -n "$dims" ]] && args+=(--dimensions "$dims")
  aws_ cloudwatch put-metric-alarm "${args[@]}"
  echo "Alarm: $name"
}

# The drain runs every 5 minutes, so a message still visible after three
# 5-minute periods means the drain is failing, not merely behind.
alarm eventclick-pdf-dlq-not-empty \
  "PDF DLQ has held messages for 15 minutes: the pdf-worker drain is not settling them. See docs/runbooks/queue-alerts.md" \
  AWS/SQS ApproximateNumberOfMessagesVisible Maximum 300 3 GreaterThanThreshold 0 "Name=QueueName,Value=${PDF_DLQ}"

# Pre-existing alarm, same metric settings; only its dead topic is replaced.
alarm eventclick-dlq-old-messages \
  "PDF DLQ has a message older than 1 hour. See docs/runbooks/queue-alerts.md" \
  AWS/SQS ApproximateAgeOfOldestMessage Maximum 300 2 GreaterThanThreshold 3600 "Name=QueueName,Value=${PDF_DLQ}"

alarm eventclick-pdf-queue-old \
  "PDF queue has a message waiting more than 15 minutes: pdf-worker is down or stuck. See docs/runbooks/queue-alerts.md" \
  AWS/SQS ApproximateAgeOfOldestMessage Maximum 300 1 GreaterThanThreshold 900 "Name=QueueName,Value=${PDF_QUEUE}"

alarm eventclick-worker-dlq-drain-errors \
  "pdf-worker logged dlq.drain_failed or dlq.process_failed. See docs/runbooks/queue-alerts.md" \
  "$METRIC_NAMESPACE" DlqDrainErrors Sum 900 1 GreaterThanOrEqualToThreshold 1

alarm eventclick-pdf-abandoned \
  "A PDF job was abandoned mid-render with no attempts left (sqs.pdf_abandoned). See docs/runbooks/queue-alerts.md" \
  "$METRIC_NAMESPACE" PdfJobsAbandoned Sum 3600 1 GreaterThanOrEqualToThreshold 1

# No dimensions: Lambda's account-wide aggregate across every function.
alarm eventclick-lambda-errors \
  "A Lambda function errored. Only leftover functions remain; see docs/runbooks/queue-alerts.md" \
  AWS/Lambda Errors Sum 900 1 GreaterThanOrEqualToThreshold 1

echo "Done. Test delivery with: scripts/setup-queue-alarms.sh --test"
