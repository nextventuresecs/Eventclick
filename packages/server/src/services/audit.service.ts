import { and, count, desc, eq, gte, lt } from "drizzle-orm";
import type { AuditAction, AuditLogEntry, AuditLogPage, AuditLogQuery } from "@application/shared";
import { db } from "../db";
import { auditLogs } from "../db/schema";
import type { AuditLog, NewAuditLog } from "../db/schema/auditLogs";
import { logger } from "../utils/logger";

export const recordAudit = async (input: {
  organizationId: string;
  actorUserId?: string;
  actorEmail?: string;
  action: AuditAction;
  resourceType: string;
  resourceId?: string;
  oldValues?: Record<string, unknown>;
  newValues?: Record<string, unknown>;
  ipAddress?: string;
  userAgent?: string;
}) => {
  const row: NewAuditLog = {
    organizationId: input.organizationId,
    actorUserId: input.actorUserId ?? null,
    actorEmail: input.actorEmail ?? null,
    action: input.action,
    resourceType: input.resourceType,
    resourceId: input.resourceId ?? null,
    oldValues: input.oldValues ? JSON.stringify(input.oldValues) : null,
    newValues: input.newValues ? JSON.stringify(input.newValues) : null,
    ipAddress: input.ipAddress ?? null,
    userAgent: input.userAgent ?? null,
  };

  await db.insert(auditLogs).values(row);
};

/**
 * `old_values` / `new_values` are `text` holding `JSON.stringify` output, not
 * `jsonb`, so a row written by code that has since changed shape — or
 * truncated at the column boundary — is possible. Parsed per row rather than
 * per page, so one bad row degrades to `null` instead of failing the whole
 * listing with a 500 nobody can act on.
 */
const parseValues = (raw: string | null, rowId: string): Record<string, unknown> | null => {
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed : null;
  } catch {
    logger.warn({ auditLogId: rowId }, "Audit log row has unparseable JSON values");
    return null;
  }
};

const toEntry = (row: AuditLog): AuditLogEntry => ({
  id: row.id,
  actorUserId: row.actorUserId,
  actorEmail: row.actorEmail,
  action: row.action,
  resourceType: row.resourceType,
  resourceId: row.resourceId,
  oldValues: parseValues(row.oldValues, row.id),
  newValues: parseValues(row.newValues, row.id),
  ipAddress: row.ipAddress,
  userAgent: row.userAgent,
  createdAt: row.createdAt.toISOString(),
});

/**
 * One organisation's audit entries, newest first.
 *
 * **Tenant scoping is RLS, not a WHERE clause.** This runs through the
 * tenant-scoped `db` proxy, so `audit_logs_tenant_isolation` filters it.
 * Adding `WHERE organization_id = ?` as well would work today and would
 * quietly become the only protection if this were ever called from a
 * background context where no tenant is set — one mechanism is safer than two
 * that can disagree.
 *
 * Offset pagination rather than a cursor: it matches the existing
 * `listOrgUsersForAdmin` shape, and `audit_logs_org_created_idx`
 * (organization_id, created_at DESC) serves exactly this query.
 */
export const listAuditLogs = async (query: AuditLogQuery): Promise<AuditLogPage> => {
  const filters = [
    query.actorUserId ? eq(auditLogs.actorUserId, query.actorUserId) : undefined,
    query.action ? eq(auditLogs.action, query.action) : undefined,
    query.resourceType ? eq(auditLogs.resourceType, query.resourceType) : undefined,
    query.resourceId ? eq(auditLogs.resourceId, query.resourceId) : undefined,
    query.from ? gte(auditLogs.createdAt, new Date(query.from)) : undefined,
    query.to ? lt(auditLogs.createdAt, new Date(query.to)) : undefined,
  ].filter((f): f is NonNullable<typeof f> => f !== undefined);

  const where = filters.length > 0 ? and(...filters) : undefined;

  const rows = await db
    .select()
    .from(auditLogs)
    .where(where)
    .orderBy(desc(auditLogs.createdAt))
    .limit(query.limit)
    .offset(query.offset);

  // Separate count so the caller can page without re-fetching everything;
  // same RLS scope, same filters.
  const [totals] = await db.select({ value: count() }).from(auditLogs).where(where);

  return {
    items: rows.map(toEntry),
    total: totals?.value ?? 0,
    limit: query.limit,
    offset: query.offset,
  };
};
