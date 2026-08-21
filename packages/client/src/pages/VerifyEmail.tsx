import { useEffect, useState, useRef, type FormEvent } from "react";
import { Link, useSearchParams, useNavigate } from "react-router-dom";
import { SetPasswordSchema } from "@application/shared";
import { ApiClientError } from "@/lib/api";
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
import { useAuth } from "@/hooks/useAuth";
import { CheckCircle2, AlertCircle, ArrowLeft, Mail } from "lucide-react";

export const VerifyEmailPage = () => {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const { user, verifyEmail, setPassword } = useAuth();

  const token = searchParams.get("token") || "";

  const [status, setStatus] = useState<"loading" | "success" | "error">("loading");
  const [error, setError] = useState<string | null>(null);
  const [passwordSetupRequired, setPasswordSetupRequired] = useState(false);
  const [passwordSetupDone, setPasswordSetupDone] = useState(false);

  const hasAttempted = useRef(false);

  useEffect(() => {
    if (!token) {
      setStatus("error");
      setError("Verification token is missing. Please check your email link.");
      return;
    }

    if (hasAttempted.current) return;
    hasAttempted.current = true;

    const verify = async () => {
      try {
        const { passwordSetupRequired: needsPassword } = await verifyEmail(token);
        setPasswordSetupRequired(needsPassword);
        setStatus("success");
      } catch (err) {
        setStatus("error");
        setError(err instanceof ApiClientError ? err.message : "Failed to verify email. The link may be expired or invalid.");
      }
    };

    verify();
  }, [token, verifyEmail]);

  const showPasswordForm = status === "success" && passwordSetupRequired && !passwordSetupDone;

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
        <h1 className="text-2xl font-bold tracking-tight font-display text-(--color-gray-900)">Verify your email</h1>
        <p className="text-sm text-gray-400 mt-1.5">Confirm your email address to access all features</p>
      </div>
      <Card className="card-static rounded-2xl">
        <CardContent className="pt-6">
          {status === "loading" && (
            <div className="flex flex-col items-center gap-4 py-4">
              <div className="flex h-12 w-12 items-center justify-center rounded-full bg-(--color-gray-100) text-(--color-primary)">
                <Mail className="w-6 h-6 animate-pulse" />
              </div>
              <p className="text-sm text-gray-400">Verifying your email address…</p>
            </div>
          )}

          {showPasswordForm && (
            <PasswordSetupForm
              onSubmit={async (password) => {
                await setPassword(password);
                setPasswordSetupDone(true);
              }}
            />
          )}

          {status === "success" && (!passwordSetupRequired || passwordSetupDone) && (
            <div className="flex flex-col items-center gap-4 text-center py-2">
              <div className="flex h-12 w-12 items-center justify-center rounded-full bg-status-live-bg text-status-live">
                <CheckCircle2 className="w-6 h-6" />
              </div>
              <div>
                <p className="text-sm font-medium text-(--color-gray-900)">Email verified</p>
                <p className="text-sm text-gray-400 mt-1">
                  Thank you for verifying your email address. You can now access all features of your account.
                </p>
              </div>
              <Button onClick={() => navigate(user ? "/dashboard" : "/login")} className="w-full mt-2">
                {user ? "Go to Dashboard" : "Sign in"}
              </Button>
            </div>
          )}

          {status === "error" && (
            <div className="flex flex-col items-center gap-4 text-center py-2">
              <div className="flex h-12 w-12 items-center justify-center rounded-full bg-status-cancelled-bg text-(--color-error)">
                <AlertCircle className="w-6 h-6" />
              </div>
              <div>
                <p className="text-sm font-medium text-(--color-gray-900)">Verification failed</p>
                <p className="text-sm text-gray-400 mt-1">{error}</p>
              </div>
              <Link to="/login" className="w-full mt-4">
                <Button className="w-full" variant="outline">
                  Return to sign in
                </Button>
              </Link>
            </div>
          )}
        </CardContent>
        <CardFooter className="flex-col justify-center gap-2 text-sm text-gray-400">
          <Link to="/login" className="inline-flex items-center gap-1.5 font-medium text-(--color-primary) hover:underline">
            <ArrowLeft className="w-3.5 h-3.5" />
            Back to sign in
          </Link>
          <div className="flex items-center gap-4 pt-1">
            <a href="https://eventclick.live/terms" target="_blank" rel="noopener noreferrer" className="text-xs text-gray-400 hover:text-(--color-gray-600) transition-colors">Terms</a>
            <a href="https://eventclick.live/privacy" target="_blank" rel="noopener noreferrer" className="text-xs text-gray-400 hover:text-(--color-gray-600) transition-colors">Privacy</a>
          </div>
        </CardFooter>
      </Card>
    </div>
  );
};

/** Shown once, right after verifying, only for a USER_INVITED user an admin
 * created without a password (see auth.controller.ts's passwordSetupRequired
 * flag). Not a general change-password form. */
const PasswordSetupForm = ({ onSubmit }: { onSubmit: (password: string) => Promise<void> }) => {
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);

    if (password !== confirmPassword) {
      setError("Passwords do not match");
      return;
    }

    const parsed = SetPasswordSchema.safeParse({ password });
    if (!parsed.success) {
      setError(parsed.error.issues[0]?.message ?? "Invalid password");
      return;
    }

    setSubmitting(true);
    try {
      await onSubmit(password);
    } catch (err) {
      setError(err instanceof ApiClientError ? err.message : "Failed to set password");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-4 py-2">
      <div className="text-center">
        <p className="text-sm font-medium text-(--color-gray-900)">Set up your password</p>
        <p className="text-sm text-gray-400 mt-1">
          Your email is verified. Choose a password to finish setting up your account.
        </p>
      </div>
      {error && (
        <p className="text-sm text-(--color-error) text-center" role="alert">
          {error}
        </p>
      )}
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="setup-password">Password</Label>
        <Input
          id="setup-password"
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          required
          autoFocus
        />
      </div>
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="setup-confirm-password">Confirm password</Label>
        <Input
          id="setup-confirm-password"
          type="password"
          value={confirmPassword}
          onChange={(e) => setConfirmPassword(e.target.value)}
          required
        />
      </div>
      <Button type="submit" disabled={submitting} className="w-full mt-1">
        {submitting ? "Setting password…" : "Set password"}
      </Button>
    </form>
  );
};
