export interface AttendanceCountRow {
  roomId: string;
  count: number;
}

export const buildAttendanceCountMap = (
  rows: AttendanceCountRow[],
): Map<string, number> =>
  new Map(rows.map((row) => [row.roomId, Number(row.count) || 0]));

export const attendanceCountForRoom = (
  countsByRoomId: Map<string, number>,
  roomId: string,
): number => countsByRoomId.get(roomId) ?? 0;
