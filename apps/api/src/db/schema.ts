import { pgTable, text, timestamp } from "drizzle-orm/pg-core";

export const staff = pgTable("staff", {
  id: text("id").primaryKey(),
  legalName: text("legal_name").notNull(),
  role: text("role").notNull(),
  aliases: text("aliases").array().notNull().default([]),
  clientIds: text("client_ids").array().notNull().default([]),
  region: text("region").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true })
    .defaultNow()
    .notNull(),
});
