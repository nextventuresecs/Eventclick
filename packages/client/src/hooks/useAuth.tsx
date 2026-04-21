import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import type { AuthUser } from "@application/shared";
import { authApi, setAccessToken, setOnUnauthorized } from "@/lib/api";

interface AuthContextValue {
  user: AuthUser | null;
  status: "loading" | "authenticated" | "unauthenticated";
  login: (email: string, password: string) => Promise<void>;
  register: (input: { email: string; password: string; fullName: string; organizationName?: string }) => Promise<void>;
  loginWithGoogle: (idToken: string) => Promise<void>;
  logout: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export const AuthProvider = ({ children }: { children: ReactNode }) => {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [status, setStatus] = useState<AuthContextValue["status"]>("loading");

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const token = await authApi.refresh();
      if (cancelled) return;
      if (!token) {
        setStatus("unauthenticated");
        return;
      }
      try {
        const { user: me } = await authApi.me();
        if (!cancelled) {
          setUser(me);
          setStatus("authenticated");
        }
      } catch {
        if (!cancelled) setStatus("unauthenticated");
      }
    })();
    return () => {
      cancelled = true;
    };
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

  const applyAuth = (result: { user: AuthUser; accessToken: string }) => {
    setAccessToken(result.accessToken);
    setUser(result.user);
    setStatus("authenticated");
  };

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
    }),
    [user, status, handleUnauthorized],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
};

export const useAuth = (): AuthContextValue => {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
};
