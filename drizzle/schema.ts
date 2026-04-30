import { boolean, int, mysqlEnum, mysqlTable, text, timestamp, varchar, json } from "drizzle-orm/mysql-core";

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
  avatarUrl: varchar("avatarUrl", { length: 512 }),
  savedEntries: json("savedEntries").$type<string[]>().default([]),
  savedGroups: json("savedGroups").$type<{ id: string; name: string; entries: string[] }[]>().default([]),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type UserProfile = typeof userProfiles.$inferSelect;
export type InsertUserProfile = typeof userProfiles.$inferInsert;

/**
 * Feature areas that can be individually granted or restricted per user.
 * Admins can restrict specific users to certain game systems/versions.
 */
export const FEATURE_AREAS = [
  "enter_arkanum",
  "listen_ramblings",
  "tome_knowledge",
  "oversee_scribes",
  "divination_omens",
  "arcane_mechanisms",
  "summoning_rituals",
  "incantations_runes",
] as const;

export type FeatureArea = (typeof FEATURE_AREAS)[number];

export const userPermissions = mysqlTable("user_permissions", {
  id: int("id").autoincrement().primaryKey(),
  userId: int("userId").notNull(),
  /** Which feature area this permission record applies to */
  featureArea: varchar("featureArea", { length: 64 }).notNull(),
  /** Whether access is granted (true) or explicitly denied (false) */
  granted: boolean("granted").default(true).notNull(),
  /** Optional: restrict to a specific game system (e.g. "Dungeons & Dragons") */
  restrictedGame: varchar("restrictedGame", { length: 128 }),
  /** Optional: restrict to a specific version within that game (e.g. "5e") */
  restrictedVersion: varchar("restrictedVersion", { length: 64 }),
  /** Admin who granted/restricted this permission */
  grantedBy: int("grantedBy"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type UserPermission = typeof userPermissions.$inferSelect;
export type InsertUserPermission = typeof userPermissions.$inferInsert;

/**
 * Invited users — admin creates an invitation record; user activates on first login.
 */
export const userInvitations = mysqlTable("user_invitations", {
  id: int("id").autoincrement().primaryKey(),
  /** Email address the invitation was sent to */
  email: varchar("email", { length: 320 }).notNull(),
  /** Display name pre-assigned by admin */
  displayName: varchar("displayName", { length: 128 }),
  /** Role to assign on activation */
  role: mysqlEnum("role", ["user", "admin"]).default("user").notNull(),
  /** Token used to match the invitation on first OAuth login */
  token: varchar("token", { length: 128 }).notNull().unique(),
  /** Whether the invitation has been accepted */
  accepted: boolean("accepted").default(false).notNull(),
  /** The user ID after acceptance */
  acceptedByUserId: int("acceptedByUserId"),
  /** Admin who created the invitation */
  createdBy: int("createdBy").notNull(),
  /** Expiry timestamp */
  expiresAt: timestamp("expiresAt").notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type UserInvitation = typeof userInvitations.$inferSelect;
export type InsertUserInvitation = typeof userInvitations.$inferInsert;

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
