import {
  ReceiveMessageCommand,
  DeleteMessageCommand,
  ChangeMessageVisibilityCommand,
} from "@aws-sdk/client-sqs";
import { PutObjectCommand } from "@aws-sdk/client-s3";
import { env } from "../config/env";
import { logger } from "../utils/logger";
import { generateVerificationReportPdf } from "../services/report.service";
import { findUserById } from "../services/auth";
import { db } from "../db";
import { pdfJobs } from "../db/schema";
import { eq } from "drizzle-orm";
import { notificationService } from "../services/notification.service";
import { s3, buildPublicUrl } from "../services/storage.service";
import { dispatchEmail, attemptEmailDelivery } from "../services/email-delivery.service";
import { sqsClient } from "./sqs.client";

// SQS client is now the single shared instance from sqs.client.ts.
// Do NOT construct a second SQSClient here — a prior duplicate with an
// S3_ACCESS_KEY/S3_SECRET_KEY credentials override caused InvalidClientTokenId
// against real AWS SQS. One client, one config, one place to fix.

const VISIBILITY_TIMEOUT_SECONDS = 300;
const MAX_RECEIVE_WAIT = 20;
const MAX_MESSAGES = 5;
const PDF_GENERATION_TIMEOUT_MS = 120_000;
const VISIBILITY_HEARTBEAT_INTERVAL_MS = 60_000;

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function extendVisibility(queueUrl: string, receiptHandle: string): Promise<void> {
  try {
    await sqsClient.send(
      new ChangeMessageVisibilityCommand({
        QueueUrl: queueUrl,
        ReceiptHandle: receiptHandle,
        VisibilityTimeout: VISIBILITY_TIMEOUT_SECONDS,
      }),
    );
  } catch {
    // Best-effort heartbeat; if it fails the message will reappear after the original timeout
  }
}

async function startVisibilityHeartbeat(
  queueUrl: string,
  receiptHandle: string,
  signal: { aborted: boolean },
): Promise<() => void> {
  let timer: NodeJS.Timeout | undefined;

  const tick = async () => {
    if (signal.aborted) return;
    await extendVisibility(queueUrl, receiptHandle);
    timer = setTimeout(tick, VISIBILITY_HEARTBEAT_INTERVAL_MS);
  };

  timer = setTimeout(tick, VISIBILITY_HEARTBEAT_INTERVAL_MS);

  return () => {
    if (timer) clearTimeout(timer);
  };
}

export async function startSqsWorker(): Promise<void> {
  if (!env.SQS_PDF_QUEUE_URL) {
    logger.info("SQS_PDF_QUEUE_URL not provided, worker will not start");
    return;
  }

  logger.info({ queue: env.SQS_PDF_QUEUE_URL }, "Starting SQS worker loop");

  while (true) {
    try {
      const receiveCmd = new ReceiveMessageCommand({
        QueueUrl: env.SQS_PDF_QUEUE_URL,
        MaxNumberOfMessages: MAX_MESSAGES,
        WaitTimeSeconds: MAX_RECEIVE_WAIT,
        VisibilityTimeout: VISIBILITY_TIMEOUT_SECONDS,
      });

      const data = await sqsClient.send(receiveCmd);

      if (!data.Messages || data.Messages.length === 0) {
        continue;
      }

      await Promise.allSettled(
        data.Messages.map((msg) => processMessage(msg)),
      );
    } catch (err) {
      logger.error({ err }, "Error in SQS worker receive loop");
      await sleep(5000);
    }
  }
}

async function processMessage(msg: { Body?: string; ReceiptHandle?: string; MessageId?: string }): Promise<void> {
  if (!msg.Body || !msg.ReceiptHandle) {
    return;
  }

  try {
    const payload = JSON.parse(msg.Body);

    if (payload.type === "generate_pdf") {
      await processPdfJob(payload, msg.ReceiptHandle);
    } else {
      logger.warn({ messageId: msg.MessageId, payload, event: "sqs.unknown_message_type" }, "Unknown SQS message type");
      await deleteMessage(msg.ReceiptHandle);
      return;
    }

    await deleteMessage(msg.ReceiptHandle);
  } catch (err) {
    logger.error({ err, messageId: msg.MessageId, event: "sqs.process_failed" }, "Failed to process SQS message");
  }
}

