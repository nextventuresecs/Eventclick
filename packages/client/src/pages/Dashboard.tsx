import { useCallback, useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { format, formatDistanceToNow, addDays, isSameDay, startOfMonth, endOfMonth, eachDayOfInterval, isToday } from "date-fns";
import {
  Copy,
  Users,
  Clock,
  CalendarClock,
  FormInput,
  ClipboardList,
  Radio,
  ShieldCheck,
  Activity,
  FileCheck,
  MapPin,
  Calendar,
  ChevronLeft,
  ChevronRight,
} from "lucide-react";
import { ROLE_LABELS, hasRolePermission, type EventRoom, type EventAdminAssignment, type OrgUserSummary } from "@application/shared";
import { roomsApi, eventAssignmentsApi, ApiClientError } from "@/lib/api";
import { useAuth } from "@/hooks/useAuth";
import { useToast } from "@/hooks/useToast";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardTitle, CardDescription } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";

const pill = (status: EventRoom["status"]) => {
  const styles: Record<EventRoom["status"], { bg: string; text: string; border?: string }> = {
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
  variant?: "default" | "primary";
}) => {
  const isPrimary = variant === "primary";
  return (
    <Card className={`card-static ${isPrimary ? "bg-brand-gradient-tile text-white" : ""}`}>
      <CardContent className="p-5">
        <div className="flex items-start justify-between gap-4">
          <div className="space-y-1">
            <p className={`text-xs font-semibold uppercase tracking-wide ${isPrimary ? "text-white/70" : "text-[var(--color-gray-400)]"}`}>{title}</p>
            <p className={`text-2xl font-bold tracking-tight font-display tabular-nums ${isPrimary ? "text-white" : "text-[var(--color-gray-900)]"}`}>{value}</p>
            {sub && <p className={`text-xs ${isPrimary ? "text-white/70" : "text-[var(--color-gray-400)]"}`}>{sub}</p>}
          </div>
          <div className={`rounded-lg p-2 ${isPrimary ? "bg-white/10 text-white" : "bg-[var(--color-gray-100)] text-[var(--color-primary)]"}`}>
            <Icon className="h-5 w-5" />
          </div>
        </div>
      </CardContent>
    </Card>
  );
};

