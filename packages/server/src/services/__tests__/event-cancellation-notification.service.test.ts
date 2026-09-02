import { describe, it, expect, vi, beforeEach } from "vitest";

let mockRecipients: any[] = [];

vi.mock("../room-recipients.service", () => ({
  resolveRoomStaffRecipients: () => Promise.resolve(mockRecipients),
}));

const mockCreateNotification = vi.fn().mockResolvedValue(undefined);
vi.mock("../notification.service", () => ({
  notificationService: { createNotification: (...args: unknown[]) => mockCreateNotification(...args) },
}));

const mockDispatchEmail = vi.fn().mockResolvedValue(undefined);
vi.mock("../email-delivery.service", () => ({
  dispatchEmail: (...args: unknown[]) => mockDispatchEmail(...args),
}));

import { notifyEventCancelledOrExpired } from "../event-cancellation-notification.service";

const ROOM = {
  id: "room-1",
  title: "Field Visit",
  organizationId: "org-1",
  createdBy: "creator-1",
  scheduledStart: new Date("2026-09-10T09:00:00.000Z"),
  cancellationReason: "Venue flooded",
};

describe("event-cancellation-notification.service (#75)", () => {
  beforeEach(() => {
    mockCreateNotification.mockClear();
    mockDispatchEmail.mockClear();
    mockCreateNotification.mockResolvedValue(undefined);
    mockRecipients = [
      { id: "creator-1", email: "creator@example.com", preferences: null },
      { id: "admin-1", email: "admin@example.com", preferences: null },
    ];
  });

  it("notifies every associated member in-app and by email when cancelled", async () => {
    const result = await notifyEventCancelledOrExpired(ROOM, "cancelled");

    expect(result).toEqual({ attempted: 2, succeeded: 2 });
    expect(mockCreateNotification).toHaveBeenCalledTimes(2);
    expect(mockDispatchEmail).toHaveBeenCalledTimes(2);

    expect(mockCreateNotification.mock.calls[0]?.[0]).toMatchObject({
      type: "EVENT_CANCELLED_OR_EXPIRED",
      organizationId: "org-1",
      title: "Field Visit",
      metadata: { roomId: "room-1", reason: "cancelled" },
    });
    expect(mockCreateNotification.mock.calls[0]?.[0].message).toContain("has been cancelled");
  });

  it("carries the organiser's cancellation note through to the email", async () => {
    await notifyEventCancelledOrExpired(ROOM, "cancelled");

    expect(mockDispatchEmail.mock.calls[0]?.[0]).toMatchObject({
      type: "event-cancelled",
      payload: { roomTitle: "Field Visit", reason: "cancelled", cancellationReason: "Venue flooded" },
    });
  });

  it("uses did-not-take-place wording for an expiry", async () => {
    await notifyEventCancelledOrExpired({ ...ROOM, cancellationReason: null }, "expired");

    expect(mockCreateNotification.mock.calls[0]?.[0].message).toContain("did not take place");
    expect(mockDispatchEmail.mock.calls[0]?.[0]).toMatchObject({
      payload: { reason: "expired", cancellationReason: null },
    });
  });

  // The whole point of this event kind: it is in isCriticalNotificationEvent,
  // so ChannelRouter must ignore mutes entirely. A member who muted email
  // still needs to know the thing they were attending is not happening.
  it("ignores channel mutes — this event is not suppressible", async () => {
    mockRecipients = [
      { id: "creator-1", email: "creator@example.com", preferences: { mutedChannels: ["email", "in_app"] } },
    ];

    const result = await notifyEventCancelledOrExpired(ROOM, "cancelled");

    expect(result).toEqual({ attempted: 1, succeeded: 1 });
    expect(mockCreateNotification).toHaveBeenCalledTimes(1);
    expect(mockDispatchEmail).toHaveBeenCalledTimes(1);
  });

  it("isolates a failing recipient and reports the partial outcome", async () => {
    mockCreateNotification.mockRejectedValueOnce(new Error("insert failed"));

    const result = await notifyEventCancelledOrExpired(ROOM, "cancelled");

    expect(result).toEqual({ attempted: 2, succeeded: 1 });
    expect(mockDispatchEmail).toHaveBeenCalledTimes(1);
  });

  it("reports zero attempted when a room has no staff", async () => {
    mockRecipients = [];

    const result = await notifyEventCancelledOrExpired(ROOM, "expired");

    expect(result).toEqual({ attempted: 0, succeeded: 0 });
    expect(mockCreateNotification).not.toHaveBeenCalled();
  });
});
