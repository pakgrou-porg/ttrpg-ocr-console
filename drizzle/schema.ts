import { int, mysqlEnum, mysqlTable, text, timestamp, varchar, json } from "drizzle-orm/mysql-core";

export const users = mysqlTable("users", {
  id: int("id").autoincrement().primaryKey(),
  openId: varchar("openId", { length: 64 }).notNull().unique(),
  name: text("name"),
  email: varchar("email", { length: 320 }),
  loginMethod: varchar("loginMethod", { length: 64 }),
  role: mysqlEnum("role", ["user", "admin"]).default("user").notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
  lastSignedIn: timestamp("lastSignedIn").defaultNow().notNull(),
});

export type User = typeof users.$inferSelect;
export type InsertUser = typeof users.$inferInsert;

/**
 * Extended user profile with TTRPG-specific personalization fields.
 * One-to-one with users table via userId.
 */
export const userProfiles = mysqlTable("user_profiles", {
  id: int("id").autoincrement().primaryKey(),
  userId: int("userId").notNull().unique(),
  displayName: varchar("displayName", { length: 128 }),
  preferredGame: varchar("preferredGame", { length: 128 }),
  preferredVersion: varchar("preferredVersion", { length: 64 }),
  savedEntries: json("savedEntries").$type<string[]>().default([]),
  savedGroups: json("savedGroups").$type<{ id: string; name: string; entries: string[] }[]>().default([]),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type UserProfile = typeof userProfiles.$inferSelect;
export type InsertUserProfile = typeof userProfiles.$inferInsert;

/**
 * System prompts table for all AI operations — both pipeline (OCR) and console experience.
 * Prompts are fetched at runtime by both the Python ingestion scripts and the frontend.
 */
export const systemPrompts = mysqlTable("system_prompts", {
  id: int("id").autoincrement().primaryKey(),
  name: varchar("name", { length: 128 }).notNull().unique(),
  category: mysqlEnum("category", ["pipeline", "console_experience"]).notNull(),
  description: text("description"),
  promptText: text("promptText").notNull(),
  version: int("version").default(1).notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type SystemPrompt = typeof systemPrompts.$inferSelect;
export type InsertSystemPrompt = typeof systemPrompts.$inferInsert;
