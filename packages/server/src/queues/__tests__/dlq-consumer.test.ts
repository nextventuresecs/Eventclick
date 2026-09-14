import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

const send = vi.fn();
vi.mock("../sqs.client", () => ({ sqsClient: { send: (cmd: unknown) => send(cmd) } }));

const updateReturning = vi.fn();
const updateSet = vi.fn();
vi.mock("../../db", () => ({
  db: {
    update: () => ({
      set: (values: unknown) => {
        updateSet(values);
        return { where: () => ({ returning: () => updateReturning() }) };
      },
    }),
  },
}));

const backgroundContext = vi.fn(async (_org: string, _user: string, fn: () => Promise<unknown>) => fn());
vi.mock("../../db/backgroundTenantContext", () => ({
  runInBackgroundTenantContext: (org: string, user: string, fn: () => Promise<unknown>) => backgroundContext(org, user, fn),
}));

const createNotification = vi.fn().mockResolvedValue({});
vi.mock("../../services/notification.service", () => ({
  notificationService: { createNotification: (...args: unknown[]) => createNotification(...args) },
}));

const markEmailDeliveryFailed = vi.fn().mockResolvedValue(undefined);
vi.mock("../../services/email-delivery.service", () => ({
  markEmailDeliveryFailed: (...args: unknown[]) => markEmailDeliveryFailed(...args),
}));

vi.mock("../../utils/logger", () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

import { drainDlq, startDlqDrainLoop } from "../dlq-consumer";

const QUEUE = "https://sqs.ap-south-1.amazonaws.com/1/eventclick-pdf-dlq";
const pdfBody = (jobId = "pdf_1") =>
  JSON.stringify({ type: "generate_pdf", jobId, roomId: "room-1", orgId: "org-1", userId: "user-1" });

type Cmd = { constructor: { name: string }; input: { ReceiptHandle?: string } };
const commands = () => send.mock.calls.map(([c]) => c as Cmd);
const deletedHandles = () =>
  commands()
    .filter((c) => c.constructor.name === "DeleteMessageCommand")
    .map((c) => c.input.ReceiptHandle);

/** Queue the receive responses in order; anything after them is an empty receive. */
const receives = (...batches: Array<Array<{ Body?: string; ReceiptHandle?: string; MessageId?: string }>>) => {
  send.mockImplementation(async (cmd: Cmd) => {
    if (cmd.constructor.name === "ReceiveMessageCommand") return { Messages: batches.shift() ?? [] };
    return {};
  });
};

beforeEach(() => {
  send.mockReset();
  updateReturning.mockReset().mockResolvedValue([{ id: "row-1" }]);
  updateSet.mockReset();
  backgroundContext.mockClear();
  createNotification.mockClear();
  markEmailDeliveryFailed.mockClear();
});

describe("drainDlq", () => {
  it("marks a PDF job failed in its tenant context, notifies the requester, then deletes the message", async () => {
    receives([{ Body: pdfBody(), ReceiptHandle: "rh-1", MessageId: "m-1" }]);

    expect(await drainDlq(QUEUE)).toBe(1);

    expect(backgroundContext).toHaveBeenCalledWith("org-1", "user-1", expect.any(Function));
    expect(updateSet).toHaveBeenCalledWith(expect.objectContaining({ status: "failed" }));
    expect(createNotification).toHaveBeenCalledWith(
      expect.objectContaining({ userId: "user-1", organizationId: "org-1", type: "report_failed" }),
    );
    expect(deletedHandles()).toEqual(["rh-1"]);
  });

  it("does not notify again when the job was already completed or failed", async () => {
    updateReturning.mockResolvedValue([]);
    receives([{ Body: pdfBody(), ReceiptHandle: "rh-1" }]);

    await drainDlq(QUEUE);

    expect(createNotification).not.toHaveBeenCalled();
    expect(deletedHandles()).toEqual(["rh-1"]);
  });

  it("keeps a message whose database write fails, and stops instead of spinning", async () => {
    updateReturning.mockRejectedValue(new Error("connection refused"));
    receives([{ Body: pdfBody(), ReceiptHandle: "rh-1" }], [{ Body: pdfBody(), ReceiptHandle: "rh-1" }]);

    expect(await drainDlq(QUEUE)).toBe(0);

    expect(deletedHandles()).toEqual([]);
    expect(commands().filter((c) => c.constructor.name === "ReceiveMessageCommand")).toHaveLength(1);
  });

  it("settles email deliveries, and discards unparseable and unknown messages after logging them", async () => {
    receives([
      { Body: JSON.stringify({ deliveryId: "d-1" }), ReceiptHandle: "rh-email" },
      { Body: "not json", ReceiptHandle: "rh-garbage" },
      { Body: JSON.stringify({ type: "something_else" }), ReceiptHandle: "rh-unknown" },
    ]);

    expect(await drainDlq(QUEUE)).toBe(3);

    expect(markEmailDeliveryFailed).toHaveBeenCalledWith("d-1", expect.any(String));
    expect(deletedHandles()).toEqual(["rh-email", "rh-garbage", "rh-unknown"]);
  });

  it("drains across batches until a receive comes back empty", async () => {
    receives(
      [{ Body: pdfBody("pdf_1"), ReceiptHandle: "rh-1" }],
      [{ Body: pdfBody("pdf_2"), ReceiptHandle: "rh-2" }],
    );

    expect(await drainDlq(QUEUE)).toBe(2);
    expect(commands().filter((c) => c.constructor.name === "ReceiveMessageCommand")).toHaveLength(3);
  });

  it("does nothing without a queue URL", async () => {
    expect(await drainDlq("")).toBe(0);
    expect(send).not.toHaveBeenCalled();
  });
});

describe("startDlqDrainLoop", () => {
  afterEach(() => vi.useRealTimers());

  it("drains immediately and on the interval, never overlapping, and survives a failed drain", async () => {
    vi.useFakeTimers();
    let release: () => void = () => {};
    let receiveCalls = 0;
    send.mockImplementation(async () => {
      receiveCalls++;
      if (receiveCalls === 1) {
        await new Promise<void>((resolve) => {
          release = resolve;
        });
        throw new Error("sqs down");
      }
      return { Messages: [] };
    });

    const stop = startDlqDrainLoop(1_000, QUEUE);
    expect(receiveCalls).toBe(1);

    // First drain is still in flight: the tick is skipped.
    await vi.advanceTimersByTimeAsync(1_000);
    expect(receiveCalls).toBe(1);

    release();
    await vi.advanceTimersByTimeAsync(1_000);
    expect(receiveCalls).toBe(2);

    stop();
    await vi.advanceTimersByTimeAsync(5_000);
    expect(receiveCalls).toBe(2);
  });

  it("does not start without a queue URL", () => {
    const stop = startDlqDrainLoop(1_000, "");
    expect(send).not.toHaveBeenCalled();
    stop();
  });
});
