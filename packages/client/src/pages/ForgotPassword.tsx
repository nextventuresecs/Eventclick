import { useState, type FormEvent } from "react";
import { Link } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";
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
import { Mail, CheckCircle2, ArrowLeft } from "lucide-react";

export const ForgotPasswordPage = () => {
  const { forgotPassword } = useAuth();
  const [email, setEmail] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);

    if (!email) {
      setError("Please enter your email address");
      return;
    }

    setSubmitting(true);
    try {
      await forgotPassword(email.trim().toLowerCase());
      setSuccess(true);
    } catch (err) {
      setError(err instanceof ApiClientError ? err.message : "Failed to send reset link");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="mx-auto flex min-h-screen w-full max-w-md flex-col justify-center p-6">
      <div className="mb-8 text-center">
        <div className="mx-auto h-12 w-12 rounded-xl bg-brand-gradient flex items-center justify-center mb-4 shadow-sm">
          <img
            src="/only_icon.png"
            alt="Eventclick"
            className="h-6 w-6 object-contain"
          />
        </div>
        <h1 className="text-2xl font-bold tracking-tight font-display text-[var(--color-gray-900)]">Reset password</h1>
        <p className="text-sm text-[var(--color-gray-400)] mt-1.5">We'll send a link to your email to get you back in</p>
      </div>
      <Card className="card-static rounded-2xl">
        <CardContent className="pt-6">
          {success ? (
            <div className="flex flex-col items-center gap-4 text-center py-2">
              <div className="flex h-12 w-12 items-center justify-center rounded-full bg-[var(--color-status-live-bg)] text-[var(--color-status-live)]">
                <CheckCircle2 className="w-6 h-6" />
              </div>
              <div>
                <p className="text-sm font-medium text-[var(--color-gray-900)]">Check your inbox</p>
                <p className="text-sm text-[var(--color-gray-400)] mt-1">
                  We've sent a password reset link to{" "}
                  <strong className="text-[var(--color-gray-900)]">{email}</strong>.
                  If the email exists, it should arrive in a few minutes.
                </p>
              </div>
            </div>
          ) : (
            <form onSubmit={onSubmit} className="flex flex-col gap-4">
              <div className="flex flex-col gap-2">
                <Label htmlFor="email" className="text-sm font-medium text-[var(--color-gray-600)]">Email</Label>
                <Input
                  id="email"
                  type="email"
                  autoComplete="email"
                  required
                  placeholder="name@example.com"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  disabled={submitting}
                  className="input-premium"
                />
              </div>

              {error && <p className="text-sm text-[var(--color-error)]">{error}</p>}

              <Button type="submit" disabled={submitting} className="w-full">
                {submitting ? "Sending…" : "Send reset link"}
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