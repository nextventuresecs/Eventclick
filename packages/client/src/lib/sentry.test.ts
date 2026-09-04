import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

const initSpy = vi.fn();
vi.mock("@sentry/react", () => ({
  init: (...args: unknown[]) => initSpy(...args),
  browserTracingIntegration: () => ({ name: "BrowserTracing" }),
  replayIntegration: (opts: unknown) => ({ name: "Replay", opts }),
}));

/**
 * The module reads `import.meta.env` at load time, which is what Vite
 * statically replaces at build. So each case stubs the environment first and
 * then imports a fresh copy — stubbing after the import would be a no-op and
 * would silently assert against whatever the first import happened to see.
 */
const loadSentryModule = async () => {
  vi.resetModules();
  return import("./sentry");
};

type SentryOptions = {
  release?: string;
  sendDefaultPii?: boolean;
  integrations: { name: string }[];
  tracesSampleRate: number;
  replaysSessionSampleRate: number;
  replaysOnErrorSampleRate: number;
  tracePropagationTargets: (string | RegExp)[];
  beforeSend: (event: Record<string, any>) => Record<string, any>;
};

const optionsFromInit = async (): Promise<SentryOptions> => {
  const { initClientSentry } = await loadSentryModule();
  initClientSentry();
  expect(initSpy).toHaveBeenCalledTimes(1);
  const [options] = initSpy.mock.calls[0] ?? [];
  return options as SentryOptions;
};

describe("client Sentry configuration", () => {
  beforeEach(() => {
    initSpy.mockClear();
    vi.stubEnv("VITE_SENTRY_CLIENT_DSN", "https://examplePublicKey@o0.ingest.sentry.io/0");
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("does nothing without a DSN", async () => {
    vi.stubEnv("VITE_SENTRY_CLIENT_DSN", "");
    const { initClientSentry } = await loadSentryModule();
    initClientSentry();
    expect(initSpy).not.toHaveBeenCalled();
  });

  it("installs the replay integration the replay sample rates depend on", async () => {
    // The rates were configured for months with no recorder installed, so no
    // replay was ever captured. Assert the pairing, not just the rates.
    const options = await optionsFromInit();
    expect(options.integrations.map((i) => i.name)).toContain("Replay");
    expect(options.replaysOnErrorSampleRate).toBe(1.0);
  });

  it("propagates trace headers to the cross-origin API so traces join up", async () => {
    const options = await optionsFromInit();
    expect(options.tracePropagationTargets.length).toBeGreaterThan(0);
  });

  it("never sends default PII", async () => {
    expect((await optionsFromInit()).sendDefaultPii).toBe(false);
  });

  it("strips the Authorization header and sensitive query params from events", async () => {
    const { beforeSend } = await optionsFromInit();

    const event = beforeSend({
      request: {
        url: "https://app.eventclick.live/verify?token=super-secret&keep=yes",
        headers: { Authorization: "Bearer leaked", "Content-Type": "application/json" },
      },
      breadcrumbs: [{ data: { url: "/auth/callback?code=abc123&state=ok" } }],
    });

    expect(event.request.url).toBe("https://app.eventclick.live/verify?token=%5BREDACTED%5D&keep=yes");
    expect(event.request.headers.Authorization).toBeUndefined();
    expect(event.request.headers["Content-Type"]).toBe("application/json");
    expect(event.breadcrumbs[0].data.url).toContain("code=%5BREDACTED%5D");
    expect(event.breadcrumbs[0].data.url).toContain("state=ok");
  });

  it("leaves events without sensitive fields untouched", async () => {
    const { beforeSend } = await optionsFromInit();
    const event = beforeSend({ request: { url: "/rooms/42" }, breadcrumbs: [] });
    expect(event.request.url).toBe("/rooms/42");
  });

  it("returns unparseable urls unchanged rather than dropping them", async () => {
    const { __testing } = await loadSentryModule();
    expect(__testing.scrubUrl("::::")).toBe("::::");
  });
});
