/**
 * How long a failed email message stays hidden before SQS delivers it again.
 *
 * Indexed by the receive that just failed: the first failure waits 30s, the
 * fourth and later 15 minutes. With the maxReceiveCount of 8 planned in #162, a
 * message is retried for a little over an hour before it redrives to the DLQ.
 *
 * This is the failure path only. A message deferred because another consumer
 * holds the delivery is hidden for the claim lease instead
 * (EMAIL_CLAIM_LEASE_SECONDS); the two answer different questions and must not
 * share a number.
 */
export const EMAIL_RETRY_DELAYS_SECONDS = [30, 120, 300, 900] as const;

/** Up to this fraction is added, so a burst of failures does not retry in lockstep. */
const JITTER_FRACTION = 0.2;

/**
 * `receiveCount` is the message's ApproximateReceiveCount attribute as SQS
 * returns it (a string). Missing or unreadable counts as the first receive:
 * a NaN visibility timeout would be rejected by SQS and the retry would fall
 * back to the receive's own timeout.
 */
export function emailRetryDelaySeconds(receiveCount: string | number | undefined, random: () => number = Math.random): number {
  const count = Number(receiveCount);
  const index = Number.isInteger(count) && count >= 1 ? Math.min(count, EMAIL_RETRY_DELAYS_SECONDS.length) - 1 : 0;
  const base = EMAIL_RETRY_DELAYS_SECONDS[index]!;
  return Math.round(base * (1 + JITTER_FRACTION * random()));
}
