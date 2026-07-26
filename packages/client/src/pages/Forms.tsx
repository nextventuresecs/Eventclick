import { useCallback, useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { format } from "date-fns";
import { FileInput, Search, MapPin, ClipboardList, Sliders } from "lucide-react";
import { hasRolePermission, type EventRoom } from "@application/shared";
import { roomsApi } from "@/lib/api";
import { useAuth } from "@/hooks/useAuth";
import { Card, CardContent, CardTitle, CardDescription } from "@/components/ui/card";
import { Input } from "@/components/ui/input";

const pill = (status: EventRoom["status"]) => {
  const styles: Record<EventRoom["status"], { bg: string; text: string }> = {
    live: { bg: "bg-emerald-50 border-emerald-200 text-emerald-700", text: "Live" },
    scheduled: { bg: "bg-purple-50 border-purple-200 text-purple-700", text: "Scheduled" },
    ended: { bg: "bg-gray-100 border-gray-200 text-gray-600", text: "Ended" },
    cancelled: { bg: "bg-red-50 border-red-200 text-red-600", text: "Cancelled" },
  };
  const s = styles[status];
  return (
    <span className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold border ${s.bg}`}>
      <span className={`h-1.5 w-1.5 rounded-full ${status === "live" ? "bg-emerald-500 animate-pulse" : "bg-current"}`} />
      {s.text}
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
    return rooms.filter((r) => r.title.toLowerCase().includes(search.toLowerCase()) || r.location?.toLowerCase().includes(search.toLowerCase()));
  }, [rooms, search]);

  return (
    <div className="space-y-8 animate-in fade-in">
      {/* Header Banner Tile */}
      <div className="rounded-3xl bg-brand-gradient-tile p-6 md:p-8 text-white shadow-lg space-y-3">
        <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold bg-white/15 backdrop-blur-md text-white border border-white/20">
          <FileInput className="w-3.5 h-3.5 text-purple-300" />
          Form Schema Directory ({rooms.length})
        </div>
        <h1 className="text-2xl md:text-3xl font-bold font-display text-white tracking-tight">
          Attendance Form Schemas
        </h1>
        <p className="text-xs text-white/80 max-w-xl leading-relaxed">
          Manage customized attendance form definitions for {user?.organizationName || "your organization"} events.
        </p>
      </div>

      {error && (
        <Card className="bg-red-50 border-red-200">
          <CardContent className="p-4">
            <p className="text-red-700 text-xs font-semibold">{error}</p>
          </CardContent>
        </Card>
      )}

      {/* Control Toolbar */}
      <div className="flex items-center justify-between gap-4">
        <div className="relative flex-1 max-w-md">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
          <Input
            placeholder="Search forms by room title or location..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9 h-10 border-gray-200 bg-white input-premium text-xs rounded-xl"
          />
        </div>
      </div>

      {/* Grid of Form Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {filtered.length === 0 ? (
          <Card className="col-span-full border border-dashed border-gray-200 rounded-3xl bg-white">
            <CardContent className="p-12 text-center text-gray-400 space-y-2">
              <FileInput className="mx-auto h-10 w-10 text-gray-300" />
              <p className="text-sm font-semibold text-gray-700">No attendance forms found</p>
              <p className="text-xs text-gray-400">Create an event room to design custom attendance forms.</p>
            </CardContent>
          </Card>
        ) : (
          filtered.map((room) => (
            <Card key={room.id} className="card-static rounded-2xl hover:shadow-md transition-all bg-white flex flex-col justify-between">
              <CardContent className="p-5 space-y-3">
                <div className="flex items-start justify-between gap-3">
                  {pill(room.status)}
                  <span className="text-xs text-gray-400 font-medium font-mono">
                    {format(new Date(room.scheduledStart), "MMM d, yyyy")}
                  </span>
                </div>
                <div>
                  <CardTitle className="text-base font-bold font-display text-gray-900 leading-tight mb-1">{room.title}</CardTitle>
                  {room.location && (
                    <div className="inline-flex items-center gap-1.5 text-purple-700 bg-purple-50 px-2.5 py-1 rounded-lg border border-purple-100 text-xs font-semibold">
                      <MapPin className="w-3.5 h-3.5 text-purple-600 shrink-0" />
                      <span className="truncate">{room.location}</span>
                    </div>
                  )}
                </div>

                <div className="flex items-center gap-1.5 text-xs text-gray-600 font-medium">
                  <ClipboardList className="w-3.5 h-3.5 text-purple-600" />
                  <span>{room.attendanceCount ?? 0} verified attendance records</span>
                </div>

                <div className="grid grid-cols-2 gap-2 pt-3 border-t border-gray-100">
                  {canManageRooms && (
                    <Link
                      to={`/rooms/${room.id}/form-builder`}
                      className="inline-flex items-center justify-center gap-1.5 rounded-xl px-3 h-9 text-xs font-bold border border-purple-200 text-purple-700 bg-purple-50 hover:bg-purple-100 transition-colors"
                    >
                      <Sliders className="w-3.5 h-3.5" /> Build Form
                    </Link>
                  )}
                  <Link
                    to={`/rooms/${room.id}/attendance/records`}
                    className={`inline-flex items-center justify-center gap-1.5 rounded-xl px-3 h-9 text-xs font-bold bg-brand-gradient text-white shadow-xs hover:shadow-md transition-all ${
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
