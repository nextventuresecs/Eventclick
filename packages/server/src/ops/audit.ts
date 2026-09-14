import type { Request, Response } from "express";
import type {
  MaintainerAccessAction,
  MaintainerAccessTargetType,
} from "../db/schema/maintainerAccessLog";

export interface AuditPool {
  query(text: string, values: unknown[]): Promise<unknown>;
}

export interface AuditEntry {
  action: MaintainerAccessAction;
  targetType?: MaintainerAccessTargetType;
  targetId?: string;
  organizationId?: string;
  query?: Record<string, unknown>;
  reason?: string;
}

export type AuditedRead<T> = () => Promise<{ body: T; resultCount?: number }>;

const INSERT_SQL = `INSERT INTO maintainer_access_log
  (maintainer_id, maintainer_email, action, target_type, target_id, organization_id, query, reason, result_count, request_id, ip_address, user_agent)
  VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)`;

const header = (req: Request, name: string, max: number): string | null => {
  const value = req.headers[name];
  const first = Array.isArray(value) ? value[0] : value;
  return typeof first === "string" && first !== "" ? first.slice(0, max) : null;
};

/**
 * The only way an Ops Console route may answer with data.
 *
 * Order is read → audit insert → respond. The body exists in memory before the
 * row is written, but it leaves the process only after the insert succeeds: if
 * the log cannot record who looked, nobody gets to look. The insert runs as
 * maintainer_audit_login (INSERT on this one table, nothing else), and this
 * file is the only place under src/ops allowed to contain an INSERT.
 *
 * A failed read writes no row and propagates to the ops error handler.
 */
export function createRespondAudited(deps: {
  pool: AuditPool;
  logger: { error: (obj: object, msg: string) => void };
}) {
  return async function respondAudited<T>(
    req: Request,
    res: Response,
    entry: AuditEntry,
    read: AuditedRead<T>,
  ): Promise<void> {
    const maintainer = req.maintainer;
    if (!maintainer) throw new Error("respondAudited called without an authenticated maintainer");

    const { body, resultCount } = await read();

    try {
      await deps.pool.query(INSERT_SQL, [
        maintainer.id,
        maintainer.email,
        entry.action,
        entry.targetType ?? null,
        entry.targetId ?? null,
        entry.organizationId ?? null,
        entry.query ? JSON.stringify(entry.query) : null,
        entry.reason ?? null,
        resultCount ?? null,
        String((req as Request & { id?: unknown }).id ?? ""),
        header(req, "cf-connecting-ip", 64),
        header(req, "user-agent", 512),
      ]);
    } catch (err) {
      deps.logger.error({ err, action: entry.action }, "ops audit insert failed; response withheld");
      res.status(503).json({ error: "AUDIT_UNAVAILABLE" });
      return;
    }

    res.json(body);
  };
}

export type RespondAudited = ReturnType<typeof createRespondAudited>;
