import { pgTable, uuid, pgPolicy } from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";

export const testTable = pgTable("test", {
  id: uuid("id").primaryKey(),
  orgId: uuid("org_id")
}, (t) => [
  pgPolicy("test_policy", {
    for: "all",
    using: sql`${t.orgId} = NULLIF(current_setting('app.current_tenant', true), '')::uuid`
  })
]);
