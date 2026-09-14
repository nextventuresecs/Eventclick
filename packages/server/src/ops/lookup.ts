import type {
  MaskedUser,
  OpsMembership,
  OpsUnmaskResponse,
  OrgSummary,
  UserRole,
} from "@application/shared";
import { maskEmail, maskName } from "./mask";

/**
 * Ops Console reads (#148). Every query runs on the read pool as
 * maintainer_ro_login, names its columns (column grants make `SELECT *` fail),
 * and matches exactly: no LIKE, prefix or similarity anywhere.
 *
 * Raw email and name are read into memory and masked here; only
 * `readUnmasked` returns them.
 */

export interface ReadPool {
  query(text: string, values: unknown[]): Promise<{ rows: unknown[] }>;
}

type UserRow = {
  id: string;
  email: string;
  full_name: string;
  role: UserRole;
  organization_id: string | null;
  organization_name: string | null;
  is_active: boolean;
  email_verified: boolean;
  last_login_at: Date | null;
  created_at: Date;
  deleted_at: Date | null;
  active_session_count: number;
  last_session_at: Date | null;
};

type OrgRow = {
  id: string;
  name: string;
  slug: string;
  is_active: boolean;
  legal_hold: boolean;
  contact_email: string | null;
  created_at: Date;
  deleted_at: Date | null;
  member_count: number;
  admin_count: number;
  event_manager_count: number;
  volunteer_count: number;
  room_count: number;
};

const iso = (d: Date | null): string | null => (d ? d.toISOString() : null);

// One aggregate per user via LATERAL, so a 50-row page is one query, not 51.
const userSelect = (extraColumns = "") => `
  SELECT u.id, u.email, u.full_name, u.role, u.organization_id, o.name AS organization_name,
         u.is_active, (u.email_verified_at IS NOT NULL) AS email_verified, u.last_login_at,
         u.created_at, u.deleted_at,
         COALESCE(s.active_count, 0)::int AS active_session_count, s.last_session_at${extraColumns}
  FROM users u
  LEFT JOIN organizations o ON o.id = u.organization_id
  LEFT JOIN LATERAL (
    SELECT count(*) FILTER (WHERE se.revoked_at IS NULL AND se.expires_at > now()) AS active_count,
           max(se.created_at) AS last_session_at
    FROM sessions se
    WHERE se.user_id = u.id
  ) s ON true`;

export function toMaskedUser(row: UserRow): MaskedUser {
  return {
    id: row.id,
    emailMasked: maskEmail(row.email),
    fullNameMasked: maskName(row.full_name),
    role: row.role,
    organizationId: row.organization_id,
    organizationName: row.organization_name,
    isActive: row.is_active,
    emailVerified: row.email_verified,
    lastLoginAt: iso(row.last_login_at),
    createdAt: row.created_at.toISOString(),
    deletedAt: iso(row.deleted_at),
    activeSessionCount: row.active_session_count,
    lastSessionAt: iso(row.last_session_at),
  };
}

function toOrgSummary(row: OrgRow): OrgSummary {
  return {
    id: row.id,
    name: row.name,
    slug: row.slug,
    isActive: row.is_active,
    legalHold: row.legal_hold,
    contactEmailMasked: row.contact_email ? maskEmail(row.contact_email) : null,
    createdAt: row.created_at.toISOString(),
    deletedAt: iso(row.deleted_at),
    memberCount: row.member_count,
    roleCounts: {
      admin: row.admin_count,
      event_manager: row.event_manager_count,
      volunteer: row.volunteer_count,
    },
    roomCount: row.room_count,
  };
}

export async function findUserById(pool: ReadPool, id: string): Promise<MaskedUser | null> {
  const { rows } = await pool.query(`${userSelect()} WHERE u.id = $1`, [id]);
  return rows[0] ? toMaskedUser(rows[0] as UserRow) : null;
}

/** Emails are stored lowercase on every write path (registration schemas, Google login). */
export async function findUserByEmail(pool: ReadPool, email: string): Promise<MaskedUser | null> {
  const { rows } = await pool.query(`${userSelect()} WHERE u.email = $1`, [email.toLowerCase()]);
  return rows[0] ? toMaskedUser(rows[0] as UserRow) : null;
}

/**
 * Members are users whose primary organisation is this org, plus users linked
 * only through org_members, deduplicated. A member's role is their
 * org_members role when that row exists, else users.role. Counts exclude
 * soft-deleted users; rooms exclude soft-deleted rooms.
 */
const ORG_SUMMARY_SQL = `
  WITH member_ids AS (
    SELECT id AS user_id FROM users WHERE organization_id = $1
    UNION
    SELECT user_id FROM org_members WHERE organization_id = $1
  ),
  members AS (
    SELECT COALESCE(m.role, u.role) AS role
    FROM member_ids x
    JOIN users u ON u.id = x.user_id
    LEFT JOIN org_members m ON m.user_id = u.id AND m.organization_id = $1
    WHERE u.deleted_at IS NULL
  )
  SELECT o.id, o.name, o.slug, o.is_active, o.legal_hold, o.contact_email, o.created_at, o.deleted_at,
         (SELECT count(*) FROM members)::int AS member_count,
         (SELECT count(*) FROM members WHERE role = 'admin')::int AS admin_count,
         (SELECT count(*) FROM members WHERE role = 'event_manager')::int AS event_manager_count,
         (SELECT count(*) FROM members WHERE role = 'volunteer')::int AS volunteer_count,
         (SELECT count(*) FROM event_rooms r WHERE r.organization_id = o.id AND r.deleted_at IS NULL)::int AS room_count
  FROM organizations o`;

