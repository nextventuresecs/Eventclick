import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

let mockRoomResult: any[] = [];
let mockLeaverResult: any[] = [];
let mockAssignmentsResult: any[] = [];
let mockUsersResult: any[] = [];

// The real fan-out issues 4 sequential db.select() calls: room and leaver
// (both chain .limit(1)), then assignments and users (both awaited directly).
// Route each mocked call by call order — the calls are sequential, not
// concurrent, so the counter is assigned at select() invocation time.
let selectCallCount = 0;
vi.mock("../../db", () => ({
  db: {
    select: () => {
      const callNum = ++selectCallCount;
      return {
        from: () => ({
          where: () => ({
            limit: () => Promise.resolve(callNum === 1 ? mockRoomResult : mockLeaverResult),
            then: (onFulfilled: (v: any[]) => void, onRejected?: (err: unknown) => void) => {
              const result = callNum === 3 ? mockAssignmentsResult : mockUsersResult;
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
  notificationService: {
    createNotification: (...args: unknown[]) => mockCreateNotification(...args),
  },
}));

// USER_LEFT_EVENT is in_app only. These two are mocked purely so the test can
// assert nothing in the dispatch path reaches for them — if someone later
// imports a push or email send here, these spies catch it.
const mockSendPush = vi.fn().mockResolvedValue(undefined);
vi.mock("../push.service", () => ({
  isPushConfigured: () => true,
  sendToUser: (...args: unknown[]) => mockSendPush(...args),
  sendToSubscription: (...args: unknown[]) => mockSendPush(...args),
}));

// Every real send* export of email.service, so an accidental import of any
// of them lands on a spy rather than the real Resend client.
const mockSendEmail = vi.fn().mockResolvedValue(undefined);
vi.mock("../email.service", () => {
  const spy = (...args: unknown[]) => mockSendEmail(...args);
  return {
    sendPasswordResetEmail: spy,
    sendReportReadyEmail: spy,
    sendVerificationEmail: spy,
    sendInviteEmail: spy,
    sendEventStartedEmail: spy,
    sendEventEndedEmail: spy,
    sendOrgBroadcastEmail: spy,
    sendEventCancelledEmail: spy,
  };
});

vi.mock("../../db/backgroundTenantContext", () => ({
  runInBackgroundTenantContext: (_orgId: string, _userId: string, fn: () => Promise<unknown>) => fn(),
}));

const redisStore = new Map<string, string>();
const mockRedis = {
  isOpen: true,
  setEx: vi.fn(async (key: string, _ttl: number, value: string) => {
    redisStore.set(key, value);
  }),
  get: vi.fn(async (key: string) => redisStore.get(key) ?? null),
  del: vi.fn(async (key: string) => {
    redisStore.delete(key);
  }),
};
vi.mock("../../config/redis", () => ({
  redisClient: {
    get isOpen() {
      return mockRedis.isOpen;
    },
    setEx: (...args: [string, number, string]) => mockRedis.setEx(...args),
    get: (...args: [string]) => mockRedis.get(...args),
    del: (...args: [string]) => mockRedis.del(...args),
  },
}));

import {
  fanOutUserLeftEvent,
  notifyUserLeftEvent,
  rememberActiveRoom,
  readActiveRoom,
  forgetActiveRoom,
} from "../user-left-notification.service";

describe("user-left-notification.service", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    selectCallCount = 0;
    redisStore.clear();
    mockRedis.isOpen = true;
    mockCreateNotification.mockClear();
    mockCreateNotification.mockResolvedValue(undefined);
    mockSendPush.mockClear();
    mockSendEmail.mockClear();
    mockRoomResult = [{ id: "room-1", title: "Weekly Sync", createdBy: "creator-1" }];
    mockLeaverResult = [{ id: "attendee-1", fullName: "Asha Rao" }];
    mockAssignmentsResult = [{ userId: "admin-1" }];
    mockUsersResult = [{ id: "creator-1" }, { id: "admin-1" }];
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  describe("fanOutUserLeftEvent", () => {
    it("notifies the room creator and assigned admins", async () => {
      await fanOutUserLeftEvent("room-1", "org-1", "attendee-1", "left");

      expect(mockCreateNotification).toHaveBeenCalledTimes(2);
      const recipientIds = mockCreateNotification.mock.calls.map((c) => c[0].userId).sort();
      expect(recipientIds).toEqual(["admin-1", "creator-1"]);
    });

    it("carries roomId, the leaver and the reason in metadata", async () => {
      await fanOutUserLeftEvent("room-1", "org-1", "attendee-1", "logged_out");

      for (const call of mockCreateNotification.mock.calls) {
        expect(call[0]).toMatchObject({
          type: "USER_LEFT_EVENT",
          organizationId: "org-1",
          metadata: { roomId: "room-1", userId: "attendee-1", reason: "logged_out" },
        });
      }
    });

    it("never tells the leaver that they themselves left", async () => {
      mockLeaverResult = [{ id: "admin-1", fullName: "Admin One" }];

      await fanOutUserLeftEvent("room-1", "org-1", "admin-1", "left");

      const recipientIds = mockCreateNotification.mock.calls.map((c) => c[0].userId);
      expect(recipientIds).toEqual(["creator-1"]);
    });

    it("fires no push and no email — this event kind is in_app only", async () => {
      await fanOutUserLeftEvent("room-1", "org-1", "attendee-1", "left");

      expect(mockCreateNotification).toHaveBeenCalledTimes(2);
      expect(mockSendPush).not.toHaveBeenCalled();
      expect(mockSendEmail).not.toHaveBeenCalled();
    });

    it("does nothing when the room no longer exists", async () => {
      mockRoomResult = [];

      await fanOutUserLeftEvent("ghost-room", "org-1", "attendee-1", "left");

      expect(mockCreateNotification).not.toHaveBeenCalled();
    });

    it("one recipient's failure doesn't stop the others from being notified", async () => {
      mockCreateNotification
        .mockRejectedValueOnce(new Error("db down for this user"))
        .mockResolvedValueOnce(undefined);

      await expect(fanOutUserLeftEvent("room-1", "org-1", "attendee-1", "left")).resolves.toBeUndefined();
      expect(mockCreateNotification).toHaveBeenCalledTimes(2);
    });
  });

  describe("notifyUserLeftEvent debounce", () => {
    it("collapses one user's rapid leave/rejoin churn into a single alert", async () => {
      notifyUserLeftEvent("room-1", "org-1", "attendee-1", "left");
      vi.advanceTimersByTime(1000);
      notifyUserLeftEvent("room-1", "org-1", "attendee-1", "left");
      vi.advanceTimersByTime(1000);
      notifyUserLeftEvent("room-1", "org-1", "attendee-1", "logged_out");

      await vi.advanceTimersByTimeAsync(3000);

      // 2 recipients × exactly one fan-out, carrying the latest reason.
      expect(mockCreateNotification).toHaveBeenCalledTimes(2);
      expect(mockCreateNotification.mock.calls[0]?.[0].metadata.reason).toBe("logged_out");
    });

    it("keeps two different users leaving in the same window as two alerts", async () => {
      notifyUserLeftEvent("room-1", "org-1", "attendee-1", "left");
      notifyUserLeftEvent("room-1", "org-1", "attendee-2", "left");

      await vi.advanceTimersByTimeAsync(3000);

      // 2 users × 2 recipients. A room-keyed debounce would drop one user.
      expect(mockCreateNotification).toHaveBeenCalledTimes(4);
      const leavers = new Set(mockCreateNotification.mock.calls.map((c) => c[0].metadata.userId));
      expect(leavers).toEqual(new Set(["attendee-1", "attendee-2"]));
    });
  });

  describe("active room memory", () => {
    it("round-trips the room and org a user is in", async () => {
      await rememberActiveRoom("attendee-1", { roomId: "room-1", organizationId: "org-1" });

      await expect(readActiveRoom("attendee-1")).resolves.toEqual({
        roomId: "room-1",
        organizationId: "org-1",
      });
    });

    it("forgets it on leave, so a later logout emits nothing", async () => {
      await rememberActiveRoom("attendee-1", { roomId: "room-1", organizationId: "org-1" });
      await forgetActiveRoom("attendee-1");

      await expect(readActiveRoom("attendee-1")).resolves.toBeNull();
    });

    it("degrades to no memory — not an error — when Redis is down", async () => {
      mockRedis.isOpen = false;

      await expect(
        rememberActiveRoom("attendee-1", { roomId: "room-1", organizationId: "org-1" }),
      ).resolves.toBeUndefined();
      await expect(readActiveRoom("attendee-1")).resolves.toBeNull();
    });
  });
});
