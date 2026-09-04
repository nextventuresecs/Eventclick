import { describe, it, expect, vi, beforeEach } from "vitest";

const hoisted = vi.hoisted(() => ({
  rows: [] as { id: string; organizationId: string }[],
  heldOrgs: [] as string[],
  deletedBatches: [] as { size: number }[],
  transactions: 0,
  selectLimits: [] as number[],
  inserted: [] as Record<string, unknown>[],
  insertThrows: false,
  deleteAffectsNothing: false,
  archiveConfigured: true,
  archiveThrows: false,
  // Interleaved record of archive/delete calls, to prove the ordering.
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

vi.mock("../../db/schema", () => ({
  auditLogs: {
    __name: "audit_logs",
    id: { __col: "audit_logs.id" },
    organizationId: { __col: "audit_logs.organization_id" },
    createdAt: {},
  },
  organizations: {
    __name: "organizations",
    id: { __col: "organizations.id" },
    legalHold: {},
  },
}));

vi.mock("../../services/audit-archive.service", () => ({
  isAuditArchiveConfigured: () => hoisted.archiveConfigured,
  archiveAuditBatch: async (rows: { organizationId: string }[]) => {
    hoisted.callOrder.push("archive");
    if (hoisted.archiveThrows) throw new Error("archive upload failed");
    return [...new Set(rows.map((r) => r.organizationId))].map((o) => `audit/${o}/run/00000.ndjson.gz`);
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
          // loadHeldOrganizationIds awaits the where() directly — no limit().
          if (tableName(t) === "organizations") {
            return Promise.resolve(hoisted.heldOrgs.map((id) => ({ id })));
          }
          return {
            limit: (n: number) => {
              hoisted.selectLimits.push(n);
              const excluded = excludedOrgs(cond);
              const visible = hoisted.rows.filter((r) => !excluded.includes(r.organizationId));
              return Promise.resolve(visible.slice(0, n));
            },
          };
        },
      }),
    }),
    insert: () => ({
      values: (rows: Record<string, unknown>[]) => {
        if (hoisted.insertThrows) return Promise.reject(new Error("receipt insert failed"));
        hoisted.inserted.push(...rows);
        return Promise.resolve({ rowCount: rows.length });
      },
    }),
  },
  withJobStatementTimeout: async (_db: unknown, fn: (tx: any) => Promise<unknown>) => {
    hoisted.transactions++;
    return fn({
      delete: () => ({
        where: (cond: any) => {
          hoisted.callOrder.push("delete");
          hoisted.deletedBatches.push({ size: cond.ids.length });
          if (hoisted.deleteAffectsNothing) return Promise.resolve({ rowCount: 0 });
          hoisted.rows = hoisted.rows.filter((r) => !cond.ids.includes(r.id));
          return Promise.resolve({ rowCount: cond.ids.length });
        },
      }),
    });
  },
}));

import { purgeExpiredAuditLogs } from "../auditRetention";
import { AUDIT_RETENTION_BATCH_SIZE } from "../../config/constants";

const seed = (spec: Record<string, number>) => {
  hoisted.rows = [];
  for (const [organizationId, n] of Object.entries(spec)) {
    for (let i = 0; i < n; i++) {
      hoisted.rows.push({ id: `${organizationId}-${i}`, organizationId });
    }
  }
};

