import { describe, it, expect, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import type { OpsUserDetailResponse } from "@application/shared";
import { ApiProvider, type OpsApi } from "@/lib/apiContext";
import { OpsApiError } from "@/lib/api";
import { UserDetailPage } from "./UserDetail";
import { SearchResults, NO_MATCH } from "./SearchResults";

const USER_ID = "7d5b3c1e-0000-4000-8000-000000000001";
const detail: OpsUserDetailResponse = {
  user: {
    id: USER_ID,
    emailMasked: "ja***@e***.org",
    fullNameMasked: "J. D.",
    role: "volunteer",
    organizationId: null,
    organizationName: null,
    isActive: true,
    emailVerified: false,
    lastLoginAt: null,
    createdAt: "2026-09-14T05:00:00.000Z",
    deletedAt: null,
    activeSessionCount: 0,
    lastSessionAt: null,
  },
  memberships: [],
};

const renderAt = (api: OpsApi, path: string) =>
  render(
    <ApiProvider api={api}>
      <MemoryRouter initialEntries={[path]}>
        <Routes>
          <Route path="/users/:id" element={<UserDetailPage />} />
          <Route path="/search" element={<SearchResults />} />
        </Routes>
      </MemoryRouter>
    </ApiProvider>,
  );

const makeApi = (post: OpsApi["post"] = vi.fn(async () => ({ email: "jane.doe@example.org", fullName: "Jane Doe" })) as never) =>
  ({ get: vi.fn(async () => detail) as never, post }) satisfies OpsApi;

describe("UserDetail unmask", () => {
  it("keeps Confirm disabled until the reason is 10-500 characters, then posts the trimmed reason", async () => {
    const api = makeApi();
    renderAt(api, `/users/${USER_ID}`);

    fireEvent.click(await screen.findByRole("button", { name: "Unmask" }));
    const confirm = screen.getByRole("button", { name: "Confirm unmask" });
    const reason = screen.getByLabelText("Reason");

    fireEvent.change(reason, { target: { value: "  too short " } });
    expect(confirm).toBeDisabled();
    expect(screen.getByText(/9\/500/)).toBeInTheDocument();

    fireEvent.change(reason, { target: { value: "  Ticket 4411 login  " } });
    expect(confirm).toBeEnabled();
    fireEvent.click(confirm);

    await waitFor(() =>
      expect(api.post).toHaveBeenCalledWith(`/users/${USER_ID}/unmask`, { reason: "Ticket 4411 login" }),
    );
    expect(await screen.findByText("jane.doe@example.org")).toBeInTheDocument();
    expect(screen.getByText("Jane Doe")).toBeInTheDocument();
  });

  it("shows unmasked values only while mounted; a fresh render is masked again", async () => {
    const api = makeApi();
    const first = renderAt(api, `/users/${USER_ID}`);

    fireEvent.click(await screen.findByRole("button", { name: "Unmask" }));
    fireEvent.change(screen.getByLabelText("Reason"), { target: { value: "Ticket 4411 login check" } });
    fireEvent.click(screen.getByRole("button", { name: "Confirm unmask" }));
    expect(await screen.findByText("jane.doe@example.org")).toBeInTheDocument();

    first.unmount();
    expect(document.body.textContent).not.toContain("jane.doe@example.org");

    renderAt(api, `/users/${USER_ID}`);
    expect(await screen.findByText("ja***@e***.org")).toBeInTheDocument();
    expect(screen.queryByText("jane.doe@example.org")).not.toBeInTheDocument();
  });

  it("explains the hourly limit when the server refuses", async () => {
    const api = makeApi(vi.fn(async () => Promise.reject(new OpsApiError(429, "UNMASK_LIMIT"))) as never);
    renderAt(api, `/users/${USER_ID}`);

    fireEvent.click(await screen.findByRole("button", { name: "Unmask" }));
    fireEvent.change(screen.getByLabelText("Reason"), { target: { value: "Ticket 4411 login check" } });
    fireEvent.click(screen.getByRole("button", { name: "Confirm unmask" }));

    expect(await screen.findByRole("alert")).toHaveTextContent("Unmask limit reached");
    expect(screen.getByText("ja***@e***.org")).toBeInTheDocument();
  });
});

describe("SearchResults", () => {
  it("explains exact matching when nothing is found", async () => {
    const api = { get: vi.fn(async () => ({ results: [] })), post: vi.fn() } as never as OpsApi;
    renderAt(api, "/search?q=jane%40example.or");
    expect(await screen.findByText(NO_MATCH)).toBeInTheDocument();
    expect(api.get).toHaveBeenCalledWith("/search?q=jane%40example.or");
  });
});
