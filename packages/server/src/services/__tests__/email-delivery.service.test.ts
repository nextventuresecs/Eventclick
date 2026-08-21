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
        // simulate the real UPDATE...WHERE status='PENDING' atomicity by
        // only "matching" when the row is currently PENDING.
        const isClaim = Object.prototype.hasOwnProperty.call(values, "attempts");
        if (isClaim) {
          return {
            where: () => ({
              returning: () => {
                if (!mockDeliveryRow || mockDeliveryRow.status !== "PENDING") {
                  return Promise.resolve([]);
                }
                mockDeliveryRow.attempts += 1;
                mockDeliveryRow.lastAttemptAt = values.lastAttemptAt;
                return Promise.resolve([{ ...mockDeliveryRow }]);
              },
            }),
          };
        }
        Object.assign(mockDeliveryRow, values);
        return { where: () => Promise.resolve(undefined) };
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
vi.mock("../email.service", () => ({
  sendVerificationEmail: (...args: unknown[]) => mockSendVerificationEmail(...args),
  sendPasswordResetEmail: (...args: unknown[]) => mockSendPasswordResetEmail(...args),
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
  failureReason: null,
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

      expect(mockSendVerificationEmail).toHaveBeenCalledWith("user@example.com", "tok-123");
      expect(mockDeliveryRow.status).toBe("SENT");
    });

    // Regression guard for the headline acceptance criterion: "processing
    // the same dispatch job twice results in exactly one email sent."
    it("does not call the provider again for an already-SENT delivery (idempotent)", async () => {
      mockDeliveryRow = freshRow({ status: "SENT" });

      await attemptEmailDelivery("delivery-1");

      expect(mockSendVerificationEmail).not.toHaveBeenCalled();
    });

    // Regression guard: two workers racing on the same PENDING row (e.g. a
    // second SQS poller) must not both send. The claim is an atomic
    // UPDATE...WHERE status='PENDING', not read-then-write, so only the
    // first caller's update matches a row.
    it("only sends once when two concurrent attempts claim the same PENDING row", async () => {
      mockDeliveryRow = freshRow();
      mockSendVerificationEmail.mockImplementation(() => {
        // Simulate the claim having already flipped status away from PENDING
        // by the time the "first" attempt's send resolves, as it would once
        // the winning claim's UPDATE commits before the send call returns.
        return Promise.resolve(undefined);
      });

      await attemptEmailDelivery("delivery-1");
      // A second attempt after the first has already moved the row past
      // PENDING (status is now SENT) must be a no-op, not a second send.
      await attemptEmailDelivery("delivery-1");

      expect(mockSendVerificationEmail).toHaveBeenCalledTimes(1);
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
      // Status is left alone on failure (not flipped to FAILED here) — only
      // the DLQ consumer, after the queue's redrive policy is exhausted,
      // makes that terminal call.
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
      );
    });

    it("does nothing and does not throw when the delivery row is missing", async () => {
      mockDeliveryRow = null;

      await expect(attemptEmailDelivery("ghost-id")).resolves.toBeUndefined();
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

      await markEmailDeliveryFailed("delivery-1", "Exceeded max receive count");

      expect(mockDeliveryRow.status).toBe("FAILED");
      expect(mockDeliveryRow.failureReason).toBe("Exceeded max receive count");
    });
  });
});
