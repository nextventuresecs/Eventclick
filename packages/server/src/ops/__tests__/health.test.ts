import { describe, it, expect, vi, beforeAll, afterAll } from "vitest";
import http from "node:http";
import type { AddressInfo, Socket } from "node:net";
import type { OpsBacklog, OpsHealth } from "@application/shared";
import { computeOverall, readHealth } from "../health";
import { runProbe } from "../probes/probe";
import { probeApp } from "../probes/app";

const sendMock = vi.hoisted(() => vi.fn());
vi.mock("@aws-sdk/client-sqs", () => ({
  SQSClient: class {
    send = sendMock;
  },
  GetQueueAttributesCommand: class {
    constructor(readonly input: object) {}
  },
}));

const ALL_OK = { database: "ok", redis: "ok", jwt: "ok", schema: "ok", storage: "ok", gotenberg: "ok", livekit: "ok" };
const quiet: OpsBacklog = { pdfStuck: 0, pdfFailed24h: 0, emailFailed1h: 0, notificationFailed1h: 0 };

const state = (
  over: {
    checks?: Record<string, string>;
    backlog?: Partial<OpsBacklog>;
    dlq?: OpsHealth["dlq"];
    appError?: boolean;
    backlogError?: boolean;
  } = {},
): Pick<OpsHealth, "app" | "backlog" | "dlq"> => ({
  app: over.appError
    ? { status: "error", error: "TIMEOUT" }
    : { status: "ok", data: { httpStatus: 200, checks: over.checks ?? ALL_OK } },
  backlog: over.backlogError
    ? { status: "error", error: "UNAVAILABLE" }
    : { status: "ok", data: { ...quiet, ...over.backlog } },
  dlq: over.dlq ?? { status: "disabled" },
});

describe("computeOverall", () => {
  it("green when every probe is quiet, with the DLQ probe disabled", () => {
    expect(computeOverall(state())).toBe("green");
  });

  it.each([
    ["a PDF failure in 24h", { backlog: { pdfFailed24h: 1 } }],
    ["1 failed email in the last hour", { backlog: { emailFailed1h: 1 } }],
    ["4 failed notifications in the last hour", { backlog: { notificationFailed1h: 4 } }],
  ])("amber on %s", (_label, over) => {
    expect(computeOverall(state(over))).toBe("amber");
  });

  it.each([
    ["a dependency check not ok", { checks: { ...ALL_OK, gotenberg: "error" } }],
    ["a stuck PDF job", { backlog: { pdfStuck: 1 } }],
    ["DLQ messages", { dlq: { status: "ok", data: { approximateMessages: 3 } } as const }],
    ["5 failed emails in the last hour", { backlog: { emailFailed1h: 5 } }],
    ["5 failed notifications in the last hour", { backlog: { notificationFailed1h: 5 } }],
  ])("red on %s", (_label, over) => {
    expect(computeOverall(state(over))).toBe("red");
  });

  it("unknown when a probe errors and nothing is red, even with an amber signal", () => {
    expect(computeOverall(state({ appError: true }))).toBe("unknown");
    expect(computeOverall(state({ appError: true, backlog: { pdfFailed24h: 2 } }))).toBe("unknown");
    expect(computeOverall(state({ dlq: { status: "error", error: "UNAVAILABLE" } }))).toBe("unknown");
  });

  it("red still wins over an errored probe", () => {
    expect(computeOverall(state({ backlogError: true, checks: { ...ALL_OK, redis: "error" } }))).toBe("red");
  });
});

describe("runProbe", () => {
  it("returns TIMEOUT at the deadline and aborts the signal", async () => {
    let seen: AbortSignal | undefined;
    const started = Date.now();
    const result = await runProbe(
      "slow",
      (signal) => {
        seen = signal;
        return new Promise(() => {});
      },
      { timeoutMs: 50 },
    );
    expect(result).toEqual({ status: "error", error: "TIMEOUT" });
    expect(seen?.aborted).toBe(true);
    expect(Date.now() - started).toBeLessThan(1_000);
  });

  it("maps a Postgres statement timeout to TIMEOUT and anything else to UNAVAILABLE, and logs", async () => {
    const warn = vi.fn();
    const pgTimeout = Object.assign(new Error("canceling statement"), { code: "57014" });
    expect(await runProbe("sql", () => Promise.reject(pgTimeout), { logger: { warn } })).toEqual({
      status: "error",
      error: "TIMEOUT",
    });
    expect(await runProbe("x", () => Promise.reject(new Error("ECONNREFUSED")))).toEqual({
      status: "error",
      error: "UNAVAILABLE",
    });
    expect(await runProbe("ok", async () => 7)).toEqual({ status: "ok", data: 7 });
    expect(warn).toHaveBeenCalledWith({ probe: "sql", error: "TIMEOUT" }, "ops health probe failed");
  });
});

