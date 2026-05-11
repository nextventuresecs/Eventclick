/**
 * Database query helpers for common patterns.
 *
 * withSoftDelete(table) — returns an `isNull(table.deletedAt)` condition
 * softDeleteValues()   — returns `{ deletedAt, updatedAt }` for soft-delete updates
 */
import { isNull, type SQL } from "drizzle-orm";
import type { PgColumn } from "drizzle-orm/pg-core";

/**
 * Returns an SQL condition that filters out soft-deleted rows.
 *
 * @example
 *   db.select().from(eventRooms).where(
 *     and(eq(eventRooms.organizationId, orgId), withSoftDelete(eventRooms))
 *   );
 */
export const withSoftDelete = (table: { deletedAt: PgColumn }): SQL =>
  isNull(table.deletedAt);

/**
 * Returns the column values needed for a soft-delete update.
 *
 * @example
 *   db.update(eventRooms)
 *     .set(softDeleteValues())
 *     .where(eq(eventRooms.id, id));
 */
export const softDeleteValues = () => ({
  deletedAt: new Date(),
  updatedAt: new Date(),
});
