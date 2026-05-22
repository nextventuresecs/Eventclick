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
    try {
      await resend.emails.send({
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
      logger.info(
        { email, event: "email.password_reset_sent" },
        "Password reset email sent via Resend",
      );
    } catch (error) {
      logger.error(
        { email, error, event: "email.password_reset_failed" },
        "Failed to send password reset email",
      );
    }
  } else {
    // Fallback for local development when Resend is not configured
    logger.info(
      { email, token, resetLink, event: "email.password_reset" },
      `\n======================================================\n[EMAIL MOCK] Password Reset Requested\nTo: ${email}\nReset Link: ${resetLink}\n======================================================\n`,
    );
  }
};
