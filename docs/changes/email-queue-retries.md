# Transactional email: exclusive send claim, retry backoff, permanent failures

**Status:** in progress. Step 1 shipped in #169; step 2 (this branch) awaiting review. Steps 3–6 of #162 are planned.
**Touches:** `packages/server/src/services/{email-delivery.service,email-error}.ts`, `packages/server/src/queues/{worker,emailBackoff}.ts`, `packages/server/src/config/{env,emailSender}.ts`, `packages/server/src/ops/probes/backlog.ts`, `packages/server/src/db/schema/emailDeliveries.ts`, `packages/server/drizzle/0014_email_delivery_claim_lease.sql`
**Ships with:** #169 (step 1), `fix/email-retry-backoff` (step 2). Tracking issue #162.

## 1. What the code does today

Every transactional email is a row in `email_deliveries`, created by `dispatchEmail`. In production `SQS_QUEUE_URL` is not set, so the row is sent inline and a failure is attempted once. The queue path already exists: `dispatchEmail` enqueues `{ deliveryId }`, and `startEmailSqsWorker` in `server` calls `attemptEmailDelivery`. #162 turns that path on. Before it is on, three things had to be true that were not.

**The claim was not exclusive (fixed in step 1).** The claim was:

```ts
.set({ attempts: sql`${emailDeliveries.attempts} + 1`, lastAttemptAt: new Date() })
.where(and(eq(emailDeliveries.id, deliveryId), eq(emailDeliveries.status, "PENDING")))
```

It collapsed a read-then-write into one statement, which is the right instinct. But the status stays `PENDING` for the whole provider call, so a second consumer arriving mid-send matched the same row. With inline sending nothing else ever arrived. With a queue, an SQS redelivery or the planned outbox sweeper does.

**Retries had a fixed delay (step 2).** On failure the message was left undeleted and came back after the receive's 60s visibility timeout, every time.

**Every failure was retried, and every failure was recorded as "Unknown error" (step 2).** The catch was:

```ts
const message = err instanceof Error ? err.message : "Unknown error";
```

The senders in `email.service.ts` rethrow Resend's `error`, and the Resend SDK returns that as a plain object, `{ name, statusCode, message }`, not an `Error`. A real call with an invalid key returned `{"statusCode":401,"name":"validation_error","message":"API key is invalid"}` with `instanceof Error` false. So `failure_reason` never held the provider's message. And an email with an invalid recipient would be retried until the redrive policy gave up on it.

## 2. What I am changing, and why

