import { Pool } from "pg";
import type { OpsEnv } from "./env";

/**
 * Two small pools, two credentials.
 *
 * Reads connect as maintainer_ro_login (SELECT on granted columns only);
 * audit writes connect as maintainer_audit_login (INSERT on
 * maintainer_access_log only). What each can touch is enforced by Postgres
 * grants from migration 0013, not by this code. Raw parameterised `pg`
 * queries: the tenant `db` proxy resolves to tenant roles and must not be used.
 *
 * Exactly one ops-server instance serves 3-5 maintainers, so the pools are
 * sized to that and cannot starve the tenant server's connections.
 */
export function createOpsPools(env: Pick<OpsEnv, "MAINTAINER_RO_DATABASE_URL" | "MAINTAINER_AUDIT_DATABASE_URL">) {
  const common = {
    idleTimeoutMillis: 10_000,
    connectionTimeoutMillis: 3_000,
    statement_timeout: 5_000,
  };

  const read = new Pool({
    ...common,
    connectionString: env.MAINTAINER_RO_DATABASE_URL,
    max: 2,
    application_name: "ops-read",
  });

  const audit = new Pool({
    ...common,
    connectionString: env.MAINTAINER_AUDIT_DATABASE_URL,
    max: 1,
    application_name: "ops-audit",
  });

  return { read, audit };
}