async function processPdfJob(payload: any, receiptHandle: string): Promise<void> {
  const { roomId, orgId, userId, jobId: payloadJobId } = payload;
  const queueUrl = env.SQS_PDF_QUEUE_URL;

  const jobId = payloadJobId ?? receiptHandle;
  const startedAt = Date.now();
  const aborted = { aborted: false };

  const heartbeatCleanup = await startVisibilityHeartbeat(queueUrl!, receiptHandle, aborted);

  try {
    // 1. Idempotency
    const [existing] = await db
      .select()
      .from(pdfJobs)
      .where(eq(pdfJobs.jobId, jobId))
      .limit(1);

    if (existing) {
      if (existing.status === "completed") {
        logger.info({ jobId, roomId, event: "sqs.pdf_already_completed" }, "PDF job already completed, skipping");
        return;
      }

      if (existing.status === "failed") {
        const attempts = existing.attempts || 0;
        if (attempts >= (existing.maxAttempts || 3)) {
          logger.warn({ jobId, roomId, attempts, event: "sqs.pdf_max_attempts_exceeded" }, "PDF job exceeded max attempts");
          return;
        }
        await db
          .update(pdfJobs)
          .set({ status: "pending", attempts: attempts + 1, updatedAt: new Date() })
          .where(eq(pdfJobs.jobId, jobId));
      }

      if (existing.status === "processing") {
        logger.info({ jobId, roomId, event: "sqs.pdf_already_processing" }, "PDF job already being processed, skipping duplicate");
        return;
      }
    } else {
      await db.insert(pdfJobs).values({
        jobId,
        roomId,
        orgId,
        userId,
        status: "pending",
        attempts: 1,
        maxAttempts: 3,
      });
    }

    // 2. Mark processing
    await db
      .update(pdfJobs)
      .set({ status: "processing", updatedAt: new Date() })
      .where(eq(pdfJobs.jobId, jobId));

    const user = await findUserById(userId);
    if (!user) {
      throw new Error(`User not found for PDF job: ${userId}`);
    }

    logger.info({ roomId, orgId, userId, jobId, event: "sqs.pdf_started" }, "Processing generate_pdf job");

    // 3. Generate PDF with timeout
    const pdfBuffer = await Promise.race([
      generateVerificationReportPdf(roomId, orgId, user),
      new Promise<Buffer>((_, reject) =>
        setTimeout(() => reject(new Error("PDF generation timed out")), PDF_GENERATION_TIMEOUT_MS),
      ),
    ]);
    logger.info(
      { roomId, size: pdfBuffer.length, jobId, durationMs: Date.now() - startedAt, event: "sqs.pdf_generated" },
      "PDF generated successfully",
    );

    // 4. Upload to S3
    const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
    const s3Key = `reports/${orgId}/${roomId}/${timestamp}.pdf`;

    await s3.send(
      new PutObjectCommand({
        Bucket: env.S3_BUCKET,
        Key: s3Key,
        Body: pdfBuffer,
        ContentType: "application/pdf",
        CacheControl: "private, max-age=3600",
      }),
    );

    const s3Url = buildPublicUrl(s3Key);
    logger.info({ s3Key, s3Url, jobId, durationMs: Date.now() - startedAt, event: "sqs.pdf_uploaded" }, "PDF uploaded to S3");

    // 5. Mark completed
    await db
      .update(pdfJobs)
      .set({
        status: "completed",
        s3Key,
        s3Url,
        completedAt: new Date(),
        updatedAt: new Date(),
      })
      .where(eq(pdfJobs.jobId, jobId));

    // 6. Deliver to user (non-blocking side effects)
    deliverReportToUser(userId, orgId, roomId, jobId, s3Url, user).catch((deliverErr) => {
      logger.error({ err: deliverErr, jobId, event: "sqs.pdf_delivery_failed" }, "Failed to deliver report to user, but PDF is ready");
    });

    logger.info({ jobId, durationMs: Date.now() - startedAt, event: "sqs.pdf_completed" }, "PDF job completed successfully");
  } catch (err) {
    logger.error({ err, roomId, jobId, durationMs: Date.now() - startedAt, event: "sqs.pdf_failed" }, "Error processing PDF job");

    const [job] = await db
      .select()
      .from(pdfJobs)
      .where(eq(pdfJobs.jobId, jobId))
      .limit(1);

    if (job) {
      const newAttempts = (job.attempts || 0) + 1;
      const newStatus = newAttempts >= (job.maxAttempts || 3) ? "failed" : "pending";
      const errorMessage = err instanceof Error ? err.message : "Unknown error";

      await db
        .update(pdfJobs)
        .set({
          status: newStatus,
          attempts: newAttempts,
          errorMessage,
          updatedAt: new Date(),
        })
        .where(eq(pdfJobs.jobId, jobId));

      if (newStatus === "failed") {
        await notificationService.createNotification({
          userId,
          organizationId: orgId,
          type: "report_failed",
          title: "Report Generation Failed",
          message: `Your event report for room ${roomId} could not be generated after ${newAttempts} attempts. Please try again.`,
          metadata: { roomId, error: errorMessage, jobId },
        });
      }
    }

    throw err;
  } finally {
    aborted.aborted = true;
    heartbeatCleanup();
  }
}

