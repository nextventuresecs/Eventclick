import { describe, it, expect, vi, beforeEach } from "vitest";

const hoisted = vi.hoisted(() => ({
  // rows[table] = rows still present, as { id, organizationId }
  rows: {} as Record<string, { id: string; organizationId: string; storageKey?: string | null }[]>,
  // Keys actually handed to deleteObjects, in order — asserted on directly,
  // because a broken key extraction still passes a call-count check.
  deletedKeys: [] as string[],
  failKeys: [] as string[],
  deletedBatches: [] as { size: number }[],
  transactions: 0,
  selectLimits: [] as number[],
  failTable: null as string | null,
  heldOrgs: [] as string[],
  // Set to make the mocked DELETE report fewer rows than it was given, the
  // shape a revoked privilege or a missing DELETE policy produces.
  deleteAffectsNothing: false,
  callOrder: [] as string[],
}));

const tableName = (t: any): string => t?.__name ?? "unknown";

/** Excluded organisation ids carried by a (possibly nested) where condition. */
const excludedOrgs = (cond: any): string[] => {
  if (!cond) return [];
  if (cond.__op === "notInArray") return cond.ids;
  if (cond.__op === "and") return cond.conds.flatMap(excludedOrgs);
  return [];
};

vi.mock("../../db/schema", () => {
  const mk = (name: string) => ({
    __name: name,
    id: { __col: `${name}.id` },
    organizationId: { __col: `${name}.organization_id` },
    photoKey: { __col: `${name}.photo_key` },
    s3Key: { __col: `${name}.s3_key` },
    submittedAt: {},
    createdAt: {},
  });
  return {
    attendanceEntries: mk("attendance_entries"),
    activityPhotos: mk("activity_photos"),
    activitySubmissions: mk("activity_submissions"),
    roomRecordings: mk("room_recordings"),
    organizations: { ...mk("organizations"), legalHold: { __col: "organizations.legal_hold" } },
    auditLogs: mk("audit_logs"),
  };
});

vi.mock("../../services/storage.service", () => ({
  deleteObjects: async (keys: string[]) => {
    hoisted.deletedKeys.push(...keys);
    hoisted.callOrder.push("deleteObjects");
    return keys.filter((k) => hoisted.failKeys.includes(k));
  },
}));

vi.mock("drizzle-orm", () => ({
  lt: () => ({ __op: "lt" }),
  eq: () => ({ __op: "eq" }),
  and: (...conds: unknown[]) => ({ __op: "and", conds }),
  inArray: (_col: unknown, ids: string[]) => ({ __op: "inArray", ids }),
  notInArray: (_col: unknown, ids: string[]) => ({ __op: "notInArray", ids }),
}));

vi.mock("../../db", () => ({
  authDb: {
    select: () => ({
      from: (t: any) => ({
        where: (cond: any) => {
          const name = tableName(t);

          // loadHeldOrganizationIds awaits the where() directly — no limit().
          if (name === "organizations") {
            return Promise.resolve(hoisted.heldOrgs.map((id) => ({ id })));
          }

          return {
            limit: (n: number) => {
              hoisted.selectLimits.push(n);
              if (hoisted.failTable === name) throw new Error("table exploded");
              const excluded = excludedOrgs(cond);
              const visible = (hoisted.rows[name] ?? []).filter(
                (r) => !excluded.includes(r.organizationId),
              );
              return Promise.resolve(visible.slice(0, n));
            },
          };
        },
      }),
    }),
  },
  withJobStatementTimeout: async (_db: unknown, fn: (tx: any) => Promise<unknown>) => {
    hoisted.transactions++;
    return fn({
      delete: (t: any) => ({
        where: (cond: any) => {
          const name = tableName(t);
          hoisted.callOrder.push("deleteRows");
          hoisted.deletedBatches.push({ size: cond.ids.length });
          if (hoisted.deleteAffectsNothing) return Promise.resolve({ rowCount: 0 });
          hoisted.rows[name] = (hoisted.rows[name] ?? []).filter((r) => !cond.ids.includes(r.id));
          return Promise.resolve({ rowCount: cond.ids.length });
        },
      }),
    });
  },
}));

import { purgeExpiredData } from "../dataRetention";
import { DATA_RETENTION_BATCH_SIZE } from "../../config/constants";

const DEFAULT_ORG = "org-1";

const seed = (counts: Record<string, number>, organizationId = DEFAULT_ORG) => {
  hoisted.rows = {};
  for (const [table, n] of Object.entries(counts)) {
    hoisted.rows[table] = Array.from({ length: n }, (_, i) => ({
      id: `${table}-${i}`,
      organizationId,
      storageKey: `${table}/key-${i}.jpg`,
    }));
  }
};

