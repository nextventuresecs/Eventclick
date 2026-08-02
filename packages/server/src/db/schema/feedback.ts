import { pgTable, uuid, varchar, text, timestamp, integer, index , pgPolicy } from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import { users } from "./users";
import { organizations } from "./organizations";

export const feedback = pgTable(
  "feedback",
  {
    id: uuid("id").primaryKey().default(sql`uuid_generate_v4()`),
    userId: uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
    organizationId: uuid("organization_id").references(() => organizations.id, { onDelete: "cascade" }),
    category: varchar("category", { length: 100 }).notNull(),
    rating: integer("rating").notNull(),
    subject: varchar("subject", { length: 200 }).notNull(),
    comments: text("comments").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("feedback_user_idx").on(t.userId),
    index("feedback_org_idx").on(t.organizationId),
  ],
);

export type Feedback = typeof feedback.$inferSelect;
export type NewFeedback = typeof feedback.$inferInsert;
