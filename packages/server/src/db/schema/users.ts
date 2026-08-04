import { pgTable, uuid, varchar, text, timestamp, boolean, index, jsonb , pgPolicy } from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import { userRoleEnum } from "./enums";
import { organizations } from "./organizations";

export const users = pgTable(
  "users",
  {
    id: uuid("id").primaryKey().default(sql`uuid_generate_v4()`),
    email: varchar("email", { length: 320 }).notNull().unique(),
    passwordHash: text("password_hash"),
    fullName: varchar("full_name", { length: 120 }).notNull(),
    role: userRoleEnum("role").notNull().default("volunteer"),
    photoUrl: text("photo_url"),
    preferences: jsonb("preferences"), // JSONB for notifyRoomCreated etc
    organizationId: uuid("organization_id").references(() => organizations.id, { onDelete: "set null" }),
    googleId: varchar("google_id", { length: 128 }).unique(),
    emailVerifiedAt: timestamp("email_verified_at", { withTimezone: true }),
    isActive: boolean("is_active").notNull().default(true),
    lastLoginAt: timestamp("last_login_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
    deletedAt: timestamp("deleted_at", { withTimezone: true }),
  },
  (t) => [
    index("users_org_idx").on(t.organizationId),
    index("users_role_idx").on(t.role),
    pgPolicy("users_tenant_isolation", {
      as: "permissive",
      for: "select",
      to: "app_user",
      using: sql`${t.organizationId} = NULLIF(current_setting('app.current_tenant', true), '')::uuid OR ${t.organizationId} IS NULL`,
    }),
    pgPolicy("users_insert_new", {
      as: "permissive",
      for: "insert",
      to: "app_user",
      withCheck: sql`${t.organizationId} = NULLIF(current_setting('app.current_tenant', true), '')::uuid OR ${t.organizationId} IS NULL`,
    }),
    pgPolicy("users_update_own", {
      as: "permissive",
      for: "update",
      to: "app_user",
      using: sql`${t.organizationId} = NULLIF(current_setting('app.current_tenant', true), '')::uuid OR ${t.organizationId} IS NULL`,
      withCheck: sql`${t.organizationId} = NULLIF(current_setting('app.current_tenant', true), '')::uuid OR ${t.organizationId} IS NULL`,
    }),
  ],
);

export type User = typeof users.$inferSelect;
export type NewUser = typeof users.$inferInsert;
