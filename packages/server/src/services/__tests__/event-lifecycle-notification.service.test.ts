import { describe, it, expect, vi, beforeEach } from "vitest";

let mockAssignmentsResult: any[] = [];
let mockUsersResult: any[] = [];
let mockRecordingResult: any[] = [];

let selectCallCount = 0;
vi.mock("../../db", () => ({
  db: {
    select: () => {
      const callNum = ++selectCallCount;
      return {
        from: () => ({
          where: () => {
            // notifyEventEnded's recording lookup chains .orderBy().limit();
            // notifyEventStarted never calls db.select a 3rd time.
            if (callNum === 1) return Promise.resolve(mockAssignmentsResult);
            if (callNum === 2) return Promise.resolve(mockUsersResult);
            return {
              orderBy: () => ({
                limit: () => Promise.resolve(mockRecordingResult),
              }),
            };
          },
        }),
      };
    },
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

vi.mock("../storage.service", () => ({
  buildPublicUrl: (key: string) => `https://cdn.example.com/${key}`,
}));

import { notifyEventStarted, notifyEventEnded } from "../event-lifecycle-notification.service";

const staffUser = (overrides: Partial<Record<string, any>> = {}) => ({
  id: "staff-1",
  email: "staff-1@example.com",
  organizationId: "org-1",
  preferences: null,
  ...overrides,
});

const room = {
  id: "room-1",
  title: "Weekly Sync",
  organizationId: "org-1",
  createdBy: "creator-1",
  shareToken: "share-token-abc",
  notifyEmailOnStart: false,
};

describe("event-lifecycle-notification.service (#72)", () => {
  beforeEach(() => {
    selectCallCount = 0;
    mockCreateNotification.mockClear();
    mockSendPush.mockClear();
    mockDispatchEmail.mockClear();
    mockAssignmentsResult = [];
    mockUsersResult = [staffUser()];
    mockRecordingResult = [];
  });

  describe("notifyEventStarted", () => {
    it("notifies staff via in_app + push but not email when notifyEmailOnStart is false", async () => {
      await notifyEventStarted(room);

      expect(mockCreateNotification).toHaveBeenCalledTimes(1);
      expect(mockCreateNotification.mock.calls[0]?.[0]).toMatchObject({ type: "EVENT_STARTED" });
      expect(mockSendPush).toHaveBeenCalledTimes(1);
      expect(mockDispatchEmail).not.toHaveBeenCalled();
    });

    it("also emails when the room opted in via notifyEmailOnStart", async () => {
      await notifyEventStarted({ ...room, notifyEmailOnStart: true });

      expect(mockDispatchEmail).toHaveBeenCalledTimes(1);
      expect(mockDispatchEmail.mock.calls[0]?.[0]).toMatchObject({
        type: "event-started",
        recipientEmail: "staff-1@example.com",
        payload: { roomTitle: "Weekly Sync", watchUrl: expect.stringContaining("share-token-abc") },
      });
    });

    it("is muted for a staff member who muted web_push, even with the email flag on", async () => {
      mockUsersResult = [staffUser({ preferences: { mutedChannels: ["web_push"] } })];

      await notifyEventStarted({ ...room, notifyEmailOnStart: true });

      expect(mockCreateNotification).toHaveBeenCalledTimes(1);
      expect(mockSendPush).not.toHaveBeenCalled();
      expect(mockDispatchEmail).toHaveBeenCalledTimes(1);
    });

    it("never emails a muted recipient even with the flag on, if email itself is muted", async () => {
      mockUsersResult = [staffUser({ preferences: { mutedChannels: ["email"] } })];

      await notifyEventStarted({ ...room, notifyEmailOnStart: true });

      expect(mockDispatchEmail).not.toHaveBeenCalled();
    });
  });

  describe("notifyEventEnded", () => {
    const endedRoom = { id: "room-1", title: "Weekly Sync", organizationId: "org-1", createdBy: "creator-1" };

    it("notifies in_app + email with the recording link omitted when no completed recording exists", async () => {
      mockRecordingResult = [];

      await notifyEventEnded(endedRoom);

      expect(mockCreateNotification).toHaveBeenCalledTimes(1);
      expect(mockCreateNotification.mock.calls[0]?.[0].metadata.recordingUrl).toBeUndefined();
      expect(mockDispatchEmail).toHaveBeenCalledTimes(1);
      expect(mockDispatchEmail.mock.calls[0]?.[0].payload.recordingUrl).toBeUndefined();
    });

    it("includes the recording link once a completed recording row exists", async () => {
      mockRecordingResult = [{ status: "completed", s3Key: "recordings/room-1/full.mp4" }];

      await notifyEventEnded(endedRoom);

      expect(mockCreateNotification.mock.calls[0]?.[0].metadata.recordingUrl).toBe(
        "https://cdn.example.com/recordings/room-1/full.mp4",
      );
      expect(mockDispatchEmail.mock.calls[0]?.[0].payload.recordingUrl).toBe(
        "https://cdn.example.com/recordings/room-1/full.mp4",
      );
    });

    it("omits the link when a recording exists but hasn't finished processing", async () => {
      mockRecordingResult = [{ status: "pending", s3Key: null }];

      await notifyEventEnded(endedRoom);

      expect(mockCreateNotification.mock.calls[0]?.[0].metadata.recordingUrl).toBeUndefined();
    });
  });
});