describe("audit log retention purge", () => {
  beforeEach(() => {
    hoisted.rows = [];
    hoisted.heldOrgs = [];
    hoisted.deletedBatches = [];
    hoisted.transactions = 0;
    hoisted.selectLimits = [];
    hoisted.inserted = [];
    hoisted.insertThrows = false;
    hoisted.deleteAffectsNothing = false;
    hoisted.archiveConfigured = true;
    hoisted.archiveThrows = false;
    hoisted.callOrder = [];
  });

  it("deletes nothing in a dry run, but reports what it would delete", async () => {
    seed({ "org-1": 12 });

    const result = await purgeExpiredAuditLogs(true);

    expect(result.dryRun).toBe(true);
    expect(hoisted.deletedBatches).toHaveLength(0);
    expect(hoisted.rows).toHaveLength(12);
    expect(result.examined).toBe(12);
    expect(result.deleted).toBe(0);
  });

  it("writes no receipt for a dry run", async () => {
    // A dry run changed nothing, so there is nothing to attest to — and the
    // receipt would itself be a row in the table the run refused to touch.
    seed({ "org-1": 5 });

    await purgeExpiredAuditLogs(true);

    expect(hoisted.inserted).toHaveLength(0);
  });

  it("deletes expired rows when the dry run is turned off", async () => {
    seed({ "org-1": 4 });

    const result = await purgeExpiredAuditLogs(false);

    expect(hoisted.rows).toHaveLength(0);
    expect(result.deleted).toBe(4);
  });

  it("records its own purge in the audit trail, one receipt per organisation", async () => {
    // An audit trail that can be trimmed without leaving a trace is not an
    // audit trail.
    seed({ "org-1": 3, "org-2": 2 });

    const result = await purgeExpiredAuditLogs(false);

    expect(result.receiptsWritten).toBe(2);
    expect(hoisted.inserted).toHaveLength(2);

    const orgOne = hoisted.inserted.find((r) => r.organizationId === "org-1");
    expect(orgOne).toMatchObject({
      action: "audit.purged",
      resourceType: "audit_log",
      actorUserId: null,
      actorEmail: "system:audit-retention",
    });
    expect(JSON.parse(orgOne!.newValues as string)).toMatchObject({ deleted: 3 });
  });

  it("writes no receipt when a real run deleted nothing", async () => {
    // A daily no-op run that recorded "purged 0" would add a row per
    // organisation per day to the very table this job exists to bound.
    const result = await purgeExpiredAuditLogs(false);

    expect(result.deleted).toBe(0);
    expect(result.receiptsWritten).toBe(0);
    expect(hoisted.inserted).toHaveLength(0);
  });

  it("keeps the purge when the receipt cannot be written", async () => {
    // The rows are already gone and the run cannot be replayed — reporting a
    // failure that undid nothing would misstate what happened.
    seed({ "org-1": 2 });
    hoisted.insertThrows = true;

    const result = await purgeExpiredAuditLogs(false);

    expect(result.deleted).toBe(2);
    expect(result.receiptsWritten).toBe(0);
    expect(hoisted.rows).toHaveLength(0);
  });

  it("keeps every row belonging to an organisation under legal hold", async () => {
    seed({ "org-free": 3, "org-under-hold": 4 });
    hoisted.heldOrgs = ["org-under-hold"];

    const result = await purgeExpiredAuditLogs(false);

    expect(result.deleted).toBe(3);
    expect(result.heldOrganizations).toBe(1);
    expect(hoisted.rows.map((r) => r.organizationId)).toEqual(Array(4).fill("org-under-hold"));
  });

  it("never holds one long transaction over a large backlog", async () => {
    seed({ "org-1": AUDIT_RETENTION_BATCH_SIZE * 2 + 7 });

    await purgeExpiredAuditLogs(false);

    expect(hoisted.transactions).toBe(3);
    expect(hoisted.deletedBatches.map((b) => b.size)).toEqual([
      AUDIT_RETENTION_BATCH_SIZE,
      AUDIT_RETENTION_BATCH_SIZE,
      7,
    ]);
  });

  it("bounds every batch to the configured size", async () => {
    seed({ "org-1": 9 });

    await purgeExpiredAuditLogs(false);

    for (const limit of hoisted.selectLimits) {
      expect(limit).toBe(AUDIT_RETENTION_BATCH_SIZE);
    }
  });

  it("throws rather than looping when the delete removes nothing", async () => {
    // audit_logs is FORCE RLS with no DELETE policy and DELETE revoked from
    // app_user. If the purge ever runs as the wrong role the statement is a
    // no-op, and without this check the same batch is re-selected forever.
    seed({ "org-1": 6 });
    hoisted.deleteAffectsNothing = true;

    await expect(purgeExpiredAuditLogs(false)).rejects.toThrow(/deleted 0 of 6 rows/);
    expect(hoisted.deletedBatches).toHaveLength(1);
    expect(hoisted.rows).toHaveLength(6);
  });

  it("derives the cutoff from the configured retention period", async () => {
    const result = await purgeExpiredAuditLogs(true);

    const expected = Date.now() - result.retentionDays * 24 * 60 * 60 * 1000;
    expect(Math.abs(new Date(result.cutoff).getTime() - expected)).toBeLessThan(5_000);
  });

  it("archives every batch before deleting it, never the other way round", async () => {
    // The whole point of tier-then-delete: nothing is destroyed before its
    // copy exists.
    seed({ "org-1": AUDIT_RETENTION_BATCH_SIZE + 3 });

    const result = await purgeExpiredAuditLogs(false);

    expect(hoisted.callOrder).toEqual(["archive", "delete", "archive", "delete"]);
    expect(result.archived).toBe(2);
  });

  it("deletes nothing when the archive upload fails", async () => {
    // Fail closed. An archive that errors must leave the rows in place, or
    // tier-then-delete quietly becomes delete.
    seed({ "org-1": 5 });
    hoisted.archiveThrows = true;

    await expect(purgeExpiredAuditLogs(false)).rejects.toThrow(/archive upload failed/);
    expect(hoisted.deletedBatches).toHaveLength(0);
    expect(hoisted.rows).toHaveLength(5);
  });

  it("refuses to delete at all when no archive bucket is configured", async () => {
    // A missing bucket is far more likely to be unfinished setup than a
    // decision, and the first real run destroys everything since launch.
    seed({ "org-1": 5 });
    hoisted.archiveConfigured = false;

    const result = await purgeExpiredAuditLogs(false);

    expect(result.refusedReason).toMatch(/AUDIT_ARCHIVE_BUCKET is not set/);
    expect(result.deleted).toBe(0);
    expect(hoisted.deletedBatches).toHaveLength(0);
    expect(hoisted.rows).toHaveLength(5);
  });

  it("still reports the backlog in a dry run with no archive configured", async () => {
    // Dry runs delete nothing, and reporting the backlog is exactly how an
    // operator decides what to do about the missing bucket.
    seed({ "org-1": 5 });
    hoisted.archiveConfigured = false;

    const result = await purgeExpiredAuditLogs(true);

    expect(result.refusedReason).toBeUndefined();
    expect(result.examined).toBe(5);
    expect(result.archived).toBe(0);
  });
});
