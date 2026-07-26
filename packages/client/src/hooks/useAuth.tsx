import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import type { AuthUser, ResetPasswordInput, OnboardingInput } from "@application/shared";
import { authApi, setAccessToken, setOnUnauthorized } from "@/lib/api";

interface AuthContextValue {
  user: AuthUser | null;
  status: "loading" | "authenticated" | "unauthenticated" | "error";
  login: (email: string, password: string) => Promise<void>;
  register: (input: { email: string; password: string; fullName: string; organizationName?: string }) => Promise<void>;
  loginWithGoogle: (idToken: string) => Promise<void>;
  logout: () => Promise<void>;
  retryAuth: () => void;
  forgotPassword: (email: string) => Promise<void>;
  resetPassword: (body: ResetPasswordInput) => Promise<void>;
  completeOnboarding: (body: OnboardingInput) => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

const AUTH_TIMEOUT_MS = 10_000;

export const AuthProvider = ({ children }: { children: ReactNode }) => {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [status, setStatus] = useState<AuthContextValue["status"]>("loading");
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    let cancelled = false;
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), AUTH_TIMEOUT_MS);

    (async () => {
      try {
        const token = await authApi.refresh();
        if (cancelled) return;
        if (!token) {
          setStatus("unauthenticated");
          return;
        }
        const { user: me } = await authApi.me();
        if (!cancelled) {
          setUser(me);
          setStatus("authenticated");
        }
      } catch {
        if (!cancelled) setStatus("error");
      } finally {
        clearTimeout(timeout);
      }
    })();
    return () => {
      cancelled = true;
      controller.abort();
    };
  }, [attempt]);

  const retryAuth = useCallback(() => {
    setStatus("loading");
    setAttempt((n) => n + 1);
  }, []);

  const handleUnauthorized = useCallback(() => {
    setAccessToken(null);
    setUser(null);
    setStatus("unauthenticated");
  }, []);

  useEffect(() => {
    setOnUnauthorized(handleUnauthorized);
    return () => setOnUnauthorized(null);
  }, [handleUnauthorized]);

  const applyAuth = useCallback((result: { user: AuthUser; accessToken: string }) => {
    setAccessToken(result.accessToken);
    setUser(result.user);
    setStatus("authenticated");
  }, []);

  const value: AuthContextValue = useMemo(
    () => ({
      user,
      status,
      login: async (email, password) => applyAuth(await authApi.login({ email, password })),
      register: async (input) => applyAuth(await authApi.register(input)),
      loginWithGoogle: async (idToken) => applyAuth(await authApi.google(idToken)),
      logout: async () => {
        try {
          await authApi.logout();
        } finally {
          handleUnauthorized();
        }
      },
      retryAuth,
      forgotPassword: async (email) => {
        await authApi.forgotPassword(email);
      },
      resetPassword: async (body) => {
        await authApi.resetPassword(body);
      },
      completeOnboarding: async (body) => {
        const result = await authApi.completeOnboarding(body);
        applyAuth(result);
      },
    }),
    [user, status, applyAuth, handleUnauthorized, retryAuth],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
};

export const useAuth = (): AuthContextValue => {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
};
