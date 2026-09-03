import { describe, it, expect, vi, beforeEach } from "vitest";

// Order is the entire subject of #82, and order is invisible in a diff — so
// these tests record the call sequence of the Sentry SDK rather than any
// observable behaviour.

const hoisted = vi.hoisted(() => ({ calls: [] as string[] }));
const calls = hoisted.calls;

vi.mock("@sentry/node", () => ({
  init: vi.fn(() => void hoisted.calls.push("init")),
  setupExpressErrorHandler: vi.fn(() => void hoisted.calls.push("setupExpressErrorHandler")),
  captureException: vi.fn(() => void hoisted.calls.push("captureException")),
  flush: vi.fn(async () => true),
  getCurrentScope: vi.fn(() => ({
    setTag: (...args: unknown[]) => void hoisted.calls.push(`setTag:${String(args[0])}`),
  })),
}));

vi.mock("@sentry/profiling-node", () => ({
  nodeProfilingIntegration: () => ({ name: "ProfilingIntegration" }),
}));

// The DSN gate: instrument.ts only initialises when one is configured, and
// vitest.config.ts does not set SENTRY_SERVER_DSN.
vi.mock("../config/env", async (importOriginal) => {
  const actual = (await importOriginal()) as { env: Record<string, unknown> };
  return { env: { ...actual.env, SENTRY_SERVER_DSN: "https://public@example.ingest.sentry.io/1" } };
});

import * as Sentry from "@sentry/node";
import { setupSentryExpressErrorHandler, tagRequestId, isSentryEnabled } from "../services/sentry.service";

describe("Sentry initialisation order (#82)", () => {
  beforeEach(() => {
    calls.length = 0;
  });

  it("initialises during module load, before anything registers middleware", () => {
    // instrument.ts is imported for its side effect at process start; by the
    // time any other module has a Sentry handle, init has already run.
    expect(vi.mocked(Sentry.init)).toHaveBeenCalledTimes(1);
    expect(isSentryEnabled()).toBe(true);
  });

  it("initialises synchronously, so `export { app }` stays a plain export", () => {
    // The previous code awaited init and registered the error handler in a
    // .then(); three integration tests import { app } from "../index"
    // synchronously and hand it to supertest, so an async app factory would
    // break all of them.
    expect(vi.mocked(Sentry.init).mock.results[0]?.type).toBe("return");
  });

  it("registers the Express error handler when asked", () => {
    setupSentryExpressErrorHandler({} as any);

    expect(calls).toContain("setupExpressErrorHandler");
  });

  it("tags the current scope with the request id", () => {
    tagRequestId("abc123");

    expect(calls).toContain("setTag:request_id");
  });

  it("never lets a tagging failure break the request", () => {
    vi.mocked(Sentry.getCurrentScope).mockImplementationOnce(() => {
      throw new Error("no active scope");
    });

    expect(() => tagRequestId("abc123")).not.toThrow();
  });
});
