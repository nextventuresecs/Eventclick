import { useState, type FormEvent } from "react";
import { Link, useSearchParams, useNavigate } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";
import { ApiClientError } from "@/lib/api";
import { ResetPasswordSchema } from "@application/shared";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { CheckCircle2, ArrowLeft, AlertCircle } from "lucide-react";
import { AuthLayout } from "@/components/layout/AuthLayout";

export const ResetPasswordPage = () => {
  const { resetPassword } = useAuth();
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();

  const token = searchParams.get("token") || "";

  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);

    if (!token) {
      setError("Reset token is missing or invalid. Please request a new password reset link.");
      return;
    }

    if (password !== confirmPassword) {
      setError("Passwords do not match");
      return;
    }

    const parsed = ResetPasswordSchema.safeParse({ token, password });
    if (!parsed.success) {
      setError(parsed.error.issues[0]?.message ?? "Invalid input");
      return;
    }

    setSubmitting(true);
    try {
      await resetPassword({ token, password });
      setSuccess(true);
    } catch (err) {
      setError(err instanceof ApiClientError ? err.message : "Failed to reset password");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <AuthLayout>
      <div className="flex flex-col gap-6">
        <div className="mb-2 text-center lg:text-left">
          <h2 className="text-2xl font-bold tracking-tight font-display text-(--color-gray-900)">Set new password</h2>
          <p className="text-sm text-gray-400 mt-1.5">Choose a strong password for your account</p>
        </div>

        {!token ? (
          <div className="flex flex-col items-center gap-4 text-center py-2">
            <div className="flex h-12 w-12 items-center justify-center rounded-full bg-status-cancelled-bg text-(--color-error)">
              <AlertCircle className="w-6 h-6" />
            </div>
            <div>
              <p className="text-sm font-medium text-(--color-gray-900)">Invalid or missing reset link</p>
              <p className="text-sm text-gray-400 mt-1">
                Please request a new password reset link from the sign-in page.
              </p>
            </div>
            <Link to="/forgot-password" className="w-full mt-2">
              <Button className="w-full h-11 text-base font-semibold" variant="outline">
                Request new link
              </Button>
            </Link>
          </div>
        ) : success ? (
          <div className="flex flex-col items-center gap-4 text-center py-2">
            <div className="flex h-12 w-12 items-center justify-center rounded-full bg-status-live-bg text-status-live">
              <CheckCircle2 className="w-6 h-6" />
            </div>
            <div>
              <p className="text-sm font-medium text-(--color-gray-900)">Password reset successful</p>
              <p className="text-sm text-gray-400 mt-1">
                You can now log in to your account with your new password.
              </p>
            </div>
            <Button onClick={() => navigate("/login")} className="w-full mt-2 h-11 text-base font-semibold bg-brand-gradient border-0 hover:opacity-90 transition-opacity">
              Sign in
            </Button>
          </div>
        ) : (
          <form onSubmit={onSubmit} className="flex flex-col gap-4">
            <div className="flex flex-col gap-2">
              <Label htmlFor="password" className="text-sm font-medium text-(--color-gray-600)">New Password</Label>
              <Input
                id="password"
                type="password"
                autoComplete="new-password"
                required
                placeholder="••••••••"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                disabled={submitting}
                className="input-premium"
              />
              <p className="text-xs text-gray-400">Minimum 8 characters</p>
            </div>
            <div className="flex flex-col gap-2">
              <Label htmlFor="confirmPassword" className="text-sm font-medium text-(--color-gray-600)">Confirm Password</Label>
              <Input
                id="confirmPassword"
                type="password"
                autoComplete="new-password"
                required
                placeholder="••••••••"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                disabled={submitting}
                className="input-premium"
              />
            </div>

            {error && <p className="text-sm text-(--color-error)">{error}</p>}

            <Button type="submit" disabled={submitting} className="w-full mt-2 h-11 text-base font-semibold bg-brand-gradient border-0 hover:opacity-90 transition-opacity">
              {submitting ? "Resetting…" : "Reset password"}
            </Button>
          </form>
        )}

        <div className="mt-6 text-center text-sm text-(--color-gray-600)">
          <Link to="/login" className="inline-flex items-center gap-1.5 font-medium text-(--color-primary) hover:underline">
            <ArrowLeft className="w-3.5 h-3.5" />
            Back to sign in
          </Link>
        </div>
      </div>
    </AuthLayout>
  );
};