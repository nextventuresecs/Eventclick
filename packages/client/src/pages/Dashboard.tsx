import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { format } from "date-fns";
import { Copy, Users, Clock, Plus, ExternalLink, CalendarClock } from "lucide-react";
import type { EventRoom } from "@application/shared";
import { roomsApi, ApiClientError } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Card, CardHeader, CardTitle, CardDescription, CardContent, CardFooter } from "@/components/ui/card";

export const Dashboard = () => {
  const [rooms, setRooms] = useState<EventRoom[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
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
  }, []);

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
    // In a real app we would show a toast notification here
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
      <div className="flex justify-center items-center h-64">
        <div className="w-8 h-8 rounded-full border-4 border-primary border-t-transparent animate-spin" />
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

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-3xl font-bold tracking-tight">Event Rooms</h2>
          <p className="text-muted-foreground mt-1">Manage your events and webinar rooms.</p>
        </div>
        <Link
          to="/rooms/create"
          className="inline-flex items-center justify-center gap-2 rounded-md bg-primary px-4 h-10 text-sm font-medium text-primary-foreground hover:opacity-90 transition-colors shrink-0"
        >
          <Plus className="w-4 h-4" />
          Create Room
        </Link>
      </div>

      {rooms.length === 0 ? (
        <Card className="flex flex-col items-center justify-center py-16 text-center border-dashed">
          <CalendarClock className="w-12 h-12 text-muted-foreground mb-4" />
          <CardTitle className="mb-2">No event rooms yet</CardTitle>
          <CardDescription className="mb-6 max-w-md">
            Get started by creating your first event room. You'll be able to invite attendees and host your session.
          </CardDescription>
          <Link
            to="/rooms/create"
            className="inline-flex items-center justify-center gap-2 rounded-md bg-primary px-4 h-10 text-sm font-medium text-primary-foreground hover:opacity-90 transition-colors"
          >
            Create your first room
          </Link>
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
                  <div className="flex items-center gap-2">
                    <Clock className="w-4 h-4 shrink-0" />
                    <span className="truncate">
                      {format(new Date(room.scheduledStart), 'MMM d, h:mm a')}
                    </span>
                  </div>
                  {room.maxParticipants && (
                    <div className="flex items-center gap-2">
                      <Users className="w-4 h-4 shrink-0" />
                      <span>Max {room.maxParticipants} attendees</span>
                    </div>
                  )}
                </div>
              </CardContent>
              <CardFooter className="pt-4 border-t border-border flex justify-between gap-2">
                <Button 
                  variant="outline" 
                  size="sm" 
                  className="flex-1 gap-2"
                  onClick={() => copyToClipboard(room.shareToken)} // Basic share handling for now
                >
                  <Copy className="w-3 h-3" />
                  Copy Link
                </Button>
                {/* 
                  Commented out until RoomDetails exists 
                  <Button variant="default" size="sm" asChild>
                    <Link href={`/rooms/${room.id}`}>Manage</Link>
                  </Button>
                */}
              </CardFooter>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
};
