import { useEffect, useState, type FormEvent } from "react";
import { useParams } from "react-router-dom";
import {
  LiveKitRoom,
  RoomAudioRenderer,
  VideoConference,
} from "@livekit/components-react";
import "@livekit/components-styles";
import { Loader2, Radio, Users, MapPin } from "lucide-react";
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
      <header className="border-b border-border bg-white px-4 py-3 shadow-xs">
        <div className="max-w-5xl mx-auto flex items-center gap-3">
          <div className="flex items-center gap-2 pr-2 border-r border-gray-200 shrink-0">
            <img src="/only_icon.png" alt="Eventclick" className="h-6 w-6 object-contain" />
            <span className="font-display font-bold text-sm tracking-tight hidden sm:inline">Eventclick</span>
          </div>
          <h1 className="text-base font-semibold font-display text-gray-900 truncate flex-1">{room.title}</h1>
          {room.location && (
            <span className="hidden md:inline-flex items-center gap-1 text-[11px] font-medium text-purple-700 bg-purple-50 px-2.5 py-0.5 rounded-full border border-purple-200">
              <MapPin className="w-3 h-3 text-purple-600" />
              <span className="truncate max-w-40">{room.location}</span>
            </span>
          )}
          {room.streamProvider === "livekit" && presence && (
            <span className="text-xs inline-flex items-center gap-1 px-2.5 py-1 rounded-full border border-gray-200 bg-gray-50 text-gray-700 font-medium">
              <Users className="w-3.5 h-3.5 text-gray-500" />
              {presence.count}
            </span>
          )}
          <span
            className={`text-xs px-2.5 py-1 rounded-full font-semibold border ${
              room.status === "live"
                ? "bg-emerald-50 text-emerald-700 border-emerald-200"
                : "bg-gray-100 text-gray-600 border-gray-200"
            }`}
          >
            {room.status === "live" && (
              <Radio className="w-3 h-3 inline mr-1 animate-pulse text-emerald-600" />
            )}
            {room.status.toUpperCase()}
          </span>
        </div>
      </header>

      <main className="max-w-5xl mx-auto p-4 md:p-6 space-y-6">
        {room.description && (
          <p className="text-sm text-gray-600 max-w-3xl leading-relaxed">{room.description}</p>
        )}

        {room.streamProvider === "youtube" && room.youtubeEmbedUrl && (
          <div className="aspect-video w-full rounded-2xl overflow-hidden border border-border bg-black shadow-lg">
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
            className="max-w-md mx-auto space-y-5 rounded-2xl border border-purple-100 bg-white p-8 shadow-sm text-center"
          >
            <div className="mx-auto w-12 h-12 rounded-full bg-purple-50 flex items-center justify-center text-purple-700">
              <Radio className="w-6 h-6 animate-pulse" />
            </div>
            <div className="space-y-1">
              <h3 className="text-lg font-bold font-display text-gray-900">Join Event Session</h3>
              <p className="text-xs text-gray-500">Enter your name to join the live room broadcast.</p>
            </div>

            <div className="space-y-2 text-left">
              <Label htmlFor="guest-name" className="text-xs font-semibold text-gray-700">Your Name <span className="text-gray-400 font-normal">(optional)</span></Label>
              <Input
                id="guest-name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="e.g. Alex Johnson"
                maxLength={60}
                className="input-premium"
              />
            </div>
            {error && (
              <p className="text-xs text-red-600 bg-red-50 p-2.5 rounded-lg border border-red-100">{error}</p>
            )}
            <Button type="submit" disabled={joining} className="w-full bg-brand-gradient h-11 rounded-xl text-sm font-semibold shadow-md hover:shadow-lg transition-all">
              {joining ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  Connecting…
                </>
              ) : room.status === "live" ? (
                "Join Live Stream Now"
              ) : (
                "Join Room (Waiting for Host)"
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
