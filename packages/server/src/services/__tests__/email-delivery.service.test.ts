import { describe, it, expect, vi, beforeEach } from "vitest";

let mockDeliveryRow: any = null;
const mockUpdateSet = vi.fn();
const mockInsertReturning = vi.fn();

vi.mock("../../db", () => ({
  authDb: {
    insert: () => ({
      values: () => ({
        returning: mockInsertReturning,
      }),
    }),
    select: () => ({
      from: () => ({
        where: () => ({
          limit: () => Promise.resolve(mockDeliveryRow ? [mockDeliveryRow] : []),
        }),
      }),
    }),
    update: () => ({
      set: (values: any) => {
        mockUpdateSet(values);
        // The claim update (attemptEmailDelivery's first write) sets
        // `attempts` via a sql`...` expression and chains .returning() —
        // simulate its WHERE: the row is PENDING and holds no unexpired
        // lease. The race itself is covered against Postgres in
        // email-delivery-claim.integration.test.ts.
        const isClaim = Object.prototype.hasOwnProperty.call(values, "attempts");
        if (isClaim) {
          return {
            where: () => ({
              returning: () => {
                const leased = mockDeliveryRow?.claimedUntil && mockDeliveryRow.claimedUntil > new Date();
                if (!mockDeliveryRow || mockDeliveryRow.status !== "PENDING" || leased) {
                  return Promise.resolve([]);
                }
                mockDeliveryRow.attempts += 1;
                mockDeliveryRow.lastAttemptAt = values.lastAttemptAt;
                mockDeliveryRow.claimedUntil = new Date(Date.now() + 120_000);
                return Promise.resolve([{ ...mockDeliveryRow }]);
              },
            }),
          };
        }
        Object.assign(mockDeliveryRow, values);
        // Awaitable directly, or with .returning() (markEmailDeliveryFailed).
        // The SENT/DELIVERED guard lives in the WHERE clause, so it is
        // covered against Postgres in email-delivery-failed.integration.test.ts.
        return {
          where: () =>
            Object.assign(Promise.resolve(undefined), {
              returning: () => Promise.resolve([{ id: mockDeliveryRow.id }]),
            }),
        };
      },
    }),
  },
}));

let sqsQueueUrl: string | undefined;
vi.mock("../../config/env", () => ({
  env: {
    get SQS_QUEUE_URL() {
      return sqsQueueUrl;
    },
  },
}));

const mockSqsSend = vi.fn().mockResolvedValue({ MessageId: "msg-1" });
vi.mock("../../queues/sqs.client", () => ({
  sqsClient: { send: (...args: unknown[]) => mockSqsSend(...args) },
}));

const mockSendVerificationEmail = vi.fn();
const mockSendPasswordResetEmail = vi.fn();
const mockSendReportReadyEmail = vi.fn();
const mockSendInviteEmail = vi.fn();
vi.mock("../email.service", () => ({
  sendVerificationEmail: (...args: unknown[]) => mockSendVerificationEmail(...args),
  sendPasswordResetEmail: (...args: unknown[]) => mockSendPasswordResetEmail(...args),
  sendInviteEmail: (...args: unknown[]) => mockSendInviteEmail(...args),
  sendReportReadyEmail: (...args: unknown[]) => mockSendReportReadyEmail(...args),
}));

import { dispatchEmail, attemptEmailDelivery, markEmailDeliveryFailed } from "../email-delivery.service";

const freshRow = (overrides: Partial<Record<string, any>> = {}) => ({
  id: "delivery-1",
  userId: "user-1",
  recipientEmail: "user@example.com",
  emailType: "verification",
  payload: { token: "tok-123" },
  status: "PENDING",
  attempts: 0,
  lastAttemptAt: null,
  claimedUntil: null,
  failureReason: null,
  failedAt: null,
  ...overrides,
});

