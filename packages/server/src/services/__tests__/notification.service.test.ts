import { describe, it, expect, vi, beforeEach } from "vitest";

const insertedNotifications: any[] = [];
const insertedDeliveries: any[] = [];
const mockNotificationReturn: any = { id: "notif-1", userId: "user-1", organizationId: "org-1" };

vi.mock("../../db", () => ({
  db: {
    insert: (table: any) => ({
      values: (values: any) => {
        if (table === "notifications-table") {
          insertedNotifications.push(values);
          return { returning: () => Promise.resolve([mockNotificationReturn]) };
        }
        insertedDeliveries.push(values);
        return Promise.resolve(undefined);
      },
    }),
  },
}));

vi.mock("../../db/schema/notifications", () => ({
  notifications: "notifications-table",
  notificationDeliveries: "notification-deliveries-table",
}));

const mockPublish = vi.fn();
vi.mock("../pubsub.service", () => ({
  pubsub: { publish: (...args: unknown[]) => mockPublish(...args) },
}));

import { notificationService } from "../notification.service";

describe("notificationService.createNotification", () => {
  beforeEach(() => {
    insertedNotifications.length = 0;
    insertedDeliveries.length = 0;
    mockPublish.mockReset();
  });

  it("writes a SENT in_app delivery row when the SSE publish succeeds", async () => {
    mockPublish.mockResolvedValueOnce(1);

    const result = await notificationService.createNotification({
      userId: "user-1",
      organizationId: "org-1",
      type: "ORG_BROADCAST",
      title: "Hello",
      message: "World",
    });

    expect(result).toEqual(mockNotificationReturn);
    expect(insertedDeliveries).toHaveLength(1);
    expect(insertedDeliveries[0]).toMatchObject({
      notificationId: "notif-1",
      userId: "user-1",
      organizationId: "org-1",
      channel: "in_app",
      status: "SENT",
    });
  });

  // Regression guard: a Redis blip must not fail notification creation —
  // the notification row is already durable and visible on next REST fetch,
  // only the live SSE push degraded. Re-throwing here would make fan-out
  // callers (e.g. eventStartNotifier) retry and duplicate the notification.
  it("does not throw when the SSE publish fails, and records a FAILED delivery row instead", async () => {
    mockPublish.mockRejectedValueOnce(new Error("redis unavailable"));

    const result = await notificationService.createNotification({
      userId: "user-1",
      organizationId: "org-1",
      type: "ORG_BROADCAST",
      title: "Hello",
      message: "World",
    });

    expect(result).toEqual(mockNotificationReturn);
    expect(insertedDeliveries).toHaveLength(1);
    expect(insertedDeliveries[0]).toMatchObject({
      channel: "in_app",
      status: "FAILED",
      failureReason: "redis unavailable",
    });
  });
});
