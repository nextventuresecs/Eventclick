import { describe, it, expect, vi, beforeEach } from "vitest";
import { AsyncLocalStorage } from "async_hooks";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";

// pool.connect() hands back a fake client so no real Postgres is touched.
const mocks = vi.hoisted(() => {
  const query = vi.fn().mockResolvedValue({ rows: [] });
  const release = vi.fn();
  const on = vi.fn();
  const client = { query, release, on };
  const connect = vi.fn().mockResolvedValue(client);
  return { query, release, on, client, connect };
});

vi.mock("../db", () => ({
  pool: { connect: mocks.connect },
  tenantContextStorage: new AsyncLocalStorage(),
}));

import { attachUser } from "../middleware/attachUser";
import { setTenantContext } from "../middleware/tenantContext";
import { signAccessToken } from "../services/jwt.service";

const ORG_ID = "14a2f936-ea2a-4bdc-a6b0-eb6d1c8a9703";
const USER_ID = "a9b621b1-cc29-434b-af69-8be4a30ae326";

const makeRes = () => ({ on: vi.fn(), writableFinished: true }) as any;

describe("attachUser", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.connect.mockResolvedValue(mocks.client);
  });

  it("populates req.user from a valid bearer token", () => {
    const token = signAccessToken({ sub: USER_ID, role: "admin", orgId: ORG_ID });
    const req: any = { headers: { authorization: `Bearer ${token}` } };
    const next = vi.fn();

    attachUser(req, {} as any, next);

    expect(req.user).toEqual({ id: USER_ID, role: "admin", organizationId: ORG_ID });
    expect(next).toHaveBeenCalledWith();
  });

  it("leaves req.user unset and does not reject on a malformed token", () => {
    const req: any = { headers: { authorization: "Bearer not-a-jwt" } };
    const next = vi.fn();

    attachUser(req, {} as any, next);

    expect(req.user).toBeUndefined();
    expect(next).toHaveBeenCalledWith();
  });

  it("passes through when no Authorization header is present", () => {
    const req: any = { headers: {} };
    const next = vi.fn();

    attachUser(req, {} as any, next);

    expect(req.user).toBeUndefined();
    expect(next).toHaveBeenCalledWith();
  });
});

describe("setTenantContext", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.connect.mockResolvedValue(mocks.client);
    mocks.query.mockResolvedValue({ rows: [] });
  });

  it("skips entirely for an unauthenticated request", async () => {
    const req: any = { headers: {} };
    const next = vi.fn();

    await setTenantContext(req, makeRes(), next);

    expect(mocks.connect).not.toHaveBeenCalled();
    expect(next).toHaveBeenCalledWith();
  });

  it("opens a transaction and sets app.current_tenant for an authed request", async () => {
    const req: any = { user: { id: USER_ID, role: "admin", organizationId: ORG_ID } };
    const next = vi.fn();

    await setTenantContext(req, makeRes(), next);

    expect(mocks.connect).toHaveBeenCalledTimes(1);
    expect(mocks.query).toHaveBeenCalledWith("BEGIN");
    expect(mocks.query).toHaveBeenCalledWith(
      expect.stringContaining("set_config('app.current_tenant'"),
      [ORG_ID, USER_ID],
    );
    expect(next).toHaveBeenCalledWith();
  });

  it("surfaces a 500 ApiError when the pool cannot hand out a connection", async () => {
    mocks.connect.mockRejectedValueOnce(new Error("password authentication failed"));
    const log = { error: vi.fn(), warn: vi.fn() };
    const req: any = { user: { id: USER_ID, role: "admin", organizationId: ORG_ID }, log };
    const next = vi.fn();

    await setTenantContext(req, makeRes(), next);

    const err = next.mock.calls[0]![0];
    expect(err).toBeDefined();
    expect(err.statusCode).toBe(500);
    expect(log.error).toHaveBeenCalled();
  });
});

describe("middleware ordering (regression guard for the RLS outage)", () => {
  it("mounts attachUser before setTenantContext in index.ts", () => {
    // Resolved from cwd so the file compiles under CommonJS (no import.meta)
    // and works whether vitest is invoked from the workspace or the repo root.
    const candidates = [
      path.resolve(process.cwd(), "src/index.ts"),
      path.resolve(process.cwd(), "packages/server/src/index.ts"),
      path.resolve(process.cwd(), "index.ts"),
    ];
    const indexPath = candidates.find((candidate) => existsSync(candidate));
    expect(indexPath, "could not locate server index.ts").toBeDefined();
    const source = readFileSync(indexPath as string, "utf8");

    const attachAt = source.indexOf("app.use(attachUser)");
    const tenantAt = source.indexOf("app.use(setTenantContext)");

    expect(attachAt).toBeGreaterThan(-1);
    expect(tenantAt).toBeGreaterThan(-1);
    expect(attachAt).toBeLessThan(tenantAt);
  });
});
