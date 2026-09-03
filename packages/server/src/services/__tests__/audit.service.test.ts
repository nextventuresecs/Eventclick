import { describe, it, expect, vi, beforeEach } from "vitest";
import { AsyncLocalStorage } from "async_hooks";

// Mirrors share-tenant-context.test.ts: a fake tenant-scoped drizzle that only
// returns rows whose organizationId matches the tenant currently set on the
// connection. That is what RLS does in Postgres, and modelling it here is what
// lets the cross-tenant test assert isolation rather than assert that the
// controller passed the right orgId.
const hoisted = vi.hoisted(() => ({
  rows: [] as any[],
  tenant: { current: "" },
  lastOrderBy: [] as unknown[],
}));

const scopedRows = () => hoisted.rows.filter((r) => r.organizationId === hoisted.tenant.current);

const makeSelect = () => {
  const chain: any = {
    from: () => chain,
    where: () => chain,
    orderBy: (...args: unknown[]) => {
      // drizzle's desc() returns an SQL object graph — capture it as-is and
      // inspect it below; JSON.stringify throws on it.
      hoisted.lastOrderBy.push(args[0]);
      return chain;
    },
    limit: (n: number) => {
      chain._limit = n;
      return chain;
    },
    offset: (n: number) => Promise.resolve(scopedRows().slice(n, n + (chain._limit ?? 50))),
    then: (onFulfilled: (v: any) => void) =>
      // The count() query awaits without .limit/.offset.
      Promise.resolve([{ value: scopedRows().length }]).then(onFulfilled),
  };
  return chain;
};

vi.mock("../../db", () => ({
  db: { select: () => makeSelect(), insert: () => ({ values: async () => undefined }) },
  tenantContextStorage: new AsyncLocalStorage(),
}));

import { listAuditLogs } from "../audit.service";

const ORG_A = "aaaaaaaa-0000-4000-8000-000000000001";
const ORG_B = "bbbbbbbb-0000-4000-8000-000000000002";

const row = (overrides: Partial<any> = {}) => ({
  id: "11111111-0000-4000-8000-000000000001",
  organizationId: ORG_A,
  actorUserId: "22222222-0000-4000-8000-000000000002",
  actorEmail: "admin@a.test",
  action: "user.deleted",
  resourceType: "user",
  resourceId: "33333333-0000-4000-8000-000000000003",
  oldValues: JSON.stringify({ email: "gone@a.test", role: "volunteer" }),
  newValues: null,
  ipAddress: "203.0.113.5",
  userAgent: "vitest",
  createdAt: new Date("2026-09-01T10:00:00.000Z"),
  ...overrides,
});

const query = (overrides: Partial<any> = {}) => ({ limit: 50, offset: 0, ...overrides }) as any;

/** Depth-limited search for "desc" inside drizzle's SQL object graph. */
const mentionsDesc = (value: unknown, depth = 0): boolean => {
  if (depth > 6 || value == null) return false;
  if (typeof value === "string") return /desc/i.test(value);
  if (Array.isArray(value)) return value.some((v) => mentionsDesc(v, depth + 1));
  if (typeof value === "object") {
    return Object.values(value as Record<string, unknown>).some((v) => mentionsDesc(v, depth + 1));
  }
  return false;
};

describe("listAuditLogs (#91)", () => {
  beforeEach(() => {
    hoisted.rows = [];
    hoisted.lastOrderBy = [];
    hoisted.tenant.current = ORG_A;
  });

  it("returns this organisation's entries", async () => {
    hoisted.rows = [row()];

    const page = await listAuditLogs(query());

    expect(page.items).toHaveLength(1);
    expect(page.items[0]).toMatchObject({
      action: "user.deleted",
      actorEmail: "admin@a.test",
      resourceType: "user",
    });
    expect(page.total).toBe(1);
  });

  it("never returns another organisation's entries", async () => {
    // The AC names this case explicitly. Isolation is RLS on the tenant-pinned
    // connection, not a WHERE clause in the query — so this asserts that a
    // caller in org A's context sees nothing belonging to org B.
    hoisted.rows = [row({ id: "b-row", organizationId: ORG_B, actorEmail: "admin@b.test" })];
    hoisted.tenant.current = ORG_A;

    const page = await listAuditLogs(query());

    expect(page.items).toHaveLength(0);
    expect(page.total).toBe(0);
  });

  it("orders newest first", async () => {
    hoisted.rows = [row()];

    await listAuditLogs(query());

    // The index this query relies on is (organization_id, created_at DESC);
    // ordering ascending would silently stop using it for the common case.
    expect(hoisted.lastOrderBy).toHaveLength(1);
    expect(mentionsDesc(hoisted.lastOrderBy[0])).toBe(true);
  });

  it("parses the stored before/after JSON", async () => {
    hoisted.rows = [row()];

    const page = await listAuditLogs(query());

    expect(page.items[0]!.oldValues).toEqual({ email: "gone@a.test", role: "volunteer" });
    expect(page.items[0]!.newValues).toBeNull();
  });

  it("degrades one unparseable row to null instead of failing the page", async () => {
    // old_values/new_values are text holding JSON.stringify output, not jsonb,
    // so a row written by since-changed code can be malformed. One bad row
    // must not 500 the whole listing.
    hoisted.rows = [row({ oldValues: "{not json" }), row({ id: "ok-row" })];

    const page = await listAuditLogs(query());

    expect(page.items).toHaveLength(2);
    expect(page.items[0]!.oldValues).toBeNull();
    expect(page.items[1]!.oldValues).toEqual({ email: "gone@a.test", role: "volunteer" });
  });

  it("ignores a non-object JSON value", async () => {
    hoisted.rows = [row({ oldValues: JSON.stringify("just a string") })];

    const page = await listAuditLogs(query());

    expect(page.items[0]!.oldValues).toBeNull();
  });

  it("pages through with limit and offset, reporting the unpaged total", async () => {
    hoisted.rows = Array.from({ length: 5 }, (_, i) => row({ id: `row-${i}` }));

    const page = await listAuditLogs(query({ limit: 2, offset: 2 }));

    expect(page.items.map((i) => i.id)).toEqual(["row-2", "row-3"]);
    expect(page.total).toBe(5);
    expect(page.limit).toBe(2);
    expect(page.offset).toBe(2);
  });

  it("serialises timestamps as ISO strings", async () => {
    hoisted.rows = [row()];

    const page = await listAuditLogs(query());

    expect(page.items[0]!.createdAt).toBe("2026-09-01T10:00:00.000Z");
  });
});
