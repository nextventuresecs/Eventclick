import { useState, type FormEvent } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { LoginSchema } from "@application/shared";
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
import { GoogleSignInButton } from "@/components/GoogleSignInButton";

export const LoginPage = () => {
  const { login, loginWithGoogle } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const redirectTo =
    (location.state as { from?: string } | null)?.from ?? "/dashboard";

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);

    const parsed = LoginSchema.safeParse({ email, password });
    if (!parsed.success) {
      setError(parsed.error.issues[0]?.message ?? "Invalid input");
      return;
    }

    setSubmitting(true);
    try {
      await login(parsed.data.email, parsed.data.password);
      navigate(redirectTo, { replace: true });
    } catch (err) {
      setError(err instanceof ApiClientError ? err.message : "Login failed");
    } finally {
      setSubmitting(false);
    }
  };

  const onGoogle = async (idToken: string) => {
    setError(null);
    setSubmitting(true);
    try {
      await loginWithGoogle(idToken);
      navigate(redirectTo, { replace: true });
    } catch (err) {
      setError(
        err instanceof ApiClientError ? err.message : "Google sign-in failed",
      );
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="mx-auto flex min-h-screen w-full max-w-md flex-col justify-center p-6">
      <div className="mb-6 text-center">
        <div className="mx-auto h-12 w-12 rounded-xl bg-[var(--gradient-brand)] flex items-center justify-center mb-3 shadow-sm">
          <img
            src="/only_icon.png"
            alt="Eventclick"
            className="h-6 w-6 object-contain"
          />
        </div>
        <h1 className="text-2xl font-bold tracking-tight font-display text-[var(--color-gray-900)]">Welcome back</h1>
        <p className="text-sm text-[var(--color-gray-400)] mt-1">Sign in to your organization workspace</p>
      </div>
      <Card className="card-static rounded-2xl">
        <CardContent className="flex flex-col gap-5 pt-6">
          <GoogleSignInButton onToken={onGoogle} disabled={submitting} />
          <div className="flex items-center gap-3">
            <div className="h-px flex-1 bg-[var(--color-gray-200)]" />
            <span className="text-xs uppercase text-[var(--color-gray-400)] tracking-wide">or</span>
            <div className="h-px flex-1 bg-[var(--color-gray-200)]" />
          </div>

          <form onSubmit={onSubmit} className="flex flex-col gap-4">
            <div className="flex flex-col gap-2">
              <Label htmlFor="email" className="text-sm font-medium text-[var(--color-gray-600)]">Email</Label>
              <Input
                id="email"
                type="email"
                autoComplete="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                disabled={submitting}
                className="input-premium"
              />
            </div>
            <div className="flex flex-col gap-2">
              <div className="flex items-center justify-between">
                <Label htmlFor="password" className="text-sm font-medium text-[var(--color-gray-600)]">Password</Label>
                <Link
                  to="/forgot-password"
                  className="text-xs font-medium text-[var(--color-primary)] hover:underline"
                >
                  Forgot password?
                </Link>
              </div>
              <Input
                id="password"
                type="password"
                autoComplete="current-password"
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                disabled={submitting}
                className="input-premium"
              />
            </div>

            {error && <p className="text-sm text-[var(--color-error)]">{error}</p>}

            <Button type="submit" disabled={submitting} className="bg-[var(--gradient-brand)] text-white shadow-sm hover:opacity-90 transition-all duration-150 ease-out">
              {submitting ? "Signing in…" : "Sign in"}
            </Button>
          </form>
        </CardContent>
        <CardFooter className="justify-center text-sm text-[var(--color-gray-400)]">
          Don't have an account?&nbsp;
          <Link
            to="/register"
            className="font-medium text-[var(--color-primary)] hover:underline"
          >
            Create one
          </Link>
        </CardFooter>
      </Card>
    </div>
  );
};