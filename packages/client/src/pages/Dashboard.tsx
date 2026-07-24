import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { format, formatDistanceToNow } from "date-fns";
import {
  Copy,
  Users,
  Clock,
  Plus,
  CalendarClock,
  FormInput,
  ClipboardList,
  Radio,
  ShieldCheck,
  Activity,
  FileCheck,
} from "lucide-react";
import { ROLE_LABELS, hasRolePermission, type EventRoom } from "@application/shared";
import { roomsApi, ApiClientError } from "@/lib/api";
import { useAuth } from "@/hooks/useAuth";
import { useToast } from "@/hooks/useToast";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardTitle, CardDescription } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";

const pill = (status: EventRoom["status"]) => {
  const styles: Record<EventRoom["status"], string> = {
    scheduled: "border border-brand/20 bg-brand/10 text-brand",
    live: "border border-accent/25 bg-accent/10 text-accent",
    ended: "border border-border bg-muted text-muted-foreground",
    cancelled: "border border-destructive/20 bg-destructive/10 text-destructive",
  };
  return (
    <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold ${styles[status]}`}>
      <span className={`h-1.5 w-1.5 rounded-full ${status === "live" ? "bg-accent" : "bg-current opacity-70"}`} />
      {status.charAt(0).toUpperCase() + status.slice(1)}
    </span>
  );
};

const MetricCard = ({
  title,
  value,
  sub,
  icon: Icon,
}: {
  title: string;
  value: string | number;
  sub?: string;
  icon: React.ComponentType<{ className?: string }>;
}) => (
  <Card className="border-border bg-card">
    <CardContent className="p-5">
      <div className="flex items-start justify-between gap-4">
        <div className="space-y-1">
          <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{title}</p>
          <p className="text-2xl font-bold tracking-tight text-card-foreground font-display">{value}</p>
          {sub && <p className="text-xs text-muted-foreground">{sub}</p>}
        </div>
        <div className="rounded-lg bg-muted p-2 text-brand">
          <Icon className="h-5 w-5" />
        </div>
      </div>
    </CardContent>
  </Card>
);

export const Dashboard = () => {
  const { user } = useAuth();
  const [rooms, setRooms] = useState<EventRoom[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const { toast } = useToast();

  const canManageRooms = user ? hasRolePermission(user.role, "manage_rooms") : false;
  const canCreateAttendanceForm = user
    ? hasRolePermission(user.role, "create_attendance_form")
    : false;
  const canViewReports = user ? hasRolePermission(user.role, "view_reports") : false;
  const canViewRecords = user
    ? hasRolePermission(user.role, "view_reports") || hasRolePermission(user.role, "take_attendance")
    : false;
  const canViewLiveSession = user ? hasRolePermission(user.role, "view_live_session") : false;
  const canShareLiveLink = user ? hasRolePermission(user.role, "share_live_link") : false;
  const canTakeAttendance = user ? hasRolePermission(user.role, "take_attendance") : false;

  useEffect(() => {
    if (user && !user.organizationId) {
      setLoading(false);
      setError(null);
      return;
    }

    const fetchRooms = async () => {
      try {
        const { items } = await roomsApi.list();
        setRooms(items);
      } catch (err) {
        setError(err instanceof ApiClientError ? err.message : "Failed to load rooms");
      } finally {
        setLoading(false);
      }
    };
    fetchRooms();
  }, [user]);

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text).then(
      () => toast("Link copied to clipboard!", "success"),
      () => toast("Failed to copy link.", "error"),
    );
  };

  const verifiedAttendees = rooms.reduce((sum, r) => sum + (r.attendanceCount ?? 0), 0);
  const liveRooms = rooms.filter((r) => r.status === "live").length;

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
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {Array.from({ length: 6 }).map((_, i) => (
            <Card key={i} className="p-6">
              <Skeleton className="h-5 w-20 rounded-full mb-3" />
              <Skeleton className="h-6 w-3/4 mb-2" />
              <Skeleton className="h-4 w-full mb-2" />
              <Skeleton className="h-4 w-2/3" />
            </Card>
          ))}
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <Card className="border-destructive/50">
        <CardContent className="p-6 text-center">
          <p className="text-destructive mb-4">{error}</p>
          <Button onClick={() => window.location.reload()} variant="outline">Try Again</Button>
        </CardContent>
      </Card>
    );
  }

  if (user && !user.organizationId) {
    return (
      <Card className="mx-auto max-w-2xl border-border bg-muted/40">
        <CardContent className="space-y-3 p-8 text-center">
          <div className="mx-auto w-12 h-12 rounded-full bg-primary/10 flex items-center justify-center text-primary mb-2">
            <ShieldCheck className="w-6 h-6" />
          </div>
          <CardTitle>{ROLE_LABELS[user.role]} account created</CardTitle>
          <CardDescription>
            Your account is ready, but it still needs an organization assignment before event access becomes
            available.
          </CardDescription>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-3xl font-bold tracking-tight font-display text-foreground">
            {canManageRooms ? "Event Rooms" : "Assigned Event Rooms"}
          </h2>
          <p className="text-muted-foreground mt-1">
            {canManageRooms
              ? `Manage live sessions, forms, and attendance for ${user?.organizationName || "your organization"} events.`
              : `Access event rooms and record attendance for ${user?.organizationName || "your organization"}.`}
          </p>
        </div>
        {canManageRooms && (
          <Link
            to="/rooms/create"
            className="inline-flex items-center justify-center gap-2 rounded-lg bg-primary px-4 h-10 text-sm font-semibold text-primary-foreground hover:opacity-90 transition-colors shadow-sm"
          >
            <Plus className="w-4 h-4" />
            Create Room
          </Link>
        )}
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <MetricCard title="Total Rooms" value={rooms.length} sub={`${liveRooms} live now`} icon={Activity} />
        <MetricCard title="Verified" value={verifiedAttendees} sub="Across all rooms" icon={Users} />
        <MetricCard title="Reports" value={rooms.filter((r) => r.status === "ended").length} sub="Available to export" icon={FileCheck} />
        <MetricCard title="Organization" value={user?.organizationName?.split(" ")[0] ?? "—"} sub={user?.organizationName ?? ""} icon={ShieldCheck} />
      </div>

      {rooms.length === 0 ? (
        <Card className="flex flex-col items-center justify-center py-16 text-center border-dashed">
          <CalendarClock className="w-12 h-12 text-muted-foreground mb-4" />
          <CardTitle className="mb-2">
            {canManageRooms ? "No event rooms yet" : "No assigned event rooms yet"}
          </CardTitle>
          <CardDescription className="mb-6 max-w-md">
            {canManageRooms
              ? "Get started by creating your first event room. You'll be able to invite attendees and host your session."
              : "Once your admin assigns you to an event, it will appear here for live viewing and attendance collection."}
          </CardDescription>
          {canManageRooms && (
            <Link
              to="/rooms/create"
              className="inline-flex items-center justify-center gap-2 rounded-lg bg-primary px-4 h-10 text-sm font-semibold text-primary-foreground hover:opacity-90 transition-colors shadow-sm"
            >
              Create your first room
            </Link>
          )}
        </Card>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {rooms.map((room) => (
            <Card key={room.id} className="flex flex-col border-border bg-card hover:border-brand/40 hover:shadow-lg hover:shadow-brand/5 transition-all duration-300 group">
              <CardContent className="pt-6 pb-4 flex-1">
                <div className="flex items-start justify-between gap-4 mb-3">
                  {pill(room.status)}
                  <span className="text-xs text-muted-foreground font-medium">
                    {formatDistanceToNow(new Date(room.createdAt), { addSuffix: true })}
                  </span>
                </div>
                <h3 className="text-base font-semibold leading-tight text-card-foreground group-hover:text-brand transition-colors mb-1">
                  {room.title}
                </h3>
                {room.description && (
                  <p className="text-sm text-muted-foreground line-clamp-2 mt-1">{room.description}</p>
                )}

                <div className="mt-4 space-y-2 text-sm text-muted-foreground">
                  {canViewRecords && (
                    <Link
                      to={`/rooms/${room.id}/attendance/records`}
                      className="flex items-center justify-center gap-2 rounded-lg bg-primary py-2.5 text-sm font-bold text-primary-foreground hover:opacity-90 transition-all shadow-sm"
                    >
                      <Users className="w-4 h-4" />
                      <span>View Records</span>
                      <span className="ml-1 flex h-5 min-w-5 items-center justify-center rounded-full bg-white/20 px-1.5 text-[10px]">
                        {room.attendanceCount ?? 0}
                      </span>
                    </Link>
                  )}

                  <div className="pt-2 flex items-center justify-between text-xs text-muted-foreground border-t border-border/60">
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
                </div>
               </CardContent>
               <div className="px-6 py-4 border-t border-border flex flex-wrap gap-2">
                  {canTakeAttendance && (
                    <Link
                      to={`/rooms/${room.id}/attendance`}
                      className="inline-flex items-center gap-1.5 rounded-md bg-primary py-1.5 px-3 h-8 text-xs font-bold text-primary-foreground hover:opacity-90 transition-all shadow-sm shadow-primary/10"
                    >
                      <ClipboardList className="w-3.5 h-3.5" />
                      <span>{canCreateAttendanceForm ? "Take Attendance" : "Record Attendance"}</span>
                    </Link>
                  )}
                  {canViewLiveSession && (
                    <Link
                      to={`/rooms/${room.id}/live`}
                      className="inline-flex items-center gap-1 rounded-md border border-border px-2.5 h-8 text-xs font-medium hover:bg-muted transition-colors"
                    >
                      <Radio className="w-3.5 h-3.5" />
                      Live
                    </Link>
                  )}
                  {canCreateAttendanceForm && (
                    <Link
                      to={`/rooms/${room.id}/form-builder`}
                      className="inline-flex items-center gap-1 rounded-md border border-border px-2.5 h-8 text-xs font-medium hover:bg-muted transition-colors"
                    >
                      <FormInput className="w-3.5 h-3.5" />
                      Form
                    </Link>
                  )}
                  {canShareLiveLink && (
                    <Button
                      variant="outline"
                      size="sm"
                      className="ml-auto h-8 px-2.5 gap-1.5 text-xs font-medium border-border"
                      onClick={() => copyToClipboard(room.shareUrl)}
                    >
                      <Copy className="w-3.5 h-3.5" />
                      Copy
                    </Button>
                  )}
                </div>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
};