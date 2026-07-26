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
        <h2 className="text-3xl font-bold tracking-tight font-display text-(--color-gray-900)">Forms</h2>
        <p className="text-gray-400 mt-1">
          Review attendance forms for {user?.organizationName || "your organization"} events
        </p>
      </div>

      {error && (
        <Card className="bg-status-cancelled-bg">
          <CardContent className="pt-6">
            <p className="text-status-cancelled text-sm">{error}</p>
          </CardContent>
        </Card>
      )}

      <div className="flex items-center gap-2">
        <div className="relative flex-1 max-w-md">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
          <Input
            placeholder="Search forms..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9 border-(--color-gray-200) bg-(--color-gray-50) input-premium"
          />
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {filtered.length === 0 ? (
          <Card className="col-span-full border border-dashed border-(--color-gray-200)">
            <CardContent className="p-8 text-center text-gray-400">
              <FileInput className="mx-auto h-10 w-10 mb-2 text-gray-300" />
              <p>No forms found</p>
            </CardContent>
          </Card>
        ) : (
          filtered.map((room) => (
            <Card key={room.id} className="card-static rounded-2xl hover:shadow-md transition-all">
              <CardContent className="p-5 space-y-3">
                <div className="flex items-start justify-between gap-3">
                  {pill(room.status)}
                  <span className="text-xs text-gray-400 font-medium tabular-nums">
                    {format(new Date(room.scheduledStart), "MMM d, yyyy")}
                  </span>
                </div>
                <div>
                  <CardTitle className="text-base font-bold font-display text-gray-900 mb-1">{room.title}</CardTitle>
                  {room.location && (
                    <p className="text-xs text-purple-700 font-medium flex items-center gap-1">
                      <span className="w-1.5 h-1.5 rounded-full bg-purple-600" />
                      {room.location}
                    </p>
                  )}
                </div>
                <CardDescription className="text-xs text-gray-500 font-medium">
                  {room.attendanceCount ?? 0} verified attendance records
                </CardDescription>

                <div className="grid grid-cols-2 gap-2 pt-2 border-t border-gray-100">
                  {canManageRooms && (
                    <Link
                      to={`/rooms/${room.id}/form-builder`}
                      className="inline-flex items-center justify-center gap-1 rounded-xl px-3 h-9 text-xs font-semibold border border-purple-200 text-purple-700 bg-purple-50 hover:bg-purple-100 transition-colors"
                    >
                      Build Form
                    </Link>
                  )}
                  <Link
                    to={`/rooms/${room.id}/attendance/records`}
                    className={`inline-flex items-center justify-center gap-1 rounded-xl px-3 h-9 text-xs font-semibold bg-brand-gradient text-white shadow-xs hover:shadow-md transition-all ${
                      canManageRooms ? "" : "col-span-2"
                    }`}
                  >
                    View Records
                  </Link>
                </div>
              </CardContent>
            </Card>
          ))
        )}
      </div>
    </div>
  );
};
