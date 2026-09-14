import type { ReactNode } from "react";
import type { QueryState } from "@/lib/apiContext";
import { NotAuthorized } from "@/pages/NotAuthorized";

export function Panel({ title, children, actions }: { title: string; children: ReactNode; actions?: ReactNode }) {
  return (
    <section className="rounded-lg border border-line bg-panel">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-line px-5 py-3">
        <h2 className="text-base font-semibold">{title}</h2>
        {actions}
      </div>
      {children}
    </section>
  );
}

const MESSAGES: Record<string, string> = {
  NOT_FOUND: "Not found.",
  VALIDATION_ERROR: "That is not a valid ID.",
  AUDIT_UNAVAILABLE: "The access log is unavailable, so nothing can be shown. Try again shortly.",
  QUERY_TIMEOUT: "The query timed out. Try again shortly.",
  RATE_LIMITED: "Too many requests. Wait a minute and try again.",
};

/** Loading and error states shared by every data view. 403 means the maintainer was deactivated mid-session. */
export function QueryStatus<T>({ state, children }: { state: QueryState<T>; children: (data: T) => ReactNode }) {
  if (state.status === "loading") return <p className="text-sm text-muted">Loading…</p>;
  if (state.status === "error") {
    if (state.httpStatus === 403) return <NotAuthorized />;
    return (
      <p role="alert" className="rounded-lg border border-line bg-panel p-5 text-sm text-danger">
        {MESSAGES[state.code] ?? `Request failed (${state.code}).`}
      </p>
    );
  }
  return <>{children(state.data)}</>;
}

export function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="grid grid-cols-1 gap-1 px-5 py-2.5 sm:grid-cols-3">
      <dt className="text-sm text-muted">{label}</dt>
      <dd className="text-sm font-medium break-all sm:col-span-2">{children}</dd>
    </div>
  );
}

export function Badge({ tone, children }: { tone: "ok" | "warn" | "bad"; children: ReactNode }) {
  const tones = {
    ok: "bg-emerald-50 text-emerald-800 border-emerald-200",
    warn: "bg-amber-50 text-amber-800 border-amber-200",
    bad: "bg-red-50 text-red-800 border-red-200",
  };
  return <span className={`rounded border px-1.5 py-0.5 text-xs font-medium ${tones[tone]}`}>{children}</span>;
}

export const RECORDED_NOTE = "This view is recorded.";
