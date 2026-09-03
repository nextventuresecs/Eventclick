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

export const sendInviteEmail = async (
  email: string,
  token: string,
  orgName: string,
): Promise<void> => {
  // Same underlying token/link as sendVerificationEmail — clicking it both
  // verifies the email and logs the invitee in (see verifyEmailToken). If
  // the admin didn't set a password for them, the verify-email page then
  // prompts for one; this template stays generic rather than branching on
  // that, since it has no way to know which case applies at send time.
  const verifyLink = `${env.APP_URL}/verify-email?token=${token}`;

  if (resend) {
    const { error } = await resend.emails.send({
      from: env.RESEND_FROM_EMAIL,
      to: email,
      subject: `You've been invited to join ${orgName} on Eventclick`,
      html: `
          <h1>You're invited</h1>
          <p>You've been added to <strong>${orgName}</strong> on Eventclick.</p>
          <p>Click the link below to verify your email and finish setting up your account:</p>
          <p><a href="${verifyLink}">${verifyLink}</a></p>
          <p>If you weren't expecting this, you can safely ignore this email.</p>
        `,
    });

    if (error) {
      logger.error({ email, orgName, error, event: "email.invite_failed" }, "Failed to send invite email");
      throw error;
    }
    logger.info({ email, orgName, event: "email.invite_sent" }, "Invite email sent via Resend");
  } else {
    logger.info(
      { email, token, orgName, verifyLink, event: "email.invite" },
      `[EMAIL MOCK] Invite Sent\nTo: ${email}\nOrg: ${orgName}\nVerify Link: ${verifyLink}`,
    );
  }
};

export const sendEventStartedEmail = async (
  email: string,
  roomTitle: string,
  watchUrl: string,
): Promise<void> => {
  if (resend) {
    const { error } = await resend.emails.send({
      from: env.RESEND_FROM_EMAIL,
      to: email,
      subject: `"${roomTitle}" is now live`,
      html: `
          <h1>Your event has started</h1>
          <p><strong>${roomTitle}</strong> is now live.</p>
          <p><a href="${watchUrl}">Join the stream</a></p>
        `,
    });

    if (error) {
      logger.error({ email, roomTitle, error, event: "email.event_started_failed" }, "Failed to send event-started email");
      throw error;
    }
    logger.info({ email, roomTitle, event: "email.event_started_sent" }, "Event-started email sent via Resend");
  } else {
    logger.info(
      { email, roomTitle, watchUrl, event: "email.event_started" },
      `[EMAIL MOCK] Event Started Sent\nTo: ${email}\nRoom: ${roomTitle}\nWatch Link: ${watchUrl}`,
    );
  }
};

export const sendEventEndedEmail = async (
  email: string,
  roomTitle: string,
  recordingUrl?: string,
  summaryUrl?: string,
): Promise<void> => {
  // recordingUrl/summaryUrl are omitted, not stubbed, when not yet available
  // (e.g. egress upload still processing at stopLive time) — see
  // services/event-lifecycle-notification.service.ts::notifyEventEnded.
  const links = [
    recordingUrl ? `<p><a href="${recordingUrl}">Watch the recording</a></p>` : "",
    summaryUrl ? `<p><a href="${summaryUrl}">View the event summary</a></p>` : "",
  ].join("");
  const linksFallback = links || "<p>The recording will be available soon — check back later.</p>";

  if (resend) {
    const { error } = await resend.emails.send({
      from: env.RESEND_FROM_EMAIL,
      to: email,
      subject: `"${roomTitle}" has ended`,
      html: `
          <h1>Your event has ended</h1>
          <p><strong>${roomTitle}</strong> has finished.</p>
          ${linksFallback}
        `,
    });

    if (error) {
      logger.error({ email, roomTitle, error, event: "email.event_ended_failed" }, "Failed to send event-ended email");
      throw error;
    }
    logger.info({ email, roomTitle, event: "email.event_ended_sent" }, "Event-ended email sent via Resend");
  } else {
    logger.info(
      { email, roomTitle, recordingUrl, summaryUrl, event: "email.event_ended" },
      `[EMAIL MOCK] Event Ended Sent\nTo: ${email}\nRoom: ${roomTitle}\nRecording: ${recordingUrl ?? "(not yet available)"}`,
    );
  }
};

/**
 * Escapes text destined for an HTML email body. Every other sender in this
 * file interpolates values the system itself produced (room titles, signed
 * URLs, tokens); a broadcast interpolates free text an admin typed, which
 * reaches every member of their organisation. Without escaping, an admin
 * could put markup — or a link wearing someone else's name — into all of it.
 */
const escapeHtml = (value: string): string =>
  value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");

export const sendOrgBroadcastEmail = async (
  email: string,
  title: string,
  body: string,
  orgName: string,
  priority: "normal" | "urgent" = "normal",
): Promise<void> => {
  const safeTitle = escapeHtml(title);
  // Author-entered newlines are the only formatting a broadcast carries, so
  // they survive as <br>; everything else is escaped first.
  const safeBody = escapeHtml(body).replace(/\n/g, "<br>");
  const safeOrg = escapeHtml(orgName);
  const subject = priority === "urgent" ? `[Urgent] ${title}` : title;

  if (resend) {
    const { error } = await resend.emails.send({
      from: env.RESEND_FROM_EMAIL,
      to: email,
      subject,
      html: `
          <h1>${safeTitle}</h1>
          <p>${safeBody}</p>
          <hr>
          <p style="color:#667085;font-size:12px">Sent to all members of ${safeOrg} on Eventclick.</p>
        `,
    });

    if (error) {
      logger.error({ email, priority, error, event: "email.org_broadcast_failed" }, "Failed to send org-broadcast email");
      throw error;
    }
    logger.info({ email, priority, event: "email.org_broadcast_sent" }, "Org-broadcast email sent via Resend");
  } else {
    logger.info(
      { email, title, priority, event: "email.org_broadcast" },
      `[EMAIL MOCK] Org Broadcast Sent\nTo: ${email}\nOrg: ${orgName}\nPriority: ${priority}\nTitle: ${title}\n\n${body}`,
    );
  }
};
