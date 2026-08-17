import { useCallback, useEffect, useRef, useState } from "react";
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
  Upload,
  ImageIcon,
  Link2,
  X,
  Eye,
  EyeOff,
  Loader2,
} from "lucide-react";
import {
  BRANDING_IMAGE_TYPES,
  MAX_BRANDING_UPLOAD_BYTES,
  ROLE_LABELS,
  type BrandingUploadRequestInput,
  type PhotoUploadResponse,
} from "@application/shared";
import { useAuth } from "@/hooks/useAuth";
import { useToast } from "@/hooks/useToast";
import { authApi, settingsApi, uploadToPresignedUrl } from "@/lib/api";
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

const isHttpUrl = (value: string) => /^https?:\/\//i.test(value);

/** Shared class for the icon buttons that sit on top of an input. */
const INPUT_ADORNMENT =
  "absolute right-2 top-1/2 z-10 -translate-y-1/2 inline-flex h-8 w-8 items-center justify-center rounded-md text-gray-400 transition-colors hover:bg-gray-100 hover:text-gray-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40 cursor-pointer";

export const Profile = () => {
  const { user } = useAuth();
  const { toast } = useToast();

  const [fullName, setFullName] = useState(user?.fullName || "");
  const [email] = useState(user?.email || "");
  const [photoUrl, setPhotoUrl] = useState(user?.photoUrl || "");
  const [showPhotoPicker, setShowPhotoPicker] = useState(false);
  const [uploadingAvatar, setUploadingAvatar] = useState(false);
  const [savingDetails, setSavingDetails] = useState(false);

  // Password state
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [savingPassword, setSavingPassword] = useState(false);
  const [showCurrentPassword, setShowCurrentPassword] = useState(false);
  const [showNewPassword, setShowNewPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);

  // Organization logo state. `logoUrl` is always a short http(s) URL — either the
  // storage URL returned after upload, or one the admin pasted. A data: URL is never
  // stored or sent (the API caps logoUrl at 1000 chars).
  const [logoUrl, setLogoUrl] = useState(user?.organizationLogoUrl || "");
  const [logoPreview, setLogoPreview] = useState<string | null>(user?.organizationLogoUrl || null);
  const [uploadingLogo, setUploadingLogo] = useState(false);
  const [savingLogo, setSavingLogo] = useState(false);
  const objectUrls = useRef<string[]>([]);

  useEffect(
    () => () => {
      objectUrls.current.forEach((url) => URL.revokeObjectURL(url));
      objectUrls.current = [];
    },
    [],
  );

  const makePreview = useCallback((file: File) => {
    const url = URL.createObjectURL(file);
    objectUrls.current.push(url);
    return url;
  }, []);

  const initials =
    user?.fullName
      ?.split(" ")
      .map((n) => n.charAt(0))
      .join("")
      .toUpperCase()
      .slice(0, 2) || "?";

  const joinedDate = user?.createdAt
    ? format(new Date(user.createdAt), "MMMM d, yyyy")
    : format(new Date(), "MMMM d, yyyy");

  const validateImage = (file: File): boolean => {
    if (!(BRANDING_IMAGE_TYPES as readonly string[]).includes(file.type)) {
      toast("Only PNG, JPG or WebP images are supported", "error");
      return false;
    }
    if (file.size > MAX_BRANDING_UPLOAD_BYTES) {
      toast("Image must be 5MB or smaller", "error");
      return false;
    }
    return true;
  };

  /** Presign → PUT straight to object storage → return the durable public URL. */
  const uploadImage = async (
    file: File,
    presign: (body: BrandingUploadRequestInput) => Promise<PhotoUploadResponse>,
  ): Promise<string> => {
    const ticket = await presign({ contentType: file.type, sizeBytes: file.size });
    await uploadToPresignedUrl(ticket.uploadUrl, file);
    return ticket.publicUrl;
  };

  const handleAvatarFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file || !validateImage(file)) return;

    const preview = makePreview(file);
    setPhotoUrl(preview);
    setUploadingAvatar(true);
    try {
      const publicUrl = await uploadImage(file, settingsApi.presignAvatar);
      setPhotoUrl(publicUrl);
      toast("Photo uploaded. Click 'Save Changes' to apply.", "success");
    } catch (err) {
      setPhotoUrl(user?.photoUrl || "");
      toast(err instanceof Error ? err.message : "Failed to upload photo", "error");
    } finally {
      setUploadingAvatar(false);
    }
  };

  const handleSaveDetails = async (e: React.FormEvent) => {
    e.preventDefault();
    if (photoUrl && !isHttpUrl(photoUrl)) {
      toast("Photo must be an http(s) URL — upload the file instead", "error");
      return;
    }
    setSavingDetails(true);
    try {
      await authApi.updateProfile({ fullName, photoUrl });
      toast("Profile details updated successfully", "success");
    } catch (err) {
      toast(err instanceof Error ? err.message : "Failed to update profile", "error");
    } finally {
      setSavingDetails(false);
    }
  };

  const handleUpdatePassword = async (e: React.FormEvent) => {
    e.preventDefault();
    if (newPassword !== confirmPassword) {
      toast("New passwords do not match", "error");
      return;
    }
    setSavingPassword(true);
    try {
      await authApi.changePassword({ currentPassword, newPassword });
      setCurrentPassword("");
      setNewPassword("");
      setConfirmPassword("");
      toast("Password changed successfully", "success");
    } catch (err) {
      toast(err instanceof Error ? err.message : "Failed to change password", "error");
    } finally {
      setSavingPassword(false);
    }
  };

  const handleLogoFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file || !validateImage(file)) return;

    setLogoPreview(makePreview(file));
    setUploadingLogo(true);
    try {
      const publicUrl = await uploadImage(file, settingsApi.presignOrganizationLogo);
      setLogoUrl(publicUrl);
      toast("Logo uploaded. Click 'Save logo' to apply.", "success");
    } catch (err) {
      setLogoPreview(user?.organizationLogoUrl || null);
      toast(err instanceof Error ? err.message : "Failed to upload logo", "error");
    } finally {
      setUploadingLogo(false);
    }
  };

  const handleRemoveLogo = () => {
    setLogoPreview(null);
    setLogoUrl("");
  };

  const handleSaveLogo = async () => {
    if (logoUrl && !isHttpUrl(logoUrl)) {
      toast("Logo must be an http(s) URL — use Upload Logo for local files", "error");
      return;
    }
    setSavingLogo(true);
    try {
      await settingsApi.updateOrganization({ logoUrl });
      toast("Organization logo updated", "success");
    } catch (err) {
      toast(err instanceof Error ? err.message : "Failed to update logo", "error");
    } finally {
      setSavingLogo(false);
    }
  };

  return (
    <div className="mx-auto max-w-4xl space-y-8 animate-in fade-in">
      {/* Hero Header */}
      <div className="relative overflow-hidden rounded-3xl bg-brand-gradient-tile p-6 text-white shadow-raised md:p-8">
        <div className="relative z-10 flex flex-col items-center gap-6 md:flex-row md:items-start">
          <div className="relative">
            {photoUrl ? (
              <img
                src={photoUrl}
                alt={user?.fullName ? `${user.fullName} profile photo` : "Profile photo"}
                className="h-24 w-24 rounded-2xl border-4 border-white/20 object-cover shadow-rest"
              />
            ) : (
              <div
                className="flex h-24 w-24 items-center justify-center rounded-2xl border-2 border-white/20 bg-white/10 text-2xl font-bold text-white shadow-rest backdrop-blur-md"
                aria-hidden="true"
              >
                {initials}
              </div>
            )}
            {uploadingAvatar && (
              <div className="absolute inset-0 flex items-center justify-center rounded-2xl bg-black/40">
                <Loader2 className="h-5 w-5 animate-spin text-white" />
              </div>
            )}
            <button
              type="button"
              onClick={() => setShowPhotoPicker((open) => !open)}
              aria-expanded={showPhotoPicker}
              aria-label="Change profile picture"
              className="absolute -bottom-2 -right-2 cursor-pointer rounded-xl bg-white p-2 text-primary shadow-raised transition-transform hover:scale-105 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white"
            >
              <Camera className="h-4 w-4" />
            </button>
          </div>

          <div className="flex-1 space-y-2 text-center md:text-left">
            <div className="flex flex-wrap items-center justify-center gap-2 md:justify-start">
              <span className="flex items-center gap-1.5 rounded-full border border-white/20 bg-white/15 px-3 py-1 text-xs font-semibold text-white backdrop-blur-md">
                <Shield className="h-3.5 w-3.5" aria-hidden="true" />
                {user ? ROLE_LABELS[user.role] : "Member"}
              </span>
              <span className="flex items-center gap-1.5 rounded-full border border-white/20 bg-white/15 px-3 py-1 text-xs font-semibold text-white backdrop-blur-md">
                <Building2 className="h-3.5 w-3.5" aria-hidden="true" />
                {user?.organizationName || "Organization"}
              </span>
            </div>
            <h1 className="font-display text-2xl font-bold tracking-tight text-white md:text-3xl">
              {user?.fullName || "Account Overview"}
            </h1>
            <p className="flex items-center justify-center gap-1.5 text-sm text-white/80 md:justify-start">
              <Calendar className="h-4 w-4" aria-hidden="true" />
              Member since {joinedDate}
            </p>
          </div>
        </div>

        {/* Avatar picker: upload from computer, preset, or URL */}
        {showPhotoPicker && (
          <div className="mt-6 space-y-4 border-t border-white/15 pt-6 animate-in slide-in-from-top-2">
            <div className="flex flex-wrap items-center gap-3">
              <input
                type="file"
                accept="image/png,image/jpeg,image/webp"
                onChange={handleAvatarFileChange}
                className="sr-only"
                id="avatar-upload"
              />
              <label
                htmlFor="avatar-upload"
                className="inline-flex cursor-pointer items-center gap-2 rounded-xl bg-white px-3.5 py-2 text-xs font-semibold text-primary shadow-rest transition-colors hover:bg-white/90 focus-within:ring-2 focus-within:ring-white"
              >
                <Upload className="h-3.5 w-3.5" aria-hidden="true" />
                Upload from computer
              </label>
              <span className="text-[11px] text-white/70">PNG, JPG or WebP · max 5MB</span>
            </div>

            <div className="space-y-2">
              <p className="text-xs font-semibold uppercase tracking-wider text-white/90">
                Or pick a preset
              </p>
              <div className="flex flex-wrap items-center gap-3">
                {AVATAR_PRESETS.map((url, i) => (
                  <button
                    key={url}
                    type="button"
                    aria-label={`Use preset avatar ${i + 1}`}
                    aria-pressed={photoUrl === url}
                    onClick={() => {
                      setPhotoUrl(url);
                      setShowPhotoPicker(false);
                      toast("Avatar selected! Click 'Save Changes' to update.", "info");
                    }}
                    className={`h-12 w-12 overflow-hidden rounded-xl border-2 transition-transform hover:scale-105 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white ${
                      photoUrl === url ? "border-white ring-2 ring-white/70" : "border-white/30"
                    }`}
                  >
                    <img src={url} alt="" className="h-full w-full object-cover" />
                  </button>
                ))}
              </div>
            </div>

            <div className="flex gap-2">
              <Label htmlFor="avatar-url" className="sr-only">
                Avatar image URL
              </Label>
              <div className="relative flex-1">
                <Link2
                  className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-white/60"
                  aria-hidden="true"
                />
                <Input
                  id="avatar-url"
                  type="url"
                  value={photoUrl}
                  onChange={(e) => setPhotoUrl(e.target.value)}
                  placeholder="https://example.com/avatar.jpg"
                  className="rounded-xl border-white/20 bg-white/10 pl-8 text-xs text-white placeholder:text-white/50"
                />
              </div>
              <Button
                variant="outline"
                size="sm"
                onClick={() => setShowPhotoPicker(false)}
                className="rounded-xl border-white/30 bg-white/20 text-white hover:bg-white/30"
              >
                Done
              </Button>
            </div>
          </div>
        )}
      </div>

      {/* Main Grid: Details Form & Security */}
      <div className="grid grid-cols-1 gap-6 md:grid-cols-3">
        <div className="space-y-6 md:col-span-2">
          <Card className="card-static rounded-2xl">
            <CardContent className="space-y-5 p-6">
              <div>
                <CardTitle className="flex items-center gap-2 font-display text-lg font-bold text-gray-900">
                  <User className="h-5 w-5 text-primary" aria-hidden="true" />
                  Personal Information
                </CardTitle>
                <CardDescription className="text-xs">
                  Update your contact details and display preferences
                </CardDescription>
              </div>

              <form onSubmit={handleSaveDetails} className="space-y-4">
                <div className="space-y-1.5">
                  <Label htmlFor="fullName" className="text-xs font-semibold text-gray-700">
                    Full Name
                  </Label>
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
                  <Label htmlFor="email" className="text-xs font-semibold text-gray-700">
                    Email Address
                  </Label>
                  <div className="relative">
                    <Mail
                      className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400"
                      aria-hidden="true"
                    />
                    <Input
                      id="email"
                      type="email"
                      value={email}
                      readOnly
                      aria-describedby="email-hint"
                      className="input-premium cursor-not-allowed pl-9 text-gray-500"
                    />
                  </div>
                  <p id="email-hint" className="text-[11px] text-gray-500">
                    Contact an administrator to change your sign-in email.
                  </p>
                </div>

                <div className="grid grid-cols-1 gap-4 pt-2 sm:grid-cols-2">
                  <div className="space-y-1.5">
                    <Label htmlFor="systemRole" className="text-xs font-semibold text-gray-700">
                      System Role
                    </Label>
                    <Input
                      id="systemRole"
                      value={user ? ROLE_LABELS[user.role] : "Member"}
                      disabled
                      className="cursor-not-allowed rounded-lg border-gray-200 bg-gray-50 text-xs font-medium text-gray-500"
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="organization" className="text-xs font-semibold text-gray-700">
                      Organization
                    </Label>
                    <Input
                      id="organization"
                      value={user?.organizationName || "Organization"}
                      disabled
                      className="cursor-not-allowed rounded-lg border-gray-200 bg-gray-50 text-xs font-medium text-gray-500"
                    />
                  </div>
                </div>

                <div className="flex justify-end pt-3">
                  <Button
                    type="submit"
                    disabled={savingDetails || uploadingAvatar}
                    className="h-10 rounded-xl bg-brand-gradient font-semibold shadow-rest"
                  >
                    {savingDetails ? "Saving..." : "Save Changes"}
                  </Button>
                </div>
              </form>
            </CardContent>
          </Card>

          {/* Change Password */}
          <Card className="card-static rounded-2xl">
            <CardContent className="space-y-5 p-6">
              <div>
                <CardTitle className="flex items-center gap-2 font-display text-lg font-bold text-gray-900">
                  <KeyRound className="h-5 w-5 text-primary" aria-hidden="true" />
                  Security &amp; Password
                </CardTitle>
                <CardDescription className="text-xs">
                  Change your password to maintain account security
                </CardDescription>
              </div>

              <form onSubmit={handleUpdatePassword} className="space-y-4">
                <div className="space-y-1.5">
                  <Label htmlFor="currentPassword" className="text-xs font-semibold text-gray-700">
                    Current Password
                  </Label>
                  <div className="relative">
                    <Input
                      id="currentPassword"
                      type={showCurrentPassword ? "text" : "password"}
                      value={currentPassword}
                      onChange={(e) => setCurrentPassword(e.target.value)}
                      placeholder="••••••••"
                      autoComplete="current-password"
                      required
                      className="input-premium pr-11"
                    />
                    <button
                      type="button"
                      onMouseDown={(e) => e.preventDefault()}
                      onClick={() => setShowCurrentPassword((v) => !v)}
                      aria-label={showCurrentPassword ? "Hide current password" : "Show current password"}
                      aria-pressed={showCurrentPassword}
                      className={INPUT_ADORNMENT}
                    >
                      {showCurrentPassword ? (
                        <EyeOff className="h-4 w-4" aria-hidden="true" />
                      ) : (
                        <Eye className="h-4 w-4" aria-hidden="true" />
                      )}
                    </button>
                  </div>
                </div>

                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                  <div className="space-y-1.5">
                    <Label htmlFor="newPassword" className="text-xs font-semibold text-gray-700">
                      New Password
                    </Label>
                    <div className="relative">
                      <Input
                        id="newPassword"
                        type={showNewPassword ? "text" : "password"}
                        value={newPassword}
                        onChange={(e) => setNewPassword(e.target.value)}
                        placeholder="••••••••"
                        autoComplete="new-password"
                        minLength={8}
                        required
                        className="input-premium pr-11"
                      />
                      <button
                        type="button"
                        onMouseDown={(e) => e.preventDefault()}
                        onClick={() => setShowNewPassword((v) => !v)}
                        aria-label={showNewPassword ? "Hide new password" : "Show new password"}
                        aria-pressed={showNewPassword}
                        className={INPUT_ADORNMENT}
                      >
                        {showNewPassword ? (
                          <EyeOff className="h-4 w-4" aria-hidden="true" />
                        ) : (
                          <Eye className="h-4 w-4" aria-hidden="true" />
                        )}
                      </button>
                    </div>
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="confirmPassword" className="text-xs font-semibold text-gray-700">
                      Confirm New Password
                    </Label>
                    <div className="relative">
                      <Input
                        id="confirmPassword"
                        type={showConfirmPassword ? "text" : "password"}
                        value={confirmPassword}
                        onChange={(e) => setConfirmPassword(e.target.value)}
                        placeholder="••••••••"
                        autoComplete="new-password"
                        minLength={8}
                        required
                        className="input-premium pr-11"
                      />
                      <button
                        type="button"
                        onMouseDown={(e) => e.preventDefault()}
                        onClick={() => setShowConfirmPassword((v) => !v)}
                        aria-label={showConfirmPassword ? "Hide confirm password" : "Show confirm password"}
                        aria-pressed={showConfirmPassword}
                        className={INPUT_ADORNMENT}
                      >
                        {showConfirmPassword ? (
                          <EyeOff className="h-4 w-4" aria-hidden="true" />
                        ) : (
                          <Eye className="h-4 w-4" aria-hidden="true" />
                        )}
                      </button>
                    </div>
                  </div>
                </div>

                {newPassword && confirmPassword && newPassword !== confirmPassword && (
                  <p role="alert" className="text-[11px] font-medium text-destructive">
                    Passwords do not match.
                  </p>
                )}

                <div className="flex justify-end pt-3">
                  <Button
                    type="submit"
                    disabled={savingPassword}
                    variant="outline"
                    className="h-10 rounded-xl border-primary/20 font-semibold text-primary hover:bg-primary/5"
                  >
                    {savingPassword ? "Updating..." : "Update Password"}
                  </Button>
                </div>
              </form>
            </CardContent>
          </Card>
        </div>

        {/* Right column */}
        <div className="space-y-6">
          <Card className="card-static rounded-2xl">
            <CardContent className="space-y-4 p-6">
              <h3 className="flex items-center gap-1.5 font-display text-xs font-semibold uppercase tracking-wider text-ink">
                <Sparkles className="h-4 w-4 text-primary" aria-hidden="true" />
                Role Privileges
              </h3>

              <div className="space-y-3 text-xs">
                <div className="flex items-start gap-2.5 rounded-xl border border-primary/15 bg-primary/5 p-3">
                  <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-primary" aria-hidden="true" />
                  <div>
                    <p className="font-bold text-ink">{user ? ROLE_LABELS[user.role] : "Member"}</p>
                    <p className="mt-0.5 text-gray-600">
                      {user?.role === "admin"
                        ? "Full organization administration, team member management, and report export."
                        : user?.role === "event_manager"
                          ? "Room creation, live streaming management, and form building privileges."
                          : "Field attendance check-ins, activity submission, and room access."}
                    </p>
                  </div>
                </div>

                <dl className="space-y-2 rounded-xl border border-gray-200 bg-gray-50 p-3 text-gray-600">
                  <div className="flex items-center justify-between">
                    <dt className="font-medium text-gray-500">Joined Date</dt>
                    <dd className="font-semibold text-gray-900">{joinedDate}</dd>
                  </div>
                  <div className="flex items-center justify-between">
                    <dt className="font-medium text-gray-500">Account ID</dt>
                    <dd className="rounded bg-gray-200/60 px-1.5 py-0.5 font-mono text-[11px] text-gray-700">
                      {user?.id?.slice(0, 8)}…
                    </dd>
                  </div>
                  <div className="flex items-center justify-between">
                    <dt className="font-medium text-gray-500">Status</dt>
                    <dd className="rounded-full bg-success/10 px-2 py-0.5 text-[10px] font-bold text-success">
                      Verified
                    </dd>
                  </div>
                </dl>
              </div>
            </CardContent>
          </Card>

          {/* Organization Logo */}
          <Card className="card-static rounded-2xl">
            <CardContent className="space-y-4 p-6">
              <h3 className="flex items-center gap-1.5 font-display text-xs font-semibold uppercase tracking-wider text-ink">
                <ImageIcon className="h-4 w-4 text-primary" aria-hidden="true" />
                Organization Logo
              </h3>

              <div className="flex items-start gap-4">
                {logoPreview ? (
                  <div className="relative h-20 w-20 shrink-0 overflow-hidden rounded-xl border-2 border-gray-200">
                    <img
                      src={logoPreview}
                      alt="Organization logo preview"
                      className="h-full w-full object-cover"
                    />
                    <button
                      type="button"
                      onClick={handleRemoveLogo}
                      aria-label="Remove logo"
                      className="absolute -right-1 -top-1 flex h-5 w-5 items-center justify-center rounded-full bg-destructive text-white transition-colors hover:opacity-90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-destructive/40"
                    >
                      <X className="h-3 w-3" aria-hidden="true" />
                    </button>
                    {uploadingLogo && (
                      <div className="absolute inset-0 flex items-center justify-center bg-black/40">
                        <Loader2 className="h-4 w-4 animate-spin text-white" />
                      </div>
                    )}
                  </div>
                ) : (
                  <div className="flex h-20 w-20 shrink-0 items-center justify-center rounded-xl border-2 border-dashed border-gray-300 bg-gray-50">
                    <Upload className="h-6 w-6 text-gray-400" aria-hidden="true" />
                  </div>
                )}

                <div className="flex-1 space-y-2">
                  <input
                    type="file"
                    accept="image/png,image/jpeg,image/webp"
                    onChange={handleLogoFileChange}
                    className="sr-only"
                    id="logo-upload"
                  />
                  <label
                    htmlFor="logo-upload"
                    className="inline-flex cursor-pointer items-center gap-1.5 rounded-lg border border-primary/20 bg-primary/5 px-3 py-1.5 text-xs font-semibold text-primary transition-colors hover:bg-primary/10 focus-within:ring-2 focus-within:ring-primary/40"
                  >
                    <Upload className="h-3.5 w-3.5" aria-hidden="true" />
                    {uploadingLogo ? "Uploading…" : "Upload Logo"}
                  </label>

                  <Label htmlFor="logo-url" className="sr-only">
                    Logo image URL
                  </Label>
                  <div className="flex gap-2">
                    <Input
                      id="logo-url"
                      type="url"
                      value={logoUrl}
                      onChange={(e) => {
                        setLogoUrl(e.target.value);
                        setLogoPreview(e.target.value || null);
                      }}
                      placeholder="Or paste an image URL"
                      className="input-premium text-xs"
                    />
                    <Button
                      type="button"
                      size="sm"
                      onClick={handleSaveLogo}
                      disabled={savingLogo || uploadingLogo}
                      className="h-8 rounded-lg bg-brand-gradient text-xs font-semibold"
                    >
                      {savingLogo ? "Saving…" : "Save logo"}
                    </Button>
                  </div>
                  <p className="text-[11px] text-gray-500">PNG, JPG or WebP. Max 5MB.</p>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
};
