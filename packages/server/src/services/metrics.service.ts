import type { NextFunction, Request, Response } from "express";
import { Counter, Gauge, Histogram, Registry, collectDefaultMetrics } from "prom-client";

/**
 * Prometheus metrics.
 *
 * This replaces a hand-written registry that reported a latency **sum and
 * max**, from which no percentile can be computed — and p95/p99 are the only
 * latency numbers worth alerting on. It also keyed its series on a regex-
 * normalised URL, so any path shape the normaliser missed became a permanent
 * map entry: an unbounded, in-process, per-container series count.
 *
 * Three things change as a result:
 *   - latency is a histogram, so percentiles are computable at query time;
 *   - labels come from Express's **matched route pattern**, so cardinality is
 *     bounded by the number of routes rather than by the number of distinct
 *     URLs anyone chooses to request;
 *   - default process metrics (memory, event-loop lag, GC) come from the
 *     library rather than being reimplemented badly.
 */
export const registry = new Registry();

collectDefaultMetrics({ register: registry });

/**
 * Buckets in seconds, the Prometheus convention. Chosen around this app's
 * shape: most API calls are tens of milliseconds, PDF generation and report
 * queries are the slow tail, and anything past 10s is already a failure the
 * request timeout will end.
 */
const LATENCY_BUCKETS = [0.005, 0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1, 2.5, 5, 10];

export const httpRequestDuration = new Histogram({
  name: "http_request_duration_seconds",
  help: "HTTP request duration in seconds",
  labelNames: ["method", "route", "status_code"] as const,
  buckets: LATENCY_BUCKETS,
  registers: [registry],
});

export const httpRequestsTotal = new Counter({
  name: "http_requests_total",
  help: "Total HTTP requests",
  labelNames: ["method", "route", "status_code"] as const,
  registers: [registry],
});

export const httpActiveConnections = new Gauge({
  name: "http_active_connections",
  help: "In-flight HTTP requests",
  registers: [registry],
});

/**
 * The single label value every unmatched path collapses to.
 *
 * This is the cardinality guard. Express only populates `req.route` when a
 * handler matched, so 404s — including a scanner walking thousands of
 * generated URLs — all land here instead of minting a series each. The old
 * registry had no such floor: it normalised what it recognised and kept
 * everything else verbatim, forever.
 */
export const UNMATCHED_ROUTE = "unmatched";

/**
 * The matched route pattern, e.g. "/api/v1/rooms/:id/start" — not the URL that
 * was requested. `req.route` is only set after routing, which is why this is
 * read on `finish` rather than when the request arrives.
 */
export const routeLabel = (req: Request): string => {
  const routePath = (req as Request & { route?: { path?: string } }).route?.path;
  if (!routePath) return UNMATCHED_ROUTE;

  const base = req.baseUrl ?? "";
  const combined = `${base}${routePath === "/" ? "" : routePath}`;
  return combined || "/";
};

export const metricsMiddleware = (req: Request, res: Response, next: NextFunction): void => {
  httpActiveConnections.inc();
  const stopTimer = httpRequestDuration.startTimer();

  res.on("finish", () => {
    const labels = {
      method: req.method,
      route: routeLabel(req),
      status_code: String(res.statusCode),
    };
    stopTimer(labels);
    httpRequestsTotal.inc(labels);
    httpActiveConnections.dec();
  });

  next();
};

export const renderMetrics = async (): Promise<string> => registry.metrics();

export const metricsContentType = registry.contentType;