export async function findOrgById(pool: ReadPool, id: string): Promise<OrgSummary | null> {
  const { rows } = await pool.query(`${ORG_SUMMARY_SQL} WHERE o.id = $1`, [id]);
  return rows[0] ? toOrgSummary(rows[0] as OrgRow) : null;
}

export async function findOrgBySlug(pool: ReadPool, slug: string): Promise<OrgSummary | null> {
  // $1 is the org id inside the CTEs; resolve the slug to an id first.
  const { rows } = await pool.query("SELECT id FROM organizations WHERE slug = $1", [slug]);
  const id = (rows[0] as { id: string } | undefined)?.id;
  return id ? findOrgById(pool, id) : null;
}

export async function findMemberships(pool: ReadPool, userId: string): Promise<OpsMembership[]> {
  const { rows } = await pool.query(
    `SELECT m.organization_id, o.name AS organization_name, m.role, m.joined_at
       FROM org_members m
       LEFT JOIN organizations o ON o.id = m.organization_id
      WHERE m.user_id = $1
     UNION ALL
     SELECT u.organization_id, o.name, u.role, u.created_at
       FROM users u
       LEFT JOIN organizations o ON o.id = u.organization_id
      WHERE u.id = $1
        AND u.organization_id IS NOT NULL
        AND NOT EXISTS (SELECT 1 FROM org_members m WHERE m.user_id = u.id AND m.organization_id = u.organization_id)
     ORDER BY joined_at DESC`,
    [userId],
  );
  return (rows as Array<{ organization_id: string; organization_name: string | null; role: UserRole; joined_at: Date }>).map(
    (r) => ({
      organizationId: r.organization_id,
      organizationName: r.organization_name,
      role: r.role,
      joinedAt: r.joined_at.toISOString(),
    }),
  );
}

/**
 * Keyset cursor over (created_at, id) descending. created_at travels as
 * Postgres text, not a JS Date: timestamptz has microseconds and Date has
 * milliseconds, so a Date cursor would skip or repeat rows created within the
 * same millisecond.
 */
type Cursor = { c: string; i: string };

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
// timestamptz::text, e.g. "2026-09-14 12:28:07.123456+00" (offset form depends on the session time zone).
const PG_TIMESTAMPTZ = /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}(\.\d{1,6})?[+-]\d{2}(:\d{2}){0,2}$/;

export const encodeCursor = (cursor: Cursor): string => Buffer.from(JSON.stringify(cursor)).toString("base64url");

export function decodeCursor(raw: string): Cursor {
  let parsed: unknown;
  try {
    parsed = JSON.parse(Buffer.from(raw, "base64url").toString("utf8"));
  } catch {
    parsed = null;
  }
  const c = (parsed as Partial<Cursor> | null)?.c;
  const i = (parsed as Partial<Cursor> | null)?.i;
  if (typeof c !== "string" || !PG_TIMESTAMPTZ.test(c) || typeof i !== "string" || !UUID.test(i)) {
    throw Object.assign(new Error("invalid cursor"), { status: 400 });
  }
  return { c, i };
}

export async function listOrgUsers(
  pool: ReadPool,
  orgId: string,
  limit: number,
  cursor: Cursor | null,
): Promise<{ users: MaskedUser[]; nextCursor: string | null }> {
  // Deduplicate across both membership paths first, then paginate the result:
  // paginating each path separately would repeat or drop users at page edges.
  const { rows } = await pool.query(
    `WITH member_ids AS (
       SELECT id AS user_id FROM users WHERE organization_id = $1
       UNION
       SELECT user_id FROM org_members WHERE organization_id = $1
     )
     ${userSelect(", u.created_at::text AS created_at_cursor")}
     JOIN member_ids x ON x.user_id = u.id
     WHERE ($2::timestamptz IS NULL OR (u.created_at, u.id) < ($2::timestamptz, $3::uuid))
     ORDER BY u.created_at DESC, u.id DESC
     LIMIT $4`,
    [orgId, cursor?.c ?? null, cursor?.i ?? null, limit + 1],
  );
  const page = rows.slice(0, limit) as Array<UserRow & { created_at_cursor: string }>;
  const last = page[page.length - 1];
  const nextCursor = rows.length > limit && last ? encodeCursor({ c: last.created_at_cursor, i: last.id }) : null;
  return { users: page.map(toMaskedUser), nextCursor };
}

export async function readUnmasked(
  pool: ReadPool,
  userId: string,
): Promise<(OpsUnmaskResponse & { organizationId: string | null }) | null> {
  const { rows } = await pool.query("SELECT email, full_name, organization_id FROM users WHERE id = $1", [userId]);
  const row = rows[0] as { email: string; full_name: string; organization_id: string | null } | undefined;
  return row ? { email: row.email, fullName: row.full_name, organizationId: row.organization_id } : null;
}

/** Unmasks by this maintainer in the last rolling hour, counted from the access log itself. */
export async function countRecentUnmasks(pool: ReadPool, maintainerId: string): Promise<number> {
  const { rows } = await pool.query(
    `SELECT count(*)::int AS n FROM maintainer_access_log
      WHERE maintainer_id = $1 AND action = 'user.unmask' AND created_at > now() - interval '1 hour'`,
    [maintainerId],
  );
  return (rows[0] as { n: number }).n;
}
