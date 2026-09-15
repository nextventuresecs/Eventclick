import {
  ReceiveMessageCommand,
  DeleteMessageCommand,
  ChangeMessageVisibilityCommand,
} from "@aws-sdk/client-sqs";
import { PutObjectCommand } from "@aws-sdk/client-s3";
import { env } from "../config/env";
import { logger } from "../utils/logger";
import { generateVerificationReportPdf } from "../services/report.service";
import { PDF_ASYNC_RENDER_TIMEOUT_MS } from "../config/constants";
import { findUserById } from "../services/auth";
import { db } from "../db";
import { runInBackgroundTenantContext } from "../db/backgroundTenantContext";
import { pdfJobs } from "../db/schema";
import { and, eq } from "drizzle-orm";
import { notificationService } from "../services/notification.service";
import { s3, buildPublicUrl } from "../services/storage.service";
import { dispatchEmail, attemptEmailDelivery, EMAIL_CLAIM_LEASE_SECONDS } from "../services/email-delivery.service";
import { notifyReportGenerated } from "../services/report-notification.service";
import { recordAuditSafely } from "../services/audit.service";
import { sqsClient } from "./sqs.client";
import { decidePdfJobClaim, type PdfJobClaim } from "./pdfJobClaim";

// SQS client is now the single shared instance from sqs.client.ts.
// Do NOT construct a second SQSClient here — a prior duplicate with an
// S3_ACCESS_KEY/S3_SECRET_KEY credentials override caused InvalidClientTokenId
// against real AWS SQS. One client, one config, one place to fix.

const VISIBILITY_TIMEOUT_SECONDS = 300;
const MAX_RECEIVE_WAIT = 20;
const MAX_MESSAGES = 5;
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
      const settled = await processPdfJob(payload, msg.ReceiptHandle);
      // Deferred: another worker holds the job. Leave the message; it
      // reappears after the visibility timeout, and after the queue's max
      // receive count it redrives to the DLQ, which fails the job.
      if (!settled) return;
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

