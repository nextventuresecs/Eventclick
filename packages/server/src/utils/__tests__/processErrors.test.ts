import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
  handleFatal,
  registerProcessErrorHandlers,
  FATAL_FLUSH_TIMEOUT_MS,
  type FatalHandlerDeps,
} from "../processErrors";

const makeDeps = (overrides: Partial<FatalHandlerDeps> = {}) => {
  const order: string[] = [];
  const deps: FatalHandlerDeps = {
    logger: { fatal: vi.fn(() => void order.push("log")) } as any,
    capture: vi.fn(() => void order.push("capture")),
    flush: vi.fn(async () => {
      order.push("flush");
      return true;
    }),
    exit: vi.fn(() => void order.push("exit")),
    ...overrides,
  };
  return { deps, order };
};

describe("handleFatal (#81 — a crash with no record is worse than a crash)", () => {
  it("logs, reports, flushes, and only then exits", async () => {
    const { deps, order } = makeDeps();

    await handleFatal(new Error("job blew up"), "unhandledRejection", deps);

    // Ordering is the whole point: Sentry sends over HTTP, so exiting before
    // the flush resolves loses the event this handler exists to produce.
    expect(order).toEqual(["log", "capture", "flush", "exit"]);
  });

  it("exits non-zero, so the restart reads as a failure", async () => {
    // Distinct from the SIGTERM shutdown path, which exits 0 on purpose.
    const { deps } = makeDeps();

    await handleFatal(new Error("boom"), "uncaughtException", deps);

    expect(deps.exit).toHaveBeenCalledWith(1);
  });

  it("bounds the flush rather than waiting indefinitely", async () => {
    const { deps } = makeDeps();

    await handleFatal(new Error("boom"), "uncaughtException", deps);

    expect(deps.flush).toHaveBeenCalledWith(FATAL_FLUSH_TIMEOUT_MS);
  });

  it("tags the event with which handler fired", async () => {
    const { deps } = makeDeps();
    const err = new Error("boom");

    await handleFatal(err, "unhandledRejection", deps);

    expect(deps.capture).toHaveBeenCalledWith(err, { tags: { source: "unhandledRejection" } });
  });

  it("still exits when reporting itself fails", async () => {
    // A failure while recording a fatal error must not replace the exit with
    // a second, less informative crash.
    const { deps } = makeDeps({
      flush: vi.fn(async () => {
        throw new Error("sentry unreachable");
      }),
    });

    await expect(handleFatal(new Error("boom"), "uncaughtException", deps)).resolves.toBeUndefined();
    expect(deps.exit).toHaveBeenCalledWith(1);
  });

  it("handles a non-Error rejection reason without throwing", async () => {
    // `Promise.reject("string")` is legal and reaches unhandledRejection.
    const { deps } = makeDeps();

    await handleFatal("just a string", "unhandledRejection", deps);

    expect(deps.capture).toHaveBeenCalledWith("just a string", expect.anything());
    expect(deps.exit).toHaveBeenCalledWith(1);
  });
});

describe("registerProcessErrorHandlers", () => {
  const originalListeners = {
    unhandledRejection: process.listeners("unhandledRejection"),
    uncaughtException: process.listeners("uncaughtException"),
  };

  beforeEach(() => {
    process.removeAllListeners("unhandledRejection");
    process.removeAllListeners("uncaughtException");
  });

  afterEach(() => {
    process.removeAllListeners("unhandledRejection");
    process.removeAllListeners("uncaughtException");
    for (const l of originalListeners.unhandledRejection) process.on("unhandledRejection", l);
    for (const l of originalListeners.uncaughtException) process.on("uncaughtException", l);
  });

  it("listens for both process-level failure modes", () => {
    registerProcessErrorHandlers();

    expect(process.listenerCount("unhandledRejection")).toBe(1);
    expect(process.listenerCount("uncaughtException")).toBe(1);
  });
});
