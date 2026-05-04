import {
  pgTable,
  uuid,
  integer,
  timestamp,
  jsonb,
  index,
  uniqueIndex,
} from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import type { FormField } from "@application/shared";
import { eventRooms } from "./eventRooms";

export const formDefinitions = pgTable(
  "form_definitions",
  {
    id: uuid("id").primaryKey().default(sql`uuid_generate_v4()`),
    roomId: uuid("room_id")
      .notNull()
      .references(() => eventRooms.id, { onDelete: "cascade" }),
    version: integer("version").notNull().default(1),
    fields: jsonb("fields").$type<FormField[]>().notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("form_definitions_room_idx").on(t.roomId),
    uniqueIndex("form_definitions_room_version_unique").on(t.roomId, t.version),
  ],
);

export type FormDefinitionRow = typeof formDefinitions.$inferSelect;
export type NewFormDefinition = typeof formDefinitions.$inferInsert;
