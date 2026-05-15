import { useEffect, useMemo, useRef, useState, type FormEvent } from "react";
import { Link, useParams } from "react-router-dom";
import { ArrowLeft, Camera, Check, Loader2, RefreshCw, X } from "lucide-react";
import { ROLE_LABELS, type FormField, type FormDefinition } from "@application/shared";
import {
  ApiClientError,
  attendanceApi,
  formsApi,
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
    formsApi
      .get(id)
      .then((f) => {
        if (f) {
          setForm(f);
          setData(buildInitialData(f.fields));
        }
      })
      .catch((err) =>
        setError(err instanceof ApiClientError ? err.message : "Failed to load form"),
      )
      .finally(() => setLoading(false));
  }, [id]);

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
    <div className="max-w-md mx-auto p-3 sm:p-6 space-y-4" data-form-key={fieldsLabel}>
      <div className="flex items-center gap-2">
        <Link
          to="/dashboard"
          className="inline-flex items-center justify-center w-9 h-9 rounded-md text-foreground hover:bg-muted transition-colors shrink-0"
        >
          <ArrowLeft className="w-5 h-5" />
        </Link>
        <div className="min-w-0">
          <h2 className="text-lg font-bold truncate">Attendance</h2>
          <p className="text-xs text-muted-foreground">
            Form v{form.version} · {user ? ROLE_LABELS[user.role] : "User"} workflow
          </p>
        </div>
      </div>

      <div className="rounded-md border border-border bg-muted/40 p-3 text-sm text-muted-foreground">
        Record attendance on behalf of village attendees during the live session. Volunteers can
        capture a supporting photo before submitting the attendance record.
      </div>

      <form onSubmit={onSubmit} className="space-y-4">
        {form.fields.map((f) => (
          <div key={f.id} className="space-y-1.5">
            <Label htmlFor={f.id} className="text-sm">
              {f.label}
              {f.required && <span className="text-destructive"> *</span>}
            </Label>

            {f.type === "text" && (
              <Input
                id={f.id}
                value={(data[f.id] as string) ?? ""}
                onChange={(e) => setFieldValue(f.id, e.target.value)}
                required={f.required}
              />
            )}
            {f.type === "email" && (
              <Input
                id={f.id}
                type="email"
                inputMode="email"
                value={(data[f.id] as string) ?? ""}
                onChange={(e) => setFieldValue(f.id, e.target.value)}
                required={f.required}
              />
            )}
            {f.type === "phone" && (
              <Input
                id={f.id}
                type="tel"
                inputMode="tel"
                value={(data[f.id] as string) ?? ""}
                onChange={(e) => setFieldValue(f.id, e.target.value)}
                required={f.required}
              />
            )}
            {f.type === "number" && (
              <Input
                id={f.id}
                type="number"
                inputMode="numeric"
                value={(data[f.id] as string) ?? ""}
                onChange={(e) => setFieldValue(f.id, e.target.value)}
                required={f.required}
              />
            )}
            {f.type === "select" && (
              <select
                id={f.id}
                value={(data[f.id] as string) ?? ""}
                onChange={(e) => setFieldValue(f.id, e.target.value)}
                required={f.required}
                className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
              >
                <option value="">Select…</option>
                {(f.options ?? []).map((opt) => (
                  <option key={opt} value={opt}>
                    {opt}
                  </option>
                ))}
              </select>
            )}
            {f.type === "checkbox" && (
              <label className="flex items-center gap-2 text-sm">
                <input
                  id={f.id}
                  type="checkbox"
                  checked={(data[f.id] as boolean) ?? false}
                  onChange={(e) => setFieldValue(f.id, e.target.checked)}
                  className="w-4 h-4"
                />
                {f.helpText ?? f.label}
              </label>
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
          <div className="p-3 rounded-md bg-destructive/10 text-destructive text-sm border border-destructive/20">
            {error}
          </div>
        )}
        {lastSubmitted && !error && (
          <div className="p-3 rounded-md bg-emerald-500/10 text-emerald-700 text-sm border border-emerald-500/20 flex items-center gap-2">
            <Check className="w-4 h-4" />
            Submitted at {lastSubmitted}
          </div>
        )}

        <Button type="submit" disabled={submitting} className="w-full" size="lg">
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
