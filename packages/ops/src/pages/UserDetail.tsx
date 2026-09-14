import { useState } from "react";
import { Link, useParams } from "react-router-dom";
import type { MaskedUser, OpsUnmaskResponse, OpsUserDetailResponse } from "@application/shared";
import { useOpsQuery } from "@/lib/apiContext";
import { formatDate, roleLabel } from "@/lib/format";
import { Badge, Field, Panel, QueryStatus, RECORDED_NOTE } from "@/components/Panel";
import { UnmaskDialog } from "@/components/UnmaskDialog";

export function UserBadges({ user }: { user: MaskedUser }) {
  return (
    <span className="flex flex-wrap gap-1">
      {user.deletedAt ? (
        <Badge tone="bad">Deleted</Badge>
      ) : user.isActive ? (
        <Badge tone="ok">Active</Badge>
      ) : (
        <Badge tone="warn">Inactive</Badge>
      )}
      {!user.emailVerified && <Badge tone="warn">Email unverified</Badge>}
    </span>
  );
}

export function UserDetailPage() {
  const { id = "" } = useParams();
  // Keyed by id so unmasked values from one user never carry to the next.
  return <UserDetail key={id} id={id} />;
}

function UserDetail({ id }: { id: string }) {
  const state = useOpsQuery<OpsUserDetailResponse>(`/users/${encodeURIComponent(id)}`);
  // Component state only: gone on navigation, reload or unmount.
  const [unmasked, setUnmasked] = useState<OpsUnmaskResponse | null>(null);
  const [dialogOpen, setDialogOpen] = useState(false);

  return (
    <div className="space-y-4">
      <p className="text-xs text-muted">{RECORDED_NOTE}</p>
      <QueryStatus state={state}>
        {({ user, memberships }) => (
          <>
            <Panel
              title="User"
              actions={
                unmasked ? (
                  <span className="text-xs text-muted">Unmasked for this page view</span>
                ) : (
                  <button
                    type="button"
                    onClick={() => setDialogOpen(true)}
                    className="rounded border border-line px-3 py-1 text-sm font-medium hover:bg-ground"
                  >
                    Unmask
                  </button>
                )
              }
            >
              <dl className="divide-y divide-line">
                <Field label="Email">{unmasked ? unmasked.email : user.emailMasked}</Field>
                <Field label="Name">{unmasked ? unmasked.fullName : user.fullNameMasked}</Field>
                <Field label="Status">
                  <UserBadges user={user} />
                </Field>
                <Field label="Role">{roleLabel(user.role)}</Field>
                <Field label="Primary organisation">
                  {user.organizationId ? (
                    <Link to={`/orgs/${user.organizationId}`} className="text-brand hover:underline">
                      {user.organizationName ?? user.organizationId}
                    </Link>
                  ) : (
                    "—"
                  )}
                </Field>
                <Field label="Active sessions">{user.activeSessionCount}</Field>
                <Field label="Last session">{formatDate(user.lastSessionAt)}</Field>
                <Field label="Last login">{formatDate(user.lastLoginAt)}</Field>
                <Field label="Created">{formatDate(user.createdAt)}</Field>
                {user.deletedAt && <Field label="Deleted">{formatDate(user.deletedAt)}</Field>}
                <Field label="User ID">
                  <span className="font-mono">{user.id}</span>
                </Field>
              </dl>
            </Panel>

            <Panel title="Memberships">
              {memberships.length === 0 ? (
                <p className="px-5 py-3 text-sm text-muted">No organisation memberships.</p>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead className="text-left text-muted">
                      <tr>
                        <th className="px-5 py-2 font-normal">Organisation</th>
                        <th className="px-5 py-2 font-normal">Role</th>
                        <th className="px-5 py-2 font-normal">Joined</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-line">
                      {memberships.map((m) => (
                        <tr key={m.organizationId}>
                          <td className="px-5 py-2">
                            <Link to={`/orgs/${m.organizationId}`} className="text-brand hover:underline">
                              {m.organizationName ?? m.organizationId}
                            </Link>
                          </td>
                          <td className="px-5 py-2">{roleLabel(m.role)}</td>
                          <td className="px-5 py-2">{formatDate(m.joinedAt)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </Panel>

            {dialogOpen && (
              <UnmaskDialog userId={user.id} onClose={() => setDialogOpen(false)} onUnmasked={setUnmasked} />
            )}
          </>
        )}
      </QueryStatus>
    </div>
  );
}
