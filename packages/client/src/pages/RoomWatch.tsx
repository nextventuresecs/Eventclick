import { useEffect, useState, type FormEvent } from "react";
import { useParams } from "react-router-dom";
import {
  LiveKitRoom,
  RoomAudioRenderer,
  VideoConference,
} from "@livekit/components-react";
import "@livekit/components-styles";
import { Loader2, Radio, Users } from "lucide-react";
import type {
  LiveTokenResponse,
  PresenceSnapshot,
  SharedRoom,
} from "@application/shared";
import { ApiClientError, shareApi } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export const RoomWatch = () => {
  const { token } = useParams<{ token: string }>();
  const [room, setRoom] = useState<SharedRoom | null>(null);
  const [live, setLive] = useState<LiveTokenResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [joining, setJoining] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [name, setName] = useState("");
  const [presence, setPresence] = useState<PresenceSnapshot | null>(null);

  useEffect(() => {
    if (!token) return;
    let cancelled = false;
    (async () => {
      try {
        const r = await shareApi.get(token);
        if (!cancelled) setRoom(r);
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
  }, [token]);

  useEffect(() => {
    if (!token || room?.streamProvider !== "livekit") return;
    let cancelled = false;
    const tick = async () => {
      try {
        const p = await shareApi.presence(token);
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
  }, [token, room?.streamProvider]);

  const handleJoin = async (e: FormEvent) => {
    e.preventDefault();
    if (!token) return;
    setJoining(true);
    setError(null);
    try {
      const t = await shareApi.getToken(token, name.trim() || undefined);
      setLive(t);
    } catch (err) {
      setError(err instanceof ApiClientError ? err.message : "Failed to join");
    } finally {
      setJoining(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center text-muted-foreground">
        Loading…
      </div>
    );
  }

  if (!room) {
    return (
      <div className="min-h-screen flex items-center justify-center p-8 text-center">
        <div className="space-y-2">
          <h1 className="text-2xl font-bold">Room not found</h1>
          {error && <p className="text-sm text-destructive">{error}</p>}
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      <header className="border-b border-border px-4 py-3">
        <div className="max-w-5xl mx-auto flex items-center gap-3">
          <h1 className="text-lg font-semibold truncate flex-1">{room.title}</h1>
          {room.streamProvider === "livekit" && presence && (
            <span className="text-xs inline-flex items-center gap-1 px-2 py-0.5 rounded-full border border-border bg-muted/40">
              <Users className="w-3 h-3" />
              {presence.count}
            </span>
          )}
          <span
            className={`text-xs px-2 py-0.5 rounded-full border ${
              room.status === "live"
                ? "bg-red-500/10 text-red-500 border-red-500/20"
                : "bg-muted text-muted-foreground border-border"
            }`}
          >
            {room.status === "live" && (
              <Radio className="w-3 h-3 inline mr-1 animate-pulse" />
            )}
            {room.status.toUpperCase()}
          </span>
        </div>
      </header>

      <main className="max-w-5xl mx-auto p-4 space-y-4">
        {room.description && (
          <p className="text-sm text-muted-foreground">{room.description}</p>
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

        {room.streamProvider === "livekit" && !live && (
          <form
            onSubmit={handleJoin}
            className="max-w-sm mx-auto space-y-4 rounded-md border border-border p-6"
          >
            <div className="space-y-1.5">
              <Label htmlFor="guest-name">Your name (optional)</Label>
              <Input
                id="guest-name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Guest"
                maxLength={60}
              />
            </div>
            {error && (
              <p className="text-sm text-destructive">{error}</p>
            )}
            <Button type="submit" disabled={joining} className="w-full">
              {joining ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  Joining…
                </>
              ) : room.status === "live" ? (
                "Join live stream"
              ) : (
                "Join room (waiting for host)"
              )}
            </Button>
          </form>
        )}

        {room.streamProvider === "livekit" && live && (
          <div
            data-lk-theme="default"
            className="rounded-md overflow-hidden border border-border bg-black"
            style={{ height: "70vh" }}
          >
            <LiveKitRoom
              token={live.token}
              serverUrl={live.url}
              connect={true}
              video={false}
              audio={false}
            >
              <VideoConference />
              <RoomAudioRenderer />
            </LiveKitRoom>
          </div>
        )}
      </main>
    </div>
  );
};
