import { Resend } from "resend";
import { logger } from "../utils/logger";
import { env } from "../config/env";

const resend = env.RESEND_API_KEY ? new Resend(env.RESEND_API_KEY) : null;

export const sendPasswordResetEmail = async (
  email: string,
  token: string,
): Promise<void> => {
  const resetLink = `${env.APP_URL}/reset-password?token=${token}`;

  if (resend) {
    // Deliberately no try/catch here: a caller relying on this to throw
    // (the SQS-backed dispatcher's retry/DLQ path) needs the error to
    // propagate. Swallowing it here previously meant SQS/Lambda always saw
    // "success" even on a real Resend failure, so retry could never engage.
    const { error } = await resend.emails.send({
      from: env.RESEND_FROM_EMAIL,
      to: email,
      subject: "Reset your Eventclick password",
      html: `
          <h1>Password Reset</h1>
          <p>You requested a password reset for your Eventclick account.</p>
          <p>Please click the link below to set a new password:</p>
          <p><a href="${resetLink}">${resetLink}</a></p>
          <p>If you did not request this, you can safely ignore this email.</p>
        `,
    });

    if (error) {
      logger.error({ email, error, event: "email.password_reset_failed" }, "Failed to send password reset email");
      throw error;
    }
    logger.info(
      { email, event: "email.password_reset_sent" },
      "Password reset email sent via Resend",
    );
  } else {
    logger.info(
      { email, token, resetLink, event: "email.password_reset" },
      `[EMAIL MOCK] Password Reset Requested\nTo: ${email}\nReset Link: ${resetLink}`,
    );
  }
};

export const sendReportReadyEmail = async (
  email: string,
  s3Url: string,
  roomLabel: string,
): Promise<void> => {
  const downloadLink = s3Url;

  if (resend) {
    const { error } = await resend.emails.send({
      from: env.RESEND_FROM_EMAIL,
      to: email,
      subject: `Your Event Report is Ready — ${roomLabel}`,
      html: `
          <h1>Report Ready</h1>
          <p>Your event report for <strong>${roomLabel}</strong> has been generated successfully.</p>
          <p><a href="${downloadLink}">Download Report</a></p>
          <p>This link will expire in 1 hour.</p>
        `,
    });

    if (error) {
      logger.error({ email, roomLabel, error, event: "email.report_ready_failed" }, "Failed to send report ready email");
      throw error;
    }
    logger.info(
      { email, roomLabel, event: "email.report_ready_sent" },
      "Report ready email sent via Resend",
    );
  } else {
    logger.info(
      { email, roomLabel, s3Url, event: "email.report_ready" },
      `[EMAIL MOCK] Report Ready\nTo: ${email}\nDownload: ${s3Url}`,
    );
  }
};

export const sendVerificationEmail = async (
  email: string,
  token: string,
): Promise<void> => {
  const verifyLink = `${env.APP_URL}/verify-email?token=${token}`;

  if (resend) {
    const { error } = await resend.emails.send({
      from: env.RESEND_FROM_EMAIL,
      to: email,
      subject: "Verify your Eventclick account",
      html: `
          <h1>Verify Your Email</h1>
          <p>Thank you for registering with Eventclick.</p>
          <p>Please click the link below to verify your email address and activate your account:</p>
          <p><a href="${verifyLink}">${verifyLink}</a></p>
          <p>If you did not register for an account, you can safely ignore this email.</p>
        `,
    });

    if (error) {
      logger.error({ email, error, event: "email.verification_failed" }, "Failed to send verification email");
      throw error;
    }
    logger.info(
      { email, event: "email.verification_sent" },
      "Verification email sent via Resend",
    );
  } else {
    logger.info(
      { email, token, verifyLink, event: "email.verification" },
      `[EMAIL MOCK] Email Verification Sent\nTo: ${email}\nVerify Link: ${verifyLink}`,
    );
  }
};