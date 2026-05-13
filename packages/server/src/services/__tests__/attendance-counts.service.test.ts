import { describe, expect, it } from "vitest";
import {
  attendanceCountForRoom,
  buildAttendanceCountMap,
} from "../attendance-counts.service";

describe("attendance-counts.service", () => {
  it("builds a room->count map", () => {
    const map = buildAttendanceCountMap([
      { roomId: "room-1", count: 3 },
      { roomId: "room-2", count: 7 },
    ]);

    expect(map.get("room-1")).toBe(3);
    expect(map.get("room-2")).toBe(7);
  });

  it("returns zero when a room has no attendance entries", () => {
    const map = buildAttendanceCountMap([{ roomId: "room-1", count: 3 }]);

    expect(attendanceCountForRoom(map, "room-unknown")).toBe(0);
  });
});
