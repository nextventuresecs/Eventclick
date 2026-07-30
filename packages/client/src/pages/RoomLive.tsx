import { useEffect, useMemo, useRef, useState } from "react";
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
  CheckCircle2,
  AlertCircle,
  Camera,
  Upload,
  ChevronRight,
  ImageIcon,
  MapPin,
} from "lucide-react";
import {
  EventRoom,
  LiveTokenResponse,
  PresenceSnapshot,
  hasRolePermission,
  ActivityDefinition,
  ActivitySubmission,
} from "@application/shared";
import { ApiClientError, liveApi, presenceApi, roomsApi, activitiesApi, uploadToPresignedUrl } from "@/lib/api";
import { useAuth } from "@/hooks/useAuth";
import { compressImage } from "@/lib/imageCompress";
import { Button } from "@/components/ui/button";

export const RoomLive = () => {
  const { id } = useParams<{ id: string }>();
  const { user } = useAuth();
  const [room, setRoom] = useState<EventRoom | null>(null);
  const [live, setLive] = useState<LiveTokenResponse | null>(null);
  const [activeRecording, setActiveRecording] = useState<{ egressId: string } | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [actionBusy, setActionBusy] = useState<"start" | "stop" | null>(null);
  const [recordBusy, setRecordBusy] = useState<"start" | "stop" | null>(null);
  const [connect, setConnect] = useState(false);
  const [presence, setPresence] = useState<PresenceSnapshot | null>(null);
  const [activities, setActivities] = useState<ActivityDefinition[]>([]);
  const [submissions, setSubmissions] = useState<ActivitySubmission[]>([]);

  const canPublish = useMemo(
    () => (user ? hasRolePermission(user.role, "manage_live_session") : false),
    [user],
  );

  const refreshActivities = async () => {
    if (!id) return;
    try {
      const actData = await activitiesApi.list(id);
      setActivities(actData.activityDefinitions);
      setSubmissions(actData.submissions);
    } catch (err) {
      // Silently fail — activities will show stale data until next refresh
    }
  };

  useEffect(() => {
    if (!id) return;
    let cancelled = false;
    setLoading(true);
    (async () => {
      try {
        const r = await roomsApi.get(id);
        if (cancelled) return;
        setRoom(r);

        // Fetch activity definition and submissions
        const actData = await activitiesApi.list(id);
        if (cancelled) return;
        setActivities(actData.activityDefinitions);
        setSubmissions(actData.submissions);

        if (r.streamProvider === "livekit") {
          const token = await liveApi.getToken(id);
          if (!cancelled) setLive(token);
          
          try {
            const recording = await liveApi.getActiveRecording(id);
            if (!cancelled) setActiveRecording(recording);
          } catch (err) {
            // Non-critical — recording status badge may be stale
          }
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

  const handleStartRecording = async () => {
    if (!id) return;
    setRecordBusy("start");
    setError(null);
    try {
      const rec = await liveApi.startRecording(id);
      setActiveRecording(rec);
    } catch (err) {
      setError(err instanceof ApiClientError ? err.message : "Start recording failed");
    } finally {
      setRecordBusy(null);
    }
  };

  const handleStopRecording = async () => {
    if (!id || !activeRecording) return;
    setRecordBusy("stop");
    setError(null);
    try {
      await liveApi.stopRecording(id, activeRecording.egressId);
      setActiveRecording(null);
    } catch (err) {
      setError(err instanceof ApiClientError ? err.message : "Stop recording failed");
    } finally {
      setRecordBusy(null);
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
    <div className="max-w-7xl mx-auto space-y-6 animate-in fade-in">
      {/* Hero Header Banner */}
      <div className="rounded-3xl bg-brand-gradient-tile p-6 md:p-8 text-white shadow-lg space-y-4">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div className="space-y-2">
            <div className="flex flex-wrap items-center gap-2">
              <Link
                to="/dashboard"
                className="inline-flex items-center justify-center w-8 h-8 rounded-xl bg-white/15 text-white hover:bg-white/25 backdrop-blur-md transition-colors"
              >
                <ArrowLeft className="w-4 h-4" />
              </Link>
              <span className={`px-3 py-1 rounded-full text-xs font-semibold backdrop-blur-md border ${
                room.status === "live"
                  ? "bg-red-500/20 text-white border-red-400/40"
                  : "bg-white/15 text-white border-white/20"
              }`}>
                <span className={`inline-block w-2 h-2 rounded-full mr-1.5 ${
                  room.status === "live" ? "bg-red-400 animate-pulse" : "bg-white/60"
                }`} />
                {room.status.toUpperCase()} · Provider: {room.streamProvider}
              </span>

              {room.location && (
                <span className="px-3 py-1 rounded-full text-xs font-semibold bg-white/15 backdrop-blur-md text-white border border-white/20 flex items-center gap-1">
                  <MapPin className="w-3.5 h-3.5 text-purple-300" />
                  {room.location}
                </span>
              )}

              {room.streamProvider === "livekit" && presence && (
                <span className="px-3 py-1 rounded-full text-xs font-semibold bg-white/15 backdrop-blur-md text-white border border-white/20 flex items-center gap-1">
                  <Users className="w-3.5 h-3.5 text-purple-300" />
                  {presence.count} Active Viewers
                </span>
              )}
            </div>

            <h1 className="text-2xl md:text-3xl font-bold font-display text-white tracking-tight">
              {room.title}
            </h1>
          </div>

          {canPublish && room.streamProvider === "livekit" && (
            <div className="flex flex-wrap items-center gap-2.5 shrink-0">
              {room.status === "live" && !activeRecording && (
                <Button
                  onClick={handleStartRecording}
                  disabled={recordBusy === "start"}
                  className="bg-white/15 hover:bg-white/25 text-white font-semibold text-xs rounded-xl border border-white/20 h-10 px-4 backdrop-blur-md"
                >
                  {recordBusy === "start" ? (
                    <Loader2 className="w-4 h-4 animate-spin mr-2" />
                  ) : (
                    <div className="w-2.5 h-2.5 rounded-full bg-red-400 mr-2 animate-pulse" />
                  )}
                  Start Recording
                </Button>
              )}
              {room.status === "live" && activeRecording && (
                <Button
                  onClick={handleStopRecording}
                  disabled={recordBusy === "stop"}
                  className="bg-red-600/90 hover:bg-red-600 text-white font-semibold text-xs rounded-xl h-10 px-4 shadow-sm"
                >
                  {recordBusy === "stop" ? (
                    <Loader2 className="w-4 h-4 animate-spin mr-2" />
                  ) : (
                    <div className="w-2.5 h-2.5 rounded-xs bg-white mr-2" />
                  )}
                  Stop Recording
                </Button>
              )}

              {room.status !== "live" ? (
                <Button
                  onClick={handleStart}
                  disabled={actionBusy === "start"}
                  className="bg-white text-purple-950 hover:bg-purple-50 font-bold text-xs rounded-xl h-10 px-5 shadow-md gap-1.5"
                >
                  {actionBusy === "start" ? (
                    <Loader2 className="w-4 h-4 animate-spin" />
                  ) : (
                    <PlayCircle className="w-4 h-4 text-purple-700" />
                  )}
                  Go Live Broadcast
                </Button>
              ) : (
                <Button
                  onClick={handleStop}
                  disabled={actionBusy === "stop"}
                  className="bg-red-600 hover:bg-red-700 text-white font-bold text-xs rounded-xl h-10 px-5 shadow-md gap-1.5"
                >
                  {actionBusy === "stop" ? (
                    <Loader2 className="w-4 h-4 animate-spin" />
                  ) : (
                    <StopCircle className="w-4 h-4" />
                  )}
                  End Live Session
                </Button>
              )}
            </div>
          )}
        </div>
      </div>

      {error && (
        <div className="p-3 rounded-md bg-status-cancelled-bg text-(--color-error) text-sm border border-(--color-gray-200)">
          {error}
        </div>
      )}

      {/* Two-column responsive layout */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 items-start">
        {/* Stream Column (2/3 width on desktop) */}
        <div className="lg:col-span-2 space-y-4">
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

        {/* Checklist & Quality-Control Sidebar (1/3 width on desktop) */}
        <div className="lg:col-span-1">
          <ActivityTrackerPanel
            roomId={room.id}
            activities={activities}
            submissions={submissions}
            onRefresh={refreshActivities}
          />
        </div>
      </div>
    </div>
  );
};

interface ActivityTrackerPanelProps {
  roomId: string;
  activities: ActivityDefinition[];
  submissions: ActivitySubmission[];
  onRefresh: () => Promise<void>;
}

export const ActivityTrackerPanel: React.FC<ActivityTrackerPanelProps> = ({
  roomId,
  activities,
  submissions,
  onRefresh,
}) => {
  const [selectedActivityId, setSelectedActivityId] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  // Camera state
  const [cameraOpen, setCameraOpen] = useState(false);
  const [cameraReady, setCameraReady] = useState(false);
  const [cameraError, setCameraError] = useState<string | null>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);

  // File upload state
  const fileInputRef = useRef<HTMLInputElement>(null);

  const selectedActivity = activities.find((a) => a.id === selectedActivityId);
  const selectedSubmission = submissions.find((s) => s.activityId === selectedActivityId);

  // Stop camera stream
  const stopCamera = () => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
    }
    setCameraReady(false);
    setCameraOpen(false);
  };

  useEffect(() => {
    return () => stopCamera();
  }, []);

  // Open camera
  const openCamera = async () => {
    setCameraError(null);
    setCameraReady(false);
    let stream: MediaStream | null = null;
    try {
      stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: { ideal: "environment" }, width: { ideal: 1280 } },
        audio: false,
      });
      streamRef.current = stream;
      setCameraOpen(true);

      let video: HTMLVideoElement | null = null;
      for (let attempt = 0; attempt < 10 && !video; attempt += 1) {
        await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
        video = videoRef.current;
      }
      if (!video) {
        throw new Error("Camera preview failed to initialize");
      }

      video.srcObject = stream;
      try {
        await video.play();
      } catch {
        // Safe play fallback
      }

      // Check if video dimensions are ready
      if (video.videoWidth === 0 || video.videoHeight === 0) {
        await new Promise<void>((resolve, reject) => {
          let timeout = 0;
          const onReady = () => {
            if (video && video.videoWidth > 0 && video.videoHeight > 0) {
              cleanup();
              resolve();
            }
          };
          const cleanup = () => {
            window.clearTimeout(timeout);
            video?.removeEventListener("loadedmetadata", onReady);
            video?.removeEventListener("canplay", onReady);
            video?.removeEventListener("playing", onReady);
          };
          timeout = window.setTimeout(() => {
            cleanup();
            reject(new Error("Camera initialization timeout"));
          }, 3000);
          video.addEventListener("loadedmetadata", onReady);
          video.addEventListener("canplay", onReady);
          video.addEventListener("playing", onReady);
          onReady();
        });
      }

      setCameraReady(true);
    } catch (err) {
      if (stream) {
        stream.getTracks().forEach((t) => t.stop());
      }
      streamRef.current = null;
      setCameraOpen(false);
      setCameraReady(false);
      const msg = err instanceof Error ? err.message : "Camera unavailable";
      setCameraError(
        msg.includes("Permission")
          ? "Camera permission denied. Check browser settings."
          : `Camera error: ${msg}`,
      );
    }
  };

  // Capture photo from video stream
  const capturePhoto = async () => {
    const video = videoRef.current;
    if (!video || !streamRef.current || !cameraReady) {
      setCameraError("Camera is not active or warming up.");
      return;
    }

    try {
      const canvas = document.createElement("canvas");
      canvas.width = video.videoWidth;
      canvas.height = video.videoHeight;
      const ctx = canvas.getContext("2d");
      if (!ctx) {
        throw new Error("Failed to initialize canvas context");
      }

      ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
      canvas.toBlob(
        async (blob) => {
          if (!blob) {
            setCameraError("Failed to convert capture to JPEG.");
            return;
          }
          const file = new File([blob], `proof-${Date.now()}.jpg`, { type: "image/jpeg" });
          stopCamera();
          await uploadFile(file);
        },
        "image/jpeg",
        0.92,
      );
    } catch (err) {
      setCameraError(err instanceof Error ? err.message : "Capture failed");
    }
  };

  // Perform upload to S3 via API Client and Shared functions
  const uploadFile = async (file: File) => {
    if (!selectedActivityId) return;
    setUploading(true);
    setError(null);
    setSuccess(null);
    try {
      setUploadProgress("Compressing image…");
      const compressedBlob = await compressImage(file);

      setUploadProgress("Getting S3 ticket…");
      const ticket = await activitiesApi.presignPhoto(roomId, {
        activityId: selectedActivityId,
        contentType: "image/jpeg",
        sizeBytes: compressedBlob.size,
      });

      setUploadProgress("Uploading photo…");
      await uploadToPresignedUrl(ticket.uploadUrl, compressedBlob);

      setUploadProgress("Saving proof…");
      await activitiesApi.submitPhoto(roomId, {
        activityId: selectedActivityId,
        photoKey: ticket.key,
      });

      setSuccess("Photo proof successfully saved!");
      await onRefresh();
    } catch (err) {
      // Error already surfaced via setError below
      setError(err instanceof ApiClientError ? err.message : "Upload failed. Try again.");
    } finally {
      setUploading(false);
      setUploadProgress(null);
    }
  };

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      await uploadFile(file);
    }
  };

  const triggerFileSelect = () => {
    fileInputRef.current?.click();
  };

  // Checklist Progress Analytics
  const totalRequired = activities.length;
  const completedCount = activities.filter((act) => {
    const sub = submissions.find((s) => s.activityId === act.id);
    return (sub?.photos.length ?? 0) >= act.min_photos;
  }).length;

  const completionPercent = totalRequired > 0 ? Math.round((completedCount / totalRequired) * 100) : 0;

  return (
    <div className="border border-border rounded-lg bg-card text-card-foreground overflow-hidden shadow-sm">
      {/* Header and Progress Indicator */}
      <div className="p-4 border-b border-border bg-muted/30">
        <div className="flex items-center justify-between mb-2">
          <h3 className="font-semibold text-sm tracking-tight flex items-center gap-2">
            <CheckCircle2 className="w-4 h-4 text-primary" />
            Quality Checklist
          </h3>
          <span className="text-xs font-semibold px-2 py-0.5 rounded bg-primary/10 text-primary">
            {completedCount}/{totalRequired} Complete
          </span>
        </div>
        <div className="w-full bg-muted rounded-full h-1.5 overflow-hidden">
          <div
            className="bg-primary h-1.5 transition-all duration-300"
            style={{ width: `${completionPercent}%` }}
          />
        </div>
        <p className="text-xs text-muted-foreground mt-2">
          Volunteers must upload photos to satisfy checklist requirements.
        </p>
      </div>

      {/* Main checklist or empty state */}
      <div className="p-4 space-y-4">
        {activities.length === 0 ? (
          <div className="py-8 text-center text-xs text-muted-foreground">
            No mandatory activities required for this room.
          </div>
        ) : (
          <div className="space-y-2">
            {activities.map((act) => {
              const sub = submissions.find((s) => s.activityId === act.id);
              const uploaded = sub?.photos.length ?? 0;
              const isCompleted = uploaded >= act.min_photos;
              const isSelected = selectedActivityId === act.id;

              return (
                <div key={act.id} className="space-y-2">
                  <button
                    onClick={() => {
                      setSelectedActivityId(isSelected ? null : act.id);
                      stopCamera();
                      setError(null);
                      setSuccess(null);
                    }}
                    className={`w-full text-left p-3 rounded-lg border transition-all flex items-center justify-between gap-3 ${
                      isSelected
                        ? "border-primary/50 bg-primary/5"
                        : isCompleted
                        ? "border-emerald-500/20 bg-emerald-500/5 hover:bg-emerald-500/10"
                        : "border-border bg-card hover:bg-muted/40"
                    }`}
                  >
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-semibold text-sm truncate">{act.title}</span>
                        {isCompleted ? (
                          <span className="inline-flex items-center gap-1 text-[10px] font-bold text-emerald-600 bg-emerald-100 dark:bg-emerald-950/40 dark:text-emerald-400 px-1.5 py-0.5 rounded">
                            Verified
                          </span>
                        ) : uploaded > 0 ? (
                          <span className="inline-flex items-center gap-1 text-[10px] font-bold text-amber-600 bg-amber-100 dark:bg-amber-950/40 dark:text-amber-400 px-1.5 py-0.5 rounded">
                            In Progress
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 text-[10px] font-bold text-muted-foreground bg-muted px-1.5 py-0.5 rounded">
                            Required
                          </span>
                        )}
                      </div>
                      <p className="text-xs text-muted-foreground truncate mt-0.5">
                        {act.description || "Upload required photo proofs."}
                      </p>
                    </div>

                    <div className="flex items-center gap-2 shrink-0">
                      <span className="text-xs font-semibold tabular-nums text-muted-foreground">
                        {uploaded}/{act.min_photos}
                      </span>
                      <ChevronRight
                        className={`w-4 h-4 text-muted-foreground transition-transform ${
                          isSelected ? "rotate-90 text-primary" : ""
                        }`}
                      />
                    </div>
                  </button>

                  {/* Expanded detail & camera capture component */}
                  {isSelected && (
                    <div className="p-3 border border-border/80 rounded-lg bg-muted/20 space-y-3 animate-in fade-in slide-in-from-top-1 duration-200">
                      {act.description && (
                        <p className="text-xs text-muted-foreground leading-normal">
                          {act.description}
                        </p>
                      )}

                      {/* Photo proofs grid */}
                      {uploaded > 0 && (
                        <div className="space-y-1.5">
                          <h4 className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
                            Submitted Proofs
                          </h4>
                          <div className="grid grid-cols-3 gap-2">
                            {sub?.photos.map((ph, idx) => (
                              <div
                                key={ph.key}
                                className="relative aspect-video rounded border border-border bg-black overflow-hidden group shadow-sm"
                              >
                                <img
                                  src={ph.url}
                                  alt={`Proof ${idx + 1}`}
                                  className="w-full h-full object-cover"
                                />
                                <div className="absolute inset-0 bg-black/60 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center p-1">
                                  <span className="text-[9px] text-white text-center font-medium leading-tight">
                                    {new Date(ph.uploadedAt).toLocaleTimeString([], {
                                      hour: "2-digit",
                                      minute: "2-digit",
                                    })}
                                  </span>
                                </div>
                              </div>
                            ))}
                          </div>
                        </div>
                      )}

                      {/* Controls (camera / upload) */}
                      <div className="space-y-2 pt-2 border-t border-border/50">
                        {error && (
                          <div className="p-2 rounded bg-status-cancelled-bg text-(--color-error) text-xs border border-(--color-gray-200) flex items-center gap-1.5">
                            <AlertCircle className="w-3.5 h-3.5 shrink-0" />
                            <span>{error}</span>
                          </div>
                        )}
                        {success && (
                          <div className="p-2 rounded bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 text-xs border border-emerald-500/20">
                            {success}
                          </div>
                        )}

                        {uploading ? (
                          <div className="flex flex-col items-center justify-center py-4 gap-2">
                            <Loader2 className="w-6 h-6 animate-spin text-primary" />
                            <span className="text-xs text-muted-foreground font-medium">
                              {uploadProgress ?? "Uploading proof…"}
                            </span>
                          </div>
                        ) : cameraOpen ? (
                          <div className="space-y-2">
                            <div className="relative aspect-video rounded bg-black overflow-hidden border border-border">
                              <video
                                ref={videoRef}
                                playsInline
                                muted
                                className="w-full h-full object-cover scale-x-[-1]"
                              />
                              <div className="absolute top-2 left-2 flex items-center gap-1.5 px-2 py-0.5 rounded-full bg-red-500 text-white text-[9px] font-bold uppercase tracking-wider animate-pulse">
                                <span className="w-1.5 h-1.5 rounded-full bg-white" />
                                Live Camera
                              </div>
                              {cameraError && (
                                <div className="absolute inset-0 bg-black/85 flex items-center justify-center p-3 text-center">
                                  <p className="text-xs text-destructive font-medium">
                                    {cameraError}
                                  </p>
                                </div>
                              )}
                            </div>
                            <div className="flex gap-2">
                              <Button
                                onClick={capturePhoto}
                                size="sm"
                                className="flex-1 gap-1.5"
                                disabled={!cameraReady}
                              >
                                <Camera className="w-4 h-4" />
                                Capture Photo
                              </Button>
                              <Button
                                variant="outline"
                                size="sm"
                                onClick={stopCamera}
                              >
                                Cancel
                              </Button>
                            </div>
                          </div>
                        ) : (
                          <div className="flex gap-2">
                            <Button
                              onClick={openCamera}
                              size="sm"
                              variant="outline"
                              className="flex-1 gap-1.5"
                            >
                              <Camera className="w-4 h-4" />
                              Take Photo
                            </Button>
                            <Button
                              onClick={triggerFileSelect}
                              size="sm"
                              variant="outline"
                              className="flex-1 gap-1.5"
                            >
                              <Upload className="w-4 h-4" />
                              Upload File
                            </Button>
                            <input
                              type="file"
                              ref={fileInputRef}
                              onChange={handleFileChange}
                              accept="image/jpeg,image/png,image/webp"
                              className="hidden"
                            />
                          </div>
                        )}
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
};
