import { useCallback, useEffect, useMemo, useState } from "react";
import { Plus, RefreshCcw } from "lucide-react";
import { hasRolePermission, type EventAdminAssignment, type EventRoom, type OrgUserSummary } from "@application/shared";
import { ApiClientError, eventAssignmentsApi, roomsApi } from "@/lib/api";
import { useAuth } from "@/hooks/useAuth";
import { useToast } from "@/hooks/useToast";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardTitle, CardDescription } from "@/components/ui/card";

export const EventAssignments = () => {
  const { user } = useAuth();
  const { toast } = useToast();
  const [users, setUsers] = useState<OrgUserSummary[]>([]);
  const [rooms, setRooms] = useState<EventRoom[]>([]);
  const [assignments, setAssignments] = useState<EventAdminAssignment[]>([]);
  const [selectedUserId, setSelectedUserId] = useState("");
  const [selectedRoomId, setSelectedRoomId] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [assignmentRoomDrafts, setAssignmentRoomDrafts] = useState<Record<string, string>>({});

  const canManageUsers = user ? hasRolePermission(user.role, "manage_users") : false;

  const eventAdminCandidates = useMemo(
    () => users.filter((u) => u.role === "event_admin" || u.role === "volunteer"),
    [users],
  );

  const load = useCallback(async () => {
    setError(null);
    try {
      const [usersRes, roomsRes, assignmentsRes] = await Promise.all([
        eventAssignmentsApi.listUsers(),
        roomsApi.list(),
        eventAssignmentsApi.listAssignments(),
      ]);
      setUsers(usersRes.items);
      setRooms(roomsRes.items);
      setAssignments(assignmentsRes.items);
      setAssignmentRoomDrafts(
        Object.fromEntries(assignmentsRes.items.map((assignment) => [assignment.id, assignment.roomId])),
      );
    } catch (err) {
      setError(err instanceof ApiClientError ? err.message : "Failed to load assignment data");
    }
  }, []);

  useEffect(() => {
    if (!canManageUsers) return;
    void load();
  }, [canManageUsers, load]);

  const assign = async () => {
    if (!selectedUserId || !selectedRoomId) return;
    setPending(true);
    try {
      await eventAssignmentsApi.create({ userId: selectedUserId, roomId: selectedRoomId });
      setSelectedUserId("");
      setSelectedRoomId("");
      toast("Event admin assigned successfully", "success");
      await load();
    } catch (err) {
      toast(err instanceof ApiClientError ? err.message : "Assignment failed", "error");
    } finally {
      setPending(false);
    }
  };

  const updateRoom = async (assignmentId: string) => {
    const roomId = assignmentRoomDrafts[assignmentId];
    if (!roomId) return;
    setPending(true);
    try {
      await eventAssignmentsApi.update(assignmentId, { roomId });
      toast("Assignment updated", "success");
      await load();
    } catch (err) {
      toast(err instanceof ApiClientError ? err.message : "Failed to update assignment", "error");
    } finally {
      setPending(false);
    }
  };

  const revoke = async (assignmentId: string) => {
    setPending(true);
    try {
      await eventAssignmentsApi.revoke(assignmentId);
      toast("Assignment revoked", "success");
      await load();
    } catch (err) {
      toast(err instanceof ApiClientError ? err.message : "Failed to revoke assignment", "error");
    } finally {
      setPending(false);
    }
  };

  if (!canManageUsers) {
    return (
      <Card className="card-static">
        <CardContent className="p-6 text-sm text-(--color-gray-500)">
          You do not have access to assignment management.
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-3xl font-bold tracking-tight font-display text-(--color-gray-900)">Event Assignments</h2>
        <p className="text-gray-400 mt-1">
          Manage live sessions and assign team members for {user?.organizationName || "your organization"}
        </p>
      </div>

      {error && (
        <Card className="bg-status-cancelled-bg">
          <CardContent className="pt-6">
            <p className="text-status-cancelled text-sm">{error}</p>
          </CardContent>
        </Card>
      )}

      <Card className="card-static rounded-2xl border-purple-100 shadow-xs">
        <CardContent className="p-5 space-y-3">
          <h3 className="text-xs font-semibold uppercase tracking-wider text-purple-900 font-display">Assign Team Member To Event</h3>
          <div className="grid gap-3 md:grid-cols-3">
            <select
              className="h-10 rounded-xl border border-gray-200 bg-white px-3 text-sm text-gray-900 focus:ring-2 focus:ring-purple-600 focus:outline-none"
              value={selectedUserId}
              onChange={(e) => setSelectedUserId(e.target.value)}
            >
              <option value="">Select team member...</option>
              {eventAdminCandidates.map((candidate) => (
                <option key={candidate.id} value={candidate.id}>
                  {candidate.fullName} ({candidate.email}) — {candidate.role}
                </option>
              ))}
            </select>
            <select
              className="h-10 rounded-xl border border-gray-200 bg-white px-3 text-sm text-gray-900 focus:ring-2 focus:ring-purple-600 focus:outline-none"
              value={selectedRoomId}
              onChange={(e) => setSelectedRoomId(e.target.value)}
            >
              <option value="">Select target event room...</option>
              {rooms.map((room) => (
                <option key={room.id} value={room.id}>
                  {room.title}
                </option>
              ))}
            </select>
            <Button disabled={pending || !selectedUserId || !selectedRoomId} onClick={assign} className="bg-brand-gradient h-10 rounded-xl font-semibold shadow-xs">
              <Plus className="w-4 h-4 mr-1" />
              Assign Admin
            </Button>
          </div>
        </CardContent>
      </Card>

      <Card className="card-static rounded-2xl">
        <CardContent className="p-5 space-y-4">
          <h3 className="text-xs font-semibold uppercase tracking-wider text-gray-400 font-display">Active Event Assignments</h3>
          <div className="space-y-3">
            {assignments.length === 0 ? (
              <p className="text-sm text-gray-400 py-6 text-center border border-dashed border-gray-200 rounded-xl">No active assignments configured.</p>
            ) : (
              assignments.map((assignment) => (
                <div key={assignment.id} className="p-4 rounded-xl border border-gray-200 bg-white hover:border-purple-200 transition-all flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                  <div className="space-y-1">
                    <div className="flex items-center gap-2">
                      <span className="font-semibold text-gray-900 font-display text-sm">{assignment.user.fullName}</span>
                      <span className="px-2 py-0.5 rounded-full text-[11px] font-semibold bg-purple-50 text-purple-700 border border-purple-100">
                        {assignment.user.role}
                      </span>
                    </div>
                    <p className="text-xs text-gray-400">{assignment.user.email}</p>
                    <div className="flex items-center gap-2 text-xs pt-1">
                      <span className="text-gray-500 font-medium">Assigned Event:</span>
                      <span className="font-semibold text-purple-900 bg-purple-50 px-2 py-0.5 rounded-md border border-purple-100">{assignment.room.title}</span>
                      <span className={`px-2 py-0.5 rounded-full text-[10px] font-semibold ${
                        assignment.revokedAt ? "bg-red-50 text-red-600 border border-red-100" : "bg-emerald-50 text-emerald-700 border border-emerald-100"
                      }`}>
                        {assignment.revokedAt ? "Revoked" : "Active"}
                      </span>
                    </div>
                  </div>
                  <div className="flex flex-wrap items-center gap-2 shrink-0">
                    <select
                      className="h-9 rounded-xl border border-gray-200 bg-white px-2.5 text-xs text-gray-700 focus:outline-none focus:ring-1 focus:ring-purple-600"
                      value={assignmentRoomDrafts[assignment.id] ?? assignment.roomId}
                      onChange={(e) =>
                        setAssignmentRoomDrafts((prev) => ({ ...prev, [assignment.id]: e.target.value }))
                      }
                      disabled={pending}
                    >
                      {!rooms.some((room) => room.id === assignment.roomId) && (
                        <option value={assignment.roomId}>{assignment.room.title} (archived)</option>
                      )}
                      {rooms.map((room) => (
                        <option key={room.id} value={room.id}>
                          {room.title}
                        </option>
                      ))}
                    </select>
                    <Button
                      variant="outline"
                      size="sm"
                      disabled={pending}
                      onClick={() => updateRoom(assignment.id)}
                      className="h-9 rounded-xl border-gray-200 text-gray-700 text-xs"
                    >
                      <RefreshCcw className="w-3.5 h-3.5 mr-1" />
                      Update
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      className="h-9 rounded-xl text-red-600 border-red-200 hover:bg-red-50 text-xs"
                      disabled={pending || Boolean(assignment.revokedAt)}
                      onClick={() => revoke(assignment.id)}
                    >
                      Revoke
                    </Button>
                  </div>
                </div>
              ))
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  );
};
