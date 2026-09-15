import { Resend } from "resend";
import type { SubmitContactRequestInput } from "@application/shared";
import { logger } from "../utils/logger";
import { env } from "../config/env";
import { renderBrandedEmail } from "../utils/email-template";

const resend = env.RESEND_API_KEY ? new Resend(env.RESEND_API_KEY) : null;

/**
 * Passed through to Resend as its request options.
 *
 * `idempotencyKey`: Resend treats a repeat send with the same key, within 24
 * hours, as the first one and does not deliver it again. The email-delivery
 * queue passes one per delivery row, so a retry after the email already went
 * out (the SENT write failed, or a hung call outlived the claim lease) cannot
 * reach the recipient twice. A repeat with a different body is rejected with
 * 409 invalid_idempotent_request, so a retry must render the same email; the
 * only time-dependent part of the template is the footer year.
 */
export type SendEmailOptions = { idempotencyKey?: string };

/**
 * Escapes text destined for an HTML email body.
 *
 * Applied to every interpolated value, not just admin free text. Room titles
 * and organisation names are user input too — they arrive from a form — so
 * the earlier distinction between "values the system produced" and
 * author-entered text did not hold, and sendEventCancelledEmail was already
 * escaping its title while the started/ended pair was not.
 */
const escapeHtml = (value: string): string =>
  value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");

