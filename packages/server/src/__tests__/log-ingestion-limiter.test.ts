import { describe, it, expect, vi } from "vitest";

// Captures how the limiter was constructed, since what matters here is which
// store it uses and how tight the budget is — neither of which is observable
// from a single request.
const hoisted = vi.hoisted(() => ({ rateLimitConfigs: [] as any[], storePrefixes: [] as string[] }));
const rateLimitConfigs = hoisted.rateLimitConfigs;
const storePrefixes = hoisted.storePrefixes;

vi.mock("express-rate-limit", async (importOriginal) => {
  const actual = (await importOriginal()) as Record<string, unknown>;
  return {
    ...actual,
    rateLimit: (config: any) => {
      hoisted.rateLimitConfigs.push(config);
      return (_req: unknown, _res: unknown, next: () => void) => next();
    },
  };
});

vi.mock("../middleware/rateLimitStore", () => ({
  createFailClosedStore: (prefix: string) => {
    hoisted.storePrefixes.push(prefix);
    return { __prefix: prefix };
  },
}));

import { logRouter } from "../routes/log.routes";

describe("client log ingestion limiter (#86)", () => {
  const config = () => rateLimitConfigs[0];

  it("uses the shared fail-closed Redis store, not an in-process one", () => {
    // The previous in-process store gave every container its own budget and
    // reset it on each deploy, so the limit did not hold where it mattered.
    expect(storePrefixes).toContain("rl:clientlog:");
    expect(config().store).toEqual({ __prefix: "rl:clientlog:" });
  });

  it("keeps a tight per-minute budget", () => {
    // Tighter than the client's own 20/min throttle in lib/log.ts: a
    // well-behaved browser never reaches it.
    expect(config().windowMs).toBe(60_000);
    expect(config().limit).toBeLessThanOrEqual(20);
  });

  it("keys on the caller's IP, normalised for IPv6", () => {
    const key = config().keyGenerator({ ip: "2001:db8::1" });
    const otherAddressSameHost = config().keyGenerator({ ip: "2001:db8::2" });

    expect(key).toBe(otherAddressSameHost);
    expect(config().keyGenerator({})).toBe("unknown");
  });

  it("skips itself in tests, so the suite is not rate limited", () => {
    expect(config().skip()).toBe(true);
  });

  it("still mounts the ingestion route", () => {
    const paths = (logRouter as any).stack
      .filter((layer: any) => layer.route)
      .map((layer: any) => layer.route.path);

    expect(paths).toContain("/client-error");
  });

  it("does not require authentication", () => {
    // Deliberate: the reports worth having are pre-login crashes, and the
    // client uses navigator.sendBeacon, which cannot set an Authorization
    // header. See the justification comment in routes/log.routes.ts.
    const layer = (logRouter as any).stack.find((l: any) => l.route?.path === "/client-error");
    const handlerNames: string[] = layer.route.stack.map((h: any) => h.name);

    expect(handlerNames).not.toContain("requireAuth");
  });
});
