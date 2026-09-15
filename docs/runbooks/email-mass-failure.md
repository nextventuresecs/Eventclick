# Runbook: many emails failed at once

**Recovery code:** `requeueFailedEmailDeliveries` in `packages/server/src/services/email-delivery.service.ts`
**Related:** #162, `docs/changes/email-queue-retries.md`, `docs/runbooks/ops-console.md` (Health → backlog `emailFailed1h`)

---

## What this looks like

A delivery is marked `FAILED` on its first attempt when Resend rejects the request itself: a 400/422 `validation_error`, `missing_required_field`, `invalid_parameter` or `invalid_attachment` (`services/email-error.ts`). For one bad address that is correct. When a deploy breaks an email template or payload, every email of that type fails the same way.

Signals:
- Ops Console Health: backlog `emailFailed1h` amber or red.
- CloudWatch `/eventclick/prod/containers`, stream `server`: many `email.delivery_failed_permanently` lines with the same `type` and `reason`.

What users see while it lasts:

| Type | Effect |
|---|---|
| `verification` | New users cannot log in (`auth-login.service.ts` requires a verified email). `POST /auth/resend-verification` fails the same way until fixed. |
| `reset-password` | Users cannot reset their password. |
| `invite` | Invitees get no link. |
| `report-ready`, `event-*`, `org-broadcast` | Email copy lost; the in-app notification and push still go out. |

Nothing is retried automatically: a permanent rejection is final by design.

## 1. Confirm it is systematic

On the host:

```bash
docker exec eventclick_postgres_prod sh -c \
  'psql -U "$POSTGRES_USER" -d "$POSTGRES_DB" -c "
    SELECT email_type, failure_reason, count(*), min(failed_at), max(failed_at)
    FROM email_deliveries
    WHERE status = '\''FAILED'\'' AND failed_at > now() - interval '\''6 hours'\''
    GROUP BY 1, 2 ORDER BY 3 DESC"'
```

Many rows of one type with the same `failure_reason` is a systematic failure. Scattered reasons about individual addresses are not; do not requeue those.

## 2. Fix and deploy

Find the change that broke the request (the `failure_reason` names the field), fix it, deploy, and confirm a fresh email of that type sends: its sender's `_sent` event in the `server` stream (for example `email.verification_sent`, `email.password_reset_sent`).

**Do not requeue before the fix is live.** The rows would fail again straight away, and you would have to run step 3 again after the fix.

## 3. Re-send

Pick `failedSince` from the first failure in step 1. On the host:

```bash
docker exec eventclick_server_prod node -e "
require('./packages/server/dist/services/email-delivery.service')
  .requeueFailedEmailDeliveries({ type: 'verification', failedSince: new Date('2026-09-15T08:00:00Z'), limit: 500 })
  .then((r) => { console.log(JSON.stringify(r)); process.exit(0); })
  .catch((e) => { console.error(e); process.exit(1); });"
```

It prints `{"requeued":N}`. With `limit` rows re-sent, run it again until it prints `0`.

What it does and skips:
- Only `FAILED` rows of that type that failed at or after `failedSince`, oldest first.
- Skips rows whose link has expired, counted from when the email was created: `verification` and `invite` 24 hours, `reset-password` 1 hour. Those users need a new email: resend-verification, or a new reset request.
- Skips rows attempted in the last 2 minutes (a send may still be in flight). Run again later for those.
- Each re-sent row gets a new idempotency key, so Resend treats it as a new request.
- With `SQS_QUEUE_URL` unset (production today) rows are sent inline, one at a time, so a large batch takes a while. With the queue on, they are enqueued for the email worker.

## 4. Verify

Rerun the step 1 query: the count for that type and reason should drop to the expired and in-flight rows only. `email_deliveries.send_epoch` is above 0 on every re-sent row.
