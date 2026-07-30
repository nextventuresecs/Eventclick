import { useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  Settings as SettingsIcon,
  Shield,
  Building2,
  Trash2,
  AlertTriangle,
  Bell,
  CheckCircle2,
  Copy,
  Check,
  UserX,
  Lock,
} from "lucide-react";
import { ROLE_LABELS } from "@application/shared";
import { useAuth } from "@/hooks/useAuth";
import { useToast } from "@/hooks/useToast";
import { adminApi, ApiClientError } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardTitle, CardDescription } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export const Settings = () => {
  const { user, logout } = useAuth();
  const { toast } = useToast();
  const navigate = useNavigate();

  // Organization settings (NGO Admin)
  const [orgName, setOrgName] = useState(user?.organizationName || "");
  const [savingOrg, setSavingOrg] = useState(false);
  const [copiedId, setCopiedId] = useState(false);

  // Notification Toggles
  const [notifyRoomCreated, setNotifyRoomCreated] = useState(true);
  const [notifyLiveStart, setNotifyLiveStart] = useState(true);
  const [notifyAttendance, setNotifyAttendance] = useState(false);

  // Account Deletion Modal State
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [deleteTargetId, setDeleteTargetId] = useState<string>(user?.id || "");
  const [deleteTargetEmail, setDeleteTargetEmail] = useState<string>(user?.email || "");
  const [confirmEmail, setConfirmEmail] = useState("");
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  const isNgoAdmin = user?.role === "ngo_admin";
  const isEventAdmin = user?.role === "event_admin";

  const handleSaveOrg = (e: React.FormEvent) => {
    e.preventDefault();
    setSavingOrg(true);
    setTimeout(() => {
      setSavingOrg(false);
      toast("Organization settings updated", "success");
    }, 600);
  };

  const copyOrgId = () => {
    if (user?.organizationId) {
      navigator.clipboard.writeText(user.organizationId);
      setCopiedId(true);
      toast("Organization ID copied to clipboard", "info");
      setTimeout(() => setCopiedId(false), 2000);
    }
  };

  const handleOpenSelfDelete = () => {
    if (!user) return;
    setDeleteTargetId(user.id);
    setDeleteTargetEmail(user.email);
    setConfirmEmail("");
    setDeleteError(null);
    setShowDeleteModal(true);
  };

  const handleConfirmDelete = async (e: React.FormEvent) => {
    e.preventDefault();
    if (confirmEmail.trim().toLowerCase() !== deleteTargetEmail.trim().toLowerCase()) {
      setDeleteError(`Please type "${deleteTargetEmail}" exactly to confirm deletion.`);
      return;
    }

    setDeleting(true);
    setDeleteError(null);

    try {
      await adminApi.deleteUser(deleteTargetId, confirmEmail.trim());
      toast("Account deleted successfully", "success");
      setShowDeleteModal(false);

      if (deleteTargetId === user?.id) {
        await logout();
        navigate("/login", { replace: true });
      }
    } catch (err) {
      setDeleteError(err instanceof ApiClientError ? err.message : "Failed to delete account");
    } finally {
      setDeleting(false);
    }
  };

  return (
    <div className="max-w-4xl mx-auto space-y-8 animate-in fade-in">
      {/* Header */}
      <div className="rounded-3xl bg-brand-gradient-tile p-6 md:p-8 text-white shadow-lg space-y-2">
        <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold bg-white/15 backdrop-blur-md text-white border border-white/20">
          <SettingsIcon className="w-3.5 h-3.5 text-purple-300" />
          System & Account Preferences
        </div>
        <h1 className="text-2xl md:text-3xl font-bold font-display text-white tracking-tight">
          Application Settings
        </h1>
        <p className="text-sm text-white/80">
          Manage your organization details, notification alerts, and role-based account management.
        </p>
      </div>

      {/* Grid Layout */}
      <div className="space-y-6">
        {/* Organization Settings (NGO Admin) */}
        {isNgoAdmin && (
          <Card className="card-static rounded-2xl border-purple-100">
            <CardContent className="p-6 space-y-5">
              <div>
                <CardTitle className="text-lg font-bold font-display text-gray-900 flex items-center gap-2">
                  <Building2 className="w-5 h-5 text-purple-600" />
                  Organization Configuration
                </CardTitle>
                <CardDescription className="text-xs">
                  Manage organization name and tenant credentials
                </CardDescription>
              </div>

              <form onSubmit={handleSaveOrg} className="space-y-4">
                <div className="space-y-1.5">
                  <Label htmlFor="orgName" className="text-xs font-semibold text-gray-700">Organization Name</Label>
                  <Input
                    id="orgName"
                    type="text"
                    value={orgName}
                    onChange={(e) => setOrgName(e.target.value)}
                    required
                    className="input-premium"
                  />
                </div>

                <div className="space-y-1.5">
                  <Label className="text-xs font-semibold text-gray-700">Organization ID (Tenant Key)</Label>
                  <div className="flex gap-2">
                    <Input
                      value={user?.organizationId || "—"}
                      disabled
                      className="bg-gray-50 text-gray-600 font-mono text-xs rounded-xl"
                    />
                    <Button
                      type="button"
                      variant="outline"
                      onClick={copyOrgId}
                      className="rounded-xl shrink-0 gap-1.5"
                    >
                      {copiedId ? <Check className="w-4 h-4 text-emerald-600" /> : <Copy className="w-4 h-4" />}
                      {copiedId ? "Copied" : "Copy ID"}
                    </Button>
                  </div>
                </div>

                <div className="pt-2 flex justify-end">
                  <Button type="submit" disabled={savingOrg} className="bg-brand-gradient h-10 rounded-xl font-semibold shadow-xs">
                    {savingOrg ? "Saving..." : "Update Organization"}
                  </Button>
                </div>
              </form>
            </CardContent>
          </Card>
        )}

        {/* Notification Preferences */}
        <Card className="card-static rounded-2xl">
          <CardContent className="p-6 space-y-5">
            <div>
              <CardTitle className="text-lg font-bold font-display text-gray-900 flex items-center gap-2">
                <Bell className="w-5 h-5 text-purple-600" />
                Notification Alerts
              </CardTitle>
              <CardDescription className="text-xs">
                Choose when you want to receive email notifications
              </CardDescription>
            </div>

            <div className="space-y-4 divide-y divide-gray-100">
              <div className="flex items-center justify-between pt-1">
                <div>
                  <p className="text-sm font-semibold text-gray-900">Event Room Creation</p>
                  <p className="text-xs text-gray-500">Receive alert when a new event room is scheduled in your org.</p>
                </div>
                <input
                  type="checkbox"
                  checked={notifyRoomCreated}
                  onChange={(e) => setNotifyRoomCreated(e.target.checked)}
                  className="w-5 h-5 rounded accent-purple-600 cursor-pointer"
                />
              </div>

              <div className="flex items-center justify-between pt-4">
                <div>
                  <p className="text-sm font-semibold text-gray-900">Live Session Stream Start</p>
                  <p className="text-xs text-gray-500">Get notified immediately when a room goes live.</p>
                </div>
                <input
                  type="checkbox"
                  checked={notifyLiveStart}
                  onChange={(e) => setNotifyLiveStart(e.target.checked)}
                  className="w-5 h-5 rounded accent-purple-600 cursor-pointer"
                />
              </div>

              <div className="flex items-center justify-between pt-4">
                <div>
                  <p className="text-sm font-semibold text-gray-900">Attendance Submission Digest</p>
                  <p className="text-xs text-gray-500">Receive summary reports whenever attendance entries are submitted.</p>
                </div>
                <input
                  type="checkbox"
                  checked={notifyAttendance}
                  onChange={(e) => setNotifyAttendance(e.target.checked)}
                  className="w-5 h-5 rounded accent-purple-600 cursor-pointer"
                />
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Role-Aware Account Deletion Policy & Action */}
        <Card className="card-static rounded-2xl border-red-100 bg-red-50/30">
          <CardContent className="p-6 space-y-4">
            <div>
              <CardTitle className="text-lg font-bold font-display text-red-950 flex items-center gap-2">
                <Trash2 className="w-5 h-5 text-red-600" />
                Account Management & Deletion
              </CardTitle>
              <CardDescription className="text-xs text-red-700">
                Review your role permissions and manage account removal.
              </CardDescription>
            </div>

            {/* Role Governance Rules Notice */}
            <div className="p-4 rounded-xl bg-white border border-red-200 space-y-2 text-xs">
              <div className="flex items-center gap-2 font-bold text-gray-900">
                <Shield className="w-4 h-4 text-purple-600" />
                <span>Your Permission Level: {user ? ROLE_LABELS[user.role] : "Member"}</span>
              </div>
              <p className="text-gray-600 leading-relaxed">
                {isNgoAdmin ? (
                  "As an Organization Admin, you have authority to delete any Event Admin or Volunteer account in your organization."
                ) : isEventAdmin ? (
                  "As an Event Admin, you can delete Volunteer accounts that you personally created or added to the organization."
                ) : (
                  "As a Volunteer, you have permission to delete your own account at any time."
                )}
              </p>
            </div>

            {/* Self-Account Deletion Trigger */}
            <div className="flex items-center justify-between pt-2">
              <div>
                <p className="text-sm font-bold text-red-950">Delete My Account</p>
                <p className="text-xs text-red-700">Permanently delete your profile and revoke all active sessions.</p>
              </div>
              <Button
                variant="outline"
                onClick={handleOpenSelfDelete}
                className="border-red-200 text-red-600 hover:bg-red-50 rounded-xl font-semibold"
              >
                <UserX className="w-4 h-4 mr-1.5" />
                Delete Account
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Confirmation Modal */}
      {showDeleteModal && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4 z-50 animate-in fade-in">
          <Card className="w-full max-w-md rounded-2xl shadow-xl border-red-200 bg-white">
            <CardContent className="p-6 space-y-5">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-full bg-red-100 text-red-600 flex items-center justify-center shrink-0">
                  <AlertTriangle className="w-5 h-5" />
                </div>
                <div>
                  <CardTitle className="font-display text-lg text-gray-900">Confirm Account Deletion</CardTitle>
                  <CardDescription className="text-xs text-red-600 font-semibold">
                    This action is permanent and cannot be undone.
                  </CardDescription>
                </div>
              </div>

              <p className="text-xs text-gray-600 leading-relaxed">
                To confirm deletion of <strong className="text-gray-900 font-mono">{deleteTargetEmail}</strong>, please type the email address below:
              </p>

              <form onSubmit={handleConfirmDelete} className="space-y-4">
                <div className="space-y-1.5">
                  <Label htmlFor="confirmEmail" className="text-xs font-semibold text-gray-700">Confirmation Email</Label>
                  <Input
                    id="confirmEmail"
                    type="email"
                    value={confirmEmail}
                    onChange={(e) => setConfirmEmail(e.target.value)}
                    placeholder={deleteTargetEmail}
                    required
                    disabled={deleting}
                    className="input-premium border-red-200 focus:ring-red-500"
                  />
                </div>

                {deleteError && (
                  <p className="text-xs text-red-600 bg-red-50 p-2.5 rounded-xl border border-red-200">{deleteError}</p>
                )}

                <div className="flex gap-3 justify-end pt-2">
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => setShowDeleteModal(false)}
                    disabled={deleting}
                    className="rounded-xl"
                  >
                    Cancel
                  </Button>
                  <Button
                    type="submit"
                    disabled={deleting}
                    className="bg-red-600 hover:bg-red-700 text-white rounded-xl font-semibold shadow-xs"
                  >
                    {deleting ? "Deleting..." : "Permanently Delete"}
                  </Button>
                </div>
              </form>
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  );
};
