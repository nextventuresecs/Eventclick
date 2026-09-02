import { describe, it, expect, vi, beforeEach } from "vitest";

let mockRoomResult: any[] = [];
let mockAssignmentsResult: any[] = [];
let mockUsersResult: any[] = [];

let selectCallCount = 0;
vi.mock("../../db", () => ({
  db: {
    select: () => {
      const callNum = ++selectCallCount;
      return {
        from: () => ({
          where: () => ({
            limit: () => Promise.resolve(mockRoomResult),
            then: (onFulfilled: (v: any[]) => void, onRejected?: (err: unknown) => void) => {
              const result = callNum === 2 ? mockAssignmentsResult : mockUsersResult;
              return Promise.resolve(result).then(onFulfilled, onRejected);
            },
          }),
        }),
      };
    },
  },
}));

const mockCreateNotification = vi.fn().mockResolvedValue(undefined);
vi.mock("../notification.service", () => ({
  notificationService: { createNotification: (...args: unknown[]) => mockCreateNotification(...args) },
}));

import { notifyReportGenerated } from "../report-notification.service";

describe("report-notification.service (#73)", () => {
  beforeEach(() => {
    selectCallCount = 0;
    mockCreateNotification.mockClear();
    mockRoomResult = [{ id: "room-1", title: "Weekly Sync", createdBy: "creator-1" }];
    mockAssignmentsResult = [{ userId: "admin-1" }];
    mockUsersResult = [
      { id: "creator-1", organizationId: "org-1", preferences: null },
      { id: "admin-1", organizationId: "org-1", preferences: null },
    ];
  });

  it("notifies every room staff member in-app, carrying generatedBy metadata", async () => {
    await notifyReportGenerated("room-1", "org-1", "report-1", "creator-1", "Creator Name");

    expect(mockCreateNotification).toHaveBeenCalledTimes(2);
    for (const call of mockCreateNotification.mock.calls) {
      expect(call[0]).toMatchObject({
        type: "REPORT_GENERATED",
        organizationId: "org-1",
        metadata: { roomId: "room-1", reportId: "report-1", generatedBy: "creator-1" },
      });
    }
    expect(mockCreateNotification.mock.calls[0]?.[0].message).toContain("Creator Name");
  });

  it("does nothing when the room no longer exists (deleted/gone)", async () => {
    mockRoomResult = [];

    await notifyReportGenerated("ghost-room", "org-1", "report-1", "creator-1", "Creator Name");

    expect(mockCreateNotification).not.toHaveBeenCalled();
  });

  it("respects a staff member's in_app mute — no notification for them", async () => {
    mockUsersResult = [
      { id: "creator-1", organizationId: "org-1", preferences: { mutedChannels: ["in_app"] } },
      { id: "admin-1", organizationId: "org-1", preferences: null },
    ];

    await notifyReportGenerated("room-1", "org-1", "report-1", "creator-1", "Creator Name");

    expect(mockCreateNotification).toHaveBeenCalledTimes(1);
    expect(mockCreateNotification.mock.calls[0]?.[0].userId).toBe("admin-1");
  });

  it("one recipient's failure doesn't stop the others from being notified", async () => {
    mockCreateNotification.mockRejectedValueOnce(new Error("db down")).mockResolvedValueOnce(undefined);

    await expect(
      notifyReportGenerated("room-1", "org-1", "report-1", "creator-1", "Creator Name"),
    ).resolves.toBeUndefined();

    expect(mockCreateNotification).toHaveBeenCalledTimes(2);
  });
});
