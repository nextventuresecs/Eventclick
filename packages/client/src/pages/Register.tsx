import { useState, type FormEvent } from "react";
import { Link, useNavigate } from "react-router-dom";
import { RegisterSchema } from "@application/shared";
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
    <div className="mx-auto flex min-h-screen w-full max-w-md flex-col justify-center p-6">
      <div className="mb-6 text-center">
        <div className="mx-auto h-12 w-12 rounded-xl bg-brand-gradient flex items-center justify-center mb-3 shadow-sm">
          <img
            src="/only_icon.png"
            alt="Eventclick"
            className="h-6 w-6 object-contain"
          />
        </div>
        <h1 className="text-2xl font-bold tracking-tight font-display text-[var(--color-gray-900)]">Create your account</h1>
        <p className="text-sm text-[var(--color-gray-400)] mt-1">Set up your organization workspace</p>
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
              <Label htmlFor="fullName" className="text-sm font-medium text-[var(--color-gray-600)]">Full name</Label>
              <Input
                id="fullName"
                autoComplete="name"
                required
                value={fullName}
                onChange={(e) => setFullName(e.target.value)}
                disabled={submitting}
                className="input-premium"
              />
            </div>
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
              <Label htmlFor="password" className="text-sm font-medium text-[var(--color-gray-600)]">Password</Label>
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
              />
              <p className="text-xs text-[var(--color-gray-400)]">Minimum 8 characters</p>
            </div>
            <div className="flex flex-col gap-2">
              <Label htmlFor="organizationName" className="text-sm font-medium text-[var(--color-gray-600)]">Organization</Label>
              <Input
                id="organizationName"
                value={organizationName}
                onChange={(e) => setOrganizationName(e.target.value)}
                disabled={submitting}
                className="input-premium"
              />
              <p className="text-xs text-[var(--color-gray-400)]">Create your organization workspace to get started.</p>
            </div>

             {error && <p className="text-sm text-[var(--color-error)]">{error}</p>}

             <Button type="submit" disabled={submitting} className="w-full">
               {submitting ? "Creating…" : "Create account"}
             </Button>
          </form>
        </CardContent>
        <CardFooter className="justify-center text-sm text-[var(--color-gray-400)]">
          Already have an account?&nbsp;
          <Link
            to="/login"
            className="font-medium text-[var(--color-primary)] hover:underline"
          >
            Sign in
          </Link>
        </CardFooter>
      </Card>
    </div>
  );
};