export const sendPasswordResetEmail = async (
  email: string,
  token: string,
  options?: SendEmailOptions,
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
      html: renderBrandedEmail({
        heading: "Reset your password",
        intro: "You requested a password reset for your Eventclick account.",
        cta: { label: "Set a new password", url: resetLink },
        footnote:
          "If you did not request this, you can safely ignore this email — your password will not change.",
      }),
    }, options);

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
  options?: SendEmailOptions,
): Promise<void> => {
  const downloadLink = s3Url;

  if (resend) {
    const { error } = await resend.emails.send({
      from: env.RESEND_FROM_EMAIL,
      to: email,
      subject: `Your Event Report is Ready — ${roomLabel}`,
      html: renderBrandedEmail({
        heading: "Your report is ready",
        intro: `Your event report for <strong>${escapeHtml(roomLabel)}</strong> has been generated.`,
        cta: { label: "Download report", url: downloadLink },
        footnote: "This link expires in 1 hour.",
      }),
    }, options);

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
  options?: SendEmailOptions,
): Promise<void> => {
  const verifyLink = `${env.APP_URL}/verify-email?token=${token}`;

  if (resend) {
    const { error } = await resend.emails.send({
      from: env.RESEND_FROM_EMAIL,
      to: email,
      subject: "Verify your Eventclick account",
      html: renderBrandedEmail({
        heading: "Verify your email",
        intro:
          "Thanks for registering with Eventclick. Confirm your address to activate your account.",
        cta: { label: "Verify email address", url: verifyLink },
        footnote: "If you did not register for an account, you can safely ignore this email.",
      }),
    }, options);

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
  options?: SendEmailOptions,
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
      html: renderBrandedEmail({
        heading: "You're invited",
        intro: `You've been added to <strong>${escapeHtml(orgName)}</strong> on Eventclick.`,
        bodyHtml:
          '<p style="margin:0;">Verify your email to finish setting up your account.</p>',
        cta: { label: "Accept invitation", url: verifyLink },
        footnote: "If you weren't expecting this, you can safely ignore this email.",
      }),
    }, options);

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
  options?: SendEmailOptions,
): Promise<void> => {
  if (resend) {
    const { error } = await resend.emails.send({
      from: env.RESEND_FROM_EMAIL,
      to: email,
      subject: `"${roomTitle}" is now live`,
      html: renderBrandedEmail({
        heading: "Your event has started",
        intro: `<strong>${escapeHtml(roomTitle)}</strong> is now live.`,
        cta: { label: "Join the stream", url: watchUrl },
      }),
    }, options);

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
  options?: SendEmailOptions,
): Promise<void> => {
  // recordingUrl/summaryUrl are omitted, not stubbed, when not yet available
  // (e.g. egress upload still processing at stopLive time) — see
  // services/event-lifecycle-notification.service.ts::notifyEventEnded.
  const linkRow = 'style="margin:0 0 8px 0;"';
  const linkStyle = 'style="color:#370679;"';
  const links = [
    recordingUrl
      ? `<p ${linkRow}><a href="${recordingUrl}" ${linkStyle}>Watch the recording</a></p>`
      : "",
    summaryUrl
      ? `<p ${linkRow}><a href="${summaryUrl}" ${linkStyle}>View the event summary</a></p>`
      : "",
  ].join("");
  const linksFallback =
    links ||
    '<p style="margin:0;">The recording will be available soon — check back later.</p>';

  if (resend) {
    const { error } = await resend.emails.send({
      from: env.RESEND_FROM_EMAIL,
      to: email,
      subject: `"${roomTitle}" has ended`,
      html: renderBrandedEmail({
        heading: "Your event has ended",
        intro: `<strong>${escapeHtml(roomTitle)}</strong> has finished.`,
        bodyHtml: linksFallback,
      }),
    }, options);

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

export const sendOrgBroadcastEmail = async (
  email: string,
  title: string,
  body: string,
  orgName: string,
  priority: "normal" | "urgent" = "normal",
  options?: SendEmailOptions,
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
      html: renderBrandedEmail({
        heading: safeTitle,
        bodyHtml: `<p style="margin:0;">${safeBody}</p>`,
        footnote: `Sent to all members of ${safeOrg} on Eventclick.`,
      }),
    }, options);

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

export const sendEventCancelledEmail = async (
  email: string,
  roomTitle: string,
  reason: "cancelled" | "expired",
  scheduledStart: string,
  cancellationReason?: string | null,
  options?: SendEmailOptions,
): Promise<void> => {
  const safeTitle = escapeHtml(roomTitle);
  const safeWhen = escapeHtml(scheduledStart);
  // Organiser-entered free text, same treatment as a broadcast body.
  const safeNote = cancellationReason ? escapeHtml(cancellationReason) : null;

  const subject =
    reason === "cancelled" ? `Cancelled: "${roomTitle}"` : `Did not take place: "${roomTitle}"`;
  const lead =
    reason === "cancelled"
      ? `<strong>${safeTitle}</strong>, scheduled for ${safeWhen}, has been cancelled.`
      : `<strong>${safeTitle}</strong> was scheduled for ${safeWhen} and did not take place.`;

  if (resend) {
    const { error } = await resend.emails.send({
      from: env.RESEND_FROM_EMAIL,
      to: email,
      subject,
      html: renderBrandedEmail({
        heading:
          reason === "cancelled" ? "Event cancelled" : "Event did not take place",
        intro: lead,
        bodyHtml: safeNote
          ? `<p style="margin:0;"><strong>Reason given:</strong> ${safeNote}</p>`
          : undefined,
        footnote: "No attendance is required. You do not need to do anything.",
      }),
    }, options);

    if (error) {
      logger.error(
        { email, roomTitle, reason, error, event: "email.event_cancelled_failed" },
        "Failed to send event-cancelled email",
      );
      throw error;
    }
    logger.info({ email, roomTitle, reason, event: "email.event_cancelled_sent" }, "Event-cancelled email sent via Resend");
  } else {
    logger.info(
      { email, roomTitle, reason, cancellationReason, event: "email.event_cancelled" },
      `[EMAIL MOCK] Event ${reason} Sent\nTo: ${email}\nRoom: ${roomTitle}\nWhen: ${scheduledStart}\nNote: ${cancellationReason ?? "(none)"}`,
    );
  }
};

/**
 * Notifies the team of a demo or support request submitted from the marketing
 * site. Every value here is attacker-controlled free text from an
 * unauthenticated form, so all of it goes through escapeHtml — and the
 * submitter's address is set as replyTo rather than from, so a reply reaches
 * them without letting the form choose our sending identity.
 */
export const sendContactRequestEmail = async (
  request: SubmitContactRequestInput,
): Promise<void> => {
  const isDemo = request.kind === "demo";
  const heading = isDemo ? "New demo request" : "New support request";
  const subject = `${heading} — ${request.orgName}`;

  const rows: [string, string | undefined][] = [
    ["Name", request.fullName],
    ["Work email", request.workEmail],
    ["Organisation", request.orgName],
    ["Team size", request.teamSize],
    ["Use case", request.useCase],
    ["Support type", request.supportType],
    ["Context", request.additionalContext],
    [
      "Marketing consent",
      request.consentGiven === undefined ? undefined : request.consentGiven ? "Yes" : "No",
    ],
  ];

  const body = rows
    .filter((entry): entry is [string, string] => Boolean(entry[1]))
    .map(
      ([label, value]) =>
        `<tr><td style="padding:6px 16px 6px 0;color:#667085;font-size:13px;vertical-align:top;">${escapeHtml(label)}</td>` +
        `<td style="padding:6px 0;color:#1D2939;font-size:14px;">${escapeHtml(value)}</td></tr>`,
    )
    .join("");

  if (resend) {
    const { error } = await resend.emails.send({
      from: env.RESEND_FROM_EMAIL,
      to: env.CONTACT_NOTIFY_EMAIL,
      replyTo: request.workEmail,
      subject,
      html: renderBrandedEmail({
        heading,
        intro: `Submitted from the marketing site by <strong>${escapeHtml(request.fullName)}</strong>.`,
        bodyHtml: `<table role="presentation" cellpadding="0" cellspacing="0" border="0">${body}</table>`,
      }),
    });

    if (error) {
      logger.error(
        { kind: request.kind, orgName: request.orgName, error, event: "email.contact_request_failed" },
        "Failed to send contact request email",
      );
      throw error;
    }
    logger.info(
      { kind: request.kind, orgName: request.orgName, event: "email.contact_request_sent" },
      "Contact request email sent via Resend",
    );
  } else {
    logger.info(
      { kind: request.kind, request, event: "email.contact_request" },
      `[EMAIL MOCK] ${heading}
To: ${env.CONTACT_NOTIFY_EMAIL}
Org: ${request.orgName}`,
    );
  }
};
