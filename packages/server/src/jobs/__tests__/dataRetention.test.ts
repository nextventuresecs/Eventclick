import { describe, it, expect, vi, beforeEach } from "vitest";

const hoisted = vi.hoisted(() => ({
  // rows[table] = ids still present
  rows: {} as Record<string, string[]>,
  deletedBatches: [] as { size: number }[],
  transactions: 0,
  selectLimits: [] as number[],
  failTable: null as string | null,
}));

const tableName = (t: any): string => t?.__name ?? "unknown";

vi.mock("../../db/schema", () => {
  const mk = (name: string) => ({ __name: name, id: { __col: `${name}.id` }, submittedAt: {}, createdAt: {} });
  return {
    attendanceEntries: mk("attendance_entries"),
    activityPhotos: mk("activity_photos"),
    activitySubmissions: mk("activity_submissions"),
    roomRecordings: mk("room_recordings"),
  };
});

vi.mock("drizzle-orm", () => ({
  lt: () => ({ __op: "lt" }),
  inArray: (_col: unknown, ids: string[]) => ({ __op: "inArray", ids }),
}));

vi.mock("../../db", () => ({
  authDb: {
    select: () => ({
      from: (t: any) => ({
        where: () => ({
          limit: (n: number) => {
            hoisted.selectLimits.push(n);
            const name = tableName(t);
            if (hoisted.failTable === name) throw new Error("table exploded");
            return Promise.resolve((hoisted.rows[name] ?? []).slice(0, n).map((id) => ({ id })));
          },
        }),
      }),
    }),
  },
  withJobStatementTimeout: async (_db: unknown, fn: (tx: any) => Promise<unknown>) => {
    hoisted.transactions++;
    return fn({
      delete: (t: any) => ({
        where: (cond: any) => {
          const name = tableName(t);
          hoisted.deletedBatches.push({ size: cond.ids.length });
          hoisted.rows[name] = (hoisted.rows[name] ?? []).filter((id) => !cond.ids.includes(id));
          return Promise.resolve(undefined);
        },
      }),
    });
  },
}));

import { purgeExpiredData } from "../dataRetention";
import { DATA_RETENTION_BATCH_SIZE } from "../../config/constants";

const seed = (counts: Record<string, number>) => {
  hoisted.rows = {};
  for (const [table, n] of Object.entries(counts)) {
    hoisted.rows[table] = Array.from({ length: n }, (_, i) => `${table}-${i}`);
  }
};

describe("data retention purge (#93 — the job that never ran)", () => {
  beforeEach(() => {
    hoisted.rows = {};
    hoisted.deletedBatches = [];
    hoisted.transactions = 0;
    hoisted.selectLimits = [];
    hoisted.failTable = null;
  });

  it("deletes nothing in a dry run, but reports what it would delete", async () => {
    seed({ attendance_entries: 25 });

    const result = await purgeExpiredData(true);

    expect(result.dryRun).toBe(true);
    expect(hoisted.deletedBatches).toHaveLength(0);
    expect(hoisted.rows.attendance_entries).toHaveLength(25);
    expect(result.tables.find((t) => t.table === "attendance_entries")?.examined).toBe(25);
  });

  it("deletes expired rows when the dry run is turned off", async () => {
    seed({ attendance_entries: 3, activity_photos: 2 });

    const result = await purgeExpiredData(false);

    expect(hoisted.rows.attendance_entries).toHaveLength(0);
    expect(hoisted.rows.activity_photos).toHaveLength(0);
    expect(result.totalDeleted).toBe(5);
  });

  it("never holds one long transaction over a large backlog", async () => {
    // The point of the change: the previous shape wrapped all four deletes in
    // a single transaction, which on the first real run would hold locks and a
    // snapshot over every row ever accumulated — blocking writers and stalling
    // autovacuum precisely when the table needs it.
    seed({ attendance_entries: DATA_RETENTION_BATCH_SIZE * 2 + 5 });

    await purgeExpiredData(false);

    expect(hoisted.transactions).toBe(3);
    expect(hoisted.deletedBatches.map((b) => b.size)).toEqual([
      DATA_RETENTION_BATCH_SIZE,
      DATA_RETENTION_BATCH_SIZE,
      5,
    ]);
  });

  it("bounds every batch to the configured size", async () => {
    seed({ attendance_entries: 10 });

    await purgeExpiredData(false);

    for (const limit of hoisted.selectLimits) {
      expect(limit).toBe(DATA_RETENTION_BATCH_SIZE);
    }
  });

  it("keeps purging the other tables when one fails", async () => {
    // A failure must be logged and must not stop the run, or one bad table
    // quietly ends retention for everything.
    seed({ attendance_entries: 2, activity_photos: 2, activity_submissions: 2, room_recordings: 2 });
    hoisted.failTable = "activity_photos";

    const result = await purgeExpiredData(false);

    expect(result.tables).toHaveLength(4);
    expect(result.tables.find((t) => t.table === "activity_photos")?.deleted).toBe(0);
    expect(hoisted.rows.room_recordings).toHaveLength(0);
    expect(result.totalDeleted).toBe(6);
  });

  it("reports what it examined, what it deleted, and how long it took", async () => {
    seed({ attendance_entries: 4 });

    const result = await purgeExpiredData(false);

    expect(result).toMatchObject({ retentionDays: expect.any(Number), totalDeleted: 4 });
    expect(result.durationMs).toBeGreaterThanOrEqual(0);
    expect(new Date(result.cutoff).getTime()).toBeLessThan(Date.now());
    expect(result.tables).toHaveLength(4);
  });

  it("derives the cutoff from the configured retention period", async () => {
    const result = await purgeExpiredData(true);

    const expected = Date.now() - result.retentionDays * 24 * 60 * 60 * 1000;
    expect(Math.abs(new Date(result.cutoff).getTime() - expected)).toBeLessThan(5_000);
  });
});
