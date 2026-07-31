import { db } from "../db";
import { auditLogs } from "../db/schema";
import type { NewAuditLog } from "../db/schema/auditLogs";

type AuditAction =
  | "user.created"
  | "user.updated"
  | "user.deleted"
  | "room.created"
  | "room.updated"
  | "room.deleted"
  | "form.updated"
  | "attendance.created"
  | "report.generated"
  | "settings.updated";

export const recordAudit = async (input: {
  organizationId: string;
  actorUserId?: string;
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