async function deliverReportToUser(
  userId: string,
  orgId: string,
  roomId: string,
  jobId: string,
  s3Url: string,
  user: { id: string; email?: string | null; [key: string]: any },
): Promise<void> {
  await notificationService.createNotification({
    userId,
    organizationId: orgId,
    type: "report_ready",
    title: "Report Ready",
    message: `Your event report for room ${roomId} is ready for download.`,
    metadata: { roomId, s3Url, jobId },
  });

  const userEmail = user.email;
  if (!userEmail) {
    logger.warn({ userId, jobId }, "User has no email, skipping report email delivery");
    return;
  }

  await dispatchEmail({
    userId,
    recipientEmail: userEmail,
    type: "report-ready",
    payload: { s3Url, roomLabel: roomId },
  });
}

async function deleteMessage(receiptHandle: string): Promise<void> {
  try {
    await sqsClient.send(
      new DeleteMessageCommand({
        QueueUrl: env.SQS_PDF_QUEUE_URL,
        ReceiptHandle: receiptHandle,
      }),
    );
  } catch (err) {
    logger.error({ err, receiptHandle }, "Failed to delete SQS message");
  }
}

// ─── Email delivery queue ───────────────────────────────────────────────
// Separate polling loop from the PDF worker above — different queue, no PDF
// job-style visibility heartbeat needed (email sends are seconds, not
// minutes). Retry/backoff authority is SQS's own redelivery + redrive
// policy: on failure the message is simply left undeleted so it becomes
// visible again after the queue's visibility timeout; after the queue's
// maxReceiveCount is exceeded, SQS's redrive policy moves it to the DLQ,
// which dlq-consumer.ts drains and marks FAILED.
//
// IMPORTANT (deployment note): src/workers/email.lambda.ts is an older,
// Lambda-based consumer for this same queue with a different message shape
// ({type,email,token} vs this loop's {deliveryId}) and no DB access, so it
// cannot honor the idempotency/delivery-tracking this ticket requires. If
// that Lambda's SQS trigger is still wired to SQS_QUEUE_URL in AWS infra, it
// must be detached — otherwise both consumers race the same queue and a
// message can be double-processed.
const EMAIL_MAX_MESSAGES = 5;
const EMAIL_RECEIVE_WAIT_SECONDS = 20;
const EMAIL_VISIBILITY_TIMEOUT_SECONDS = 60;

export async function startEmailSqsWorker(): Promise<void> {
  if (!env.SQS_QUEUE_URL) {
    logger.info("SQS_QUEUE_URL not provided, email worker will not start");
    return;
  }

  logger.info({ queue: env.SQS_QUEUE_URL }, "Starting email SQS worker loop");

  while (true) {
    try {
      const data = await sqsClient.send(
        new ReceiveMessageCommand({
          QueueUrl: env.SQS_QUEUE_URL,
          MaxNumberOfMessages: EMAIL_MAX_MESSAGES,
          WaitTimeSeconds: EMAIL_RECEIVE_WAIT_SECONDS,
          VisibilityTimeout: EMAIL_VISIBILITY_TIMEOUT_SECONDS,
        }),
      );

      if (!data.Messages || data.Messages.length === 0) continue;

      await Promise.allSettled(data.Messages.map((msg) => processEmailMessage(msg)));
    } catch (err) {
      logger.error({ err }, "Error in email SQS worker receive loop");
      await sleep(5000);
    }
  }
}

async function processEmailMessage(msg: { Body?: string; ReceiptHandle?: string; MessageId?: string }): Promise<void> {
  if (!msg.Body || !msg.ReceiptHandle) return;

  try {
    const payload = JSON.parse(msg.Body);
    if (!payload.deliveryId) {
      logger.warn({ messageId: msg.MessageId, payload, event: "email_sqs.malformed_message" }, "Email message missing deliveryId — dropping");
      await deleteEmailMessage(msg.ReceiptHandle);
      return;
    }

    await attemptEmailDelivery(payload.deliveryId);
    // Only delete on success — a thrown error above leaves the message for
    // SQS to redeliver per the queue's own visibility timeout/redrive policy.
    await deleteEmailMessage(msg.ReceiptHandle);
  } catch (err) {
    logger.error({ err, messageId: msg.MessageId, event: "email_sqs.process_failed" }, "Email delivery attempt failed — leaving message for retry");
  }
}

async function deleteEmailMessage(receiptHandle: string): Promise<void> {
  try {
    await sqsClient.send(
      new DeleteMessageCommand({
        QueueUrl: env.SQS_QUEUE_URL,
        ReceiptHandle: receiptHandle,
      }),
    );
  } catch (err) {
    logger.error({ err, receiptHandle }, "Failed to delete email SQS message");
  }
}