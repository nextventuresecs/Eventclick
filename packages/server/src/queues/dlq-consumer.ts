import {
  SQSClient,
  ReceiveMessageCommand,
  DeleteMessageCommand,
} from "@aws-sdk/client-sqs";
import { logger } from "../utils/logger";
import { markEmailDeliveryFailed } from "../services/email-delivery.service";

const sqsClient = new SQSClient({
  region: process.env.AWS_REGION || "ap-south-1",
  useQueueUrlAsEndpoint: true,
});

const DLQ_URL = process.env.SQS_DLQ_URL;
const MAX_MESSAGES = 10;
const WAIT_TIME_SECONDS = 20;
const VISIBILITY_TIMEOUT = 30;

async function drainDlq(): Promise<void> {
  if (!DLQ_URL) {
    logger.warn({ event: "dlq.skip" }, "SQS_DLQ_URL not configured, DLQ drain will not run");
    return;
  }

  logger.info({ dlqUrl: DLQ_URL, event: "dlq.drain_start" }, "Starting DLQ drain");

  while (true) {
    const received = await sqsClient.send(
      new ReceiveMessageCommand({
        QueueUrl: DLQ_URL,
        MaxNumberOfMessages: MAX_MESSAGES,
        WaitTimeSeconds: WAIT_TIME_SECONDS,
        VisibilityTimeout: VISIBILITY_TIMEOUT,
      }),
    );

    const messages = received.Messages || [];
    if (messages.length === 0) {
      logger.info({ event: "dlq.drain_complete" }, "DLQ drain complete — no more messages");
      break;
    }

    logger.info({ messageCount: messages.length, event: "dlq.received_batch" }, "Received DLQ batch");

    for (const msg of messages) {
      if (!msg.Body || !msg.ReceiptHandle) {
        continue;
      }

      try {
        const payload = JSON.parse(msg.Body);

        await logger.error(
          {
            event: "dlq.message",
            messageId: msg.MessageId,
            receiptHandle: msg.ReceiptHandle,
            payload,
            deadLetterSource: payload.sourceQueue || "unknown",
          },
          "DLQ message received",
        );

        if (payload.type === "generate_pdf") {
          await handleFailedPdfJob(payload, msg.MessageId);
        } else if (payload.deliveryId) {
          await handleFailedEmailDelivery(payload, msg.MessageId);
        }

        await sqsClient.send(
          new DeleteMessageCommand({
            QueueUrl: DLQ_URL,
            ReceiptHandle: msg.ReceiptHandle,
          }),
        );
      } catch (err) {
        logger.error({ err, messageId: msg.MessageId, event: "dlq.process_failed" }, "Failed to process DLQ message");
      }
    }
  }
}

async function handleFailedEmailDelivery(payload: any, messageId?: string): Promise<void> {
  const { deliveryId } = payload;

  logger.error(
    { event: "dlq.email_failed_permanently", deliveryId, messageId },
    "Email delivery permanently failed after exceeding the queue's redrive policy",
  );

  await markEmailDeliveryFailed(deliveryId, "Exceeded max receive count — moved to DLQ").catch((err) => {
    logger.error({ err, deliveryId }, "Failed to mark email delivery as FAILED after DLQ handling");
  });
}

async function handleFailedPdfJob(payload: any, messageId?: string): Promise<void> {
  const { roomId, orgId, userId, jobId } = payload;

  logger.error(
    {
      event: "dlq.pdf_failed_permanently",
      jobId,
      roomId,
      orgId,
      userId,
      messageId,
    },
    "PDF job permanently failed after max retries — requires manual intervention",
  );
}

export async function runDlqDrainOnce(): Promise<void> {
  await drainDlq();
}

export async function runDlqDrainLoop(intervalMs = 300_000): Promise<void> {
  logger.info({ intervalMs, event: "dlq.loop_start" }, "Starting DLQ drain loop");
  await drainDlq();
  setInterval(async () => {
    await drainDlq();
  }, intervalMs);
}

// Lambda handler entry point
export const handler = async (_event: unknown): Promise<{ statusCode: number; body: string }> => {
  try {
    await drainDlq();
    return {
      statusCode: 200,
      body: JSON.stringify({ message: "DLQ drain complete" }),
    };
  } catch (err) {
    logger.error({ err, event: "dlq.lambda_failed" }, "DLQ Lambda failed");
    return {
      statusCode: 500,
      body: JSON.stringify({ error: "DLQ drain failed" }),
    };
  }
};
