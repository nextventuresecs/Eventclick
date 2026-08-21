import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

let mockRoomResult: any[] = [];
let mockAssignmentsResult: any[] = [];
let mockUsersResult: any[] = [];

// The real fan-out issues 3 sequential db.select() calls: room (chains
// .limit(1)), assignments, then users (both awaited directly, no .limit()).
// Route each mocked call by call order, assigned at select() invocation time
// since these calls are sequential (awaited one at a time), not concurrent.
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
  notificationService: {
    createNotification: (...args: unknown[]) => mockCreateNotification(...args),
  },
}));

import { fanOutEventStreamStateChanged, notifyEventStreamStateChanged } from "../event-stream-notification.service";

describe("event-stream-notification.service", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    selectCallCount = 0;
    mockCreateNotification.mockClear();
    mockRoomResult = [{ id: "room-1", title: "Weekly Sync", createdBy: "creator-1" }];
    mockAssignmentsResult = [{ userId: "admin-1" }];
    mockUsersResult = [
      { id: "creator-1" },
      { id: "admin-1" },
    ];
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  describe("fanOutEventStreamStateChanged", () => {
    it("notifies the room creator and assigned admins, deduped", async () => {
      mockAssignmentsResult = [{ userId: "creator-1" }, { userId: "admin-1" }];
      mockUsersResult = [{ id: "creator-1" }, { id: "admin-1" }];

      await fanOutEventStreamStateChanged("room-1", "org-1", "live");

      expect(mockCreateNotification).toHaveBeenCalledTimes(2);
      const recipientIds = mockCreateNotification.mock.calls.map((c) => c[0].userId).sort();
      expect(recipientIds).toEqual(["admin-1", "creator-1"]);
    });

    it("carries the state and roomId in metadata for every recipient", async () => {
      await fanOutEventStreamStateChanged("room-1", "org-1", "recording_started");

      for (const call of mockCreateNotification.mock.calls) {
        expect(call[0]).toMatchObject({
          type: "EVENT_STREAM_STATE_CHANGED",
          organizationId: "org-1",
          metadata: { roomId: "room-1", state: "recording_started" },
        });
      }
    });

    it("does nothing when the room no longer exists (deleted/gone)", async () => {
      mockRoomResult = [];

      await fanOutEventStreamStateChanged("ghost-room", "org-1", "ended");

      expect(mockCreateNotification).not.toHaveBeenCalled();
    });

    it("one recipient's failure doesn't stop the others from being notified", async () => {
      mockCreateNotification
        .mockRejectedValueOnce(new Error("db down for this user"))
        .mockResolvedValueOnce(undefined);

      await expect(fanOutEventStreamStateChanged("room-1", "org-1", "live")).resolves.toBeUndefined();

      expect(mockCreateNotification).toHaveBeenCalledTimes(2);
    });
  });

  describe("notifyEventStreamStateChanged (debounced entry point)", () => {
    // The headline acceptance criterion for #67: rapidly toggling a room's
    // live/pause state N times within the debounce window produces exactly
    // one client-visible notification, carrying the LAST state — not N.
    it("collapses 5 rapid toggles on the same room into exactly one fan-out, with the last state", async () => {
      notifyEventStreamStateChanged("room-1", "org-1", "live");
      notifyEventStreamStateChanged("room-1", "org-1", "recording_started");
      notifyEventStreamStateChanged("room-1", "org-1", "recording_paused");
      notifyEventStreamStateChanged("room-1", "org-1", "recording_started");
      notifyEventStreamStateChanged("room-1", "org-1", "ended");

      await vi.advanceTimersByTimeAsync(3000);

      expect(mockCreateNotification).toHaveBeenCalledTimes(mockCreateNotification.mock.calls.length);
      for (const call of mockCreateNotification.mock.calls) {
        expect(call[0].metadata.state).toBe("ended");
      }
      // Exactly one fan-out ran (2 recipients * 1 fan-out = 2 calls, not 10).
      expect(mockCreateNotification).toHaveBeenCalledTimes(2);
    });

    it("toggling two different rooms does not cross-debounce — each fans out independently", async () => {
      mockAssignmentsResult = [];
      mockUsersResult = [{ id: "creator-1" }];

      notifyEventStreamStateChanged("room-1", "org-1", "live");
      notifyEventStreamStateChanged("room-2", "org-1", "live");

      await vi.advanceTimersByTimeAsync(3000);

      // One recipient per room, both rooms fired (not collapsed into one).
      expect(mockCreateNotification).toHaveBeenCalledTimes(2);
    });
  });
});
