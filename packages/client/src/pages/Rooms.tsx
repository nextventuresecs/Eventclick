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
  live: { bg: "bg-emerald-50", border: "border-emerald-200", text: "text-emerald-700", label: "Live" },
  scheduled: { bg: "bg-blue-50", border: "border-blue-200", text: "text-blue-700", label: "Scheduled" },
  ended: { bg: "bg-gray-50", border: "border-gray-200", text: "text-gray-500", label: "Ended" },
  cancelled: { bg: "bg-red-50", border: "border-red-200", text: "text-red-600", label: "Cancelled" },
};

const FILTER_TABS: { key: FilterStatus; label: string }[] = [
  { key: "all", label: "All Rooms" },
  { key: "live", label: "Live" },
  { key: "scheduled", label: "Scheduled" },
  { key: "ended", label: "Ended" },
];

const statusPill = (status: EventRoom["status"]) => {
  const meta = STATUS_META[status];
  return (
    <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold ${meta.bg} ${meta.text}`}>
      <span className="h-1.5 w-1.5 rounded-full bg-current opacity-70" />
      {meta.label}
    </span>
  );
};

const RoomCard = ({ room }: { room: EventRoom }) => {
  const { toast } = useToast();
  const { user } = useAuth();

  return (
    <Card className="card-static rounded-2xl border-l-[3px] transition-all duration-150 ease-out hover:shadow-md hover:-translate-y-0.5"
      style={{ borderLeftColor: room.status === "live" ? "var(--color-status-live)" : room.status === "scheduled" ? "var(--color-status-scheduled)" : room.status === "ended" ? "var(--color-status-ended)" : "var(--color-status-cancelled)" }}
    >
      <CardContent className="p-4">
        <div className="flex items-start justify-between gap-3 mb-2">
          {statusPill(room.status)}
          <span className="text-[11px] text-gray-400 font-medium">
            {formatDistanceToNow(new Date(room.createdAt), { addSuffix: true })}
          </span>
        </div>

        <h4 className="text-sm font-semibold leading-tight text-(--color-gray-900) mb-1 font-display">{room.title}</h4>
        {room.description && (
          <p className="text-xs text-gray-400 line-clamp-2 mb-2">{room.description}</p>
        )}

        <div className="flex flex-wrap items-center gap-3 text-[11px] text-gray-500 mb-2">
          <span className="flex items-center gap-1 font-medium">
            <Clock className="w-3.5 h-3.5 text-gray-400" />
            {format(new Date(room.scheduledStart), "MMM d, h:mm a")}
          </span>
          {room.location && (
            <span className="flex items-center gap-1 text-purple-700 bg-purple-50 px-2 py-0.5 rounded-md border border-purple-100 font-medium">
              <MapPin className="w-3 h-3 text-purple-600 shrink-0" />
              <span className="truncate max-w-44">{room.location}</span>
            </span>
          )}
          {room.maxParticipants && (
            <span className="flex items-center gap-1 font-medium">
              <Users className="w-3.5 h-3.5 text-gray-400" />
              Max {room.maxParticipants}
            </span>
          )}
          {room.attendanceCount != null && room.attendanceCount > 0 && (
            <span className="flex items-center gap-1 font-medium text-emerald-700">
              <ClipboardList className="w-3.5 h-3.5" />
              {room.attendanceCount} records
            </span>
          )}
        </div>

        <div className="flex flex-wrap gap-1.5 pt-2 border-t border-(--color-gray-100)">
          {room.status === "live" && hasRolePermission(user?.role ?? "volunteer", "view_live_session") && (
            <Link to={`/rooms/${room.id}/live`} className="inline-flex items-center gap-1 rounded-lg px-2.5 h-7 text-[11px] font-semibold bg-emerald-500 text-white hover:bg-emerald-600 transition-colors">
              <Radio className="w-3 h-3" /> Live
            </Link>
          )}
          {hasRolePermission(user?.role ?? "volunteer", "take_attendance") && (
            <Link to={`/rooms/${room.id}/attendance`} className="inline-flex items-center gap-1 rounded-lg px-2.5 h-7 text-[11px] font-semibold bg-(--color-primary) text-white hover:brightness-110 transition-colors">
              <ClipboardList className="w-3 h-3" /> Attendance
            </Link>
          )}
          {hasRolePermission(user?.role ?? "volunteer", "share_live_link") && (
            <Button variant="outline" size="sm" className="h-7 px-2.5 gap-1 text-[11px] font-medium"
              onClick={() => {
                navigator.clipboard.writeText(room.shareUrl).then(
                  () => toast("Link copied!", "success"),
                  () => toast("Copy failed.", "error")
                );
              }}>
              <Copy className="w-3 h-3" /> Copy Link
            </Button>
          )}
          <Link to={`/rooms/${room.id}/form-builder`} className="inline-flex items-center gap-1 rounded-lg px-2.5 h-7 text-[11px] font-medium border border-(--color-gray-200) text-(--color-gray-600) hover:bg-(--color-gray-50) transition-colors">
            <FileText className="w-3 h-3" /> Form
          </Link>
          <Link to={`/rooms/${room.id}/attendance/records`} className="inline-flex items-center gap-1 rounded-lg px-2.5 h-7 text-[11px] font-medium border border-(--color-gray-200) text-(--color-gray-600) hover:bg-(--color-gray-50) transition-colors">
            <MapPin className="w-3 h-3" /> Records
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
    roomsApi.list()
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
      result = result.filter((r) => r.title.toLowerCase().includes(q) || r.description?.toLowerCase().includes(q));
    }
    const order: Record<EventRoom["status"], number> = { live: 0, scheduled: 1, ended: 2, cancelled: 3 };
    return result.sort((a, b) => order[a.status] - order[b.status] || new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
  }, [rooms, activeFilter, search]);

  const counts = useMemo(() => ({
    all: rooms.length,
    live: rooms.filter((r) => r.status === "live").length,
    scheduled: rooms.filter((r) => r.status === "scheduled").length,
    ended: rooms.filter((r) => r.status === "ended").length,
    cancelled: rooms.filter((r) => r.status === "cancelled").length,
  }), [rooms]);

  if (loading) {
    return (
      <div className="space-y-6">
        <div className="flex items-center justify-between gap-4">
          <div className="space-y-2"><div className="h-8 w-32 bg-(--color-gray-100) rounded-lg animate-pulse" /></div>
          <div className="h-9 w-32 bg-(--color-gray-100) rounded-xl animate-pulse" />
        </div>
        <div className="flex gap-2">{Array.from({ length: 4 }).map((_, i) => <div key={i} className="h-8 w-20 bg-(--color-gray-100) rounded-lg animate-pulse" />)}</div>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {Array.from({ length: 6 }).map((_, i) => <Card key={i} className="h-48 bg-(--color-gray-50) animate-pulse" />)}
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <Card className="border border-(--color-gray-200)">
        <CardContent className="p-8 text-center">
          <XCircle className="w-10 h-10 text-(--color-error) mx-auto mb-3" />
          <p className="text-sm text-(--color-gray-600) mb-4">{error}</p>
          <Button variant="outline" onClick={() => window.location.reload()}>Try Again</Button>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-5">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-xl font-bold tracking-tight font-display text-(--color-gray-900)">Rooms</h2>
          <p className="text-xs text-gray-400 mt-0.5">{rooms.length} total rooms</p>
        </div>
        {canManageRooms && (
          <Link to="/rooms/create">
            <Button size="sm">
              <PlusCircle className="w-4 h-4 mr-1" /> Create Room
            </Button>
          </Link>
        )}
      </div>

      <div className="flex items-center gap-3 flex-wrap">
        <div className="flex bg-(--color-gray-100) rounded-xl p-1 gap-0.5">
          {FILTER_TABS.map((tab) => (
            <button
              key={tab.key}
              onClick={() => setActiveFilter(tab.key)}
              className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all duration-150 cursor-pointer ${
                activeFilter === tab.key
                  ? "bg-white text-(--color-gray-900) shadow-sm"
                  : "text-(--color-gray-500) hover:text-gray-700"
              }`}
            >
              {tab.label}
              <span className={`ml-1.5 text-[10px] ${activeFilter === tab.key ? "text-(--color-primary)" : "text-gray-400"}`}>
                {counts[tab.key]}
              </span>
            </button>
          ))}
        </div>
        <div className="relative flex-1 max-w-xs">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search rooms..."
            className="input-premium pl-9 h-9 text-xs"
          />
        </div>
      </div>

      {filteredRooms.length === 0 ? (
        <Card className="border border-dashed border-(--color-gray-200)">
          <CardContent className="py-16 flex flex-col items-center text-center">
            <CalendarClock className="w-12 h-12 text-gray-300 b-3" />
            <CardTitle className="text-sm mb-1">
              {search ? "No rooms match your search" : activeFilter === "all" ? "No rooms yet" : `No ${activeFilter} rooms`}
            </CardTitle>
            <CardDescription className="text-xs max-w-sm">
              {search ? "Try adjusting your search term." : canManageRooms ? "Create your first event room to get started." : "No rooms have been assigned to you yet."}
            </CardDescription>
            {!search && canManageRooms && (
              <Link to="/rooms/create" className="mt-4">
                <Button size="sm"><PlusCircle className="w-4 h-4 mr-1" /> Create Room</Button>
              </Link>
            )}
          </CardContent>
        </Card>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {filteredRooms.map((room) => (
            <RoomCard key={room.id} room={room} />
          ))}
        </div>
      )}
    </div>
  );
};
