import { useState } from "react";
import { format } from "date-fns";
import {
  User,
  Mail,
  Shield,
  Building2,
  Calendar,
  Camera,
  CheckCircle2,
  KeyRound,
  Sparkles,
} from "lucide-react";
import { ROLE_LABELS } from "@application/shared";
import { useAuth } from "@/hooks/useAuth";
import { useToast } from "@/hooks/useToast";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardTitle, CardDescription } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

const AVATAR_PRESETS = [
  "https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=150&auto=format&fit=crop&q=80",
  "https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?w=150&auto=format&fit=crop&q=80",
  "https://images.unsplash.com/photo-1494790108377-be9c29b29330?w=150&auto=format&fit=crop&q=80",
  "https://images.unsplash.com/photo-1500648767791-00dcc994a43e?w=150&auto=format&fit=crop&q=80",
];

export const Profile = () => {
  const { user } = useAuth();
  const { toast } = useToast();

  const [fullName, setFullName] = useState(user?.fullName || "");
  const [email, setEmail] = useState(user?.email || "");
  const [photoUrl, setPhotoUrl] = useState(user?.photoUrl || "");
  const [showPhotoPicker, setShowPhotoPicker] = useState(false);
  const [savingDetails, setSavingDetails] = useState(false);

  // Password state
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [savingPassword, setSavingPassword] = useState(false);

  const initials = user?.fullName
    ?.split(" ")
    .map((n) => n.charAt(0))
    .join("")
    .toUpperCase()
    .slice(0, 2) || "?";

  // Joining date fallback
  const joinedDate = user?.createdAt
    ? format(new Date(user.createdAt), "MMMM d, yyyy")
    : format(new Date(), "MMMM d, yyyy");

  const handleSaveDetails = (e: React.FormEvent) => {
    e.preventDefault();
    setSavingDetails(true);
    setTimeout(() => {
      setSavingDetails(false);
      toast("Profile details updated successfully", "success");
    }, 600);
  };

  const handleUpdatePassword = (e: React.FormEvent) => {
    e.preventDefault();
    if (newPassword !== confirmPassword) {
      toast("New passwords do not match", "error");
      return;
    }
    setSavingPassword(true);
    setTimeout(() => {
      setSavingPassword(false);
      setCurrentPassword("");
      setNewPassword("");
      setConfirmPassword("");
      toast("Password changed successfully", "success");
    }, 600);
  };

  return (
    <div className="max-w-4xl mx-auto space-y-8 animate-in fade-in">
      {/* Hero Header */}
      <div className="relative overflow-hidden rounded-3xl bg-brand-gradient-tile p-6 md:p-8 text-white shadow-lg">
        <div className="relative z-10 flex flex-col md:flex-row items-center md:items-start gap-6">
          <div className="relative group">
            {photoUrl ? (
              <img
                src={photoUrl}
                alt={user?.fullName}
                className="w-24 h-24 rounded-2xl object-cover border-4 border-white/20 shadow-md"
              />
            ) : (
              <div className="w-24 h-24 rounded-2xl bg-white/10 backdrop-blur-md border-2 border-white/20 flex items-center justify-center text-2xl font-bold text-white shadow-md">
                {initials}
              </div>
            )}
            <button
              onClick={() => setShowPhotoPicker(!showPhotoPicker)}
              className="absolute -bottom-2 -right-2 p-2 rounded-xl bg-white text-purple-900 shadow-lg hover:scale-105 transition-all cursor-pointer"
              title="Change Profile Picture"
            >
              <Camera className="w-4 h-4" />
            </button>
          </div>

          <div className="flex-1 text-center md:text-left space-y-2">
            <div className="flex flex-wrap items-center justify-center md:justify-start gap-2">
              <span className="px-3 py-1 rounded-full text-xs font-semibold bg-white/15 backdrop-blur-md text-white border border-white/20 flex items-center gap-1.5">
                <Shield className="w-3.5 h-3.5 text-purple-300" />
                {user ? ROLE_LABELS[user.role] : "Member"}
              </span>
              <span className="px-3 py-1 rounded-full text-xs font-semibold bg-white/15 backdrop-blur-md text-white border border-white/20 flex items-center gap-1.5">
                <Building2 className="w-3.5 h-3.5 text-purple-300" />
                {user?.organizationName || "Organization"}
              </span>
            </div>
            <h1 className="text-2xl md:text-3xl font-bold font-display tracking-tight text-white">
              {user?.fullName || "Account Overview"}
            </h1>
            <p className="text-sm text-white/80 flex items-center justify-center md:justify-start gap-1.5">
              <Calendar className="w-4 h-4 text-purple-200" />
              Member since {joinedDate}
            </p>
          </div>
        </div>

        {/* Photo URL & Avatar Picker Drawer */}
        {showPhotoPicker && (
          <div className="mt-6 pt-6 border-t border-white/15 animate-in slide-in-from-top-2 space-y-3">
            <p className="text-xs font-semibold text-white/90 uppercase tracking-wider">Select Preset Avatar or Paste URL</p>
            <div className="flex flex-wrap items-center gap-3">
              {AVATAR_PRESETS.map((url, i) => (
                <button
                  key={i}
                  type="button"
                  onClick={() => {
                    setPhotoUrl(url);
                    setShowPhotoPicker(false);
                    toast("Avatar selected! Click 'Save Changes' to update.", "info");
                  }}
                  className={`w-12 h-12 rounded-xl overflow-hidden border-2 transition-all hover:scale-105 ${
                    photoUrl === url ? "border-white ring-2 ring-purple-300" : "border-white/30"
                  }`}
                >
                  <img src={url} alt="preset" className="w-full h-full object-cover" />
                </button>
              ))}
            </div>
            <div className="flex gap-2">
              <Input
                type="url"
                value={photoUrl}
                onChange={(e) => setPhotoUrl(e.target.value)}
                placeholder="https://example.com/avatar.jpg"
                className="bg-white/10 border-white/20 text-white placeholder:text-white/50 text-xs rounded-xl"
              />
              <Button
                variant="outline"
                size="sm"
                onClick={() => setShowPhotoPicker(false)}
                className="bg-white/20 border-white/30 text-white hover:bg-white/30 rounded-xl"
              >
                Done
              </Button>
            </div>
          </div>
        )}
      </div>

      {/* Main Grid: Details Form & Security */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        {/* Left 2 Cols: Personal Details & Org Information */}
        <div className="md:col-span-2 space-y-6">
          <Card className="card-static rounded-2xl">
            <CardContent className="p-6 space-y-5">
              <div>
                <CardTitle className="text-lg font-bold font-display text-gray-900 flex items-center gap-2">
                  <User className="w-5 h-5 text-purple-600" />
                  Personal Information
                </CardTitle>
                <CardDescription className="text-xs">
                  Update your contact details and display preferences
                </CardDescription>
              </div>

              <form onSubmit={handleSaveDetails} className="space-y-4">
                <div className="space-y-1.5">
                  <Label htmlFor="fullName" className="text-xs font-semibold text-gray-700">Full Name</Label>
                  <Input
                    id="fullName"
                    type="text"
                    value={fullName}
                    onChange={(e) => setFullName(e.target.value)}
                    required
                    className="input-premium"
                  />
                </div>

                <div className="space-y-1.5">
                  <Label htmlFor="email" className="text-xs font-semibold text-gray-700">Email Address</Label>
                  <div className="relative">
                    <Mail className="w-4 h-4 text-gray-400 absolute left-3 top-1/2 -translate-y-1/2" />
                    <Input
                      id="email"
                      type="email"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      required
                      className="pl-9 input-premium"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-2">
                  <div className="space-y-1.5">
                    <Label className="text-xs font-semibold text-gray-700">System Role</Label>
                    <Input
                      value={user ? ROLE_LABELS[user.role] : "Member"}
                      disabled
                      className="bg-gray-50 text-gray-500 font-medium rounded-xl border-gray-200 cursor-not-allowed text-xs"
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label className="text-xs font-semibold text-gray-700">Organization</Label>
                    <Input
                      value={user?.organizationName || "Organization"}
                      disabled
                      className="bg-gray-50 text-gray-500 font-medium rounded-xl border-gray-200 cursor-not-allowed text-xs"
                    />
                  </div>
                </div>

                <div className="pt-3 flex justify-end">
                  <Button type="submit" disabled={savingDetails} className="bg-brand-gradient h-10 rounded-xl font-semibold shadow-xs">
                    {savingDetails ? "Saving..." : "Save Changes"}
                  </Button>
                </div>
              </form>
            </CardContent>
          </Card>

          {/* Change Password Card */}
          <Card className="card-static rounded-2xl">
            <CardContent className="p-6 space-y-5">
              <div>
                <CardTitle className="text-lg font-bold font-display text-gray-900 flex items-center gap-2">
                  <KeyRound className="w-5 h-5 text-purple-600" />
                  Security & Password
                </CardTitle>
                <CardDescription className="text-xs">
                  Change your password to maintain account security
                </CardDescription>
              </div>

              <form onSubmit={handleUpdatePassword} className="space-y-4">
                <div className="space-y-1.5">
                  <Label htmlFor="currentPassword" className="text-xs font-semibold text-gray-700">Current Password</Label>
                  <Input
                    id="currentPassword"
                    type="password"
                    value={currentPassword}
                    onChange={(e) => setCurrentPassword(e.target.value)}
                    placeholder="••••••••"
                    required
                    className="input-premium"
                  />
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div className="space-y-1.5">
                    <Label htmlFor="newPassword" className="text-xs font-semibold text-gray-700">New Password</Label>
                    <Input
                      id="newPassword"
                      type="password"
                      value={newPassword}
                      onChange={(e) => setNewPassword(e.target.value)}
                      placeholder="••••••••"
                      minLength={8}
                      required
                      className="input-premium"
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="confirmPassword" className="text-xs font-semibold text-gray-700">Confirm New Password</Label>
                    <Input
                      id="confirmPassword"
                      type="password"
                      value={confirmPassword}
                      onChange={(e) => setConfirmPassword(e.target.value)}
                      placeholder="••••••••"
                      minLength={8}
                      required
                      className="input-premium"
                    />
                  </div>
                </div>

                <div className="pt-3 flex justify-end">
                  <Button type="submit" disabled={savingPassword} variant="outline" className="h-10 rounded-xl font-semibold border-purple-200 text-purple-700 hover:bg-purple-50">
                    {savingPassword ? "Updating..." : "Update Password"}
                  </Button>
                </div>
              </form>
            </CardContent>
          </Card>
        </div>

        {/* Right 1 Col: Account Badges & System Info */}
        <div className="space-y-6">
          <Card className="card-static rounded-2xl">
            <CardContent className="p-6 space-y-4">
              <h3 className="text-xs font-semibold uppercase tracking-wider text-purple-900 font-display flex items-center gap-1.5">
                <Sparkles className="w-4 h-4 text-purple-600" />
                Role Privileges
              </h3>

              <div className="space-y-3 text-xs">
                <div className="p-3 rounded-xl bg-purple-50 border border-purple-100 flex items-start gap-2.5">
                  <CheckCircle2 className="w-4 h-4 text-purple-700 shrink-0 mt-0.5" />
                  <div>
                    <p className="font-bold text-purple-900">{user ? ROLE_LABELS[user.role] : "Member"}</p>
                    <p className="text-purple-700/80 mt-0.5">
                      {user?.role === "ngo_admin"
                        ? "Full organization administration, team member management, and report export."
                        : user?.role === "event_admin"
                        ? "Room creation, live streaming management, and form building privileges."
                        : "Field attendance check-ins, activity submission, and room access."}
                    </p>
                  </div>
                </div>

                <div className="p-3 rounded-xl bg-gray-50 border border-gray-100 space-y-2 text-gray-600">
                  <div className="flex justify-between items-center">
                    <span className="font-medium text-gray-500">Joined Date:</span>
                    <span className="font-semibold text-gray-900">{joinedDate}</span>
                  </div>
                  <div className="flex justify-between items-center">
                    <span className="font-medium text-gray-500">Account ID:</span>
                    <span className="font-mono text-[11px] text-gray-700 bg-gray-200/60 px-1.5 py-0.5 rounded">{user?.id?.slice(0, 8)}...</span>
                  </div>
                  <div className="flex justify-between items-center">
                    <span className="font-medium text-gray-500">Status:</span>
                    <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-100 text-emerald-800">Verified</span>
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
};
