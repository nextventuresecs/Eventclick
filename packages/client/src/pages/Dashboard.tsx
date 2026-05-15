import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { format } from "date-fns";
import { Copy, Users, Clock, Plus, CalendarClock, FormInput, ClipboardList, Radio } from "lucide-react";
import { ROLE_LABELS, hasRolePermission, type EventRoom } from "@application/shared";
import { roomsApi, ApiClientError } from "@/lib/api";
import { useAuth } from "@/hooks/useAuth";
import { useToast } from "@/hooks/useToast";
import { Button } from "@/components/ui/button";
import { Card, CardHeader, CardTitle, CardDescription, CardContent, CardFooter } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";

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

  const getStatusBadge = (status: EventRoom["status"]) => {
    const styles = {
      scheduled: "bg-blue-500/10 text-blue-500 border-blue-500/20",
      live: "bg-green-500/10 text-green-500 border-green-500/20 animate-pulse",
      ended: "bg-muted text-muted-foreground border-border",
      cancelled: "bg-destructive/10 text-destructive border-destructive/20"
    };

    return (
      <span className={`px-2 py-0.5 rounded-full text-xs font-medium border ${styles[status]}`}>
        {status.toUpperCase()}
      </span>
    );
  };

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
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {Array.from({ length: 6 }).map((_, i) => (
            <Card key={i} className="flex flex-col">
              <CardHeader className="pb-4">
                <div className="flex justify-between items-start gap-4 mb-2">
                  <Skeleton className="h-5 w-20 rounded-full" />
                  <Skeleton className="h-4 w-24" />
                </div>
                <Skeleton className="h-6 w-3/4" />
                <Skeleton className="h-4 w-full mt-2" />
                <Skeleton className="h-4 w-2/3" />
              </CardHeader>
              <CardContent className="pb-4 flex-1 space-y-3">
                <Skeleton className="h-4 w-40" />
                <Skeleton className="h-4 w-32" />
              </CardContent>
              <CardFooter className="pt-4 border-t border-border gap-2">
                <Skeleton className="h-8 w-16" />
                <Skeleton className="h-8 w-16" />
                <Skeleton className="h-8 w-20" />
                <Skeleton className="h-8 w-16 ml-auto" />
              </CardFooter>
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
      <Card className="mx-auto max-w-2xl border-dashed">
        <CardContent className="space-y-3 p-8 text-center">
          <CardTitle>{ROLE_LABELS[user.role]} account created</CardTitle>
          <CardDescription>
            Your account is ready, but it still needs an NGO assignment before event access becomes
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
          <h2 className="text-3xl font-bold tracking-tight">
            {canManageRooms ? "Event Rooms" : "Assigned Event Rooms"}
          </h2>
          <p className="text-muted-foreground mt-1">
            {canManageRooms
              ? "Manage live sessions, forms, and attendance for your NGO events."
              : "Join the live session, share the link, and record attendance for village attendees."}
          </p>
        </div>
        {canManageRooms && (
          <Link
            to="/rooms/create"
            className="inline-flex items-center justify-center gap-2 rounded-md bg-primary px-4 h-10 text-sm font-medium text-primary-foreground hover:opacity-90 transition-colors shrink-0"
          >
            <Plus className="w-4 h-4" />
            Create Room
          </Link>
        )}
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
              : "Once your NGO admin assigns you to an event, it will appear here for live viewing and attendance collection."}
          </CardDescription>
          {canManageRooms && (
            <Link
              to="/rooms/create"
              className="inline-flex items-center justify-center gap-2 rounded-md bg-primary px-4 h-10 text-sm font-medium text-primary-foreground hover:opacity-90 transition-colors"
            >
              Create your first room
            </Link>
          )}
        </Card>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {rooms.map((room) => (
            <Card key={room.id} className="flex flex-col hover:border-primary/50 transition-colors group">
              <CardHeader className="pb-4">
                <div className="flex justify-between items-start gap-4 mb-2">
                   {getStatusBadge(room.status)}
                   <span className="text-xs text-muted-foreground">
                     {format(new Date(room.createdAt), 'MMM d, yyyy')}
                   </span>
                </div>
                <CardTitle className="line-clamp-2 leading-tight group-hover:text-primary transition-colors">
                  {room.title}
                </CardTitle>
                {room.description && (
                  <CardDescription className="line-clamp-2 mt-2">
                    {room.description}
                  </CardDescription>
                )}
              </CardHeader>
              <CardContent className="pb-4 flex-1">
                <div className="space-y-3 text-sm text-muted-foreground">
                  {canViewReports && (
                    <Link
                      to={`/rooms/${room.id}/attendance/records`}
                      className="flex items-center justify-center gap-2 rounded-lg bg-primary/10 py-3 text-sm font-bold text-primary hover:bg-primary hover:text-primary-foreground transition-all shadow-sm group/rec"
                    >
                      <Users className="w-4 h-4 group-hover/rec:scale-110 transition-transform" />
                      <span>View Records</span>
                      <span className="ml-1 flex h-5 min-w-[1.25rem] items-center justify-center rounded-full bg-primary/20 px-1.5 text-[10px] group-hover/rec:bg-primary-foreground group-hover/rec:text-primary transition-colors">
                        {room.attendanceCount ?? 0}
                      </span>
                    </Link>
                  )}

                  <div className="pt-2 flex items-center justify-between text-xs text-muted-foreground border-t border-border/50">
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
               <CardFooter className="pt-4 border-t border-border flex flex-wrap gap-2">
                 {canTakeAttendance && (
                   <Link
                     to={`/rooms/${room.id}/attendance`}
                     className="inline-flex items-center gap-1.5 rounded-md bg-primary py-1.5 px-3 h-8 text-xs font-bold text-primary-foreground hover:opacity-90 transition-all shadow-sm shadow-primary/10 group/att"
                   >
                     <ClipboardList className="w-3 h-3 group-hover/att:scale-110 transition-transform" />
                     <span>{canCreateAttendanceForm ? "Take Attendance" : "Record Attendance"}</span>
                   </Link>
                 )}
                 {canViewLiveSession && (
                   <Link
                     to={`/rooms/${room.id}/live`}
                     className="inline-flex items-center gap-1 rounded-md border border-border px-2 h-8 text-xs font-medium hover:bg-muted transition-colors"
                   >
                     <Radio className="w-3 h-3" />
                     Live
                   </Link>
                 )}
                 {canCreateAttendanceForm && (
                   <Link
                     to={`/rooms/${room.id}/form-builder`}
                     className="inline-flex items-center gap-1 rounded-md border border-border px-2 h-8 text-xs font-medium hover:bg-muted transition-colors"
                   >
                     <FormInput className="w-3 h-3" />
                     Form
                   </Link>
                 )}
                 {canShareLiveLink && (
                   <Button
                     variant="outline"
                     size="sm"
                     className="ml-auto h-8 px-2.5 gap-1.5 text-xs font-medium"
                     onClick={() => copyToClipboard(room.shareUrl)}
                   >
                     <Copy className="w-3 h-3" />
                     Copy
                   </Button>
                 )}
               </CardFooter>

            </Card>
          ))}
        </div>
      )}
    </div>
  );
};
