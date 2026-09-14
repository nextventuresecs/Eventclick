import type { OpsProbeError, ProbeState } from "@application/shared";

export const PROBE_TIMEOUT_MS = 5_000;

export interface ProbeLogger {
  warn: (obj: object, msg: string) => void;
}

const STATEMENT_TIMEOUT = "57014";

const classify = (err: unknown): OpsProbeError => {
  const { name, code } = (err ?? {}) as { name?: unknown; code?: unknown };
  if (name === "AbortError" || name === "TimeoutError" || code === STATEMENT_TIMEOUT) return "TIMEOUT";
  return "UNAVAILABLE";
};

/**
 * Settles a probe as ok or error within `timeoutMs`, never throws.
 *
 * The signal is aborted at the deadline so fetch and the SQS SDK stop work;
 * SQL cannot be aborted from here and relies on the pool's statement_timeout,
 * which is why the race exists: the endpoint answers on time either way.
 */
export async function runProbe<T>(
  name: string,
  fn: (signal: AbortSignal) => Promise<T>,
  opts: { timeoutMs?: number; logger?: ProbeLogger } = {},
): Promise<ProbeState<T>> {
  const timeoutMs = opts.timeoutMs ?? PROBE_TIMEOUT_MS;
  const controller = new AbortController();
  let timer: NodeJS.Timeout | undefined;

  const deadline = new Promise<ProbeState<T>>((resolve) => {
    timer = setTimeout(() => {
      controller.abort();
      resolve({ status: "error", error: "TIMEOUT" });
    }, timeoutMs);
  });

  const work = fn(controller.signal).then(
    (data): ProbeState<T> => ({ status: "ok", data }),
    (err: unknown): ProbeState<T> => ({ status: "error", error: controller.signal.aborted ? "TIMEOUT" : classify(err) }),
  );

  try {
    const result = await Promise.race([work, deadline]);
    if (result.status === "error") opts.logger?.warn({ probe: name, error: result.error }, "ops health probe failed");
    return result;
  } finally {
    clearTimeout(timer);
  }
}
