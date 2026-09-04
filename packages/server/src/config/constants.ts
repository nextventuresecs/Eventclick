// Magic numbers extracted from auth services and other areas
export const CACHE_TTL_USER = 120; // seconds
export const CACHE_TTL_NULL_USER = 30; // seconds
export const TOKEN_EXPIRY_24H_MS = 24 * 60 * 60 * 1000; // 24 hours in ms
export const TOKEN_EXPIRY_1H_MS = 60 * 60 * 1000; // 1 hour in ms

// EVENT_STREAM_STATE_CHANGED debounce (services/event-stream-notification.service.ts)
export const EVENT_STREAM_STATE_DEBOUNCE_MS = 3000; // coalesce rapid live/pause/resume toggles on the same room into one notification

// USER_LEFT_EVENT debounce (services/user-left-notification.service.ts).
// Keyed per (room, user), so this only coalesces one person's own churn —
// leave/rejoin, or a disconnect immediately followed by a logout.
export const USER_LEFT_EVENT_DEBOUNCE_MS = 3000;
// How long we remember which room a user is in, for the logout variant of
// USER_LEFT_EVENT. Matches the LiveKit token TTL (livekit.provider.ts), so
// the memory cannot outlive the access it was recorded for.
export const ACTIVE_ROOM_TTL_SEC = 2 * 60 * 60; // 2 hours

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

// ─── Data retention purge (jobs/dataRetention.ts) ──────────────────────────
// Daily. The cutoff moves by a day at a time, so anything more frequent
// re-scans for nothing; anything less frequent lets a day's worth of expired
// rows sit past their retention period.
export const DATA_RETENTION_POLL_MS = 24 * 60 * 60 * 1000;
// Rows deleted per transaction. Small enough that each batch is short and
// other queries get a look in between them — the first real run faces every
// row older than the retention period that has ever accumulated.
export const DATA_RETENTION_BATCH_SIZE = 1_000;

// ─── Audit log retention purge (jobs/auditRetention.ts) ────────────────────
// Daily, same reasoning as the data purge. Deliberately offset from it so the
// two sweeps do not contend for the same connections and locks on startup —
// both jobs run immediately when the process boots.
export const AUDIT_RETENTION_POLL_MS = 24 * 60 * 60 * 1000;
export const AUDIT_RETENTION_START_DELAY_MS = 5 * 60 * 1000;
// Smaller than the data purge batch. Audit rows carry old_values/new_values
// text blobs, so a thousand of them is a great deal more heap and WAL than a
// thousand attendance rows.
export const AUDIT_RETENTION_BATCH_SIZE = 500;

// ─── PDF rendering deadlines (services/report.service.ts) ──────────────────
// Gotenberg had a fixed 120s abort deadline while the HTTP server closes any
// request after SERVER_REQUEST_TIMEOUT_MS (30s by default). On the synchronous
// download path the request was therefore ALWAYS killed first, while the
// renderer carried on producing output nobody was waiting for — and its queue
// is small, so that orphaned work crowded out live requests.
//
// The margin is what makes the inner deadline fire first: the renderer aborts,
// the handler turns that into a real 504, and the caller learns why instead of
// watching the connection close. Sized to leave room for the response itself
// to be written after the abort.
export const PDF_SYNC_RENDER_MARGIN_MS = 5_000;
// The async worker has no HTTP request bounding it, so it keeps the generous
// deadline — a large report legitimately takes longer than a request should.
export const PDF_ASYNC_RENDER_TIMEOUT_MS = 120_000;