describe("data retention purge (#93 — the job that never ran)", () => {
  beforeEach(() => {
    hoisted.rows = {};
    hoisted.deletedBatches = [];
    hoisted.transactions = 0;
    hoisted.selectLimits = [];
    hoisted.failTable = null;
    hoisted.heldOrgs = [];
    hoisted.deleteAffectsNothing = false;
    hoisted.deletedKeys = [];
    hoisted.failKeys = [];
    hoisted.callOrder = [];
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

  it("keeps every row belonging to an organisation under legal hold", async () => {
    // Retention that destroys evidence during a dispute is worse than
    // retention that keeps data too long.
    seed({ attendance_entries: 6 }, "org-under-hold");
    hoisted.heldOrgs = ["org-under-hold"];

    const result = await purgeExpiredData(false);

    expect(hoisted.rows.attendance_entries).toHaveLength(6);
    expect(result.totalDeleted).toBe(0);
    expect(result.heldOrganizations).toBe(1);
  });

  it("still purges organisations that are not on hold", async () => {
    seed({ attendance_entries: 4 }, "org-free");
    hoisted.rows.attendance_entries = [
      ...(hoisted.rows.attendance_entries ?? []),
      { id: "held-1", organizationId: "org-under-hold" },
    ];
    hoisted.heldOrgs = ["org-under-hold"];

    const result = await purgeExpiredData(false);

    expect(hoisted.rows.attendance_entries).toEqual([
      { id: "held-1", organizationId: "org-under-hold" },
    ]);
    expect(result.totalDeleted).toBe(4);
  });

  it("deletes the object before the row that names it", async () => {
    // The key lives only in the row. Delete the row first and the file is
    // stranded in the bucket with nothing able to name it again.
    seed({ attendance_entries: 2 });

    await purgeExpiredData(false);

    expect(hoisted.callOrder).toEqual(["deleteObjects", "deleteRows"]);
  });

  it("passes the rows' actual storage keys, not just the right number of them", async () => {
    seed({ activity_photos: 3 });

    const result = await purgeExpiredData(false);

    expect(hoisted.deletedKeys).toEqual([
      "activity_photos/key-0.jpg",
      "activity_photos/key-1.jpg",
      "activity_photos/key-2.jpg",
    ]);
    expect(result.tables.find((t) => t.table === "activity_photos")?.objectsDeleted).toBe(3);
  });

  it("keeps a row whose object could not be deleted, and purges the rest", async () => {
    // Opposite stance to the audit archive, on purpose: a row kept one more
    // day is recoverable, a row deleted whose object leaked is not.
    seed({ activity_photos: 3 });
    hoisted.failKeys = ["activity_photos/key-1.jpg"];

    const result = await purgeExpiredData(false);

    expect(hoisted.rows.activity_photos?.map((r) => r.id)).toEqual(["activity_photos-1"]);
    const table = result.tables.find((t) => t.table === "activity_photos");
    expect(table).toMatchObject({ deleted: 2, objectsDeleted: 2, objectsFailed: 1 });
  });

  it("skips rows with no storage key rather than sending empty keys", async () => {
    // A pending recording has no s3_key, and an attendance entry need not
    // carry a photo.
    seed({ room_recordings: 2 });
    hoisted.rows.room_recordings = hoisted.rows.room_recordings!.map((r) => ({
      ...r,
      storageKey: null,
    }));

    const result = await purgeExpiredData(false);

    expect(hoisted.deletedKeys).toEqual([]);
    expect(result.tables.find((t) => t.table === "room_recordings")?.deleted).toBe(2);
  });

  it("does not reach for storage on a table that has no key column", async () => {
    seed({ activity_submissions: 2 });

    await purgeExpiredData(false);

    expect(hoisted.callOrder).toEqual(["deleteRows"]);
    expect(hoisted.deletedKeys).toEqual([]);
  });

  it("deletes no objects in a dry run", async () => {
    seed({ activity_photos: 4 });

    await purgeExpiredData(true);

    expect(hoisted.deletedKeys).toEqual([]);
    expect(hoisted.callOrder).toEqual([]);
  });

  it("stops the table when every row in a batch is blocked on its object", async () => {
    // Otherwise the same rows are re-selected forever.
    seed({ activity_photos: 2 });
    hoisted.failKeys = ["activity_photos/key-0.jpg", "activity_photos/key-1.jpg"];

    const result = await purgeExpiredData(false);

    expect(hoisted.deletedBatches).toHaveLength(0);
    expect(hoisted.rows.activity_photos).toHaveLength(2);
    expect(result.tables.find((t) => t.table === "activity_photos")?.objectsFailed).toBe(2);
  });

  it("aborts a table rather than looping when the delete removes nothing", async () => {
    // The SELECT just found these rows, so a DELETE that matches none of them
    // means the statement was blocked. Without the rowCount check the same
    // batch is re-selected forever while the counter climbs past what was
    // actually removed.
    seed({ attendance_entries: 5 });
    hoisted.deleteAffectsNothing = true;

    const result = await purgeExpiredData(false);

    // One blocked attempt on the only seeded table, then abort — not a loop.
    expect(hoisted.deletedBatches).toEqual([{ size: 5 }]);
    expect(result.totalDeleted).toBe(0);
    expect(hoisted.rows.attendance_entries).toHaveLength(5);
  });
});
