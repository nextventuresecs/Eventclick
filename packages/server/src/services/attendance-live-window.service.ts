export const buildLiveAttendanceWindow = (
  actualStart: Date | null,
  actualEnd: Date | null,
): { start: Date; end: Date | null } | null => {
  if (!actualStart) return null;
  return { start: actualStart, end: actualEnd };
};
