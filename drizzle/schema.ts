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

/**
 * System configuration key-value store.
 * Used by Arcane Mechanisms to persist service connection details.
 */
export const systemConfig = mysqlTable("system_config", {
  id: int("id").autoincrement().primaryKey(),
  key: varchar("key", { length: 128 }).notNull().unique(),
  value: text("value").notNull(),
  category: varchar("category", { length: 64 }).notNull(),
  updatedBy: int("updatedBy"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type SystemConfig = typeof systemConfig.$inferSelect;
export type InsertSystemConfig = typeof systemConfig.$inferInsert;

/**
 * Ingestion jobs tracked by Oversee the Scribes.
 * Represents PDF processing pipeline jobs.
 */
export const ingestionJobs = mysqlTable("ingestion_jobs", {
  id: int("id").autoincrement().primaryKey(),
  /** Source PDF filename */
  sourceFile: varchar("sourceFile", { length: 512 }).notNull(),
  /** Game system this material belongs to */
  gameSystem: varchar("gameSystem", { length: 128 }),
  /** Current status of the job */
  status: mysqlEnum("status", ["queued", "converting", "pass1_ocr", "pass2_ocr", "enriching", "review", "completed", "failed"]).default("queued").notNull(),
  /** Total pages in the PDF */
  totalPages: int("totalPages").default(0).notNull(),
  /** Pages processed so far */
  processedPages: int("processedPages").default(0).notNull(),
  /** Pages flagged for HITL review */
  flaggedPages: int("flaggedPages").default(0).notNull(),
  /** Average confidence score (0-100) */
  avgConfidence: int("avgConfidence").default(0),
  /** Error message if failed */
  errorMessage: text("errorMessage"),
  /** When processing started */
  startedAt: timestamp("startedAt"),
  /** When processing completed */
  completedAt: timestamp("completedAt"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type IngestionJob = typeof ingestionJobs.$inferSelect;
export type InsertIngestionJob = typeof ingestionJobs.$inferInsert;

/**
 * Telemetry events for Divination & Omens.
 * Tracks pipeline metrics, model usage, and performance data.
 */
export const telemetryEvents = mysqlTable("telemetry_events", {
  id: int("id").autoincrement().primaryKey(),
  /** Event type category */
  eventType: varchar("eventType", { length: 64 }).notNull(),
  /** Which model or service produced this event */
  source: varchar("source", { length: 128 }).notNull(),
  /** Numeric metric value (e.g., latency in ms, token count, confidence score) */
  metricValue: int("metricValue"),
  /** Optional cost in microdollars (1 USD = 1_000_000) */
  costMicros: int("costMicros").default(0),
  /** Additional metadata as JSON */
  metadata: json("metadata").$type<Record<string, unknown>>(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

export type TelemetryEvent = typeof telemetryEvents.$inferSelect;
export type InsertTelemetryEvent = typeof telemetryEvents.$inferInsert;

/**
 * LLM Provider Registry — stores connection details for AI providers.
 * API keys are encrypted before storage and never exposed to the frontend.
 */
export const PROVIDER_TYPES = [
  "openai_compatible",
  "lm_studio",
  "openrouter",
  "venice_ai",
  "anthropic",
  "google",
  "custom",
] as const;

export type ProviderType = (typeof PROVIDER_TYPES)[number];

export const llmProviders = mysqlTable("llm_providers", {
  id: int("id").autoincrement().primaryKey(),
  /** Human-readable name for this provider instance */
  name: varchar("name", { length: 128 }).notNull().unique(),
  /** Provider type/protocol */
  providerType: varchar("providerType", { length: 64 }).notNull(),
  /** Base URL for the API endpoint */
  baseUrl: varchar("baseUrl", { length: 512 }).notNull(),
  /** Encrypted API key (AES-256-GCM encrypted, stored as hex) */
  encryptedApiKey: text("encryptedApiKey"),
  /** Initialization vector for decryption (hex) */
  keyIv: varchar("keyIv", { length: 64 }),
  /** Auth tag for decryption (hex) */
  keyAuthTag: varchar("keyAuthTag", { length: 64 }),
  /** Whether this provider is currently active/enabled */
  isActive: boolean("isActive").default(true).notNull(),
  /** Optional notes about this provider */
  notes: text("notes"),
  /** Available models on this provider (cached list) */
  availableModels: json("availableModels").$type<string[]>().default([]),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type LlmProvider = typeof llmProviders.$inferSelect;
export type InsertLlmProvider = typeof llmProviders.$inferInsert;

/**
 * Pipeline stages that can be assigned to specific models.
 */
export const PIPELINE_STAGES = [
  "layout_analysis",
  "bbox_detection",
  "ocr_extraction",
  "tabular_data",
  "image_classification",
  "embedding",
  "enrichment",
  "referee",
  "voice_of_arkanum",
  "summarization",
] as const;

export type PipelineStage = (typeof PIPELINE_STAGES)[number];

/**
 * Model Assignment Matrix — maps specific models to pipeline stages.
 * Multiple models can be assigned to the same stage with priority ordering
 * for fallback chains.
 */
export const modelAssignments = mysqlTable("model_assignments", {
  id: int("id").autoincrement().primaryKey(),
  /** Which provider this model belongs to */
  providerId: int("providerId").notNull(),
  /** The model identifier (e.g., "gpt-4o", "llava-v1.6", "gemini-2.5-pro") */
  modelName: varchar("modelName", { length: 256 }).notNull(),
  /** Which pipeline stage this model is assigned to */
  pipelineStage: varchar("pipelineStage", { length: 64 }).notNull(),
  /** Priority within the stage (1 = primary, 2 = first fallback, etc.) */
  priority: int("priority").default(1).notNull(),
  /** Whether this assignment is currently active */
  isActive: boolean("isActive").default(true).notNull(),
  /** Optional config overrides (temperature, max_tokens, etc.) */
  configOverrides: json("configOverrides").$type<Record<string, unknown>>(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type ModelAssignment = typeof modelAssignments.$inferSelect;
export type InsertModelAssignment = typeof modelAssignments.$inferInsert;

/**
 * Database connections — allows switching between cloud Supabase
 * and locally-hosted Docker PostgreSQL instances.
 * Credentials are encrypted before storage.
 */
export const DB_CONNECTION_TYPES = [
  "supabase_cloud",
  "supabase_local",
  "postgres_docker",
  "postgres_remote",
  "mysql",
  "custom",
] as const;

export type DbConnectionType = (typeof DB_CONNECTION_TYPES)[number];

export const dbConnections = mysqlTable("db_connections", {
  id: int("id").autoincrement().primaryKey(),
  /** Human-readable name for this connection */
  name: varchar("name", { length: 128 }).notNull().unique(),
  /** Connection type */
  connectionType: varchar("connectionType", { length: 64 }).notNull(),
  /** Host address */
  host: varchar("host", { length: 256 }).notNull(),
  /** Port number */
  port: int("port").default(5432).notNull(),
  /** Database name */
  databaseName: varchar("databaseName", { length: 128 }).notNull(),
  /** Username (encrypted) */
  encryptedUsername: text("encryptedUsername"),
  /** Password (encrypted) */
  encryptedPassword: text("encryptedPassword"),
  /** IV for username decryption */
  usernameIv: varchar("usernameIv", { length: 64 }),
  /** Auth tag for username */
  usernameAuthTag: varchar("usernameAuthTag", { length: 64 }),
  /** IV for password decryption */
  passwordIv: varchar("passwordIv", { length: 64 }),
  /** Auth tag for password */
  passwordAuthTag: varchar("passwordAuthTag", { length: 64 }),
  /** Whether SSL is required */
  useSsl: boolean("useSsl").default(true).notNull(),
  /** Whether this is the currently active connection */
  isActive: boolean("isActive").default(false).notNull(),
  /** Connection status from last test */
  lastTestStatus: mysqlEnum("lastTestStatus", ["untested", "success", "failed"]).default("untested").notNull(),
  /** Last test timestamp */
  lastTestedAt: timestamp("lastTestedAt"),
  /** Optional notes */
  notes: text("notes"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type DbConnection = typeof dbConnections.$inferSelect;
export type InsertDbConnection = typeof dbConnections.$inferInsert;
