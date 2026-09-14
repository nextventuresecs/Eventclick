# The PDF dead-letter queue was never drained, and abandoned PDF jobs stayed `processing` forever

**Status:** in progress — code complete, awaiting review
**Touches:** `packages/server/src/queues/{dlq-consumer,worker,pdfJobClaim}.ts`, `packages/server/src/worker-entry.ts`, `docs/iam/pdf-worker-dlq-drain-policy.json`
**Ships with:** `fix/dlq-drain-in-worker`

---

## 1. What was happening

`eventclick-pdf-queue` redrives to `eventclick-pdf-dlq` after 5 receives. The
drain was the Lambda `eventclick-dlq-consumer`, deployed by hand on 2026-08-07
and invoked every 5 minutes by the EventBridge rule
`eventclick-dlq-drain-rule`. It had never worked:

- **It crashed at init on every invocation.** CommonJS output was deployed as
  `index.mjs`: `ReferenceError: exports is not defined in ES module scope`.
- Its role had only `AWSLambdaBasicExecutionRole`, with no SQS access.
- Its 3s timeout was shorter than the consumer's 20s long poll.
- It could not reach Postgres, so it could only have logged and deleted. A PDF
  job that SQS gave up on would still sit in `pending` or `processing`, and the
  requester would never hear.

In the repo, `runDlqDrainLoop` had no callers, so no process drained the queue.
Nothing had landed in the DLQ yet (depth 0 on 2026-09-15). Since #149 the
Ops Console health badge turns red on any DLQ message, so one stuck message
would have kept it red.

## 2. What I changed, and why

- **The drain runs in `pdf-worker`** (`worker-entry.ts`), which already has
  the database, the tenant background context and the instance role. It drains
  at start and then every 5 minutes. Runs never overlap and never throw into
  the timer, and the loop stops on SIGTERM.
- **Settle, then delete.** A `generate_pdf` message marks its `pdf_jobs` row
  `failed` (unless it is already `completed` or `failed`) inside
  `runInBackgroundTenantContext`. If the drain is what failed the job, the
  requester gets a `report_failed` notification, the same one the worker sends.
  The message is deleted only after that write succeeds. If the database is
  down, the message stays for the next drain, and a batch where nothing settles
  ends the run so it doesn't spin.
- **Evidence stays in CloudWatch.** Every payload is logged (`dlq.message`)
  before handling. Unparseable and unknown messages are logged and deleted:
  nothing could ever process them, and keeping them would pin the DLQ depth.
- The Lambda `handler` export is removed.
- **Sent emails are never downgraded.** `markEmailDeliveryFailed` updated
  unconditionally. A message can reach the DLQ after a successful send when
  its SQS delete failed, and the drain would have marked a delivered email
  FAILED. It now skips `SENT` and `DELIVERED` rows and reports whether it
  changed anything.

## 3. Infra (applied 2026-09-15)

- Inline policy `eventclick-pdf-dlq-drain` on `EventclickEC2Role`:
  `sqs:ReceiveMessage` and `sqs:DeleteMessage` on `eventclick-pdf-dlq` only
  (`docs/iam/pdf-worker-dlq-drain-policy.json`). Checked with the IAM policy
  simulator: receive and delete are allowed; send and purge are denied.
- EventBridge rule `eventclick-dlq-drain-rule` **disabled**. The Lambda and its
  role are left in place. Delete both once this has run in prod for a week.

## 4. Abandoned PDF jobs

A worker that died mid-render left its row `processing`. SQS redelivered the
message after the 300s visibility timeout; the claim saw `processing`, logged
"already being processed", and **deleted the message**. The job never
completed, never failed, never reached the DLQ, and the requester never heard.

`decidePdfJobClaim` (`queues/pdfJobClaim.ts`, pure) and `claimPdfJob`
(`queues/worker.ts`) replace the inline claim:

- `processing` older than the render timeout plus a minute (3 min) is
  **abandoned**: retried with the attempt counted, or, with no attempts left,
  marked `failed` and the requester notified. A crashed job's message only
  reappears after 300s, so it is always stale by then.
- `processing` still fresh is **deferred**: the message is left undeleted. SQS
  redelivers it later, and after the queue's max receive count it redrives to
  the DLQ, which now fails the job. Deleting it was the bug.
- Every claim is a conditional UPDATE on the status and attempts it read, so
  two workers redelivered the same job cannot both claim it.
- A new job is inserted directly as `processing` instead of `pending` and then
  `processing`.

## 5. Email queue (infra, pending: needs a human)

Found while here. Prod currently sends email **inline**: `SQS_QUEUE_URL` is not
passed to the `server` container, which logs `SQS_QUEUE_URL not provided, email
worker will not start`. `eventclick-email-queue` received 0 messages in the
14 days to 2026-09-15. So the two issues below are dormant rather than live:

- **The superseded Lambda `eventclick-email-worker` still has an enabled SQS
  trigger** on the email queue (mapping `112591ef-8298-45c5-bc83-00be113e7190`).
  `worker.ts` and `workers/email.lambda.ts` say it must be detached. If the
  queue is ever turned on, it races `startEmailSqsWorker`.
- **The email queue has no redrive policy.** Proposed:
  `maxReceiveCount` 10 into `eventclick-pdf-dlq`, the one DLQ the app
  (`SQS_DLQ_URL`), the drain and the Ops Console health probe all use; the
  drain already settles `{ deliveryId }` messages as FAILED. The name is
  historical.

Also: with inline sending, a failed email is attempted once and its row stays
`PENDING` with a `failure_reason`. It is never retried and never marked FAILED,
so the #149 `emailFailed1h` count cannot see it. Turning the queue on fixes
that, but it changes how every email is sent, so it is not in this PR.

## 6. Verification

- Unit (`queues/__tests__/dlq-consumer.test.ts`, 8 tests): PDF job failed in its
  tenant context with a notification and then deleted; no second notification
  when the row was already settled; a message kept when the database write
  fails, without spinning; email, unparseable and unknown messages; multi-batch
  drain; the loop runs immediately, skips overlapping ticks, survives a failed
  drain and stops.
- Integration (`__tests__/email-delivery-failed.integration.test.ts`, real
  Postgres): PENDING and FAILED become FAILED; SENT and DELIVERED are left
  alone. Removing the guard fails both of those.
- Unit (`queues/__tests__/pdfJobClaim.test.ts`, 9 tests): the claim decision
  table, including the stale boundary.
- Integration (`__tests__/pdf-job-claim.integration.test.ts`, real Postgres):
  new job claimed, fresh duplicate deferred, abandoned job reclaimed; two
  concurrent reclaims produce exactly one claim; an abandoned job with no
  attempts left is failed with one notification; completed is skipped. Runs as
  the connecting role, as CI does, so RLS policies are not exercised.
- After deploy: `pdf-worker` logs show `dlq.loop_start`, and no `dlq.drain_failed`
  (an IAM or credentials problem would appear there).

## 7. Rollback

Revert the PR. Re-enabling the rule is pointless (the Lambda cannot run).
Remove the `eventclick-pdf-dlq-drain` inline policy.
