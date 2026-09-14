import { describe, it, expect, vi } from "vitest";
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import type { OpsHealth, OpsUsage } from "@application/shared";
import { ApiProvider, type OpsApi } from "@/lib/apiContext";
import { OpsApiError } from "@/lib/api";
import { Home } from "./Home";

const whoami = {
  maintainer: { id: "m1", email: "maint@nvces.test", displayName: "Maint" },
  release: "abc1234",
  serverTime: "2026-09-14T05:00:00.000Z",
};

const health: OpsHealth = {
  generatedAt: "2026-09-14T05:00:00.000Z",
  release: "abc1234",
  deployedAt: "2026-09-14T04:00:00.000Z",
  overall: "red",
  app: { status: "ok", data: { httpStatus: 503, checks: { database: "ok", gotenberg: "error" } } },
  backlog: { status: "error", error: "TIMEOUT" },
  dlq: { status: "disabled" },
  links: { sentryRelease: "https://nvces.sentry.io/releases/abc1234/" },
};

const ORG_ID = "7d5b3c1e-0000-4000-8000-00000000000a";
const usage: OpsUsage = {
  generatedAt: "2026-09-14T05:00:00.000Z",
  totals: { orgs: 1, activeOrgs7d: 1, activeOrgs30d: 1, users: 4, rooms30d: 2, attendance30d: 9 },
  orgs: [
    {
      id: ORG_ID,
      name: "Acme College",
      slug: "acme",
      isActive: true,
      members: 4,
      lastLoginAt: "2026-09-13T05:00:00.000Z",
      lastRoomCreatedAt: null,
      lastAttendanceAt: null,
      lastActivityAt: "2026-09-13T05:00:00.000Z",
      active7d: true,
      active30d: true,
    },
  ],
};

const renderHome = (get: OpsApi["get"]) =>
  render(
    <ApiProvider api={{ get, post: vi.fn() as never }}>
      <MemoryRouter>
        <Home whoami={whoami} />
      </MemoryRouter>
    </ApiProvider>,
  );

const fail = (code: string, status = 503) => Promise.reject(new OpsApiError(status, code));

describe("Home health and usage panels", () => {
  it("renders health when usage fails, and retries only usage", async () => {
    let usageCalls = 0;
    const get = vi.fn(async (path: string) => {
      if (path === "/health") return health;
      usageCalls++;
      return usageCalls === 1 ? fail("QUERY_TIMEOUT", 504) : usage;
    }) as unknown as OpsApi["get"];
    renderHome(get);

    const healthPanel = (await screen.findByRole("heading", { name: "Health" })).closest("section")!;
    expect(await within(healthPanel).findByText("Unhealthy")).toBeInTheDocument();
    expect(within(healthPanel).getByText("gotenberg: error")).toBeInTheDocument();
    expect(within(healthPanel).getByText("Timed out")).toBeInTheDocument();
    expect(within(healthPanel).getByText("Not configured")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /View release in Sentry/ })).toHaveAttribute(
      "href",
      "https://nvces.sentry.io/releases/abc1234/",
    );

    const usagePanel = screen.getByRole("heading", { name: "Usage" }).closest("section")!;
    expect(await within(usagePanel).findByRole("alert")).toHaveTextContent("The query timed out");

    fireEvent.click(within(usagePanel).getByRole("button", { name: "Retry" }));
    expect(await within(usagePanel).findByRole("link", { name: "Acme College" })).toHaveAttribute(
      "href",
      `/orgs/${ORG_ID}`,
    );
    expect((get as ReturnType<typeof vi.fn>).mock.calls.filter(([p]) => p === "/health")).toHaveLength(1);
  });

  it("renders usage when health fails", async () => {
    const get = vi.fn(async (path: string) =>
      path === "/usage" ? usage : fail("AUDIT_UNAVAILABLE"),
    ) as unknown as OpsApi["get"];
    renderHome(get);

    const usagePanel = (await screen.findByRole("heading", { name: "Usage" })).closest("section")!;
    expect(await within(usagePanel).findByRole("link", { name: "Acme College" })).toBeInTheDocument();
    expect(within(usagePanel).getByText("7d")).toBeInTheDocument();

    const healthPanel = screen.getByRole("heading", { name: "Health" }).closest("section")!;
    await waitFor(() => expect(within(healthPanel).getByRole("alert")).toHaveTextContent("access log is unavailable"));
    expect(screen.getByText("maint@nvces.test")).toBeInTheDocument();
  });
});
