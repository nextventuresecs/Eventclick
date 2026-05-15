import { useEffect, useMemo, useState } from "react";
import { Link, useParams } from "react-router-dom";
import {
  LiveKitRoom,
  RoomAudioRenderer,
  VideoConference,
} from "@livekit/components-react";
import "@livekit/components-styles";
import {
  ArrowLeft,
  Loader2,
  PlayCircle,
  Radio,
  StopCircle,
  Users,
} from "lucide-react";
import {
  EventRoom,
  LiveTokenResponse,
  PresenceSnapshot,
  hasRolePermission,
} from "@application/shared";
import { ApiClientError, liveApi, presenceApi, roomsApi } from "@/lib/api";
import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";

export const RoomLive = () => {
  const { id } = useParams<{ id: string }>();
  const { user } = useAuth();
  const [room, setRoom] = useState<EventRoom | null>(null);
  const [live, setLive] = useState<LiveTokenResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [actionBusy, setActionBusy] = useState<"start" | "stop" | null>(null);
  const [connect, setConnect] = useState(false);
  const [presence, setPresence] = useState<PresenceSnapshot | null>(null);

  const canPublish = useMemo(
    () => (user ? hasRolePermission(user.role, "manage_live_session") : false),
    [user],
  );

  useEffect(() => {
    if (!id) return;
    let cancelled = false;
    setLoading(true);
    (async () => {
      try {
        const r = await roomsApi.get(id);
        if (cancelled) return;
        setRoom(r);

        if (r.streamProvider === "livekit") {
          const token = await liveApi.getToken(id);
          if (!cancelled) setLive(token);
        }
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof ApiClientError ? err.message : "Failed to load");
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [id]);

  useEffect(() => {
    if (!id || room?.streamProvider !== "livekit") return;
    let cancelled = false;
    const tick = async () => {
      try {
        const p = await presenceApi.get(id);
        if (!cancelled) setPresence(p);
      } catch {
        /* swallow — presence is best-effort */
      }
    };
    tick();
    const handle = setInterval(tick, 3000);
    return () => {
      cancelled = true;
      clearInterval(handle);
    };
  }, [id, room?.streamProvider]);

  const handleStart = async () => {
    if (!id) return;
    setActionBusy("start");
    setError(null);
    try {
      const updated = await liveApi.start(id);
      setRoom(updated);
      setConnect(true);
    } catch (err) {
      setError(err instanceof ApiClientError ? err.message : "Start failed");
    } finally {
      setActionBusy(null);
    }
  };

  const handleStop = async () => {
    if (!id) return;
    setActionBusy("stop");
    setError(null);
    try {
      const updated = await liveApi.stop(id);
      setRoom(updated);
      setConnect(false);
    } catch (err) {
      setError(err instanceof ApiClientError ? err.message : "Stop failed");
    } finally {
      setActionBusy(null);
    }
  };

  if (loading) {
    return <div className="p-8 text-center text-muted-foreground">Loading…</div>;
  }

  if (!room) {
    return (
      <div className="max-w-md mx-auto p-6 text-center space-y-3">
        <h2 className="text-lg font-semibold">Room not found</h2>
        {error && <p className="text-sm text-destructive">{error}</p>}
        <Link to="/dashboard" className="text-primary hover:underline text-sm">
          Back to dashboard
        </Link>
      </div>
    );
  }

  return (
    <div className="max-w-5xl mx-auto space-y-4">
      <div className="flex items-center gap-3">
        <Link
          to="/dashboard"
          className="inline-flex items-center justify-center w-10 h-10 rounded-md hover:bg-muted shrink-0 -ml-2"
        >
          <ArrowLeft className="w-5 h-5" />
        </Link>
        <div className="flex-1 min-w-0">
          <h2 className="text-2xl font-bold tracking-tight truncate">{room.title}</h2>
          <p className="text-xs text-muted-foreground flex items-center gap-2 flex-wrap">
            <span
              className={`inline-block w-2 h-2 rounded-full ${
                room.status === "live"
                  ? "bg-red-500 animate-pulse"
                  : "bg-muted-foreground"
              }`}
            />
            {room.status.toUpperCase()} · provider: {room.streamProvider}
            {room.streamProvider === "livekit" && presence && (
              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full border border-border bg-muted/40 text-foreground">
                <Users className="w-3 h-3" />
                {presence.count} in room
              </span>
            )}
          </p>
        </div>

        {canPublish && room.streamProvider === "livekit" && (
          <div className="flex gap-2">
            {room.status !== "live" ? (
              <Button onClick={handleStart} disabled={actionBusy === "start"}>
                {actionBusy === "start" ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  <PlayCircle className="w-4 h-4" />
                )}
                Go Live
              </Button>
            ) : (
              <Button
                variant="destructive"
                onClick={handleStop}
                disabled={actionBusy === "stop"}
              >
                {actionBusy === "stop" ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  <StopCircle className="w-4 h-4" />
                )}
                End Live
              </Button>
            )}
          </div>
        )}
      </div>

      {error && (
        <div className="p-3 rounded-md bg-destructive/10 text-destructive text-sm border border-destructive/20">
          {error}
        </div>
      )}

      {room.streamProvider === "youtube" && room.youtubeEmbedUrl && (
        <div className="aspect-video w-full rounded-md overflow-hidden border border-border bg-black">
          <iframe
            src={room.youtubeEmbedUrl}
            className="w-full h-full"
            allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
            allowFullScreen
            title={room.title}
          />
        </div>
      )}

      {room.streamProvider === "livekit" && live && (
        <div className="rounded-md overflow-hidden border border-border bg-black">
          {(room.status === "live" || connect) ? (
            <div data-lk-theme="default" style={{ height: "70vh" }}>
              <LiveKitRoom
                token={live.token}
                serverUrl={live.url}
                connect={true}
                video={canPublish}
                audio={canPublish}
                onDisconnected={() => setConnect(false)}
              >
                <VideoConference />
                <RoomAudioRenderer />
              </LiveKitRoom>
            </div>
          ) : (
            <div className="aspect-video flex flex-col items-center justify-center gap-3 text-muted-foreground">
              <Radio className="w-12 h-12" />
              <p className="text-sm">
                {canPublish
                  ? 'Press "Go Live" to start streaming'
                  : "Waiting for an NGO or event admin to start the stream…"}
              </p>
            </div>
          )}
        </div>
      )}
    </div>
  );
};
