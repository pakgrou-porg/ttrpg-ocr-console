import {
  boolean, integer, real, serial, varchar, text, timestamp, jsonb,
  pgTable, unique, index,
} from "drizzle-orm/pg-core";

// ─── Users ────────────────────────────────────────────────────────────────────

export const users = pgTable("users", {
  id: serial("id").primaryKey(),
  openId: varchar("open_id", { length: 64 }).notNull().unique(),
  name: text("name"),
  email: varchar("email", { length: 320 }),
  loginMethod: varchar("login_method", { length: 64 }),
  role: varchar("role", { length: 16 }).default("user").notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
  lastSignedIn: timestamp("last_signed_in").defaultNow().notNull(),
});

export type User = typeof users.$inferSelect;
export type InsertUser = typeof users.$inferInsert;

export const userProfiles = pgTable("user_profiles", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").notNull().unique(),
  displayName: varchar("display_name", { length: 128 }),
  preferredGame: varchar("preferred_game", { length: 128 }),
  preferredVersion: varchar("preferred_version", { length: 64 }),
  avatarUrl: varchar("avatar_url", { length: 512 }),
  savedEntries: jsonb("saved_entries").$type<string[]>().default([]),
  savedGroups: jsonb("saved_groups").$type<{ id: string; name: string; entries: string[] }[]>().default([]),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export type UserProfile = typeof userProfiles.$inferSelect;
export type InsertUserProfile = typeof userProfiles.$inferInsert;

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

export const userPermissions = pgTable("user_permissions", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").notNull(),
  featureArea: varchar("feature_area", { length: 64 }).notNull(),
  granted: boolean("granted").default(true).notNull(),
  restrictedGame: varchar("restricted_game", { length: 128 }),
  restrictedVersion: varchar("restricted_version", { length: 64 }),
  grantedBy: integer("granted_by"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export type UserPermission = typeof userPermissions.$inferSelect;
export type InsertUserPermission = typeof userPermissions.$inferInsert;

export const userInvitations = pgTable("user_invitations", {
  id: serial("id").primaryKey(),
  email: varchar("email", { length: 320 }).notNull(),
  displayName: varchar("display_name", { length: 128 }),
  role: varchar("role", { length: 16 }).default("user").notNull(),
  token: varchar("token", { length: 128 }).notNull().unique(),
  accepted: boolean("accepted").default(false).notNull(),
  acceptedByUserId: integer("accepted_by_user_id"),
  createdBy: integer("created_by").notNull(),
  expiresAt: timestamp("expires_at").notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export type UserInvitation = typeof userInvitations.$inferSelect;
export type InsertUserInvitation = typeof userInvitations.$inferInsert;

// ─── System Prompts ───────────────────────────────────────────────────────────

export const systemPrompts = pgTable("system_prompts", {
  id: serial("id").primaryKey(),
  name: varchar("name", { length: 128 }).notNull().unique(),
  category: varchar("category", { length: 32 }).notNull(),
  description: text("description"),
  promptText: text("prompt_text").notNull(),
  version: integer("version").default(1).notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export type SystemPrompt = typeof systemPrompts.$inferSelect;
export type InsertSystemPrompt = typeof systemPrompts.$inferInsert;

export const promptVersions = pgTable("prompt_versions", {
  id: serial("id").primaryKey(),
  promptName: varchar("prompt_name", { length: 128 }).notNull(),
  promptText: text("prompt_text").notNull(),
  version: integer("version").notNull(),
  savedBy: integer("saved_by"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
}, (t) => ({
  nameVersionIdx: unique("prompt_versions_name_version_idx").on(t.promptName, t.version),
}));

export type PromptVersion = typeof promptVersions.$inferSelect;
export type InsertPromptVersion = typeof promptVersions.$inferInsert;

// ─── System Config ────────────────────────────────────────────────────────────

export const systemConfig = pgTable("system_config", {
  id: serial("id").primaryKey(),
  key: varchar("key", { length: 128 }).notNull().unique(),
  value: text("value").notNull(),
  category: varchar("category", { length: 64 }).notNull(),
  updatedBy: integer("updated_by"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export type SystemConfig = typeof systemConfig.$inferSelect;
export type InsertSystemConfig = typeof systemConfig.$inferInsert;

// ─── Ingestion Jobs ───────────────────────────────────────────────────────────

export const ingestionJobs = pgTable("ingestion_jobs", {
  id: serial("id").primaryKey(),
  sourceFile: varchar("source_file", { length: 512 }).notNull(),
  storageProvider: varchar("storage_provider", { length: 32 }).default("local").notNull(),
  driveFileId: varchar("drive_file_id", { length: 512 }),
  gameSystem: varchar("game_system", { length: 128 }),
  pageOffset: integer("page_offset").default(0).notNull(),
  blockSize: integer("block_size").default(10).notNull(),
  status: varchar("status", { length: 32 }).default("queued").notNull(),
  currentPhase: integer("current_phase").default(1),
  currentStage: varchar("current_stage", { length: 64 }),
  totalPages: integer("total_pages").default(0).notNull(),
  processedPages: integer("processed_pages").default(0).notNull(),
  flaggedPages: integer("flagged_pages").default(0).notNull(),
  avgConfidence: integer("avg_confidence").default(0),
  errorMessage: text("error_message"),
  startedAt: timestamp("started_at"),
  completedAt: timestamp("completed_at"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export type IngestionJob = typeof ingestionJobs.$inferSelect;
export type InsertIngestionJob = typeof ingestionJobs.$inferInsert;

// ─── Telemetry ────────────────────────────────────────────────────────────────

export const telemetryEvents = pgTable("telemetry_events", {
  id: serial("id").primaryKey(),
  eventType: varchar("event_type", { length: 64 }).notNull(),
  source: varchar("source", { length: 128 }).notNull(),
  metricValue: integer("metric_value"),
  costMicros: integer("cost_micros").default(0),
  metadata: jsonb("metadata").$type<Record<string, unknown>>(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export type TelemetryEvent = typeof telemetryEvents.$inferSelect;
export type InsertTelemetryEvent = typeof telemetryEvents.$inferInsert;

// ─── LLM Providers ───────────────────────────────────────────────────────────

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

export const llmProviders = pgTable("llm_providers", {
  id: serial("id").primaryKey(),
  displayName: varchar("display_name", { length: 256 }).notNull(),
  name: varchar("name", { length: 128 }).notNull().unique(),
  providerType: varchar("provider_type", { length: 64 }).notNull(),
  baseUrl: varchar("base_url", { length: 512 }).notNull(),
  port: integer("port"),
  modelId: varchar("model_id", { length: 256 }),
  contextLength: integer("context_length"),
  maxTokens: integer("max_tokens"),
  defaultTemperature: real("default_temperature").default(0.2),
  apiPrefix: varchar("api_prefix", { length: 64 }).default("/v1"),
  supportsChat: boolean("supports_chat").default(true).notNull(),
  supportsVision: boolean("supports_vision").default(false).notNull(),
  supportsEmbedding: boolean("supports_embedding").default(false).notNull(),
  supportsReasoning: boolean("supports_reasoning").default(false).notNull(),
  isDefault: boolean("is_default").default(false).notNull(),
  encryptedApiKey: text("encrypted_api_key"),
  keyIv: varchar("key_iv", { length: 64 }),
  keyAuthTag: varchar("key_auth_tag", { length: 64 }),
  keyPrefix: varchar("key_prefix", { length: 8 }),
  keySuffix: varchar("key_suffix", { length: 8 }),
  keyLength: integer("key_length"),
  isActive: boolean("is_active").default(true).notNull(),
  notes: text("notes"),
  availableModels: jsonb("available_models").$type<string[]>().default([]),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export type LlmProvider = typeof llmProviders.$inferSelect;
export type InsertLlmProvider = typeof llmProviders.$inferInsert;

// ─── Pipeline Stages ─────────────────────────────────────────────────────────

export const PIPELINE_STAGES = [
  "document_registration",
  "document_intelligence",
  "pdf_to_png",
  "pdf_text_extract",
  "layout_analysis",
  "layout_classification",
  "bbox_detection",
  "content_type_classify",
  "child_image_extraction",
  "ocr_extraction",
  "content_break_detect",
  "summarisation",
  "quality_validation",
  "pass_comparison",
  "ocr_validation",
  "tabular_extraction",
  "content_break_id",
  "summarization",
  "json_assembly",
  "quality_assessment",
  "artifact_storage",
  "embedding_generation",
  "database_load",
  "voice_of_arkanum",
  "referee",
] as const;

export type PipelineStage = (typeof PIPELINE_STAGES)[number];

export const STAGE_PHASES: Record<PipelineStage, 1 | 2 | 3 | 0> = {
  document_registration: 1,
  document_intelligence: 1,
  pdf_to_png: 1,
  pdf_text_extract: 1,
  layout_analysis: 1,
  layout_classification: 1,
  bbox_detection: 1,
  content_type_classify: 1,
  child_image_extraction: 1,
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
  artifact_storage: 3,
  embedding_generation: 3,
  database_load: 3,
  voice_of_arkanum: 0,
  referee: 0,
};

// ─── Stage Inscriptions ───────────────────────────────────────────────────────

export const stageInscriptions = pgTable("stage_inscriptions", {
  id: serial("id").primaryKey(),
  stage: varchar("stage", { length: 64 }).notNull().unique(),
  primaryProviderId: integer("primary_provider_id"),
  secondaryProviderId: integer("secondary_provider_id"),
  fallbackProviderId: integer("fallback_provider_id"),
  promptName: varchar("prompt_name", { length: 128 }),
  promptVersion: integer("prompt_version"),
  temperature: real("temperature"),
  maxTokens: integer("max_tokens"),
  llmSettings: jsonb("llm_settings").$type<Record<string, unknown>>(),
  isActive: boolean("is_active").default(true).notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
}, (t) => ({
  stageIdx: index("stage_inscriptions_stage_idx").on(t.stage),
  primaryProviderIdx: index("stage_inscriptions_primary_idx").on(t.primaryProviderId),
  secondaryProviderIdx: index("stage_inscriptions_secondary_idx").on(t.secondaryProviderId),
  fallbackProviderIdx: index("stage_inscriptions_fallback_idx").on(t.fallbackProviderId),
}));

export type StageInscription = typeof stageInscriptions.$inferSelect;
export type InsertStageInscription = typeof stageInscriptions.$inferInsert;

export const modelAssignments = stageInscriptions;
export type ModelAssignment = StageInscription;
export type InsertModelAssignment = InsertStageInscription;

// ─── Supabase Instance Registry ───────────────────────────────────────────────
//
// Tracks all Supabase instances the pipeline may write to (local and cloud).
// Supports primary/secondary roles, mirroring, and bootstrap state tracking.
// The console's own DATABASE_URL is separate (set via environment variable).

export const SUPABASE_CONNECTION_TYPES = ["supabase_local", "supabase_cloud", "postgres_docker"] as const;
export type SupabaseConnectionType = (typeof SUPABASE_CONNECTION_TYPES)[number];

export const SUPABASE_ROLES = ["primary", "secondary"] as const;
export type SupabaseRole = (typeof SUPABASE_ROLES)[number];

// primary_only: writes go to this instance only
// mirror:       writes replicated to all mirror instances simultaneously
// failover:     secondary promoted only when primary is unreachable
export const SUPABASE_SYNC_MODES = ["primary_only", "mirror", "failover"] as const;
export type SupabaseSyncMode = (typeof SUPABASE_SYNC_MODES)[number];

export const BOOTSTRAP_STATUSES = ["pending", "in_progress", "completed", "failed"] as const;
export type BootstrapStatus = (typeof BOOTSTRAP_STATUSES)[number];

export const supabaseInstances = pgTable("supabase_instances", {
  id: serial("id").primaryKey(),
  name: varchar("name", { length: 128 }).notNull().unique(),
  connectionType: varchar("connection_type", { length: 32 }).notNull(),

  // Direct Postgres connection details
  host: varchar("host", { length: 256 }).notNull(),
  port: integer("port").default(5432).notNull(),
  databaseName: varchar("database_name", { length: 128 }).notNull(),

  // Postgres password (AES-256-GCM encrypted)
  encryptedPassword: text("encrypted_password"),
  passwordIv: varchar("password_iv", { length: 64 }),
  passwordAuthTag: varchar("password_auth_tag", { length: 64 }),

  // Supabase service role key (AES-256-GCM encrypted) — for REST API / admin ops
  encryptedServiceKey: text("encrypted_service_key"),
  serviceKeyIv: varchar("service_key_iv", { length: 64 }),
  serviceKeyAuthTag: varchar("service_key_auth_tag", { length: 64 }),
  // Display hints — stored at write time so UI never decrypts to show masked key
  serviceKeyPrefix: varchar("service_key_prefix", { length: 8 }),
  serviceKeySuffix: varchar("service_key_suffix", { length: 8 }),
  serviceKeyLength: integer("service_key_length"),

  // Supabase anon key — public, safe to store plaintext
  anonKey: text("anon_key"),

  // Supabase REST/Kong base URL (e.g., http://localhost:8100 or https://xxx.supabase.co)
  supabaseUrl: varchar("supabase_url", { length: 512 }),

  // Instance role and sync behaviour
  role: varchar("role", { length: 32 }).default("primary").notNull(),
  syncMode: varchar("sync_mode", { length: 32 }).default("primary_only").notNull(),

  isActive: boolean("is_active").default(true).notNull(),
  useSsl: boolean("use_ssl").default(false).notNull(),

  // Bootstrap tracks whether the schema has been fully initialised on this instance
  bootstrapStatus: varchar("bootstrap_status", { length: 32 }).default("pending").notNull(),
  bootstrapCompletedAt: timestamp("bootstrap_completed_at"),

  // Connectivity test tracking
  lastTestedAt: timestamp("last_tested_at"),
  lastTestStatus: varchar("last_test_status", { length: 32 }).default("untested").notNull(),

  notes: text("notes"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export type SupabaseInstance = typeof supabaseInstances.$inferSelect;
export type InsertSupabaseInstance = typeof supabaseInstances.$inferInsert;

// ─── Game Systems ─────────────────────────────────────────────────────────────

export const gameSystems = pgTable("game_systems", {
  id: serial("id").primaryKey(),
  name: varchar("name", { length: 128 }).notNull(),
  abbreviation: varchar("abbreviation", { length: 32 }),
  sortOrder: integer("sort_order").default(0).notNull(),
  isActive: boolean("is_active").default(true).notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});
export type GameSystem = typeof gameSystems.$inferSelect;
export type InsertGameSystem = typeof gameSystems.$inferInsert;

// ─── Library Shelves: Documents ───────────────────────────────────────────────

export const DOCUMENT_TYPES = ["book", "guide", "periodical", "magazine", "supplement", "adventure", "unknown"] as const;
export type DocumentType = (typeof DOCUMENT_TYPES)[number];

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

export const documents = pgTable("documents", {
  id: serial("id").primaryKey(),
  filename: varchar("filename", { length: 512 }).notNull(),
  gameSystem: varchar("game_system", { length: 128 }),
  edition: varchar("edition", { length: 64 }),
  title: varchar("title", { length: 512 }),
  scannedName: varchar("scanned_name", { length: 512 }),
  documentSummary: text("document_summary"),
  documentType: varchar("document_type", { length: 64 }),
  publisher: varchar("publisher", { length: 256 }),
  totalPages: integer("total_pages").default(0).notNull(),
  processedPages: integer("processed_pages").default(0).notNull(),
  flaggedPages: integer("flagged_pages").default(0).notNull(),
  avgConfidence: integer("avg_confidence").default(0),
  status: varchar("status", { length: 32 }).default("pending").notNull(),
  pdfUrl: varchar("pdf_url", { length: 1024 }),
  coverThumbnailUrl: varchar("cover_thumbnail_url", { length: 1024 }),
  ingestionJobId: integer("ingestion_job_id"),
  metadata: jsonb("metadata").$type<Record<string, unknown>>(),
  ownerUserId: integer("owner_user_id"),
  createdByUserId: integer("created_by_user_id"),
  visibility: varchar("visibility", { length: 16 }).default("private").notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export type Document = typeof documents.$inferSelect;
export type InsertDocument = typeof documents.$inferInsert;

// ─── Layout / Content Region Types ───────────────────────────────────────────

export const LAYOUT_TYPES = [
  "single_column", "two_column", "three_column", "mixed",
  "full_page_image", "table_dominant", "periodical_mixed", "unknown",
] as const;
export type LayoutType = (typeof LAYOUT_TYPES)[number];

export const CONTENT_REGION_TYPES = [
  "text", "table", "illustration", "map", "graphic", "advertisement",
  "header", "footer", "page_number", "sidebar", "callout", "unknown",
] as const;
export type ContentRegionType = (typeof CONTENT_REGION_TYPES)[number];

// ─── Document Pages ───────────────────────────────────────────────────────────

export const documentPages = pgTable("document_pages", {
  id: serial("id").primaryKey(),
  documentId: integer("document_id").notNull(),
  pageNumber: integer("page_number").notNull(),
  rawPngUrl: varchar("raw_png_url", { length: 1024 }),
  preprocessedPngUrl: varchar("preprocessed_png_url", { length: 1024 }),
  thumbnailUrl: varchar("thumbnail_url", { length: 1024 }),
  phash: varchar("phash", { length: 64 }),
  wasPreprocessed: boolean("was_preprocessed").default(false).notNull(),
  preprocessingApplied: varchar("preprocessing_applied", { length: 128 }),
  imageWidth: integer("image_width"),
  imageHeight: integer("image_height"),
  layoutType: varchar("layout_type", { length: 64 }),
  contentRegions: jsonb("content_regions").$type<Array<{
    sequence: number;
    regionType: string;
    bbox: { x: number; y: number; w: number; h: number };
    childImageUrl?: string;
    contentTypeFlags?: string[];
    isMixedBoundary?: boolean;
  }>>(),
  continuityFlags: jsonb("continuity_flags").$type<{
    continuesFromPreviousPage: boolean;
    continuesToNextPage: boolean;
    midSentenceBreakAtEnd: boolean;
    sectionContinuesFromPreviousPage: boolean;
  }>(),
  structuralBreaks: jsonb("structural_breaks").$type<Array<{
    breakType: "chapter" | "section" | "subsection" | "appendix";
    headingText: string;
    position: number;
  }>>(),
  pageJsonOutput: jsonb("page_json_output").$type<Record<string, unknown>>(),
  phaseStatus: varchar("phase_status", { length: 64 }),
  isFlagged: boolean("is_flagged").default(false).notNull(),
  ocrCompleted: boolean("ocr_completed").default(false).notNull(),
  ocrConfidence: integer("ocr_confidence"),
  /** Page label as printed on the page (e.g. "i", "42") — differs from the sequential PDF pageNumber */
  printedPageLabel: varchar("printed_page_label", { length: 32 }),
  /** Raw text extracted directly from the PDF text layer by pdftotext (null for image-only pages). */
  nativeText: text("native_text"),
  /** True when pdftotext found a usable embedded text layer on this page. */
  hasEmbeddedText: boolean("has_embedded_text").default(false).notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
}, (t) => ({
  documentIdIdx: index("document_pages_document_id_idx").on(t.documentId),
  phashIdx: index("document_pages_phash_idx").on(t.phash),
  documentPageIdx: index("document_pages_doc_page_idx").on(t.documentId, t.pageNumber),
}));

export type DocumentPage = typeof documentPages.$inferSelect;
export type InsertDocumentPage = typeof documentPages.$inferInsert;

// ─── OCR Results ──────────────────────────────────────────────────────────────

export const OCR_RESULT_STATUSES = [
  "pending", "pass1_complete", "pass2_complete", "pass3_complete", "pass4_complete",
  "validated", "corrected", "hitl_required", "failed",
] as const;

export type OcrResultStatus = (typeof OCR_RESULT_STATUSES)[number];

export const ocrResults = pgTable("ocr_results", {
  id: serial("id").primaryKey(),
  pageId: integer("page_id").notNull(),
  rawText: text("raw_text"),
  markdownText: text("markdown_text"),
  /** Cleaned + normalised text: page_number blocks suppressed, ligatures expanded,
   *  line-break hyphens joined, whitespace collapsed. Derived from rawText; rawText is never modified. */
  normalisedText: text("normalised_text"),
  /** Token-level F1 similarity (0–1) between OCR rawText and the native PDF text layer.
   *  Null when no embedded text layer was present on this page. */
  nativeSimilarity: real("native_similarity"),
  structuredData: jsonb("structured_data").$type<Record<string, unknown>>(),
  layoutMetadata: jsonb("layout_metadata").$type<Record<string, unknown>>(),
  confidence: integer("confidence").default(0),
  status: varchar("status", { length: 32 }).default("pending").notNull(),
  pass1Model: varchar("pass1_model", { length: 256 }),
  pass2Model: varchar("pass2_model", { length: 256 }),
  pass3Model: varchar("pass3_model", { length: 256 }),
  pass4Model: varchar("pass4_model", { length: 256 }),
  qualityScore: integer("quality_score"),
  qualityNotes: text("quality_notes"),
  auditLog: jsonb("audit_log").$type<{ timestamp: string; action: string; model?: string; detail?: string }[]>().default([]),
  correctedText: text("corrected_text"),
  correctedStructuredData: jsonb("corrected_structured_data").$type<Record<string, unknown>>(),
  correctedBy: integer("corrected_by"),
  correctedAt: timestamp("corrected_at"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
}, (t) => ({
  pageIdIdx: index("ocr_results_page_id_idx").on(t.pageId),
  statusIdx: index("ocr_results_status_idx").on(t.status),
}));

export type OcrResult = typeof ocrResults.$inferSelect;
export type InsertOcrResult = typeof ocrResults.$inferInsert;

// ─── Page Processing Attempts ─────────────────────────────────────────────────

export const pageProcessingAttempts = pgTable("page_processing_attempts", {
  id: serial("id").primaryKey(),
  pageId: integer("page_id").notNull(),
  ocrResultId: integer("ocr_result_id").notNull(),
  passNumber: integer("pass_number").notNull(),
  modelUsed: varchar("model_used", { length: 256 }).notNull(),
  providerName: varchar("provider_name", { length: 128 }),
  isCloudPass: boolean("is_cloud_pass").default(false).notNull(),
  rawTextOutput: text("raw_text_output"),
  structuredOutput: jsonb("structured_output").$type<Record<string, unknown>>(),
  score: integer("score"),
  comparisonNotes: text("comparison_notes"),
  wasAccepted: boolean("was_accepted").default(false).notNull(),
  processingTimeMs: integer("processing_time_ms"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
}, (t) => ({
  pageIdIdx: index("page_attempts_page_id_idx").on(t.pageId),
  ocrResultIdIdx: index("page_attempts_ocr_result_id_idx").on(t.ocrResultId),
}));

export type PageProcessingAttempt = typeof pageProcessingAttempts.$inferSelect;
export type InsertPageProcessingAttempt = typeof pageProcessingAttempts.$inferInsert;

// ─── HITL Queue ───────────────────────────────────────────────────────────────

export const HITL_PRIORITIES = ["low", "medium", "high", "critical"] as const;
export type HitlPriority = (typeof HITL_PRIORITIES)[number];

export const HITL_STATUSES = ["queued", "in_progress", "resolved", "skipped", "escalated"] as const;
export type HitlStatus = (typeof HITL_STATUSES)[number];

export const HITL_FLAG_CATEGORIES = [
  "doc_type_unknown",
  "ocr_quality_failed",
  "low_confidence",
  "layout_ambiguous",
  "content_type_conflict",
  "continuity_error",
  "stage_failure",
  "native_text_divergence",
  "manual_flag",
] as const;
export type HitlFlagCategory = (typeof HITL_FLAG_CATEGORIES)[number];

export const hitlQueue = pgTable("hitl_queue", {
  id: serial("id").primaryKey(),
  pageId: integer("page_id").notNull(),
  ocrResultId: integer("ocr_result_id"),
  reason: text("reason").notNull(),
  flagCategory: varchar("flag_category", { length: 64 }),
  priority: varchar("priority", { length: 16 }).default("medium").notNull(),
  status: varchar("status", { length: 32 }).default("queued").notNull(),
  assignedTo: integer("assigned_to"),
  resolutionNotes: text("resolution_notes"),
  resolvedBy: integer("resolved_by"),
  resolvedAt: timestamp("resolved_at"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
}, (t) => ({
  pageIdIdx: index("hitl_queue_page_id_idx").on(t.pageId),
  statusPriorityIdx: index("hitl_queue_status_priority_idx").on(t.status, t.priority, t.createdAt),
  assignedToIdx: index("hitl_queue_assigned_to_idx").on(t.assignedTo),
}));

export type HitlQueueItem = typeof hitlQueue.$inferSelect;
export type InsertHitlQueueItem = typeof hitlQueue.$inferInsert;

export const hitlRetryAttempts = pgTable("hitl_retry_attempts", {
  id: serial("id").primaryKey(),
  hitlItemId: integer("hitl_item_id"),
  pageId: integer("page_id").notNull(),
  requestedStages: jsonb("requested_stages").$type<string[]>().default([]).notNull(),
  savedCorrectionFields: jsonb("saved_correction_fields").$type<string[]>().default([]).notNull(),
  usedReviewedLayout: boolean("used_reviewed_layout").default(false).notNull(),
  usedReviewedRegions: boolean("used_reviewed_regions").default(false).notNull(),
  usedReviewedStructure: boolean("used_reviewed_structure").default(false).notNull(),
  status: varchar("status", { length: 32 }).default("running").notNull(),
  confidence: integer("confidence"),
  stagesFailed: jsonb("stages_failed").$type<string[]>().default([]).notNull(),
  stageErrors: jsonb("stage_errors").$type<Record<string, string>>().default({}).notNull(),
  modelTrace: jsonb("model_trace").$type<Record<string, string>>().default({}).notNull(),
  ocrResultId: integer("ocr_result_id"),
  createdBy: integer("created_by"),
  startedAt: timestamp("started_at").defaultNow().notNull(),
  completedAt: timestamp("completed_at"),
  durationMs: integer("duration_ms"),
}, (t) => ({
  pageIdIdx: index("hitl_retry_attempts_page_id_idx").on(t.pageId),
  hitlItemIdIdx: index("hitl_retry_attempts_hitl_item_id_idx").on(t.hitlItemId),
  statusIdx: index("hitl_retry_attempts_status_idx").on(t.status),
  startedAtIdx: index("hitl_retry_attempts_started_at_idx").on(t.startedAt),
}));

export type HitlRetryAttempt = typeof hitlRetryAttempts.$inferSelect;
export type InsertHitlRetryAttempt = typeof hitlRetryAttempts.$inferInsert;

// ─── Google OAuth Tokens ───────────────────────────────────────────────────────
//
// Stores a single system-wide Google OAuth token set (for the admin's personal
// Google Drive account). Access token is encrypted at rest.

export const googleOAuthTokens = pgTable("google_oauth_tokens", {
  id: serial("id").primaryKey(),
  encryptedAccessToken: text("encrypted_access_token"),
  accessTokenIv: varchar("access_token_iv", { length: 64 }),
  accessTokenAuthTag: varchar("access_token_auth_tag", { length: 64 }),
  encryptedRefreshToken: text("encrypted_refresh_token"),
  refreshTokenIv: varchar("refresh_token_iv", { length: 64 }),
  refreshTokenAuthTag: varchar("refresh_token_auth_tag", { length: 64 }),
  expiresAt: timestamp("expires_at"),
  scope: text("scope"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export type GoogleOAuthToken = typeof googleOAuthTokens.$inferSelect;
export type InsertGoogleOAuthToken = typeof googleOAuthTokens.$inferInsert;

// ─── LLM Timing Metrics ───────────────────────────────────────────────────────
//
// Append-only log of every LLM call made by the pipeline.
// Aggregated at query time for per-page, per-job, per-batch, and per-provider views.

export const llmTimingMetrics = pgTable("llm_timing_metrics", {
  id: serial("id").primaryKey(),
  /** Ingestion job that triggered this call (nullable for one-off calls). */
  jobId: integer("job_id"),
  /** Document page being processed (nullable for doc-level calls like document_intelligence). */
  pageId: integer("page_id"),
  /** Pipeline stage name (e.g. "ocr_extraction"). */
  stage: varchar("stage", { length: 64 }).notNull(),
  /** Provider record ID used for this call. */
  providerId: integer("provider_id"),
  /** Provider display name (denormalised for cheap GROUP BY queries). */
  providerName: varchar("provider_name", { length: 128 }),
  /** Model identifier returned in the LLM response. */
  model: varchar("model", { length: 256 }),
  /** Wall-clock milliseconds from first byte sent to last byte received (includes retries). */
  durationMs: integer("duration_ms").notNull(),
  /** Total tokens consumed (prompt + completion). */
  tokensUsed: integer("tokens_used").default(0).notNull(),
  /** True when the fallback provider handled the call (primary failed). */
  isFallback: boolean("is_fallback").default(false).notNull(),
  /** Whether the call completed without an error. */
  success: boolean("success").default(true).notNull(),
  /** Short error description when success = false. */
  errorMessage: text("error_message"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
}, (t) => ({
  jobIdIdx:      index("llm_timing_job_id_idx").on(t.jobId),
  pageIdIdx:     index("llm_timing_page_id_idx").on(t.pageId),
  providerIdx:   index("llm_timing_provider_id_idx").on(t.providerId),
  stageIdx:      index("llm_timing_stage_idx").on(t.stage),
  createdAtIdx:  index("llm_timing_created_at_idx").on(t.createdAt),
}));

export type LlmTimingMetric = typeof llmTimingMetrics.$inferSelect;
export type InsertLlmTimingMetric = typeof llmTimingMetrics.$inferInsert;

// ─── Content Summaries ────────────────────────────────────────────────────────
//
// Hierarchical summaries for chapters, sections, subsections, and pages.
// These are the "big chunks" for Small-to-Big Retrieval in the RAG layer.
// Structural breaks detected by content_break_detect are used to define
// the page-range boundaries for each summary.
// Parent–child hierarchy: subsection → section → chapter → document.

export const SUMMARY_LEVELS = ["chapter", "section", "subsection", "page"] as const;
export type SummaryLevel = (typeof SUMMARY_LEVELS)[number];

export const SUMMARY_STATUSES = ["pending", "generating", "generated", "approved", "failed"] as const;
export type SummaryStatus = (typeof SUMMARY_STATUSES)[number];

export const EMBEDDING_STATUSES = ["pending", "embedded", "failed"] as const;
export type EmbeddingStatus = (typeof EMBEDDING_STATUSES)[number];

export const contentSummaries = pgTable("content_summaries", {
  id: serial("id").primaryKey(),
  documentId: integer("document_id").notNull(),
  /** Hierarchy level: chapter > section > subsection > page */
  levelType: varchar("level_type", { length: 32 }).notNull(),
  /** Heading text as extracted by content_break_detect */
  headingText: varchar("heading_text", { length: 512 }),
  /** FK to the document_pages row where this section begins */
  startPageId: integer("start_page_id").notNull(),
  /** FK to the document_pages row where this section ends (null until resolved) */
  endPageId: integer("end_page_id"),
  startPageNumber: integer("start_page_number").notNull(),
  endPageNumber: integer("end_page_number"),
  /** 1–2 sentence summary for vector store metadata (embedding key chunk) */
  shortSummary: text("short_summary"),
  /** Full section summary for Small-to-Big retrieval context */
  longSummary: text("long_summary"),
  keyTerms: jsonb("key_terms").$type<string[]>().default([]),
  keyEntities: jsonb("key_entities").$type<string[]>().default([]),
  /** Parent summary ID — null for top-level chapters */
  parentId: integer("parent_id"),
  summaryStatus: varchar("summary_status", { length: 32 }).default("pending").notNull(),
  embeddingStatus: varchar("embedding_status", { length: 32 }).default("pending").notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
}, (t) => ({
  documentIdIdx: index("content_summaries_document_id_idx").on(t.documentId),
  levelTypeIdx:  index("content_summaries_level_type_idx").on(t.documentId, t.levelType),
  startPageIdx:  index("content_summaries_start_page_idx").on(t.startPageId),
  parentIdx:     index("content_summaries_parent_idx").on(t.parentId),
  statusIdx:     index("content_summaries_status_idx").on(t.summaryStatus),
}));

export type ContentSummary = typeof contentSummaries.$inferSelect;
export type InsertContentSummary = typeof contentSummaries.$inferInsert;
