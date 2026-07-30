import { SQSClient, ReceiveMessageCommand, DeleteMessageCommand } from "@aws-sdk/client-sqs";
import { env } from "../config/env";
import { logger } from "../utils/logger";
import { generateVerificationReportPdf } from "../services/report.service";
import { findUserById } from "../services/auth.service";

const sqsClient = new SQSClient({
  region: env.S3_REGION || "us-east-1",
  credentials: env.S3_ACCESS_KEY && env.S3_SECRET_KEY
    ? { accessKeyId: env.S3_ACCESS_KEY, secretAccessKey: env.S3_SECRET_KEY }
    : undefined,
});

export async function startSqsWorker() {
  if (!env.SQS_QUEUE_URL) {
    logger.info("SQS_QUEUE_URL not provided, worker will not start");
    return;
  }

  logger.info({ queue: env.SQS_QUEUE_URL }, "Starting SQS worker loop");

  while (true) {
    try {
      const receiveCmd = new ReceiveMessageCommand({
        QueueUrl: env.SQS_QUEUE_URL,
        MaxNumberOfMessages: 5,
        WaitTimeSeconds: 20,
      });

      const data = await sqsClient.send(receiveCmd);

      if (data.Messages && data.Messages.length > 0) {
        for (const msg of data.Messages) {
          if (!msg.Body) continue;

          let payload;
          try {
            payload = JSON.parse(msg.Body);
          } catch (e) {
            logger.error({ error: e, body: msg.Body }, "Failed to parse SQS message body");
            continue;
          }

          if (payload.type === "generate_pdf") {
            const { roomId, orgId, userId } = payload;
            try {
              const user = await findUserById(userId);
              if (!user) {
                logger.error({ userId }, "User not found for PDF job");
                continue;
              }
              logger.info({ roomId, orgId, userId }, "Processing generate_pdf job");
              
              const pdfBuffer = await generateVerificationReportPdf(roomId, orgId, user);
              logger.info({ roomId, size: pdfBuffer.length }, "PDF generated successfully via SQS worker");
              
            } catch (err) {
              logger.error({ err, roomId }, "Error generating PDF in worker");
            }
          }

          const deleteCmd = new DeleteMessageCommand({
            QueueUrl: env.SQS_QUEUE_URL,
            ReceiptHandle: msg.ReceiptHandle,
          });
          await sqsClient.send(deleteCmd);
        }
      }
    } catch (err) {
      logger.error({ err }, "Error in SQS worker receive loop");
      await new Promise(res => setTimeout(res, 5000));
    }
  }
}
