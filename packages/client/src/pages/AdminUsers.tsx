import { useCallback, useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Users, Link as LinkIcon, Search, Trash2, AlertTriangle } from "lucide-react";
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
  const [deleteTarget, setDeleteTarget] = useState<OrgUserSummary | null>(null);
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
      <Card className="card-static">
        <CardContent className="p-6 text-sm text-(--color-gray-500)">
          Access denied. Only NGO Admins can manage users.
        </CardContent>
      </Card>
    );
  }

  if (loading) {
    return (
      <div className="text-center py-12">
        <p className="text-gray-400">Loading users...</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-3xl font-bold tracking-tight font-display text-(--color-gray-900)">Users</h2>
          <p className="text-gray-400 mt-1">
            Manage users for {user?.organizationName || "your organization"}
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={() => navigate("/admin/event-assignments")} className="border-(--color-gray-200) text-(--color-gray-600) hover:bg-(--color-gray-100) transition-all duration-150 ease-out">
            <LinkIcon className="w-4 h-4 mr-1" />
            Event Assignments
          </Button>
          <Button onClick={() => setShowCreateModal(true)}>
            <Users className="w-4 h-4 mr-1" />
            Add user
          </Button>
        </div>
      </div>

      {error && (
        <Card className="bg-status-cancelled-bg">
          <CardContent className="pt-6">
            <p className="text-status-cancelled text-sm">{error}</p>
          </CardContent>
        </Card>
      )}

      <Card className="card-static rounded-2xl">
        <CardContent className="p-4">
          <div className="flex flex-wrap items-center gap-2 mb-4">
            <div className="relative flex-1 min-w-50">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
              <Input
                placeholder="Search users..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="pl-9 border-(--color-gray-200) bg-(--color-gray-50) input-premium"
              />
            </div>
            <div className="flex gap-2">
              <Button variant={roleFilter === "all" ? "primary" : "outline"} size="sm" onClick={() => setRoleFilter("all")} className={roleFilter !== "all" ? "border-(--color-gray-200) text-(--color-gray-600) hover:bg-(--color-gray-100) transition-all duration-150 ease-out" : ""}>All</Button>
              <Button variant={roleFilter === "event_manager" ? "primary" : "outline"} size="sm" onClick={() => setRoleFilter("event_manager")} className={roleFilter !== "event_manager" ? "border-(--color-gray-200) text-(--color-gray-600) hover:bg-(--color-gray-100) transition-all duration-150 ease-out" : ""}>Event Manager</Button>
              <Button variant={roleFilter === "volunteer" ? "primary" : "outline"} size="sm" onClick={() => setRoleFilter("volunteer")} className={roleFilter !== "volunteer" ? "border-(--color-gray-200) text-(--color-gray-600) hover:bg-(--color-gray-100) transition-all duration-150 ease-out" : ""}>Volunteer</Button>
            </div>
            <div className="flex gap-2">
              <Button variant={statusFilter === "all" ? "primary" : "outline"} size="sm" onClick={() => setStatusFilter("all")} className={statusFilter !== "all" ? "border-(--color-gray-200) text-(--color-gray-600) hover:bg-(--color-gray-100) transition-all duration-150 ease-out" : ""}>All</Button>
              <Button variant={statusFilter === "active" ? "primary" : "outline"} size="sm" onClick={() => setStatusFilter("active")} className={statusFilter !== "active" ? "border-(--color-gray-200) text-(--color-gray-600) hover:bg-(--color-gray-100) transition-all duration-150 ease-out" : ""}>Active</Button>
              <Button variant={statusFilter === "inactive" ? "primary" : "outline"} size="sm" onClick={() => setStatusFilter("inactive")} className={statusFilter !== "inactive" ? "border-(--color-gray-200) text-(--color-gray-600) hover:bg-(--color-gray-100) transition-all duration-150 ease-out" : ""}>Inactive</Button>
            </div>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-sm text-left table-base">
              <thead className="bg-(--color-gray-50) text-gray-400 text-xs uppercase">
                <tr>
                  <th className="px-4 py-3 font-semibold">Member</th>
                  <th className="px-4 py-3 font-semibold">Role</th>
                  <th className="px-4 py-3 font-semibold">Assigned Event</th>
                  <th className="px-4 py-3 font-semibold">Status</th>
                  <th className="px-4 py-3 font-semibold">Assigned By</th>
                  <th className="px-4 py-3 font-semibold text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-(--color-gray-100)">
                {filtered.map((u) => (
                  <tr key={u.id} className="hover:bg-(--color-gray-50) transition-colors">
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-3">
                        <div className="h-8 w-8 rounded-full bg-purple-100 text-purple-800 flex items-center justify-center text-xs font-bold uppercase shrink-0">
                          {u.fullName.charAt(0)}
                        </div>
                        <div>
                          <p className="font-medium text-(--color-gray-900) font-display">{u.fullName}</p>
                          <p className="text-xs text-gray-400 font-mono">{u.email}</p>
                        </div>
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      <span className="inline-flex items-center rounded-full bg-purple-50 text-purple-700 px-2.5 py-0.5 text-xs font-semibold border border-purple-100">
                        {u.role.replace("_", " ").toUpperCase()}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-(--color-gray-500) font-medium">{u.roomTitle}</td>
                    <td className="px-4 py-3">
                      <span className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-semibold ${
                        u.isActive
                          ? "bg-emerald-50 text-emerald-700 border border-emerald-100"
                          : "bg-gray-100 text-gray-500 border border-gray-200"
                      }`}>
                        <span className="w-1.5 h-1.5 rounded-full bg-current" />
                        {u.isActive ? "Active" : "Inactive"}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-(--color-gray-500) text-xs font-mono">{u.assignedBy ?? "—"}</td>
                    <td className="px-4 py-3 text-right">
                      {u.id !== user?.id && (
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => setDeleteTarget(u)}
                          className="h-8 rounded-xl border-red-200 text-red-600 hover:bg-red-50 text-xs gap-1"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                          Delete
                        </Button>
                      )}
                    </td>
                  </tr>
                ))}
                {filtered.length === 0 && (
                  <tr>
                    <td colSpan={6} className="px-4 py-8 text-center text-gray-400">No users found matching your filter</td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>

      {/* Delete User Modal */}
      {deleteTarget && (
        <DeleteUserModal
          targetUser={deleteTarget}
          onClose={() => setDeleteTarget(null)}
          onSuccess={() => {
            setDeleteTarget(null);
            toast("User account deleted successfully", "success");
            void load();
          }}
        />
      )}

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
  const [role, setRole] = useState<"event_manager" | "volunteer">("event_manager");
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
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4 z-50 animate-in fade-in">
      <Card className="w-full max-w-md rounded-2xl shadow-xl border-purple-100 bg-white">
        <CardContent className="p-6 space-y-5">
          <div>
            <CardTitle className="font-display text-xl text-gray-900">Create New User</CardTitle>
            <CardDescription className="text-xs">Add a new admin or volunteer to your organization</CardDescription>
          </div>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="fullName" className="text-xs font-semibold text-gray-700">Full Name</Label>
              <Input
                id="fullName"
                type="text"
                value={fullName}
                onChange={(e) => setFullName(e.target.value)}
                placeholder="e.g. Sarah Connor"
                required
                disabled={loading}
                className="input-premium"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="email" className="text-xs font-semibold text-gray-700">Email Address</Label>
              <Input
                id="email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="sarah@organization.org"
                required
                disabled={loading}
                className="input-premium"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="password" className="text-xs font-semibold text-gray-700">Password</Label>
              <Input
                id="password"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••"
                required
                minLength={8}
                disabled={loading}
                className="input-premium"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="role" className="text-xs font-semibold text-gray-700">Assigned Role</Label>
              <select
                id="role"
                value={role}
                onChange={(e) => setRole(e.target.value as "event_manager" | "volunteer")}
                className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm bg-white text-gray-900 focus:outline-none focus:ring-2 focus:ring-purple-600"
                disabled={loading}
              >
                <option value="event_manager">Event Manager</option>
                <option value="volunteer">Volunteer</option>
              </select>
            </div>

            {error && <p className="text-xs text-red-600 bg-red-50 p-2.5 rounded-xl border border-red-200">{error}</p>}

            <div className="flex gap-3 justify-end pt-2">
              <Button variant="outline" onClick={onClose} disabled={loading} className="rounded-xl">
                Cancel
              </Button>
              <Button type="submit" disabled={loading} className="bg-brand-gradient rounded-xl font-semibold shadow-sm">
                {loading ? "Creating..." : "Create User"}
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>
    </div>
  );
};

const DeleteUserModal = ({
  targetUser,
  onClose,
  onSuccess,
}: {
  targetUser: OrgUserSummary;
  onClose: () => void;
  onSuccess: () => void;
}) => {
  const [confirmEmail, setConfirmEmail] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (confirmEmail.trim().toLowerCase() !== targetUser.email.trim().toLowerCase()) {
      setError(`Please type "${targetUser.email}" to confirm deletion.`);
      return;
    }

    setLoading(true);
    setError(null);

    try {
      await adminApi.deleteUser(targetUser.id, confirmEmail.trim());
      onSuccess();
    } catch (err) {
      setError(err instanceof ApiClientError ? err.message : "Failed to delete user account");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4 z-50 animate-in fade-in">
      <Card className="w-full max-w-md rounded-2xl shadow-xl border-red-200 bg-white">
        <CardContent className="p-6 space-y-5">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-full bg-red-100 text-red-600 flex items-center justify-center shrink-0">
              <AlertTriangle className="w-5 h-5" />
            </div>
            <div>
              <CardTitle className="font-display text-lg text-gray-900">Delete User Account</CardTitle>
              <CardDescription className="text-xs text-red-600 font-semibold">
                Delete account for {targetUser.fullName}
              </CardDescription>
            </div>
          </div>

          <p className="text-xs text-gray-600 leading-relaxed">
            Please type <strong className="text-gray-900 font-mono">{targetUser.email}</strong> to confirm deletion:
          </p>

          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="confirmEmail" className="text-xs font-semibold text-gray-700">Confirmation Email</Label>
              <Input
                id="confirmEmail"
                type="email"
                value={confirmEmail}
                onChange={(e) => setConfirmEmail(e.target.value)}
                placeholder={targetUser.email}
                required
                disabled={loading}
                className="input-premium border-red-200 focus:ring-red-500"
              />
            </div>

            {error && <p className="text-xs text-red-600 bg-red-50 p-2.5 rounded-xl border border-red-200">{error}</p>}

            <div className="flex gap-3 justify-end pt-2">
              <Button variant="outline" onClick={onClose} disabled={loading} className="rounded-xl">
                Cancel
              </Button>
              <Button type="submit" disabled={loading} className="bg-red-600 hover:bg-red-700 text-white rounded-xl font-semibold shadow-sm">
                {loading ? "Deleting..." : "Permanently Delete"}
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>
    </div>
  );
};
