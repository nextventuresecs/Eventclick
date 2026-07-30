import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { format, formatDistanceToNow } from "date-fns";
import {
  CalendarClock,
  Clock,
  Copy,
  FileText,
  MapPin,
  PlusCircle,
  Radio,
  Search,
  Users,
  ClipboardList,
  XCircle,
  Activity,
  Layers,
} from "lucide-react";
import { hasRolePermission, type EventRoom } from "@application/shared";
import { roomsApi, ApiClientError } from "@/lib/api";
import { useAuth } from "@/hooks/useAuth";
import { useToast } from "@/hooks/useToast";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardTitle, CardDescription } from "@/components/ui/card";
import { Input } from "@/components/ui/input";

type FilterStatus = "all" | "live" | "scheduled" | "ended" | "cancelled";

const STATUS_META: Record<EventRoom["status"], { bg: string; border: string; text: string; label: string }> = {
  live: { bg: "bg-emerald-50 border-emerald-200", border: "border-emerald-500", text: "text-emerald-700", label: "Live" },
  scheduled: { bg: "bg-purple-50 border-purple-200", border: "border-purple-500", text: "text-purple-700", label: "Scheduled" },
  ended: { bg: "bg-gray-100 border-gray-200", border: "border-gray-400", text: "text-gray-600", label: "Ended" },
  cancelled: { bg: "bg-red-50 border-red-200", border: "border-red-500", text: "text-red-600", label: "Cancelled" },
};

const FILTER_TABS: { key: FilterStatus; label: string }[] = [
  { key: "all", label: "All Rooms" },
  { key: "live", label: "🔴 Live" },
  { key: "scheduled", label: "📅 Scheduled" },
  { key: "ended", label: "✅ Ended" },
];

