import { useCallback, useEffect, useState } from "react";
import { ScrollText, Filter, ChevronLeft, ChevronRight, AlertTriangle } from "lucide-react";
import { AUDIT_ACTIONS, type AuditLogEntry, type AuditLogPage } from "@application/shared";
import { adminApi, ApiClientError } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardTitle, CardDescription } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

const PAGE_SIZE = 50;

/** Local-time display; the API returns ISO timestamps in UTC. */
const formatWhen = (iso: string): string => {
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? iso : d.toLocaleString();
};

/**
 * Renders the before/after snapshots. These arrive already parsed (or null,
 * when the stored text was unparseable — see audit.service.ts), so this only
 * has to handle "absent".
 */
const ValueBlock = ({ label, values }: { label: string; values: Record<string, unknown> | null }) => {
  if (!values || Object.keys(values).length === 0) return null;
  return (
    <div className="min-w-0">
      <p className="text-xs font-medium text-muted-foreground">{label}</p>
      <pre className="mt-1 overflow-x-auto rounded bg-muted p-2 text-xs">
        {JSON.stringify(values, null, 2)}
      </pre>
    </div>
  );
};

export const AdminAuditLog = () => {
  const [page, setPage] = useState<AuditLogPage | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [offset, setOffset] = useState(0);

  const [action, setAction] = useState<string>("");
  const [resourceType, setResourceType] = useState("");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");

  const load = useCallback(
    async (nextOffset: number) => {
      setLoading(true);
      setError(null);
      try {
        const result = await adminApi.listAuditLogs({
          action: action || undefined,
          resourceType: resourceType || undefined,
          // <input type="date"> gives YYYY-MM-DD; the API wants a datetime.
          from: from ? new Date(`${from}T00:00:00.000Z`).toISOString() : undefined,
          to: to ? new Date(`${to}T23:59:59.999Z`).toISOString() : undefined,
          limit: PAGE_SIZE,
          offset: nextOffset,
        });
        setPage(result);
        setOffset(nextOffset);
      } catch (err) {
        setError(err instanceof ApiClientError ? err.message : "Failed to load the audit log");
      } finally {
        setLoading(false);
      }
    },
    [action, resourceType, from, to],
  );

  useEffect(() => {
    void load(0);
  }, [load]);

  const total = page?.total ?? 0;
  const showingFrom = total === 0 ? 0 : offset + 1;
  const showingTo = Math.min(offset + PAGE_SIZE, total);

  return (
    <div className="space-y-6 p-4 md:p-6">
      <div className="flex items-center gap-3">
        <ScrollText className="h-6 w-6 text-muted-foreground" />
        <div>
          <CardTitle>Audit log</CardTitle>
          <CardDescription>Who changed what, and when — for your organisation only.</CardDescription>
        </div>
      </div>

      <Card>
        <CardContent className="grid gap-4 pt-6 md:grid-cols-4">
          <div className="space-y-1">
            <Label htmlFor="audit-action">Action</Label>
            <select
              id="audit-action"
              className="h-9 w-full rounded-md border border-input bg-background px-3 text-sm"
              value={action}
              onChange={(e) => setAction(e.target.value)}
            >
              <option value="">All actions</option>
              {AUDIT_ACTIONS.map((a) => (
                <option key={a} value={a}>
                  {a}
                </option>
              ))}
            </select>
          </div>
          <div className="space-y-1">
            <Label htmlFor="audit-resource">Resource type</Label>
            <Input
              id="audit-resource"
              placeholder="user, room, …"
              value={resourceType}
              onChange={(e) => setResourceType(e.target.value)}
            />
          </div>
          <div className="space-y-1">
            <Label htmlFor="audit-from">From</Label>
            <Input id="audit-from" type="date" value={from} onChange={(e) => setFrom(e.target.value)} />
          </div>
          <div className="space-y-1">
            <Label htmlFor="audit-to">To</Label>
            <Input id="audit-to" type="date" value={to} onChange={(e) => setTo(e.target.value)} />
          </div>
        </CardContent>
      </Card>

      {error && (
        <div className="flex items-center gap-2 rounded-md border border-destructive/40 bg-destructive/10 p-3 text-sm">
          <AlertTriangle className="h-4 w-4" />
          <span>{error}</span>
        </div>
      )}

      <Card>
        <CardContent className="pt-6">
          {loading && <p className="text-sm text-muted-foreground">Loading…</p>}

          {!loading && page && page.items.length === 0 && (
            <div className="flex flex-col items-center gap-2 py-10 text-center">
              <Filter className="h-8 w-8 text-muted-foreground" />
              <p className="text-sm text-muted-foreground">
                No audit entries match these filters.
              </p>
            </div>
          )}

          {!loading && page && page.items.length > 0 && (
            <ul className="divide-y">
              {page.items.map((entry: AuditLogEntry) => (
                <li key={entry.id} className="space-y-2 py-4">
                  <div className="flex flex-wrap items-baseline justify-between gap-2">
                    <div className="min-w-0">
                      <p className="font-medium">{entry.action}</p>
                      <p className="text-sm text-muted-foreground">
                        {entry.actorEmail ?? entry.actorUserId ?? "unknown actor"} ·{" "}
                        {entry.resourceType}
                        {entry.resourceId ? ` ${entry.resourceId}` : ""}
                      </p>
                    </div>
                    <time className="text-sm text-muted-foreground" dateTime={entry.createdAt}>
                      {formatWhen(entry.createdAt)}
                    </time>
                  </div>

                  {(entry.oldValues || entry.newValues) && (
                    <div className="grid gap-3 md:grid-cols-2">
                      <ValueBlock label="Before" values={entry.oldValues} />
                      <ValueBlock label="After" values={entry.newValues} />
                    </div>
                  )}

                  {entry.ipAddress && (
                    <p className="text-xs text-muted-foreground">from {entry.ipAddress}</p>
                  )}
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>

      <div className="flex items-center justify-between">
        <p className="text-sm text-muted-foreground">
          {total === 0 ? "No entries" : `Showing ${showingFrom}–${showingTo} of ${total}`}
        </p>
        <div className="flex gap-2">
          <Button
            variant="outline"
            size="sm"
            disabled={loading || offset === 0}
            onClick={() => void load(Math.max(0, offset - PAGE_SIZE))}
          >
            <ChevronLeft className="h-4 w-4" /> Previous
          </Button>
          <Button
            variant="outline"
            size="sm"
            disabled={loading || offset + PAGE_SIZE >= total}
            onClick={() => void load(offset + PAGE_SIZE)}
          >
            Next <ChevronRight className="h-4 w-4" />
          </Button>
        </div>
      </div>
    </div>
  );
};

export default AdminAuditLog;
