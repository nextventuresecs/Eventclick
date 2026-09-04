import { describe, it, expect, vi, beforeEach } from "vitest";
import { gunzipSync } from "zlib";

const hoisted = vi.hoisted(() => ({
  puts: [] as { Bucket: string; Key: string; Body: Buffer; ContentEncoding?: string }[],
  returnEtag: true,
  bucket: "eventclick-audit-archive",
}));

vi.mock("../storage.service", () => ({
  s3: {
    send: async (cmd: { input: typeof hoisted.puts[number] }) => {
      hoisted.puts.push(cmd.input);
      return hoisted.returnEtag ? { ETag: '"abc123"' } : {};
    },
  },
}));

vi.mock("@aws-sdk/client-s3", () => ({
  PutObjectCommand: class {
    input: unknown;
    constructor(input: unknown) {
      this.input = input;
    }
  },
}));

vi.mock("../../config/env", () => ({
  env: {
    get AUDIT_ARCHIVE_BUCKET() {
      return hoisted.bucket;
    },
  },
}));

import {
  archiveAuditBatch,
  buildArchiveKey,
  isAuditArchiveConfigured,
  toArchivedRow,
  type PurgeableAuditRow,
} from "../audit-archive.service";

const row = (over: Partial<PurgeableAuditRow> = {}): PurgeableAuditRow => ({
  id: "row-1",
  organizationId: "org-1",
  actorUserId: "user-1",
  action: "user.updated",
  resourceType: "user",
  resourceId: "user-2",
  oldValues: null,
  newValues: null,
  createdAt: new Date("2025-01-02T03:04:05.000Z"),
  ...over,
});

/** Reads back what was actually uploaded. */
const uploadedRows = (index = 0): Record<string, unknown>[] =>
  gunzipSync(hoisted.puts[index]!.Body)
    .toString("utf8")
    .trim()
    .split("\n")
    .map((l) => JSON.parse(l));

describe("audit archive pseudonymisation", () => {
  beforeEach(() => {
    hoisted.puts = [];
    hoisted.returnEtag = true;
    hoisted.bucket = "eventclick-audit-archive";
  });

  it("drops the direct identifiers the row carries as columns", () => {
    // Immutable storage and GDPR art. 17 erasure are in tension. The way out
    // is to keep the audit value and leave the direct identifiers behind.
    const archived = toArchivedRow(row());

    expect(archived).not.toHaveProperty("actorEmail");
    expect(archived).not.toHaveProperty("ipAddress");
    expect(archived).not.toHaveProperty("userAgent");
  });

  it("keeps the actor id, which is what makes the archive worth having", () => {
    // A UUID is meaningless without the users table — a pseudonym in the
    // art. 4(5) sense — and it still answers "what did this actor do".
    const archived = toArchivedRow(row({ actorUserId: "user-1" }));

    expect(archived.actorUserId).toBe("user-1");
    expect(archived.action).toBe("user.updated");
    expect(archived.createdAt).toBe("2025-01-02T03:04:05.000Z");
  });

  it("redacts personal data inside the values blobs, at any depth", () => {
    const archived = toArchivedRow(
      row({
        oldValues: JSON.stringify({ email: "a@b.com", role: "admin" }),
        newValues: JSON.stringify({
          nested: { email: "c@d.com", phone: "+1234", ipAddress: "1.2.3.4" },
          list: [{ userAgent: "Mozilla" }],
          role: "owner",
        }),
      }),
    );

    // The shape of the change survives; the values do not.
    expect(archived.oldValues).toEqual({ email: "[redacted]", role: "admin" });
    expect(archived.newValues).toEqual({
      nested: { email: "[redacted]", phone: "[redacted]", ipAddress: "[redacted]" },
      list: [{ userAgent: "[redacted]" }],
      role: "owner",
    });
  });

  it("matches redacted keys case-insensitively", () => {
    const archived = toArchivedRow(row({ newValues: JSON.stringify({ Email: "x", IPAddress: "y" }) }));

    expect(archived.newValues).toEqual({ Email: "[redacted]", IPAddress: "[redacted]" });
  });

  it("degrades an unparseable blob to null rather than failing the archive", () => {
    // The column is text holding JSON.stringify output, so a row written by
    // code that has since changed shape is possible. One bad row must not
    // block the purge of everything around it.
    const archived = toArchivedRow(row({ oldValues: "{not json" }));

    expect(archived.oldValues).toBeNull();
  });
});

describe("audit archive upload", () => {
  beforeEach(() => {
    hoisted.puts = [];
    hoisted.returnEtag = true;
    hoisted.bucket = "eventclick-audit-archive";
  });

  it("writes one gzipped NDJSON object per organisation in the batch", async () => {
    const keys = await archiveAuditBatch(
      [
        row({ id: "a", organizationId: "org-1" }),
        row({ id: "b", organizationId: "org-2" }),
        row({ id: "c", organizationId: "org-1" }),
      ],
      "run-stamp",
      0,
    );

    expect(keys).toHaveLength(2);
    expect(hoisted.puts).toHaveLength(2);
    expect(hoisted.puts[0]!.Bucket).toBe("eventclick-audit-archive");
    expect(hoisted.puts[0]!.ContentEncoding).toBe("gzip");

    // org-1's object holds both of its rows, and nothing of org-2's.
    const first = uploadedRows(0);
    expect(first.map((r) => r.id)).toEqual(["a", "c"]);
  });

  it("partitions by organisation first so one customer's history is a prefix listing", () => {
    expect(buildArchiveKey("org-1", "2026-09-04T10-00-00-000Z", 7)).toBe(
      "audit/org-1/2026-09-04T10-00-00-000Z/00007.ndjson.gz",
    );
  });

  it("throws when the upload returns no ETag", async () => {
    // A PutObject with no ETag stored nothing we can point at, and the next
    // thing the caller does is delete.
    hoisted.returnEtag = false;

    await expect(archiveAuditBatch([row()], "run", 0)).rejects.toThrow(/no ETag/);
  });

  it("refuses to run with no bucket configured", async () => {
    hoisted.bucket = "";

    expect(isAuditArchiveConfigured()).toBe(false);
    await expect(archiveAuditBatch([row()], "run", 0)).rejects.toThrow(/no AUDIT_ARCHIVE_BUCKET/);
  });

  it("uploads nothing for an empty batch", async () => {
    expect(await archiveAuditBatch([], "run", 0)).toEqual([]);
    expect(hoisted.puts).toHaveLength(0);
  });
});
