import { describe, it, expect } from "vitest";
import {
  selectRoomsDueForWindowOpenNotification,
  selectRoomsDueForWindowClosingNotification,
} from "../attendanceWindowNotifier";

const NOW = new Date("2026-08-20T10:00:00Z");

describe("selectRoomsDueForWindowOpenNotification", () => {
  const room = (overrides: Partial<Parameters<typeof selectRoomsDueForWindowOpenNotification>[0][number]>) => ({
    id: "room-1",
    status: "scheduled" as const,
    scheduledStart: new Date("2026-08-20T10:10:00Z"),
    attendanceWindowBefore: 15,
    attendanceWindowOpenedNotifiedAt: null,
    ...overrides,
  });

  it("includes a scheduled room whose window-open threshold (scheduledStart - before) has been reached", () => {
    // scheduledStart 10:10, before=15min -> opens 09:55, NOW=10:00 is past it
    const due = selectRoomsDueForWindowOpenNotification([room({})], NOW);
    expect(due.map((r) => r.id)).toEqual(["room-1"]);
  });

  it("excludes a room whose window hasn't opened yet", () => {
    const due = selectRoomsDueForWindowOpenNotification(
      [room({ scheduledStart: new Date("2026-08-20T11:00:00Z"), attendanceWindowBefore: 5 })],
      NOW,
    );
    expect(due).toEqual([]);
  });

  it("excludes an already-notified room", () => {
    const due = selectRoomsDueForWindowOpenNotification(
      [room({ attendanceWindowOpenedNotifiedAt: new Date("2026-08-20T09:56:00Z") })],
      NOW,
    );
    expect(due).toEqual([]);
  });

  it("excludes a cancelled or ended room", () => {
    const due = selectRoomsDueForWindowOpenNotification(
      [room({ status: "cancelled" }), room({ status: "ended" })],
      NOW,
    );
    expect(due).toEqual([]);
  });

  it("still includes a room that has since gone live (defensive — poll caught it late)", () => {
    const due = selectRoomsDueForWindowOpenNotification([room({ status: "live" })], NOW);
    expect(due.map((r) => r.id)).toEqual(["room-1"]);
  });
});

describe("selectRoomsDueForWindowClosingNotification", () => {
  const LOOKAHEAD = 5;
  const room = (overrides: Partial<Parameters<typeof selectRoomsDueForWindowClosingNotification>[0][number]>) => ({
    id: "room-1",
    status: "ended" as const,
    actualEnd: new Date("2026-08-20T09:45:00Z"), // + 30min after = closes 10:15
    attendanceWindowAfter: 30,
    attendanceWindowClosingNotifiedAt: null,
    ...overrides,
  });

  it("includes an ended room within the lookahead window before its post-event grace period closes", () => {
    // closes 10:15, lookahead 5min -> warn window [10:10, 10:15], NOW=10:12
    const due = selectRoomsDueForWindowClosingNotification(
      [room({ actualEnd: new Date("2026-08-20T09:42:00Z") })], // + 30 = 10:12 close... adjust below
      new Date("2026-08-20T10:10:00Z"),
      LOOKAHEAD,
    );
    expect(due.map((r) => r.id)).toEqual(["room-1"]);
  });

  it("excludes a room still scheduled or live — no deterministic close time yet", () => {
    const due = selectRoomsDueForWindowClosingNotification(
      [room({ status: "scheduled", actualEnd: null }), room({ status: "live", actualEnd: null })],
      NOW,
      LOOKAHEAD,
    );
    expect(due).toEqual([]);
  });

  it("excludes a room whose window already closed (poll ran late — don't warn after the fact)", () => {
    const due = selectRoomsDueForWindowClosingNotification(
      [room({ actualEnd: new Date("2026-08-20T09:00:00Z") })], // closes 09:30, long past
      NOW,
      LOOKAHEAD,
    );
    expect(due).toEqual([]);
  });

  it("excludes a room whose close time is still further out than the lookahead", () => {
    const due = selectRoomsDueForWindowClosingNotification(
      [room({ actualEnd: new Date("2026-08-20T10:00:00Z") })], // closes 10:30, NOW=10:00, warn window starts 10:25
      NOW,
      LOOKAHEAD,
    );
    expect(due).toEqual([]);
  });

  it("excludes an already-notified room", () => {
    const due = selectRoomsDueForWindowClosingNotification(
      [room({ actualEnd: new Date("2026-08-20T09:42:00Z"), attendanceWindowClosingNotifiedAt: new Date() })],
      new Date("2026-08-20T10:10:00Z"),
      LOOKAHEAD,
    );
    expect(due).toEqual([]);
  });
});