describe("probeApp against an HTTP server", () => {
  let server: http.Server;
  let baseUrl: string;
  const sockets = new Set<Socket>();
  let mode: "ok" | "degraded" | "hang" = "ok";

  beforeAll(async () => {
    server = http.createServer((req, res) => {
      if (req.url !== "/api/v1/health/deep") {
        res.writeHead(404).end();
        return;
      }
      if (mode === "hang") return;
      const checks = mode === "ok" ? ALL_OK : { ...ALL_OK, gotenberg: "error" };
      res.writeHead(mode === "ok" ? 200 : 503, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ status: mode, timestamp: new Date().toISOString(), checks }));
    });
    server.on("connection", (s) => {
      sockets.add(s);
      s.on("close", () => sockets.delete(s));
    });
    await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
    baseUrl = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  });

  afterAll(async () => {
    for (const s of sockets) s.destroy();
    await new Promise((resolve) => server.close(resolve));
  });

  it("reads a 200 body with all seven checks", async () => {
    mode = "ok";
    const result = await runProbe("app", (signal) => probeApp(baseUrl, signal));
    expect(result).toEqual({ status: "ok", data: { httpStatus: 200, checks: ALL_OK } });
  });

  it("treats a 503 body as data", async () => {
    mode = "degraded";
    const result = await runProbe("app", (signal) => probeApp(baseUrl, signal));
    expect(result.status).toBe("ok");
    if (result.status === "ok") {
      expect(result.data.httpStatus).toBe(503);
      expect(result.data.checks.gotenberg).toBe("error");
    }
  });

  it("times out on a server that never answers", async () => {
    mode = "hang";
    const started = Date.now();
    const result = await runProbe("app", (signal) => probeApp(baseUrl, signal), { timeoutMs: 100 });
    expect(result).toEqual({ status: "error", error: "TIMEOUT" });
    expect(Date.now() - started).toBeLessThan(1_000);
  });

  it("is UNAVAILABLE on an unexpected status", async () => {
    const result = await runProbe("app", (signal) => probeApp(`${baseUrl}/nope`, signal));
    expect(result).toEqual({ status: "error", error: "UNAVAILABLE" });
  });
});

describe("readHealth DLQ probe", () => {
  const backlogPool = {
    query: vi.fn(async () => ({
      rows: [{ pdf_stuck: 0, pdf_failed_24h: 0, email_failed_1h: 0, notification_failed_1h: 0 }],
    })),
  };
  const okFetch = (async () => new Response(JSON.stringify({ checks: ALL_OK }), { status: 200 })) as typeof fetch;
  const base = { readPool: backlogPool, appInternalUrl: "http://server:4000", release: "abc 123", fetchImpl: okFetch };

  it("reads ApproximateNumberOfMessages through the SQS SDK with the abort signal", async () => {
    sendMock.mockResolvedValueOnce({ Attributes: { ApproximateNumberOfMessages: "2" } });
    const { createSqsDlqReader } = await import("../probes/dlq");
    const health = await readHealth({
      ...base,
      dlqUrl: "https://sqs.ap-south-1.amazonaws.com/1/dlq",
      dlqReader: createSqsDlqReader("ap-south-1"),
    });

    expect(health.dlq).toEqual({ status: "ok", data: { approximateMessages: 2 } });
    expect(health.overall).toBe("red");
    const [command, opts] = sendMock.mock.calls[0]!;
    expect(command.input).toEqual({
      QueueUrl: "https://sqs.ap-south-1.amazonaws.com/1/dlq",
      AttributeNames: ["ApproximateNumberOfMessages"],
    });
    expect(opts.abortSignal).toBeInstanceOf(AbortSignal);
  });

  it("reports an SDK failure as an errored probe without failing the others", async () => {
    const health = await readHealth({
      ...base,
      dlqUrl: "https://sqs.ap-south-1.amazonaws.com/1/dlq",
      dlqReader: { approximateMessages: () => Promise.reject(new Error("AccessDenied")) },
    });
    expect(health.dlq).toEqual({ status: "error", error: "UNAVAILABLE" });
    expect(health.app.status).toBe("ok");
    expect(health.backlog.status).toBe("ok");
    expect(health.overall).toBe("unknown");
  });

  it("is disabled, and not red, without a DLQ URL; links the release when Sentry is configured", async () => {
    const health = await readHealth({ ...base, sentryOrgUrl: "https://nvces.sentry.io" });
    expect(health.dlq).toEqual({ status: "disabled" });
    expect(health.overall).toBe("green");
    expect(health.links.sentryRelease).toBe("https://nvces.sentry.io/releases/abc%20123/");
    expect((await readHealth(base)).links.sentryRelease).toBeNull();
  });
});
