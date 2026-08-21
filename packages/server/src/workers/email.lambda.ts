import { SQSEvent, SQSHandler } from "aws-lambda";
import { sendVerificationEmail, sendPasswordResetEmail } from "../services/email.service";
import { logger } from "../utils/logger";

/**
 * SUPERSEDED — do not wire this Lambda's trigger to SQS_QUEUE_URL anymore.
 *
 * The email queue's consumer is now the `startEmailSqsWorker` loop in
 * queues/worker.ts. That loop is idempotent (checks a delivery-tracking row
 * before sending) and message bodies are now `{ deliveryId }`, not the
 * `{ type, email, token }` shape this handler expects — this handler also
 * has no database access, so it structurally cannot check that row even if
 * the message shape were updated.
 *
 * If this function's SQS trigger is still attached to SQS_QUEUE_URL in AWS
 * infra, detach it: two consumers polling the same queue means a message
 * can be processed by both, defeating the idempotency the worker loop
 * provides. Left in place (rather than deleted) in case deployment tooling
 * references this handler path directly — kept functional against the old
 * message shape for anyone who hasn't migrated the trigger yet, but it
 * should not receive traffic once the worker loop is deployed.
 */
export const handler: SQSHandler = async (event: SQSEvent) => {
  logger.info({ recordCount: event.Records.length }, "Triggered Email Lambda via SQS");

  for (const record of event.Records) {
    try {
      const payload = JSON.parse(record.body);
      logger.info(
        { messageId: record.messageId, type: payload.type, email: payload.email },
        "Processing SQS email record"
      );

      if (payload.type === "verification") {
        await sendVerificationEmail(payload.email, payload.token);
      } else if (payload.type === "reset-password") {
        await sendPasswordResetEmail(payload.email, payload.token);
      } else {
        logger.error({ payload }, "Unknown email job type received");
      }
    } catch (err) {
      logger.error(
        { err, recordId: record.messageId },
        "Error processing SQS record"
      );
      // Re-throw so SQS retries the message if needed (or goes to DLQ)
      throw err;
    }
  }
};
