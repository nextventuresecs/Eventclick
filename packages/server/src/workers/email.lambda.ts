import { SQSEvent, SQSHandler } from "aws-lambda";
import { sendVerificationEmail, sendPasswordResetEmail } from "../services/email.service";
import { logger } from "../utils/logger";

/**
 * AWS Lambda SQS Trigger Handler for processing asynchronous email jobs.
 * 
 * NOTE: Ensure the following environment variables are set in the Lambda function's configuration:
 * - RESEND_API_KEY
 * - RESEND_FROM_EMAIL
 * - APP_URL (used for reset/verification links)
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
