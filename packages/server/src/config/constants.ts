// Magic numbers extracted from auth services and other areas
export const CACHE_TTL_USER = 120; // seconds
export const CACHE_TTL_NULL_USER = 30; // seconds
export const TOKEN_EXPIRY_24H_MS = 24 * 60 * 60 * 1000; // 24 hours in ms
export const TOKEN_EXPIRY_1H_MS = 60 * 60 * 1000; // 1 hour in ms

// EVENT_STREAM_STATE_CHANGED debounce (services/event-stream-notification.service.ts)
export const EVENT_STREAM_STATE_DEBOUNCE_MS = 3000; // coalesce rapid live/pause/resume toggles on the same room into one notification

// Attendance window notification job (jobs/attendanceWindowNotifier.ts)
export const ATTENDANCE_WINDOW_CLOSING_LOOKAHEAD_MIN = 5; // warn this many minutes before the post-event grace window closes
export const ATTENDANCE_WINDOW_NOTIFIER_POLL_MS = 60 * 1000; // 1 minute poll interval
export const ATTENDANCE_WINDOW_NOTIFIER_LOCK_TTL_SEC = 50; // must stay under the poll interval above

// ─── Event expiry notifier (jobs/eventExpiryNotifier.ts) ───────────────────
export const EVENT_EXPIRY_NOTIFIER_POLL_MS = 5 * 60 * 1000; // 5 minute poll interval
export const EVENT_EXPIRY_NOTIFIER_LOCK_TTL_SEC = 280; // must stay under the poll interval above
// How far back the expiry poll will look. Bounds the first run against real
// data: without it, the very first poll would match every scheduled room that
// ever passed without starting and notify people about events they stopped
// caring about months ago. Rooms older than this are left permanently
// unnotified, which is the right outcome for stale history.
export const EVENT_EXPIRY_LOOKBACK_HOURS = 72;
