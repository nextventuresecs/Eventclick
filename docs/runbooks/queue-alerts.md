# Runbook: queue and worker alerts

**Set up by:** `scripts/setup-queue-alarms.sh` (idempotent; rerun after any threshold change)
**Delivered to:** SNS topic `eventclick-alerts` → email. Email only, no paging: same urgency as `docs/runbooks/uptime-alert.md`.
**Region:** `ap-south-1`
**Related:** #163, #161 (the DLQ drain these alarms watch), `docs/runbooks/ops-console.md` (the Health panel shows the same signals on demand)

---

## How the pieces fit

- `eventclick-pdf-queue` redrives to `eventclick-pdf-dlq` after 5 receives.
- `pdf-worker` drains the DLQ every 5 minutes (`packages/server/src/queues/dlq-consumer.ts`):
  each message marks its PDF job `failed`, notifies the requester, and is
  deleted only after that write succeeds.
- A PDF job abandoned mid-render is failed at its next claim once it has no
  attempts left, logged as `sqs.pdf_abandoned` (`queues/worker.ts`).
- Container logs are pino JSON in CloudWatch `/eventclick/prod/containers`, one
  stream per service. Two metric filters there feed namespace `Eventclick/Workers`.

Every alarm also emails when it returns to OK, and treats missing data as OK.
SQS stops publishing metrics for a queue idle for hours; the first message
sent wakes them again.

## Setup

```bash
ALERT_EMAIL=<maintainer address> scripts/setup-queue-alarms.sh
```

Run it from a workstation with admin credentials. On the prod host it exits: the
EC2 instance role cannot create alarms, on purpose.

Confirm the subscription from the email AWS sends ("AWS Notification -
Subscription Confirmation"). Until then nothing is delivered. Then:

```bash
scripts/setup-queue-alarms.sh --test
```

forces each alarm to ALARM once. Expect one email per alarm, then an OK email
at each alarm's next evaluation. Check nothing points at a missing topic:

```bash
aws cloudwatch describe-alarms --region ap-south-1 \
  --query 'MetricAlarms[].[AlarmName,AlarmActions[0]]' --output text
aws sns list-subscriptions-by-topic --region ap-south-1 \
  --topic-arn arn:aws:sns:ap-south-1:940278682995:eventclick-alerts
```

## Useful queries

Logs Insights on `/eventclick/prod/containers`:

```
fields @timestamp, @logStream, event, jobId, messageId, err.message
| filter event like /^dlq\./ or event like /^sqs\.pdf_/
| sort @timestamp desc
| limit 100
```

Queue depth now:

```bash
aws sqs get-queue-attributes --region ap-south-1 \
  --queue-url https://sqs.ap-south-1.amazonaws.com/940278682995/eventclick-pdf-dlq \
  --attribute-names ApproximateNumberOfMessages ApproximateNumberOfMessagesNotVisible
```

## Alarms

### `eventclick-pdf-dlq-not-empty`

**Fires:** the PDF DLQ has had a visible message for 15 minutes (three
5-minute periods). The drain runs every 5 minutes, so this means it is failing
to settle messages, not just behind.

**First look:**
1. `pdf-worker` is running: `docker compose -f docker-compose.prod.yml ps pdf-worker` on the host.
2. Its logs have `dlq.loop_start` since its last restart. None: `SQS_DLQ_URL` is unset in SSM and the drain never started.
3. `dlq.drain_failed` or `dlq.process_failed` in the query above. `AccessDenied` on `ReceiveMessage`/`DeleteMessage`: the `eventclick-pdf-dlq-drain` inline policy on `EventclickEC2Role` is gone (`docs/iam/pdf-worker-dlq-drain-policy.json`). A database error: fix Postgres; the messages stay and settle on the next drain.

**Do not purge the DLQ to clear the alarm.** The drain is what marks each job
failed and notifies its requester; purging skips that and leaves jobs
`processing`. Fix the drain and let it empty the queue.

### `eventclick-dlq-old-messages`

**Fires:** a DLQ message older than 1 hour, for 10 minutes. Always accompanied
by `eventclick-pdf-dlq-not-empty`; same first look. It exists as the slower,
louder signal that the drain has been broken for an hour.

### `eventclick-pdf-queue-old`

**Fires:** a PDF request has waited more than 15 minutes in `eventclick-pdf-queue`.

**First look:** `pdf-worker` down or restarting (see above), then Gotenberg
(`docker compose ... ps gotenberg`, its health check). A render that times out
is retried and, after 5 receives, lands in the DLQ, so this alarm usually
means no consumer at all rather than slow renders.

### `eventclick-worker-dlq-drain-errors`

**Fires:** `pdf-worker` logged `dlq.drain_failed` (a whole drain threw, usually
SQS or credentials) or `dlq.process_failed` (one message could not be settled,
usually the database) in a 15-minute window.

**First look:** the log query above; `err.message` names the cause. A single
blip that clears is fine: the message stays in the DLQ and the next drain
retries it. If it repeats, `eventclick-pdf-dlq-not-empty` follows.

### `eventclick-pdf-abandoned`

**Fires:** a PDF job was found `processing` long after its worker should have
finished, with no attempts left, and was failed (`sqs.pdf_abandoned`). The
requester has been notified.

**First look:** why did its worker die mid-render? `pdf-worker` restarts
(`docker inspect --format '{{.RestartCount}}' eventclick_pdf_worker_prod`), the
512M memory limit (OOM kills in `dmesg` on the host), or a deploy that recreated
the worker during a render. One occurrence around a deploy needs nothing.

### `eventclick-lambda-errors`

**Fires:** any Lambda function in the account errored (account-wide aggregate).
Only the leftover `eventclick-email-worker` and `eventclick-dlq-consumer`
remain, both retired (#161, #162), so an invocation at all is unexpected.

**First look:** `aws logs tail /aws/lambda/<function> --since 1h --region ap-south-1`.
Find what invoked it (event source mapping or EventBridge rule) and disable
that. Remove this alarm once both functions are deleted.

## Replaying DLQ messages

Rarely wanted: a PDF message reaches the DLQ only after 5 failed renders, and
the drain has already told the requester, who can simply request the report
again. If a systemic fault (Gotenberg down, S3 credentials) failed many jobs
and you would rather re-run them, stop the drain first or it will settle them
before you move them:

```bash
# on the host: stop the worker so nothing drains while you move messages
docker compose -f docker-compose.prod.yml stop pdf-worker
aws sqs start-message-move-task --region ap-south-1 \
  --source-arn arn:aws:sqs:ap-south-1:940278682995:eventclick-pdf-dlq \
  --destination-arn arn:aws:sqs:ap-south-1:940278682995:eventclick-pdf-queue
docker compose -f docker-compose.prod.yml up -d --no-deps pdf-worker
```

Jobs already marked `failed` with attempts left are retried by the claim;
those at max attempts are skipped.

## Not covered here

- Email queue alarms (`eventclick-email-queue-old`, `eventclick-email-dlq-not-empty`): added with #162, when email goes through SQS.
- Host disk and memory: `scripts/health-monitor.sh`.
- HTTP availability: `docs/runbooks/uptime-alert.md`.
- Paging, Sentry alert rules.

## Change log

| Date | Change | By |
|---|---|---|
| 2026-09-15 | Script and runbook added (#163). Not yet applied. | — |