describe("email-delivery.service", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockDeliveryRow = null;
    sqsQueueUrl = undefined;
    mockInsertReturning.mockResolvedValue([freshRow()]);
  });

  describe("attemptEmailDelivery", () => {
    it("sends and marks SENT on success", async () => {
      mockDeliveryRow = freshRow();
      mockSendVerificationEmail.mockResolvedValueOnce(undefined);

      await attemptEmailDelivery("delivery-1");

      expect(mockSendVerificationEmail).toHaveBeenCalledWith("user@example.com", "tok-123", { idempotencyKey: "email-delivery/delivery-1" });
      expect(mockDeliveryRow.status).toBe("SENT");
    });

    // Regression guard for the headline acceptance criterion: "processing
    // the same dispatch job twice results in exactly one email sent."
    it("does not call the provider again for an already-SENT delivery (idempotent)", async () => {
      mockDeliveryRow = freshRow({ status: "SENT" });

      await attemptEmailDelivery("delivery-1");

      expect(mockSendVerificationEmail).not.toHaveBeenCalled();
    });

    it("defers without sending when another consumer holds an unexpired claim", async () => {
      mockDeliveryRow = freshRow({ claimedUntil: new Date(Date.now() + 60_000) });

      expect(await attemptEmailDelivery("delivery-1")).toBe("deferred");

      expect(mockSendVerificationEmail).not.toHaveBeenCalled();
      expect(mockDeliveryRow.status).toBe("PENDING");
    });

    it("reclaims a delivery whose claim expired (worker died mid-send)", async () => {
      mockDeliveryRow = freshRow({ claimedUntil: new Date(Date.now() - 1_000), attempts: 1 });

      expect(await attemptEmailDelivery("delivery-1")).toBe("sent");

      expect(mockSendVerificationEmail).toHaveBeenCalledTimes(1);
      expect(mockDeliveryRow).toMatchObject({ status: "SENT", claimedUntil: null, attempts: 2 });
    });

    it("skips a delivery that is already terminal", async () => {
      mockDeliveryRow = freshRow({ status: "FAILED" });

      expect(await attemptEmailDelivery("delivery-1")).toBe("skipped");
      expect(mockSendVerificationEmail).not.toHaveBeenCalled();
    });

    it("does not call the provider again for an already-DELIVERED delivery", async () => {
      mockDeliveryRow = freshRow({ status: "DELIVERED" });

      await attemptEmailDelivery("delivery-1");

      expect(mockSendVerificationEmail).not.toHaveBeenCalled();
    });

    it("throws on provider failure so the caller's retry mechanism engages, and records the reason", async () => {
      mockDeliveryRow = freshRow();
      mockSendVerificationEmail.mockRejectedValueOnce(new Error("Resend is down"));

      await expect(attemptEmailDelivery("delivery-1")).rejects.toThrow("Resend is down");
      expect(mockDeliveryRow.failureReason).toBe("Resend is down");
      // The claim is released so the redelivered message retries immediately.
      expect(mockDeliveryRow.claimedUntil).toBeNull();
      // Status is left alone on failure (not flipped to FAILED here) — only
      // the DLQ consumer, after the queue's redrive policy is exhausted,
      // makes that terminal call.
      expect(mockDeliveryRow.status).toBe("PENDING");
    });

    it("repeats the same idempotency key when a retry follows a send whose SENT write failed", async () => {
      mockDeliveryRow = freshRow();
      mockSendVerificationEmail.mockResolvedValue(undefined);
      // Fail only the SENT write, once: the email has already gone out.
      const assign = Object.assign;
      let failSentWrite = true;
      const spy = vi.spyOn(Object, "assign").mockImplementation((target: object, ...sources: any[]) => {
        if (failSentWrite && sources[0]?.status === "SENT") {
          failSentWrite = false;
          throw new Error("connection terminated");
        }
        return assign(target, ...sources);
      });

      try {
        await expect(attemptEmailDelivery("delivery-1")).rejects.toThrow("connection terminated");
        expect(await attemptEmailDelivery("delivery-1")).toBe("sent");
      } finally {
        spy.mockRestore();
      }

      const keys = mockSendVerificationEmail.mock.calls.map((call) => call[2]);
      expect(keys).toEqual([{ idempotencyKey: "email-delivery/delivery-1" }, { idempotencyKey: "email-delivery/delivery-1" }]);
    });

    it("gives each delivery its own idempotency key", async () => {
      mockDeliveryRow = freshRow({ id: "delivery-2" });
      mockSendVerificationEmail.mockResolvedValue(undefined);

      await attemptEmailDelivery("delivery-2");

      expect(mockSendVerificationEmail.mock.calls[0]![2]).toEqual({ idempotencyKey: "email-delivery/delivery-2" });
    });

    it("records the provider's own error, not \"Unknown error\", when Resend rejects", async () => {
      mockDeliveryRow = freshRow();
      // Resend's error is a plain object, not an Error instance.
      mockSendVerificationEmail.mockRejectedValueOnce({ name: "rate_limit_exceeded", statusCode: 429, message: "Too many requests" });

      await expect(attemptEmailDelivery("delivery-1")).rejects.toMatchObject({ name: "rate_limit_exceeded" });

      expect(mockDeliveryRow.failureReason).toBe("rate_limit_exceeded 429: Too many requests");
      expect(mockDeliveryRow.status).toBe("PENDING");
    });

    it("marks a permanent provider rejection FAILED at once instead of throwing for a retry", async () => {
      mockDeliveryRow = freshRow();
      mockSendVerificationEmail.mockRejectedValueOnce({ name: "validation_error", statusCode: 422, message: "Invalid `to` field." });

      expect(await attemptEmailDelivery("delivery-1")).toBe("failed");

      expect(mockSendVerificationEmail).toHaveBeenCalledTimes(1);
      expect(mockDeliveryRow).toMatchObject({
        status: "FAILED",
        failureReason: "validation_error 422: Invalid `to` field.",
        claimedUntil: null,
      });
      expect(mockDeliveryRow.failedAt).not.toBeNull();
    });

    it("retries an invalid API key rather than failing every email for good", async () => {
      mockDeliveryRow = freshRow();
      mockSendVerificationEmail.mockRejectedValueOnce({ name: "validation_error", statusCode: 401, message: "API key is invalid" });

      await expect(attemptEmailDelivery("delivery-1")).rejects.toMatchObject({ statusCode: 401 });
      expect(mockDeliveryRow.status).toBe("PENDING");
    });

    it("increments attempts on every try, including a failed one", async () => {
      mockDeliveryRow = freshRow({ attempts: 2 });
      mockSendVerificationEmail.mockRejectedValueOnce(new Error("boom"));

      await expect(attemptEmailDelivery("delivery-1")).rejects.toThrow();

      expect(mockDeliveryRow.attempts).toBe(3);
    });

    it("dispatches report-ready emails with s3Url/roomLabel from the payload", async () => {
      mockDeliveryRow = freshRow({
        emailType: "report-ready",
        payload: { s3Url: "https://cdn.example/report.pdf", roomLabel: "room-42" },
      });
      mockSendReportReadyEmail.mockResolvedValueOnce(undefined);

      await attemptEmailDelivery("delivery-1");

      expect(mockSendReportReadyEmail).toHaveBeenCalledWith(
        "user@example.com",
        "https://cdn.example/report.pdf",
        "room-42",
        { idempotencyKey: "email-delivery/delivery-1" },
      );
    });

    it("dispatches invite emails with token/orgName from the payload (#70)", async () => {
      mockDeliveryRow = freshRow({
        emailType: "invite",
        payload: { token: "tok-123", orgName: "Acme Org" },
      });
      mockSendInviteEmail.mockResolvedValueOnce(undefined);

      await attemptEmailDelivery("delivery-1");

      expect(mockSendInviteEmail).toHaveBeenCalledWith("user@example.com", "tok-123", "Acme Org", { idempotencyKey: "email-delivery/delivery-1" });
    });

    // AC3 for #70 ("retried invite-send does not double-email"): the correct
    // way to prove this is re-driving the SAME delivery row's id, exactly as
    // a redelivered SQS message would — not calling the invite endpoint
    // twice (which legitimately creates two separate rows/emails).
    it("re-driving the same invite delivery id after SENT does not send a second invite email", async () => {
      mockDeliveryRow = freshRow({
        emailType: "invite",
        payload: { token: "tok-123", orgName: "Acme Org" },
      });
      mockSendInviteEmail.mockResolvedValueOnce(undefined);

      await attemptEmailDelivery("delivery-1");
      expect(mockDeliveryRow.status).toBe("SENT");

      await attemptEmailDelivery("delivery-1");

      expect(mockSendInviteEmail).toHaveBeenCalledTimes(1);
    });

    it("skips and does not throw when the delivery row is missing", async () => {
      mockDeliveryRow = null;

      await expect(attemptEmailDelivery("ghost-id")).resolves.toBe("skipped");
      expect(mockSendVerificationEmail).not.toHaveBeenCalled();
    });
  });

  describe("dispatchEmail", () => {
    it("creates a delivery row and enqueues to SQS when SQS_QUEUE_URL is set", async () => {
      sqsQueueUrl = "https://sqs.example/email-queue";
      mockInsertReturning.mockResolvedValueOnce([freshRow({ id: "delivery-2" })]);

      await dispatchEmail({
        userId: "user-1",
        recipientEmail: "user@example.com",
        type: "verification",
        payload: { token: "tok-123" },
      });

      expect(mockSqsSend).toHaveBeenCalledTimes(1);
      expect(mockSendVerificationEmail).not.toHaveBeenCalled();
    });

    it("sends inline (no SQS) when SQS_QUEUE_URL is unset, without throwing to the caller on failure", async () => {
      sqsQueueUrl = undefined;
      const row = freshRow({ id: "delivery-3" });
      mockInsertReturning.mockResolvedValueOnce([row]);
      mockDeliveryRow = row;
      mockSendVerificationEmail.mockRejectedValueOnce(new Error("Resend down"));

      await expect(
        dispatchEmail({
          userId: "user-1",
          recipientEmail: "user@example.com",
          type: "verification",
          payload: { token: "tok-123" },
        }),
      ).resolves.toBeUndefined();

      expect(mockSqsSend).not.toHaveBeenCalled();
      expect(mockSendVerificationEmail).toHaveBeenCalledTimes(1);
    });

    it("throws when the delivery row cannot be created", async () => {
      mockInsertReturning.mockResolvedValueOnce([]);

      await expect(
        dispatchEmail({
          userId: "user-1",
          recipientEmail: "user@example.com",
          type: "verification",
          payload: { token: "tok-123" },
        }),
      ).rejects.toThrow("Failed to create email delivery record");
    });
  });

  describe("markEmailDeliveryFailed", () => {
    it("sets status to FAILED with the given reason", async () => {
      mockDeliveryRow = freshRow();

      expect(await markEmailDeliveryFailed("delivery-1", "Exceeded max receive count")).toBe(true);

      expect(mockDeliveryRow.status).toBe("FAILED");
      expect(mockDeliveryRow.failureReason).toBe("Exceeded max receive count");
      expect(mockDeliveryRow.failedAt).not.toBeNull();
    });
  });
});
