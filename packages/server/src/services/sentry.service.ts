import * as Sentry from "@sentry/node";
import { logger } from "../utils/logger";
import { sentryEnabled } from "../instrument";

/**
 * Thin wrapper over the SDK. Initialisation itself lives in `instrument.ts`,
 * which must be the process's first import — callers here only ever use an
 * already-initialised client.
 *
 * Every export is a no-op when no DSN is configured, so nothing downstream
 * has to ask whether error tracking is on.
 */

export function isSentryEnabled(): boolean {
  return sentryEnabled;
}

/**
 * Registers Sentry's Express error handler.
 *
 * Order matters and is the point of #82: this must run **after** the routes
 * and **before** the application's own `errorHandler`, which ends the
 * response. Registered after it, Sentry never sees the error with its request
 * scope attached.
 */
export function setupSentryExpressErrorHandler(app: Parameters<typeof Sentry.setupExpressErrorHandler>[0]): void {
  if (!sentryEnabled) return;
  Sentry.setupExpressErrorHandler(app);
}

/**
 * Tags the current request's Sentry scope with the id `pino-http` generated
 * and returned in the `x-request-id` header, so an issue can be traced
 * straight to its log lines by that id alone.
 *
 * Relies on the SDK's per-request isolation scope (created by the HTTP
 * integration), which is why this is safe to call from middleware without
 * leaking the tag across concurrent requests.
 */
export function tagRequestId(requestId: string): void {
  if (!sentryEnabled) return;
  try {
    Sentry.getCurrentScope().setTag("request_id", requestId);
  } catch {
    // Tagging is a diagnostic nicety — never let it break a request.
  }
}

export function captureSentryException(err: unknown, context?: Record<string, unknown>): void {
  if (!sentryEnabled) return;

  try {
    if (context) {
      Sentry.captureException(err, context);
    } else {
      Sentry.captureException(err);
    }
  } catch {
    // Intentionally ignore Sentry reporting failures
  }
}

/**
 * Waits for buffered events to leave the process, bounded by `timeoutMs`.
 * Sentry sends over HTTP, so an event captured immediately before
 * `process.exit` never arrives without this — see utils/processErrors.ts.
 *
 * Resolves `true` when the queue drained, `false` on timeout or when Sentry
 * is not configured. Never rejects: this is called on paths that are already
 * failing, and a flush error must not become the visible error.
 */
export async function flushSentry(timeoutMs: number): Promise<boolean> {
  if (!sentryEnabled) return false;

  try {
    return await Sentry.flush(timeoutMs);
  } catch (err) {
    logger.warn({ err }, "Sentry flush failed");
    return false;
  }
}
