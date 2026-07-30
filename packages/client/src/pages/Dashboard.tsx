import { useCallback, useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { format, formatDistanceToNow, startOfMonth, endOfMonth, eachDayOfInterval, isToday } from "date-fns";
import {
  Copy,
  Users,
  Clock,
  CalendarClock,
  ClipboardList,
  Radio,
  ShieldCheck,
  Activity,
  FileCheck,
  MapPin,
  Calendar as CalendarIcon,
  ChevronLeft,
  ChevronRight,
  PlusCircle,
  Search,
  Sparkles,
  ArrowRight,
  FileInput,
  FileText,
  Building2,
  CheckCircle2,
} from "lucide-react";
import { ROLE_LABELS, hasRolePermission, type EventRoom, type EventAdminAssignment, type OrgUserSummary } from "@application/shared";
import { roomsApi, eventAssignmentsApi, ApiClientError } from "@/lib/api";
import { useAuth } from "@/hooks/useAuth";
import { useToast } from "@/hooks/useToast";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardTitle, CardDescription } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";

const statusPill = (status: EventRoom["status"]) => {
  const styles: Record<EventRoom["status"], { bg: string; text: string; dot: string }> = {
    live: { bg: "bg-emerald-50 border-emerald-200", text: "text-emerald-700", dot: "bg-emerald-500 animate-pulse" },
    scheduled: { bg: "bg-purple-50 border-purple-200", text: "text-purple-700", dot: "bg-purple-600" },
    ended: { bg: "bg-gray-100 border-gray-200", text: "text-gray-600", dot: "bg-gray-400" },
    cancelled: { bg: "bg-red-50 border-red-200", text: "text-red-600", dot: "bg-red-500" },
  };
  const s = styles[status];
  return (
    <span className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold border ${s.bg} ${s.text}`}>
      <span className={`h-2 w-2 rounded-full ${s.dot}`} />
      {status.charAt(0).toUpperCase() + status.slice(1)}
    </span>
  );
};

const MetricCard = ({
  title,
  value,
  sub,
  icon: Icon,
  variant = "default",
}: {
  title: string;
  value: string | number;
  sub?: string;
  icon: React.ComponentType<{ className?: string }>;
  variant?: "default" | "primary" | "emerald" | "blue";
}) => {
  if (variant === "primary") {
    return (
      <Card className="card-static bg-brand-gradient-tile text-white rounded-2xl shadow-md border-0 hover:shadow-lg transition-all">
        <CardContent className="p-5">
          <div className="flex items-start justify-between gap-4">
            <div className="space-y-1">
              <p className="text-[11px] font-bold uppercase tracking-wider text-purple-200/90">{title}</p>
              <p className="text-3xl font-extrabold tracking-tight font-display tabular-nums text-white">{value}</p>
              {sub && <p className="text-xs text-purple-200/80 font-medium">{sub}</p>}
            </div>
            <div className="rounded-xl p-2.5 bg-white/15 backdrop-blur-md text-white border border-white/20">
              <Icon className="h-5 w-5" />
            </div>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="card-static rounded-2xl hover:border-purple-200 hover:shadow-sm transition-all">
      <CardContent className="p-5">
        <div className="flex items-start justify-between gap-4">
          <div className="space-y-1">
            <p className="text-[11px] font-bold uppercase tracking-wider text-gray-400">{title}</p>
            <p className="text-3xl font-extrabold tracking-tight font-display tabular-nums text-gray-900">{value}</p>
            {sub && <p className="text-xs text-gray-500 font-medium">{sub}</p>}
          </div>
          <div className="rounded-xl p-2.5 bg-purple-50 text-purple-700 border border-purple-100">
            <Icon className="h-5 w-5" />
          </div>
        </div>
      </CardContent>
    </Card>
  );
};

const MiniCalendar = ({ rooms }: { rooms: EventRoom[] }) => {
  const [monthOffset, setMonthOffset] = useState(0);
  const today = new Date();
  
  const currentMonthDate = useMemo(() => {
    const d = new Date(today.getFullYear(), today.getMonth() + monthOffset, 1);
    return d;
  }, [today, monthOffset]);

  const firstDay = useMemo(() => startOfMonth(currentMonthDate), [currentMonthDate]);
  const lastDay = useMemo(() => endOfMonth(currentMonthDate), [currentMonthDate]);
  const days = useMemo(() => eachDayOfInterval({ start: firstDay, end: lastDay }), [firstDay, lastDay]);

  const eventDays = useMemo(() => {
    const map = new Map<string, EventRoom[]>();
    rooms.forEach((r) => {
      const d = format(new Date(r.scheduledStart), "yyyy-MM-dd");
      if (!map.has(d)) map.set(d, []);
      map.get(d)!.push(r);
    });
    return map;
  }, [rooms]);

  const startWeekDay = firstDay.getDay();

  return (
    <Card className="card-static rounded-2xl overflow-hidden">
      <CardContent className="p-4 space-y-3">
        <div className="flex items-center justify-between">
          <h4 className="text-xs font-bold uppercase tracking-wider text-gray-900 font-display flex items-center gap-1.5">
            <CalendarIcon className="w-4 h-4 text-purple-600" />
            {format(currentMonthDate, "MMMM yyyy")}
          </h4>
          <div className="flex items-center gap-1">
            <Button
              variant="ghost"
              size="icon"
              className="h-7 w-7 rounded-lg text-gray-500 hover:bg-gray-100"
              onClick={() => setMonthOffset((prev) => prev - 1)}
            >
              <ChevronLeft className="h-4 w-4" />
            </Button>
            <Button
              variant="ghost"
              size="icon"
              className="h-7 w-7 rounded-lg text-gray-500 hover:bg-gray-100"
              onClick={() => setMonthOffset((prev) => prev + 1)}
            >
              <ChevronRight className="h-4 w-4" />
            </Button>
          </div>
        </div>

        <div className="grid grid-cols-7 gap-1 text-center text-[10px] font-bold text-gray-400">
          {["S", "M", "T", "W", "T", "F", "S"].map((d, i) => (
            <div key={i} className="py-0.5">{d}</div>
          ))}
        </div>

        <div className="grid grid-cols-7 gap-1">
          {Array.from({ length: startWeekDay }).map((_, i) => (
            <div key={`empty-${i}`} />
          ))}
          {days.map((day) => {
            const key = format(day, "yyyy-MM-dd");
            const events = eventDays.get(key) || [];
            const hasEvent = events.length > 0;
            const isTodayDate = isToday(day);
            return (
              <div
                key={key}
                className={`aspect-square flex flex-col items-center justify-center rounded-xl text-xs font-semibold transition-all ${
                  isTodayDate
                    ? "bg-purple-600 text-white shadow-xs"
                    : hasEvent
                    ? "bg-purple-50 text-purple-900 border border-purple-200"
                    : "text-gray-700 hover:bg-gray-100"
                }`}
                title={hasEvent ? `${events.length} event(s)` : undefined}
              >
                <span>{format(day, "d")}</span>
                {hasEvent && (
                  <span className="flex gap-0.5 mt-0.5">
                    {events.slice(0, 2).map((_, idx) => (
                      <span
                        key={idx}
                        className={`h-1 w-1 rounded-full ${isTodayDate ? "bg-white" : "bg-purple-600"}`}
                      />
                    ))}
                  </span>
                )}
              </div>
            );
          })}
        </div>
      </CardContent>
    </Card>
  );
};

const MapCard = ({ rooms }: { rooms: EventRoom[] }) => {
  const roomsWithLocation = rooms.filter((r) => r.location).slice(0, 3);

  return (
    <Card className="card-static rounded-2xl overflow-hidden">
      <CardContent className="p-4 space-y-3">
        <h4 className="text-xs font-bold uppercase tracking-wider text-gray-900 font-display flex items-center gap-1.5">
          <MapPin className="w-4 h-4 text-purple-600" />
          Event Locations & Geotags
        </h4>

        <div className="space-y-2">
          {roomsWithLocation.length === 0 ? (
            <div className="p-6 text-center bg-gray-50 rounded-xl border border-dashed border-gray-200 text-gray-400 space-y-1">
              <MapPin className="w-6 h-6 text-gray-300 mx-auto" />
              <p className="text-xs font-medium">No geotagged event locations yet</p>
            </div>
          ) : (
            roomsWithLocation.map((room) => (
              <div key={room.id} className="p-3 rounded-xl border border-gray-200 bg-white hover:border-purple-200 transition-all flex items-start gap-2.5">
                <div className="w-7 h-7 rounded-lg bg-purple-50 text-purple-700 flex items-center justify-center shrink-0 mt-0.5">
                  <MapPin className="w-4 h-4" />
                </div>
                <div className="flex-1 overflow-hidden">
                  <p className="text-xs font-bold text-gray-900 truncate font-display">{room.title}</p>
                  <p className="text-[11px] text-purple-700 font-medium truncate">{room.location}</p>
                  {room.latitude && room.longitude && (
                    <a
                      href={`https://www.openstreetmap.org/?mlat=${room.latitude}&mlon=${room.longitude}#map=15/${room.latitude}/${room.longitude}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-[10px] text-gray-400 hover:text-purple-600 hover:underline font-mono mt-0.5 inline-block"
                    >
                      Lat: {room.latitude.toFixed(4)}, Long: {room.longitude.toFixed(4)} ↗
                    </a>
                  )}
                </div>
              </div>
            ))
          )}
        </div>
      </CardContent>
    </Card>
  );
};