async function processPdfJob(payload: any, receiptHandle: string): Promise<boolean> {
  const { roomId, orgId, userId, jobId: payloadJobId } = payload;
  const queueUrl = env.SQS_PDF_QUEUE_URL;

  const jobId = payloadJobId ?? receiptHandle;
  const startedAt = Date.now();
  const aborted = { aborted: false };

  const heartbeatCleanup = await startVisibilityHeartbeat(queueUrl!, receiptHandle, aborted);

  try {
    // pdf_jobs and notifications are RLS-scoped tables (`to: "app_user"`).
    // The SQS worker has no ambient HTTP request to inherit a tenant context
    // from, so every db.* call below needs its own — without it, RLS denies
    // outright (organization_id = NULL matches nothing; an INSERT actually
    // throws a row-security-policy violation rather than silently no-op'ing).
    // Same bug class as jobs/eventStartNotifier.ts / attendanceWindowNotifier.ts
    // before their fix — see db/backgroundTenantContext.ts.
    const claim = await claimPdfJob({ jobId, roomId, orgId, userId });
    if (claim.action === "defer") return false;
    if (claim.action === "skip" || claim.action === "abandon") return true;

    const user = await findUserById(userId);
    if (!user) {
      throw new Error(`User not found for PDF job: ${userId}`);
    }

    logger.info({ roomId, orgId, userId, jobId, event: "sqs.pdf_started" }, "Processing generate_pdf job");

    // 3. Generate PDF with a deadline the renderer actually honours.
    //
    // This was a Promise.race against a timer, which rejected the outer
    // promise while leaving the fetch to Gotenberg running — the render
    // carried on producing a PDF nobody would collect, occupying a renderer
    // queue that is small enough for that to matter. Passing the deadline
    // into the service aborts the request itself.
    //
    // No enclosing HTTP request here, so this keeps the generous deadline: a
    // large report legitimately takes longer than a request should.
    const pdfBuffer = await generateVerificationReportPdf(roomId, orgId, user, {
      timeoutMs: PDF_ASYNC_RENDER_TIMEOUT_MS,
    });
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
    const [completedJob] = await runInBackgroundTenantContext(orgId, userId, async () =>
      db
        .update(pdfJobs)
        .set({
          status: "completed",
          s3Key,
          s3Url,
          completedAt: new Date(),
          updatedAt: new Date(),
        })
        .where(eq(pdfJobs.jobId, jobId))
        .returning(),
    );

    // 6. Deliver to user + fan out REPORT_GENERATED to room staff. Awaited
    // (not fire-and-forget) so both run inside their own tenant context
    // while it's still open — a detached .catch()-only call here would let
    // this function return and release the wrapper's connection out from
    // under an in-flight write, the same bug fixed in
    // event-stream-notification.service.ts's debounced callback. A failure
    // here is still logged and swallowed, not thrown — the PDF itself is
    // already durable in S3 and pdf_jobs regardless of delivery outcome.
    await runInBackgroundTenantContext(orgId, userId, async () => {
      await deliverReportToUser(userId, orgId, roomId, jobId, s3Url, user);
    }).catch((deliverErr) => {
      logger.error({ err: deliverErr, jobId, event: "sqs.pdf_delivery_failed" }, "Failed to deliver report to user, but PDF is ready");
    });

    if (completedJob) {
      await runInBackgroundTenantContext(orgId, userId, async () => {
        await notifyReportGenerated(roomId, orgId, completedJob.id, userId, user.fullName ?? user.email ?? "A team member");
      }).catch((fanOutErr) => {
        logger.error({ err: fanOutErr, jobId, event: "sqs.report_generated_fanout_failed" }, "REPORT_GENERATED fan-out failed, but PDF is ready");
      });

      // Its own tenant context, for the same reason as every other write in
      // this worker: there is no ambient request here, so `db` would fall back
      // to the bare pool with no app.current_tenant set — and audit_logs'
      // insert policy would reject the row. There is no request metadata to
      // record, which is itself accurate: nobody was on the other end.
      await runInBackgroundTenantContext(orgId, userId, async () => {
        await recordAuditSafely({
          organizationId: orgId,
          actorUserId: userId,
          actorEmail: user.email ?? undefined,
          action: "report.generated",
          resourceType: "report",
          resourceId: roomId,
          newValues: { roomId, jobId: completedJob.id, delivery: "async_worker" },
        });
      }).catch((auditErr) => {
        logger.error({ err: auditErr, jobId, event: "sqs.report_audit_failed" }, "Failed to record report.generated audit entry");
      });
    }

    logger.info({ jobId, durationMs: Date.now() - startedAt, event: "sqs.pdf_completed" }, "PDF job completed successfully");
    return true;
  } catch (err) {
    logger.error({ err, roomId, jobId, durationMs: Date.now() - startedAt, event: "sqs.pdf_failed" }, "Error processing PDF job");

    // Own tenant context, separate from whatever failed above — these writes
    // must survive even if the failure happened mid-transaction elsewhere.
    await runInBackgroundTenantContext(orgId, userId, async () => {
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
    }).catch((catchWriteErr) => {
      logger.error({ err: catchWriteErr, jobId, event: "sqs.pdf_failure_tracking_failed" }, "Failed to record PDF job failure");
    });

    throw err;
  } finally {
    aborted.aborted = true;
    heartbeatCleanup();
  }
}

/**
 * Decides and records who processes a PDF job, in the job's tenant context.
 * Returns `defer` when another worker holds the job or wins the claim.
 */
