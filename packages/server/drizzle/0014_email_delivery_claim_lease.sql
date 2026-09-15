-- Exclusive send claim and failure timestamp for email_deliveries (#162).
--
-- WHY A LEASE COLUMN RATHER THAN A 'SENDING' STATUS
-- The claim used to be UPDATE ... SET attempts = attempts + 1 WHERE status =
-- 'PENDING'. It left the status PENDING, so a second consumer that arrived
-- while the first was still talking to the provider matched the same row and
-- sent the email again. The status enum (notification_delivery_status) is
-- shared with notification_deliveries and mirrored in @application/shared, so
-- a new value would change another table's vocabulary. A lease is local to
-- this table, and expires on its own if the worker dies mid-send.
ALTER TABLE "email_deliveries"
  ADD COLUMN IF NOT EXISTS "claimed_until" timestamp with time zone;
--> statement-breakpoint

-- WHY failed_at
-- Ops Console counted failures by created_at. With SQS retries a delivery
-- fails an hour or more after it was created, so it was never counted.
ALTER TABLE "email_deliveries"
  ADD COLUMN IF NOT EXISTS "failed_at" timestamp with time zone;
--> statement-breakpoint

-- Rows the inline send path left PENDING are never retried. Anything older
-- than a day carries an expired verification or reset link, so it is closed
-- out here rather than re-sent later by the outbox sweeper. Younger rows are
-- left alone: one may be mid-send right now. failed_at takes the row's own
-- time, so the backfill does not show up as a burst of fresh failures.
UPDATE "email_deliveries"
  SET "status" = 'FAILED',
      "failed_at" = COALESCE("last_attempt_at", "created_at"),
      "failure_reason" = COALESCE("failure_reason" || '; ', '') || 'Never sent, closed out by migration 0014'
  WHERE "status" = 'PENDING' AND "created_at" < now() - interval '1 day';
--> statement-breakpoint

GRANT SELECT ("failed_at") ON "email_deliveries" TO maintainer_ro;
