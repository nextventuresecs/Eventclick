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

      <Card className="card-static rounded-2xl">
        <CardContent className="p-4 space-y-4">
          <div className="grid gap-3 md:grid-cols-3">
            <select
              className="h-10 rounded-lg border border-(--color-gray-200) bg-(--color-gray-50) px-3 text-sm text-(--color-gray-900)"
              value={selectedUserId}
              onChange={(e) => setSelectedUserId(e.target.value)}
            >
              <option value="">Select user</option>
              {eventAdminCandidates.map((candidate) => (
                <option key={candidate.id} value={candidate.id}>
                  {candidate.fullName} ({candidate.email}) — {candidate.role}
                </option>
              ))}
            </select>
            <select
              className="h-10 rounded-lg border border-(--color-gray-200) bg-(--color-gray-50) px-3 text-sm text-(--color-gray-900)"
              value={selectedRoomId}
              onChange={(e) => setSelectedRoomId(e.target.value)}
            >
              <option value="">Select event room</option>
              {rooms.map((room) => (
                <option key={room.id} value={room.id}>
                  {room.title}
                </option>
              ))}
            </select>
            <Button disabled={pending || !selectedUserId || !selectedRoomId} onClick={assign}>
              <Plus className="w-4 h-4 mr-1" />
              Assign
            </Button>
          </div>
        </CardContent>
      </Card>

      <Card className="card-static rounded-2xl">
        <CardContent className="p-4">
          <div className="space-y-3">
            {assignments.length === 0 ? (
              <p className="text-sm text-gray-400">No assignments yet.</p>
            ) : (
              assignments.map((assignment) => (
                <Card key={assignment.id} className="card-static rounded-xl">
                  <CardContent className="p-3 flex flex-col gap-3">
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <p className="text-sm font-semibold text-(--color-gray-900)">{assignment.user.fullName}</p>
                        <p className="text-xs text-gray-400">
                          {assignment.user.email} • {assignment.user.role}
                        </p>
                        <p className="text-xs text-gray-400 mt-1">
                          Room: <span className="font-medium text-gray-700">{assignment.room.title}</span>
                        </p>
                        <p className="text-xs text-gray-400">
                          Status: {assignment.revokedAt ? "revoked" : "active"}
                        </p>
                      </div>
                      <div className="flex gap-2 shrink-0">
                        <select
                          className="h-9 rounded-lg border border-(--color-gray-200) bg-(--color-surface) px-2 text-xs text-gray-700"
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
                          className="border-(--color-gray-200) text-(--color-gray-600)"
                        >
                          <RefreshCcw className="w-4 h-4 mr-1" />
                          Update
                        </Button>
                        <Button
                          variant="outline"
                          size="sm"
                          className="text-status-cancelled border-status-cancelled-bg hover:bg-status-cancelled-bg"
                          disabled={pending || Boolean(assignment.revokedAt)}
                          onClick={() => revoke(assignment.id)}
                        >
                          Revoke
                        </Button>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              ))
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  );
};
