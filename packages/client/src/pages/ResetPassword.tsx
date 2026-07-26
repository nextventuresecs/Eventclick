import { useState, type FormEvent } from "react";
import { Link, useSearchParams, useNavigate } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";
import { ApiClientError } from "@/lib/api";
import { ResetPasswordSchema } from "@application/shared";
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
import { Lock, CheckCircle2, ArrowLeft, AlertCircle } from "lucide-react";

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
    <div className="mx-auto flex min-h-screen w-full max-w-md flex-col justify-center p-6">
      <div className="mb-8 text-center">
        <div className="mx-auto h-12 w-12 rounded-xl flex items-center justify-center mb-4 shadow-sm">
          <img
            src="/only_icon.png"
            alt="Eventclick"
            className="h-8 w-8 object-contain"
          />
        </div>
        <h1 className="text-2xl font-bold tracking-tight font-display text-[var(--color-gray-900)]">Set new password</h1>
        <p className="text-sm text-[var(--color-gray-400)] mt-1.5">Choose a strong password for your account</p>
      </div>
      <Card className="card-static rounded-2xl">
        <CardContent className="pt-6">
          {!token ? (
            <div className="flex flex-col items-center gap-4 text-center py-2">
              <div className="flex h-12 w-12 items-center justify-center rounded-full bg-[var(--color-status-cancelled-bg)] text-[var(--color-error)]">
                <AlertCircle className="w-6 h-6" />
              </div>
              <div>
                <p className="text-sm font-medium text-[var(--color-gray-900)]">Invalid or missing reset link</p>
                <p className="text-sm text-[var(--color-gray-400)] mt-1">
                  Please request a new password reset link from the sign-in page.
                </p>
              </div>
              <Link to="/forgot-password" className="w-full mt-2">
                <Button className="w-full" variant="outline">
                  Request new link
                </Button>
              </Link>
            </div>
          ) : success ? (
            <div className="flex flex-col items-center gap-4 text-center py-2">
              <div className="flex h-12 w-12 items-center justify-center rounded-full bg-[var(--color-status-live-bg)] text-[var(--color-status-live)]">
                <CheckCircle2 className="w-6 h-6" />
              </div>
              <div>
                <p className="text-sm font-medium text-[var(--color-gray-900)]">Password reset successful</p>
                <p className="text-sm text-[var(--color-gray-400)] mt-1">
                  You can now log in to your account with your new password.
                </p>
              </div>
              <Button onClick={() => navigate("/login")} className="w-full mt-2">
                Sign in
              </Button>
            </div>
          ) : (
            <form onSubmit={onSubmit} className="flex flex-col gap-4">
              <div className="flex flex-col gap-2">
                <Label htmlFor="password" className="text-sm font-medium text-[var(--color-gray-600)]">New Password</Label>
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
                <p className="text-xs text-[var(--color-gray-400)]">Minimum 8 characters</p>
              </div>
              <div className="flex flex-col gap-2">
                <Label htmlFor="confirmPassword" className="text-sm font-medium text-[var(--color-gray-600)]">Confirm Password</Label>
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

              {error && <p className="text-sm text-[var(--color-error)]">{error}</p>}

              <Button type="submit" disabled={submitting} className="w-full">
                {submitting ? "Resetting…" : "Reset password"}
              </Button>
            </form>
          )}
        </CardContent>
        <CardFooter className="flex-col justify-center gap-2 text-sm text-[var(--color-gray-400)]">
          <Link to="/login" className="inline-flex items-center gap-1.5 font-medium text-[var(--color-primary)] hover:underline">
            <ArrowLeft className="w-3.5 h-3.5" />
            Back to sign in
          </Link>
          <div className="flex items-center gap-4 pt-1">
            <Link to="/terms" className="text-xs text-[var(--color-gray-400)] hover:text-[var(--color-gray-600)] transition-colors">Terms</Link>
            <Link to="/privacy" className="text-xs text-[var(--color-gray-400)] hover:text-[var(--color-gray-600)] transition-colors">Privacy</Link>
          </div>
        </CardFooter>
      </Card>
    </div>
  );
};