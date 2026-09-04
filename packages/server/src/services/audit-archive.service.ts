import { gzipSync } from "zlib";
import { PutObjectCommand } from "@aws-sdk/client-s3";
import { s3 } from "./storage.service";
import { env } from "../config/env";
import { logger } from "../utils/logger";

/**
 * Writes expired audit rows to WORM storage before the retention purge deletes
 * them.
 *
 * **Why this exists.** Deleting is not the same as expiring. The retention
 * period bounds how long the *live* table answers questions; it should not be
 * the moment the record stops existing. The industry norm is tier-then-delete:
 * move the rows to storage nobody can quietly edit, then remove them from the
 * hot database. `AUDIT_ARCHIVE_BUCKET` is expected to carry an R2 bucket lock
 * (or S3 Object Lock) rule, which is what makes the copy immutable — this code
 * writes a normal object and relies on that bucket-level rule, because R2
 * enforces retention through bucket lock rules rather than per-object headers.
 *
 * **It must not be the same bucket as `S3_BUCKET`.** A lock rule covering
 * recordings and activity photos would make them undeletable too, which breaks
 * the data retention purge and every erasure request.
 *
 * ## Pseudonymisation
 *
 * Immutable storage and GDPR art. 17 erasure are in direct tension: a row that
 * cannot be deleted for a year cannot be erased on request. The way out taken
 * here is to keep the audit value and leave the direct identifiers behind.
 *
 * Dropped entirely: `actor_email`, `ip_address`, `user_agent`.
 * Kept: `actor_user_id` — a UUID is meaningless without the `users` table, so
 * it is a pseudonym in the art. 4(5) sense. It still answers "what did this
 * actor do", which is the question the archive exists for, and it stops
 * answering it the moment the user row is gone.
 *
 * `old_values` / `new_values` are free-form JSON written by call sites, so they
 * can carry identifiers the columns do not. Keys matching {@link REDACTED_KEYS}
 * are replaced rather than dropped, so the shape of the change is still legible
 * — you can see that an email was changed without the archive telling you to
 * what.
 *
 * **Residual risk, stated plainly:** the redaction list is a denylist over data
 * this module does not control. A future call site can put personal data in a
 * key nobody listed here, and it will reach the archive. Revisit this list when
 * adding an audit action that records new fields.
 */

/** Keys whose values are replaced before an audit row reaches immutable storage. */
const REDACTED_KEYS = new Set([
  "email",
  "actoremail",
  "contactemail",
  "newemail",
  "oldemail",
  "phone",
  "phonenumber",
  "ipaddress",
  "ip",
  "useragent",
  "name",
  "fullname",
  "firstname",
  "lastname",
  "displayname",
  "avatarurl",
  "password",
  "passwordhash",
  "token",
  "secret",
]);

const REDACTED = "[redacted]";

/** One archived audit row: the live row minus its direct identifiers. */
export interface ArchivedAuditRow {
  id: string;
  organizationId: string;
  actorUserId: string | null;
  action: string;
  resourceType: string;
  resourceId: string | null;
  oldValues: unknown;
  newValues: unknown;
  createdAt: string;
}

/** The live-row shape the purge hands over. */
export interface PurgeableAuditRow {
  id: string;
  organizationId: string;
  actorUserId: string | null;
  action: string;
  resourceType: string;
  resourceId: string | null;
  oldValues: string | null;
  newValues: string | null;
  createdAt: Date;
}

/**
 * Replaces the values of personal-data keys, at any depth.
 *
 * Recurses through objects and arrays because call sites nest — a
 * `user.updated` entry writes `{ before: { email }, after: { email } }` as
 * readily as it writes `{ email }`.
 */
const redact = (value: unknown): unknown => {
  if (Array.isArray(value)) return value.map(redact);
  if (value === null || typeof value !== "object") return value;

  const out: Record<string, unknown> = {};
  for (const [key, val] of Object.entries(value as Record<string, unknown>)) {
    out[key] = REDACTED_KEYS.has(key.toLowerCase()) ? REDACTED : redact(val);
  }
  return out;
};

