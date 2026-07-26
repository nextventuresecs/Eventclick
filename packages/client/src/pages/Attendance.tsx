import { useEffect, useMemo, useRef, useState, type FormEvent } from "react";
import { Link, useParams } from "react-router-dom";
import { AlertTriangle, ArrowLeft, Calendar, Camera, Check, Clock, Loader2, RefreshCw, X } from "lucide-react";
import { ROLE_LABELS, type FormField, type FormDefinition, type EventRoom } from "@application/shared";
import {
  ApiClientError,
  attendanceApi,
  formsApi,
  roomsApi,
  uploadToPresignedUrl,
} from "@/lib/api";
import { useAuth } from "@/hooks/useAuth";
import { compressImage } from "@/lib/imageCompress";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

type FieldValue = string | number | boolean;
const CAMERA_READY_TIMEOUT_MS = 3000;

const blankValue = (f: FormField): FieldValue => {
  if (f.type === "checkbox") return false;
  if (f.type === "number") return "" as unknown as number;
  return "";
};

const buildInitialData = (fields: FormField[]): Record<string, FieldValue> =>
  Object.fromEntries(fields.map((f) => [f.id, blankValue(f)]));
const isVideoFrameReady = (video: HTMLVideoElement): boolean =>
  video.videoWidth > 0 && video.videoHeight > 0;