export const Dashboard = () => {
  const { user } = useAuth();
  const [rooms, setRooms] = useState<EventRoom[]>([]);
  const [assignments, setAssignments] = useState<EventAdminAssignment[]>([]);
  const [allUsers, setAllUsers] = useState<OrgUserSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<"all" | "live" | "scheduled" | "ended">("all");
  const { toast } = useToast();

  const canManageRooms = user ? hasRolePermission(user.role, "manage_rooms") : false;

  useEffect(() => {
    if (user && !user.organizationId) {
      setLoading(false);
      setError(null);
      return;
    }

    const fetchData = async () => {
      try {
        const [roomsRes, assignmentsRes, usersRes] = await Promise.all([
          roomsApi.list(),
          eventAssignmentsApi.listAssignments(),
          eventAssignmentsApi.listUsers(),
        ]);
        setRooms(roomsRes.items);
        setAssignments(assignmentsRes.items);
        setAllUsers(usersRes.items);
      } catch (err) {
        setError(err instanceof ApiClientError ? err.message : "Failed to load dashboard data");
      } finally {
        setLoading(false);
      }
    };
    void fetchData();
  }, [user]);

  const verifiedAttendees = useMemo(() => rooms.reduce((sum, r) => sum + (r.attendanceCount ?? 0), 0), [rooms]);
  const liveRoomsCount = useMemo(() => rooms.filter((r) => r.status === "live").length, [rooms]);
  const scheduledRoomsCount = useMemo(() => rooms.filter((r) => r.status === "scheduled").length, [rooms]);

  const assignedRoomIds = useMemo(() => new Set(assignments.map((a) => a.roomId)), [assignments]);
  const visibleRooms = useMemo(
    () => (canManageRooms ? rooms : rooms.filter((r) => assignedRoomIds.has(r.id))),
    [rooms, canManageRooms, assignedRoomIds]
  );

  const filteredRooms = useMemo(() => {
    return visibleRooms.filter((r) => {
      if (search && !r.title.toLowerCase().includes(search.toLowerCase()) && !(r.location && r.location.toLowerCase().includes(search.toLowerCase()))) return false;
      if (statusFilter !== "all" && r.status !== statusFilter) return false;
      return true;
    });
  }, [visibleRooms, search, statusFilter]);

  const memberRows = useMemo(() => {
    const rows = allUsers
      .filter((u) => u.role !== "ngo_admin")
      .map((u) => {
        const userAssignments = assignments.filter((a) => a.userId === u.id);
        const roomNames = userAssignments.map((a) => {
          const room = rooms.find((r) => r.id === a.roomId);
          return room?.title ?? "—";
        });
        return { ...u, assignedEvents: roomNames.join(", ") || "—" };
      });
    return rows.slice(0, 6);
  }, [allUsers, assignments, rooms]);

  if (loading) {
    return (
      <div className="space-y-6">
        <Skeleton className="h-36 w-full rounded-3xl" />
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-28 rounded-2xl" />
          ))}
        </div>
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <Skeleton className="lg:col-span-2 h-96 rounded-2xl" />
          <Skeleton className="h-96 rounded-2xl" />
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <Card className="border border-red-200 bg-red-50/50">
        <CardContent className="p-8 text-center space-y-4">
          <p className="text-red-600 font-semibold text-sm">{error}</p>
          <Button onClick={() => window.location.reload()} variant="outline" className="rounded-xl border-red-200 text-red-700">
            Try Again
          </Button>
        </CardContent>
      </Card>
    );
  }

  if (user && !user.organizationId) {
    return (
      <Card className="mx-auto max-w-2xl rounded-3xl border border-gray-200 bg-white shadow-lg p-8 text-center space-y-4">
        <div className="mx-auto w-14 h-14 rounded-full bg-purple-100 text-purple-800 flex items-center justify-center">
          <ShieldCheck className="w-7 h-7" />
        </div>
        <CardTitle className="font-display text-xl text-gray-900">{ROLE_LABELS[user.role]} Account Active</CardTitle>
        <CardDescription className="text-xs text-gray-500 max-w-md mx-auto">
          Your account is ready. Complete onboarding or contact your Organization Admin to assign you to an organization.
        </CardDescription>
        <Link to="/onboarding" className="inline-flex items-center gap-1.5 px-4 h-10 rounded-xl bg-brand-gradient text-white text-xs font-semibold">
          Complete Onboarding
        </Link>
      </Card>
    );
  }

  return (
    <div className="space-y-8 animate-in fade-in">
      {/* 1. Hero Greeting Banner */}
      <div className="relative overflow-hidden rounded-3xl bg-brand-gradient-tile p-6 md:p-8 text-white shadow-lg flex flex-col md:flex-row md:items-center justify-between gap-6">
        <div className="space-y-2 z-10">
          <div className="flex flex-wrap items-center gap-2">
            <span className="px-3 py-1 rounded-full bg-white/15 backdrop-blur-md text-white text-xs font-semibold border border-white/20">
              {user ? ROLE_LABELS[user.role] : "Member"}
            </span>
            <span className="px-3 py-1 rounded-full bg-white/15 backdrop-blur-md text-white text-xs font-semibold border border-white/20 flex items-center gap-1">
              <Building2 className="w-3.5 h-3.5 text-purple-300" />
              {user?.organizationName || "Eventclick"}
            </span>
          </div>
          <h1 className="text-2xl md:text-3xl font-bold font-display tracking-tight text-white">
            Welcome back, {user?.fullName?.split(" ")[0] || "Admin"}! 👋
          </h1>
          <p className="text-xs text-white/80 max-w-xl leading-relaxed">
            Real-time overview of active live sessions, geotagged event locations, attendance check-ins, and verified reports.
          </p>
        </div>

        <div className="flex items-center gap-3 z-10 shrink-0">
          {canManageRooms && (
            <Link
              to="/rooms/create"
              className="inline-flex items-center gap-2 px-5 h-11 rounded-xl bg-white text-purple-950 font-bold text-xs shadow-md hover:bg-purple-50 transition-all hover:scale-105"
            >
              <PlusCircle className="w-4 h-4 text-purple-700" />
              Create Room
            </Link>
          )}
        </div>
      </div>

      {/* 2. Key Metrics Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <MetricCard title="Total Event Rooms" value={rooms.length} sub={`${liveRoomsCount} live, ${scheduledRoomsCount} scheduled`} icon={Activity} variant="primary" />
        <MetricCard title="Verified Members" value={verifiedAttendees} sub="Across all event rooms" icon={Users} />
        <MetricCard title="Available Reports" value={rooms.filter((r) => r.status === "ended").length} sub="PDF reports ready to export" icon={FileCheck} />
        <MetricCard title="Total Attendees" value={verifiedAttendees} sub="Verified GPS check-ins" icon={ClipboardList} />
      </div>

      {/* 3. Main Workspace Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left 2 Cols: Rooms Workspace & Team Table */}
        <div className="lg:col-span-2 space-y-6">
          {/* Rooms Control Bar */}
          <div className="space-y-4">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div>
                <h3 className="text-base font-bold font-display text-gray-900">Live & Upcoming Sessions</h3>
                <p className="text-xs text-gray-400">Manage live broadcasts, attendance check-ins, and share links</p>
              </div>

              {/* Status Filter Pills */}
              <div className="flex flex-wrap gap-1.5">
                <Button
                  variant={statusFilter === "all" ? "primary" : "outline"}
                  size="sm"
                  onClick={() => setStatusFilter("all")}
                  className="rounded-xl text-xs h-8"
                >
                  All
                </Button>
                <Button
                  variant={statusFilter === "live" ? "primary" : "outline"}
                  size="sm"
                  onClick={() => setStatusFilter("live")}
                  className="rounded-xl text-xs h-8"
                >
                  🔴 Live ({liveRoomsCount})
                </Button>
                <Button
                  variant={statusFilter === "scheduled" ? "primary" : "outline"}
                  size="sm"
                  onClick={() => setStatusFilter("scheduled")}
                  className="rounded-xl text-xs h-8"
                >
                  📅 Scheduled ({scheduledRoomsCount})
                </Button>
              </div>
            </div>

            {/* Search Input */}
            <div className="relative">
              <Search className="w-4 h-4 text-gray-400 absolute left-3 top-1/2 -translate-y-1/2" />
              <Input
                type="text"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search rooms by title or location..."
                className="pl-9 h-10 border-gray-200 bg-white input-premium text-xs rounded-xl"
              />
            </div>

            {/* Room Cards Grid */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {filteredRooms.length === 0 ? (
                <Card className="col-span-full border border-dashed border-gray-200 bg-white rounded-2xl">
                  <CardContent className="p-8 text-center text-gray-400 space-y-3">
                    <CalendarClock className="w-10 h-10 text-gray-300 mx-auto" />
                    <p className="text-sm font-semibold text-gray-600">No rooms found</p>
                    {canManageRooms && (
                      <Link to="/rooms/create" className="inline-flex items-center gap-1.5 px-4 h-9 rounded-xl bg-brand-gradient text-white text-xs font-semibold">
                        <PlusCircle className="w-4 h-4" /> Create Room
                      </Link>
                    )}
                  </CardContent>
                </Card>
              ) : (
                filteredRooms.map((room) => (
                  <Card key={room.id} className="card-static rounded-2xl hover:shadow-md transition-all space-y-3">
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
                          <p className="text-xs text-gray-500 line-clamp-2">{room.description}</p>
                        )}
                      </div>

                      {room.location && (
                        <div className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-semibold bg-purple-50 text-purple-700 border border-purple-100">
                          <MapPin className="w-3.5 h-3.5 text-purple-600 shrink-0" />
                          <span className="truncate">{room.location}</span>
                        </div>
                      )}

                      <div className="pt-2 border-t border-gray-100 flex flex-wrap gap-2">
                        {hasRolePermission(user?.role ?? "volunteer", "take_attendance") && (
                          <Link
                            to={`/rooms/${room.id}/attendance`}
                            className="inline-flex items-center gap-1.5 rounded-xl bg-brand-gradient py-2 px-3 text-xs font-bold text-white shadow-xs hover:shadow-md transition-all"
                          >
                            <ClipboardList className="w-3.5 h-3.5" />
                            <span>{hasRolePermission(user?.role ?? "volunteer", "create_attendance_form") ? "Take Attendance" : "Record Attendance"}</span>
                          </Link>
                        )}

                        {hasRolePermission(user?.role ?? "volunteer", "view_live_session") && (
                          <Link
                            to={`/rooms/${room.id}/live`}
                            className="inline-flex items-center gap-1.5 rounded-xl border border-purple-200 bg-purple-50 px-3 h-8 text-xs font-semibold text-purple-700 hover:bg-purple-100 transition-colors"
                          >
                            <Radio className="w-3.5 h-3.5 text-purple-600" />
                            Live Broadcast
                          </Link>
                        )}

                        {hasRolePermission(user?.role ?? "volunteer", "share_live_link") && (
                          <Button
                            variant="outline"
                            size="sm"
                            className="h-8 px-2.5 gap-1 rounded-xl text-xs font-medium border-gray-200 text-gray-600"
                            onClick={() => {
                              navigator.clipboard.writeText(room.shareUrl).then(
                                () => toast("Room share link copied!", "success"),
                                () => toast("Failed to copy link.", "error")
                              );
                            }}
                          >
                            <Copy className="w-3.5 h-3.5" />
                            Copy Link
                          </Button>
                        )}
                      </div>

                      <div className="flex items-center justify-between text-xs text-gray-400 font-medium pt-1">
                        <div className="flex items-center gap-1">
                          <Clock className="w-3.5 h-3.5" />
                          <span>{format(new Date(room.scheduledStart), "MMM d, h:mm a")}</span>
                        </div>
                        {room.maxParticipants && (
                          <span className="bg-gray-100 px-2 py-0.5 rounded-md text-[10px] font-semibold text-gray-600">
                            Max {room.maxParticipants} Capacity
                          </span>
                        )}
                      </div>
                    </CardContent>
                  </Card>
                ))
              )}
            </div>
          </div>

          {/* Team Members Overview */}
          <div className="space-y-3">
            <h3 className="text-base font-bold font-display text-gray-900">Active Team Members</h3>
            <Card className="card-static rounded-2xl overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full text-sm text-left">
                  <thead className="bg-gray-50 text-gray-400 text-[11px] font-semibold uppercase tracking-wider">
                    <tr>
                      <th className="px-4 py-3">Member</th>
                      <th className="px-4 py-3">Assigned Event Room</th>
                      <th className="px-4 py-3">Role</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {memberRows.map((m) => (
                      <tr key={m.id} className="hover:bg-gray-50 transition-colors">
                        <td className="px-4 py-3">
                          <div className="flex items-center gap-3">
                            <div className="h-8 w-8 rounded-full bg-purple-100 text-purple-800 flex items-center justify-center text-xs font-bold uppercase shrink-0">
                              {m.fullName.charAt(0)}
                            </div>
                            <span className="font-semibold text-gray-900 font-display">{m.fullName}</span>
                          </div>
                        </td>
                        <td className="px-4 py-3 text-xs text-gray-600 font-medium">{m.assignedEvents}</td>
                        <td className="px-4 py-3">
                          <span className="inline-flex items-center rounded-full bg-purple-50 text-purple-700 border border-purple-100 px-2.5 py-0.5 text-[11px] font-semibold">
                            {ROLE_LABELS[m.role]}
                          </span>
                        </td>
                      </tr>
                    ))}
                    {memberRows.length === 0 && (
                      <tr>
                        <td colSpan={3} className="px-4 py-8 text-center text-gray-400 text-xs">No team members assigned yet</td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </Card>
          </div>
        </div>

        {/* Right 1 Col: Calendar, Maps, Quick Actions */}
        <div className="space-y-6">
          <MiniCalendar rooms={rooms} />
          <MapCard rooms={rooms} />

          {/* Quick SaaS Shortcut Banner */}
          <Card className="card-static rounded-2xl bg-purple-50/60 border-purple-100 p-5 space-y-3">
            <h4 className="text-xs font-bold uppercase tracking-wider text-purple-900 font-display flex items-center gap-1.5">
              <Sparkles className="w-4 h-4 text-purple-600" />
              Quick Utilities
            </h4>
            <div className="space-y-2 text-xs font-semibold">
              <Link to="/forms" className="p-2.5 rounded-xl bg-white border border-purple-100 text-purple-900 hover:border-purple-300 transition-all flex items-center justify-between">
                <span className="flex items-center gap-2">
                  <FileInput className="w-4 h-4 text-purple-600" /> Attendance Forms
                </span>
                <ArrowRight className="w-3.5 h-3.5 text-purple-400" />
              </Link>
              <Link to="/reports" className="p-2.5 rounded-xl bg-white border border-purple-100 text-purple-900 hover:border-purple-300 transition-all flex items-center justify-between">
                <span className="flex items-center gap-2">
                  <FileText className="w-4 h-4 text-purple-600" /> Download PDF Reports
                </span>
                <ArrowRight className="w-3.5 h-3.5 text-purple-400" />
              </Link>
            </div>
          </Card>
        </div>
      </div>
    </div>
  );
};
