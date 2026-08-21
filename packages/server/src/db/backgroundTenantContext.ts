import type { PoolClient } from "pg";
import { drizzle } from "drizzle-orm/node-postgres";
import { pool, tenantContextStorage } from "./index";
import * as schema from "./schema";

/**
 * The non-Express counterpart to middleware/tenantContext.ts's
 * runInTenantContext — for code with no request/response to hang a
 * commit-on-finish lifecycle off of: poll jobs (eventStartNotifier,
 * attendanceWindowNotifier) and debounced/setTimeout-deferred work
 * (event-stream-notification.service.ts) that outlives the request that
 * scheduled it.
 *
 * Every RLS-scoped write (notificationService.createNotification,
 * pushService.sendToUser's subscription lookup, etc.) goes through the `db`
 * proxy, which resolves to whatever tenant-scoped connection
 * tenantContextStorage currently holds — or, with none set, to the bare
 * app_user_login pool with no `app.current_tenant`, which RLS then denies
 * outright (organization_id = NULL matches nothing). A background job has
 * no ambient request to inherit that context from, so it must open one
 * itself, scoped to the one organization it's about to act on, and close it
 * again when done — never reuse a stale context left over from a since-
 * finished HTTP request (that connection has already been committed and
 * released back to the pool, and may be serving a different request by the
 * time a deferred callback runs).
 *
 * Does NOT check tenantContextStorage.getStore() and reuse it if present —
 * a debounced callback's ambient AsyncLocalStorage context can outlive the
 * request that scheduled it after the pooled connection it wraps has
 * already been released; reusing it would write through a stale/reassigned
 * connection. Always opens a fresh, short-lived connection instead.
 */
export async function runInBackgroundTenantContext<T>(
  organizationId: string,
  actingUserId: string,
  fn: () => Promise<T>,
): Promise<T> {
  const client: PoolClient = await pool.connect();
  try {
    await client.query("BEGIN");
    await client.query(
      "SELECT set_config('app.current_tenant', $1, true), set_config('app.current_user_id', $2, true)",
      [organizationId, actingUserId],
    );
    const tx = drizzle(client, { schema });
    const result = await tenantContextStorage.run(tx, fn);
    await client.query("COMMIT");
    return result;
  } catch (err) {
    await client.query("ROLLBACK").catch(() => {});
    throw err;
  } finally {
    client.release();
  }
}
