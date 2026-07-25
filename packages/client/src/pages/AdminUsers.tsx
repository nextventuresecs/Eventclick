import { useCallback, useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Users, Link as LinkIcon, Search } from "lucide-react";
import { hasRolePermission, type OrgUserSummary, type EventAdminAssignment, type UserRole } from "@application/shared";
import { adminApi, eventAssignmentsApi, ApiClientError } from "@/lib/api";
import { useAuth } from "@/hooks/useAuth";
import { useToast } from "@/hooks/useToast";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardTitle, CardDescription } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export const AdminUsers = () => {
  const { user } = useAuth();
  const { toast } = useToast();
  const navigate = useNavigate();
  const [users, setUsers] = useState<OrgUserSummary[]>([]);
  const [assignments, setAssignments] = useState<EventAdminAssignment[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [search, setSearch] = useState("");
  const [roleFilter, setRoleFilter] = useState<UserRole | "all">("all");
  const [statusFilter, setStatusFilter] = useState<"all" | "active" | "inactive">("all");

  const canManageUsers = user ? hasRolePermission(user.role, "manage_users") : false;

  const load = useCallback(async () => {
    setError(null);
    setLoading(true);
    try {
      const [usersRes, assignmentsRes] = await Promise.all([
        adminApi.listUsers(),
        eventAssignmentsApi.listAssignments(),
      ]);
      setUsers(usersRes.items);
      setAssignments(assignmentsRes.items);
    } catch (err) {
      setError(err instanceof ApiClientError ? err.message : "Failed to load users");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!canManageUsers) return;
    void load();
  }, [canManageUsers, load]);

  const enrichedUsers = useMemo(() => {
    const map = new Map<string, { roomTitle: string; assignedBy: string | null }[]>();
    assignments.forEach((a) => {
      if (!map.has(a.userId)) map.set(a.userId, []);
      map.get(a.userId)!.push({ roomTitle: a.room.title, assignedBy: a.assignedBy });
    });
    return users.map((u) => {
      const userAssignments = map.get(u.id) || [];
      const roomTitle = userAssignments[0]?.roomTitle ?? "—";
      const assignedBy = userAssignments[0]?.assignedBy ? userAssignments[0].assignedBy.split("@")[0] : undefined;
      return { ...u, roomTitle, assignedBy, isActive: u.isActive };
    });
  }, [users, assignments]);

  const filtered = useMemo(() => {
    return enrichedUsers.filter((u) => {
      if (search && !u.fullName.toLowerCase().includes(search.toLowerCase()) && !u.email.toLowerCase().includes(search.toLowerCase())) return false;
      if (roleFilter !== "all" && u.role !== roleFilter) return false;
      if (statusFilter === "active" && !u.isActive) return false;
      if (statusFilter === "inactive" && u.isActive) return false;
      return true;
    });
  }, [enrichedUsers, search, roleFilter, statusFilter]);

  if (!canManageUsers) {
    return (
      <Card className="border border-[var(--color-gray-200)]">
        <CardContent className="p-6 text-sm text-[var(--color-gray-500)]">
          Access denied. Only NGO Admins can manage users.
        </CardContent>
      </Card>
    );
  }

  if (loading) {
    return (
      <div className="text-center py-12">
        <p className="text-[var(--color-gray-400)]">Loading users...</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-3xl font-bold tracking-tight font-display text-[var(--color-gray-900)]">Users</h2>
          <p className="text-[var(--color-gray-400)] mt-1">
            Manage users for {user?.organizationName || "your organization"}
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={() => navigate("/admin/event-assignments")} className="border-[var(--color-gray-200)] text-[var(--color-gray-600)]">
            <LinkIcon className="w-4 h-4 mr-1" />
            Event Assignments
          </Button>
          <Button onClick={() => setShowCreateModal(true)} className="bg-[var(--color-secondary)] text-white shadow-sm">
            <Users className="w-4 h-4 mr-1" />
            Add user
          </Button>
        </div>
      </div>

      {error && (
        <Card className="border-[var(--color-status-cancelled-bg)] bg-[var(--color-status-cancelled-bg)]">
          <CardContent className="pt-6">
            <p className="text-[var(--color-status-cancelled)] text-sm">{error}</p>
          </CardContent>
        </Card>
      )}

      <Card className="border border-[var(--color-gray-200)] bg-[var(--color-surface)] shadow-sm rounded-2xl">
        <CardContent className="p-4">
          <div className="flex flex-wrap items-center gap-2 mb-4">
            <div className="relative flex-1 min-w-[200px]">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[var(--color-gray-400)]" />
              <Input
                placeholder="Search users..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="pl-9 border-[var(--color-gray-200)] bg-[var(--color-gray-50)]"
              />
            </div>
            <div className="flex gap-2">
              <Button variant={roleFilter === "all" ? "primary" : "outline"} size="sm" onClick={() => setRoleFilter("all")} className={roleFilter !== "all" ? "border-[var(--color-gray-200)] text-[var(--color-gray-600)]" : ""}>All</Button>
              <Button variant={roleFilter === "event_admin" ? "primary" : "outline"} size="sm" onClick={() => setRoleFilter("event_admin")} className={roleFilter !== "event_admin" ? "border-[var(--color-gray-200)] text-[var(--color-gray-600)]" : ""}>Event Admin</Button>
              <Button variant={roleFilter === "volunteer" ? "primary" : "outline"} size="sm" onClick={() => setRoleFilter("volunteer")} className={roleFilter !== "volunteer" ? "border-[var(--color-gray-200)] text-[var(--color-gray-600)]" : ""}>Volunteer</Button>
            </div>
            <div className="flex gap-2">
              <Button variant={statusFilter === "all" ? "primary" : "outline"} size="sm" onClick={() => setStatusFilter("all")} className={statusFilter !== "all" ? "border-[var(--color-gray-200)] text-[var(--color-gray-600)]" : ""}>All</Button>
              <Button variant={statusFilter === "active" ? "primary" : "outline"} size="sm" onClick={() => setStatusFilter("active")} className={statusFilter !== "active" ? "border-[var(--color-gray-200)] text-[var(--color-gray-600)]" : ""}>Active</Button>
              <Button variant={statusFilter === "inactive" ? "primary" : "outline"} size="sm" onClick={() => setStatusFilter("inactive")} className={statusFilter !== "inactive" ? "border-[var(--color-gray-200)] text-[var(--color-gray-600)]" : ""}>Inactive</Button>
            </div>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-sm text-left">
              <thead className="bg-[var(--color-gray-50)] text-[var(--color-gray-400)] text-xs uppercase">
                <tr>
                  <th className="px-4 py-3 font-semibold">Member</th>
                  <th className="px-4 py-3 font-semibold">Assigned Event</th>
                  <th className="px-4 py-3 font-semibold">Status</th>
                  <th className="px-4 py-3 font-semibold">Assigned By</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[var(--color-gray-100)]">
                {filtered.map((u) => (
                  <tr key={u.id} className="hover:bg-[var(--color-gray-50)] transition-colors">
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-3">
                        <div className="h-8 w-8 rounded-full bg-[var(--color-primary)]/10 text-[var(--color-primary)] flex items-center justify-center text-xs font-bold uppercase">
                          {u.fullName.charAt(0)}
                        </div>
                        <div>
                          <p className="font-medium text-[var(--color-gray-900)]">{u.fullName}</p>
                          <p className="text-xs text-[var(--color-gray-400)]">{u.email}</p>
                        </div>
                      </div>
                    </td>
                    <td className="px-4 py-3 text-[var(--color-gray-500)]">{u.roomTitle}</td>
                    <td className="px-4 py-3">
                      <span className={`inline-flex items-center rounded-full px-2.5 py-1 text-xs font-semibold border-0 ${
                        u.isActive
                          ? "bg-[var(--color-status-live-bg)] text-[var(--color-status-live)]"
                          : "bg-[var(--color-gray-100)] text-[var(--color-gray-500)]"
                      }`}>
                        {u.isActive ? "Active" : "Inactive"}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-[var(--color-gray-500)]">{u.assignedBy ?? "—"}</td>
                  </tr>
                ))}
                {filtered.length === 0 && (
                  <tr>
                    <td colSpan={4} className="px-4 py-8 text-center text-[var(--color-gray-400)]">No users found</td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>

      {showCreateModal && (
        <CreateUserModal
          onClose={() => setShowCreateModal(false)}
          onSuccess={() => {
            setShowCreateModal(false);
            toast("User created successfully", "success");
            void load();
          }}
        />
      )}
    </div>
  );
};

const CreateUserModal = ({
  onClose,
  onSuccess,
}: {
  onClose: () => void;
  onSuccess: () => void;
}) => {
  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [role, setRole] = useState<"event_admin" | "volunteer">("event_admin");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);

    try {
      const input = { fullName, email, password, role };
      // @ts-ignore - backend accepts CreateOrgUserInput
      await adminApi.createUser(input);
      onSuccess();
    } catch (err) {
      setError(err instanceof ApiClientError ? err.message : "Failed to create user");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50">
      <Card className="w-full max-w-md border-[var(--color-gray-200)]">
        <CardContent className="p-6 space-y-4">
          <div>
            <CardTitle className="font-display">Create New User</CardTitle>
            <CardDescription>Add a new user to your organization</CardDescription>
          </div>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="fullName">Full Name</Label>
              <Input
                id="fullName"
                type="text"
                value={fullName}
                onChange={(e) => setFullName(e.target.value)}
                placeholder="John Doe"
                required
                disabled={loading}
                className="border-[var(--color-gray-200)]"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="email">Email</Label>
              <Input
                id="email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="john@example.com"
                required
                disabled={loading}
                className="border-[var(--color-gray-200)]"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="password">Password</Label>
              <Input
                id="password"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••"
                required
                minLength={8}
                disabled={loading}
                className="border-[var(--color-gray-200)]"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="role">Role</Label>
              <select
                id="role"
                value={role}
                onChange={(e) => setRole(e.target.value as "event_admin" | "volunteer")}
                className="w-full border border-[var(--color-gray-200)] rounded-lg px-3 py-2 bg-[var(--color-surface)] text-[var(--color-gray-900)]"
                disabled={loading}
              >
                <option value="event_admin">Event Admin</option>
                <option value="volunteer">Volunteer</option>
              </select>
            </div>

            {error && <p className="text-sm text-[var(--color-status-cancelled)] bg-[var(--color-status-cancelled-bg)] p-2 rounded">{error}</p>}

            <div className="flex gap-3 justify-end pt-4">
              <Button variant="outline" onClick={onClose} disabled={loading} className="border-[var(--color-gray-200)] text-[var(--color-gray-600)]">
                Cancel
              </Button>
              <Button type="submit" disabled={loading} className="bg-[var(--color-secondary)] text-white shadow-sm">
                {loading ? "Creating..." : "Create User"}
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>
    </div>
  );
};
