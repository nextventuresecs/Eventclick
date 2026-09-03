import { describe, it, expect, beforeEach } from "vitest";
import {
  registry,
  metricsMiddleware,
  renderMetrics,
  routeLabel,
  UNMATCHED_ROUTE,
} from "../metrics.service";

const makeReq = (overrides: Record<string, unknown> = {}): any => ({
  method: "GET",
  baseUrl: "/api/v1/rooms",
  route: { path: "/:id/start" },
  originalUrl: "/api/v1/rooms/abc-123/start",
  ...overrides,
});

const runRequest = (req: any, statusCode = 200) => {
  const listeners: Array<() => void> = [];
  const res: any = {
    statusCode,
    on: (event: string, fn: () => void) => {
      if (event === "finish") listeners.push(fn);
    },
  };
  metricsMiddleware(req, res, () => {});
  for (const fn of listeners) fn();
};

describe("metrics service (#84 — percentiles need a histogram)", () => {
  beforeEach(() => {
    registry.resetMetrics();
  });

  it("exposes latency as a histogram, so p95 and p99 are computable", async () => {
    // The old registry reported a sum and a max. No percentile can be derived
    // from those, which made the endpoint unable to answer the only latency
    // question worth alerting on.
    runRequest(makeReq());

    const output = await renderMetrics();

    expect(output).toContain("# TYPE http_request_duration_seconds histogram");
    expect(output).toContain("http_request_duration_seconds_bucket");
  });

  it("exposes default process metrics", async () => {
    const output = await renderMetrics();

    expect(output).toContain("process_resident_memory_bytes");
    expect(output).toContain("nodejs_eventloop_lag_seconds");
    expect(output).toMatch(/nodejs_gc_duration_seconds|nodejs_heap_size_total_bytes/);
  });

  it("labels by matched route pattern, not the requested URL", () => {
    // /api/v1/rooms/abc-123/start and /api/v1/rooms/def-456/start are one
    // series, because the label comes from the route Express matched.
    expect(routeLabel(makeReq())).toBe("/api/v1/rooms/:id/start");
    expect(routeLabel(makeReq({ originalUrl: "/api/v1/rooms/zzz/start" }))).toBe(
      "/api/v1/rooms/:id/start",
    );
  });

  it("collapses every unmatched path into one series", async () => {
    // The cardinality guard: a scanner walking thousands of generated URLs
    // must not mint a series per URL. The old registry kept anything its
    // regexes did not recognise, verbatim and forever.
    runRequest(makeReq({ baseUrl: "", route: undefined, originalUrl: "/nope/1" }), 404);
    runRequest(makeReq({ baseUrl: "", route: undefined, originalUrl: "/nope/2" }), 404);
    runRequest(makeReq({ baseUrl: "", route: undefined, originalUrl: "/nope/3" }), 404);

    const output = await renderMetrics();
    const unmatchedSeries = output
      .split("\n")
      .filter((line) => line.startsWith("http_requests_total{") && line.includes(UNMATCHED_ROUTE));

    expect(unmatchedSeries).toHaveLength(1);
    expect(unmatchedSeries[0]).toContain(" 3");
    expect(output).not.toContain("/nope/1");
  });

  it("handles a route mounted at the router root", () => {
    expect(routeLabel(makeReq({ baseUrl: "/api/v1/rooms", route: { path: "/" } }))).toBe(
      "/api/v1/rooms",
    );
  });

  it("counts requests and carries the status code as a label", async () => {
    runRequest(makeReq(), 500);

    const output = await renderMetrics();

    expect(output).toContain('status_code="500"');
    expect(output).toContain('route="/api/v1/rooms/:id/start"');
  });

  it("tracks in-flight requests back down to zero", async () => {
    runRequest(makeReq());
    runRequest(makeReq());

    const output = await renderMetrics();

    expect(output).toMatch(/http_active_connections 0/);
  });
});
