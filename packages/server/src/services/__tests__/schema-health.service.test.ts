import { describe, it, expect, vi, beforeEach } from "vitest";

const mocks = vi.hoisted(() => ({ query: vi.fn() }));

vi.mock("../../db", () => ({ pool: { query: mocks.query } }));
vi.mock("../../utils/logger", () => ({
  logger: { warn: vi.fn(), error: vi.fn(), info: vi.fn() },
}));

import { checkSchemaInvariants } from "../schema-health.service";

const healthy = {
  role_exists: true,
  schema_usage: true,
  bypasses_rls: false,
  rls_tables_without_policy: 0,
  rls_tables_without_grant: 0,
  identity_tables_exposed: 0,
};

const rowOf = (overrides: Record<string, unknown> = {}) => ({
  rows: [{ ...healthy, ...overrides }],
});

describe("checkSchemaInvariants", () => {
  beforeEach(() => vi.clearAllMocks());

  it("reports ok when every invariant holds", async () => {
    mocks.query.mockResolvedValue(rowOf());
    await expect(checkSchemaInvariants()).resolves.toBe("ok");
  });

  // These are the exact conditions that took production down.
  it.each([
    ["missing schema USAGE", { schema_usage: false }],
    ["app_user granted BYPASSRLS", { bypasses_rls: true }],
    ["identity tables reachable by app_user", { identity_tables_exposed: 2 }],
    ["app_user role absent", { role_exists: false }],
  ])("reports error on %s", async (_label, override) => {
    mocks.query.mockResolvedValue(rowOf(override));
    await expect(checkSchemaInvariants()).resolves.toBe("error");
  });

  it.each([
    ["an RLS table with no policy", { rls_tables_without_policy: 1 }],
    ["an RLS table app_user cannot read", { rls_tables_without_grant: 3 }],
  ])("reports degraded on %s", async (_label, override) => {
    mocks.query.mockResolvedValue(rowOf(override));
    await expect(checkSchemaInvariants()).resolves.toBe("degraded");
  });

  it("reports error when the probe query itself fails", async () => {
    mocks.query.mockRejectedValue(new Error("connection reset"));
    await expect(checkSchemaInvariants()).resolves.toBe("error");
  });

  it("reports error when the probe returns no row", async () => {
    mocks.query.mockResolvedValue({ rows: [] });
    await expect(checkSchemaInvariants()).resolves.toBe("error");
  });

  it("runs as a single round trip", async () => {
    mocks.query.mockResolvedValue(rowOf());
    await checkSchemaInvariants();
    expect(mocks.query).toHaveBeenCalledTimes(1);
  });
});
