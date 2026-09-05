import { describe, expect, it, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import type { UserRole } from "@application/shared";

/**
 * The header avatar used to be a bare link to /profile, so signing out meant
 * finding the sidebar menu — and on a collapsed sidebar that is a second click
 * into a panel that looks like an avatar rather than a menu.
 */

const logout = vi.fn();

const currentUser = {
  id: "11111111-2222-3333-4444-555555555555",
  email: "admin@example.com",
  fullName: "Prathmesh Jagtap",
  role: "admin" as UserRole,
  organizationId: "org-1",
  organizationName: "AgriClick Network LLP",
  organizationLogoUrl: null as string | null,
  photoUrl: null as string | null,
  createdAt: "2026-01-01T00:00:00.000Z",
};

vi.mock("@/hooks/useAuth", () => ({
  useAuth: () => ({ user: currentUser, status: "authenticated", logout, refresh: vi.fn() }),
}));
vi.mock("@/hooks/useToast", () => ({ useToast: () => ({ toast: vi.fn() }) }));
vi.mock("@/hooks/useNotifications", () => ({
  useNotifications: () => ({
    notifications: [],
    unreadCount: 0,
    markAllRead: vi.fn(),
    markRead: vi.fn(),
    loading: false,
  }),
}));
// useNetwork drives the offline queue, which opens IndexedDB — absent in
// jsdom, and its failure surfaces as an unhandled error that fails the run
// even while every assertion passes.
vi.mock("@/hooks/useNetwork", () => ({
  useNetwork: () => ({ isOnline: true, isSyncing: false }),
}));
vi.mock("@/hooks/usePwaInstall", () => ({
  usePwaInstall: () => ({
    platform: "unsupported",
    instructions: null,
    dismissInstructions: vi.fn(),
    install: vi.fn(),
  }),
}));
vi.mock("@/lib/api", () => ({
  api: { get: vi.fn().mockResolvedValue({ url: "https://signed.example/x", expiresIn: 300 }) },
}));

const renderLayout = async () => {
  const { DashboardLayout } = await import("./DashboardLayout");
  return render(
    <MemoryRouter>
      <DashboardLayout />
    </MemoryRouter>,
  );
};

const openHeaderMenu = async () => {
  const user = userEvent.setup();
  await user.click(screen.getByRole("button", { name: /account menu/i }));
  return user;
};

describe("DashboardLayout header account menu", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    currentUser.photoUrl = null;
  });

  it("opens a menu rather than navigating straight to the profile", async () => {
    await renderLayout();
    const trigger = screen.getByRole("button", { name: /account menu/i });
    expect(trigger).toHaveAttribute("aria-expanded", "false");

    await openHeaderMenu();
    expect(trigger).toHaveAttribute("aria-expanded", "true");
    expect(screen.getByRole("menu")).toBeInTheDocument();
  });

  it("offers account profile and logout — the two the header was missing", async () => {
    await renderLayout();
    await openHeaderMenu();

    const menu = screen.getByRole("menu");
    expect(menu).toHaveTextContent("Account Profile");
    expect(menu).toHaveTextContent("Logout");
  });

  it("logs out when logout is chosen", async () => {
    await renderLayout();
    const user = await openHeaderMenu();

    await user.click(screen.getByRole("menuitem", { name: /logout/i }));
    expect(logout).toHaveBeenCalledTimes(1);
  });

  it("closes when a menu item is chosen", async () => {
    await renderLayout();
    const user = await openHeaderMenu();

    await user.click(screen.getByRole("menuitem", { name: /account profile/i }));
    await waitFor(() => {
      expect(screen.queryByRole("menu")).not.toBeInTheDocument();
    });
  });

  it("closes on a click outside", async () => {
    await renderLayout();
    const user = await openHeaderMenu();

    await user.click(document.body);
    await waitFor(() => {
      expect(screen.queryByRole("menu")).not.toBeInTheDocument();
    });
  });

  it("shows the account identity so the menu is not just icons", async () => {
    await renderLayout();
    await openHeaderMenu();

    const menu = screen.getByRole("menu");
    expect(menu).toHaveTextContent("Prathmesh Jagtap");
    expect(menu).toHaveTextContent("admin@example.com");
  });

  it("advertises ⌘K only because something is behind it", async () => {
    // This pill shipped for a while as a styled <div> with no handler, while
    // no ⌘K listener existed anywhere in the app. The requirement is not that
    // it looks clickable — it is that it is a control and it does something.
    await renderLayout();

    const trigger = screen.getByRole("button", { name: /open command palette/i });
    expect(trigger).toBeInTheDocument();

    const user = userEvent.setup();
    await user.click(trigger);
    expect(screen.getByRole("dialog", { name: /command palette/i })).toBeInTheDocument();
  });
});
