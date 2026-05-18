import { pgTable, text, serial, integer, boolean, timestamp, jsonb } from "drizzle-orm/pg-core";

export const novelsTable = pgTable("novels", {
  id: serial("id").primaryKey(),
  title: text("title").notNull(),
  sourceText: text("source_text").notNull(),
  specifications: text("specifications").notNull().default(""),
  artStyle: text("art_style"),
  panelCount: integer("panel_count").notNull(),
  textModel: text("text_model").notNull(),
  explicit: boolean("explicit").notNull().default(false),
  referenceImages: jsonb("reference_images").$type<Array<{ label: string; dataUrl: string }>>().notNull().default([]),
  status: text("status").notNull().default("pending"),
  error: text("error"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const panelsTable = pgTable("panels", {
  id: serial("id").primaryKey(),
  novelId: integer("novel_id").notNull().references(() => novelsTable.id, { onDelete: "cascade" }),
  idx: integer("idx").notNull(),
  caption: text("caption"),
  imagePrompt: text("image_prompt"),
  imageDataUrl: text("image_data_url"),
  status: text("status").notNull().default("pending"),
  error: text("error"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export type Novel = typeof novelsTable.$inferSelect;
export type Panel = typeof panelsTable.$inferSelect;
