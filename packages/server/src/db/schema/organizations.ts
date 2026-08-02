import { pgTable, uuid, varchar, text, timestamp, boolean, pgPolicy } from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";

export const organizations = pgTable("organizations", {
  id: uuid("id").primaryKey().default(sql`uuid_generate_v4()`),
  name: varchar("name", { length: 160 }).notNull(),
  slug: varchar("slug", { length: 80 }).notNull().unique(),
  description: text("description"),
  logoUrl: text("logo_url"),
  websiteUrl: text("website_url"),
  contactEmail: varchar("contact_email", { length: 320 }),
  isActive: boolean("is_active").notNull().default(true),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  deletedAt: timestamp("deleted_at", { withTimezone: true }),
}, (table) => [
  pgPolicy("organizations_read_own", {
    as: "permissive",
    for: "select",
    using: sql`${table.id} = NULLIF(current_setting('app.current_tenant', true), '')::uuid`
  }),
  pgPolicy("organizations_update_own", {
    as: "permissive",
    for: "update",
    using: sql`${table.id} = NULLIF(current_setting('app.current_tenant', true), '')::uuid`,
    withCheck: sql`${table.id} = NULLIF(current_setting('app.current_tenant', true), '')::uuid`
  }),
  pgPolicy("organizations_delete_own", {
    as: "permissive",
    for: "delete",
    using: sql`${table.id} = NULLIF(current_setting('app.current_tenant', true), '')::uuid`
  }),
  pgPolicy("organizations_insert_new", {
    as: "permissive",
    for: "insert",
    withCheck: sql`true`
  })
]);

export type Organization = typeof organizations.$inferSelect;
export type NewOrganization = typeof organizations.$inferInsert;
