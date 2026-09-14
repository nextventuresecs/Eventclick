import { Link, useSearchParams } from "react-router-dom";
import type { OpsSearchResponse } from "@application/shared";
import { useOpsQuery } from "@/lib/apiContext";
import { roleLabel } from "@/lib/format";
import { Panel, QueryStatus, RECORDED_NOTE } from "@/components/Panel";

export const NO_MATCH = "No exact match. Search needs a full email, user/org ID, org slug, or request ID.";

export function SearchResults() {
  const [params] = useSearchParams();
  const q = (params.get("q") ?? "").trim();
  const state = useOpsQuery<OpsSearchResponse>(q ? `/search?q=${encodeURIComponent(q)}` : null);

  if (!q) return <p className="text-sm text-muted">{NO_MATCH}</p>;

  return (
    <div className="space-y-4">
      <p className="text-xs text-muted">{RECORDED_NOTE}</p>
      <QueryStatus state={state}>
        {({ results }) =>
          results.length === 0 ? (
            <p className="rounded-lg border border-line bg-panel p-5 text-sm text-muted">{NO_MATCH}</p>
          ) : (
            <Panel title={`${results.length} exact ${results.length === 1 ? "match" : "matches"}`}>
              <ul className="divide-y divide-line">
                {results.map((r) => {
                  if (r.kind === "user") {
                    return (
                      <li key={`user-${r.user.id}`} className="px-5 py-3 text-sm">
                        <span className="mr-2 text-xs uppercase text-muted">User</span>
                        <Link to={`/users/${r.user.id}`} className="font-medium text-brand hover:underline">
                          {r.user.emailMasked}
                        </Link>
                        <span className="ml-2 text-muted">
                          {r.user.fullNameMasked} · {roleLabel(r.user.role)}
                          {r.user.organizationName ? ` · ${r.user.organizationName}` : ""}
                        </span>
                      </li>
                    );
                  }
                  if (r.kind === "org") {
                    return (
                      <li key={`org-${r.org.id}`} className="px-5 py-3 text-sm">
                        <span className="mr-2 text-xs uppercase text-muted">Org</span>
                        <Link to={`/orgs/${r.org.id}`} className="font-medium text-brand hover:underline">
                          {r.org.name}
                        </Link>
                        <span className="ml-2 text-muted">
                          {r.org.slug} · {r.org.memberCount} members
                        </span>
                      </li>
                    );
                  }
                  return (
                    <li key={`request-${r.requestId}`} className="px-5 py-3 text-sm">
                      <span className="mr-2 text-xs uppercase text-muted">Request ID</span>
                      <span className="font-mono">{r.requestId}</span>
                      <span className="ml-2 text-muted" title="Log search arrives in a later release">
                        Log search coming soon
                      </span>
                    </li>
                  );
                })}
              </ul>
            </Panel>
          )
        }
      </QueryStatus>
    </div>
  );
}
