import { describe, it, expect, vi, beforeEach } from "vitest";

/**
 * Regression cover for Sentry EVENTCLICK-SERVER-9.
 *
 * `db.transaction()` inside a tenant-scoped request emitted a raw `begin`/
 * `commit` on the request's own connection instead of a savepoint, so the
 * inner commit ended the request transaction and dropped
 * `SET LOCAL app.current_tenant`. `withTransaction` must not open a
 * transaction when one is already in flight — and must still open a real one
 * when it is not (background jobs run on the bare pool).
 */
vi.mock("pg", () => ({
  Pool: class {
    connect = vi.fn();
    on = vi.fn();
    query = vi.fn();
  },
}));

const hoisted = vi.hoisted(() => ({ poolTransaction: vi.fn(async (fn: any) => fn({ tag: "pool-tx" })) }));

vi.mock("drizzle-orm/node-postgres", () => ({
  drizzle: () => ({ tag: "base-pool-db", transaction: hoisted.poolTransaction }),
}));

import { withTransaction, tenantContextStorage } from "../db";

describe("withTransaction (#EVENTCLICK-SERVER-9 — nested BEGIN ends the request transaction)", () => {
  beforeEach(() => {
    hoisted.poolTransaction.mockClear();
  });

  it("runs inline against the request transaction instead of opening a nested one", async () => {
    const scoped = { tag: "request-tx" } as any;
    const body = vi.fn(async () => "done");

    const result = await tenantContextStorage.run(scoped, () => withTransaction(body));

    expect(result).toBe("done");
    // The critical assertion: no second BEGIN/COMMIT on the pinned connection.
    expect(hoisted.poolTransaction).not.toHaveBeenCalled();
    expect(body).toHaveBeenCalledWith(scoped);
  });

  it("opens a real transaction outside a tenant-scoped request", async () => {
    const body = vi.fn(async (tx: any) => tx.tag);

    const result = await withTransaction(body);

    expect(hoisted.poolTransaction).toHaveBeenCalledTimes(1);
    expect(result).toBe("pool-tx");
  });

  it("propagates a rejection from the callback in both modes", async () => {
    const boom = new Error("boom");

    await expect(
      tenantContextStorage.run({ tag: "request-tx" } as any, () =>
        withTransaction(async () => {
          throw boom;
        }),
      ),
    ).rejects.toBe(boom);

    hoisted.poolTransaction.mockImplementationOnce(async (fn: any) => fn({ tag: "pool-tx" }));
    await expect(
      withTransaction(async () => {
        throw boom;
      }),
    ).rejects.toBe(boom);
  });
});