const statusPill = (status: EventRoom["status"]) => {
  const meta = STATUS_META[status];
  return (
    <span className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold border ${meta.bg} ${meta.text}`}>
      <span className={`h-2 w-2 rounded-full ${status === "live" ? "bg-emerald-500 animate-pulse" : "bg-current"}`} />
      {meta.label}
    </span>
  );
};

const RoomCard = ({ room }: { room: EventRoom }) => {
  const { toast } = useToast();
  const { user } = useAuth();

  return (
    <Card
      className="card-static rounded-2xl border-l-4 transition-all duration-200 hover:shadow-md hover:-translate-y-0.5 bg-white overflow-hidden flex flex-col justify-between"
      style={{
        borderLeftColor:
          room.status === "live"
            ? "var(--color-status-live)"
            : room.status === "scheduled"
            ? "var(--color-status-scheduled)"
            : room.status === "ended"
            ? "var(--color-status-ended)"
            : "var(--color-status-cancelled)",
      }}
    >
      <CardContent className="p-5 space-y-3">
        <div className="flex items-start justify-between gap-3">
          {statusPill(room.status)}
          <span className="text-[11px] text-gray-400 font-medium font-mono">
            {formatDistanceToNow(new Date(room.createdAt), { addSuffix: true })}
          </span>
        </div>

        <div>
          <h4 className="text-base font-bold font-display text-gray-900 leading-tight mb-1">{room.title}</h4>
          {room.description && (
            <p className="text-xs text-gray-500 line-clamp-2 leading-relaxed">{room.description}</p>
          )}
        </div>

        <div className="flex flex-wrap items-center gap-2 text-xs text-gray-600 font-medium pt-1">
          <div className="inline-flex items-center gap-1 bg-gray-50 px-2.5 py-1 rounded-lg border border-gray-200">
            <Clock className="w-3.5 h-3.5 text-gray-400" />
            <span>{format(new Date(room.scheduledStart), "MMM d, h:mm a")}</span>
          </div>

          {room.location && (
            <div className="inline-flex items-center gap-1 text-purple-700 bg-purple-50 px-2.5 py-1 rounded-lg border border-purple-100 font-semibold truncate max-w-48">
              <MapPin className="w-3.5 h-3.5 text-purple-600 shrink-0" />
              <span className="truncate">{room.location}</span>
            </div>
          )}

          {room.attendanceCount != null && room.attendanceCount > 0 && (
            <div className="inline-flex items-center gap-1 text-emerald-700 bg-emerald-50 px-2.5 py-1 rounded-lg border border-emerald-100 font-semibold">
              <ClipboardList className="w-3.5 h-3.5" />
              <span>{room.attendanceCount} check-ins</span>
            </div>
          )}
        </div>

        <div className="flex flex-wrap gap-2 pt-3 border-t border-gray-100">
          {room.status === "live" && hasRolePermission(user?.role ?? "volunteer", "view_live_session") && (
            <Link
              to={`/rooms/${room.id}/live`}
              className="inline-flex items-center gap-1.5 rounded-xl px-3 h-8 text-xs font-bold bg-emerald-500 text-white hover:bg-emerald-600 shadow-xs transition-all"
            >
              <Radio className="w-3.5 h-3.5 animate-pulse" /> Live Broadcast
            </Link>
          )}
          {hasRolePermission(user?.role ?? "volunteer", "take_attendance") && (
            <Link
              to={`/rooms/${room.id}/attendance`}
              className="inline-flex items-center gap-1.5 rounded-xl px-3 h-8 text-xs font-bold bg-brand-gradient text-white shadow-xs hover:shadow-md transition-all"
            >
              <ClipboardList className="w-3.5 h-3.5" /> Attendance
            </Link>
          )}
          {hasRolePermission(user?.role ?? "volunteer", "share_live_link") && (
            <Button
              variant="outline"
              size="sm"
              className="h-8 px-2.5 gap-1 rounded-xl text-xs font-medium border-gray-200 text-gray-600"
              onClick={() => {
                navigator.clipboard.writeText(room.shareUrl).then(
                  () => toast("Link copied to clipboard!", "success"),
                  () => toast("Copy failed.", "error")
                );
              }}
            >
              <Copy className="w-3.5 h-3.5" /> Copy Link
            </Button>
          )}
          <Link
            to={`/rooms/${room.id}/form-builder`}
            className="inline-flex items-center gap-1 rounded-xl px-2.5 h-8 text-xs font-medium border border-gray-200 text-gray-600 hover:bg-gray-50 transition-colors"
          >
            <FileText className="w-3.5 h-3.5" /> Form Builder
          </Link>
          <Link
            to={`/rooms/${room.id}/attendance/records`}
            className="inline-flex items-center gap-1 rounded-xl px-2.5 h-8 text-xs font-medium border border-gray-200 text-gray-600 hover:bg-gray-50 transition-colors"
          >
            <MapPin className="w-3.5 h-3.5" /> Records
          </Link>
        </div>
      </CardContent>
    </Card>
  );
};

export const Rooms = () => {
  const { user } = useAuth();
  const [rooms, setRooms] = useState<EventRoom[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [activeFilter, setActiveFilter] = useState<FilterStatus>("all");
  const [search, setSearch] = useState("");

  const canManageRooms = user ? hasRolePermission(user.role, "manage_rooms") : false;

  useEffect(() => {
    roomsApi
      .list()
      .then((res) => setRooms(res.items))
      .catch((err) => setError(err instanceof ApiClientError ? err.message : "Failed to load rooms"))
      .finally(() => setLoading(false));
  }, []);

  const filteredRooms = useMemo(() => {
    let result = rooms;
    if (activeFilter !== "all") {
      result = result.filter((r) => r.status === activeFilter);
    }
    if (search.trim()) {
      const q = search.toLowerCase();
      result = result.filter((r) => r.title.toLowerCase().includes(q) || r.description?.toLowerCase().includes(q) || r.location?.toLowerCase().includes(q));
    }
    const order: Record<EventRoom["status"], number> = { live: 0, scheduled: 1, ended: 2, cancelled: 3 };
    return result.sort((a, b) => order[a.status] - order[b.status] || new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
  }, [rooms, activeFilter, search]);

  const counts = useMemo(
    () => ({
      all: rooms.length,
      live: rooms.filter((r) => r.status === "live").length,
      scheduled: rooms.filter((r) => r.status === "scheduled").length,
      ended: rooms.filter((r) => r.status === "ended").length,
      cancelled: rooms.filter((r) => r.status === "cancelled").length,
    }),
    [rooms]
  );

  if (loading) {
    return (
      <div className="space-y-6">
        <div className="h-32 bg-gray-100 rounded-3xl animate-pulse" />
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {Array.from({ length: 6 }).map((_, i) => (
            <Card key={i} className="h-52 bg-gray-50 rounded-2xl animate-pulse" />
          ))}
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <Card className="border border-red-200 bg-red-50/50">
        <CardContent className="p-8 text-center space-y-4">
          <XCircle className="w-10 h-10 text-red-500 mx-auto" />
          <p className="text-sm font-semibold text-red-700">{error}</p>
          <Button variant="outline" onClick={() => window.location.reload()} className="rounded-xl border-red-200 text-red-700">
            Try Again
          </Button>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-8 animate-in fade-in">
      {/* Header Banner Tile */}
      <div className="rounded-3xl bg-brand-gradient-tile p-6 md:p-8 text-white shadow-lg flex flex-col md:flex-row md:items-center justify-between gap-6">
        <div className="space-y-2">
          <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold bg-white/15 backdrop-blur-md text-white border border-white/20">
            <Layers className="w-3.5 h-3.5 text-purple-300" />
            Event Rooms Directory ({rooms.length})
          </div>
          <h1 className="text-2xl md:text-3xl font-bold font-display text-white tracking-tight">
            Event & Activity Rooms
          </h1>
          <p className="text-xs text-white/80 max-w-xl leading-relaxed">
            Broadcast live sessions, build custom attendance forms, track GPS geotagged attendance check-ins, and export PDF reports.
          </p>
        </div>

        {canManageRooms && (
          <Link to="/rooms/create" className="shrink-0">
            <Button size="lg" className="bg-white text-purple-950 hover:bg-purple-50 font-bold text-xs rounded-xl shadow-md gap-2">
              <PlusCircle className="w-4 h-4 text-purple-700" /> Create Event Room
            </Button>
          </Link>
        )}
      </div>

      {/* Control Filter Toolbar */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div className="flex bg-gray-100/80 p-1 rounded-xl gap-1 shrink-0">
          {FILTER_TABS.map((tab) => (
            <button
              key={tab.key}
              onClick={() => setActiveFilter(tab.key)}
              className={`px-3.5 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                activeFilter === tab.key
                  ? "bg-white text-gray-900 shadow-xs"
                  : "text-gray-500 hover:text-gray-900"
              }`}
            >
              {tab.label}
              <span className={`ml-1.5 text-[11px] font-mono ${activeFilter === tab.key ? "text-purple-600" : "text-gray-400"}`}>
                ({counts[tab.key]})
              </span>
            </button>
          ))}
        </div>

        <div className="relative max-w-xs w-full">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Filter rooms by title or location..."
            className="input-premium pl-9 h-10 text-xs rounded-xl border-gray-200"
          />
        </div>
      </div>

      {/* Room Grid */}
      {filteredRooms.length === 0 ? (
        <Card className="border border-dashed border-gray-200 bg-white rounded-3xl">
          <CardContent className="py-16 flex flex-col items-center text-center space-y-3">
            <CalendarClock className="w-12 h-12 text-gray-300" />
            <CardTitle className="text-base font-bold font-display text-gray-900">
              {search ? "No rooms match your search" : activeFilter === "all" ? "No event rooms created yet" : `No ${activeFilter} rooms`}
            </CardTitle>
            <CardDescription className="text-xs max-w-sm">
              {search ? "Try adjusting your search terms." : canManageRooms ? "Create your first room to begin hosting live sessions and attendance tracking." : "You have not been assigned to any event rooms yet."}
            </CardDescription>
            {canManageRooms && (
              <Link to="/rooms/create" className="inline-flex items-center gap-1.5 px-4 h-9 rounded-xl bg-brand-gradient text-white text-xs font-semibold">
                <PlusCircle className="w-4 h-4" /> Create First Room
              </Link>
            )}
          </CardContent>
        </Card>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {filteredRooms.map((room) => (
            <RoomCard key={room.id} room={room} />
          ))}
        </div>
      )}
    </div>
  );
};
