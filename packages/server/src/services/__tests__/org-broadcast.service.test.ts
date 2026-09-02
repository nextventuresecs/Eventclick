import { describe, it, expect, vi, beforeEach } from "vitest";

let mockOrgResult: any[] = [];
let mockRecipients: any[] = [];

// db.select() is used twice per broadcast, in order: the organisation lookup
// (terminated by .limit(1)) and the recipient query (awaited directly, so it
// resolves through .then). Same shape as report-notification.service.test.ts.
vi.mock("../../db", () => ({
  db: {
    select: () => ({
      from: () => ({
        where: () => ({
          limit: () => Promise.resolve(mockOrgResult),
          then: (onFulfilled: (v: any[]) => void, onRejected?: (err: unknown) => void) =>
            Promise.resolve(mockRecipients).then(onFulfilled, onRejected),
        }),
      }),
    }),
  },
}));

const mockCreateNotification = vi.fn().mockResolvedValue(undefined);
vi.mock("../notification.service", () => ({
  notificationService: { createNotification: (...args: unknown[]) => mockCreateNotification(...args) },
}));

const mockSendPush = vi.fn().mockResolvedValue({ attempted: 1, sent: 1 });
vi.mock("../push.service", () => ({
  sendToUser: (...args: unknown[]) => mockSendPush(...args),
}));

const mockDispatchEmail = vi.fn().mockResolvedValue(undefined);
vi.mock("../email-delivery.service", () => ({
  dispatchEmail: (...args: unknown[]) => mockDispatchEmail(...args),
}));

import { sendOrgBroadcast } from "../org-broadcast.service";

const ORG = "org-1";
const ADMIN = "admin-1";

describe("org-broadcast.service (#74)", () => {
  beforeEach(() => {
    mockCreateNotification.mockClear();
    mockSendPush.mockClear();
    mockDispatchEmail.mockClear();
    mockCreateNotification.mockResolvedValue(undefined);

    mockOrgResult = [{ id: ORG, name: "Test Org" }];
    mockRecipients = [
      { id: "user-1", email: "one@example.com", organizationId: ORG, preferences: null },
      { id: "user-2", email: "two@example.com", organizationId: ORG, preferences: null },
    ];
  });

  it("reaches every org member on all three channels and reports per-channel counts", async () => {
    const result = await sendOrgBroadcast(ORG, ADMIN, {
      title: "All hands",
      body: "Meeting at 4pm.",
      priority: "normal",
    });

    expect(result).toEqual({ recipients: 2, inApp: 2, webPush: 2, email: 2, failed: 0 });
    expect(mockCreateNotification).toHaveBeenCalledTimes(2);
    expect(mockSendPush).toHaveBeenCalledTimes(2);
    expect(mockDispatchEmail).toHaveBeenCalledTimes(2);

    expect(mockCreateNotification.mock.calls[0]?.[0]).toMatchObject({
      type: "ORG_BROADCAST",
      organizationId: ORG,
      title: "All hands",
      message: "Meeting at 4pm.",
      metadata: { organizationId: ORG, priority: "normal" },
    });
  });

  it("respects individual channel mutes at normal priority", async () => {
    mockRecipients = [
      {
        id: "user-1",
        email: "one@example.com",
        organizationId: ORG,
        preferences: { mutedChannels: ["email", "web_push"] },
      },
    ];

    const result = await sendOrgBroadcast(ORG, ADMIN, {
      title: "FYI",
      body: "Non-urgent notice.",
      priority: "normal",
    });

    expect(result).toMatchObject({ recipients: 1, inApp: 1, webPush: 0, email: 0, failed: 0 });
    expect(mockDispatchEmail).not.toHaveBeenCalled();
    expect(mockSendPush).not.toHaveBeenCalled();
    expect(mockCreateNotification).toHaveBeenCalledTimes(1);
  });

  it("ignores mutes entirely at urgent priority, and wakes the device", async () => {
    mockRecipients = [
      {
        id: "user-1",
        email: "one@example.com",
        organizationId: ORG,
        preferences: { mutedChannels: ["email", "web_push", "in_app"] },
      },
    ];

    const result = await sendOrgBroadcast(ORG, ADMIN, {
      title: "Site closed",
      body: "Do not travel to the venue.",
      priority: "urgent",
    });

    expect(result).toMatchObject({ recipients: 1, inApp: 1, webPush: 1, email: 1, failed: 0 });
    expect(mockDispatchEmail).toHaveBeenCalledTimes(1);
    expect(mockDispatchEmail.mock.calls[0]?.[0]).toMatchObject({
      type: "org-broadcast",
      payload: { orgName: "Test Org", priority: "urgent" },
    });

    // Urgent must set the web-push Urgency header, or the OS is free to batch
    // it for power saving — which defeats the point of marking it urgent.
    expect(mockSendPush.mock.calls[0]?.[2]).toEqual({ urgency: "high" });
  });

  it("does not set high push urgency for a normal broadcast", async () => {
    await sendOrgBroadcast(ORG, ADMIN, { title: "Notice", body: "Routine.", priority: "normal" });
    expect(mockSendPush.mock.calls[0]?.[2]).toBeUndefined();
  });

  it("isolates a failing recipient so the rest still receive the broadcast", async () => {
    mockCreateNotification.mockRejectedValueOnce(new Error("insert failed"));

    const result = await sendOrgBroadcast(ORG, ADMIN, {
      title: "All hands",
      body: "Meeting at 4pm.",
      priority: "normal",
    });

    expect(result.recipients).toBe(2);
    expect(result.failed).toBe(1);
    expect(result.inApp).toBe(1);
    // The surviving recipient still got every channel.
    expect(mockDispatchEmail).toHaveBeenCalledTimes(1);
  });

  it("throws when the organisation does not exist", async () => {
    mockOrgResult = [];

    await expect(
      sendOrgBroadcast("missing-org", ADMIN, { title: "x", body: "y", priority: "normal" }),
    ).rejects.toThrow(/Organization not found/i);

    expect(mockCreateNotification).not.toHaveBeenCalled();
  });
});
