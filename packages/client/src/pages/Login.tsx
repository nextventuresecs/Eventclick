import { useState, type FormEvent } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { LoginSchema } from "@application/shared";
import { useAuth } from "@/hooks/useAuth";
import { ApiClientError } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { GoogleSignInButton } from "@/components/GoogleSignInButton";
import { AuthLayout } from "@/components/layout/AuthLayout";

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
    <AuthLayout>
      <div className="flex flex-col gap-6">
        <div className="mb-2 text-center lg:text-left">
          <h2 className="text-2xl font-bold tracking-tight font-display text-(--color-gray-900)">Sign in</h2>
          <p className="text-sm text-gray-400 mt-1.5">Sign in to your organization workspace</p>
        </div>

        <form onSubmit={onSubmit} className="flex flex-col gap-4">
          <div className="flex flex-col gap-2">
            <Label htmlFor="email" className="text-sm font-medium text-(--color-gray-600)">Email</Label>
            <Input
              id="email"
              type="email"
              autoComplete="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              disabled={submitting}
              className="input-premium"
              placeholder="Enter email"
            />
          </div>
          <div className="flex flex-col gap-2">
            <div className="flex items-center justify-between">
              <Label htmlFor="password" className="text-sm font-medium text-(--color-gray-600)">Password</Label>
              <Link
                to="/forgot-password"
                className="text-xs font-medium text-(--color-primary) hover:underline"
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
              placeholder="Enter Password"
            />
          </div>

          {error && <p className="text-sm text-(--color-error)">{error}</p>}

          <Button type="submit" disabled={submitting} className="w-full mt-2 h-11 text-base font-semibold bg-brand-gradient border-0 hover:opacity-90 transition-opacity">
            {submitting ? "Signing in…" : "Sign In"}
          </Button>
        </form>

        <div className="flex items-center gap-3 mt-4">
          <div className="h-px flex-1 bg-(--color-gray-200)" />
          <span className="text-xs text-gray-400 tracking-wide">Sign In with</span>
          <div className="h-px flex-1 bg-(--color-gray-200)" />
        </div>
        
        <div className="flex justify-center">
          <GoogleSignInButton onToken={onGoogle} disabled={submitting} />
        </div>

        <div className="mt-6 text-center text-sm text-(--color-gray-600)">
          <span>Don't have an account?&nbsp;
            <Link
              to="/register"
              className="font-medium text-(--color-primary) hover:underline"
            >
              Sign up
            </Link>
          </span>
        </div>
      </div>
    </AuthLayout>
  );
};