import { ReceiveMessageCommand, DeleteMessageCommand } from "@aws-sdk/client-sqs";
import { and, eq, ne } from "drizzle-orm";
import { env } from "../config/env";
import { logger } from "../utils/logger";
import { db } from "../db";
import { runInBackgroundTenantContext } from "../db/backgroundTenantContext";
import { pdfJobs } from "../db/schema";
import { markEmailDeliveryFailed } from "../services/email-delivery.service";
import { notificationService } from "../services/notification.service";
import { sqsClient } from "./sqs.client";

/**
 * Drains SQS_DLQ_URL from the pdf-worker process (worker-entry.ts).
 *
 * It used to be packaged as a Lambda on an EventBridge schedule, which could
 * not reach Postgres and so could only log and delete. Here each message is
 * settled against the database first: a PDF job that SQS gave up on is marked
 * failed and its requester notified, instead of sitting in `processing`
 * forever. A message is deleted only once that write succeeds; if the database
 * is down it stays in the DLQ for the next drain. The full payload is logged
 * before anything else, so CloudWatch keeps the record after deletion.
 */

const MAX_MESSAGES = 10;
const WAIT_TIME_SECONDS = 20;
const VISIBILITY_TIMEOUT_SECONDS = 60;
const RAW_BODY_LOG_LIMIT = 2_000;
export const DLQ_DRAIN_INTERVAL_MS = 300_000;

const DLQ_FAILURE_MESSAGE = "Moved to the dead-letter queue after exceeding the queue's max receive count";

type DlqMessage = { Body?: string; ReceiptHandle?: string; MessageId?: string };

async function failPdfJob(payload: { jobId?: unknown; roomId?: unknown; orgId?: unknown; userId?: unknown }, messageId?: string) {
  const { jobId, roomId, orgId, userId } = payload;
  if (typeof jobId !== "string" || typeof orgId !== "string" || typeof userId !== "string") {
    logger.error({ event: "dlq.pdf_payload_invalid", messageId, payload }, "DLQ PDF message is missing jobId, orgId or userId");
    return;
  }

  // No ambient request: without a tenant context RLS matches zero rows.
  const failed = await runInBackgroundTenantContext(orgId, userId, async () => {
    const rows = await db
      .update(pdfJobs)
      .set({ status: "failed", errorMessage: DLQ_FAILURE_MESSAGE, updatedAt: new Date() })
      .where(and(eq(pdfJobs.jobId, jobId), ne(pdfJobs.status, "completed"), ne(pdfJobs.status, "failed")))
      .returning({ id: pdfJobs.id });

    // Only notify when this drain is what failed the job; the worker already
    // notified for jobs it failed itself.
    if (rows.length > 0) {
      await notificationService.createNotification({
        userId,
        organizationId: orgId,
        type: "report_failed",
        title: "Report Generation Failed",
        message: `Your event report for room ${String(roomId)} could not be generated. Please try again.`,
        metadata: { roomId, jobId, error: DLQ_FAILURE_MESSAGE },
      });
    }
    return rows.length > 0;
  });

  logger.error(
    { event: "dlq.pdf_failed_permanently", jobId, roomId, orgId, userId, messageId, markedFailed: failed },
    "PDF job permanently failed after exceeding the queue's redrive policy",
  );
}

async function settle(msg: DlqMessage): Promise<void> {
  let payload: Record<string, unknown>;
  try {
    payload = JSON.parse(msg.Body!);
  } catch {
    // Nothing can ever process it, and keeping it would hold the DLQ depth
    // above zero forever. The log line is the record.
    logger.error(
      { event: "dlq.unparseable", messageId: msg.MessageId, body: msg.Body!.slice(0, RAW_BODY_LOG_LIMIT) },
      "Unparseable DLQ message discarded",
    );
    return;
  }

  logger.error({ event: "dlq.message", messageId: msg.MessageId, payload }, "DLQ message received");

  if (payload.type === "generate_pdf") {
    await failPdfJob(payload, msg.MessageId);
  } else if (typeof payload.deliveryId === "string") {
    const markedFailed = await markEmailDeliveryFailed(payload.deliveryId, DLQ_FAILURE_MESSAGE);
    logger.error(
      { event: "dlq.email_failed_permanently", deliveryId: payload.deliveryId, messageId: msg.MessageId, markedFailed },
      "Email delivery permanently failed after exceeding the queue's redrive policy",
    );
  } else {
    logger.warn({ event: "dlq.unknown_message_type", messageId: msg.MessageId }, "Unknown DLQ message type discarded");
  }
}

/** Receives until the queue is empty. Returns how many messages were deleted. */
export async function drainDlq(queueUrl: string | undefined = env.SQS_DLQ_URL): Promise<number> {
  if (!queueUrl) return 0;

  let deleted = 0;
  for (;;) {
    const received = await sqsClient.send(
      new ReceiveMessageCommand({
        QueueUrl: queueUrl,
        MaxNumberOfMessages: MAX_MESSAGES,
        WaitTimeSeconds: WAIT_TIME_SECONDS,
        VisibilityTimeout: VISIBILITY_TIMEOUT_SECONDS,
      }),
    );
    const messages = received.Messages ?? [];
    if (messages.length === 0) break;

    let settledInBatch = 0;
    for (const msg of messages) {
      if (!msg.Body || !msg.ReceiptHandle) continue;
      try {
        await settle(msg);
        await sqsClient.send(new DeleteMessageCommand({ QueueUrl: queueUrl, ReceiptHandle: msg.ReceiptHandle }));
        deleted++;
        settledInBatch++;
      } catch (err) {
        // Left undeleted: visible again after the visibility timeout, retried next drain.
        logger.error({ err, messageId: msg.MessageId, event: "dlq.process_failed" }, "Failed to settle DLQ message");
      }
    }

    // Everything in this batch failed (database down): stop instead of
    // spinning on the same messages; the next interval tries again.
    if (settledInBatch === 0) break;
  }

  if (deleted > 0) logger.info({ event: "dlq.drain_complete", deleted }, "DLQ drain complete");
  return deleted;
}

/**
 * Drains now, then every `intervalMs`. Runs never overlap and never throw into
 * the timer. Returns a stop function for shutdown.
 */
export function startDlqDrainLoop(
  intervalMs = DLQ_DRAIN_INTERVAL_MS,
  queueUrl: string | undefined = env.SQS_DLQ_URL,
): () => void {
  if (!queueUrl) {
    logger.warn({ event: "dlq.skip" }, "SQS_DLQ_URL not configured, DLQ drain will not run");
    return () => {};
  }

  let running = false;
  const tick = async () => {
    if (running) return;
    running = true;
    try {
      await drainDlq(queueUrl);
    } catch (err) {
      logger.error({ err, event: "dlq.drain_failed" }, "DLQ drain failed");
    } finally {
      running = false;
    }
  };

  logger.info({ intervalMs, event: "dlq.loop_start" }, "Starting DLQ drain loop");
  void tick();
  const timer = setInterval(() => void tick(), intervalMs);
  return () => clearInterval(timer);
}
