import { useState } from "react";
import { Link, useParams } from "react-router-dom";
import type { MaskedUser, OpsOrgDetailResponse, OpsOrgUsersResponse } from "@application/shared";
import { OpsApiError } from "@/lib/api";
import { useApi, useOpsQuery } from "@/lib/apiContext";
import { formatDate, roleLabel } from "@/lib/format";
import { Badge, Field, Panel, QueryStatus, RECORDED_NOTE } from "@/components/Panel";
import { UserBadges } from "@/pages/UserDetail";

export function OrgDetailPage() {
  const { id = "" } = useParams();
  return <OrgDetail key={id} id={id} />;
}

function OrgDetail({ id }: { id: string }) {
  const org = useOpsQuery<OpsOrgDetailResponse>(`/orgs/${encodeURIComponent(id)}`);
  const firstPage = useOpsQuery<OpsOrgUsersResponse>(`/orgs/${encodeURIComponent(id)}/users?limit=25`);

  return (
    <div className="space-y-4">
      <p className="text-xs text-muted">{RECORDED_NOTE}</p>
      <QueryStatus state={org}>
        {({ org }) => (
          <Panel title={org.name}>
            <dl className="divide-y divide-line">
              <Field label="Status">
                <span className="flex flex-wrap gap-1">
                  {org.deletedAt ? (
                    <Badge tone="bad">Deleted</Badge>
                  ) : org.isActive ? (
                    <Badge tone="ok">Active</Badge>
                  ) : (
                    <Badge tone="warn">Inactive</Badge>
                  )}
                  {org.legalHold && <Badge tone="warn">Legal hold</Badge>}
                </span>
              </Field>
              <Field label="Slug">{org.slug}</Field>
              <Field label="Contact email">{org.contactEmailMasked ?? "—"}</Field>
              <Field label="Members">
                {org.memberCount} ({org.roleCounts.admin} {roleLabel("admin")}, {org.roleCounts.event_manager}{" "}
                {roleLabel("event_manager")}, {org.roleCounts.volunteer} {roleLabel("volunteer")})
              </Field>
              <Field label="Rooms">{org.roomCount}</Field>
              <Field label="Created">{formatDate(org.createdAt)}</Field>
              <Field label="Org ID">
                <span className="font-mono">{org.id}</span>
              </Field>
            </dl>
          </Panel>
        )}
      </QueryStatus>

      <QueryStatus state={firstPage}>{(page) => <OrgUsers orgId={id} first={page} />}</QueryStatus>
    </div>
  );
}

function OrgUsers({ orgId, first }: { orgId: string; first: OpsOrgUsersResponse }) {
  const api = useApi();
  const [users, setUsers] = useState<MaskedUser[]>(first.users);
  const [cursor, setCursor] = useState<string | null>(first.nextCursor);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const loadMore = async () => {
    if (!cursor) return;
    setLoading(true);
    setError(null);
    try {
      const page = await api.get<OpsOrgUsersResponse>(
        `/orgs/${encodeURIComponent(orgId)}/users?limit=25&cursor=${encodeURIComponent(cursor)}`,
      );
      setUsers((prev) => [...prev, ...page.users]);
      setCursor(page.nextCursor);
    } catch (err) {
      setError(err instanceof OpsApiError ? err.code : "NETWORK_ERROR");
    } finally {
      setLoading(false);
    }
  };

  return (
    <Panel title={`Users (${users.length}${cursor ? "+" : ""})`}>
      {users.length === 0 ? (
        <p className="px-5 py-3 text-sm text-muted">No users.</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="text-left text-muted">
              <tr>
                <th className="px-5 py-2 font-normal">Email</th>
                <th className="px-5 py-2 font-normal">Name</th>
                <th className="px-5 py-2 font-normal">Role</th>
                <th className="px-5 py-2 font-normal">Status</th>
                <th className="px-5 py-2 font-normal">Last login</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-line">
              {users.map((u) => (
                <tr key={u.id}>
                  <td className="px-5 py-2">
                    <Link to={`/users/${u.id}`} className="text-brand hover:underline">
                      {u.emailMasked}
                    </Link>
                  </td>
                  <td className="px-5 py-2">{u.fullNameMasked}</td>
                  <td className="px-5 py-2">{roleLabel(u.role)}</td>
                  <td className="px-5 py-2">
                    <UserBadges user={u} />
                  </td>
                  <td className="px-5 py-2">{formatDate(u.lastLoginAt)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {(cursor || error) && (
        <div className="border-t border-line px-5 py-3">
          {error && (
            <p role="alert" className="mb-2 text-sm text-danger">
              Could not load more ({error}).
            </p>
          )}
          {cursor && (
            <button
              type="button"
              onClick={loadMore}
              disabled={loading}
              className="rounded border border-line px-3 py-1 text-sm font-medium hover:bg-ground disabled:opacity-50"
            >
              {loading ? "Loading…" : "Load more"}
            </button>
          )}
        </div>
      )}
    </Panel>
  );
}
