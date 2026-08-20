import { describe, it, expect } from "vitest";
import { selectRoomsDueForStartNotification } from "../eventStartNotifier";

const NOW = new Date("2026-08-20T10:00:00Z");
const LOOKAHEAD_MIN = 10;

const room = (overrides: Partial<Parameters<typeof selectRoomsDueForStartNotification>[0][number]>) => ({
  id: "room-1",
  scheduledStart: new Date("2026-08-20T10:05:00Z"),
  status: "scheduled" as const,
  startNotifiedAt: null,
  ...overrides,
});

describe("selectRoomsDueForStartNotification", () => {
  it("includes a scheduled room starting within the lookahead window", () => {
    const due = selectRoomsDueForStartNotification([room({})], NOW, LOOKAHEAD_MIN);
    expect(due.map((r) => r.id)).toEqual(["room-1"]);
  });

  it("excludes a room already notified, even if still in the window", () => {
    const due = selectRoomsDueForStartNotification(
      [room({ startNotifiedAt: new Date("2026-08-20T09:59:00Z") })],
      NOW,
      LOOKAHEAD_MIN,
    );
    expect(due).toEqual([]);
  });

  it("excludes a room that is no longer scheduled (cancelled/live/etc.)", () => {
    const due = selectRoomsDueForStartNotification([room({ status: "cancelled" })], NOW, LOOKAHEAD_MIN);
    expect(due).toEqual([]);
  });

  it("excludes a room starting beyond the lookahead window", () => {
    const due = selectRoomsDueForStartNotification(
      [room({ scheduledStart: new Date("2026-08-20T10:15:01Z") })],
      NOW,
      LOOKAHEAD_MIN,
    );
    expect(due).toEqual([]);
  });

  it("excludes a room whose start already passed", () => {
    const due = selectRoomsDueForStartNotification(
      [room({ scheduledStart: new Date("2026-08-20T09:59:59Z") })],
      NOW,
      LOOKAHEAD_MIN,
    );
    expect(due).toEqual([]);
  });
});
