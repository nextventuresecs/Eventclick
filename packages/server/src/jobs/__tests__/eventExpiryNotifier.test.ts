import { describe, it, expect, vi, beforeEach } from "vitest";

let selectedRooms: any[] = [];
let capturedWhere: unknown = null;
const mockUpdateWhere = vi.fn().mockResolvedValue(undefined);

vi.mock("../../db", () => ({
  authDb: {
    select: () => ({
      from: () => ({
        where: (clause: unknown) => {
          capturedWhere = clause;
          return Promise.resolve(selectedRooms);
        },
      }),
    }),
    update: () => ({
      set: (values: unknown) => ({
        where: (clause: unknown) => mockUpdateWhere(values, clause),
      }),
    }),
  },
}));

// The job's whole reason for opening one of these per room is that a poll has
// no ambient request to inherit a tenant from — run the callback so the
// dispatcher below is actually exercised.
const mockBackgroundContext = vi.fn(async (_org: string, _user: string, fn: () => Promise<any>) => fn());
vi.mock("../../db/backgroundTenantContext", () => ({
  runInBackgroundTenantContext: (org: string, user: string, fn: () => Promise<any>) =>
    mockBackgroundContext(org, user, fn),
}));

const mockNotify = vi.fn().mockResolvedValue({ attempted: 2, succeeded: 2 });
vi.mock("../../services/event-cancellation-notification.service", () => ({
  notifyEventCancelledOrExpired: (...args: unknown[]) => mockNotify(...args),
}));

vi.mock("../../config/redis", () => ({ redisClient: { isOpen: false } }));

import { runEventExpiryNotifications, expiryLookbackStart } from "../eventExpiryNotifier";
import { EVENT_EXPIRY_LOOKBACK_HOURS } from "../../config/constants";

const room = (over: Record<string, unknown> = {}) => ({
  id: "room-1",
  organizationId: "org-1",
  createdBy: "creator-1",
  title: "Field Visit",
  scheduledStart: new Date("2026-09-01T09:00:00.000Z"),
  scheduledEnd: new Date("2026-09-01T11:00:00.000Z"),
  ...over,
});

describe("eventExpiryNotifier (#75)", () => {
  beforeEach(() => {
    mockNotify.mockClear();
    mockUpdateWhere.mockClear();
    mockBackgroundContext.mockClear();
    mockNotify.mockResolvedValue({ attempted: 2, succeeded: 2 });
    capturedWhere = null;
    selectedRooms = [];
  });

  it("notifies an expired room with reason 'expired' and stamps the marker", async () => {
    selectedRooms = [room()];

    await runEventExpiryNotifications(new Date("2026-09-01T12:00:00.000Z"));

    expect(mockNotify).toHaveBeenCalledTimes(1);
    expect(mockNotify.mock.calls[0]?.[1]).toBe("expired");
    expect(mockNotify.mock.calls[0]?.[0]).toMatchObject({ id: "room-1", cancellationReason: null });
    expect(mockUpdateWhere).toHaveBeenCalledTimes(1);
  });

  it("opens a tenant context per room, since a poll has no ambient request", async () => {
    selectedRooms = [room()];

    await runEventExpiryNotifications(new Date("2026-09-01T12:00:00.000Z"));

    expect(mockBackgroundContext).toHaveBeenCalledTimes(1);
    expect(mockBackgroundContext.mock.calls[0]?.[0]).toBe("org-1");
    expect(mockBackgroundContext.mock.calls[0]?.[1]).toBe("creator-1");
  });

  it("leaves the marker unset when every recipient failed, so the next poll retries", async () => {
    selectedRooms = [room()];
    mockNotify.mockResolvedValue({ attempted: 2, succeeded: 0 });

    await runEventExpiryNotifications(new Date("2026-09-01T12:00:00.000Z"));

    expect(mockUpdateWhere).not.toHaveBeenCalled();
  });

  it("still claims the marker on a partial success, so nobody is notified twice", async () => {
    selectedRooms = [room()];
    mockNotify.mockResolvedValue({ attempted: 2, succeeded: 1 });

    await runEventExpiryNotifications(new Date("2026-09-01T12:00:00.000Z"));

    expect(mockUpdateWhere).toHaveBeenCalledTimes(1);
  });

  it("claims the marker for a room with no staff at all", async () => {
    selectedRooms = [room()];
    mockNotify.mockResolvedValue({ attempted: 0, succeeded: 0 });

    await runEventExpiryNotifications(new Date("2026-09-01T12:00:00.000Z"));

    expect(mockUpdateWhere).toHaveBeenCalledTimes(1);
  });

  it("keeps going when one room throws", async () => {
    selectedRooms = [room({ id: "room-1" }), room({ id: "room-2" })];
    mockNotify.mockRejectedValueOnce(new Error("boom"));

    await runEventExpiryNotifications(new Date("2026-09-01T12:00:00.000Z"));

    expect(mockNotify).toHaveBeenCalledTimes(2);
    expect(mockUpdateWhere).toHaveBeenCalledTimes(1);
  });

  // The bound that stops the first run against production data from
  // notifying everyone about every event that ever failed to happen. Asserted
  // on the pure helper rather than the built SQL, which is circular and would
  // only prove that drizzle built something.
  it("bounds the lookback window so the first run cannot flood old events", () => {
    const now = new Date("2026-09-01T12:00:00.000Z");
    const start = expiryLookbackStart(now);

    expect(start.getTime()).toBeLessThan(now.getTime());
    expect((now.getTime() - start.getTime()) / (60 * 60 * 1000)).toBe(EVENT_EXPIRY_LOOKBACK_HOURS);
  });

  it("passes a where clause to the query rather than scanning the table", async () => {
    selectedRooms = [];

    await runEventExpiryNotifications(new Date("2026-09-01T12:00:00.000Z"));

    expect(capturedWhere).toBeTruthy();
  });
});
