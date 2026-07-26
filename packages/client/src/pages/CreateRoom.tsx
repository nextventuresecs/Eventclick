import { useState, type FormEvent } from "react";
import { useNavigate, Link } from "react-router-dom";
import { ArrowLeft, Calendar, Loader2, Plus, Trash2, Sparkles, ClipboardList } from "lucide-react";
import { roomsApi, ApiClientError } from "@/lib/api";
import { CreateRoomSchema, hasRolePermission } from "@application/shared";
import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardFooter } from "@/components/ui/card";

export const CreateRoom = () => {
  const navigate = useNavigate();
  const { user } = useAuth();
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Form State
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [scheduledStart, setScheduledStart] = useState("");
  const [scheduledEnd, setScheduledEnd] = useState("");
  const [maxParticipants, setMaxParticipants] = useState("");
  const [attendanceWindowBefore, setAttendanceWindowBefore] = useState("15");
  const [attendanceWindowAfter, setAttendanceWindowAfter] = useState("30");

  // Activities State
  const [activityDefinitions, setActivityDefinitions] = useState<{ id: string; title: string; description?: string; min_photos: number }[]>([]);

  // Defensive programming: Verify permission even though routing layer already checks
  const canCreateRooms = user ? hasRolePermission(user.role, "manage_rooms") : false;

  if (!canCreateRooms) {
    return (
      <div className="mx-auto flex min-h-[50vh] max-w-lg items-center justify-center p-6">
        <div className="space-y-3 text-center">
          <h2 className="text-2xl font-semibold">Access Limited</h2>
          <p className="text-sm text-muted-foreground">
            Your role does not have permission to create rooms. Only NGO Admins and Event Admins can create new event rooms.
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
      scheduledStart: scheduledStart ? new Date(scheduledStart).toISOString() : "",
      scheduledEnd: scheduledEnd ? new Date(scheduledEnd).toISOString() : "",
      maxParticipants: maxParticipants ? parseInt(maxParticipants, 10) : undefined,
      attendanceWindowBefore: attendanceWindowBefore ? parseInt(attendanceWindowBefore, 10) : undefined,
      attendanceWindowAfter: attendanceWindowAfter ? parseInt(attendanceWindowAfter, 10) : undefined,
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
                placeholder="e.g. Finance Mela"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                disabled={submitting}
                required
                className="input-premium"
              />
            </div>
            
            <div className="space-y-2">
              <Label htmlFor="description">Description <span className="text-muted-foreground font-normal">(optional)</span></Label>
              <textarea
                id="description"
                placeholder="Brief description of the event..."
                className="flex min-h-25 w-full rounded-md border border-input bg-background px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                disabled={submitting}
              />
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div className="space-y-2">
                <Label htmlFor="scheduledStart">Start Time <span className="text-destructive">*</span></Label>
                <div className="relative">
                  <div className="absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none text-(--color-gray-600)">
                    <Calendar className="w-4 h-4" />
                  </div>
                  <Input
                    id="scheduledStart"
                    type="datetime-local"
                    value={scheduledStart}
                    onChange={(e) => setScheduledStart(e.target.value)}
                    disabled={submitting}
                    required
                    className="pl-10 input-premium"
                  />
                </div>
              </div>
              <div className="space-y-2">
                <Label htmlFor="scheduledEnd">End Time <span className="text-destructive">*</span></Label>
                <div className="relative">
                  <div className="absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none text-(--color-gray-600)">
                    <Calendar className="w-4 h-4" />
                  </div>
                  <Input
                    id="scheduledEnd"
                    type="datetime-local"
                    value={scheduledEnd}
                    onChange={(e) => setScheduledEnd(e.target.value)}
                    disabled={submitting}
                    required
                    className="pl-10 input-premium"
                  />
                </div>
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
                      <Sparkles className="w-3 h-3 text-yellow-500" />
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
                      <Sparkles className="w-3 h-3 text-yellow-500" />
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
