import { describe, expect, it, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import type { UserRole } from "@application/shared";

/**
 * The dashboard is built from more than one endpoint, and some of those are
 * admin-only. A non-admin must still get their dashboard: the room list is
 * already scoped to their assignments server-side, so a 403 on the
 * admin-only calls is expected traffic, not a page-level failure.
 */

class ApiClientError extends Error {
  constructor(
    message: string,
    public status = 500,
  ) {
    super(message);
  }
}

const currentUser = {
  id: "11111111-2222-3333-4444-555555555555",
  email: "member@example.com",
  fullName: "Adhyant Patil",
  role: "volunteer" as UserRole,
  organizationId: "org-1",
  organizationName: "AgriClick Network LLP",
  organizationLogoUrl: "",
  photoUrl: "",
  createdAt: "2026-01-01T00:00:00.000Z",
};

const assignedRoom = {
  id: "room-1",
  organizationId: "org-1",
  title: "Kharif Field Day",
  description: "",
  location: "Pune",
  status: "scheduled" as const,
  scheduledStart: "2026-09-10T04:00:00.000Z",
  scheduledEnd: "2026-09-10T08:00:00.000Z",
  shareToken: "abc123",
  attendanceCount: 4,
  createdAt: "2026-09-01T00:00:00.000Z",
  updatedAt: "2026-09-01T00:00:00.000Z",
};

const listRooms = vi.fn();
const listAssignments = vi.fn();
const listUsers = vi.fn();

vi.mock("@/hooks/useAuth", () => ({
  useAuth: () => ({ user: currentUser, status: "authenticated", refresh: vi.fn() }),
}));
vi.mock("@/hooks/useToast", () => ({ useToast: () => ({ toast: vi.fn() }) }));
vi.mock("@/lib/api", () => ({
  roomsApi: { list: (...a: unknown[]) => listRooms(...a) },
  eventAssignmentsApi: {
    listAssignments: (...a: unknown[]) => listAssignments(...a),
    listUsers: (...a: unknown[]) => listUsers(...a),
  },
  ApiClientError,
}));

const renderDashboard = async () => {
  const { Dashboard } = await import("./Dashboard");
  return render(
    <MemoryRouter>
      <Dashboard />
    </MemoryRouter>,
  );
};

const forbidden = () => Promise.reject(new ApiClientError("Insufficient permissions", 403));

describe("Dashboard for non-admin roles", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    listRooms.mockResolvedValue({ items: [assignedRoom], limit: 50, offset: 0 });
    listAssignments.mockImplementation(forbidden);
    listUsers.mockImplementation(forbidden);
  });

  // Dashboard pulls in date-fns and a large lucide surface, so the first
  // render in this file pays a heavy module-import cost. Under a full parallel
  // run that has exceeded the 5s default and failed as a timeout rather than
  // an assertion; the work being waited on is unchanged.
  const HEAVY_RENDER_TIMEOUT = 20000;

  for (const role of ["volunteer", "event_manager"] as const) {
    it(`renders assigned rooms for ${role} when admin-only endpoints are forbidden`, async () => {
      currentUser.role = role;
      await renderDashboard();

      await waitFor(() => {
        expect(screen.getAllByText("Kharif Field Day").length).toBeGreaterThan(0);
      });
      expect(screen.queryByText("Insufficient permissions")).not.toBeInTheDocument();
      expect(screen.queryByText("Try Again")).not.toBeInTheDocument();
    }, HEAVY_RENDER_TIMEOUT);
  }

  it("does not request the admin-only endpoints at all", async () => {
    currentUser.role = "volunteer";
    await renderDashboard();

    await waitFor(() => {
      expect(screen.getAllByText("Kharif Field Day").length).toBeGreaterThan(0);
    });
    expect(listAssignments).not.toHaveBeenCalled();
    expect(listUsers).not.toHaveBeenCalled();
  });

  it("still surfaces a real failure of the room list", async () => {
    currentUser.role = "volunteer";
    listRooms.mockRejectedValue(new ApiClientError("Service unavailable", 503));
    await renderDashboard();

    await waitFor(() => {
      expect(screen.getByText("Service unavailable")).toBeInTheDocument();
    });
  });
});

describe("Dashboard for admin", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    currentUser.role = "admin";
    listRooms.mockResolvedValue({ items: [assignedRoom], limit: 50, offset: 0 });
    listAssignments.mockResolvedValue({
      items: [{ id: "a1", userId: "u2", roomId: "room-1", organizationId: "org-1" }],
    });
    listUsers.mockResolvedValue({
      items: [{ id: "u2", fullName: "Volunteer Vee", email: "v@example.com", role: "volunteer" }],
    });
  });

  it("still renders the team panel from the admin-only endpoints", async () => {
    await renderDashboard();

    await waitFor(() => {
      expect(screen.getByText("Volunteer Vee")).toBeInTheDocument();
    });
    expect(screen.getByText("Kharif Field Day", { selector: "td" })).toBeInTheDocument();
  });

  it("keeps the dashboard usable when the team endpoints fail", async () => {
    listAssignments.mockImplementation(forbidden);
    listUsers.mockImplementation(forbidden);
    await renderDashboard();

    await waitFor(() => {
      expect(screen.getAllByText("Kharif Field Day").length).toBeGreaterThan(0);
    });
    expect(screen.queryByText("Try Again")).not.toBeInTheDocument();
  });
});
