import { useState, type FormEvent } from "react";
import { Link, useNavigate } from "react-router-dom";
import { RegisterSchema } from "@application/shared";
import { useAuth } from "@/hooks/useAuth";
import { ApiClientError } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { GoogleSignInButton } from "@/components/GoogleSignInButton";
import { AuthLayout } from "@/components/layout/AuthLayout";

export const RegisterPage = () => {
  const { register, loginWithGoogle } = useAuth();
  const navigate = useNavigate();

  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [organizationName, setOrganizationName] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);

    const parsed = RegisterSchema.safeParse({
      fullName,
      email,
      password,
      organizationName: organizationName || undefined,
    });
    if (!parsed.success) {
      setError(parsed.error.issues[0]?.message ?? "Invalid input");
      return;
    }

    setSubmitting(true);
    try {
      await register(parsed.data);
      navigate("/dashboard", { replace: true });
    } catch (err) {
      setError(
        err instanceof ApiClientError ? err.message : "Registration failed",
      );
    } finally {
      setSubmitting(false);
    }
  };

  const onGoogle = async (idToken: string) => {
    setError(null);
    setSubmitting(true);
    try {
      await loginWithGoogle(idToken);
      navigate("/dashboard", { replace: true });
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
          <h2 className="text-2xl font-bold tracking-tight font-display text-(--color-gray-900)">Create your account</h2>
          <p className="text-sm text-gray-400 mt-1.5">Set up your organization workspace</p>
        </div>

        <form onSubmit={onSubmit} className="flex flex-col gap-4">
          <div className="flex flex-col gap-2">
            <Label htmlFor="fullName" className="text-sm font-medium text-(--color-gray-600)">Full name</Label>
            <Input
              id="fullName"
              autoComplete="name"
              required
              value={fullName}
              onChange={(e) => setFullName(e.target.value)}
              disabled={submitting}
              className="input-premium"
              placeholder="Enter Full name"
            />
          </div>
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
            <Label htmlFor="password" className="text-sm font-medium text-(--color-gray-600)">Password</Label>
            <Input
              id="password"
              type="password"
              autoComplete="new-password"
              required
              minLength={8}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              disabled={submitting}
              className="input-premium"
              placeholder="Enter Password"
            />
            <p className="text-xs text-gray-400">Minimum 8 characters</p>
          </div>
          <div className="flex flex-col gap-2">
            <Label htmlFor="organizationName" className="text-sm font-medium text-(--color-gray-600)">Organization</Label>
            <Input
              id="organizationName"
              value={organizationName}
              onChange={(e) => setOrganizationName(e.target.value)}
              disabled={submitting}
              className="input-premium"
              placeholder="Enter Organization name"
            />
          </div>

          <div className="flex items-center gap-2 mt-1">
            <input type="checkbox" id="terms" required className="rounded border-gray-300 text-(--color-primary) focus:ring-(--color-primary)" />
            <label htmlFor="terms" className="text-xs text-(--color-gray-500)">
              I agree to the terms and Conditions
            </label>
          </div>

          {error && <p className="text-sm text-(--color-error)">{error}</p>}

          <Button type="submit" disabled={submitting} className="w-full mt-2 h-11 text-base font-semibold bg-brand-gradient border-0 hover:opacity-90 transition-opacity">
            {submitting ? "Creating…" : "Sign Up"}
          </Button>
        </form>
        
        <div className="flex items-center gap-3 mt-4">
          <div className="h-px flex-1 bg-(--color-gray-200)" />
          <span className="text-xs text-gray-400 tracking-wide">Sign Up with</span>
          <div className="h-px flex-1 bg-(--color-gray-200)" />
        </div>
        
        <div className="flex justify-center">
          <GoogleSignInButton onToken={onGoogle} disabled={submitting} />
        </div>

        <div className="mt-6 text-center text-sm text-(--color-gray-600)">
          <span>Already have an account?&nbsp;
            <Link
              to="/login"
              className="font-medium text-(--color-primary) hover:underline"
            >
              Sign in
            </Link>
          </span>
        </div>
      </div>
    </AuthLayout>
  );
};