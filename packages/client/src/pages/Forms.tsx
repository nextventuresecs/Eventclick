import { useCallback, useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { format } from "date-fns";
import { FileInput, Search } from "lucide-react";
import { hasRolePermission, type EventRoom } from "@application/shared";
import { roomsApi, formsApi } from "@/lib/api";
import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardTitle, CardDescription } from "@/components/ui/card";
import { Input } from "@/components/ui/input";

const pill = (status: EventRoom["status"]) => {
  const styles: Record<EventRoom["status"], { bg: string; text: string }> = {
    live: { bg: "var(--color-status-live-bg)", text: "var(--color-status-live)" },
    scheduled: { bg: "var(--color-status-scheduled-bg)", text: "var(--color-status-scheduled)" },
    ended: { bg: "var(--color-status-ended-bg)", text: "var(--color-status-ended)" },
    cancelled: { bg: "var(--color-status-cancelled-bg)", text: "var(--color-status-cancelled)" },
  };
  const s = styles[status];
  return (
    <span
      className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold border-0"
      style={{ backgroundColor: s.bg, color: s.text }}
    >
      <span className="h-1.5 w-1.5 rounded-full bg-current opacity-70" />
      {status.charAt(0).toUpperCase() + status.slice(1)}
    </span>
  );
};

export const Forms = () => {
  const { user } = useAuth();
  const [rooms, setRooms] = useState<EventRoom[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState("");

  const canManageRooms = user ? hasRolePermission(user.role, "manage_rooms") : false;

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await roomsApi.list();
      setRooms(res.items);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load rooms");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const filtered = useMemo(() => {
    return rooms.filter((r) => r.title.toLowerCase().includes(search.toLowerCase()));
  }, [rooms, search]);

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-3xl font-bold tracking-tight font-display text-[var(--color-gray-900)]">Forms</h2>
        <p className="text-[var(--color-gray-400)] mt-1">
          Review attendance forms for {user?.organizationName || "your organization"} events
        </p>
      </div>

      {error && (
        <Card className="border-[var(--color-status-cancelled-bg)] bg-[var(--color-status-cancelled-bg)]">
          <CardContent className="pt-6">
            <p className="text-[var(--color-status-cancelled)] text-sm">{error}</p>
          </CardContent>
        </Card>
      )}

      <div className="flex items-center gap-2">
        <div className="relative flex-1 max-w-md">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[var(--color-gray-400)]" />
          <Input
            placeholder="Search forms..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9 border-[var(--color-gray-200)] bg-[var(--color-gray-50)] input-premium"
          />
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {filtered.length === 0 ? (
          <Card className="col-span-full border border-dashed border-[var(--color-gray-200)]">
            <CardContent className="p-8 text-center text-[var(--color-gray-400)]">
              <FileInput className="mx-auto h-10 w-10 mb-2 text-[var(--color-gray-300)]" />
              <p>No forms found</p>
            </CardContent>
          </Card>
        ) : (
          filtered.map((room) => (
            <Card key={room.id} className="card-base rounded-2xl">
              <CardContent className="p-5">
                <div className="flex items-start justify-between gap-3 mb-3">
                  {pill(room.status)}
                  <span className="text-xs text-[var(--color-gray-400)] font-medium tabular-nums">
                    {format(new Date(room.scheduledStart), "MMM d, yyyy")}
                  </span>
                </div>
                <CardTitle className="text-base font-semibold text-[var(--color-gray-900)] mb-1">{room.title}</CardTitle>
                <CardDescription className="text-sm text-[var(--color-gray-400)] mb-4">
                  {room.attendanceCount ?? 0} records
                </CardDescription>
                <Link
                  to={`/rooms/${room.id}/attendance/records`}
                  className="inline-flex items-center justify-center gap-2 rounded-xl px-4 h-9 text-sm font-semibold bg-brand-gradient text-white shadow-sm hover:shadow-md hover:brightness-110 active:scale-[0.98] transition-all w-full"
                >
                  View records
                </Link>
              </CardContent>
            </Card>
          ))
        )}
      </div>
    </div>
  );
};
