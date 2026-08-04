import { useEffect, useState, useRef } from "react";
import { Link, useSearchParams, useNavigate } from "react-router-dom";
import { authApi, ApiClientError } from "@/lib/api";
import { Button } from "@/components/ui/button";
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
  const { retryAuth, user } = useAuth();

  const token = searchParams.get("token") || "";

  const [status, setStatus] = useState<"loading" | "success" | "error">("loading");
  const [error, setError] = useState<string | null>(null);

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
        await authApi.verifyEmail(token);
        setStatus("success");
        if (user) {
          retryAuth();
        }
      } catch (err) {
        setStatus("error");
        setError(err instanceof ApiClientError ? err.message : "Failed to verify email. The link may be expired or invalid.");
      }
    };

    verify();
  }, [token, user, retryAuth]);

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

          {status === "success" && (
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