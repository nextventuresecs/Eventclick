import type { OpsUsage, OpsUsageOrg } from "@application/shared";
import type { ReadPool } from "./lookup";

export const USAGE_ORG_LIMIT = 200;

/**
 * Per-org activity from timestamps the app already writes. One statement: each
 * CTE aggregates one table by organization_id (users_org_idx,
 * event_rooms_org_idx, attendance_entries_org_idx), and the totals are window
 * aggregates, so they count every org even though the rows stop at the limit.
 *
 * Scope is non-deleted organisations; users, rooms and attendance exclude
 * soft-deleted rows. Runs under the read pool's 5s statement_timeout, which
 * the ops error handler answers with 504 QUERY_TIMEOUT.
 */
const USAGE_SQL = `
  WITH members AS (
    SELECT organization_id, count(*)::int AS members, max(last_login_at) AS last_login_at
    FROM users
    WHERE organization_id IS NOT NULL AND deleted_at IS NULL
    GROUP BY organization_id
  ),
  rooms AS (
    SELECT organization_id, max(created_at) AS last_room_created_at,
           count(*) FILTER (WHERE created_at >= now() - interval '30 days')::int AS rooms_30d
    FROM event_rooms
    WHERE deleted_at IS NULL
    GROUP BY organization_id
  ),
  attendance AS (
    SELECT organization_id, max(submitted_at) AS last_attendance_at,
           count(*) FILTER (WHERE submitted_at >= now() - interval '30 days')::int AS attendance_30d
    FROM attendance_entries
    WHERE deleted_at IS NULL
    GROUP BY organization_id
  ),
  per_org AS (
    SELECT o.id, o.name, o.slug, o.is_active,
           COALESCE(m.members, 0) AS members,
           m.last_login_at, r.last_room_created_at, a.last_attendance_at,
           GREATEST(m.last_login_at, r.last_room_created_at, a.last_attendance_at) AS last_activity_at,
           COALESCE(r.rooms_30d, 0) AS rooms_30d,
           COALESCE(a.attendance_30d, 0) AS attendance_30d
    FROM organizations o
    LEFT JOIN members m ON m.organization_id = o.id
    LEFT JOIN rooms r ON r.organization_id = o.id
    LEFT JOIN attendance a ON a.organization_id = o.id
    WHERE o.deleted_at IS NULL
  ),
  flagged AS (
    SELECT *,
           COALESCE(last_activity_at >= now() - interval '7 days', false) AS active_7d,
           COALESCE(last_activity_at >= now() - interval '30 days', false) AS active_30d
    FROM per_org
  )
  SELECT id, name, slug, is_active, members, last_login_at, last_room_created_at, last_attendance_at,
         last_activity_at, active_7d, active_30d,
         count(*) OVER ()::int AS total_orgs,
         count(*) FILTER (WHERE active_7d) OVER ()::int AS total_active_7d,
         count(*) FILTER (WHERE active_30d) OVER ()::int AS total_active_30d,
         sum(members) OVER ()::int AS total_users,
         sum(rooms_30d) OVER ()::int AS total_rooms_30d,
         sum(attendance_30d) OVER ()::int AS total_attendance_30d
  FROM flagged
  ORDER BY last_activity_at DESC NULLS LAST, name ASC
  LIMIT $1`;

type UsageRow = {
  id: string;
  name: string;
  slug: string;
  is_active: boolean;
  members: number;
  last_login_at: Date | null;
  last_room_created_at: Date | null;
  last_attendance_at: Date | null;
  last_activity_at: Date | null;
  active_7d: boolean;
  active_30d: boolean;
  total_orgs: number;
  total_active_7d: number;
  total_active_30d: number;
  total_users: number;
  total_rooms_30d: number;
  total_attendance_30d: number;
};

const iso = (d: Date | null): string | null => (d ? d.toISOString() : null);

export async function readUsage(pool: ReadPool, limit = USAGE_ORG_LIMIT): Promise<OpsUsage> {
  const { rows } = (await pool.query(USAGE_SQL, [limit])) as { rows: UsageRow[] };
  const first = rows[0];

  return {
    generatedAt: new Date().toISOString(),
    totals: {
      orgs: first?.total_orgs ?? 0,
      activeOrgs7d: first?.total_active_7d ?? 0,
      activeOrgs30d: first?.total_active_30d ?? 0,
      users: first?.total_users ?? 0,
      rooms30d: first?.total_rooms_30d ?? 0,
      attendance30d: first?.total_attendance_30d ?? 0,
    },
    orgs: rows.map(
      (r): OpsUsageOrg => ({
        id: r.id,
        name: r.name,
        slug: r.slug,
        isActive: r.is_active,
        members: r.members,
        lastLoginAt: iso(r.last_login_at),
        lastRoomCreatedAt: iso(r.last_room_created_at),
        lastAttendanceAt: iso(r.last_attendance_at),
        lastActivityAt: iso(r.last_activity_at),
        active7d: r.active_7d,
        active30d: r.active_30d,
      }),
    ),
  };
}
