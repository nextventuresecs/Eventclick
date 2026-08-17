import { describe, it, expect, vi, beforeEach } from "vitest";
import { AsyncLocalStorage } from "async_hooks";

const ORG_ID = "d0255349-35cd-4a5e-9db0-3cb6b6671c8a";
// Realistic 32-char nanoid share tokens (URL-safe alphabet).
const VALID_TOKEN = "2OhIaN6oFsL_mDtnVm1mRZsnNTZsp6HQ";
const UNKNOWN_TOKEN = "ZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZ";
const ERRORING_TOKEN = "QQQQQQQQQQQQQQQQQQQQQQQQQQQQQQQQ";

const mocks = vi.hoisted(() => {
  const query = vi.fn().mockResolvedValue({ rows: [] });
  const client = { query, release: vi.fn(), on: vi.fn() };
  const connect = vi.fn().mockResolvedValue(client);

  // Drizzle query-builder chain for the authDb share-token lookup.
  const limit = vi.fn();
  const where = vi.fn(() => ({ limit }));
  const from = vi.fn(() => ({ where }));
  const select = vi.fn(() => ({ from }));

  return { query, client, connect, select, from, where, limit };
});

vi.mock("../db", () => ({
  pool: { connect: mocks.connect },
  authDb: { select: mocks.select },
  tenantContextStorage: new AsyncLocalStorage(),
}));

import { shareTenantContext } from "../middleware/shareTenantContext";

const makeRes = () => ({ on: vi.fn(), writableFinished: true }) as any;

describe("shareTenantContext", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.connect.mockResolvedValue(mocks.client);
    mocks.query.mockResolvedValue({ rows: [] });
  });

  it("derives the tenant from the share token and opens a scoped transaction", async () => {
    mocks.limit.mockResolvedValue([{ organizationId: ORG_ID }]);
    const req: any = { params: {} };
    const next = vi.fn();

    await shareTenantContext(req, makeRes(), next, VALID_TOKEN);

    expect(mocks.connect).toHaveBeenCalledTimes(1);
    expect(mocks.query).toHaveBeenCalledWith("BEGIN");
    expect(mocks.query).toHaveBeenCalledWith(
      expect.stringContaining("set_config('app.current_tenant'"),
      [ORG_ID, ""],
    );
    expect(next).toHaveBeenCalledWith();
  });

  it("passes through without a tenant when the token matches no room", async () => {
    mocks.limit.mockResolvedValue([]);
    const req: any = { params: {} };
    const next = vi.fn();

    await shareTenantContext(req, makeRes(), next, UNKNOWN_TOKEN);

    expect(mocks.connect).not.toHaveBeenCalled();
    expect(next).toHaveBeenCalledWith();
  });

  it("does not fail the request when the lookup itself errors", async () => {
    mocks.limit.mockRejectedValue(new Error("connection reset"));
    const log = { error: vi.fn(), warn: vi.fn() };
    const req: any = { params: {}, log };
    const next = vi.fn();

    await shareTenantContext(req, makeRes(), next, ERRORING_TOKEN);

    expect(next).toHaveBeenCalledWith();
    expect(log.error).toHaveBeenCalled();
  });

  it.each([["", "empty"], ["short", "too short"], ["has spaces in it!!", "illegal chars"]])(
    "ignores a %s token (%s) without touching the database",
    async (badToken) => {
    const req: any = { params: {} };
    const next = vi.fn();

    await shareTenantContext(req, makeRes(), next, badToken as string);

    expect(mocks.select).not.toHaveBeenCalled();
    expect(mocks.connect).not.toHaveBeenCalled();
    expect(next).toHaveBeenCalledWith();
    },
  );
});
