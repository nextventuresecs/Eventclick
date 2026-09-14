import { createHash } from "crypto";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const REQUEST_ID = /^[A-Za-z0-9_-]{8,64}$/;
const SLUG = /^[a-z0-9-]{1,100}$/;

/**
 * What an Ops Console search term can be. Exact matches only: there is no
 * prefix, LIKE or similarity search anywhere, so the box cannot enumerate.
 *
 * `slugOrRequest` is a tie the resolver settles against the database: most
 * lowercase slugs are also valid request ids, so the org lookup runs first and
 * the request-id hint is returned only when no org has that slug.
 */
export type QueryClass =
  | { kind: "id"; value: string }
  | { kind: "email"; value: string }
  | { kind: "slug"; value: string }
  | { kind: "request"; value: string }
  | { kind: "slugOrRequest"; value: string }
  | { kind: "none" };

export function classifyQuery(raw: string): QueryClass {
  const q = raw.trim();
  if (UUID.test(q)) return { kind: "id", value: q.toLowerCase() };
  if (q.includes("@")) return { kind: "email", value: q.toLowerCase() };

  const slug = SLUG.test(q);
  const request = REQUEST_ID.test(q);
  if (slug && request) return { kind: "slugOrRequest", value: q };
  if (slug) return { kind: "slug", value: q };
  if (request) return { kind: "request", value: q };
  return { kind: "none" };
}

/** The audit log stores this, never the term: it would otherwise be a list of looked-up emails. */
export const searchQuerySha256 = (raw: string): string =>
  createHash("sha256").update(raw.trim().toLowerCase()).digest("hex");
