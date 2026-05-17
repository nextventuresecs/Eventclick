import { useCallback, useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Users, Link as LinkIcon } from "lucide-react";
import { hasRolePermission, type OrgUserSummary, type CreateOrgUserInput } from "@application/shared";
import { adminApi, ApiClientError } from "@/lib/api";
import { useAuth } from "@/hooks/useAuth";
import { useToast } from "@/hooks/useToast";
import { Button } from "@/components/ui/button";
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export const AdminUsers = () => {
  const { user } = useAuth();
  const { toast } = useToast();
  const navigate = useNavigate();
  const [users, setUsers] = useState<OrgUserSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showCreateModal, setShowCreateModal] = useState(false);

  const canManageUsers = user ? hasRolePermission(user.role, "manage_users") : false;

  const load = useCallback(async () => {
    setError(null);
    setLoading(true);
    try {
      const res = await adminApi.listUsers();
      setUsers(res.items);
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

  if (!canManageUsers) {
    return (
      <Card>
        <CardContent className="p-6 text-sm text-muted-foreground">
          Access denied. Only NGO Admins can manage users.
        </CardContent>
      </Card>
    );
  }

  if (loading) {
    return (
      <div className="text-center py-12">
        <p className="text-muted-foreground">Loading users...</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-3xl font-bold tracking-tight">Users</h2>
          <p className="text-muted-foreground mt-1">
            Manage users for {user?.organizationName || "your organization"}
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={() => navigate("/admin/event-assignments")}>
            <LinkIcon className="w-4 h-4 mr-1" />
            Event Assignments
          </Button>
          <Button onClick={() => setShowCreateModal(true)}>
            <Users className="w-4 h-4 mr-1" />
            Create User
          </Button>
        </div>
      </div>

      {error && (
        <Card className="border-destructive bg-destructive/10">
          <CardContent className="pt-6">
            <p className="text-destructive text-sm">{error}</p>
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader>
          <CardTitle>Organization Users</CardTitle>
          <CardDescription>
            {user?.organizationName && <span className="font-semibold text-primary/80">{user.organizationName}</span>}
            {user?.organizationName && " • "}
            {users.length} users
          </CardDescription>
        </CardHeader>
        <CardContent>
          {users.length === 0 ? (
            <div className="text-center py-8">
              <p className="text-muted-foreground">No users yet. Create one to get started.</p>
            </div>
          ) : (
            <div className="space-y-2">
              {users.map((u) => (
                <div
                  key={u.id}
                  className="flex items-center justify-between p-4 border rounded-lg hover:bg-muted/50"
                >
                  <div className="flex-1">
                    <p className="font-medium">{u.fullName}</p>
                    <p className="text-sm text-muted-foreground">{u.email}</p>
                    <div className="flex items-center gap-2 mt-2">
                      <span className="text-xs bg-primary/10 text-primary px-2 py-1 rounded">
                        {u.role}
                      </span>
                      <span
                        className={`text-xs px-2 py-1 rounded ${
                          u.isActive
                            ? "bg-green-500/10 text-green-500"
                            : "bg-gray-500/10 text-gray-500"
                        }`}
                      >
                        {u.isActive ? "Active" : "Inactive"}
                      </span>
                    </div>
                  </div>
                  {u.role === "event_admin" && (
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => navigate("/admin/event-assignments")}
                    >
                      <LinkIcon className="w-4 h-4 mr-1" />
                      Assign Events
                    </Button>
                  )}
                </div>
              ))}
            </div>
          )}
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
      const input: CreateOrgUserInput = { fullName, email, password, role };
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
      <Card className="w-full max-w-md">
        <CardHeader>
          <CardTitle>Create New User</CardTitle>
          <CardDescription>Add a new user to your organization</CardDescription>
        </CardHeader>
        <CardContent>
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
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="role">Role</Label>
              <select
                id="role"
                value={role}
                onChange={(e) => setRole(e.target.value as "event_admin" | "volunteer")}
                className="w-full border border-input rounded-md px-3 py-2 bg-background text-foreground"
                disabled={loading}
              >
                <option value="event_admin">Event Admin</option>
                <option value="volunteer">Volunteer</option>
              </select>
            </div>

            {error && <p className="text-sm text-destructive bg-destructive/10 p-2 rounded">{error}</p>}

            <div className="flex gap-3 justify-end pt-4">
              <Button variant="outline" onClick={onClose} disabled={loading}>
                Cancel
              </Button>
              <Button type="submit" disabled={loading}>
                {loading ? "Creating..." : "Create User"}
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>
    </div>
  );
};
