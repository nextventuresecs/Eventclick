import { describe, it, expect, vi, beforeEach } from "vitest";

/**
 * Every sender the email-delivery queue uses must hand its idempotency key to
 * Resend, or a retry after a send that already went out reaches the recipient
 * twice. A sender that drops the options argument fails here.
 */
// Hoisted with vi.mock: email.service constructs its Resend client on import.
const { send } = vi.hoisted(() => ({ send: vi.fn() }));

vi.mock("resend", () => ({
  Resend: class {
    emails = { send };
  },
}));

vi.mock("../../config/env", () => ({
  env: {
    RESEND_API_KEY: "re_test",
    RESEND_FROM_EMAIL: "noreply@eventclick.live",
    APP_URL: "https://app.eventclick.live",
  },
}));

vi.mock("../../utils/logger", () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

import * as emailService from "../email.service";

const OPTIONS = { idempotencyKey: "email-delivery/d-1" };

const SENDERS: Array<[string, () => Promise<void>]> = [
  ["sendVerificationEmail", () => emailService.sendVerificationEmail("a@b.co", "tok", OPTIONS)],
  ["sendPasswordResetEmail", () => emailService.sendPasswordResetEmail("a@b.co", "tok", OPTIONS)],
  ["sendReportReadyEmail", () => emailService.sendReportReadyEmail("a@b.co", "https://cdn/r.pdf", "room", OPTIONS)],
  ["sendInviteEmail", () => emailService.sendInviteEmail("a@b.co", "tok", "Org", OPTIONS)],
  ["sendEventStartedEmail", () => emailService.sendEventStartedEmail("a@b.co", "Room", "https://watch", OPTIONS)],
  ["sendEventEndedEmail", () => emailService.sendEventEndedEmail("a@b.co", "Room", undefined, undefined, OPTIONS)],
  ["sendOrgBroadcastEmail", () => emailService.sendOrgBroadcastEmail("a@b.co", "T", "B", "Org", "normal", OPTIONS)],
  ["sendEventCancelledEmail", () => emailService.sendEventCancelledEmail("a@b.co", "Room", "cancelled", "today", null, OPTIONS)],
];

describe("email senders pass request options to Resend", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    send.mockResolvedValue({ data: { id: "e-1" }, error: null });
  });

  it.for(SENDERS)("%s forwards the idempotency key", async ([, call]) => {
    await call();
    expect(send).toHaveBeenCalledTimes(1);
    expect(send.mock.calls[0]![1]).toEqual(OPTIONS);
  });

  it("sends no request options when a caller passes none", async () => {
    await emailService.sendVerificationEmail("a@b.co", "tok");
    expect(send.mock.calls[0]![1]).toBeUndefined();
  });

  it("covers every sender that dispatchEmail can call", () => {
    const covered = new Set(SENDERS.map(([name]) => name));
    const dispatched = [
      "sendVerificationEmail",
      "sendPasswordResetEmail",
      "sendReportReadyEmail",
      "sendInviteEmail",
      "sendEventStartedEmail",
      "sendEventEndedEmail",
      "sendOrgBroadcastEmail",
      "sendEventCancelledEmail",
    ];
    expect(dispatched.filter((name) => !covered.has(name))).toEqual([]);
  });
});
