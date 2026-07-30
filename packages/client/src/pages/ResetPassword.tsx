import { useState, type FormEvent } from "react";
import { Link, useSearchParams, useNavigate } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";
import { ApiClientError } from "@/lib/api";
import { ResetPasswordSchema } from "@application/shared";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { CheckCircle2, ArrowLeft, AlertCircle, Lock, Eye, EyeOff, ArrowRight } from "lucide-react";
import { AuthLayout } from "@/components/layout/AuthLayout";

export const ResetPasswordPage = () => {
  const { resetPassword } = useAuth();
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();

  const token = searchParams.get("token") || "";

  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
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
        <div className="text-center lg:text-left">
          <h2 className="text-2xl lg:text-3xl font-bold tracking-tight font-display text-gray-900">
            Set new password
          </h2>
          <p className="text-sm text-gray-500 mt-1.5 font-normal">
            Choose a strong password for your account.
          </p>
        </div>

        {!token ? (
          <div className="flex flex-col items-center gap-4 text-center py-4 bg-red-50/50 border border-red-200/60 rounded-2xl p-6 animate-in fade-in">
            <div className="flex h-12 w-12 items-center justify-center rounded-full bg-red-100 text-red-600 shadow-sm">
              <AlertCircle className="w-6 h-6" />
            </div>
            <div>
              <p className="text-base font-semibold text-gray-900">Invalid or missing reset link</p>
              <p className="text-sm text-gray-500 mt-1 leading-relaxed">
                Please request a new password reset link from the sign-in page.
              </p>
            </div>
            <Link to="/forgot-password" className="w-full mt-2">
              <Button className="w-full h-11 text-sm font-semibold rounded-xl border-gray-200 hover:bg-gray-50 transition-colors" variant="outline">
                Request new link
              </Button>
            </Link>
          </div>
        ) : success ? (
          <div className="flex flex-col items-center gap-4 text-center py-4 bg-emerald-50/50 border border-emerald-200/60 rounded-2xl p-6 animate-in fade-in">
            <div className="flex h-12 w-12 items-center justify-center rounded-full bg-emerald-100 text-emerald-600 shadow-sm">
              <CheckCircle2 className="w-6 h-6" />
            </div>
            <div>
              <p className="text-base font-semibold text-gray-900">Password reset successful</p>
              <p className="text-sm text-gray-500 mt-1 leading-relaxed">
                You can now log in to your account with your new password.
              </p>
            </div>
            <Button onClick={() => navigate("/login")} className="w-full mt-2 h-11 text-sm font-semibold bg-brand-gradient border-0 rounded-xl hover:shadow-lg hover:shadow-purple-900/25 active:scale-[0.99] transition-all cursor-pointer flex items-center justify-center gap-2 group text-white">
              <span>Sign in</span>
              <ArrowRight className="w-4 h-4 transition-transform group-hover:translate-x-1" />
            </Button>
          </div>
        ) : (
          <form onSubmit={onSubmit} className="flex flex-col gap-4">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="password" className="text-xs font-semibold text-gray-700 uppercase tracking-wider">
                New Password
              </Label>
              <div className="relative">
                <Lock className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400 pointer-events-none" />
                <Input
                  id="password"
                  type={showPassword ? "text" : "password"}
                  autoComplete="new-password"
                  required
                  placeholder="••••••••"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  disabled={submitting}
                  className="input-premium pl-10 pr-10 h-11 text-sm bg-gray-50/50 border-gray-200 focus:bg-white focus:ring-2 focus:ring-purple-600/20 focus:border-purple-600 rounded-xl transition-all"
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
              <Label htmlFor="confirmPassword" className="text-xs font-semibold text-gray-700 uppercase tracking-wider">
                Confirm Password
              </Label>
              <div className="relative">
                <Lock className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400 pointer-events-none" />
                <Input
                  id="confirmPassword"
                  type={showConfirmPassword ? "text" : "password"}
                  autoComplete="new-password"
                  required
                  placeholder="••••••••"
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  disabled={submitting}
                  className="input-premium pl-10 pr-10 h-11 text-sm bg-gray-50/50 border-gray-200 focus:bg-white focus:ring-2 focus:ring-purple-600/20 focus:border-purple-600 rounded-xl transition-all"
                />
                <button
                  type="button"
                  onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                  className="absolute right-3.5 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 transition-colors cursor-pointer"
                  tabIndex={-1}
                >
                  {showConfirmPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
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
                "Resetting…"
              ) : (
                <>
                  <span>Reset password</span>
                  <ArrowRight className="w-4 h-4 transition-transform group-hover:translate-x-1" />
                </>
              )}
            </Button>
          </form>
        )}

        <div className="text-center text-sm pt-2">
          <Link to="/login" className="inline-flex items-center gap-1.5 font-semibold text-purple-700 hover:text-purple-900 transition-colors">
            <ArrowLeft className="w-4 h-4" />
            Back to sign in
          </Link>
        </div>
      </div>
    </AuthLayout>
  );
};