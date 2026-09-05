import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { createMemoryRouter, RouterProvider } from "react-router-dom";
import { NotFound } from "./NotFound";

/**
 * Before this page existed the app had no catch-all at all, so an unrecognised
 * path fell through to React Router's own built-in error screen — not even
 * RouteErrorFallback, because no route in the tree matched for the error to
 * bubble to.
 */

const renderAt = (path: string) => {
  const router = createMemoryRouter(
    [
      { path: "/dashboard", element: <p>Dashboard</p> },
      { path: "*", element: <NotFound /> },
    ],
    { initialEntries: [path] },
  );
  return render(<RouterProvider router={router} />);
};

describe("NotFound", () => {
  it("renders for an unrecognised path", () => {
    renderAt("/nonsense");
    expect(screen.getByRole("heading", { name: /page not found/i })).toBeInTheDocument();
    expect(screen.getByText("404")).toBeInTheDocument();
  });

  it("names the path that failed, so the user can see the typo", () => {
    renderAt("/adnim/users");
    expect(screen.getByText("/adnim/users")).toBeInTheDocument();
  });

  it("does not swallow a path that does resolve", () => {
    renderAt("/dashboard");
    expect(screen.getByText("Dashboard")).toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: /page not found/i })).not.toBeInTheDocument();
  });

  it("offers a way out rather than a dead end", async () => {
    renderAt("/nope");

    const dashboardLink = screen.getByRole("link", { name: /go to dashboard/i });
    expect(dashboardLink).toHaveAttribute("href", "/dashboard");

    const back = vi.spyOn(window.history, "back").mockImplementation(() => {});
    await userEvent.click(screen.getByRole("button", { name: /go back/i }));
    expect(back).toHaveBeenCalled();
    back.mockRestore();
  });

  it("points at the command palette as the way to find a page", () => {
    renderAt("/nope");
    expect(screen.getByText("⌘K")).toBeInTheDocument();
  });
});