/**
 * Parses a stored JSON blob and redacts it.
 *
 * Unparseable input degrades to `null` rather than failing the archive: the
 * column is `text` holding `JSON.stringify` output, so a row written by code
 * that has since changed shape is possible, and one bad row must not block the
 * purge of everything around it. The same tolerance `audit.service.ts` applies
 * on the read path.
 */
const parseAndRedact = (raw: string | null, rowId: string): unknown => {
  if (!raw) return null;
  try {
    return redact(JSON.parse(raw));
  } catch {
    logger.warn({ auditLogId: rowId }, "Audit row has unparseable JSON values — archived as null");
    return null;
  }
};

export const toArchivedRow = (row: PurgeableAuditRow): ArchivedAuditRow => ({
  id: row.id,
  organizationId: row.organizationId,
  actorUserId: row.actorUserId,
  action: row.action,
  resourceType: row.resourceType,
  resourceId: row.resourceId,
  oldValues: parseAndRedact(row.oldValues, row.id),
  newValues: parseAndRedact(row.newValues, row.id),
  createdAt: row.createdAt.toISOString(),
});

/** Whether an archive destination is configured at all. */
export const isAuditArchiveConfigured = (): boolean => env.AUDIT_ARCHIVE_BUCKET.length > 0;

/**
 * Object key for one organisation's slice of one batch.
 *
 * Partitioned by organisation first so a later "produce this customer's audit
 * history" request is a prefix listing rather than a scan of every object. The
 * run stamp groups everything one pass wrote, so a run can be located whole.
 */
export const buildArchiveKey = (
  organizationId: string,
  runStamp: string,
  batchIndex: number,
): string => `audit/${organizationId}/${runStamp}/${String(batchIndex).padStart(5, "0")}.ndjson.gz`;

/**
 * Archives one batch, grouped into one object per organisation.
 *
 * NDJSON rather than a JSON array so the file streams line by line and a
 * truncated object still yields every complete record before the truncation.
 * Gzipped because audit rows are repetitive text and the archive is written
 * once and read almost never.
 *
 * **Throws on any failure, and the caller must not delete when it does.** An
 * archive that silently no-ops turns tier-then-delete back into delete, which
 * is the exact failure this module exists to prevent.
 *
 * Returns the keys written, so the purge can report them and an operator can
 * find the objects that correspond to a given deletion.
 */
export const archiveAuditBatch = async (
  rows: PurgeableAuditRow[],
  runStamp: string,
  batchIndex: number,
): Promise<string[]> => {
  if (!isAuditArchiveConfigured()) {
    throw new Error("archiveAuditBatch called with no AUDIT_ARCHIVE_BUCKET configured");
  }
  if (rows.length === 0) return [];

  const byOrg = new Map<string, PurgeableAuditRow[]>();
  for (const row of rows) {
    const bucket = byOrg.get(row.organizationId);
    if (bucket) bucket.push(row);
    else byOrg.set(row.organizationId, [row]);
  }

  const keys: string[] = [];
  for (const [organizationId, orgRows] of byOrg) {
    const ndjson = orgRows.map((r) => JSON.stringify(toArchivedRow(r))).join("\n") + "\n";
    const body = gzipSync(Buffer.from(ndjson, "utf8"));
    const key = buildArchiveKey(organizationId, runStamp, batchIndex);

    const result = await s3.send(
      new PutObjectCommand({
        Bucket: env.AUDIT_ARCHIVE_BUCKET,
        Key: key,
        Body: body,
        ContentType: "application/x-ndjson",
        ContentEncoding: "gzip",
      }),
    );

    // A PutObject that returns without an ETag did not durably store anything
    // we can point at. Treat it as a failed archive rather than assuming the
    // 200 meant what we wanted — the next thing the caller does is delete.
    if (!result.ETag) {
      throw new Error(`Audit archive PutObject returned no ETag for ${key}`);
    }

    logger.info(
      {
        key,
        organizationId,
        rows: orgRows.length,
        bytes: body.byteLength,
        event: "audit_retention.archived",
      },
      `Archived ${orgRows.length} audit rows to ${key}`,
    );
    keys.push(key);
  }

  return keys;
};
