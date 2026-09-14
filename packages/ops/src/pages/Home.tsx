import { useState } from "react";
import type { OpsHealth, OpsUsage } from "@application/shared";
import type { WhoAmI } from "@/lib/api";
import { useOpsQuery } from "@/lib/apiContext";
import { formatDate, formatRelative } from "@/lib/format";
import { Field, Panel, RECORDED_NOTE } from "@/components/Panel";
import { HealthStrip } from "@/components/HealthStrip";
import { UsageTable } from "@/components/UsageTable";

/**
 * Health and usage load in parallel and fail independently. No polling: every
 * load writes an access-log row and runs queries on a small box, so refresh is
 * manual.
 */
export function Home({ whoami }: { whoami: WhoAmI }) {
  const [healthKey, setHealthKey] = useState(0);
  const [usageKey, setUsageKey] = useState(0);
  const health = useOpsQuery<OpsHealth>("/health", healthKey);
  const usage = useOpsQuery<OpsUsage>("/usage", usageKey);

  const refreshing = health.status === "loading" || usage.status === "loading";
  const refreshAll = () => {
    setHealthKey((k) => k + 1);
    setUsageKey((k) => k + 1);
  };
  const ready = health.status === "ready" ? health.data : null;

  return (
    <div className="space-y-4">
      <Panel
        title="Session"
        actions={
          <button
            type="button"
            onClick={refreshAll}
            disabled={refreshing}
            className="rounded border border-line px-3 py-1 text-sm font-medium hover:bg-ground disabled:opacity-50"
          >
            {refreshing ? "Refreshing…" : "Refresh"}
          </button>
        }
      >
        <dl className="divide-y divide-line">
          <Field label="Signed in as">{whoami.maintainer.email}</Field>
          <Field label="Release">
            <span className="flex flex-wrap items-center gap-x-3">
              <span>{whoami.release ?? "unknown"}</span>
              {ready?.links.sentryRelease && (
                <a
                  href={ready.links.sentryRelease}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-sm font-normal text-brand hover:underline"
                >
                  View release in Sentry ↗
                </a>
              )}
            </span>
          </Field>
          <Field label="Running since">
            {ready ? <span title={formatDate(ready.deployedAt)}>{formatRelative(ready.deployedAt)}</span> : "—"}
          </Field>
        </dl>
      </Panel>

      <p className="text-xs text-muted">{RECORDED_NOTE}</p>
      <HealthStrip state={health} onRetry={() => setHealthKey((k) => k + 1)} />
      <UsageTable state={usage} onRetry={() => setUsageKey((k) => k + 1)} />
    </div>
  );
}
