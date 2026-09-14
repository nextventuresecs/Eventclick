import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { App } from "./App";
import { OpsApiError } from "./lib/api";

const whoami = {
  maintainer: { id: "m1", email: "maint@nvces.test", displayName: "Maint" },
  release: "abc1234",
  serverTime: "2026-09-14T05:00:00.000Z",
};

const byPath = (async (path: string) => {
  if (path === "/whoami") return whoami;
  return Promise.reject(new OpsApiError(503, "AUDIT_UNAVAILABLE"));
}) as never;

describe("App", () => {
  it("shows the signed-in maintainer, release, sign out and external tools", async () => {
    render(<App api={{ get: vi.fn(byPath), post: vi.fn() } as never} />);

    expect(await screen.findByText("abc1234")).toBeInTheDocument();
    expect(screen.getAllByText("maint@nvces.test").length).toBeGreaterThan(0);
    expect(screen.getByRole("link", { name: "Sign out" })).toHaveAttribute("href", "/cdn-cgi/access/logout");
    const actions = screen.getByRole("link", { name: /GitHub Actions/ });
    expect(actions).toHaveAttribute("target", "_blank");
    expect(actions).toHaveAttribute("rel", "noopener noreferrer");
  });

  it("renders the Not authorized screen on 403", async () => {
    render(<App api={{ get: vi.fn(async () => Promise.reject(new OpsApiError(403, "FORBIDDEN"))), post: vi.fn() } as never} />);
    expect(await screen.findByRole("heading", { name: "Not authorized" })).toBeInTheDocument();
  });

  it("renders a panel error on 503", async () => {
    render(
      <App api={{ get: vi.fn(async () => Promise.reject(new OpsApiError(503, "AUDIT_UNAVAILABLE"))), post: vi.fn() } as never} />,
    );
    expect(await screen.findByRole("alert")).toHaveTextContent("AUDIT_UNAVAILABLE");
  });
});
