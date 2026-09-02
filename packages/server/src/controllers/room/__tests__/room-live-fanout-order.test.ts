import { describe, it, expect, vi, beforeEach } from "vitest";

// The fix for #97 is an `await` — invisible in behaviour unless something
// asserts ordering. These tests pin it: the fan-out must resolve before the
// response ends, because tenantContext releases the request's pinned
// connection on res.on("finish") and the db proxy inside the fan-out would
// still be resolving to that released client.

const order: string[] = [];

const mockReturning = vi.fn();
vi.mock("../../../db", () => ({
  db: {
    update: () => ({
      set: () => ({ where: () => ({ returning: () => mockReturning() }) }),
    }),
  },
}));

vi.mock("../../../services/event-assignment.service", () => ({
  assertRoomAccessForUser: vi.fn().mockResolvedValue(undefined),
  assertRoomAccessWithRoom: vi.fn().mockResolvedValue(undefined),
}));
vi.mock("../../../services/activity.service", () => ({
  validateActivityQuotas: vi.fn().mockResolvedValue(undefined),
}));
vi.mock("../../../services/streaming", () => ({ streamingService: { issueToken: vi.fn() } }));
vi.mock("../../../services/presence.service", () => ({ getRoomPresence: vi.fn() }));
vi.mock("../../../services/auth", () => ({ findUserById: vi.fn() }));
vi.mock("../../../services/event-stream-notification.service", () => ({
  notifyEventStreamStateChanged: vi.fn(),
}));
vi.mock("../../../services/user-left-notification.service", () => ({
  rememberActiveRoom: vi.fn(),
  forgetActiveRoom: vi.fn(),
  notifyUserLeftEvent: vi.fn(),
}));

const fanOutDelay = () =>
  new Promise<void>((resolve) =>
    setTimeout(() => {
      order.push("fan-out");
      resolve();
    }, 0),
  );

const mockNotifyStarted = vi.fn(fanOutDelay);
const mockNotifyEnded = vi.fn(fanOutDelay);
vi.mock("../../../services/event-lifecycle-notification.service", () => ({
  notifyEventStarted: (...args: unknown[]) => mockNotifyStarted(...(args as [])),
  notifyEventEnded: (...args: unknown[]) => mockNotifyEnded(...(args as [])),
}));

import { startLive, stopLive } from "../room-live.controller";

const NOW = new Date("2026-09-03T00:00:00.000Z");
// Enough of an event_rooms row for toEventRoom() to serialise.
const ROOM = {
  id: "room-1",
  organizationId: "org-1",
  createdBy: "creator-1",
  title: "Weekly Sync",
  description: null,
  status: "live",
  scheduledStart: NOW,
  scheduledEnd: NOW,
  actualStart: NOW,
  actualEnd: null,
  maxParticipants: null,
  shareToken: "tok",
  streamProvider: "livekit",
  youtubeWatchUrl: null,
  youtubeEmbedUrl: null,
  attendanceWindowBefore: 15,
  attendanceWindowAfter: 30,
  notifyEmailOnStart: false,
  location: null,
  latitude: null,
  longitude: null,
  activityDefinitions: [],
  cancellationReason: null,
  createdAt: NOW,
  updatedAt: NOW,
};

const makeReq = (): any => ({
  user: { id: "user-1", organizationId: "org-1", role: "ngo" },
  params: { id: "room-1" },
});
const makeRes = (): any => ({
  json: vi.fn(() => {
    order.push("response");
  }),
  status: vi.fn().mockReturnThis(),
  end: vi.fn(),
});

describe("room live fan-out ordering (#97)", () => {
  beforeEach(() => {
    order.length = 0;
    vi.clearAllMocks();
    // Two update() calls per handler: the status write, then the marker claim.
    mockReturning.mockResolvedValueOnce([ROOM]).mockResolvedValueOnce([ROOM]);
  });

  it("finishes the EVENT_STARTED fan-out before responding to start", async () => {
    const next = vi.fn();

    await startLive(makeReq(), makeRes(), next);

    expect(next).not.toHaveBeenCalled();
    expect(order).toEqual(["fan-out", "response"]);
  });

  it("finishes the EVENT_ENDED fan-out before responding to stop", async () => {
    const next = vi.fn();

    await stopLive(makeReq(), makeRes(), next);

    expect(next).not.toHaveBeenCalled();
    expect(order).toEqual(["fan-out", "response"]);
  });

  it("still answers the request when the fan-out fails", async () => {
    // The room has started either way — a notification failure must not turn
    // into a failed start.
    mockNotifyStarted.mockRejectedValueOnce(new Error("redis down"));
    const res = makeRes();
    const next = vi.fn();

    await startLive(makeReq(), res, next);

    expect(next).not.toHaveBeenCalled();
    expect(res.json).toHaveBeenCalledTimes(1);
  });

  it("skips the fan-out entirely when the marker was already claimed", async () => {
    // Second click of "Go Live": the claim returns no row.
    mockReturning.mockReset();
    mockReturning.mockResolvedValueOnce([ROOM]).mockResolvedValueOnce([]);
    const res = makeRes();

    await startLive(makeReq(), res, vi.fn());

    expect(mockNotifyStarted).not.toHaveBeenCalled();
    expect(res.json).toHaveBeenCalledTimes(1);
  });
});
