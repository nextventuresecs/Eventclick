import { describe, it, expect, vi, beforeEach } from "vitest";

const hoisted = vi.hoisted(() => ({
  rows: [] as any[],
  orderByArgs: [] as unknown[],
  lastLimit: 0,
  lastOffset: 0,
}));

const makeSelect = () => {
  const chain: any = {
    from: () => chain,
    where: () => chain,
    orderBy: (...args: unknown[]) => {
      hoisted.orderByArgs = args;
      return chain;
    },
    limit: (n: number) => {
      hoisted.lastLimit = n;
      chain._limit = n;
      return chain;
    },
    offset: (n: number) => {
      hoisted.lastOffset = n;
      return Promise.resolve(hoisted.rows.slice(n, n + (chain._limit ?? 50)));
    },
    // The count() query awaits without .limit/.offset.
    then: (onFulfilled: (v: any) => void) =>
      Promise.resolve([{ value: hoisted.rows.length }]).then(onFulfilled),
  };
  return chain;
};

vi.mock("../../db", () => ({
  db: { select: () => makeSelect() },
  authDb: { select: () => makeSelect() },
}));

import { listOrgUsersForAdmin } from "../admin.service";
import { ORG_USER_PAGE_SIZE, ORG_USER_MAX_PAGE_SIZE, OrgUserQuerySchema } from "@application/shared";

const ORG = "aaaaaaaa-0000-4000-8000-000000000001";

const user = (i: number, overrides: Partial<any> = {}) => ({
  id: `user-${String(i).padStart(3, "0")}`,
  organizationId: ORG,
  email: `u${i}@a.test`,
  fullName: `User ${i}`,
  role: "volunteer",
  isActive: true,
  createdAt: new Date("2026-01-01T00:00:00.000Z"),
  deletedAt: null,
  ...overrides,
});

describe("listOrgUsersForAdmin pagination (#89)", () => {
  beforeEach(() => {
    hoisted.rows = [];
    hoisted.orderByArgs = [];
    hoisted.lastLimit = 0;
    hoisted.lastOffset = 0;
  });

  it("bounds the query instead of selecting every user", async () => {
    // This was the last unbounded list query in the service.
    hoisted.rows = Array.from({ length: 500 }, (_, i) => user(i));

    const page = await listOrgUsersForAdmin(ORG, { limit: 50, offset: 0 });

    expect(page.items).toHaveLength(50);
    expect(hoisted.lastLimit).toBe(50);
  });

  it("reports the unpaged total so the client can page", async () => {
    hoisted.rows = Array.from({ length: 137 }, (_, i) => user(i));

    const page = await listOrgUsersForAdmin(ORG, { limit: 50, offset: 100 });

    expect(page.total).toBe(137);
    expect(page.items).toHaveLength(37);
    expect(page.offset).toBe(100);
    expect(page.limit).toBe(50);
  });

  it("orders by a total key, so paging cannot skip or repeat a user", async () => {
    // fullName alone is NOT unique. With a non-unique sort key Postgres may
    // order tied rows differently per query, so under LIMIT/OFFSET a
    // duplicate-named user can appear on two pages while another never
    // appears at all. The id tiebreaker is what makes the order total.
    hoisted.rows = [user(1, { fullName: "Same Name" }), user(2, { fullName: "Same Name" })];

    await listOrgUsersForAdmin(ORG, { limit: 50, offset: 0 });

    expect(hoisted.orderByArgs).toHaveLength(2);
  });

  it("walks the whole set without gaps or repeats across pages", async () => {
    hoisted.rows = Array.from({ length: 125 }, (_, i) => user(i));

    const seen: string[] = [];
    for (let offset = 0; offset < 125; offset += 50) {
      const page = await listOrgUsersForAdmin(ORG, { limit: 50, offset });
      seen.push(...page.items.map((u) => u.id));
    }

    expect(seen).toHaveLength(125);
    expect(new Set(seen).size).toBe(125);
  });
});

describe("OrgUserQuerySchema defaults and caps (#89)", () => {
  it("defaults to a sensible page size with no parameters", () => {
    expect(OrgUserQuerySchema.parse({})).toEqual({
      limit: ORG_USER_PAGE_SIZE,
      offset: 0,
    });
  });

  it("enforces a hard maximum so a caller cannot ask for everything", () => {
    expect(OrgUserQuerySchema.safeParse({ limit: ORG_USER_MAX_PAGE_SIZE + 1 }).success).toBe(false);
  });

  it("rejects a negative offset", () => {
    expect(OrgUserQuerySchema.safeParse({ offset: -1 }).success).toBe(false);
  });

  it("coerces string query parameters, since they arrive from a URL", () => {
    expect(OrgUserQuerySchema.parse({ limit: "10", offset: "20" })).toEqual({
      limit: 10,
      offset: 20,
    });
  });
});
