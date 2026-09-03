import { describe, it, expect, vi, beforeEach } from "vitest";
import { AsyncLocalStorage } from "async_hooks";
import { API_PREFIX } from "@application/shared";

const ORG_ID = "d0255349-35cd-4a5e-9db0-3cb6b6671c8a";
const USER_ID = "a1b2c3d4-0000-4000-8000-000000000001";

const mocks = vi.hoisted(() => {
  const query = vi.fn().mockResolvedValue({ rows: [] });
  const client = { query, release: vi.fn(), on: vi.fn() };
  const connect = vi.fn().mockResolvedValue(client);
  return { query, client, connect };
});

vi.mock("../db", () => ({
  pool: { connect: mocks.connect },
  tenantContextStorage: new AsyncLocalStorage(),
}));

import {
  setTenantContext,
  TENANT_CONTEXT_EXEMPT_PATHS,
  isTenantContextExempt,
} from "../middleware/tenantContext";
import { notificationRoutes } from "../routes/notification.routes";

const makeRes = () => ({ on: vi.fn(), writableFinished: true }) as any;
const makeReq = (path: string): any => ({
  path,
  user: { id: USER_ID, organizationId: ORG_ID },
});

describe("tenant context exemptions (#78 — SSE must not pin a pooled connection)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.connect.mockResolvedValue(mocks.client);
  });

  it("borrows no connection for the notification stream", async () => {
    const next = vi.fn();

    await setTenantContext(makeReq(`${API_PREFIX}/notifications/stream`), makeRes(), next);

    // The whole point: nothing acquired, so nothing to hold for the hours
    // the stream stays open.
    expect(mocks.connect).not.toHaveBeenCalled();
    expect(mocks.query).not.toHaveBeenCalled();
    expect(next).toHaveBeenCalledWith();
  });

  it("still pins a tenant transaction for ordinary routes", async () => {
    const next = vi.fn();

    await setTenantContext(makeReq(`${API_PREFIX}/notifications`), makeRes(), next);

    expect(mocks.connect).toHaveBeenCalledTimes(1);
    expect(mocks.query).toHaveBeenCalledWith("BEGIN");
    expect(mocks.query).toHaveBeenCalledWith(
      expect.stringContaining("set_config('app.current_tenant'"),
      [ORG_ID, USER_ID],
    );
  });

  it("does not exempt a path that merely starts with an exempt one", () => {
    expect(isTenantContextExempt(`${API_PREFIX}/notifications/stream/extra`)).toBe(false);
    expect(isTenantContextExempt(`${API_PREFIX}/notifications/streams`)).toBe(false);
  });

  it("every exempt path still resolves to a mounted route", () => {
    // Guards the fragile half of this fix: the exemption is a path string, so
    // renaming or moving the SSE route would silently re-pin a connection per
    // open tab. Walk the router's own stack rather than trusting the constant.
    const mounted = new Set(
      (notificationRoutes as any).stack
        .filter((layer: any) => layer.route)
        .map((layer: any) => `${API_PREFIX}/notifications${layer.route.path === "/" ? "" : layer.route.path}`),
    );

    expect(TENANT_CONTEXT_EXEMPT_PATHS.length).toBeGreaterThan(0);
    for (const path of TENANT_CONTEXT_EXEMPT_PATHS) {
      expect(mounted).toContain(path);
    }
  });
});
