import { logger } from "../utils/logger";

export const sendPasswordResetEmail = async (email: string, token: string): Promise<void> => {
  // In a real production setup, we would integrate an email delivery provider like SES, Resend, or SendGrid.
  // For development and local testing, we output the reset link directly to the logs for ease of use.
  const resetLink = `http://localhost:5173/reset-password?token=${token}`;

  logger.info(
    { email, token, resetLink, event: "email.password_reset" },
    `\n======================================================\n[EMAIL MOCK] Password Reset Requested\nTo: ${email}\nReset Link: ${resetLink}\n======================================================\n`,
  );
};
