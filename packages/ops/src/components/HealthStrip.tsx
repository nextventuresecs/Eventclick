import type { ReactNode } from "react";
import type { OpsHealth, OpsOverall, ProbeState } from "@application/shared";
import type { QueryState } from "@/lib/apiContext";
import { Badge, Panel, QueryStatus, type BadgeTone } from "@/components/Panel";

const OVERALL: Record<OpsOverall, { tone: BadgeTone; label: string }> = {
  green: { tone: "ok", label: "Healthy" },
  amber: { tone: "warn", label: "Degraded" },
  red: { tone: "bad", label: "Unhealthy" },
  unknown: { tone: "neutral", label: "Unknown" },
};

export function RetryButton({ onClick, label = "Retry" }: { onClick: () => void; label?: string }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="rounded border border-line px-2 py-0.5 text-xs font-medium hover:bg-ground"
    >
      {label}
    </button>
  );
}

function Probe<T>({
  title,
  state,
  onRetry,
  children,
}: {
  title: string;
  state: ProbeState<T> | { status: "disabled" };
  onRetry: () => void;
  children: (data: T) => ReactNode;
}) {
  return (
    <div className="px-5 py-3">
      <h3 className="mb-1.5 text-xs font-medium tracking-wide text-muted uppercase">{title}</h3>
      {state.status === "ok" && children(state.data)}
      {state.status === "disabled" && <p className="text-sm text-muted">Not configured</p>}
      {state.status === "error" && (
        <p className="flex flex-wrap items-center gap-2 text-sm">
          <Badge tone="neutral">Unavailable</Badge>
          <span className="text-muted">{state.error === "TIMEOUT" ? "Timed out" : "Could not be read"}</span>
          <RetryButton onClick={onRetry} />
        </p>
      )}
    </div>
  );
}

function Count({ label, value, warnAt, badAt }: { label: string; value: number; warnAt?: number; badAt?: number }) {
  const tone: BadgeTone =
    badAt !== undefined && value >= badAt ? "bad" : warnAt !== undefined && value >= warnAt ? "warn" : "ok";
  return (
    <span className="flex items-center gap-1.5 text-sm">
      <span className="text-muted">{label}</span>
      <Badge tone={tone}>{value}</Badge>
    </span>
  );
}

/** Mirrors computeOverall on ops-server; the thresholds there are the source of truth. */
export function HealthStrip({ state, onRetry }: { state: QueryState<OpsHealth>; onRetry: () => void }) {
  const overall = state.status === "ready" ? OVERALL[state.data.overall] : null;

  return (
    <Panel
      title="Health"
      actions={
        <span className="flex items-center gap-2">
          {overall && <Badge tone={overall.tone}>{overall.label}</Badge>}
          {state.status === "error" && <RetryButton onClick={onRetry} />}
        </span>
      }
    >
      {state.status === "ready" ? (
        <HealthBody health={state.data} onRetry={onRetry} />
      ) : (
        <div className="px-5 py-3">
          <QueryStatus state={state}>{() => null}</QueryStatus>
        </div>
      )}
    </Panel>
  );
}

function HealthBody({ health, onRetry }: { health: OpsHealth; onRetry: () => void }) {
  return (
    <div className="divide-y divide-line">
      <Probe title="Dependencies" state={health.app} onRetry={onRetry}>
        {(app) => (
          <ul className="flex flex-wrap gap-1.5" aria-label="Dependency checks">
            {Object.entries(app.checks).map(([name, value]) => (
              <li key={name}>
                <Badge tone={value === "ok" ? "ok" : "bad"}>
                  {name}
                  {value === "ok" ? "" : `: ${value}`}
                </Badge>
              </li>
            ))}
          </ul>
        )}
      </Probe>

      <Probe title="Backlog" state={health.backlog} onRetry={onRetry}>
        {(b) => (
          <div className="flex flex-wrap gap-x-5 gap-y-2">
            <Count label="PDF jobs stuck >15m" value={b.pdfStuck} badAt={1} />
            <Count label="PDF failed 24h" value={b.pdfFailed24h} warnAt={1} />
            <Count label="Emails failed 1h" value={b.emailFailed1h} warnAt={1} badAt={5} />
            <Count label="Notifications failed 1h" value={b.notificationFailed1h} warnAt={1} badAt={5} />
          </div>
        )}
      </Probe>

      <Probe title="Dead-letter queue" state={health.dlq} onRetry={onRetry}>
        {(d) => <Count label="Messages" value={d.approximateMessages} badAt={1} />}
      </Probe>
    </div>
  );
}
