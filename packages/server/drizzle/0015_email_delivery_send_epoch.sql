-- A send generation for email_deliveries, so a requeued delivery is a new
-- request to the email provider (#162).
--
-- Every send carries the idempotency key email-delivery/<id>, so a retry of the
-- same attempt cannot deliver twice. requeueFailedEmailDeliveries re-sends rows
-- that failed permanently, typically after a bad deploy is fixed. Resend does
-- not document whether it caches a rejected request against its key; if it
-- does, re-sending under the same key would return the cached rejection and
-- deliver nothing. Each requeue increments send_epoch, and the key includes it.
--
-- Defaults to 0, which keeps the existing key, so rows already in flight are
-- unaffected.
ALTER TABLE "email_deliveries"
  ADD COLUMN IF NOT EXISTS "send_epoch" integer NOT NULL DEFAULT 0;
