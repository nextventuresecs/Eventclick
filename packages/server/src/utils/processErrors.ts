import { logger as defaultLogger, type Logger } from "./logger";
import { captureSentryException, flushSentry } from "../services/sentry.service";

export type FatalSource = "unhandledRejection" | "uncaughtException";

/**
 * How long the fatal path waits for buffered output to leave the process.
 * Sentry's flush has an HTTP request in flight, so exiting immediately after
 * captureException loses the very event this handler exists to produce.
 */
export const FATAL_FLUSH_TIMEOUT_MS = 2_000;

/**
 * Hard ceiling on the whole fatal path. The process is already dying; a hung
 * network call must not be able to wedge it open, or the orchestrator sees a
 * hanging container instead of a crashed one.
 */
export const FATAL_EXIT_TIMEOUT_MS = 5_000;

export interface FatalHandlerDeps {
  logger: Pick<Logger, "fatal">;
  capture: (err: unknown, context?: Record<string, unknown>) => void;
  flush: (timeoutMs: number) => Promise<boolean>;
  exit: (code: number) => void;
}

const defaultDeps = (): FatalHandlerDeps => ({
  logger: defaultLogger,
  capture: captureSentryException,
  flush: flushSentry,
  exit: (code) => process.exit(code),
});

/**
 * Records a fatal condition and then ends the process.
 *
 * "Record, then exit" is a sequence, not two statements: the restart hides the
 * evidence, so anything buffered has to be on its way out before the process
 * is allowed to die.
 *
 * Deliberately not routed through the SIGTERM `shutdown` path in index.ts.
 * That one drains connections and exits 0, which is right for a requested
 * shutdown and wrong here — the process is in an unknown state, its
 * connections cannot be trusted, and a zero exit tells the orchestrator the
 * container finished successfully. Non-zero is what makes the restart show up
 * as a failure.
 */
export const handleFatal = async (
  err: unknown,
  source: FatalSource,
  deps: FatalHandlerDeps = defaultDeps(),
): Promise<void> => {
  const forceExit = setTimeout(() => deps.exit(1), FATAL_EXIT_TIMEOUT_MS);
  // Never let the fallback timer itself hold the event loop open.
  if (typeof forceExit.unref === "function") forceExit.unref();

  try {
    deps.logger.fatal({ err, source }, `Fatal ${source} — exiting`);
    deps.capture(err, { tags: { source } });
    await deps.flush(FATAL_FLUSH_TIMEOUT_MS);
  } catch {
    // A failure while reporting a fatal error must not replace the exit with
    // a second, less informative crash.
  } finally {
    clearTimeout(forceExit);
    deps.exit(1);
  }
};

/**
 * Node terminates the process on an unhandled rejection by default, and
 * resuming after an uncaught exception is explicitly unsafe — so both end the
 * process here. The point of these handlers is not to survive: it is to leave
 * a record behind, which is exactly what a bare crash does not do.
 */
export const registerProcessErrorHandlers = (): void => {
  process.on("unhandledRejection", (reason) => {
    void handleFatal(reason, "unhandledRejection");
  });

  process.on("uncaughtException", (err) => {
    void handleFatal(err, "uncaughtException");
  });
};
