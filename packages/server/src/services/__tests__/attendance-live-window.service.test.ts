import { describe, expect, it } from "vitest";
import { buildLiveAttendanceWindow, isWithinAttendanceWindow } from "../attendance-live-window.service";

describe("attendance-live-window.service", () => {
  describe("buildLiveAttendanceWindow", () => {
    it("returns null when room has not started live event yet", () => {
      expect(buildLiveAttendanceWindow(null, null)).toBeNull();
    });

    it("builds a live window when room has started but not ended", () => {
      const start = new Date("2026-01-01T10:00:00.000Z");
      const window = buildLiveAttendanceWindow(start, null);

      expect(window).toEqual({ start, end: null });
    });

    it("builds a bounded live window when room has ended", () => {
      const start = new Date("2026-01-01T10:00:00.000Z");
      const end = new Date("2026-01-01T11:00:00.000Z");
      const window = buildLiveAttendanceWindow(start, end);

      expect(window).toEqual({ start, end });
    });
  });

  describe("isWithinAttendanceWindow", () => {
    const scheduledStart = new Date("2026-05-17T10:00:00Z");
    const scheduledEnd = new Date("2026-05-17T12:00:00Z");

    describe("cancelled room status", () => {
      it("always returns false", () => {
        const room = {
          status: "cancelled" as const,
          scheduledStart,
          scheduledEnd,
          actualStart: null,
          actualEnd: null,
        };
        const now = new Date("2026-05-17T11:00:00Z");
        expect(isWithinAttendanceWindow(room, now, 15, 30)).toBe(false);
      });
    });

    describe("live room status", () => {
      it("returns true when room is active (actualEnd is null)", () => {
        const room = {
          status: "live" as const,
          scheduledStart,
          scheduledEnd,
          actualStart: new Date("2026-05-17T09:55:00Z"),
          actualEnd: null,
        };
        const now = new Date("2026-05-17T11:00:00Z");
        expect(isWithinAttendanceWindow(room, now, 15, 30)).toBe(true);
      });

      it("returns true when room is active and now is within afterMinutes buffer from actualEnd if actualEnd is set", () => {
        const actualEnd = new Date("2026-05-17T11:00:00Z");
        const room = {
          status: "live" as const,
          scheduledStart,
          scheduledEnd,
          actualStart: new Date("2026-05-17T09:55:00Z"),
          actualEnd,
        };
        // exactly on limits, and within limit
        expect(isWithinAttendanceWindow(room, new Date("2026-05-17T11:20:00Z"), 15, 30)).toBe(true);
        expect(isWithinAttendanceWindow(room, new Date("2026-05-17T11:30:00Z"), 15, 30)).toBe(true);
      });

      it("returns false when room is active but actualEnd is set and now is past afterMinutes buffer", () => {
        const actualEnd = new Date("2026-05-17T11:00:00Z");
        const room = {
          status: "live" as const,
          scheduledStart,
          scheduledEnd,
          actualStart: new Date("2026-05-17T09:55:00Z"),
          actualEnd,
        };
        expect(isWithinAttendanceWindow(room, new Date("2026-05-17T11:31:00Z"), 15, 30)).toBe(false);
      });
    });

    describe("ended room status", () => {
      it("returns false if actualEnd is not set", () => {
        const room = {
          status: "ended" as const,
          scheduledStart,
          scheduledEnd,
          actualStart: new Date("2026-05-17T09:55:00Z"),
          actualEnd: null,
        };
        const now = new Date("2026-05-17T11:00:00Z");
        expect(isWithinAttendanceWindow(room, now, 15, 30)).toBe(false);
      });

      it("returns true if now is within the afterMinutes buffer since actualEnd", () => {
        const actualEnd = new Date("2026-05-17T11:00:00Z");
        const room = {
          status: "ended" as const,
          scheduledStart,
          scheduledEnd,
          actualStart: new Date("2026-05-17T09:55:00Z"),
          actualEnd,
        };
        expect(isWithinAttendanceWindow(room, new Date("2026-05-17T11:15:00Z"), 15, 30)).toBe(true);
        expect(isWithinAttendanceWindow(room, new Date("2026-05-17T11:30:00Z"), 15, 30)).toBe(true);
      });

      it("returns false if now is beyond the afterMinutes buffer since actualEnd", () => {
        const actualEnd = new Date("2026-05-17T11:00:00Z");
        const room = {
          status: "ended" as const,
          scheduledStart,
          scheduledEnd,
          actualStart: new Date("2026-05-17T09:55:00Z"),
          actualEnd,
        };
        expect(isWithinAttendanceWindow(room, new Date("2026-05-17T11:30:01Z"), 15, 30)).toBe(false);
      });
    });

    describe("scheduled room status", () => {
      it("returns true if now is within the beforeMinutes buffer of scheduledStart", () => {
        const room = {
          status: "scheduled" as const,
          scheduledStart,
          scheduledEnd,
          actualStart: null,
          actualEnd: null,
        };
        // exactly on buffer start: 09:45:00Z
        expect(isWithinAttendanceWindow(room, new Date("2026-05-17T09:45:00Z"), 15, 30)).toBe(true);
        expect(isWithinAttendanceWindow(room, new Date("2026-05-17T09:50:00Z"), 15, 30)).toBe(true);
      });

      it("returns false if now is before the beforeMinutes buffer of scheduledStart", () => {
        const room = {
          status: "scheduled" as const,
          scheduledStart,
          scheduledEnd,
          actualStart: null,
          actualEnd: null,
        };
        expect(isWithinAttendanceWindow(room, new Date("2026-05-17T09:44:59Z"), 15, 30)).toBe(false);
      });

      it("returns true if now is between scheduledStart and scheduledEnd", () => {
        const room = {
          status: "scheduled" as const,
          scheduledStart,
          scheduledEnd,
          actualStart: null,
          actualEnd: null,
        };
        expect(isWithinAttendanceWindow(room, new Date("2026-05-17T10:30:00Z"), 15, 30)).toBe(true);
        expect(isWithinAttendanceWindow(room, new Date("2026-05-17T12:00:00Z"), 15, 30)).toBe(true);
      });

      it("returns false if now is after scheduledEnd", () => {
        const room = {
          status: "scheduled" as const,
          scheduledStart,
          scheduledEnd,
          actualStart: null,
          actualEnd: null,
        };
        expect(isWithinAttendanceWindow(room, new Date("2026-05-17T12:00:01Z"), 15, 30)).toBe(false);
      });
    });
  });
});
