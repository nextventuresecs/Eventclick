import { describe, it, expect, vi } from "vitest";
import { createOpsApi, OpsApiError } from "./api";

const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });

describe("ops api wrapper", () => {
  it("calls the relative ops-api path same-origin without following redirects", async () => {
    const fetchImpl = vi.fn(async () => json(200, { ok: true }));
    const api = createOpsApi({ fetchImpl, reload: vi.fn() });

    await expect(api.get("/whoami")).resolves.toEqual({ ok: true });
    expect(fetchImpl).toHaveBeenCalledWith("/ops-api/v1/whoami", {
      method: "GET",
      credentials: "same-origin",
      redirect: "manual",
      headers: { Accept: "application/json" },
    });
  });

  it("posts JSON bodies", async () => {
    const fetchImpl = vi.fn(async () => json(200, { email: "a@b.c", fullName: "A" }));
    const api = createOpsApi({ fetchImpl, reload: vi.fn() });

    await api.post("/users/u1/unmask", { reason: "Customer ticket 1" });
    expect(fetchImpl).toHaveBeenCalledWith("/ops-api/v1/users/u1/unmask", {
      method: "POST",
      credentials: "same-origin",
      redirect: "manual",
      headers: { Accept: "application/json", "Content-Type": "application/json" },
      body: JSON.stringify({ reason: "Customer ticket 1" }),
    });
  });

  it("reloads the page on 401 so Cloudflare Access can re-authenticate", async () => {
    const reload = vi.fn();
    const api = createOpsApi({ fetchImpl: async () => json(401, { error: "UNAUTHENTICATED" }), reload });

    await expect(api.get("/whoami")).rejects.toMatchObject({ status: 401, code: "UNAUTHENTICATED" });
    expect(reload).toHaveBeenCalledTimes(1);
  });

  it("treats an Access login redirect (expired session) like a 401", async () => {
    const reload = vi.fn();
    const redirect = { type: "opaqueredirect", status: 0, ok: false } as Response;
    const api = createOpsApi({ fetchImpl: async () => redirect, reload });

    await expect(api.get("/whoami")).rejects.toMatchObject({ status: 401 });
    expect(reload).toHaveBeenCalledTimes(1);
  });

  it("surfaces 403 as FORBIDDEN without reloading", async () => {
    const reload = vi.fn();
    const api = createOpsApi({ fetchImpl: async () => json(403, { error: "FORBIDDEN" }), reload });

    const err = await api.get("/whoami").catch((e: unknown) => e);
    expect(err).toBeInstanceOf(OpsApiError);
    expect(err).toMatchObject({ status: 403, code: "FORBIDDEN" });
    expect(reload).not.toHaveBeenCalled();
  });

  it.each([
    [503, "AUDIT_UNAVAILABLE"],
    [504, "QUERY_TIMEOUT"],
  ])("surfaces %i with the server's error code for the panel error state", async (status, code) => {
    const api = createOpsApi({ fetchImpl: async () => json(status, { error: code }), reload: vi.fn() });
    await expect(api.get("/whoami")).rejects.toMatchObject({ status, code });
  });
});
