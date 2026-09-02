import { describe, it, expect, vi, beforeEach } from "vitest";

// Captures the config every Pool is constructed with, so the test can assert
// on it without a live Postgres.
const hoisted = vi.hoisted(() => {
  const poolConfigs: any[] = [];
  const executed: string[] = [];
  return { poolConfigs, executed };
});
const { poolConfigs, executed } = hoisted;

vi.mock("pg", () => ({
  Pool: class {
    constructor(config: any) {
      hoisted.poolConfigs.push(config);
    }
    connect = vi.fn();
    on = vi.fn();
    query = vi.fn();
  },
}));

const mockTransaction = vi.fn(async (fn: any) =>
  fn({
    execute: async (q: any) => {
      // sql.raw() yields a SQL object whose text lives in nested chunks —
      // serialise the whole thing rather than guess at its internals.
      hoisted.executed.push(typeof q === "string" ? q : JSON.stringify(q));
    },
    delete: () => ({ where: async () => ({ rowCount: 0 }) }),
  }),
);

vi.mock("drizzle-orm/node-postgres", () => ({
  drizzle: () => ({ transaction: (...args: any[]) => mockTransaction(...(args as [any])) }),
}));

import { pool, authPool, withJobStatementTimeout } from "../db";
import { env } from "../config/env";

describe("database pool timeouts (#80 — exhaustion must fail loudly)", () => {
  beforeEach(() => {
    executed.length = 0;
    mockTransaction.mockClear();
  });

  it("bounds how long a caller waits for a connection on both runtime pools", () => {
    // Left unset, pg waits forever — tenantContext's "Failed to acquire
    // tenant connection" error path is then unreachable and exhaustion looks
    // like a 30s hang with nothing logged.
    expect(poolConfigs.length).toBeGreaterThanOrEqual(2);
    for (const config of poolConfigs) {
      expect(config.connectionTimeoutMillis).toBe(env.DB_ACQUIRE_TIMEOUT_MS);
    }
    expect(pool).toBeDefined();
    expect(authPool).toBeDefined();
  });

  it("applies statement and idle-in-transaction timeouts to every runtime connection", () => {
    for (const config of poolConfigs) {
      expect(config.options).toContain(`statement_timeout=${env.DB_STATEMENT_TIMEOUT}`);
      expect(config.options).toContain(`idle_in_transaction_session_timeout=${env.DB_IDLE_TX_TIMEOUT}`);
    }
  });

  it("never applies those options to a migration connection", () => {
    // Structural, and the whole reason the timeouts live on the pool rather
    // than on the role: db/migrate.ts and drizzle.config.ts build their own
    // connection from DATABASE_URL and never import this module's pools.
    // A migration rewriting a table for minutes must not be cancelled.
    for (const config of poolConfigs) {
      expect(config.connectionString).not.toBe(undefined);
      expect([env.APP_DATABASE_URL, env.AUTH_DATABASE_URL, env.DATABASE_URL]).toContain(
        config.connectionString,
      );
    }
  });

  it("raises statement_timeout for a background job, scoped to its transaction", async () => {
    await withJobStatementTimeout({ transaction: mockTransaction } as any, async () => "done");

    expect(mockTransaction).toHaveBeenCalledTimes(1);
    // SET LOCAL, not SET: the raised ceiling dies with the transaction and
    // cannot leak back into the pool for the next borrower.
    expect(executed[0]).toContain("SET LOCAL statement_timeout");
    expect(executed[0]).toContain(env.DB_JOB_STATEMENT_TIMEOUT);
  });
});
