import { describe, it, expect, vi, beforeEach } from "vitest";

let mockAssignmentsResult: any[] = [];
let mockUsersResult: any[] = [];
let mockSubmittedResult: any[] = [];

// resolveRoomStaffRecipients issues 2 selects (assignments, users); when
// notifyWindowClosing also runs, a 3rd select (attendanceEntries) follows.
// Route by call order within one invocation, mirroring the pattern already
// established in event-stream-notification.service.test.ts.
let selectCallCount = 0;
vi.mock("../../db", () => ({
  db: {
    select: () => {
      const callNum = ++selectCallCount;
      return {
        from: () => ({
          where: () => {
            if (callNum === 1) return Promise.resolve(mockAssignmentsResult);
            if (callNum === 2) return Promise.resolve(mockUsersResult);
            return Promise.resolve(mockSubmittedResult);
          },
        }),
      };
    },
  },
}));

const mockCreateNotification = vi.fn().mockResolvedValue(undefined);
vi.mock("../../services/notification.service", () => ({
  notificationService: { createNotification: (...args: unknown[]) => mockCreateNotification(...args) },
}));

const mockSendPush = vi.fn().mockResolvedValue({ attempted: 1, sent: 1 });
vi.mock("../../services/push.service", () => ({
  sendToUser: (...args: unknown[]) => mockSendPush(...args),
}));

// Unit-tests dispatch logic only — the real per-room tenant-context wiring
// is exercised for real against Postgres in the manual verification pass.
vi.mock("../../db/backgroundTenantContext", () => ({
  runInBackgroundTenantContext: (_orgId: string, _userId: string, fn: () => Promise<unknown>) => fn(),
}));

import { notifyWindowOpened, notifyWindowClosing } from "../attendanceWindowNotifier";

const staffUser = (overrides: Partial<Record<string, any>> = {}) => ({
  id: "staff-1",
  organizationId: "org-1",
  preferences: null,
  ...overrides,
});

const room = {
  id: "room-1",
  title: "Weekly Sync",
  organizationId: "org-1",
  createdBy: "creator-1",
  attendanceWindowAfter: 30,
  scheduledEnd: new Date("2026-08-20T12:00:00Z"),
};

describe("attendanceWindowNotifier — dispatch (#71)", () => {
  beforeEach(() => {
    selectCallCount = 0;
    mockCreateNotification.mockClear();
    mockSendPush.mockClear();
    mockAssignmentsResult = [];
    mockUsersResult = [staffUser()];
    mockSubmittedResult = [];
  });

  describe("notifyWindowOpened", () => {
    it("notifies staff via in_app + normal-urgency push (not critical, subject to mutes)", async () => {
      await notifyWindowOpened(room);

      expect(mockCreateNotification).toHaveBeenCalledTimes(1);
      expect(mockCreateNotification.mock.calls[0]?.[0]).toMatchObject({ type: "ATTENDANCE_WINDOW_OPENED" });
      expect(mockSendPush).toHaveBeenCalledTimes(1);
      expect(mockSendPush.mock.calls[0]?.[2]).toBeUndefined(); // no urgency override -> defaults inside push.service
    });

    it("is muted for a staff member who muted web_push", async () => {
      mockUsersResult = [staffUser({ preferences: { mutedChannels: ["web_push"] } })];

      await notifyWindowOpened(room);

      expect(mockCreateNotification).toHaveBeenCalledTimes(1); // in_app still goes out
      expect(mockSendPush).not.toHaveBeenCalled(); // push muted
    });
  });

  describe("notifyWindowClosing", () => {
    it("reaches an unmarked staff member with HIGH urgency push, bypassing mutes (critical)", async () => {
      mockUsersResult = [staffUser({ preferences: { mutedChannels: ["web_push", "in_app"] } })];
      mockSubmittedResult = [];

      await notifyWindowClosing(room);

      expect(mockCreateNotification).toHaveBeenCalledTimes(1); // critical -> unfiltered by mutes
      expect(mockSendPush).toHaveBeenCalledTimes(1);
      expect(mockSendPush.mock.calls[0]?.[2]).toMatchObject({ urgency: "high" });
    });

    it("does not notify a staff member who already marked attendance", async () => {
      mockUsersResult = [staffUser({ id: "staff-1" })];
      mockSubmittedResult = [{ submittedBy: "staff-1" }];

      await notifyWindowClosing(room);

      expect(mockCreateNotification).not.toHaveBeenCalled();
      expect(mockSendPush).not.toHaveBeenCalled();
    });

    it("notifies only the unmarked subset when some staff already marked attendance", async () => {
      mockUsersResult = [staffUser({ id: "staff-1" }), staffUser({ id: "staff-2" })];
      mockSubmittedResult = [{ submittedBy: "staff-1" }];

      await notifyWindowClosing(room);

      expect(mockCreateNotification).toHaveBeenCalledTimes(1);
      expect(mockCreateNotification.mock.calls[0]?.[0].userId).toBe("staff-2");
    });
  });
});
