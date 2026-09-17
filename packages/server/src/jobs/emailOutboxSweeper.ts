import { redisClient } from "../config/redis";
import { EMAIL_OUTBOX_SWEEP_LOCK_TTL_SEC, EMAIL_OUTBOX_SWEEP_POLL_MS } from "../config/constants";
import { sweepPendingEmailDeliveries } from "../services/email-delivery.service";
import { logger } from "../utils/logger";

const LOCK_KEY = "jobs:email-outbox-sweeper:lock";

const sweepSafely = async (): Promise<void> => {
  try {
    await sweepPendingEmailDeliveries();
  } catch (err) {
    logger.error({ err, event: "email.outbox_sweep_failed" }, "Email outbox sweep failed; the next poll retries");
  }
};

/**
 * One outbox sweep (see sweepPendingEmailDeliveries). The Redis lock only
 * saves duplicate work when several instances run jobs: the sweep is safe to
 * run concurrently (the send claim and SKIP LOCKED see to that), so it goes
 * ahead without the lock when Redis is down rather than stop email recovery.
 */
export const pollEmailOutbox = async (): Promise<void> => {
  if (!redisClient.isOpen) {
    await sweepSafely();
    return;
  }

  // A Redis error counts as acquired, for the same reason as Redis being down.
  const acquired = await redisClient.set(LOCK_KEY, "1", { NX: true, EX: EMAIL_OUTBOX_SWEEP_LOCK_TTL_SEC }).catch(() => "OK");
  if (!acquired) return; // another instance is sweeping

  try {
    await sweepSafely();
  } finally {
    await redisClient.del(LOCK_KEY).catch(() => {});
  }
};

export const startEmailOutboxSweeperJob = (): void => {
  void pollEmailOutbox();
  setInterval(() => void pollEmailOutbox(), EMAIL_OUTBOX_SWEEP_POLL_MS);
};
