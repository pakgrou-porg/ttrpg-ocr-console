import { boolean, float, index, int, mysqlEnum, mysqlTable, text, timestamp, varchar, json } from "drizzle-orm/mysql-core";

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
 *
 * Phase 1: Non-OCR tasks (document registration, intelligence, PDF→PNG, layout classification, bbox detection)
 * Phase 2: OCR tasks (OCR extraction, quality validation, content break identification, JSON assembly, multi-pass retry)
 * Phase 3: Artifact storage (persisting all outputs, embeddings prep)
 */
export const ingestionJobs = mysqlTable("ingestion_jobs", {
  id: int("id").autoincrement().primaryKey(),
  /** Source PDF filename */
  sourceFile: varchar("sourceFile", { length: 512 }).notNull(),
  /** Game system this material belongs to */
  gameSystem: varchar("gameSystem", { length: 128 }),
  /** Current status of the job */
  status: mysqlEnum("status", [
    "queued",
    "phase1_non_ocr",
    "phase2_ocr",
    "phase3_storage",
    "hitl_required",
    "completed",
    "failed",
  ]).default("queued").notNull(),
  /** Current pipeline phase (1, 2, or 3) */
  currentPhase: int("currentPhase").default(1),
  /** Current stage within the phase */
  currentStage: varchar("currentStage", { length: 64 }),
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
  /**
   * Human-readable display name for this provider instance.
   * e.g. "LMStudio Local — LLaVA Vision" or "OpenRouter — Gemini 2.5 Pro"
   * Used in dropdowns and the Stage Inscriptions picker.
   */
  displayName: varchar("displayName", { length: 256 }).notNull(),
  /**
   * Internal/short name for this provider instance (unique identifier).
   * e.g. "lmstudio-llava-local" or "openrouter-gemini-25-pro"
   */
  name: varchar("name", { length: 128 }).notNull().unique(),
  /** Provider type/protocol */
  providerType: varchar("providerType", { length: 64 }).notNull(),
  /** Base URL for the API endpoint */
  baseUrl: varchar("baseUrl", { length: 512 }).notNull(),
  /**
   * Port number — used for local providers (LM Studio, custom).
   * Injected into the base URL when building the endpoint.
   */
  port: int("port"),
  /**
   * The model identifier to use with this provider instance.
   * e.g. "llava-v1.6-mistral-7b", "google/gemini-2.5-pro", "claude-3-5-sonnet"
   * Stored here so a provider instance represents a specific model, not just a service.
   */
  modelId: varchar("modelId", { length: 256 }),
  /**
   * Maximum context window length in tokens for this provider/model.
   * Used to enforce context budget limits during pipeline processing.
   */
  contextLength: int("contextLength"),
  /**
   * Maximum output tokens for this provider/model.
   * Used as the default max_tokens when no inscription override is set.
   */
  maxTokens: int("maxTokens"),
  /**
   * Default temperature for this provider/model (0.0 – 2.0).
   * Used when a stage inscription does not override the temperature.
   */
  defaultTemperature: float("defaultTemperature").default(0.2),
  /**
   * API path prefix appended after host:port.
   * e.g. "/v1" for OpenAI-compatible endpoints.
   * Stored separately so host, port, and prefix can be assembled without duplication.
   */
  apiPrefix: varchar("apiPrefix", { length: 64 }).default("/v1"),
  /** Whether this provider/model supports chat completions */
  supportsChat: boolean("supportsChat").default(true).notNull(),
  /** Whether this provider/model supports vision (image input) */
  supportsVision: boolean("supportsVision").default(false).notNull(),
  /** Whether this provider/model supports text embeddings */
  supportsEmbedding: boolean("supportsEmbedding").default(false).notNull(),
  /** Whether this provider/model supports extended reasoning / chain-of-thought */
  supportsReasoning: boolean("supportsReasoning").default(false).notNull(),
  /**
   * Whether this is the default provider for new stage inscriptions.
   * Only one provider should have isDefault = true at a time.
   */
  isDefault: boolean("isDefault").default(false).notNull(),
  /** Encrypted API key (AES-256-GCM encrypted, stored as hex) */
  encryptedApiKey: text("encryptedApiKey"),
  /** Initialization vector for decryption (hex) */
  keyIv: varchar("keyIv", { length: 64 }),
  /** Auth tag for decryption (hex) */
  keyAuthTag: varchar("keyAuthTag", { length: 64 }),
  // P1: Store non-sensitive display hints at write time so list views never
  // need to decrypt the key just to show a masked version (e.g. "sk-ab••••••ef").
  /** First 4 chars of the plaintext API key (stored at write time) */
  keyPrefix: varchar("keyPrefix", { length: 8 }),
  /** Last 4 chars of the plaintext API key (stored at write time) */
  keySuffix: varchar("keySuffix", { length: 8 }),
  /** Total length of the plaintext API key (stored at write time) */
  keyLength: int("keyLength"),
  /** Whether this provider is currently active/enabled */
  isActive: boolean("isActive").default(true).notNull(),
  /** Optional notes about this provider */
  notes: text("notes"),
  /** Available models on this provider (cached list from /v1/models discovery) */
  availableModels: json("availableModels").$type<string[]>().default([]),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type LlmProvider = typeof llmProviders.$inferSelect;
export type InsertLlmProvider = typeof llmProviders.$inferInsert;

/**
 * Pipeline stages for the TTRPG OCR pipeline.
 *
 * Phase 1 — Non-OCR Tasks:
 *   document_registration   Stage 1: Establish source document metadata (filename, path, game type, version)
 *   document_intelligence   Stage 2: LLM reads first 20 pages → scanned name, document summary, doc type classification
 *   pdf_to_png              Stage 3: Convert PDF pages to PNGs with progressive optimisation (raw + preprocessed preserved)
 *   layout_classification   Stage 4: Per-page layout assessment using doc metadata as context; HITL hard-stop if type unknown after 10 pages
 *   bbox_detection          Stage 5: Identify bounding boxes for images, tables, maps, illustrations; classify content type per region
 *   child_image_extraction  Stage 5b: Python extracts child PNGs from bbox coordinates (LLM returns coords only)
 *
 * Phase 2 — OCR Tasks:
 *   ocr_extraction          Stage 6: Extract text per page using PDF raw text as rough context for quality comparison
 *   ocr_validation          Stage 6b: Compare OCR output vs extracted text (≥0.999 threshold for auto-accept)
 *   tabular_extraction      Stage 7: For table regions — preserve row/column context in output + extract table as child image
 *   content_break_id        Stage 8: Identify chapter/section/subsection breaks for hierarchical summarisation and cross-page continuity
 *   summarization           Stage 9: LLM generates chapter, section, and subsection summaries
 *   json_assembly           Stage 10: Assemble structured per-page JSON with all extracted content, layout, continuity flags
 *   quality_assessment      Stage 11: LLM holistic quality check (content, layout decisions, continuity); triggers multi-pass retry if needed
 *
 * Phase 3 — Artifact Storage:
 *   artifact_storage        Stage 12: Persist all outputs (per-page JSONs, raw/preprocessed PNGs, child images, cross-page data)
 *
 * Console Experience:
 *   voice_of_arkanum        Console AI assistant (Listen to Ramblings)
 *   referee                 General-purpose reasoning/QA for console operations
 */
export const PIPELINE_STAGES = [
  // Phase 1 — Non-OCR / Ingestion & Layout
  "document_registration",
  "document_intelligence",
  "pdf_to_png",
  "layout_analysis",        // layout detection (VLM)
  "layout_classification",  // region type classification
  "bbox_detection",          // bounding-box + content type
  "content_type_classify",   // mixed-content boundary detection
  "child_image_extraction",  // extract table/illustration child PNGs
  // Phase 2 — OCR Extraction & Validation
  "ocr_extraction",          // primary structured extraction (Pass 1-2)
  "content_break_detect",    // chapter/section/subsection break detection
  "summarisation",           // hierarchical summarisation (LLM)
  "quality_validation",      // quality assessment LLM
  "pass_comparison",         // multi-pass scoring & comparison
  "ocr_validation",          // legacy alias
  "tabular_extraction",      // table row/column extraction
  "content_break_id",        // legacy alias
  "summarization",           // legacy alias
  "json_assembly",           // JSON output assembly
  "quality_assessment",      // legacy alias
  // Phase 3 — Artifact Storage & Embeddings
  "artifact_storage",        // persist all artifacts
  "embedding_generation",    // multimodal embedding generation
  "database_load",           // final DB load step
  // Console experience
  "voice_of_arkanum",
  "referee",
] as const;

export type PipelineStage = (typeof PIPELINE_STAGES)[number];

/**
 * Which phase each pipeline stage belongs to.
 */
export const STAGE_PHASES: Record<PipelineStage, 1 | 2 | 3 | 0> = {
  // Phase 1
  document_registration: 1,
  document_intelligence: 1,
  pdf_to_png: 1,
  layout_analysis: 1,
  layout_classification: 1,
  bbox_detection: 1,
  content_type_classify: 1,
  child_image_extraction: 1,
  // Phase 2
  ocr_extraction: 2,
  content_break_detect: 2,
  summarisation: 2,
  quality_validation: 2,
  pass_comparison: 2,
  ocr_validation: 2,
  tabular_extraction: 2,
  content_break_id: 2,
  summarization: 2,
  json_assembly: 2,
  quality_assessment: 2,
  // Phase 3
  artifact_storage: 3,
  embedding_generation: 3,
  database_load: 3,
  // Console experience
  voice_of_arkanum: 0,
  referee: 0,
};

/**
 * Stage Inscriptions — maps pipeline stages to provider instances.
 *
 * Each stage has exactly one active inscription (upsert on stage).
 * An inscription specifies:
 *   - primaryProvider: the first-choice provider/model for this stage
 *   - fallbackProvider: the cloud escalation provider (used for Pass 3/4)
 *   - systemPrompt: the stage-specific system prompt (hard requirement)
 *   - temperature: override (null = use provider's defaultTemperature)
 *   - maxTokens: override (null = use provider's maxTokens)
 *   - llmSettings: any additional per-stage LLM settings
 *
 * A single provider instance can be inscribed as primary on multiple stages
 * and as fallback on others — the provider is defined once, reused everywhere.
 */
export const stageInscriptions = mysqlTable("stage_inscriptions", {
  id: int("id").autoincrement().primaryKey(),
  /**
   * The pipeline stage this inscription applies to.
   * Unique — only one active inscription per stage.
   */
  stage: varchar("stage", { length: 64 }).notNull().unique(),
  /**
   * Primary provider instance for this stage.
   * FK to llm_providers. This is the first-choice model used in Pass 1 & 2.
   */
  primaryProviderId: int("primaryProviderId"),
  /**
   * Fallback (cloud escalation) provider for this stage.
   * FK to llm_providers. Used when Pass 1 & 2 fail quality threshold (Pass 3 & 4).
   * Null means no cloud fallback is configured — stage will go directly to HITL.
   */
  fallbackProviderId: int("fallbackProviderId"),
  /**
   * Reference to system_prompts.name for this stage.
   * The actual prompt text lives in the system_prompts table (Incantations & Runes).
   * Null means no prompt is assigned — the provider default will be used.
   */
  promptName: varchar("promptName", { length: 128 }),
  /**
   * Temperature override for this stage (0.0 – 2.0).
   * Null = use the primary provider's defaultTemperature.
   * Lower = more deterministic (OCR/extraction), higher = more creative (summarisation).
   */
  temperature: float("temperature"),
  /**
   * Max tokens override for this stage.
   * Null = use the primary provider's maxTokens.
   */
  maxTokens: int("maxTokens"),
  /**
   * Additional LLM settings as JSON (top_p, frequency_penalty, response_format, etc.)
   * Merged at call time; temperature and maxTokens fields take precedence over JSON values.
   */
  llmSettings: json("llmSettings").$type<Record<string, unknown>>(),
  /** Whether this inscription is currently active */
  isActive: boolean("isActive").default(true).notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
}, (t) => ({
  stageIdx: index("stage_inscriptions_stage_idx").on(t.stage),
  primaryProviderIdx: index("stage_inscriptions_primary_idx").on(t.primaryProviderId),
  fallbackProviderIdx: index("stage_inscriptions_fallback_idx").on(t.fallbackProviderId),
}));

export type StageInscription = typeof stageInscriptions.$inferSelect;
export type InsertStageInscription = typeof stageInscriptions.$inferInsert;

// Keep ModelAssignment as a deprecated alias for backward compatibility during migration
// TODO: Remove after all references are updated
export const modelAssignments = stageInscriptions;
export type ModelAssignment = StageInscription;
export type InsertModelAssignment = InsertStageInscription;

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

/**
 * ─── Library Shelves: Documents, Pages, OCR Results, HITL Queue ──────────────
 *
 * These tables support the Library Shelves browser (Enter the Arkanum view-only)
 * and the Archivist's Desk (HITL review with editing).
 */

/**
 * Document type classification — determined during Stage 2 (document intelligence)
 * and confirmed/refined during Stage 4 (layout classification).
 */
export const DOCUMENT_TYPES = ["book", "guide", "periodical", "magazine", "supplement", "adventure", "unknown"] as const;
export type DocumentType = (typeof DOCUMENT_TYPES)[number];

/**
 * Source documents (PDFs) ingested into the pipeline.
 * Each document represents a single TTRPG PDF file.
 */
export const DOCUMENT_STATUSES = [
  "pending",
  "phase1_non_ocr",
  "phase2_ocr",
  "phase3_storage",
  "hitl_required",
  "completed",
  "failed",
] as const;

export type DocumentStatus = (typeof DOCUMENT_STATUSES)[number];

export const documents = mysqlTable("documents", {
  id: int("id").autoincrement().primaryKey(),
  /** Original filename of the PDF */
  filename: varchar("filename", { length: 512 }).notNull(),
  /** Game system (e.g., "Dungeons & Dragons", "Pathfinder", "Advanced Dungeons & Dragons") */
  gameSystem: varchar("gameSystem", { length: 128 }),
  /** Edition/version (e.g., "1e", "2e", "5e", "5.5e") */
  edition: varchar("edition", { length: 64 }),
  /** Book title as it appears on the cover (operator-supplied at registration) */
  title: varchar("title", { length: 512 }),
  /**
   * Scanned/internal document name as identified by the LLM from the document content.
   * May differ from the filename or operator-supplied title.
   * Populated during Stage 2 (document intelligence).
   */
  scannedName: varchar("scannedName", { length: 512 }),
  /**
   * High-level summary of the document purpose, LLM-generated during Stage 2.
   * Used as metadata for all chunks in the vector store.
   */
  documentSummary: text("documentSummary"),
  /**
   * Document type classification (book/guide vs periodical/magazine).
   * Initially set during Stage 2 (document intelligence), confirmed during Stage 4.
   * Drives layout parsing strategy in Stage 5.
   */
  documentType: varchar("documentType", { length: 64 }),
  /** Publisher name */
  publisher: varchar("publisher", { length: 256 }),
  /** Total number of pages in the PDF */
  totalPages: int("totalPages").default(0).notNull(),
  /** Number of pages that have been OCR-processed */
  processedPages: int("processedPages").default(0).notNull(),
  /** Number of pages flagged for HITL review */
  flaggedPages: int("flaggedPages").default(0).notNull(),
  /** Average OCR confidence across all pages (0-100) */
  avgConfidence: int("avgConfidence").default(0),
  /** Current processing status */
  status: mysqlEnum("status", [
    "pending",
    "phase1_non_ocr",
    "phase2_ocr",
    "phase3_storage",
    "hitl_required",
    "completed",
    "failed",
  ]).default("pending").notNull(),
  /** Optional S3 URL for the original PDF */
  pdfUrl: varchar("pdfUrl", { length: 1024 }),
  /** Optional cover image thumbnail URL */
  coverThumbnailUrl: varchar("coverThumbnailUrl", { length: 1024 }),
  /** Linked ingestion job ID (if any) */
  ingestionJobId: int("ingestionJobId"),
  /** Additional metadata (ISBN, year, etc.) */
  metadata: json("metadata").$type<Record<string, unknown>>(),
  /** User ID of the document owner (who uploaded it) */
  ownerUserId: int("ownerUserId"),
  /** User ID of the user who created/uploaded this record */
  createdByUserId: int("createdByUserId"),
  /** Visibility scope: private (owner only), shared (all users), global (public) */
  visibility: mysqlEnum("visibility", ["private", "shared", "global"]).default("private").notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type Document = typeof documents.$inferSelect;
export type InsertDocument = typeof documents.$inferInsert;

/**
 * Layout types identified during Stage 4 (layout classification) and Stage 5 (bbox detection).
 */
export const LAYOUT_TYPES = [
  "single_column",
  "two_column",
  "three_column",
  "mixed",       // e.g. 2-col top + 1-col below a horizontal rule
  "full_page_image",
  "table_dominant",
  "periodical_mixed", // editorial + advertising regions on same page
  "unknown",
] as const;
export type LayoutType = (typeof LAYOUT_TYPES)[number];

/**
 * Content region types identified within bounding boxes.
 */
export const CONTENT_REGION_TYPES = [
  "text",
  "table",
  "illustration",
  "map",
  "graphic",
  "advertisement",
  "header",
  "footer",
  "page_number",
  "sidebar",
  "callout",
  "unknown",
] as const;
export type ContentRegionType = (typeof CONTENT_REGION_TYPES)[number];

/**
 * Individual pages within a document.
 * Each page has raw and preprocessed PNG images, layout metadata, and structured content.
 */
export const documentPages = mysqlTable("document_pages", {
  id: int("id").autoincrement().primaryKey(),
  /** Parent document ID */
  documentId: int("documentId").notNull(),
  /** Page number within the document (1-indexed) */
  pageNumber: int("pageNumber").notNull(),
  /**
   * URL to the raw original PNG (unmodified, full-resolution).
   * Preserved permanently alongside the preprocessed version.
   */
  rawPngUrl: varchar("rawPngUrl", { length: 1024 }),
  /**
   * URL to the preprocessed PNG (optimised for LLM input — may be grayscale,
   * quality-reduced, etc.). Preserved permanently for audit and reprocessing.
   */
  preprocessedPngUrl: varchar("preprocessedPngUrl", { length: 1024 }),
  /** URL to the thumbnail image (S3) — for UI display */
  thumbnailUrl: varchar("thumbnailUrl", { length: 1024 }),
  /** Perceptual hash for duplicate detection */
  phash: varchar("phash", { length: 64 }),
  /** Whether a preprocessed (optimised) version was generated */
  wasPreprocessed: boolean("wasPreprocessed").default(false).notNull(),
  /** Which optimisation was applied (e.g., "grayscale", "quality_80", "quality_60") */
  preprocessingApplied: varchar("preprocessingApplied", { length: 128 }),
  /** Image width in pixels (of the preprocessed version used for analysis) */
  imageWidth: int("imageWidth"),
  /** Image height in pixels */
  imageHeight: int("imageHeight"),
  /**
   * Layout type identified during Stage 4/5.
   * Drives column parsing and region extraction strategy.
   */
  layoutType: varchar("layoutType", { length: 64 }),
  /**
   * Bounding box regions identified on this page (Stage 5).
   * Array of { regionType, bbox: {x,y,w,h}, childImageUrl, contentTypeFlags }
   */
  contentRegions: json("contentRegions").$type<Array<{
    sequence: number;
    regionType: string;
    bbox: { x: number; y: number; w: number; h: number };
    childImageUrl?: string;
    contentTypeFlags?: string[];
    isMixedBoundary?: boolean;
  }>>(),
  /**
   * Cross-page continuity flags (Stage 8).
   * Tracks whether content continues from/to adjacent pages.
   */
  continuityFlags: json("continuityFlags").$type<{
    continuesFromPreviousPage: boolean;
    continuesToNextPage: boolean;
    midSentenceBreakAtEnd: boolean;
    sectionContinuesFromPreviousPage: boolean;
  }>(),
  /**
   * Assembled per-page structured JSON output (Stage 10).
   * Full output including source doc refs, section info, content regions, continuity.
   */
  pageJsonOutput: json("pageJsonOutput").$type<Record<string, unknown>>(),
  /** Current pipeline phase/stage status for this page */
  phaseStatus: varchar("phaseStatus", { length: 64 }),
  /** Whether this page is flagged for HITL review */
  isFlagged: boolean("isFlagged").default(false).notNull(),
  /** Whether OCR has been completed for this page */
  ocrCompleted: boolean("ocrCompleted").default(false).notNull(),
  /** OCR confidence for this specific page (0-100) */
  ocrConfidence: int("ocrConfidence"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
}, (t) => ({
  // P1: Index for fetching all pages of a document (most common query pattern)
  documentIdIdx: index("document_pages_documentId_idx").on(t.documentId),
  // P1: Index for phash-based duplicate detection
  phashIdx: index("document_pages_phash_idx").on(t.phash),
  // P1: Composite index for the common "get page N of document X" lookup
  documentPageIdx: index("document_pages_doc_page_idx").on(t.documentId, t.pageNumber),
}));

export type DocumentPage = typeof documentPages.$inferSelect;
export type InsertDocumentPage = typeof documentPages.$inferInsert;

/**
 * OCR extraction results for each page.
 * Stores both raw text and structured JSON data from the multi-pass OCR pipeline.
 *
 * Multi-pass retry escalation:
 *   Pass 1: Primary assigned model (local/cloud)
 *   Pass 2: Same model, independent re-run — contrasted with Pass 1
 *   Pass 3: Designated cloud fallback model — independent attempt
 *   Pass 4: Same cloud model retry — if Pass 3 still unacceptable
 *   HITL:   If Pass 4 fails — all attempt results surfaced in Archivist's Desk
 */
export const OCR_RESULT_STATUSES = [
  "pending",
  "pass1_complete",
  "pass2_complete",
  "pass3_complete",
  "pass4_complete",
  "validated",
  "corrected",
  "hitl_required",
  "failed",
] as const;

export type OcrResultStatus = (typeof OCR_RESULT_STATUSES)[number];

export const ocrResults = mysqlTable("ocr_results", {
  id: int("id").autoincrement().primaryKey(),
  /** Parent page ID — indexed for fast lookups by page */
  pageId: int("pageId").notNull(),
  /** Raw extracted text (full-page) */
  rawText: text("rawText"),
  /** Structured data extracted by the pipeline (JSON) */
  structuredData: json("structuredData").$type<Record<string, unknown>>(),
  /** Layout metadata from Stage 5 (bounding boxes, element types) */
  layoutMetadata: json("layoutMetadata").$type<Record<string, unknown>>(),
  /** Overall confidence score for this extraction (0-100) */
  confidence: int("confidence").default(0),
  /** Processing status */
  status: mysqlEnum("status", [
    "pending",
    "pass1_complete",
    "pass2_complete",
    "pass3_complete",
    "pass4_complete",
    "validated",
    "corrected",
    "hitl_required",
    "failed",
  ]).default("pending").notNull(),
  /** Which model produced the Pass 1 result */
  pass1Model: varchar("pass1Model", { length: 256 }),
  /** Which model produced the Pass 2 result (same model, independent run) */
  pass2Model: varchar("pass2Model", { length: 256 }),
  /**
   * Which cloud model was used for Pass 3 (designated cloud fallback).
   * Null if quality was accepted before reaching Pass 3.
   */
  pass3Model: varchar("pass3Model", { length: 256 }),
  /**
   * Which cloud model was used for Pass 4 (same cloud model retry).
   * Null if quality was accepted before reaching Pass 4.
   */
  pass4Model: varchar("pass4Model", { length: 256 }),
  /** Quality assessment score from the LLM quality check (0-100) */
  qualityScore: int("qualityScore"),
  /** Notes from the quality assessment LLM comparing passes */
  qualityNotes: text("qualityNotes"),
  /** Audit log of processing steps (JSON array) */
  auditLog: json("auditLog").$type<{ timestamp: string; action: string; model?: string; detail?: string }[]>().default([]),
  /** Human-corrected text (if HITL review was performed) */
  correctedText: text("correctedText"),
  /** Human-corrected structured data (if HITL review was performed) */
  correctedStructuredData: json("correctedStructuredData").$type<Record<string, unknown>>(),
  /** ID of the user who performed the correction */
  correctedBy: int("correctedBy"),
  /** When the correction was made */
  correctedAt: timestamp("correctedAt"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
}, (t) => ({
  // P1: Index for fetching OCR result by page (most common query)
  pageIdIdx: index("ocr_results_pageId_idx").on(t.pageId),
  // P1: Index for filtering by status (e.g., find all failed results)
  statusIdx: index("ocr_results_status_idx").on(t.status),
}));

export type OcrResult = typeof ocrResults.$inferSelect;
export type InsertOcrResult = typeof ocrResults.$inferInsert;

/**
 * Page processing attempts — tracks each individual pass (1-4) per page.
 * All attempt outputs are preserved so HITL operators can compare them.
 */
export const pageProcessingAttempts = mysqlTable("page_processing_attempts", {
  id: int("id").autoincrement().primaryKey(),
  /** Parent page ID */
  pageId: int("pageId").notNull(),
  /** Parent OCR result ID */
  ocrResultId: int("ocrResultId").notNull(),
  /** Pass number (1-4) */
  passNumber: int("passNumber").notNull(),
  /** Model used for this pass */
  modelUsed: varchar("modelUsed", { length: 256 }).notNull(),
  /** Provider used for this pass */
  providerName: varchar("providerName", { length: 128 }),
  /** Whether this was a cloud model pass (Pass 3/4) */
  isCloudPass: boolean("isCloudPass").default(false).notNull(),
  /** Raw text output from this pass */
  rawTextOutput: text("rawTextOutput"),
  /** Structured JSON output from this pass */
  structuredOutput: json("structuredOutput").$type<Record<string, unknown>>(),
  /** Quality score assigned to this pass (0-100) */
  score: int("score"),
  /** Comparison notes vs previous pass */
  comparisonNotes: text("comparisonNotes"),
  /** Whether this pass was accepted as the final result */
  wasAccepted: boolean("wasAccepted").default(false).notNull(),
  /** Processing time in milliseconds */
  processingTimeMs: int("processingTimeMs"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
}, (t) => ({
  pageIdIdx: index("page_attempts_pageId_idx").on(t.pageId),
  ocrResultIdIdx: index("page_attempts_ocrResultId_idx").on(t.ocrResultId),
}));

export type PageProcessingAttempt = typeof pageProcessingAttempts.$inferSelect;
export type InsertPageProcessingAttempt = typeof pageProcessingAttempts.$inferInsert;

/**
 * HITL (Human-in-the-Loop) review queue.
 * Pages flagged for human review are tracked here with priority and resolution status.
 * Includes all processing attempt results for HITL operators to compare.
 */
export const HITL_PRIORITIES = ["low", "medium", "high", "critical"] as const;
export type HitlPriority = (typeof HITL_PRIORITIES)[number];

export const HITL_STATUSES = ["queued", "in_progress", "resolved", "skipped", "escalated"] as const;
export type HitlStatus = (typeof HITL_STATUSES)[number];

/**
 * Categories of HITL flags — helps operators filter and prioritise the queue.
 */
export const HITL_FLAG_CATEGORIES = [
  "doc_type_unknown",       // Document type could not be determined within 10 pages (hard stop)
  "ocr_quality_failed",     // All 4 passes failed quality threshold
  "layout_ambiguous",       // Layout classification uncertain
  "content_type_conflict",  // Content type classification conflict
  "continuity_error",       // Cross-page continuity detection failed
  "manual_flag",            // Manually flagged by operator
] as const;
export type HitlFlagCategory = (typeof HITL_FLAG_CATEGORIES)[number];

export const hitlQueue = mysqlTable("hitl_queue", {
  id: int("id").autoincrement().primaryKey(),
  /** The page that needs review — indexed for fast lookups */
  pageId: int("pageId").notNull(),
  /** The OCR result that needs review */
  ocrResultId: int("ocrResultId"),
  /** Why this page was flagged */
  reason: text("reason").notNull(),
  /** Flag category for filtering */
  flagCategory: varchar("flagCategory", { length: 64 }),
  /** Review priority */
  priority: mysqlEnum("priority", ["low", "medium", "high", "critical"]).default("medium").notNull(),
  /** Current review status */
  status: mysqlEnum("status", ["queued", "in_progress", "resolved", "skipped", "escalated"]).default("queued").notNull(),
  /** User assigned to review this item */
  assignedTo: int("assignedTo"),
  /** Resolution notes from the reviewer */
  resolutionNotes: text("resolutionNotes"),
  /** User who resolved this item */
  resolvedBy: int("resolvedBy"),
  /** When the item was resolved */
  resolvedAt: timestamp("resolvedAt"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
}, (t) => ({
  // P1: Index for fetching HITL items by page
  pageIdIdx: index("hitl_queue_pageId_idx").on(t.pageId),
  // P1: Composite index for the "Next Unreviewed" query (status + priority + createdAt)
  statusPriorityIdx: index("hitl_queue_status_priority_idx").on(t.status, t.priority, t.createdAt),
  // P1: Index for filtering by assignee
  assignedToIdx: index("hitl_queue_assignedTo_idx").on(t.assignedTo),
}));

export type HitlQueueItem = typeof hitlQueue.$inferSelect;
export type InsertHitlQueueItem = typeof hitlQueue.$inferInsert;
