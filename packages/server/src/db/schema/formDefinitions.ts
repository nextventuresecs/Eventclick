import {
  pgTable,
  uuid,
  integer,
  timestamp,
  jsonb,
  index,
  uniqueIndex,
  pgPolicy } from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import type { FormField } from "@application/shared";
import { eventRooms } from "./eventRooms";
import { organizations } from "./organizations";

export const formDefinitions = pgTable(
  "form_definitions",
  {
    id: uuid("id").primaryKey().default(sql`uuid_generate_v4()`),
    roomId: uuid("room_id")
      .notNull()
      .references(() => eventRooms.id, { onDelete: "cascade" }),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    version: integer("version").notNull().default(1),
    fields: jsonb("fields").$type<FormField[]>().notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
    deletedAt: timestamp("deleted_at", { withTimezone: true }),
  },
  (t) => [
    index("form_definitions_room_idx").on(t.roomId),
    index("form_definitions_org_idx").on(t.organizationId),
    uniqueIndex("form_definitions_room_version_unique").on(t.roomId, t.version),
    pgPolicy("form_definitions_tenant_isolation", {
      as: "permissive",
      for: "all",
      to: "app_user",
      using: sql`${t.organizationId} = NULLIF(current_setting('app.current_tenant', true), '')::uuid`,
      withCheck: sql`${t.organizationId} = NULLIF(current_setting('app.current_tenant', true), '')::uuid`,
    }),
  ],
);

export type FormDefinitionRow = typeof formDefinitions.$inferSelect;
export type NewFormDefinition = typeof formDefinitions.$inferInsert;
