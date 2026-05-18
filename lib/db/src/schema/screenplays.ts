import { pgTable, text, serial, boolean, timestamp } from "drizzle-orm/pg-core";

export const screenplaysTable = pgTable("screenplays", {
  id: serial("id").primaryKey(),
  title: text("title").notNull(),
  sourceText: text("source_text").notNull(),
  specifications: text("specifications").notNull().default(""),
  textModel: text("text_model").notNull(),
  explicit: boolean("explicit").notNull().default(false),
  content: text("content").notNull().default(""),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export type Screenplay = typeof screenplaysTable.$inferSelect;