const MiniCalendar = ({ rooms }: { rooms: EventRoom[] }) => {
  const today = new Date();
  const firstDay = useMemo(() => startOfMonth(today), [today]);
  const lastDay = useMemo(() => endOfMonth(today), [today]);
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
      <CardContent className="p-3">
        <div className="flex items-center justify-between mb-2">
          <h4 className="text-xs font-semibold font-display text-[var(--color-gray-900)]">{format(today, "MMM yyyy")}</h4>
          <div className="flex gap-0.5">
            <Button variant="ghost" size="icon" className="h-6 w-6 text-[var(--color-gray-400)]">
              <ChevronLeft className="h-3.5 w-3.5" />
            </Button>
            <Button variant="ghost" size="icon" className="h-6 w-6 text-[var(--color-gray-400)]">
              <ChevronRight className="h-3.5 w-3.5" />
            </Button>
          </div>
        </div>
        <div className="grid grid-cols-7 gap-0.5 text-center text-[10px] font-medium text-[var(--color-gray-400)] mb-0.5">
          {["S", "M", "T", "W", "T", "F", "S"].map((d, i) => (
            <div key={i} className="py-0.5">{d}</div>
          ))}
        </div>
        <div className="grid grid-cols-7 gap-0.5">
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
                className={`aspect-square flex flex-col items-center justify-center rounded-md text-[10px] font-medium ${
                  isTodayDate ? "bg-[var(--color-primary)] text-white" : "text-[var(--color-gray-700)]"
                }`}
              >
                <span>{format(day, "d")}</span>
                {hasEvent && (
                  <span className="flex gap-px mt-px">
                    {events.slice(0, 2).map((_, idx) => (
                      <span
                        key={idx}
                        className="h-0.5 w-0.5 rounded-full"
                        style={{ backgroundColor: isTodayDate ? "white" : "var(--color-secondary)" }}
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
  const activeRooms = rooms.filter((r) => r.status === "live" || r.status === "scheduled").slice(0, 4);
  return (
    <Card className="card-static rounded-2xl overflow-hidden">
      <CardContent className="p-3">
        <h4 className="text-xs font-semibold font-display text-[var(--color-gray-900)] mb-2">Event Locations</h4>
        <div className="h-[140px] bg-[var(--color-gray-100)] rounded-xl relative overflow-hidden">
          <div className="absolute inset-0 flex items-center justify-center">
            <div className="text-center space-y-1">
              <MapPin className="w-6 h-6 text-[var(--color-primary)] mx-auto" />
              <p className="text-[10px] font-medium text-[var(--color-gray-500)]">No venue data yet</p>
            </div>
          </div>
          {activeRooms.map((room, idx) => (
            <div
              key={room.id}
              className="absolute bg-[var(--color-surface)] border border-[var(--color-gray-200)] rounded-md shadow-sm p-1.5 w-28 text-[10px]"
              style={{
                top: `${20 + (idx % 2) * 40}%`,
                left: `${8 + (idx % 2) * 50}%`,
              }}
            >
              <p className="font-semibold text-[var(--color-gray-900)] truncate leading-tight">{room.title}</p>
              <p className="text-[var(--color-gray-400)] capitalize leading-tight">{room.status}</p>
            </div>
          ))}
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
  const { toast } = useToast();

  const canManageRooms = user ? hasRolePermission(user.role, "manage_rooms") : false;
  const canViewReports = user ? hasRolePermission(user.role, "view_reports") : false;

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
  const liveRooms = useMemo(() => rooms.filter((r) => r.status === "live").length, [rooms]);
  const scheduledRooms = useMemo(() => rooms.filter((r) => r.status === "scheduled").length, [rooms]);

  const assignedRoomIds = useMemo(() => new Set(assignments.map((a) => a.roomId)), [assignments]);
  const visibleRooms = useMemo(
    () => (canManageRooms ? rooms : rooms.filter((r) => assignedRoomIds.has(r.id))),
    [rooms, canManageRooms, assignedRoomIds]
  );

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
    return rows.slice(0, 8);
  }, [allUsers, assignments, rooms]);

  if (loading) {
    return (
      <div className="space-y-6">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="space-y-2">
            <Skeleton className="h-9 w-48" />
            <Skeleton className="h-4 w-64" />
          </div>
          <Skeleton className="h-10 w-36 shrink-0" />
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <Card key={i} className="p-5">
              <Skeleton className="h-4 w-24 mb-3" />
              <Skeleton className="h-8 w-16" />
            </Card>
          ))}
        </div>
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <Card className="lg:col-span-2 p-6">
            <Skeleton className="h-5 w-40 mb-4" />
            <Skeleton className="h-32 w-full" />
          </Card>
          <Card className="p-6">
            <Skeleton className="h-5 w-32 mb-4" />
            <Skeleton className="h-48 w-full" />
          </Card>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <Card className="border border-[var(--color-status-cancelled-bg)]">
        <CardContent className="p-6 text-center">
          <p className="text-[var(--color-status-cancelled)] mb-4">{error}</p>
          <Button onClick={() => window.location.reload()} variant="outline">Try Again</Button>
        </CardContent>
      </Card>
    );
  }

  if (user && !user.organizationId) {
    return (
      <Card className="mx-auto max-w-2xl border border-[var(--color-gray-200)] bg-[var(--color-gray-50)] shadow-sm">
        <CardContent className="space-y-3 p-8 text-center">
          <div className="mx-auto w-12 h-12 rounded-full bg-[rgba(64,34,145,0.1)] flex items-center justify-center text-[var(--color-primary)] mb-2">
            <ShieldCheck className="w-6 h-6" />
          </div>
          <CardTitle className="font-display">{ROLE_LABELS[user.role]} account created</CardTitle>
          <CardDescription>
            Your account is ready, but it still needs an organization assignment before event access becomes
            available.
          </CardDescription>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-5">
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <MetricCard title="Total Rooms" value={rooms.length} sub={`${liveRooms} live, ${scheduledRooms} scheduled`} icon={Activity} variant="primary" />
        <MetricCard title="Verified members" value={verifiedAttendees} sub="Across all rooms" icon={Users} />
        <MetricCard title="Available reports" value={rooms.filter((r) => r.status === "ended").length} sub="Ready to export" icon={FileCheck} />
        <MetricCard title="Total attendees" value={verifiedAttendees} sub="Verified attendance" icon={ClipboardList} />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 space-y-5">
          <div>
            <h3 className="text-sm font-semibold uppercase tracking-widest text-[var(--color-gray-400)] mb-3">Live & Upcoming</h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {visibleRooms.length === 0 ? (
                <Card className="col-span-full flex flex-col items-center justify-center py-16 text-center border border-dashed border-[var(--color-gray-200)]">
                  <CalendarClock className="w-12 h-12 text-[var(--color-gray-300)] mb-4" />
                  <CardTitle className="mb-2">{canManageRooms ? "No event rooms yet" : "No assigned event rooms yet"}</CardTitle>
                  <CardDescription className="mb-6 max-w-md">
                    {canManageRooms
                      ? "Get started by creating your first event room. You'll be able to invite attendees and host your session."
                      : "Once your admin assigns you to an event, it will appear here for live viewing and attendance collection."}
                  </CardDescription>
                  {canManageRooms && (
                    <Link to="/rooms/create" className="inline-flex items-center justify-center gap-2 rounded-xl px-4 h-10 text-sm font-semibold bg-brand-gradient text-white shadow-sm hover:shadow-md hover:brightness-110 active:scale-[0.98] transition-all">
                      Create your first room
                    </Link>
                  )}
                </Card>
              ) : (
                visibleRooms
                  .filter((r) => r.status === "live" || r.status === "scheduled")
                  .sort((a, b) => new Date(a.scheduledStart).getTime() - new Date(b.scheduledStart).getTime())
                  .map((room) => (
                    <Card key={room.id} className={`card-static rounded-2xl border-l-[3px] transition-all duration-150 ease-out hover:shadow-md hover:-translate-y-0.5 ${
                  room.status === "live" ? "border-l-[var(--color-status-live)]" :
                  room.status === "scheduled" ? "border-l-[var(--color-status-scheduled)]" :
                  room.status === "ended" ? "border-l-[var(--color-status-ended)]" :
                  "border-l-[var(--color-status-cancelled)]"
                }`}>
                      <CardContent className="p-4">
                        <div className="flex items-start justify-between gap-3 mb-2">
                          {pill(room.status)}
                          <span className="text-xs text-[var(--color-gray-400)] font-medium">
                            {formatDistanceToNow(new Date(room.createdAt), { addSuffix: true })}
                          </span>
                        </div>
                        <h4 className="text-base font-semibold leading-tight text-[var(--color-gray-900)] mb-1">{room.title}</h4>
                        {room.description && (
                          <p className="text-sm text-[var(--color-gray-400)] line-clamp-2 mt-1">{room.description}</p>
                        )}
                        <div className="mt-3 flex flex-wrap gap-2">
                          {hasRolePermission(user?.role ?? "volunteer", "take_attendance") && (
                            <Link
                              to={`/rooms/${room.id}/attendance`}
                              className="inline-flex items-center gap-1.5 rounded-lg bg-[var(--color-primary)] py-2 px-3 text-xs font-bold text-white hover:opacity-90 transition-all shadow-sm"
                            >
                              <ClipboardList className="w-3.5 h-3.5" />
                              <span>{hasRolePermission(user?.role ?? "volunteer", "create_attendance_form") ? "Take Attendance" : "Record Attendance"}</span>
                            </Link>
                          )}
                          {hasRolePermission(user?.role ?? "volunteer", "view_live_session") && (
                            <Link
                              to={`/rooms/${room.id}/live`}
                              className="inline-flex items-center gap-1 rounded-lg border border-[var(--color-gray-200)] px-3 h-8 text-xs font-medium hover:bg-[var(--color-gray-100)] transition-colors text-[var(--color-gray-600)]"
                            >
                              <Radio className="w-3.5 h-3.5" />
                              Live
                            </Link>
                          )}
                          {hasRolePermission(user?.role ?? "volunteer", "share_live_link") && (
                            <Button
                              variant="outline"
                              size="sm"
                              className="h-8 px-3 gap-1.5 text-xs font-medium border-[var(--color-gray-200)] text-[var(--color-gray-600)]"
                              onClick={() => {
                                navigator.clipboard.writeText(room.shareUrl).then(
                                  () => toast("Link copied to clipboard!", "success"),
                                  () => toast("Failed to copy link.", "error")
                                );
                              }}
                            >
                              <Copy className="w-3.5 h-3.5" />
                              Copy
                            </Button>
                          )}
                        </div>
                        <div className="mt-3 pt-2 flex items-center justify-between text-xs text-[var(--color-gray-400)] border-t border-[var(--color-gray-100)]">
                          <div className="flex items-center gap-1.5">
                            <Clock className="w-3.5 h-3.5" />
                            <span>{format(new Date(room.scheduledStart), 'MMM d, h:mm a')}</span>
                          </div>
                          {room.maxParticipants && (
                            <div className="flex items-center gap-1.5">
                              <Users className="w-3.5 h-3.5" />
                              <span>Max {room.maxParticipants}</span>
                            </div>
                          )}
                        </div>
                      </CardContent>
                    </Card>
                  ))
              )}
            </div>
          </div>

          <div>
            <h3 className="text-sm font-semibold uppercase tracking-widest text-[var(--color-gray-400)] mb-3">Members</h3>
            <Card className="card-static rounded-2xl overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full text-sm text-left table-base">
                  <thead className="bg-[var(--color-gray-50)] text-[var(--color-gray-400)] text-xs uppercase">
                    <tr>
                      <th className="px-4 py-3 font-semibold">Member</th>
                      <th className="px-4 py-3 font-semibold">Assigned Event</th>
                      <th className="px-4 py-3 font-semibold">Role</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[var(--color-gray-100)]">
                    {memberRows.map((m) => (
                      <tr key={m.id} className="hover:bg-[var(--color-gray-50)] transition-colors">
                        <td className="px-4 py-3">
                          <div className="flex items-center gap-3">
                            <div className="h-8 w-8 rounded-full bg-[rgba(64,34,145,0.1)] text-[var(--color-primary)] flex items-center justify-center text-xs font-bold uppercase">
                              {m.fullName.charAt(0)}
                            </div>
                            <span className="font-medium text-[var(--color-gray-900)]">{m.fullName}</span>
                          </div>
                        </td>
                        <td className="px-4 py-3 text-[var(--color-gray-500)]">{m.assignedEvents}</td>
                        <td className="px-4 py-3">
                          <span className="inline-flex items-center rounded-full bg-[var(--color-gray-100)] px-2.5 py-1 text-xs font-semibold text-[var(--color-gray-600)]">
                            {ROLE_LABELS[m.role]}
                          </span>
                        </td>
                      </tr>
                    ))}
                    {memberRows.length === 0 && (
                      <tr>
                        <td colSpan={3} className="px-4 py-8 text-center text-[var(--color-gray-400)]">No members found</td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </Card>
          </div>
        </div>

        <div className="space-y-4">
          <MiniCalendar rooms={rooms} />
          <MapCard rooms={rooms} />
        </div>
      </div>
    </div>
  );
};