export async function claimPdfJob(job: { jobId: string; roomId: string; orgId: string; userId: string }): Promise<PdfJobClaim> {
  const { jobId, roomId, orgId, userId } = job;
  return runInBackgroundTenantContext(orgId, userId, async (): Promise<PdfJobClaim> => {
    // 1. Idempotency
    const [existing] = await db
      .select()
      .from(pdfJobs)
      .where(eq(pdfJobs.jobId, jobId))
      .limit(1);

    const decision = decidePdfJobClaim(existing, new Date());

    switch (decision.action) {
      case "insert":
        await db.insert(pdfJobs).values({
          jobId,
          roomId,
          orgId,
          userId,
          status: "processing",
          attempts: 1,
          maxAttempts: 3,
        });
        return decision;

      case "skip":
        logger.info({ jobId, roomId, reason: decision.reason, event: "sqs.pdf_skipped" }, "PDF job needs no processing, skipping");
        return decision;

      case "defer":
        logger.info({ jobId, roomId, event: "sqs.pdf_already_processing" }, "PDF job is being processed by another worker, deferring duplicate");
        return decision;

      case "abandon": {
        const [failed] = await db
          .update(pdfJobs)
          .set({ status: "failed", errorMessage: "Worker stopped mid-render and no attempts remain", updatedAt: new Date() })
          .where(and(eq(pdfJobs.jobId, jobId), eq(pdfJobs.status, "processing"), eq(pdfJobs.attempts, decision.attempts)))
          .returning({ id: pdfJobs.id });
        if (!failed) return { action: "defer" } as const;
        logger.warn({ jobId, roomId, attempts: decision.attempts, event: "sqs.pdf_abandoned" }, "Abandoned PDF job has no attempts left, marking failed");
        await notificationService.createNotification({
          userId,
          organizationId: orgId,
          type: "report_failed",
          title: "Report Generation Failed",
          message: `Your event report for room ${roomId} could not be generated after ${decision.attempts} attempts. Please try again.`,
          metadata: { roomId, jobId, error: "worker_stopped" },
        });
        return decision;
      }

      case "retry":
      case "process": {
        // Conditional on status and attempts being as read: the first claim
        // changes one of them, so two workers redelivered the same job
        // cannot both claim it.
        const [claimed] = await db
          .update(pdfJobs)
          .set({
            status: "processing",
            ...(decision.action === "retry" ? { attempts: decision.attempts } : {}),
            updatedAt: new Date(),
          })
          .where(
            and(
              eq(pdfJobs.jobId, jobId),
              eq(pdfJobs.status, existing!.status),
              eq(pdfJobs.attempts, existing!.attempts ?? 0),
            ),
          )
          .returning({ id: pdfJobs.id });
        if (!claimed) return { action: "defer" } as const;
        if (decision.action === "retry" && existing!.status === "processing") {
          logger.warn({ jobId, roomId, attempts: decision.attempts, event: "sqs.pdf_reclaimed" }, "Reclaimed PDF job abandoned mid-render");
        }
        return decision;
      }
    }
  });
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

export async function processEmailMessage(msg: { Body?: string; ReceiptHandle?: string; MessageId?: string }): Promise<void> {
  if (!msg.Body || !msg.ReceiptHandle) return;

  try {
    const payload = JSON.parse(msg.Body);
    if (!payload.deliveryId) {
      logger.warn({ messageId: msg.MessageId, payload, event: "email_sqs.malformed_message" }, "Email message missing deliveryId — dropping");
      await deleteEmailMessage(msg.ReceiptHandle);
      return;
    }

    const outcome = await attemptEmailDelivery(payload.deliveryId);
    if (outcome === "deferred") {
      // Another consumer holds the delivery. Keep the message: if that consumer
      // dies mid-send, this message is what retries it. Hide it until the lease
      // has run out, or it reappears every visibility timeout and each deferral
      // spends one of the queue's receives before the DLQ.
      await deferEmailMessage(msg.ReceiptHandle);
      return;
    }
    // Only delete on success — a thrown error above leaves the message for
    // SQS to redeliver per the queue's own visibility timeout/redrive policy.
    await deleteEmailMessage(msg.ReceiptHandle);
  } catch (err) {
    logger.error({ err, messageId: msg.MessageId, event: "email_sqs.process_failed" }, "Email delivery attempt failed — leaving message for retry");
  }
}

async function deferEmailMessage(receiptHandle: string): Promise<void> {
  try {
    await sqsClient.send(
      new ChangeMessageVisibilityCommand({
        QueueUrl: env.SQS_QUEUE_URL,
        ReceiptHandle: receiptHandle,
        VisibilityTimeout: EMAIL_CLAIM_LEASE_SECONDS,
      }),
    );
  } catch (err) {
    // The message still reappears after the receive's visibility timeout.
    logger.error({ err, receiptHandle }, "Failed to defer email SQS message");
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