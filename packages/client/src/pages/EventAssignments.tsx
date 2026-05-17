import { useCallback, useEffect, useMemo, useState } from "react";
import { hasRolePermission, type EventAdminAssignment, type EventRoom, type OrgUserSummary } from "@application/shared";
import { ApiClientError, eventAssignmentsApi, roomsApi } from "@/lib/api";
import { useAuth } from "@/hooks/useAuth";
import { useToast } from "@/hooks/useToast";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

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
      <Card>
        <CardContent className="p-6 text-sm text-muted-foreground">
          You do not have access to assignment management.
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>Assign Users to Rooms</CardTitle>
          <CardDescription>
            Select a user in {user?.organizationName || "your organization"} and assign them to an event room. Users only see rooms they are assigned to.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {error && <p className="text-sm text-destructive">{error}</p>}
          <div className="grid gap-3 md:grid-cols-3">
            <select
              className="h-10 rounded-md border border-input bg-background px-3 text-sm"
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
              className="h-10 rounded-md border border-input bg-background px-3 text-sm"
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
              Assign
            </Button>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Current Assignments</CardTitle>
          <CardDescription>Update room mapping or revoke access.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          {assignments.length === 0 ? (
            <p className="text-sm text-muted-foreground">No assignments yet.</p>
          ) : (
            assignments.map((assignment) => (
              <div
                key={assignment.id}
                className="grid gap-2 rounded-md border border-border p-3 md:grid-cols-[minmax(0,1fr)_220px_auto_auto]"
              >
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium">{assignment.user.fullName}</p>
                  <p className="truncate text-xs text-muted-foreground">
                    {assignment.user.email} • {assignment.user.role}
                  </p>
                  <p className="mt-1 text-xs text-muted-foreground">
                    Status: {assignment.revokedAt ? "revoked" : "active"}
                  </p>
                </div>
                <select
                  className="h-9 rounded-md border border-input bg-background px-2 text-sm"
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
                  disabled={pending}
                  onClick={() => updateRoom(assignment.id)}
                >
                  Update
                </Button>
                <Button
                  variant="outline"
                  className="text-destructive"
                  disabled={pending || Boolean(assignment.revokedAt)}
                  onClick={() => revoke(assignment.id)}
                >
                  Revoke
                </Button>
              </div>
            ))
          )}
        </CardContent>
      </Card>
    </div>
  );
};