**Step 1 (#169): a lease, and `failed_at`.**
- `claimed_until`: the claim matches only when no unexpired lease exists. Today a second consumer sends the same email twice; reproduced against Postgres both sequentially and with overlapping transactions.
- A lease, not a `SENDING` status: `notification_delivery_status` is shared with `notification_deliveries` and mirrored in `@application/shared`.
- `attemptEmailDelivery` returns `sent | skipped | deferred`. On `deferred` the worker keeps the message and hides it for the lease length. Deleting it would drop the email if the lease holder died, and leaving it at 60s would spend a receive each time it came back.
- `failed_at`: Ops Console counted failures by `created_at`. A delivery fails only after its retries run out, often more than an hour after it was created, so it was never counted.

**Step 2 (this branch): backoff, permanent failures, readable reasons.**
- **Backoff** (`queues/emailBackoff.ts`). A failed message is hidden with `ChangeMessageVisibility` for 30s, 2m, 5m, then 15m for every later receive, plus up to 20% jitter, keyed on `ApproximateReceiveCount`. The receive now asks for that attribute; without it the attribute is absent and every failure would wait the first delay. With the planned `maxReceiveCount` of 8 a message is retried for a little over an hour. With the old fixed 60s delay and that same redrive policy, a Resend outage would exhaust the receives in about 8 minutes, so a short outage would turn into permanent failures.
- **Permanent failures** (`services/email-error.ts`). A 400 or 422 `validation_error`, `missing_required_field`, `invalid_parameter` or `invalid_attachment` marks the row `FAILED` through `markEmailDeliveryFailed` (so `failed_at` is set) and returns `failed`, and the worker deletes the message. Retrying gets the same answer: today a bad address is sent 8 times and only reaches `FAILED` an hour later.
- **Everything else retries**, including anything unrecognised. The configuration errors retry on purpose: an invalid, missing or restricted API key (Resend reports an invalid key as `validation_error` 401) and an unverified domain (403). They are shared by every email and fixed by a redeploy, so failing each email fast would lose all of them. Rate limits, quota errors and `application_error` retry too; `application_error` with a null status is what the SDK returns when the request never reached Resend.
- **`RESEND_FROM_EMAIL` is validated at startup** (`config/emailSender.ts`): an address or `Name <address>`, trimmed. A malformed sender is configuration too, but Resend's current error reference has no `invalid_from_address` row (only the SDK type does), so it most likely comes back as a 400/422 `validation_error`, which is classified permanent: every email would be marked `FAILED`. It was `z.string()`, and `docker-compose.prod.yml` passes `${RESEND_FROM_EMAIL}` with no default, so a missing SSM parameter arrived as `""` and passed (`.default()` only replaces `undefined`). Now the process exits at boot and the deploy fails loudly instead. Not verified against the live API, which needs a real key; the check makes the answer irrelevant.
- **`describeEmailError`** records `name status: message` for provider errors. Today every failure in `failure_reason` reads "Unknown error".

## 3. What this affects

- **Production today (inline sending):** a permanent rejection now ends as `FAILED` instead of `PENDING` forever, and `failure_reason` is readable. A retryable inline failure still stays `PENDING` until the sweeper (step 3); it now logs `email.inline_failed_not_retried`, which says so and gives step 3 a count to check against.
- **Ops Console:** a permanent rejection counts in `emailFailed1h` straight away. A bad recipient in a broadcast can turn the backlog badge amber or red where it used to stay green. That is the intent: it was always failing.
- **Queue path (off until step 5):** with no redrive policy yet, a retryable message keeps retrying at 15-minute intervals until the queue's message retention period expires. The redrive policy and email DLQ in #162 step 6 bound that.
- **Startup:** a deploy with an empty or malformed `RESEND_FROM_EMAIL` now fails at boot. The current production value already sends verification and reset emails, so it is valid and unaffected.
- **Classification mistakes:** a transient error classified as permanent would lose an email. The permanent set is limited to request-shape errors with a 400/422 status, and anything unrecognised retries. Signal: `email.delivery_failed_permanently` log lines and `FAILED` rows whose `failure_reason` is not about the recipient or content.
- **Signals if it breaks:** `email_sqs.process_failed` logs now carry `receiveCount` and `retryInSeconds`. A `retryInSeconds` that never grows means the receive count is not arriving.

## 4. What to learn from this

- **An atomic claim must change what the next claimant checks.** A conditional `UPDATE … WHERE status = 'PENDING'` is only a mutex if it moves the row out of `PENDING`, or sets a lease the condition also checks. Spot it: find the claim's `WHERE` and ask whether the `SET` makes that `WHERE` false for the next caller.
- **Classify failures as retryable or permanent, and default unknown to retryable.** Retrying a permanent error wastes the retry budget and delays the signal. Failing a transient one loses work, which is worse. Classify on what the error means, not its HTTP class: here one error name covered both a bad recipient (422) and a bad API key (401).
- **Validate configuration where it is loaded, not where it is used.** A bad setting that is only discovered per request looks like a per-request failure, and error handling built for those (here, fail fast on a 4xx) does the wrong thing at scale. Spot it: an env var typed as a bare string that a third party will parse; and `${VAR}` in compose with no default, which turns a missing value into `""`.
- **Check what a library actually throws.** `err instanceof Error ? err.message : "Unknown error"` silently discards the diagnostic when a library returns plain error objects, as the Resend SDK does. Spot it: any `instanceof Error` fallback around a third-party call; call the library once with bad input and look at the object.
- **Exponential backoff with jitter** spreads retries out so a recovering dependency is not hit again by every failed message at the same moment (the *thundering herd*).
