import { PDF_ASYNC_RENDER_TIMEOUT_MS } from "../config/constants";

/**
 * A `processing` row older than this was abandoned by a worker that died
 * mid-render. A live job aborts its render at PDF_ASYNC_RENDER_TIMEOUT_MS; the
 * extra minute covers the upload and completion write. A crashed job's message
 * only reappears after the queue's 300s visibility timeout, so on redelivery it
 * is always past this.
 */
export const PDF_JOB_STALE_MS = PDF_ASYNC_RENDER_TIMEOUT_MS + 60_000;

export type ExistingPdfJob = {
  status: string;
  attempts: number | null;
  maxAttempts: number | null;
  updatedAt: Date;
};

export type PdfJobClaim =
  /** No row yet: insert one and process. */
  | { action: "insert" }
  /** Row is pending: process it. */
  | { action: "process" }
  /** Retry a failed or abandoned job, recording the attempt. */
  | { action: "retry"; attempts: number }
  /** Nothing to do; delete the message. */
  | { action: "skip"; reason: "completed" | "max_attempts" }
  /** Abandoned with no attempts left: mark failed, notify, delete the message. */
  | { action: "abandon"; attempts: number }
  /** Another worker is on it: leave the message for SQS to redeliver or redrive. */
  | { action: "defer" };

export function decidePdfJobClaim(existing: ExistingPdfJob | undefined, now: Date): PdfJobClaim {
  if (!existing) return { action: "insert" };

  const attempts = existing.attempts ?? 0;
  const maxAttempts = existing.maxAttempts ?? 3;

  switch (existing.status) {
    case "completed":
      return { action: "skip", reason: "completed" };
    case "failed":
      return attempts >= maxAttempts ? { action: "skip", reason: "max_attempts" } : { action: "retry", attempts: attempts + 1 };
    case "processing": {
      const stale = now.getTime() - existing.updatedAt.getTime() > PDF_JOB_STALE_MS;
      if (!stale) return { action: "defer" };
      return attempts >= maxAttempts ? { action: "abandon", attempts } : { action: "retry", attempts: attempts + 1 };
    }
    default:
      return { action: "process" };
  }
}
