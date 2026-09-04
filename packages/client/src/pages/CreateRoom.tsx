import { useState, type FormEvent } from "react";
import { useNavigate, Link } from "react-router-dom";
import { ArrowLeft, Loader2, Plus, Trash2, Camera, ClipboardList, MapPin, Navigation } from "lucide-react";
import { roomsApi, ApiClientError } from "@/lib/api";
import { CreateRoomSchema, hasRolePermission } from "@application/shared";
import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardFooter } from "@/components/ui/card";
import { DateTimePicker } from "@/components/ui/date-time-picker";

export const CreateRoom = () => {
  const navigate = useNavigate();
  const { user } = useAuth();
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Form State
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [location, setLocation] = useState("");
  const [latitude, setLatitude] = useState<number | undefined>();
  const [longitude, setLongitude] = useState<number | undefined>();
  const [locating, setLocating] = useState(false);
  const [scheduledStart, setScheduledStart] = useState<Date | null>(null);
  const [scheduledEnd, setScheduledEnd] = useState<Date | null>(null);
  const [maxParticipants, setMaxParticipants] = useState("");
  const [attendanceWindowBefore, setAttendanceWindowBefore] = useState("15");
  const [attendanceWindowAfter, setAttendanceWindowAfter] = useState("30");
  const [notifyEmailOnStart, setNotifyEmailOnStart] = useState(false);

  // Activities State
  const [activityDefinitions, setActivityDefinitions] = useState<{ id: string; title: string; description?: string; min_photos: number }[]>([]);

  const handleGetGPS = () => {
    if (!navigator.geolocation) {
      setError("Geolocation is not supported by your browser");
      return;
    }
    setLocating(true);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setLatitude(pos.coords.latitude);
        setLongitude(pos.coords.longitude);
        setLocating(false);
      },
      (err) => {
        setError(`GPS error: ${err.message}`);
        setLocating(false);
      },
      { enableHighAccuracy: true, timeout: 10000 }
    );
  };

  // Defensive programming: Verify permission even though routing layer already checks
  const canCreateRooms = user ? hasRolePermission(user.role, "manage_rooms") : false;

  if (!canCreateRooms) {
    return (
      <div className="mx-auto flex min-h-[50vh] max-w-lg items-center justify-center p-6">
        <div className="space-y-3 text-center">
          <h2 className="text-2xl font-semibold">Access Limited</h2>
          <p className="text-sm text-muted-foreground">
            Your role does not have permission to create rooms. Only Admins and Event Admins can create new event rooms.
          </p>
          <Link
            to="/dashboard"
            className="inline-block text-sm font-medium text-primary hover:underline"
          >
            Return to dashboard
          </Link>
        </div>
      </div>
    );
  }

  const addActivity = () => {
    setActivityDefinitions(prev => [
      ...prev,
      {
        id: `act_${crypto.randomUUID()}`,
        title: "",
        description: "",
        min_photos: 1,
      }
    ]);
  };

  const updateActivity = (id: string, field: "title" | "description" | "min_photos", value: any) => {
    setActivityDefinitions(prev => prev.map(act => {
      if (act.id === id) {
        return {
          ...act,
          [field]: field === "min_photos" ? (value === "" ? 0 : parseInt(value, 10)) : value
        };
      }
      return act;
    }));
  };

  const deleteActivity = (id: string) => {
    setActivityDefinitions(prev => prev.filter(act => act.id !== id));
  };

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);

    // Validate using Zod schema
    const parsed = CreateRoomSchema.safeParse({
      title,
      description: description || undefined,
      location: location || undefined,
      latitude,
      longitude,
      // Straight from the picked Date — never re-parsed from a formatted
      // string, which is where a timezone shift would creep in.
      scheduledStart: scheduledStart ? scheduledStart.toISOString() : "",
      scheduledEnd: scheduledEnd ? scheduledEnd.toISOString() : "",
      maxParticipants: maxParticipants ? parseInt(maxParticipants, 10) : undefined,
      attendanceWindowBefore: attendanceWindowBefore ? parseInt(attendanceWindowBefore, 10) : undefined,
      attendanceWindowAfter: attendanceWindowAfter ? parseInt(attendanceWindowAfter, 10) : undefined,
      notifyEmailOnStart,
      activityDefinitions: activityDefinitions.length > 0 ? activityDefinitions.map(a => ({
        id: a.id,
        title: a.title,
        description: a.description || undefined,
        min_photos: a.min_photos,
      })) : undefined,
    });

    if (!parsed.success) {
      setError(parsed.error.issues[0]?.message ?? "Invalid input");
      return;
    }

    setSubmitting(true);
    try {
      await roomsApi.create(parsed.data);
      navigate("/dashboard");
    } catch (err) {
      setError(err instanceof ApiClientError ? err.message : "Failed to create room");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="max-w-2xl mx-auto space-y-6">
      <div className="flex items-center gap-4">
        <Link
          to="/dashboard"
          className="inline-flex items-center justify-center w-10 h-10 rounded-lg text-foreground hover:bg-muted transition-colors shrink-0 -ml-2"
        >
          <ArrowLeft className="w-5 h-5" />
        </Link>
        <div>
          <h2 className="text-2xl font-bold tracking-tight font-display text-(--color-gray-900)">Create New Room</h2>
          <p className="text-sm text-muted-foreground">
            Set up a new event or webinar room for {user?.organizationName || "your organization"}.
          </p>
        </div>
      </div>

      <Card className="card-static rounded-2xl">
        <form onSubmit={onSubmit}>
          <CardContent className="space-y-6 pt-6">
            <div className="space-y-2">
              <Label htmlFor="title">Event Title <span className="text-destructive">*</span></Label>
              <Input
                id="title"
                placeholder="e.g. Annual Community Health & Finance Mela"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                disabled={submitting}
                required
                className="input-premium"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="description">Event Description <span className="text-muted-foreground font-normal">(optional)</span></Label>
              <textarea
                id="description"
                placeholder="Describe the objective, key agenda, target audience, and instructions for volunteers..."
                rows={3}
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                disabled={submitting}
                className="w-full rounded-xl border border-input bg-background p-3 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-purple-600 focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50 transition-all resize-y min-h-24"
              />
              <p className="text-[11px] text-muted-foreground flex justify-between">
                <span>Provide context to help attendees and volunteers understand the scope.</span>
                <span>{description.length}/1000</span>
              </p>
            </div>
            
            <div className="space-y-2">
              <Label htmlFor="location">Event Location & Geo-Pinning <span className="text-muted-foreground font-normal">(optional)</span></Label>
              <div className="flex gap-2">
                <div className="relative flex-1">
                  <div className="absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none text-muted-foreground">
                    <MapPin className="w-4 h-4" />
                  </div>
                  <Input
                    id="location"
                    placeholder="e.g. City Hall Auditorium, 123 Main St, New York"
                    value={location}
                    onChange={(e) => setLocation(e.target.value)}
                    disabled={submitting}
                    className="pl-10 input-premium"
                  />
                </div>
                <Button
                  type="button"
                  variant="outline"
                  onClick={handleGetGPS}
                  disabled={locating || submitting}
                  className="flex items-center gap-1.5 shrink-0"
                  title="Capture current GPS coordinates"
                >
                  {locating ? <Loader2 className="w-4 h-4 animate-spin text-primary" /> : <Navigation className="w-4 h-4 text-purple-600" />}
                  <span className="hidden sm:inline text-xs font-semibold">Get GPS</span>
                </Button>
              </div>

              {latitude !== undefined && longitude !== undefined && (
                <div className="flex items-center gap-2 p-2.5 rounded-xl bg-purple-50/60 border border-purple-200/80 text-xs text-purple-900 animate-in fade-in">
                  <MapPin className="w-4 h-4 text-purple-600 shrink-0" />
                  <div className="flex-1 font-mono text-[11px]">
                    Pinned Coordinates: <strong className="text-purple-950">{latitude.toFixed(6)}, {longitude.toFixed(6)}</strong>
                  </div>
                  <a
                    href={`https://www.openstreetmap.org/?mlat=${latitude}&mlon=${longitude}#map=16/${latitude}/${longitude}`}
                    target="_blank"
                    rel="noreferrer"
                    className="text-[11px] font-semibold text-purple-700 hover:underline"
                  >
                    View Map ↗
                  </a>
                </div>
              )}
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div className="space-y-2">
                <Label htmlFor="scheduledStart">Start Time <span className="text-destructive">*</span></Label>
                <DateTimePicker
                  id="scheduledStart"
                  value={scheduledStart}
                  onChange={setScheduledStart}
                  disabled={submitting}
                  required
                  placeholder="Select start date and time"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="scheduledEnd">End Time <span className="text-destructive">*</span></Label>
                <DateTimePicker
                  id="scheduledEnd"
                  value={scheduledEnd}
                  onChange={setScheduledEnd}
                  disabled={submitting}
                  required
                  placeholder="Select end date and time"
                  // An end before its start is the most common mis-entry here;
                  // the picker refuses it rather than the server rejecting it.
                  minDate={scheduledStart}
                />
              </div>
            </div>

            {/* Attendance Window Configuration  */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div className="space-y-2">
                <Label htmlFor="attendanceWindowBefore">Early Submission Buffer (Minutes)</Label>
                <Input
                  id="attendanceWindowBefore"
                  type="number"
                  min="0"
                  placeholder="30"
                  value={attendanceWindowBefore}
                  onChange={(e) => setAttendanceWindowBefore(e.target.value)}
                  disabled={submitting}
                  className="input-premium"
                />
                <p className="text-xs text-muted-foreground">
                  Minutes before start time that attendance can be taken (default 15).
                </p>
              </div>
              <div className="space-y-2">
                <Label htmlFor="attendanceWindowAfter">Late Submission Buffer (Minutes)</Label>
                <Input
                  id="attendanceWindowAfter"
                  type="number"
                  min="0"
                  placeholder="30"
                  value={attendanceWindowAfter}
                  onChange={(e) => setAttendanceWindowAfter(e.target.value)}
                  disabled={submitting}
                  className="input-premium"
                />
                <p className="text-xs text-muted-foreground">
                  Minutes after event ends that attendance can still be taken (default 30).
                </p>
              </div>
            </div>

            {/* Email on start opt-in */}
            <div className="flex items-center justify-between rounded-lg border border-input p-4">
              <div>
                <Label htmlFor="notifyEmailOnStart">Email staff when this event goes live</Label>
                <p className="text-xs text-muted-foreground">
                  In-app and push notifications always go out on start — enable this to also email event staff.
                </p>
              </div>
              <input
                id="notifyEmailOnStart"
                type="checkbox"
                checked={notifyEmailOnStart}
                onChange={(e) => setNotifyEmailOnStart(e.target.checked)}
                disabled={submitting}
                className="w-5 h-5 rounded accent-purple-600 cursor-pointer"
              />
            </div>

            {/* Max Participants Configuration */}
            <div className="space-y-2">
              <Label htmlFor="maxParticipants">Max Online Participants <span className="text-muted-foreground font-normal">(optional)</span></Label>
              <Input
                id="maxParticipants"
                type="number"
                min="1"
                max="10000"
                placeholder="Leave empty for unlimited"
                value={maxParticipants}
                onChange={(e) => setMaxParticipants(e.target.value)}
                disabled={submitting}
                className="input-premium"
              />
            </div>

            {/* Activity Quality Checklist */}
            <div className="space-y-4 border-t border-border pt-6">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                <div>
                  <h3 className="text-base font-semibold">Activity Quality Checklist</h3>
                  <p className="text-xs text-muted-foreground">
                    Define activities that volunteers must complete and prove with photo uploads before this event is finalized.
                  </p>
                </div>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={addActivity}
                  className="inline-flex items-center gap-1.5 self-start h-8 text-xs"
                >
                  <Plus className="w-3.5 h-3.5" />
                  Add Activity
                </Button>
              </div>

              {activityDefinitions.length === 0 ? (
                <div className="flex flex-col items-center justify-center p-6 rounded-lg border border-dashed border-muted-foreground/20 bg-muted/5 text-center space-y-4">
                  <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center text-primary">
                    <ClipboardList className="w-5 h-5" />
                  </div>
                  <div className="space-y-1 max-w-sm">
                    <h4 className="font-semibold text-xs text-foreground">No Mandatory Activities</h4>
                    <p className="text-[11px] text-muted-foreground leading-normal">
                      We highly recommend adding at least one activity to track field success. Use our templates to get started quickly:
                    </p>
                  </div>
                  
                  <div className="flex flex-wrap gap-2 justify-center pt-1">
                    <button
                      type="button"
                      onClick={() => setActivityDefinitions([
                        {
                          id: `act_${crypto.randomUUID()}`,
                          title: "Group photo with event banner",
                          description: "Take a wide shot showing the volunteer banner and multiple participants in the room.",
                          min_photos: 1,
                        }
                      ])}
                      className="inline-flex items-center gap-1.5 px-3 py-1.5 text-[11px] font-medium bg-background border border-border hover:bg-muted/50 rounded-full transition-colors"
                    >
                      <Camera className="w-3 h-3 text-purple-600" />
                      Banner & Group Photo (1 proof)
                    </button>
                    <button
                      type="button"
                      onClick={() => setActivityDefinitions([
                        {
                          id: `act_${crypto.randomUUID()}`,
                          title: "Physical registration logs",
                          description: "Clear close-up photograph of the paper attendee signup sheet containing signatures.",
                          min_photos: 2,
                        }
                      ])}
                      className="inline-flex items-center gap-1.5 px-3 py-1.5 text-[11px] font-medium bg-background border border-border hover:bg-muted/50 rounded-full transition-colors"
                    >
                      <Camera className="w-3 h-3 text-purple-600" />
                      Attendee Logs (2 proofs)
                    </button>
                  </div>
                </div>
              ) : (
                <div className="space-y-4">
                  {activityDefinitions.map((act, index) => (
                    <div
                      key={act.id}
                      className="group relative flex flex-col md:flex-row gap-4 p-4 rounded-lg border border-border bg-card hover:border-primary/20 transition-all duration-200 shadow-sm"
                    >
                      {/* Badge indicator/number */}
                      <div className="absolute top-4 right-4 flex items-center gap-2 md:relative md:top-auto md:right-auto md:self-start">
                        <span className="flex items-center justify-center w-6 h-6 rounded-full bg-primary/10 text-primary text-xs font-bold md:mt-1">
                          {index + 1}
                        </span>
                      </div>

                      {/* Inputs */}
                      <div className="flex-1 space-y-3">
                        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                          <div className="sm:col-span-2 space-y-1.5">
                            <Label htmlFor={`act-title-${act.id}`} className="text-xs font-semibold">Activity Title <span className="text-destructive">*</span></Label>
                            <Input
                              id={`act-title-${act.id}`}
                              placeholder="e.g. Photo with distribution materials"
                              value={act.title}
                              onChange={(e) => updateActivity(act.id, "title", e.target.value)}
                              disabled={submitting}
                              required
                              className="h-9 text-sm"
                            />
                          </div>
                          <div className="space-y-1.5">
                            <Label htmlFor={`act-min-photos-${act.id}`} className="text-xs font-semibold">Min Photo Proofs <span className="text-destructive">*</span></Label>
                            <Input
                              id={`act-min-photos-${act.id}`}
                              type="number"
                              min="1"
                              max="10"
                              value={act.min_photos}
                              onChange={(e) => updateActivity(act.id, "min_photos", e.target.value)}
                              disabled={submitting}
                              required
                              className="h-9 text-sm"
                            />
                          </div>
                        </div>

                        <div className="space-y-1.5">
                          <Label htmlFor={`act-desc-${act.id}`} className="text-xs font-semibold">Instructions / Description <span className="text-muted-foreground font-normal">(optional)</span></Label>
                          <textarea
                            id={`act-desc-${act.id}`}
                            placeholder="Add guidelines for volunteers uploading proofs..."
                            className="flex min-h-15 w-full rounded-md border border-input bg-background px-3 py-1.5 text-xs text-foreground placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                            value={act.description || ""}
                            onChange={(e) => updateActivity(act.id, "description", e.target.value)}
                            disabled={submitting}
                          />
                        </div>
                      </div>

                      {/* Actions */}
                      <div className="self-end md:self-center md:pt-4">
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon"
                          onClick={() => deleteActivity(act.id)}
                          className="h-9 w-9 text-muted-foreground hover:text-(--color-error) hover:bg-status-cancelled-bg transition-colors"
                          title="Delete Activity"
                        >
                          <Trash2 className="w-4 h-4" />
                        </Button>
                      </div>
                    </div>
                  ))}

                  <div className="flex justify-start">
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={addActivity}
                      className="inline-flex items-center gap-1.5 text-xs h-8"
                    >
                      <Plus className="w-3.5 h-3.5" />
                      Add Another Activity
                    </Button>
                  </div>
                </div>
              )}
            </div>

            {error && (
              <div className="p-3 rounded-md bg-status-cancelled-bg text-(--color-error) text-sm border border-(--color-gray-200)">
                {error}
              </div>
            )}
          </CardContent>
          
          <CardFooter className="flex justify-end gap-3 border-t border-border pt-6 bg-muted/20">
            <Link
              to="/dashboard"
              className="inline-flex items-center justify-center rounded-md px-4 h-10 text-sm font-medium text-foreground hover:bg-muted transition-colors"
            >
              Cancel
            </Link>
            <Button type="submit" disabled={submitting} className="min-w-30">
              {submitting ? (
                <>
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  Creating...
                </>
              ) : (
                "Create Room"
              )}
            </Button>
          </CardFooter>
        </form>
      </Card>
    </div>
  );
};
