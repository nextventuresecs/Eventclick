import { useState, type FormEvent } from "react";
import { Link } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";
import { ApiClientError } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { AuthLayout } from "@/components/layout/AuthLayout";
import { Mail, CheckCircle2, ArrowLeft, ArrowRight } from "lucide-react";

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
    <AuthLayout>
      <div className="flex flex-col gap-6">
        <div className="text-center lg:text-left">
          <h2 className="text-2xl lg:text-3xl font-bold tracking-tight font-display text-gray-900">
            Reset password
          </h2>
          <p className="text-sm text-gray-500 mt-1.5 font-normal">
            We'll send a link to your email to get you back in.
          </p>
        </div>

        {success ? (
          <div className="flex flex-col items-center gap-4 text-center py-4 bg-emerald-50/50 border border-emerald-200/60 rounded-2xl p-6 animate-in fade-in">
            <div className="flex h-12 w-12 items-center justify-center rounded-full bg-emerald-100 text-emerald-600 shadow-sm">
              <CheckCircle2 className="w-6 h-6" />
            </div>
            <div>
              <p className="text-base font-semibold text-gray-900">Check your inbox</p>
              <p className="text-sm text-gray-500 mt-1 leading-relaxed">
                We've sent a password reset link to{" "}
                <strong className="text-gray-900 font-semibold">{email}</strong>.
                If the email exists, it should arrive in a few minutes.
              </p>
            </div>
          </div>
        ) : (
          <form onSubmit={onSubmit} className="flex flex-col gap-4">
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
                  placeholder="Enter email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  disabled={submitting}
                  className="input-premium pl-10 h-11 text-sm bg-gray-50/50 border-gray-200 focus:bg-white focus:ring-2 focus:ring-purple-600/20 focus:border-purple-600 rounded-xl transition-all"
                />
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
                "Sending…"
              ) : (
                <>
                  <span>Send reset link</span>
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