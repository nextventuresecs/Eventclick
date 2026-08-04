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
import { User, Mail, Lock, Building2, Eye, EyeOff, ArrowRight } from "lucide-react";

export const RegisterPage = () => {
  const { register, loginWithGoogle } = useAuth();
  const navigate = useNavigate();

  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
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
        <div className="text-center lg:text-left">
          <h2 className="text-2xl lg:text-3xl font-bold tracking-tight font-display text-gray-900">
            Create your account
          </h2>
          <p className="text-sm text-gray-500 mt-1.5 font-normal">
            Set up your organization workspace in minutes.
          </p>
        </div>

        <form onSubmit={onSubmit} className="flex flex-col gap-4">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="fullName" className="text-xs font-semibold text-gray-700 uppercase tracking-wider">
              Full Name
            </Label>
            <div className="relative">
              <User className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400 pointer-events-none" />
              <Input
                id="fullName"
                autoComplete="name"
                required
                value={fullName}
                onChange={(e) => setFullName(e.target.value)}
                disabled={submitting}
                className="input-premium pl-10 h-11 text-sm bg-gray-50/50 border-gray-200 focus:bg-white focus:ring-2 focus:ring-purple-600/20 focus:border-purple-600 rounded-xl transition-all"
                placeholder="Enter Full name"
              />
            </div>
          </div>

          <div className="flex flex-col gap-1.5">
            <Label htmlFor="email" className="text-xs font-semibold text-gray-700 uppercase tracking-wider">
              Email Address
            </Label>
            <div className="relative">
              <Mail className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400 pointer-events-none" />
              <Input
                id="email"
                type="email"
                autoComplete="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                disabled={submitting}
                className="input-premium pl-10 h-11 text-sm bg-gray-50/50 border-gray-200 focus:bg-white focus:ring-2 focus:ring-purple-600/20 focus:border-purple-600 rounded-xl transition-all"
                placeholder="Enter email"
              />
            </div>
          </div>

          <div className="flex flex-col gap-1.5">
            <Label htmlFor="password" className="text-xs font-semibold text-gray-700 uppercase tracking-wider">
              Password
            </Label>
            <div className="relative">
              <Lock className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400 pointer-events-none" />
              <Input
                id="password"
                type={showPassword ? "text" : "password"}
                autoComplete="new-password"
                required
                minLength={8}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                disabled={submitting}
                className="input-premium pl-10 pr-10 h-11 text-sm bg-gray-50/50 border-gray-200 focus:bg-white focus:ring-2 focus:ring-purple-600/20 focus:border-purple-600 rounded-xl transition-all"
                placeholder="Enter Password"
              />
              <button
                type="button"
                onClick={() => setShowPassword(!showPassword)}
                className="absolute right-3.5 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 transition-colors cursor-pointer"
                tabIndex={-1}
              >
                {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              </button>
            </div>
            <p className="text-[11px] text-gray-400 font-medium">Minimum 8 characters</p>
          </div>

          <div className="flex flex-col gap-1.5">
            <Label htmlFor="organizationName" className="text-xs font-semibold text-gray-700 uppercase tracking-wider">
              Organization Name
            </Label>
            <div className="relative">
              <Building2 className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400 pointer-events-none" />
              <Input
                id="organizationName"
                value={organizationName}
                onChange={(e) => setOrganizationName(e.target.value)}
                disabled={submitting}
                className="input-premium pl-10 h-11 text-sm bg-gray-50/50 border-gray-200 focus:bg-white focus:ring-2 focus:ring-purple-600/20 focus:border-purple-600 rounded-xl transition-all"
                placeholder="Enter Organization name"
              />
            </div>
          </div>

          <div className="flex items-center gap-2.5 mt-1">
            <input
              type="checkbox"
              id="terms"
              required
              className="w-4 h-4 rounded border-gray-300 text-purple-700 focus:ring-purple-600 cursor-pointer"
            />
            <label htmlFor="terms" className="text-xs text-gray-600 cursor-pointer select-none">
              I agree to the <a href="https://eventclick.live/terms" target="_blank" rel="noopener noreferrer" className="font-semibold text-purple-700 hover:underline">Terms and Conditions</a>
            </label>
          </div>

          {error && (
            <div className="p-3 rounded-xl bg-red-50 border border-red-200 text-xs font-medium text-red-600 animate-in fade-in">
              {error}
            </div>
          )}

          <Button
            type="submit"
            disabled={submitting}
            className="w-full mt-2 h-11 text-sm font-semibold bg-brand-gradient border-0 rounded-xl hover:shadow-lg hover:shadow-purple-900/25 active:scale-[0.99] transition-all cursor-pointer flex items-center justify-center gap-2 group text-white"
          >
            {submitting ? (
              "Creating…"
            ) : (
              <>
                <span>Sign Up</span>
                <ArrowRight className="w-4 h-4 transition-transform group-hover:translate-x-1" />
              </>
            )}
          </Button>
        </form>
        
        <div className="flex items-center gap-3 my-1">
          <div className="h-px flex-1 bg-gray-200" />
          <span className="text-xs font-medium text-gray-400 uppercase tracking-wider">Or continue with</span>
          <div className="h-px flex-1 bg-gray-200" />
        </div>
        
        <div className="flex justify-center">
          <GoogleSignInButton onToken={onGoogle} disabled={submitting} />
        </div>

        <div className="text-center text-sm text-gray-500 pt-2">
          <span>Already have an account?&nbsp;
            <Link
              to="/login"
              className="font-semibold text-purple-700 hover:text-purple-900 hover:underline transition-colors"
            >
              Sign in
            </Link>
          </span>
        </div>
      </div>
    </AuthLayout>
  );
};