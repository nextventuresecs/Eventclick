import { Link } from "react-router-dom";
import type { OpsUsage } from "@application/shared";
import type { QueryState } from "@/lib/apiContext";
import { formatDate, formatRelative } from "@/lib/format";
import { Badge, Panel, QueryStatus } from "@/components/Panel";
import { RetryButton } from "@/components/HealthStrip";

function When({ iso }: { iso: string | null }) {
  if (!iso) return <span className="text-muted">—</span>;
  return (
    <time dateTime={iso} title={formatDate(iso)}>
      {formatRelative(iso)}
    </time>
  );
}

export function UsageTable({ state, onRetry }: { state: QueryState<OpsUsage>; onRetry: () => void }) {
  return (
    <Panel title="Usage" actions={state.status === "error" ? <RetryButton onClick={onRetry} /> : undefined}>
      {state.status === "ready" ? (
        <UsageBody usage={state.data} />
      ) : (
        <div className="px-5 py-3">
          <QueryStatus state={state}>{() => null}</QueryStatus>
        </div>
      )}
    </Panel>
  );
}

function UsageBody({ usage }: { usage: OpsUsage }) {
  const { totals, orgs } = usage;
  const stats: Array<[string, number]> = [
    ["Orgs", totals.orgs],
    ["Active 7d", totals.activeOrgs7d],
    ["Active 30d", totals.activeOrgs30d],
    ["Users", totals.users],
    ["Rooms 30d", totals.rooms30d],
    ["Attendance 30d", totals.attendance30d],
  ];

  return (
    <>
      <dl className="grid grid-cols-2 gap-px border-b border-line bg-line sm:grid-cols-3 lg:grid-cols-6">
        {stats.map(([label, value]) => (
          <div key={label} className="bg-panel px-5 py-3">
            <dt className="text-xs text-muted">{label}</dt>
            <dd className="text-lg font-semibold tabular-nums">{value}</dd>
          </div>
        ))}
      </dl>

      {orgs.length === 0 ? (
        <p className="px-5 py-3 text-sm text-muted">No organisations.</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="text-left text-muted">
              <tr>
                <th className="px-5 py-2 font-normal">Organisation</th>
                <th className="px-5 py-2 font-normal">Activity</th>
                <th className="px-5 py-2 text-right font-normal">Members</th>
                <th className="px-5 py-2 font-normal">Last activity</th>
                <th className="px-5 py-2 font-normal">Last login</th>
                <th className="px-5 py-2 font-normal">Last room</th>
                <th className="px-5 py-2 font-normal">Last attendance</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-line">
              {orgs.map((o) => (
                <tr key={o.id}>
                  <td className="px-5 py-2">
                    <Link to={`/orgs/${o.id}`} className="font-medium text-brand hover:underline">
                      {o.name}
                    </Link>
                    <span className="block text-xs text-muted">{o.slug}</span>
                  </td>
                  <td className="px-5 py-2">
                    <span className="flex flex-wrap gap-1">
                      {o.active7d ? (
                        <Badge tone="ok">7d</Badge>
                      ) : o.active30d ? (
                        <Badge tone="warn">30d</Badge>
                      ) : (
                        <Badge tone="neutral">Idle</Badge>
                      )}
                      {!o.isActive && <Badge tone="bad">Inactive</Badge>}
                    </span>
                  </td>
                  <td className="px-5 py-2 text-right tabular-nums">{o.members}</td>
                  <td className="px-5 py-2 whitespace-nowrap">
                    <When iso={o.lastActivityAt} />
                  </td>
                  <td className="px-5 py-2 whitespace-nowrap">
                    <When iso={o.lastLoginAt} />
                  </td>
                  <td className="px-5 py-2 whitespace-nowrap">
                    <When iso={o.lastRoomCreatedAt} />
                  </td>
                  <td className="px-5 py-2 whitespace-nowrap">
                    <When iso={o.lastAttendanceAt} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {orgs.length < totals.orgs && (
        <p className="border-t border-line px-5 py-2 text-xs text-muted">
          Showing the {orgs.length} most recently active of {totals.orgs}.
        </p>
      )}
    </>
  );
}