export const Attendance = () => {
  const { id } = useParams<{ id: string }>();
  const { user } = useAuth();
  const [form, setForm] = useState<FormDefinition | null>(null);
  const [room, setRoom] = useState<EventRoom | null>(null);
  const [currentTime, setCurrentTime] = useState(new Date());
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [lastSubmitted, setLastSubmitted] = useState<string | null>(null);
  const [data, setData] = useState<Record<string, FieldValue>>({});
  const [photoFile, setPhotoFile] = useState<File | null>(null);
  const [photoPreview, setPhotoPreview] = useState<string | null>(null);
  const [uploadProgress, setUploadProgress] = useState<string | null>(null);
  const [cameraOpen, setCameraOpen] = useState(false);
  const [cameraReady, setCameraReady] = useState(false);
  const [cameraError, setCameraError] = useState<string | null>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);

  useEffect(() => {
    if (!id) return;
    setLoading(true);
    setError(null);
    Promise.all([formsApi.get(id), roomsApi.get(id)])
      .then(([f, r]) => {
        if (f) {
          setForm(f);
          setData(buildInitialData(f.fields));
        } else {
          setForm(null);
          setData({});
        }
        if (r) {
          setRoom(r);
        } else {
          setRoom(null);
        }
      })
      .catch((err) =>
        setError(err instanceof ApiClientError ? err.message : "Failed to load details"),
      )
      .finally(() => setLoading(false));
  }, [id]);

  useEffect(() => {
    const timer = setInterval(() => {
      setCurrentTime(new Date());
    }, 5000);
    return () => clearInterval(timer);
  }, []);

  useEffect(() => {
    if (!photoFile) {
      setPhotoPreview(null);
      return;
    }
    const url = URL.createObjectURL(photoFile);
    setPhotoPreview(url);
    return () => URL.revokeObjectURL(url);
  }, [photoFile]);

  const fieldsLabel = useMemo(
    () => form?.fields.map((f) => f.id).join(","),
    [form],
  );

  const windowCheck = useMemo(() => {
    if (!room) return null;

    const scheduledStart = new Date(room.scheduledStart);
    const scheduledEnd = new Date(room.scheduledEnd);
    const actualStart = room.actualStart ? new Date(room.actualStart) : null;
    const actualEnd = room.actualEnd ? new Date(room.actualEnd) : null;
    const status = room.status;

    const beforeMinutes = room.attendanceWindowBefore ?? 15;
    const afterMinutes = room.attendanceWindowAfter ?? 30;

    if (status === "cancelled") {
      return {
        isAllowed: false,
        status: "cancelled" as const,
        message: "This event session has been cancelled. Attendance cannot be recorded.",
      };
    }

    if (status === "live") {
      if (actualEnd) {
        const endLimit = new Date(actualEnd.getTime() + afterMinutes * 60 * 1000);
        const isAllowed = currentTime <= endLimit;
        return {
          isAllowed,
          status: "live_ended" as const,
          message: isAllowed
            ? `The session ended, but the attendance window remains open until ${endLimit.toLocaleTimeString()} (${Math.max(0, Math.round((endLimit.getTime() - currentTime.getTime()) / 60000))} mins left).`
            : `The session ended and the late submission buffer closed at ${endLimit.toLocaleTimeString()}.`,
        };
      }
      return {
        isAllowed: true,
        status: "live" as const,
        message: "The event is currently live! You can record attendance.",
      };
    }

    if (status === "ended") {
      if (!actualEnd) {
        return {
          isAllowed: false,
          status: "ended_no_limit" as const,
          message: "This event has ended. Attendance is closed.",
        };
      }
      const endLimit = new Date(actualEnd.getTime() + afterMinutes * 60 * 1000);
      const isAllowed = currentTime <= endLimit;
      return {
        isAllowed,
        status: "ended" as const,
        message: isAllowed
          ? `The event has ended. The late buffer remains open until ${endLimit.toLocaleTimeString()} (${Math.max(0, Math.round((endLimit.getTime() - currentTime.getTime()) / 60000))} mins left).`
          : `The event ended. The late submission buffer closed at ${endLimit.toLocaleTimeString()}.`,
      };
    }

    if (status === "scheduled") {
      const startLimit = new Date(scheduledStart.getTime() - beforeMinutes * 60 * 1000);
      if (currentTime < startLimit) {
        const minsToWait = Math.round((startLimit.getTime() - currentTime.getTime()) / 60000);
        return {
          isAllowed: false,
          status: "scheduled_too_early" as const,
          message: `This event is scheduled for ${scheduledStart.toLocaleTimeString()}. Early attendance submissions open at ${startLimit.toLocaleTimeString()} (in ${minsToWait} mins).`,
        };
      }
      if (currentTime > scheduledEnd) {
        return {
          isAllowed: false,
          status: "scheduled_passed" as const,
          message: `This event was scheduled to end at ${scheduledEnd.toLocaleTimeString()}. Attendance is closed since it was not started.`,
        };
      }
      return {
        isAllowed: true,
        status: "scheduled_open" as const,
        message: `Attendance is open for this scheduled event until ${scheduledEnd.toLocaleTimeString()}!`,
      };
    }

    return {
      isAllowed: false,
      status: "unknown" as const,
      message: "Attendance window closed.",
    };
  }, [room, currentTime]);


  const stopCamera = () => {
    const video = videoRef.current;
    if (video) {
      video.pause();
      video.srcObject = null;
    }
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
    setCameraReady(false);
    setCameraOpen(false);
  };

  useEffect(() => () => stopCamera(), []);

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
        // Some browsers resolve playback readiness via metadata/canplay events.
      }

      if (!isVideoFrameReady(video)) {
        await new Promise<void>((resolve, reject) => {
          let timeout = 0;
          const onReady = () => {
            if (isVideoFrameReady(video)) {
              cleanup();
              resolve();
            }
          };
          const cleanup = () => {
            window.clearTimeout(timeout);
            video.removeEventListener("loadedmetadata", onReady);
            video.removeEventListener("canplay", onReady);
            video.removeEventListener("playing", onReady);
          };
          timeout = window.setTimeout(() => {
            cleanup();
            reject(
              new Error(
                "Camera failed to initialize in time. Please close and reopen the camera.",
              ),
            );
          }, CAMERA_READY_TIMEOUT_MS);
          video.addEventListener("loadedmetadata", onReady);
          video.addEventListener("canplay", onReady);
          video.addEventListener("playing", onReady);
          onReady();
        });
      }

      setCameraReady(true);
    } catch (err) {
      stream?.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
      setCameraOpen(false);
      setCameraReady(false);
      const msg = err instanceof Error ? err.message : "Camera unavailable";
      setCameraError(
        msg.includes("Permission")
          ? "Camera permission denied. Allow access in browser settings."
          : `Camera unavailable: ${msg}`,
      );
    }
  };

  const capturePhoto = () => {
    const video = videoRef.current;
    if (!video || !streamRef.current) {
      setCameraError("Camera is not active. Reopen camera and try again.");
      return;
    }

    if (
      !cameraReady ||
      !isVideoFrameReady(video) ||
      video.readyState < HTMLMediaElement.HAVE_CURRENT_DATA
    ) {
      setCameraError("Camera is still initializing. Wait for preview, then tap Capture.");
      return;
    }

    const canvas = document.createElement("canvas");
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    const ctx = canvas.getContext("2d");
    if (!ctx) {
      setCameraError("Failed to capture photo. Please try again.");
      return;
    }
    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
    canvas.toBlob(
      (blob) => {
        if (!blob) {
          setCameraError("Failed to capture photo. Please try again.");
          return;
        }
        setCameraError(null);
        const file = new File([blob], `photo-${Date.now()}.jpg`, { type: "image/jpeg" });
        setPhotoFile(file);
        stopCamera();
      },
      "image/jpeg",
      0.92,
    );
  };

  const resetForm = () => {
    if (form) setData(buildInitialData(form.fields));
    setPhotoFile(null);
  };

  const setFieldValue = (fid: string, value: FieldValue) =>
    setData((d) => ({ ...d, [fid]: value }));

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    setLastSubmitted(null);
    if (!id || !form) return;

    setSubmitting(true);
    try {
      let photoKey: string | undefined;

      if (photoFile) {
        setUploadProgress("Compressing photo…");
        const blob = await compressImage(photoFile);

        setUploadProgress("Uploading photo…");
        const presign = await attendanceApi.presignPhoto(id, {
          contentType: "image/jpeg",
          sizeBytes: blob.size,
        });
        await uploadToPresignedUrl(presign.uploadUrl, blob);
        photoKey = presign.key;
      }

      setUploadProgress("Saving entry…");
      const coerced: Record<string, string | number | boolean | null> = {};
      for (const f of form.fields) {
        const raw = data[f.id];
        if (raw === "" || raw === undefined) {
          coerced[f.id] = null;
        } else if (f.type === "number") {
          coerced[f.id] = Number(raw);
        } else {
          coerced[f.id] = raw;
        }
      }

      await attendanceApi.submit(id, {
        formDefinitionId: form.id,
        data: coerced,
        photoKey,
      });

      setLastSubmitted(new Date().toLocaleTimeString());
      resetForm();
    } catch (err) {
      if (err instanceof ApiClientError) {
        const details = err.details as Record<string, string> | undefined;
        if (details && typeof details === "object") {
          setError(
            Object.entries(details)
              .map(([k, v]) => `${k}: ${v}`)
              .join(", "),
          );
        } else {
          setError(err.message);
        }
      } else {
        setError("Submission failed");
      }
    } finally {
      setSubmitting(false);
      setUploadProgress(null);
    }
  };

  if (loading) {
    return <div className="p-8 text-center text-muted-foreground">Loading…</div>;
  }

  if (!form) {
    return (
      <div className="max-w-md mx-auto p-6 text-center space-y-4">
        <h2 className="text-lg font-semibold">No form configured</h2>
        <p className="text-sm text-muted-foreground">
          Ask the admin to build an attendance form first.
        </p>
        <Link to="/dashboard" className="text-primary hover:underline text-sm">
          Back to dashboard
        </Link>
      </div>
    );
  }

  return (
    <div className="max-w-2xl mx-auto space-y-6 animate-in fade-in" data-form-key={fieldsLabel}>
      {/* Header Banner Tile */}
      <div className="rounded-3xl bg-brand-gradient-tile p-6 md:p-8 text-white shadow-lg space-y-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Link
              to="/dashboard"
              className="inline-flex items-center justify-center w-8 h-8 rounded-xl bg-white/15 text-white hover:bg-white/25 backdrop-blur-md transition-colors"
            >
              <ArrowLeft className="w-4 h-4" />
            </Link>
            <span className="px-3 py-1 rounded-full text-xs font-semibold bg-white/15 backdrop-blur-md text-white border border-white/20">
              Form v{form.version} · {user ? ROLE_LABELS[user.role] : "User"} Workflow
            </span>
          </div>
        </div>

        <h1 className="text-2xl md:text-3xl font-bold font-display text-white tracking-tight">
          Submit Attendance Record
        </h1>
        <p className="text-xs text-white/80 leading-relaxed">
          Record attendee details and optional GPS geotag photo evidence on behalf of participants for {room?.title || "this event"}.
        </p>
      </div>

      {windowCheck && (
        <div
          className={`rounded-lg border p-4 text-sm flex items-start gap-3 transition-all ${
            windowCheck.isAllowed
              ? windowCheck.status === "live"
                ? "bg-emerald-500/10 text-emerald-700 border-emerald-500/20"
                : "bg-amber-500/10 text-amber-700 border-amber-500/20"
              : "bg-status-cancelled-bg text-(--color-error) border-(--color-gray-200)"
          }`}
        >
          {windowCheck.isAllowed ? (
            <Clock className="w-5 h-5 mt-0.5 shrink-0" />
          ) : (
            <AlertTriangle className="w-5 h-5 mt-0.5 shrink-0" />
          )}
          <div className="space-y-1">
            <span className="font-bold block">
              {windowCheck.isAllowed
                ? windowCheck.status === "live"
                  ? "Attendance Window Active"
                  : "Attendance Window Closing Soon"
                : "Attendance Window Closed"}
            </span>
            <p className="text-xs opacity-90 leading-relaxed">{windowCheck.message}</p>
          </div>
        </div>
      )}

      <form onSubmit={onSubmit} className="space-y-4">
        {form.fields.map((f) => (
          <div key={f.id} className="space-y-1.5">
            {f.type !== "checkbox" && (
              <Label htmlFor={f.id} className="text-sm font-semibold">
                {f.label}
                {f.required && <span className="text-destructive"> *</span>}
              </Label>
            )}

            {f.type === "text" && (
              <Input
                id={f.id}
                value={(data[f.id] as string) ?? ""}
                onChange={(e) => setFieldValue(f.id, e.target.value)}
                placeholder={f.placeholder || `Enter ${f.label.toLowerCase()}…`}
                required={f.required}
                disabled={submitting || !windowCheck?.isAllowed}
              />
            )}
            {f.type === "email" && (
              <Input
                id={f.id}
                type="email"
                inputMode="email"
                value={(data[f.id] as string) ?? ""}
                onChange={(e) => setFieldValue(f.id, e.target.value)}
                placeholder={f.placeholder || "example@domain.com"}
                required={f.required}
                disabled={submitting || !windowCheck?.isAllowed}
              />
            )}
            {f.type === "phone" && (
              <Input
                id={f.id}
                type="tel"
                inputMode="tel"
                value={(data[f.id] as string) ?? ""}
                onChange={(e) => setFieldValue(f.id, e.target.value)}
                placeholder={f.placeholder || "+1 (555) 000-0000"}
                required={f.required}
                disabled={submitting || !windowCheck?.isAllowed}
              />
            )}
            {f.type === "number" && (
              <Input
                id={f.id}
                type="number"
                inputMode="numeric"
                value={(data[f.id] as string) ?? ""}
                onChange={(e) => setFieldValue(f.id, e.target.value)}
                placeholder={f.placeholder || "0"}
                required={f.required}
                disabled={submitting || !windowCheck?.isAllowed}
              />
            )}
            {f.type === "date" && (
              <div className="relative">
                <div className="absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none text-(--color-gray-600)">
                  <Calendar className="w-4 h-4" />
                </div>
                <Input
                  id={f.id}
                  type="date"
                  value={(data[f.id] as string) ?? ""}
                  onChange={(e) => setFieldValue(f.id, e.target.value)}
                  placeholder={f.placeholder}
                  required={f.required}
                  disabled={submitting || !windowCheck?.isAllowed}
                  className="pl-10"
                />
              </div>
            )}
            {f.type === "select" && (
              <select
                id={f.id}
                value={(data[f.id] as string) ?? ""}
                onChange={(e) => setFieldValue(f.id, e.target.value)}
                required={f.required}
                disabled={submitting || !windowCheck?.isAllowed}
                className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-50 disabled:cursor-not-allowed"
              >
                <option value="">Select option…</option>
                {(f.options ?? []).map((opt) => (
                  <option key={opt} value={opt}>
                    {opt}
                  </option>
                ))}
              </select>
            )}
            {f.type === "checkbox" && (
              <label className={`flex items-start gap-2.5 text-sm select-none py-1 ${submitting || !windowCheck?.isAllowed ? "opacity-50 cursor-not-allowed" : "cursor-pointer"}`}>
                <input
                  id={f.id}
                  type="checkbox"
                  checked={(data[f.id] as boolean) ?? false}
                  onChange={(e) => setFieldValue(f.id, e.target.checked)}
                  disabled={submitting || !windowCheck?.isAllowed}
                  className="w-4 h-4 mt-0.5 rounded border-gray-300 text-primary focus:ring-primary disabled:cursor-not-allowed"
                />
                <div className="space-y-0.5">
                  <span className="font-semibold text-foreground">
                    {f.label}
                    {f.required && <span className="text-destructive"> *</span>}
                  </span>
                  {f.helpText && (
                    <p className="text-xs text-muted-foreground">{f.helpText}</p>
                  )}
                </div>
              </label>
            )}

            {f.helpText && f.type !== "checkbox" && (
              <p className="text-xs text-muted-foreground/80 pl-0.5">{f.helpText}</p>
            )}
          </div>
        ))}

        <div className="space-y-2">
          <Label className="text-sm">Proof photo (optional)</Label>

          {cameraOpen && (
            <div className="space-y-2">
              <video
                ref={videoRef}
                autoPlay
                playsInline
                muted
                className="w-full max-h-64 object-contain rounded-md border border-border bg-black"
              />
              <div className="flex gap-2">
                <Button
                  type="button"
                  onClick={capturePhoto}
                  className="flex-1"
                  disabled={!cameraReady}
                >
                  <Camera className="w-4 h-4" />
                  {cameraReady ? "Capture" : "Preparing camera…"}
                </Button>
                <Button type="button" variant="outline" onClick={stopCamera}>
                  <X className="w-4 h-4" />
                  Cancel
                </Button>
              </div>
            </div>
          )}

          {!cameraOpen && photoFile && photoPreview && (
            <div className="space-y-2">
              <img
                src={photoPreview}
                alt="preview"
                className="w-full max-h-48 object-contain rounded-md border border-border"
              />
              <div className="flex gap-2">
                <Button
                  type="button"
                  variant="outline"
                  size="md"
                  onClick={openCamera}
                  className="flex-1"
                >
                  <RefreshCw className="w-4 h-4" />
                  Retake
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  size="md"
                  onClick={() => setPhotoFile(null)}
                >
                  <X className="w-4 h-4" />
                  Remove
                </Button>
              </div>
            </div>
          )}

          {!cameraOpen && !photoFile && (
            <Button
              type="button"
              variant="outline"
              size="md"
              onClick={openCamera}
              className="w-full"
              disabled={submitting || !windowCheck?.isAllowed}
            >
              <Camera className="w-4 h-4" />
              Open camera
            </Button>
          )}

          {cameraError && (
            <p className="text-xs text-destructive">{cameraError}</p>
          )}
        </div>

        {error && (
          <div className="p-3 rounded-md bg-status-cancelled-bg text-(--color-error) text-sm border border-(--color-gray-200)">
            {error}
          </div>
        )}
        {lastSubmitted && !error && (
          <div className="p-3 rounded-md bg-status-live-bg text-status-live text-sm border border-(--color-gray-200) flex items-center gap-2">
            <Check className="w-4 h-4" />
            Submitted at {lastSubmitted}
          </div>
        )}

        <Button type="submit" disabled={submitting || !windowCheck?.isAllowed} className="w-full bg-brand-gradient h-11 rounded-xl text-sm font-semibold shadow-md hover:shadow-lg transition-all" size="lg">
          {submitting ? (
            <>
              <Loader2 className="w-4 h-4 animate-spin" />
              {uploadProgress ?? "Submitting…"}
            </>
          ) : (
            "Submit Attendance Record"
          )}
        </Button>
      </form>
    </div>
  );
};
