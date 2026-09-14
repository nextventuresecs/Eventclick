# The PDF dead-letter queue was never drained

**Status:** in progress — code complete, awaiting review
**Touches:** `packages/server/src/queues/dlq-consumer.ts`, `packages/server/src/worker-entry.ts`, `docs/iam/pdf-worker-dlq-drain-policy.json`
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

## 3. Infra (applied 2026-09-15)

- Inline policy `eventclick-pdf-dlq-drain` on `EventclickEC2Role`:
  `sqs:ReceiveMessage` and `sqs:DeleteMessage` on `eventclick-pdf-dlq` only
  (`docs/iam/pdf-worker-dlq-drain-policy.json`). Checked with the IAM policy
  simulator: receive and delete are allowed; send and purge are denied.
- EventBridge rule `eventclick-dlq-drain-rule` **disabled**. The Lambda and its
  role are left in place. Delete both once this has run in prod for a week.

## 4. Not changed (found while here)

- `eventclick-email-queue` has no redrive policy, so email messages never reach
  a DLQ. The `deliveryId` branch is kept for when one is added.
- The Lambda `eventclick-email-worker` still has an enabled SQS trigger on
  `eventclick-email-queue`, racing `startEmailSqsWorker`. `worker.ts` warns that
  it must be detached.
- A PDF job whose worker dies mid-render stays `processing`: redelivery sees
  `processing`, skips and deletes, so it never reaches the DLQ. The #149 health
  badge shows these as `pdfStuck`.

## 5. Verification

- Unit (`queues/__tests__/dlq-consumer.test.ts`, 8 tests): PDF job failed in its
  tenant context with a notification and then deleted; no second notification
  when the row was already settled; a message kept when the database write
  fails, without spinning; email, unparseable and unknown messages; multi-batch
  drain; the loop runs immediately, skips overlapping ticks, survives a failed
  drain and stops.
- After deploy: `pdf-worker` logs show `dlq.loop_start`, and no `dlq.drain_failed`
  (an IAM or credentials problem would appear there).

## 6. Rollback

Revert the PR. Re-enabling the rule is pointless (the Lambda cannot run).
Remove the `eventclick-pdf-dlq-drain` inline policy.
