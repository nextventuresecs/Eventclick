import { describe, expect, it } from "vitest";
import { buildLiveAttendanceWindow } from "../attendance-live-window.service";

describe("attendance-live-window.service", () => {
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
