import { SQSClient, SendMessageCommand } from "@aws-sdk/client-sqs";
import { env } from "../config/env";
import { logger } from "../utils/logger";
import { sendVerificationEmail, sendPasswordResetEmail, sendReportReadyEmail } from "../services/email.service";
import crypto from "crypto";

const region = env.AWS_REGION || "ap-south-1";

// Never pass S3_ACCESS_KEY/S3_SECRET_KEY here — those are R2/MinIO creds,
// not AWS IAM creds, and silently override the default provider chain,
// causing InvalidClientTokenId against real AWS SQS.
// Let the SDK default chain resolve creds via IMDS (EventclickEC2Role).
export const sqsClient = new SQSClient({
  region,
  useQueueUrlAsEndpoint: true,
});

export interface EmailJobPayload {
  type: "verification" | "reset-password";
  email: string;
  token: string;
}

export async function enqueueEmail(payload: EmailJobPayload): Promise<void> {
  const queueUrl = env.SQS_QUEUE_URL;

  if (!queueUrl) {
    // Local development fallback: Send email synchronously using the mock/direct services
    logger.info(
      { payload, event: "sqs.fallback_email" },
      "SQS Queue URL not configured. Falling back to direct email service."
    );
    if (payload.type === "verification") {
      await sendVerificationEmail(payload.email, payload.token);
    } else {
      await sendPasswordResetEmail(payload.email, payload.token);
    }
    return;
  }

  try {
    const command = new SendMessageCommand({
      QueueUrl: queueUrl,
      MessageBody: JSON.stringify(payload),
    });

    const response = await sqsClient.send(command);
    logger.info(
      { messageId: response.MessageId, email: payload.email, type: payload.type, event: "sqs.enqueue_success" },
      "Successfully enqueued email task to AWS SQS"
    );
  } catch (error) {
    logger.error(
      { error, email: payload.email, type: payload.type, event: "sqs.enqueue_failed" },
      "Failed to enqueue email task to AWS SQS"
    );
    // In production we should throw to let the API caller handle it
    throw error;
  }
}

export interface PdfJobPayload {
  roomId: string;
  orgId: string;
  userId: string;
}

export async function enqueuePdfJob(payload: PdfJobPayload): Promise<{ jobId: string }> {
  const queueUrl = env.SQS_PDF_QUEUE_URL;
  const jobId = `pdf_${crypto.randomUUID()}`;

  if (!queueUrl) {
    logger.warn({ event: "sqs.pdf_queue_missing" }, 
      "SQS_PDF_QUEUE_URL not configured, PDF job will not be queued");
    return { jobId };
  }

  try {
    const command = new SendMessageCommand({
      QueueUrl: queueUrl,
      MessageBody: JSON.stringify({ type: "generate_pdf", jobId, ...payload }),
    });

    const response = await sqsClient.send(command);
    logger.info(
      { messageId: response.MessageId, roomId: payload.roomId, jobId, event: "sqs.enqueue_pdf_success" },
      "Successfully enqueued PDF task to AWS SQS"
    );
    return { jobId };
  } catch (error) {
    logger.error(
      { error, roomId: payload.roomId, jobId, event: "sqs.enqueue_pdf_failed" },
      "Failed to enqueue PDF task to AWS SQS"
    );
    throw error;
  }
}