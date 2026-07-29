type HttpMethod = "GET" | "POST" | "PUT" | "PATCH" | "DELETE" | "OPTIONS";
type RouteKey = `${HttpMethod} ${string}`;

interface RequestMetrics {
  count: number;
  errors: number;
  latencyMsSum: number;
  latencyMsMax: number;
}

class MetricsRegistry {
  private requests = new Map<string, RequestMetrics>();
  private activeConnections = 0;
  private startTime = Date.now();

  recordRequest(method: string, url: string, statusCode: number, latencyMs: number): void {
    const path = this.normalizePath(url);
    const key = `${method} ${path}` as RouteKey;

    let metrics = this.requests.get(key);
    if (!metrics) {
      metrics = { count: 0, errors: 0, latencyMsSum: 0, latencyMsMax: 0 };
      this.requests.set(key, metrics);
    }

    metrics.count++;
    metrics.latencyMsSum += latencyMs;
    metrics.latencyMsMax = Math.max(metrics.latencyMsMax, latencyMs);

    if (statusCode >= 500) {
      metrics.errors++;
    }
  }

  incrementActiveConnections(): void {
    this.activeConnections++;
  }

  decrementActiveConnections(): void {
    this.activeConnections--;
  }

  getActiveConnections(): number {
    return this.activeConnections;
  }

  getUptimeSeconds(): number {
    return Math.floor((Date.now() - this.startTime) / 1000);
  }

  toPrometheus(): string {
    const lines: string[] = [];

    lines.push("# HELP http_requests_total Total HTTP requests");
    lines.push("# TYPE http_requests_total counter");
    for (const [key, metrics] of this.requests) {
      lines.push(`http_requests_total{method="${key.split(" ")[0]}",path="${key.split(" ")[1]}"} ${metrics.count}`);
    }

    lines.push("");
    lines.push("# HELP http_request_errors_total Total HTTP 5xx errors");
    lines.push("# TYPE http_request_errors_total counter");
    for (const [key, metrics] of this.requests) {
      if (metrics.errors > 0) {
        lines.push(`http_request_errors_total{method="${key.split(" ")[0]}",path="${key.split(" ")[1]}"} ${metrics.errors}`);
      }
    }

    lines.push("");
    lines.push("# HELP http_request_duration_ms_sum Sum of request durations in ms");
    lines.push("# TYPE http_request_duration_ms_sum counter");
    for (const [key, metrics] of this.requests) {
      lines.push(`http_request_duration_ms_sum{method="${key.split(" ")[0]}",path="${key.split(" ")[1]}"} ${metrics.latencyMsSum}`);
    }

    lines.push("");
    lines.push("# HELP http_request_duration_ms_max Max request duration in ms");
    lines.push("# TYPE http_request_duration_ms_max gauge");
    for (const [key, metrics] of this.requests) {
      lines.push(`http_request_duration_ms_max{method="${key.split(" ")[0]}",path="${key.split(" ")[1]}"} ${metrics.latencyMsMax}`);
    }

    lines.push("");
    lines.push("# HELP http_active_connections Current active connections");
    lines.push("# TYPE http_active_connections gauge");
    lines.push(`http_active_connections ${this.activeConnections}`);

    lines.push("");
    lines.push("# HELP process_uptime_seconds Process uptime in seconds");
    lines.push("# TYPE process_uptime_seconds gauge");
    lines.push(`process_uptime_seconds ${this.getUptimeSeconds()}`);

    return lines.join("\n") + "\n";
  }

  private normalizePath(url: string): string {
    try {
      const urlObj = new URL(url, "http://localhost");
      let path = urlObj.pathname;

      path = path.replace(new RegExp("^/api/v1/rooms/[^/]+$"), "/api/v1/rooms/:id");
      path = path.replace(new RegExp("^/api/v1/users/[^/]+$"), "/api/v1/users/:id");
      path = path.replace(new RegExp("^/api/v1/organizations/[^/]+$"), "/api/v1/organizations/:id");
      path = path.replace(new RegExp("^/api/v1/reports/[^/]+/pdf$"), "/api/v1/reports/:id/pdf");
      path = path.replace(new RegExp("^/api/v1/reports/[^/]+/status/[^/]+$"), "/api/v1/reports/:id/status/:jobId");
      path = path.replace(/\/[a-f0-9-]{36}/g, "/:uuid");
      path = path.replace(/\/\d+/g, "/:id");

      return path || "/";
    } catch {
      return "/";
    }
  }
}

export const metricsRegistry = new MetricsRegistry();

export const metricsMiddleware = (req: any, res: any, next: any): void => {
  metricsRegistry.incrementActiveConnections();

  const start = Date.now();

  res.on("finish", () => {
    const latencyMs = Date.now() - start;
    metricsRegistry.recordRequest(req.method, req.originalUrl, res.statusCode, latencyMs);
    metricsRegistry.decrementActiveConnections();
  });

  next();
};
