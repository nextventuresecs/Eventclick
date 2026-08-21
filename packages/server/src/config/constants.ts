// Magic numbers extracted from auth services and other areas
export const CACHE_TTL_USER = 120; // seconds
export const CACHE_TTL_NULL_USER = 30; // seconds
export const TOKEN_EXPIRY_24H_MS = 24 * 60 * 60 * 1000; // 24 hours in ms
export const TOKEN_EXPIRY_1H_MS = 60 * 60 * 1000; // 1 hour in ms

// "Room starting soon" notification job (jobs/eventStartNotifier.ts)
export const EVENT_START_NOTIFIER_LOOKAHEAD_MIN = 10; // notify when a room starts within this many minutes
export const EVENT_START_NOTIFIER_POLL_MS = 2 * 60 * 1000; // 2 minutes — must stay well under the lock TTL below
export const EVENT_START_NOTIFIER_LOCK_TTL_SEC = 90; // multi-instance guard so overlapping replicas don't double-run a poll

// EVENT_STREAM_STATE_CHANGED debounce (services/event-stream-notification.service.ts)
export const EVENT_STREAM_STATE_DEBOUNCE_MS = 3000; // coalesce rapid live/pause/resume toggles on the same room into one notification

// Attendance window notification job (jobs/attendanceWindowNotifier.ts)
export const ATTENDANCE_WINDOW_CLOSING_LOOKAHEAD_MIN = 5; // warn this many minutes before the post-event grace window closes
export const ATTENDANCE_WINDOW_NOTIFIER_POLL_MS = 60 * 1000; // 1 minute — tighter than EVENT_START_NOTIFIER_POLL_MS since the closing warning has a 5-minute window to land in
export const ATTENDANCE_WINDOW_NOTIFIER_LOCK_TTL_SEC = 50; // must stay under the poll interval above
