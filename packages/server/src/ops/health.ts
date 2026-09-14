import type { OpsHealth, OpsOverall } from "@application/shared";
import type { ReadPool } from "./lookup";
import { runProbe, type ProbeLogger } from "./probes/probe";
import { probeApp } from "./probes/app";
import { probeBacklog } from "./probes/backlog";
import type { DlqReader } from "./probes/dlq";

// Failed deliveries in the last hour: 1-4 is amber, 5 or more is red.
const DELIVERY_RED_AT = 5;

/**
 * red: a dependency check is not ok, a PDF job is stuck, the DLQ holds
 * messages, or 5+ email/notification failures in the last hour.
 * unknown: a probe could not answer and nothing is red. Unknown outranks
 * amber: an amber signal says nothing about the probe that did not answer.
 * amber: PDF failures in 24h, or 1-4 delivery failures in the last hour.
 */
export function computeOverall(h: Pick<OpsHealth, "app" | "backlog" | "dlq">): OpsOverall {
  const app = h.app.status === "ok" ? h.app.data : null;
  const backlog = h.backlog.status === "ok" ? h.backlog.data : null;
  const dlqMessages = h.dlq.status === "ok" ? h.dlq.data.approximateMessages : 0;

  const red =
    (app !== null && Object.values(app.checks).some((v) => v !== "ok")) ||
    (backlog !== null &&
      (backlog.pdfStuck > 0 ||
        backlog.emailFailed1h >= DELIVERY_RED_AT ||
        backlog.notificationFailed1h >= DELIVERY_RED_AT)) ||
    dlqMessages > 0;
  if (red) return "red";

  if (h.app.status === "error" || h.backlog.status === "error" || h.dlq.status === "error") return "unknown";

  const amber =
    backlog !== null && (backlog.pdfFailed24h > 0 || backlog.emailFailed1h > 0 || backlog.notificationFailed1h > 0);
  return amber ? "amber" : "green";
}

// Every deploy recreates ops-server with the new IMAGE_TAG, so process start
// approximates deploy time. The UI calls it "Running since".
const STARTED_AT = new Date(Date.now() - process.uptime() * 1000).toISOString();

export interface HealthDeps {
  readPool: ReadPool;
  appInternalUrl: string;
  dlqUrl?: string;
  dlqReader?: DlqReader;
  release: string | null;
  sentryOrgUrl?: string;
  logger?: ProbeLogger;
  fetchImpl?: typeof fetch;
  /** Tests only. */
  timeoutMs?: number;
}

/** Never throws: each probe settles to ok or error on its own deadline. */
export async function readHealth(deps: HealthDeps): Promise<OpsHealth> {
  const opts = { timeoutMs: deps.timeoutMs, logger: deps.logger };
  const { dlqUrl, dlqReader } = deps;

  const [app, backlog, dlq] = await Promise.all([
    runProbe("app", (signal) => probeApp(deps.appInternalUrl, signal, deps.fetchImpl), opts),
    runProbe("backlog", () => probeBacklog(deps.readPool), opts),
    dlqUrl && dlqReader
      ? runProbe("dlq", async (signal) => ({ approximateMessages: await dlqReader.approximateMessages(dlqUrl, signal) }), opts)
      : Promise.resolve({ status: "disabled" as const }),
  ]);

  return {
    generatedAt: new Date().toISOString(),
    release: deps.release,
    deployedAt: STARTED_AT,
    overall: computeOverall({ app, backlog, dlq }),
    app,
    backlog,
    dlq,
    links: {
      sentryRelease:
        deps.sentryOrgUrl && deps.release
          ? `${deps.sentryOrgUrl}/releases/${encodeURIComponent(deps.release)}/`
          : null,
    },
  };
}
