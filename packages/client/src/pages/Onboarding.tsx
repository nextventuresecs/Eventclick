import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";
import { ApiClientError } from "@/lib/api";
import { OnboardingSchema } from "@application/shared";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

export const OnboardingPage = () => {
  const { completeOnboarding, logout } = useAuth();
  const navigate = useNavigate();

  const [role, setRole] = useState<"ngo_admin" | "volunteer" | null>(null);
  const [organizationName, setOrganizationName] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = async () => {
    if (!role) {
      setError("Please select a role to continue");
      return;
    }

    setError(null);

    const parsed = OnboardingSchema.safeParse({
      role,
      organizationName: role === "ngo_admin" ? organizationName : undefined,
    });

    if (!parsed.success) {
      setError(parsed.error.issues[0]?.message ?? "Invalid input");
      return;
    }

    setSubmitting(true);
    try {
      await completeOnboarding(parsed.data);
      // Mark onboarding as completed in localStorage to bypass redirection gates
      localStorage.setItem(
        "Eventclick_onboarding_completed_or_skipped",
        "true",
      );
      navigate("/dashboard", { replace: true });
    } catch (err) {
      setError(
        err instanceof ApiClientError ? err.message : "Onboarding failed",
      );
    } finally {
      setSubmitting(false);
    }
  };

  const handleLogout = async () => {
    try {
      await logout();
      navigate("/login", { replace: true });
    } catch {
      // Ignored
    }
  };

  return (
    <div className="relative flex min-h-screen items-center justify-center p-6">
      <Card className="relative z-10 w-full max-w-xl border border-(--color-border) bg-(--color-card) shadow-2xl">
        <CardHeader className="text-center pb-2">
          <CardTitle className="text-3xl font-extrabold tracking-tight font-display text-(--color-gray-900)">
            Welcome to Eventclick
          </CardTitle>
          <CardDescription className="text-sm text-muted-foreground mt-2 max-w-md mx-auto">
            Choose how you would like to participate on the platform. You can
            always change your settings later.
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-6 pt-6">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {/* NGO Admin Option */}
            <div
              onClick={() => {
                setRole("ngo_admin");
                setError(null);
              }}
              className={`group relative flex flex-col gap-3 rounded-xl border p-5 cursor-pointer transition-all duration-200 select-none ${
                role === "ngo_admin" ? "role-card-active" : "role-card-inactive"
              }`}
            >
              <div className="flex items-center gap-3">
                <div
                  className={`flex h-10 w-10 items-center justify-center rounded-lg transition-colors ${
                    role === "ngo_admin" ? "role-icon-active" : "role-icon-inactive"
                  }`}
                >
                  <svg
                    xmlns="http://www.w3.org/2000/svg"
                    fill="none"
                    viewBox="0 0 24 24"
                    strokeWidth={2}
                    stroke="currentColor"
                    className="h-5 w-5"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      d="M12 21v-8.25M15.75 21v-8.25M8.25 21v-8.25M3 9l9-6 9 6m-1.5 12V10.332A48.36 48.36 0 0 0 12 9.75c-2.551 0-5.056.2-7.5.582V21M3 21h18M12 6.75h.008v.008H12V6.75Z"
                    />
                  </svg>
                </div>
                <h3 className="font-bold text-foreground transition-colors group-hover:text-primary">
                  NGO Admin
                </h3>
              </div>
              <p className="text-xs text-muted-foreground leading-relaxed">
                Create and manage your own organization, design attendance
                forms, and orchestrate hybrid events.
              </p>
            </div>

            {/* Volunteer Option */}
            <div
              onClick={() => {
                setRole("volunteer");
                setError(null);
                setOrganizationName("");
              }}
              className={`group relative flex flex-col gap-3 rounded-xl border p-5 cursor-pointer transition-all duration-200 select-none ${
                role === "volunteer" ? "role-card-active" : "role-card-inactive"
              }`}
            >
              <div className="flex items-center gap-3">
                <div
                  className={`flex h-10 w-10 items-center justify-center rounded-lg transition-colors ${
                    role === "volunteer" ? "role-icon-active" : "role-icon-inactive"
                  }`}
                >
                  <svg
                    xmlns="http://www.w3.org/2000/svg"
                    fill="none"
                    viewBox="0 0 24 24"
                    strokeWidth={2}
                    stroke="currentColor"
                    className="h-5 w-5"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      d="M18 18.72a9.094 9.094 0 0 0 3.741-.479 3 3 0 0 0-4.682-2.72m.94 3.198.001.031c0 .225-.012.447-.037.666A11.944 11.944 0 0 1 12 21c-2.17 0-4.207-.576-5.963-1.584A6.062 6.062 0 0 1 6 18.719m12 0a5.971 5.971 0 0 0-.941-3.197m0 0A5.995 5.995 0 0 0 12 12.75a5.995 5.995 0 0 0-5.058 2.772m0 0a3 3 0 0 0-4.681 2.72 8.986 8.986 0 0 0 3.74.477m.94-3.197a5.971 5.971 0 0 0-.94 3.197M15 6.75a3 3 0 1 1-6 0 3 3 0 0 1 6 0Zm6 3a2.25 2.25 0 1 1-4.5 0 2.25 2.25 0 0 1 4.5 0Zm-13.5 0a2.25 2.25 0 1 1-4.5 0 2.25 2.25 0 0 1 4.5 0Z"
                    />
                  </svg>
                </div>
                <h3 className="font-bold text-foreground transition-colors group-hover:text-primary">
                  Volunteer
                </h3>
              </div>
              <p className="text-xs text-muted-foreground leading-relaxed">
                Join live event rooms, scan attendance, take photos of
                activities, and contribute directly on-site.
              </p>
            </div>
          </div>

          {/* Conditional NGO Admin fields */}
          {role === "ngo_admin" && (
            <div className="flex flex-col gap-2 rounded-xl border border-(--color-gray-200) bg-(--color-gray-50) p-4">
              <Label htmlFor="orgName" className="font-semibold">
                Organization Name
              </Label>
              <Input
                id="orgName"
                type="text"
                placeholder="e.g. Hope Foundation"
                required
                value={organizationName}
                onChange={(e) => setOrganizationName(e.target.value)}
                disabled={submitting}
                className="mt-1 focus:border-primary focus:ring-1 focus:ring-primary"
              />
              <p className="text-xs text-muted-foreground mt-1">
                This will create a shared workspace for all administrators and
                volunteers under your NGO.
              </p>
            </div>
          )}

          {error && (
            <p className="text-sm text-destructive text-center font-medium">
              {error}
            </p>
          )}
        </CardContent>
        <CardFooter className="flex flex-col gap-3 justify-center border-t border-(--color-gray-200) pt-6">
          <Button
            onClick={handleSubmit}
            disabled={submitting || !role}
            className="w-full h-11"
          >
            {submitting ? "Processing…" : "Complete Onboarding"}
          </Button>
          <button
            onClick={handleLogout}
            className="text-xs text-muted-foreground hover:text-foreground transition-colors py-1 hover:underline"
          >
            Log out and sign in as different user
          </button>
        </CardFooter>
      </Card>
    </div>
  );
};
