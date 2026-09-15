import { describe, it, expect, vi, beforeEach } from "vitest";
import { DeleteMessageCommand, ChangeMessageVisibilityCommand } from "@aws-sdk/client-sqs";

/**
 * The email consumer deletes a message only when the delivery is finished
 * with. A delivery another consumer is still sending is deferred, and its
 * message must survive: if that consumer dies mid-send, this message is the
 * only thing that will retry it once the claim expires.
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

import { processEmailMessage } from "../worker";

const message = { Body: JSON.stringify({ deliveryId: "delivery-1" }), ReceiptHandle: "rh-1", MessageId: "m-1" };
const deletes = () => mockSqsSend.mock.calls.filter(([cmd]) => cmd instanceof DeleteMessageCommand);
const visibilityChanges = () =>
  mockSqsSend.mock.calls.filter(([cmd]) => cmd instanceof ChangeMessageVisibilityCommand).map(([cmd]) => cmd.input);

describe("processEmailMessage", () => {
  beforeEach(() => vi.clearAllMocks());

  it.for(["sent", "skipped"])("deletes the message when the delivery is %s", async (outcome) => {
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

  it("keeps the message when the send fails", async () => {
    mockAttempt.mockRejectedValueOnce(new Error("Resend is down"));
    await processEmailMessage(message);
    expect(deletes()).toHaveLength(0);
  });
});
