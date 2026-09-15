import { describe, it, expect, vi, beforeEach } from "vitest";
import { DeleteMessageCommand, ChangeMessageVisibilityCommand } from "@aws-sdk/client-sqs";

/**
 * The email consumer deletes a message only when the delivery is finished
 * with. A delivery another consumer is still sending is deferred, and its
 * message must survive: if that consumer dies mid-send, this message is the
 * only thing that will retry it once the claim expires. A retryable failure
 * keeps the message too, hidden for a delay that grows with each receive.
 */
const mockSqsSend = vi.fn().mockResolvedValue({});
const mockAttempt = vi.fn();

vi.mock("../sqs.client", () => ({ sqsClient: { send: (...args: unknown[]) => mockSqsSend(...args) } }));
vi.mock("../../services/email-delivery.service", () => ({
  attemptEmailDelivery: (...args: unknown[]) => mockAttempt(...args),
  dispatchEmail: vi.fn(),
  EMAIL_CLAIM_LEASE_SECONDS: 120,
}));
vi.mock("../../db", () => ({ db: {} }));
vi.mock("../../db/backgroundTenantContext", () => ({ runInBackgroundTenantContext: vi.fn() }));
vi.mock("../../services/report.service", () => ({ generateVerificationReportPdf: vi.fn() }));
vi.mock("../../services/auth", () => ({ findUserById: vi.fn() }));
vi.mock("../../services/notification.service", () => ({ notificationService: {} }));
vi.mock("../../services/storage.service", () => ({ s3: {}, buildPublicUrl: vi.fn() }));
vi.mock("../../services/report-notification.service", () => ({ notifyReportGenerated: vi.fn() }));
vi.mock("../../services/audit.service", () => ({ recordAuditSafely: vi.fn() }));

import { processEmailMessage, emailReceiveCommand } from "../worker";

const message = { Body: JSON.stringify({ deliveryId: "delivery-1" }), ReceiptHandle: "rh-1", MessageId: "m-1" };
const deletes = () => mockSqsSend.mock.calls.filter(([cmd]) => cmd instanceof DeleteMessageCommand);
const visibilityChanges = () =>
  mockSqsSend.mock.calls.filter(([cmd]) => cmd instanceof ChangeMessageVisibilityCommand).map(([cmd]) => cmd.input);

describe("processEmailMessage", () => {
  beforeEach(() => vi.clearAllMocks());

  it.for(["sent", "skipped", "failed"])("deletes the message when the delivery is %s", async (outcome) => {
    mockAttempt.mockResolvedValueOnce(outcome);
    await processEmailMessage(message);
    expect(mockAttempt).toHaveBeenCalledWith("delivery-1");
    expect(deletes()).toHaveLength(1);
  });

  it("keeps the message, hidden until the lease runs out, when another consumer holds the delivery", async () => {
    mockAttempt.mockResolvedValueOnce("deferred");
    await processEmailMessage(message);
    expect(deletes()).toHaveLength(0);
    expect(visibilityChanges()).toEqual([expect.objectContaining({ ReceiptHandle: "rh-1", VisibilityTimeout: 120 })]);
  });

  it.for([
    ["1", 30, 36],
    ["3", 300, 360],
    ["7", 900, 1080],
  ] as const)(
    "keeps the message after a failed receive %s, hidden for the backoff delay",
    async ([count, min, max]) => {
      mockAttempt.mockRejectedValueOnce({ name: "rate_limit_exceeded", statusCode: 429, message: "Too many requests" });
      await processEmailMessage({ ...message, Attributes: { ApproximateReceiveCount: count } });
      expect(deletes()).toHaveLength(0);
      const [change] = visibilityChanges();
      expect(change!.ReceiptHandle).toBe("rh-1");
      expect(change!.VisibilityTimeout).toBeGreaterThanOrEqual(min);
      expect(change!.VisibilityTimeout).toBeLessThanOrEqual(max);
    },
  );

  it("falls back to the first delay when the receive count is missing", async () => {
    mockAttempt.mockRejectedValueOnce(new Error("Resend is down"));
    await processEmailMessage(message);
    expect(visibilityChanges()[0]!.VisibilityTimeout).toBeLessThanOrEqual(36);
  });
});

describe("emailReceiveCommand", () => {
  // Without this the attribute is absent and every failure waits the first delay.
  it("asks SQS for ApproximateReceiveCount", () => {
    expect(emailReceiveCommand("https://sqs.test/q").input.MessageSystemAttributeNames).toContain("ApproximateReceiveCount");
  });
});
