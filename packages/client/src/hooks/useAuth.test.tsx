import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, waitFor, act } from "@testing-library/react";
import type { AuthUser } from "@application/shared";
import { AuthProvider, useAuth } from "./useAuth";
import { authApi, setAccessToken, setOnUnauthorized } from "@/lib/api";

vi.mock("@/lib/api", () => ({
  authApi: {
    refresh: vi.fn(),
    me: vi.fn(),
  },
  setAccessToken: vi.fn(),
  setOnUnauthorized: vi.fn(),
}));

const baseUser: AuthUser = {
  id: "user-1",
  email: "a@b.com",
  fullName: "Ada",
  role: "volunteer",
  organizationId: "org-1",
  organizationName: "Acme",
  organizationDescription: null,
  organizationLogoUrl: null,
  emailVerified: true,
};

describe("useAuth.updateUser", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(authApi.refresh).mockResolvedValue("token");
    vi.mocked(authApi.me).mockResolvedValue({ user: baseUser });
    vi.mocked(setOnUnauthorized).mockImplementation(() => {});
  });

  it("merges a patch into the current user without needing a reload", async () => {
    const { result } = renderHook(() => useAuth(), { wrapper: AuthProvider });

    await waitFor(() => expect(result.current.status).toBe("authenticated"));

    act(() => {
      result.current.updateUser({ photoUrl: "https://cdn.example.com/new.png" });
    });

    expect(result.current.user).toEqual({
      ...baseUser,
      photoUrl: "https://cdn.example.com/new.png",
    });
  });
});
