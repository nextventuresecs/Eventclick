import { describe, expect, it, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import type { UserRole } from "@application/shared";
import { CommandPalette } from "./CommandPalette";

const navigate = vi.fn();
vi.mock("react-router-dom", async (importOriginal) => ({
  ...(await importOriginal<typeof import("react-router-dom")>()),
  useNavigate: () => navigate,
}));

const onClose = vi.fn();
const onLogout = vi.fn();

const renderPalette = (role: UserRole = "admin", open = true) =>
  render(
    <MemoryRouter>
      <CommandPalette open={open} onClose={onClose} role={role} onLogout={onLogout} />
    </MemoryRouter>,
  );

describe("CommandPalette", () => {
  beforeEach(() => vi.clearAllMocks());

  it("renders nothing when closed", () => {
    renderPalette("admin", false);
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  describe("permission filtering", () => {
    /**
     * The reason this component shares `navItemsForRole` with the sidebar
     * rather than listing destinations of its own: a second copy of the filter
     * would drift, and the drift would be a permission leak — a volunteer
     * reaching an admin page by typing its name.
     */
    it("hides manage_users destinations from a volunteer", () => {
      renderPalette("volunteer");
      expect(screen.queryByRole("option", { name: /audit log/i })).not.toBeInTheDocument();
      expect(screen.queryByRole("option", { name: /broadcast/i })).not.toBeInTheDocument();
      expect(screen.queryByRole("option", { name: /event assignments/i })).not.toBeInTheDocument();
    });

    it("hides them from an event manager too", () => {
      renderPalette("event_manager");
      expect(screen.queryByRole("option", { name: /audit log/i })).not.toBeInTheDocument();
    });

    it("shows them to an admin", () => {
      renderPalette("admin");
      expect(screen.getByRole("option", { name: /audit log/i })).toBeInTheDocument();
    });

    it("does not surface a hidden destination through search either", async () => {
      // Filtering the rendered list but searching the unfiltered one would be
      // the obvious way to get this wrong.
      renderPalette("volunteer");
      await userEvent.type(screen.getByRole("textbox"), "audit");
      expect(screen.queryByRole("option", { name: /audit log/i })).not.toBeInTheDocument();
      expect(screen.getByText(/no matches/i)).toBeInTheDocument();
    });
  });

  it("filters on keywords the label does not contain", async () => {
    renderPalette("admin");
    // "export" appears nowhere in the word "Reports".
    await userEvent.type(screen.getByRole("textbox"), "export");
    expect(screen.getByRole("option", { name: /reports/i })).toBeInTheDocument();
  });

  it("navigates on Enter and closes", async () => {
    renderPalette("admin");
    const input = screen.getByRole("textbox");
    await userEvent.type(input, "settings");
    await userEvent.keyboard("{Enter}");

    expect(navigate).toHaveBeenCalledWith("/settings");
    expect(onClose).toHaveBeenCalled();
  });

  it("runs logout as an action rather than navigating", async () => {
    renderPalette("admin");
    await userEvent.type(screen.getByRole("textbox"), "logout");
    await userEvent.keyboard("{Enter}");

    expect(onLogout).toHaveBeenCalledTimes(1);
    expect(navigate).not.toHaveBeenCalled();
  });

  it("moves the selection with the arrow keys", async () => {
    renderPalette("admin");
    const options = screen.getAllByRole("option");
    expect(options[0]).toHaveAttribute("aria-selected", "true");

    await userEvent.keyboard("{ArrowDown}");
    expect(screen.getAllByRole("option")[1]).toHaveAttribute("aria-selected", "true");

    await userEvent.keyboard("{ArrowUp}");
    expect(screen.getAllByRole("option")[0]).toHaveAttribute("aria-selected", "true");
  });

  it("wraps the selection at both ends", async () => {
    renderPalette("admin");
    const count = screen.getAllByRole("option").length;

    await userEvent.keyboard("{ArrowUp}");
    expect(screen.getAllByRole("option")[count - 1]).toHaveAttribute("aria-selected", "true");
  });

  it("closes on Escape without navigating", async () => {
    renderPalette("admin");
    await userEvent.keyboard("{Escape}");

    expect(onClose).toHaveBeenCalled();
    expect(navigate).not.toHaveBeenCalled();
  });

  it("closes when the backdrop is clicked", async () => {
    const { container } = renderPalette("admin");
    const backdrop = container.firstElementChild as HTMLElement;
    await userEvent.click(backdrop);

    expect(onClose).toHaveBeenCalled();
  });

  it("keeps the selection in range when the results shrink", async () => {
    renderPalette("admin");
    await userEvent.keyboard("{ArrowDown}{ArrowDown}{ArrowDown}{ArrowDown}");
    // Narrow to a single result; the old index is now past the end.
    await userEvent.type(screen.getByRole("textbox"), "audit");

    const options = screen.getAllByRole("option");
    expect(options).toHaveLength(1);
    expect(options[0]).toHaveAttribute("aria-selected", "true");
  });

  it("says so when nothing matches", async () => {
    renderPalette("admin");
    await userEvent.type(screen.getByRole("textbox"), "zzzznope");
    expect(screen.getByText(/no matches/i)).toBeInTheDocument();
  });
});
