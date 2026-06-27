import { SQL, and, asc, desc, eq, gte, ilike, inArray, isNull, lt, lte, ne, not, notInArray, or, sql } from "drizzle-orm";
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import { readFile, writeFile, mkdir } from "fs/promises";
import path from "path";
import {
  InsertUser, users,
  userProfiles, InsertUserProfile,
  systemPrompts, InsertSystemPrompt,
  userPermissions, InsertUserPermission,
  userInvitations, InsertUserInvitation,
  systemConfig, InsertSystemConfig,
  ingestionJobs, InsertIngestionJob,
  telemetryEvents, InsertTelemetryEvent,
  documents, InsertDocument,
  documentPages, InsertDocumentPage,
  ocrResults, InsertOcrResult,
  hitlQueue, InsertHitlQueueItem,
  hitlRetryAttempts, InsertHitlRetryAttempt,
  pageProcessingAttempts, InsertPageProcessingAttempt,
  llmProviders, InsertLlmProvider,
  stageInscriptions, InsertStageInscription,
  supabaseInstances, InsertSupabaseInstance,
  promptVersions, InsertPromptVersion,
  gameSystems, InsertGameSystem,
  llmTimingMetrics, InsertLlmTimingMetric,
  contentSummaries, InsertContentSummary,
  providerExchangeLogs, InsertProviderExchangeLog, PROVIDER_EXCHANGE_LOG_LIMIT,
  documentContentBlocks, InsertDocumentContentBlock,
} from "../drizzle/schema";
import { ENV } from './_core/env';

let _client: ReturnType<typeof postgres> | null = null;
let _db: ReturnType<typeof drizzle> | null = null;

export async function getDb() {
  if (!_db && process.env.DATABASE_URL) {
    try {
      _client = postgres(process.env.DATABASE_URL);
      _db = drizzle(_client);
    } catch (error) {
      console.warn("[Database] Failed to connect:", error);
      _db = null;
    }
  }
  return _db;
}

// ─── Users ────────────────────────────────────────────────────────────────────

export async function upsertUser(user: InsertUser): Promise<void> {
  if (!user.openId) throw new Error("User openId is required for upsert");
  const db = await getDb();
  if (!db) { console.warn("[Database] Cannot upsert user: database not available"); return; }

  try {
    const values: InsertUser = { openId: user.openId };
    const updateSet: Partial<InsertUser> = {};
    const textFields = ["name", "email", "loginMethod"] as const;
    type TextField = (typeof textFields)[number];
    const assignNullable = (field: TextField) => {
      const value = user[field];
      if (value === undefined) return;
      const normalized = value ?? null;
      values[field] = normalized as any;
      updateSet[field] = normalized as any;
    };
    textFields.forEach(assignNullable);
    if (user.lastSignedIn !== undefined) { values.lastSignedIn = user.lastSignedIn; updateSet.lastSignedIn = user.lastSignedIn; }
    if (user.role !== undefined) { values.role = user.role; updateSet.role = user.role; }
    else if (ENV.adminEmail && user.email && user.email.toLowerCase() === ENV.adminEmail.toLowerCase()) { values.role = 'admin'; updateSet.role = 'admin'; }
    if (!values.lastSignedIn) values.lastSignedIn = new Date();
    if (Object.keys(updateSet).length === 0) updateSet.lastSignedIn = new Date();
    await db.insert(users).values(values).onConflictDoUpdate({ target: users.openId, set: updateSet as any });
  } catch (error) {
    console.error("[Database] Failed to upsert user:", error);
    throw error;
  }
}

export async function getUserByOpenId(openId: string) {
  const db = await getDb();
  if (!db) { console.warn("[Database] Cannot get user: database not available"); return undefined; }
  const result = await db.select().from(users).where(eq(users.openId, openId)).limit(1);
  return result.length > 0 ? result[0] : undefined;
}

export async function getAllUsers() {
  const db = await getDb();
  if (!db) return [];
  return db.select().from(users).orderBy(users.createdAt);
}

export async function getUserById(id: number) {
  const db = await getDb();
  if (!db) return undefined;
  const result = await db.select().from(users).where(eq(users.id, id)).limit(1);
  return result.length > 0 ? result[0] : undefined;
}

export async function updateUserRole(userId: number, role: "user" | "reviewer" | "admin") {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  await db.update(users).set({ role }).where(eq(users.id, userId));
}

export async function deleteUser(userId: number) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  await db.delete(users).where(eq(users.id, userId));
}

// ─── User Profiles ────────────────────────────────────────────────────────────

export async function getUserProfile(userId: number) {
  const db = await getDb();
  if (!db) return undefined;
  const result = await db.select().from(userProfiles).where(eq(userProfiles.userId, userId)).limit(1);
  return result.length > 0 ? result[0] : undefined;
}

export async function upsertUserProfile(profile: InsertUserProfile) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  const updateSet: Partial<InsertUserProfile> = {};
  if (profile.displayName !== undefined) updateSet.displayName = profile.displayName;
  if (profile.preferredGame !== undefined) updateSet.preferredGame = profile.preferredGame;
  if (profile.preferredVersion !== undefined) updateSet.preferredVersion = profile.preferredVersion;
  if (profile.avatarUrl !== undefined) updateSet.avatarUrl = profile.avatarUrl;
  if (profile.savedEntries !== undefined) updateSet.savedEntries = profile.savedEntries;
  if (profile.savedGroups !== undefined) updateSet.savedGroups = profile.savedGroups;
  await db.insert(userProfiles).values(profile).onConflictDoUpdate({ target: userProfiles.userId, set: updateSet as any });
}

// ─── User Permissions ─────────────────────────────────────────────────────────

export async function getUserPermissions(userId: number) {
  const db = await getDb();
  if (!db) return [];
  return db.select().from(userPermissions).where(eq(userPermissions.userId, userId));
}

export async function setUserPermission(permission: InsertUserPermission) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  const existing = await db.select()
    .from(userPermissions)
    .where(and(
      eq(userPermissions.userId, permission.userId),
      eq(userPermissions.featureArea, permission.featureArea)
    ))
    .limit(1);

  if (existing.length > 0) {
    await db.update(userPermissions)
      .set({
        granted: permission.granted,
        restrictedGame: permission.restrictedGame ?? null,
        restrictedVersion: permission.restrictedVersion ?? null,
        grantedBy: permission.grantedBy,
      })
      .where(eq(userPermissions.id, existing[0].id));
  } else {
    await db.insert(userPermissions).values(permission);
  }
}

export async function deleteUserPermission(userId: number, featureArea: string) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  await db.delete(userPermissions).where(
    and(eq(userPermissions.userId, userId), eq(userPermissions.featureArea, featureArea))
  );
}

export async function getAllPermissionsForAllUsers() {
  const db = await getDb();
  if (!db) return [];
  return db.select().from(userPermissions).orderBy(userPermissions.userId);
}

// ─── User Invitations ─────────────────────────────────────────────────────────

export async function createInvitation(invitation: InsertUserInvitation) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  await db.insert(userInvitations).values(invitation);
}

export async function getInvitationByToken(token: string) {
  const db = await getDb();
  if (!db) return undefined;
  const result = await db.select().from(userInvitations).where(eq(userInvitations.token, token)).limit(1);
  return result.length > 0 ? result[0] : undefined;
}

export async function getAllInvitations() {
  const db = await getDb();
  if (!db) return [];
  return db.select().from(userInvitations).orderBy(userInvitations.createdAt);
}

export async function acceptInvitation(token: string, userId: number) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  await db.update(userInvitations)
    .set({ accepted: true, acceptedByUserId: userId })
    .where(eq(userInvitations.token, token));
}

export async function revokeInvitation(id: number) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  await db.delete(userInvitations).where(eq(userInvitations.id, id));
}

// ─── System Prompts ───────────────────────────────────────────────────────────

export async function getAllSystemPrompts() {
  const db = await getDb();
  if (!db) return [];
  return db.select().from(systemPrompts).orderBy(systemPrompts.category, systemPrompts.name);
}

export async function getSystemPromptByName(name: string) {
  const db = await getDb();
  if (!db) return undefined;
  const result = await db.select().from(systemPrompts).where(eq(systemPrompts.name, name)).limit(1);
  return result.length > 0 ? result[0] : undefined;
}

export async function upsertSystemPrompt(prompt: InsertSystemPrompt, savedBy?: number) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  const existing = await getSystemPromptByName(prompt.name);
  const versionToSave = existing ? (existing.version + 1) : 1;

  await db.insert(systemPrompts).values({ ...prompt, version: versionToSave }).onConflictDoUpdate({
    target: systemPrompts.name,
    set: {
      promptText: prompt.promptText,
      description: prompt.description,
      version: versionToSave,
    },
  });

  await db.insert(promptVersions).values({
    promptName: prompt.name,
    promptText: prompt.promptText,
    version: versionToSave,
    savedBy: savedBy ?? null,
  }).onConflictDoUpdate({
    target: [promptVersions.promptName, promptVersions.version],
    set: { promptText: prompt.promptText },
  });

  // Trim history to last 3 versions
  const history = await db
    .select({ id: promptVersions.id })
    .from(promptVersions)
    .where(eq(promptVersions.promptName, prompt.name))
    .orderBy(desc(promptVersions.version));

  if (history.length > 3) {
    const idsToDelete = history.slice(3).map((r) => r.id);
    for (const id of idsToDelete) {
      await db.delete(promptVersions).where(eq(promptVersions.id, id));
    }
  }
}

export async function getPromptVersionHistory(name: string) {
  const db = await getDb();
  if (!db) return [];
  return db
    .select()
    .from(promptVersions)
    .where(eq(promptVersions.promptName, name))
    .orderBy(desc(promptVersions.version))
    .limit(3);
}

export async function seedDefaultPrompts() {
  const db = await getDb();
  if (!db) return;

  const defaults: InsertSystemPrompt[] = [
    {
      name: "document_intelligence",
      category: "pipeline",
      description: "Identifies the document's canonical title, publisher, document type, and generates a 2–3 sentence summary from the first 10 pages. Drives layout strategy for all subsequent pages.",
      promptText: `Analyze the provided images representing the first 10 pages of a Tabletop Roleplaying Game (TTRPG) document. Extract high-level identity and classification metadata.

Domain Rules:
1. Preserve all TTRPG abbreviations (e.g., AC, HP, STR, d20, CR, XP) exactly as printed. Do not expand or correct them.
2. Output must be raw JSON only. Do not include markdown formatting, code blocks, preamble, or explanation.
3. If document type cannot be confidently determined, output "unknown".
4. Do not hallucinate data not visible in the images.

Output JSON Schema:
{
  "canonical_title": "string (Title as printed)",
  "publisher": "string (Publisher name as printed)",
  "document_type": "enum (book | guide | supplement | adventure | periodical | magazine | unknown)",
  "document_summary": "string (2-3 sentences defining scope and purpose)",
  "confidence": "integer (0-100 self-assessed certainty)"
}`,
      version: 1,
    },
    {
      name: "layout_analysis",
      category: "pipeline",
      description: "Local VLM determines macro-level visual layout structure and dominant content type for each page.",
      promptText: `Analyze the provided preprocessed PNG of a single TTRPG page. Determine the macro-level visual layout structure and dominant content type.

Domain Rules:
1. Identify column structure to inform reading order (left-to-right, top-to-bottom).
2. Output must be raw JSON only. Do not include markdown formatting, code blocks, preamble, or explanation.
3. If layout is ambiguous, output "unknown" for layout_type.
4. Output confidence below 55 if uncertain.

Output JSON Schema:
{
  "layout_type": "enum (single_column | two_column | three_column | mixed | full_page_image | table_dominant | periodical_mixed | unknown)",
  "dominant_content": "enum (text | table | illustration | mixed)",
  "has_header": "boolean",
  "has_footer": "boolean",
  "has_page_number": "boolean",
  "estimated_text_coverage": "float (0.0 to 1.0)",
  "notes": "string (optional observations)",
  "confidence": "integer (0-100)"
}`,
      version: 1,
    },
    {
      name: "bbox_detection",
      category: "pipeline",
      description: "Identifies visually distinct content elements, defines precise bounding boxes, and classifies semantic types.",
      promptText: `Analyze the provided TTRPG image—whether a full page layout or a cropped mixed-content region. Identify visually distinct content elements, define their precise bounding boxes, and classify their semantic types.

Domain Rules:
1. Processing Path: Evaluate columns strictly left-to-right. Within each column, evaluate regions top-to-bottom. Assign sequential, 1-indexed "sequence" values following this exact path.
2. Spatial Mapping: Bounding boxes must utilize pixel coordinates {x, y, w, h} relative to the top-left origin of the provided image.
3. Granularity: If a single bounding region contains disparate content types, flag it with isMixedBoundary = true and delineate internal components within the sub_regions array.
4. Format Constraints: Output must be raw JSON only.

Output JSON Schema:
{
  "page_id": "integer (if full page)",
  "original_region_sequence": "integer (if processing a cropped region)",
  "image_width": "integer",
  "image_height": "integer",
  "layout_type": "string",
  "regions": [
    {
      "sequence": "integer",
      "regionType": "enum (text | table | illustration | map | graphic | advertisement | header | footer | page_number | sidebar | callout | unknown)",
      "bbox": { "x": "integer", "y": "integer", "w": "integer", "h": "integer" },
      "contentTypeFlags": ["array of strings"],
      "isMixedBoundary": "boolean",
      "sub_regions": []
    }
  ],
  "resolved": "boolean",
  "confidence": "integer (0-100)"
}`,
      version: 1,
    },
    {
      name: "content_type_classify",
      category: "pipeline",
      description: "Resolves ambiguous or mixed-boundary regions from bbox_detection. Outputs refined sub-region splits with corrected content type classifications.",
      promptText: `Analyze the provided TTRPG image—whether a full page layout or a cropped mixed-content region. Identify visually distinct content elements, define their precise bounding boxes, and classify their semantic types.

Domain Rules:
1. Processing Path: Evaluate columns strictly left-to-right. Within each column, evaluate regions top-to-bottom.
2. Spatial Mapping: Bounding boxes must utilize pixel coordinates {x, y, w, h} relative to the top-left origin of the provided image.
3. Granularity: Flag mixed-boundary regions with isMixedBoundary = true and delineate sub_regions.
4. Format Constraints: Output must be raw JSON only.

Output JSON Schema:
{
  "page_id": "integer (if full page)",
  "original_region_sequence": "integer (if processing a cropped region)",
  "image_width": "integer",
  "image_height": "integer",
  "layout_type": "string",
  "regions": [
    {
      "sequence": "integer",
      "regionType": "enum (text | table | illustration | map | graphic | advertisement | header | footer | page_number | sidebar | callout | unknown)",
      "bbox": { "x": "integer", "y": "integer", "w": "integer", "h": "integer" },
      "contentTypeFlags": ["array of strings"],
      "isMixedBoundary": "boolean",
      "sub_regions": []
    }
  ],
  "resolved": "boolean",
  "confidence": "integer (0-100)"
}`,
      version: 1,
    },
    {
      name: "ocr_extraction",
      category: "pipeline",
      description: "Extracts text and tabular data from TTRPG region images into structured JSON.",
      promptText: `Extract text and tabular data from the provided TTRPG region image into structured JSON. Apply semantic hierarchy and game-specific formatting.

Domain Rules:
1. Abbreviations are canonical. Do not expand or correct AC, HP, STR, DEX, CON, INT, WIS, CHA, CR, XP, DC, or dice notation (d4/d20/etc).
2. Preserve formatting semantics. Translate bold text to rules terms, italics to spells/titles.
3. Obey reading order context provided in content_regions.
4. Output must be raw JSON only.
5. If table structure is detected, map to tabular schema. Otherwise, map to text schema.

Output JSON Schema (Text):
{
  "region_sequence": "integer",
  "regionType": "text",
  "content_blocks": [
    {
      "block_type": "enum (heading | paragraph | stat_line | rule_term)",
      "level": "integer (optional, for headings)",
      "text": "string",
      "term": "string (optional)",
      "definition": "string (optional)",
      "formatting": ["array of strings"]
    }
  ],
  "reading_order_verified": "boolean",
  "confidence": "integer (0-100)"
}`,
      version: 1,
    },
    {
      name: "content_break_detect",
      category: "pipeline",
      description: "Analyzes extracted text for structural breaks and cross-page sentence continuity.",
      promptText: `Analyze the extracted text array for a single TTRPG page and the look-ahead buffer containing the tail end of the previous page. Identify hierarchical structural breaks and sentence continuity.

Domain Rules:
1. Determine if the first sentence continues a thought from the look-ahead buffer.
2. Determine if the final sentence on the page is incomplete.
3. Output must be raw JSON only.
4. break_type MUST be EXACTLY one of: chapter | section | subsection | appendix
   NEVER use: list, table, figure, sidebar, preface, foreword, index, or any other value.
   Lists, tables, figures, and sidebars are content WITHIN sections — not structural breaks.
   Appendix A/B/C headings → "appendix". Named sub-sections within a chapter → "section" or "subsection".

Output JSON Schema:
{
  "page_number": "integer",
  "structural_breaks": [
    {
      "break_type": "enum (chapter | section | subsection | appendix)",
      "heading_text": "string",
      "position_in_reading_order": "integer"
    }
  ],
  "continuity": {
    "continues_from_previous_page": "boolean",
    "continues_to_next_page": "boolean",
    "mid_sentence_break_at_end": "boolean",
    "section_continues_from_previous_page": "boolean"
  },
  "confidence": "integer (0-100)"
}`,
      version: 1,
    },
    {
      name: "summarisation",
      category: "pipeline",
      description: "Generates hierarchical summaries for a complete TTRPG section, extracting key terms and entities for embedding metadata and RAG retrieval.",
      promptText: `Analyze the provided assembled text for a complete TTRPG section. Generate hierarchical summaries for embedding metadata and context retrieval.

Domain Rules:
1. Identify and extract canonical game terms. Do not alter or expand TTRPG abbreviations.
2. Write summaries strictly reflecting the mechanics and lore presented.
3. Output must be raw JSON only.

Output JSON Schema:
{
  "section_id": "string",
  "section_type": "string",
  "heading": "string",
  "short_summary": "string (1-2 sentences)",
  "long_summary": "string (1-3 paragraphs)",
  "key_terms": ["array of strings"],
  "key_entities": ["array of strings"],
  "confidence": "integer (0-100)"
}`,
      version: 1,
    },
    {
      name: "quality_validation",
      category: "pipeline",
      description: "Scores OCR extraction quality on completeness, layout accuracy, context decisions, and text continuity.",
      promptText: `Assess the provided OCR extraction JSON against the source page image/layout_metadata. Score extraction quality strictly on predefined dimensions.

Domain Rules:
1. Heavily penalize failures in layout accuracy (merging sidebars, violating column order).
2. Heavily penalize context failures (misidentifying stat blocks, stripping required formatting).
3. If overall score is below 50, strictly recommend escalate_to_pass3 or flag_hitl.
4. Output must be raw JSON only.

Output JSON Schema:
{
  "pass_number": "integer",
  "overall_score": "integer (0-100)",
  "accepted": "boolean",
  "dimension_scores": {
    "completeness": "integer",
    "layout_accuracy": "integer",
    "context_decisions": "integer",
    "text_continuity": "integer"
  },
  "issues": [{ "severity": "enum (minor | major | critical)", "dimension": "string", "description": "string" }],
  "recommendation": "enum (accept | escalate_to_pass3 | flag_hitl)",
  "confidence": "integer (0-100)"
}`,
      version: 1,
    },
    {
      name: "pass_comparison",
      category: "pipeline",
      description: "Contrasts all available pass outputs (Pass 1–4) to select the best candidate or flag for HITL.",
      promptText: `Analyze multiple OCR extraction pass outputs for the same TTRPG page. Select the optimal extraction candidate or escalate irreconcilable differences.

Domain Rules:
1. Prioritize passes that maintain distinct layout boundaries and preserve complex tabular structures.
2. Explicitly log mechanical differences in behavior between passes.
3. Output must be raw JSON only.

Output JSON Schema:
{
  "passes_compared": ["array of integers"],
  "recommended_pass": "integer",
  "winner_rationale": "string",
  "differences": [{ "region_sequence": "integer", "dimension": "string", "passX_behaviour": "string", "passY_behaviour": "string" }],
  "hitl_required": "boolean",
  "confidence": "integer (0-100)"
}`,
      version: 1,
    },
    {
      name: "tabular_extraction",
      category: "pipeline",
      description: "Specialised extraction for complex TTRPG tabular data: multi-row stat blocks, spell lists, merged-cell equipment tables.",
      promptText: `Perform specialized extraction on complex TTRPG tabular data (e.g., multi-row stat blocks, spell lists, merged-cell equipment tables).

Domain Rules:
1. Preserve row/column relationships precisely. Handle merged headers correctly.
2. Retain all canonical abbreviations.
3. Extract footnotes and associate them accurately.
4. Output must be raw JSON only.

Output JSON Schema:
{
  "region_sequence": "integer",
  "table_type": "string",
  "caption": "string",
  "column_headers": ["array of strings"],
  "rows": ["array of objects/arrays mapping to headers"],
  "merged_cells": ["array of strings"],
  "footnotes": ["array of strings"],
  "confidence": "integer (0-100)"
}`,
      version: 1,
    },
    {
      name: "voice_of_arkanum",
      category: "console_experience",
      description: "Generates thematic TTRPG lore aligned with the preferred game system.",
      promptText: `Generate thematic TTRPG lore based on {{random_seed}}, aligned with {{preferred_game}} and drawing structural context from {{database_schema_summary}}.

Domain Rules:
1. Tone must be evocative, atmospheric, and highly specific to the mechanical/lore realities of the target game system.
2. Output must be raw JSON only.

Output JSON Schema:
{
  "topic": "string",
  "lore_text": "string",
  "associated_mechanics": ["array of strings"]
}`,
      version: 1,
    },
    {
      name: "arkanum_search",
      category: "console_experience",
      description: "Translates natural language user queries into structured database search parameters.",
      promptText: `Translate the following natural language user query: "{{user_query}}" into structured database search parameters for the TTRPG lore database.

Domain Rules:
1. Map recognized entities to exact terminology associated with {{preferred_game}}.
2. Restrict filters to {{available_filters}}.
3. Output must be raw JSON only.

Output JSON Schema:
{
  "search_intent": "string",
  "extracted_keywords": ["array of strings"],
  "filters": { "document_type": "string", "entity_type": "string" },
  "confidence": "integer (0-100)"
}`,
      version: 1,
    },
    {
      name: "referee",
      category: "console_experience",
      description: "Authoritative rules referee that answers rules questions and resolves edge cases.",
      promptText: `You are The Referee — an authoritative, impartial rules arbiter for TTRPG systems. Your role is to answer specific rules questions, resolve edge cases, and cite the relevant source material from the lore database.

Domain Rules:
1. Always cite the specific rule source (book, page, section) when available in {{retrieved_context}}.
2. If a rule is ambiguous or has known errata, state both interpretations clearly.
3. Preserve all TTRPG abbreviations (AC, HP, DC, etc.) exactly as used in the source material.
4. Output must be raw JSON only.

Output JSON Schema:
{
  "ruling": "string",
  "citations": [{ "source": "string", "section": "string", "page": "string", "excerpt": "string" }],
  "ambiguity_notes": "string (optional)",
  "confidence": "integer (0-100)"
}`,
      version: 1,
    },
  ];

  for (const prompt of defaults) {
    const existing = await getSystemPromptByName(prompt.name);
    if (!existing) {
      await db.insert(systemPrompts).values(prompt).onConflictDoNothing();
      await db.insert(promptVersions).values({
        promptName: prompt.name,
        promptText: prompt.promptText,
        version: prompt.version ?? 1,
        savedBy: null,
      }).onConflictDoNothing();
    }
  }
}

// ─── System Config ────────────────────────────────────────────────────────────

export async function getAllSystemConfig() {
  const db = await getDb();
  if (!db) return [];
  return db.select().from(systemConfig).orderBy(systemConfig.category, systemConfig.key);
}

export async function getSystemConfigByCategory(category: string) {
  const db = await getDb();
  if (!db) return [];
  return db.select().from(systemConfig).where(eq(systemConfig.category, category));
}

export async function getSystemConfigByKey(key: string) {
  const db = await getDb();
  if (!db) return undefined;
  const result = await db.select().from(systemConfig).where(eq(systemConfig.key, key)).limit(1);
  return result.length > 0 ? result[0] : undefined;
}

export async function upsertSystemConfig(config: InsertSystemConfig) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  await db.insert(systemConfig).values(config).onConflictDoUpdate({
    target: systemConfig.key,
    set: { value: config.value, updatedBy: config.updatedBy },
  });
}

export async function deleteSystemConfig(key: string) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  await db.delete(systemConfig).where(eq(systemConfig.key, key));
}

// ─── Ingestion Jobs ───────────────────────────────────────────────────────────

export async function getAllIngestionJobs() {
  const db = await getDb();
  if (!db) return [];
  return db.select().from(ingestionJobs).orderBy(desc(ingestionJobs.createdAt)).limit(100);
}

export async function getActiveIngestionJobs() {
  const db = await getDb();
  if (!db) return [];
  return db.select().from(ingestionJobs)
    .where(and(
      ne(ingestionJobs.status, "completed"),
      ne(ingestionJobs.status, "failed")
    ))
    .orderBy(desc(ingestionJobs.createdAt));
}

export async function getIngestionJobById(id: number) {
  const db = await getDb();
  if (!db) return undefined;
  const result = await db.select().from(ingestionJobs).where(eq(ingestionJobs.id, id)).limit(1);
  return result.length > 0 ? result[0] : undefined;
}

export async function createIngestionJob(job: InsertIngestionJob) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  const [row] = await db.insert(ingestionJobs).values(job).returning({ id: ingestionJobs.id });
  return row.id;
}

export async function updateIngestionJobStatus(id: number, updates: Partial<InsertIngestionJob>) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  await db.update(ingestionJobs).set(updates).where(eq(ingestionJobs.id, id));
}

export async function getIngestionJobStats() {
  const db = await getDb();
  if (!db) return { total: 0, active: 0, completed: 0, failed: 0, queued: 0, totalPages: 0, processedPages: 0 };
  const all = await db.select().from(ingestionJobs);
  return {
    total: all.length,
    active: all.filter(j => !["completed", "failed", "queued", "review", "hitl_review", "paused"].includes(j.status)).length,
    completed: all.filter(j => j.status === "completed").length,
    failed: all.filter(j => j.status === "failed").length,
    queued: all.filter(j => j.status === "queued").length,
    totalPages: all.reduce((sum, j) => sum + j.totalPages, 0),
    processedPages: all.reduce((sum, j) => sum + j.processedPages, 0),
  };
}

export async function deleteIngestionJob(id: number) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  await db.delete(ingestionJobs).where(eq(ingestionJobs.id, id));
}

export async function clearIngestionJobsByStatus(statuses: string[]) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  const { inArray } = await import("drizzle-orm");
  await db.delete(ingestionJobs).where(inArray(ingestionJobs.status, statuses));
}

export async function clearHitlItems(statuses: string[]) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  const { inArray } = await import("drizzle-orm");
  if (statuses.length === 0) {
    await db.delete(hitlQueue);
  } else {
    await db.delete(hitlQueue).where(inArray(hitlQueue.status, statuses));
  }
}

/**
 * Wipe all processing data: jobs, documents, pages, OCR results, HITL items,
 * content summaries, processing attempts, and LLM timing metrics.
 * Preserves users, LLM providers, stage inscriptions, game systems, system
 * config, and Google OAuth tokens — i.e. configuration is untouched.
 */
export type WipeTarget =
  | "ingestion_jobs"
  | "documents"
  | "pages"
  | "ocr_results"
  | "hitl_items"
  | "content_summaries"
  | "metrics"
  | "page_layouts"
  | "page_regions"
  | "exchange_logs";

export async function wipeProcessingData(
  targets?: WipeTarget[],
): Promise<{ deletedCounts: Record<string, number> }> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  // Empty / absent targets → full wipe (backward-compatible).
  const wipeAll = !targets || targets.length === 0;
  const has = (t: WipeTarget) => wipeAll || targets!.includes(t);
  const counts: Record<string, number> = {};
  const n = (rows: { id: number }[]) => rows.length;

  // HITL leaf tables first
  if (has("hitl_items")) {
    counts.hitlRetryAttempts = n(await db.delete(hitlRetryAttempts).returning({ id: hitlRetryAttempts.id }));
    counts.hitlQueue         = n(await db.delete(hitlQueue).returning({ id: hitlQueue.id }));
  }

  if (has("ocr_results")) {
    counts.ocrResults = n(await db.delete(ocrResults).returning({ id: ocrResults.id }));
    // Reset completion flags on pages that are staying — otherwise the pipeline
    // believes OCR is done and skips those pages in the next run.
    if (!has("pages")) {
      await db.update(documentPages).set({ ocrCompleted: false, ocrConfidence: null });
    }
  }

  if (has("metrics")) {
    counts.llmTimingMetrics       = n(await db.delete(llmTimingMetrics).returning({ id: llmTimingMetrics.id }));
    counts.pageProcessingAttempts = n(await db.delete(pageProcessingAttempts).returning({ id: pageProcessingAttempts.id }));
  }

  if (has("exchange_logs")) {
    counts.providerExchangeLogs = n(await db.delete(providerExchangeLogs).returning({ id: providerExchangeLogs.id }));
  }

  if (has("content_summaries")) {
    counts.contentSummaries = n(await db.delete(contentSummaries).returning({ id: contentSummaries.id }));
  }

  // Soft wipes — UPDATE in place so pipeline can restart from corrected data.
  // Only applied when pages themselves are not being deleted.
  if (!has("pages")) {
    if (has("page_regions")) {
      const rows = await db.update(documentPages).set({ contentRegions: null }).returning({ id: documentPages.id });
      counts.pageRegionsCleared = rows.length;
    }
    if (has("page_layouts")) {
      const rows = await db.update(documentPages).set({ layoutType: null }).returning({ id: documentPages.id });
      counts.pageLayoutsCleared = rows.length;
    }
  }

  if (has("pages")) {
    counts.documentPages = n(await db.delete(documentPages).returning({ id: documentPages.id }));
  }
  if (has("documents")) {
    counts.documents = n(await db.delete(documents).returning({ id: documents.id }));
  }
  if (has("ingestion_jobs")) {
    counts.ingestionJobs = n(await db.delete(ingestionJobs).returning({ id: ingestionJobs.id }));
  }

  return { deletedCounts: counts };
}

export async function purgeJobPages(jobId: number) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  const { inArray } = await import("drizzle-orm");

  const docs = await db.select({ id: documents.id })
    .from(documents)
    .where(eq(documents.ingestionJobId, jobId));

  for (const doc of docs) {
    const pages = await db.select({ id: documentPages.id })
      .from(documentPages)
      .where(eq(documentPages.documentId, doc.id));
    const pageIds = pages.map(p => p.id);

    if (pageIds.length > 0) {
      await db.delete(hitlQueue).where(inArray(hitlQueue.pageId, pageIds));
      await db.delete(hitlRetryAttempts).where(inArray(hitlRetryAttempts.pageId, pageIds));
      await db.delete(ocrResults).where(inArray(ocrResults.pageId, pageIds));
      await db.delete(documentPages).where(inArray(documentPages.id, pageIds));
    }

    await db.update(documents)
      .set({ processedPages: 0, totalPages: 0, status: "phase1_non_ocr" })
      .where(eq(documents.id, doc.id));
  }
}

export async function cancelIngestionJobChain(sourceFile: string, driveFileId: string | null) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  // Mark all queued/converting/processing jobs for this source as cancelled
  const cancellable = ["queued", "paused", "converting", "pass1_ocr", "pass2_ocr", "enriching"];
  const { inArray } = await import("drizzle-orm");
  const matches = await db.select({ id: ingestionJobs.id })
    .from(ingestionJobs)
    .where(
      and(
        eq(ingestionJobs.sourceFile, sourceFile),
        inArray(ingestionJobs.status, cancellable),
      ),
    );
  for (const { id } of matches) {
    await db.update(ingestionJobs)
      .set({ status: "failed", errorMessage: "Cancelled by user", completedAt: new Date() })
      .where(eq(ingestionJobs.id, id));
  }
}

// ─── Telemetry Events ─────────────────────────────────────────────────────────

export async function recordTelemetryEvent(event: InsertTelemetryEvent) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  await db.insert(telemetryEvents).values(event);
}

export async function getTelemetryEvents(options: { eventType?: string; source?: string; since?: Date; limit?: number }) {
  const db = await getDb();
  if (!db) return [];
  const conditions = [];
  if (options.eventType) conditions.push(eq(telemetryEvents.eventType, options.eventType));
  if (options.source) conditions.push(eq(telemetryEvents.source, options.source));
  if (options.since) conditions.push(gte(telemetryEvents.createdAt, options.since));

  const query = db.select().from(telemetryEvents);
  if (conditions.length > 0) {
    return query.where(and(...conditions)).orderBy(desc(telemetryEvents.createdAt)).limit(options.limit ?? 500);
  }
  return query.orderBy(desc(telemetryEvents.createdAt)).limit(options.limit ?? 500);
}

export async function getTelemetrySummary() {
  const db = await getDb();
  if (!db) return { totalEvents: 0, totalCostMicros: 0, avgLatency: 0, modelBreakdown: [] as { source: string; count: number; avgMetric: number; totalCost: number }[] };

  const all = await db.select().from(telemetryEvents);
  const bySource = new Map<string, { count: number; totalMetric: number; totalCost: number }>();

  for (const event of all) {
    const existing = bySource.get(event.source) ?? { count: 0, totalMetric: 0, totalCost: 0 };
    existing.count++;
    existing.totalMetric += event.metricValue ?? 0;
    existing.totalCost += event.costMicros ?? 0;
    bySource.set(event.source, existing);
  }

  const modelBreakdown = Array.from(bySource.entries()).map(([source, data]) => ({
    source,
    count: data.count,
    avgMetric: data.count > 0 ? Math.round(data.totalMetric / data.count) : 0,
    totalCost: data.totalCost,
  }));

  return {
    totalEvents: all.length,
    totalCostMicros: all.reduce((sum, e) => sum + (e.costMicros ?? 0), 0),
    avgLatency: all.length > 0 ? Math.round(all.reduce((sum, e) => sum + (e.metricValue ?? 0), 0) / all.length) : 0,
    modelBreakdown,
  };
}

// ─── Health Check ─────────────────────────────────────────────────────────────

export async function pingDatabase(): Promise<{ ok: boolean; latencyMs: number }> {
  const start = Date.now();
  try {
    const db = await getDb();
    if (!db) return { ok: false, latencyMs: 0 };
    await db.execute(sql`SELECT 1`);
    return { ok: true, latencyMs: Date.now() - start };
  } catch {
    return { ok: false, latencyMs: Date.now() - start };
  }
}

// ─── LLM Providers ───────────────────────────────────────────────────────────

export async function getAllLlmProviders() {
  const db = await getDb();
  if (!db) return [];
  return db.select().from(llmProviders).orderBy(llmProviders.name);
}

export async function getLlmProviderById(id: number) {
  const db = await getDb();
  if (!db) return undefined;
  const result = await db.select().from(llmProviders).where(eq(llmProviders.id, id)).limit(1);
  return result.length > 0 ? result[0] : undefined;
}

export async function createLlmProvider(provider: InsertLlmProvider) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  const [row] = await db.insert(llmProviders).values(provider).returning({ id: llmProviders.id });
  return row.id;
}

export async function updateLlmProvider(id: number, updates: Partial<InsertLlmProvider>) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  await db.update(llmProviders).set(updates).where(eq(llmProviders.id, id));
}

export async function deleteLlmProvider(id: number) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  await db.update(stageInscriptions)
    .set({ primaryProviderId: null })
    .where(eq(stageInscriptions.primaryProviderId, id));
  await db.update(stageInscriptions)
    .set({ secondaryProviderId: null })
    .where(eq(stageInscriptions.secondaryProviderId, id));
  await db.update(stageInscriptions)
    .set({ fallbackProviderId: null })
    .where(eq(stageInscriptions.fallbackProviderId, id));
  await db.delete(llmProviders).where(eq(llmProviders.id, id));
}

// ─── Stage Inscriptions ───────────────────────────────────────────────────────

export async function getAllStageInscriptions() {
  const db = await getDb();
  if (!db) return [];
  return db.select().from(stageInscriptions).orderBy(stageInscriptions.stage);
}

export async function getStageInscriptionByStage(stage: string) {
  const db = await getDb();
  if (!db) return undefined;
  const result = await db.select().from(stageInscriptions)
    .where(eq(stageInscriptions.stage, stage)).limit(1);
  return result.length > 0 ? result[0] : undefined;
}

export async function upsertStageInscription(inscription: InsertStageInscription) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  const existing = await getStageInscriptionByStage(inscription.stage);
  if (existing) {
    await db.update(stageInscriptions)
      .set({ ...inscription, updatedAt: new Date() })
      .where(eq(stageInscriptions.stage, inscription.stage));
    return existing.id;
  } else {
    const [row] = await db.insert(stageInscriptions).values(inscription).returning({ id: stageInscriptions.id });
    return row.id;
  }
}

export async function updateStageInscription(id: number, updates: Partial<InsertStageInscription>) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  await db.update(stageInscriptions).set(updates).where(eq(stageInscriptions.id, id));
}

export async function deleteStageInscription(id: number) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  await db.delete(stageInscriptions).where(eq(stageInscriptions.id, id));
}

export const getAllModelAssignments = getAllStageInscriptions;
export const getModelAssignmentsByStage = (stage: string) =>
  getStageInscriptionByStage(stage).then(r => r ? [r] : []);
export const createModelAssignment = upsertStageInscription;
export const updateModelAssignment = updateStageInscription;
export const deleteModelAssignment = deleteStageInscription;

// ─── Supabase Instances ───────────────────────────────────────────────────────

export async function getAllSupabaseInstances() {
  const db = await getDb();
  if (!db) return [];
  return db.select().from(supabaseInstances).orderBy(supabaseInstances.role, supabaseInstances.name);
}

export async function getSupabaseInstanceById(id: number) {
  const db = await getDb();
  if (!db) return undefined;
  const result = await db.select().from(supabaseInstances).where(eq(supabaseInstances.id, id)).limit(1);
  return result.length > 0 ? result[0] : undefined;
}

export async function createSupabaseInstance(instance: InsertSupabaseInstance) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  const [row] = await db.insert(supabaseInstances).values(instance).returning({ id: supabaseInstances.id });
  return row.id;
}

export async function updateSupabaseInstance(id: number, updates: Partial<InsertSupabaseInstance> & Record<string, unknown>) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  await db.update(supabaseInstances).set(updates as Partial<InsertSupabaseInstance>).where(eq(supabaseInstances.id, id));
}

export async function deleteSupabaseInstance(id: number) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  await db.delete(supabaseInstances).where(eq(supabaseInstances.id, id));
}

export async function setActiveSupabaseInstance(id: number) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  await db.update(supabaseInstances).set({ isActive: false }).where(sql`true`);
  await db.update(supabaseInstances).set({ isActive: true }).where(eq(supabaseInstances.id, id));
}

export async function testSupabaseInstanceConnection(id: number): Promise<{ ok: boolean; latencyMs: number; message?: string; error?: string }> {
  const instance = await getSupabaseInstanceById(id);
  if (!instance) return { ok: false, latencyMs: 0, error: "Instance not found." };

  const { decryptSecret } = await import("./crypto");
  const start = Date.now();
  let testClient: ReturnType<typeof postgres> | null = null;
  try {
    let password = "postgres";
    if (instance.encryptedPassword && instance.passwordIv && instance.passwordAuthTag) {
      password = decryptSecret({ ciphertext: instance.encryptedPassword, iv: instance.passwordIv, authTag: instance.passwordAuthTag });
    }
    const url = `postgresql://postgres:${password}@${instance.host}:${instance.port}/${instance.databaseName}`;
    testClient = postgres(url, { max: 1, connect_timeout: 5, ssl: instance.useSsl ? "require" : false });
    await testClient`SELECT 1`;
    const latencyMs = Date.now() - start;
    await updateSupabaseInstance(id, { lastTestStatus: "success", lastTestedAt: new Date() });
    return { ok: true, latencyMs, message: `Connected to ${instance.host}:${instance.port}/${instance.databaseName} (${latencyMs}ms)` };
  } catch (err: any) {
    await updateSupabaseInstance(id, { lastTestStatus: "failed", lastTestedAt: new Date() });
    return { ok: false, latencyMs: Date.now() - start, error: err?.message ?? "Connection failed." };
  } finally {
    if (testClient) await testClient.end({ timeout: 2 }).catch(() => {});
  }
}

// ─── Documents ────────────────────────────────────────────────────────────────

export async function getAllDocuments() {
  const db = await getDb();
  if (!db) return [];
  return db.select().from(documents).orderBy(desc(documents.createdAt));
}

export async function getDocumentById(id: number) {
  const db = await getDb();
  if (!db) return undefined;
  const result = await db.select().from(documents).where(eq(documents.id, id)).limit(1);
  return result.length > 0 ? result[0] : undefined;
}

export async function createDocument(doc: InsertDocument) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  const [row] = await db.insert(documents).values(doc).returning({ id: documents.id });
  const [created] = await db.select().from(documents).where(eq(documents.id, row.id));
  return created;
}

export async function updateDocument(id: number, updates: Partial<InsertDocument>) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  await db.update(documents).set(updates).where(eq(documents.id, id));
}

export async function deleteDocument(id: number) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  await db.transaction(async (tx) => {
    const pages = await tx.select({ id: documentPages.id }).from(documentPages).where(eq(documentPages.documentId, id));
    const pageIds = pages.map(p => p.id);
    if (pageIds.length > 0) {
      for (const pid of pageIds) {
        await tx.delete(hitlQueue).where(eq(hitlQueue.pageId, pid));
        await tx.delete(ocrResults).where(eq(ocrResults.pageId, pid));
      }
      await tx.delete(documentPages).where(eq(documentPages.documentId, id));
    }
    await tx.delete(documents).where(eq(documents.id, id));
  });
}

export async function searchDocuments(query: string) {
  const db = await getDb();
  if (!db) return [];
  const pattern = `%${query}%`;
  return db.select().from(documents)
    .where(or(
      ilike(documents.title, pattern),
      ilike(documents.filename, pattern),
      ilike(documents.gameSystem, pattern),
    ))
    .orderBy(desc(documents.createdAt))
    .limit(50);
}

// ─── Document helpers ─────────────────────────────────────────────────────────

export async function getDocumentByJobId(jobId: number) {
  const db = await getDb();
  if (!db) return undefined;
  // Primary: document whose ingestion_job_id matches (first-block job)
  const direct = await db.select().from(documents).where(eq(documents.ingestionJobId, jobId)).limit(1);
  if (direct.length > 0) return direct[0];
  // Fallback: chained block job — read documentId stored on the job row (v0.1.92+)
  const jobRow = await db.select({ documentId: ingestionJobs.documentId }).from(ingestionJobs).where(eq(ingestionJobs.id, jobId)).limit(1);
  const documentId = (jobRow[0] as any)?.documentId as number | null | undefined;
  if (!documentId) return undefined;
  const byId = await db.select().from(documents).where(eq(documents.id, documentId)).limit(1);
  return byId.length > 0 ? byId[0] : undefined;
}

// ─── Document Pages ───────────────────────────────────────────────────────────

export async function getPagesByDocumentId(documentId: number) {
  const db = await getDb();
  if (!db) return [];
  return db.select().from(documentPages)
    .where(eq(documentPages.documentId, documentId))
    .orderBy(documentPages.pageNumber);
}

export async function getPagesByDocumentIdPaginated(documentId: number, offset: number, limit: number) {
  const db = await getDb();
  if (!db) return [];
  return db.select().from(documentPages)
    .where(eq(documentPages.documentId, documentId))
    .orderBy(documentPages.pageNumber)
    .offset(offset)
    .limit(limit);
}

export async function getDocumentPageCount(documentId: number) {
  const db = await getDb();
  if (!db) return 0;
  const { count: countFn } = await import("drizzle-orm");
  const [row] = await db.select({ count: countFn() }).from(documentPages)
    .where(eq(documentPages.documentId, documentId));
  return Number(row?.count ?? 0);
}

export async function getPageById(id: number) {
  const db = await getDb();
  if (!db) return undefined;
  const result = await db.select().from(documentPages).where(eq(documentPages.id, id)).limit(1);
  return result.length > 0 ? result[0] : undefined;
}

export async function getPageByDocumentAndNumber(documentId: number, pageNumber: number) {
  const db = await getDb();
  if (!db) return undefined;
  const result = await db.select().from(documentPages)
    .where(and(eq(documentPages.documentId, documentId), eq(documentPages.pageNumber, pageNumber)))
    .limit(1);
  return result.length > 0 ? result[0] : undefined;
}

export async function getPageByPhash(phash: string) {
  const db = await getDb();
  if (!db) return undefined;
  const result = await db.select().from(documentPages).where(eq(documentPages.phash, phash)).limit(1);
  return result.length > 0 ? result[0] : undefined;
}

/** Return all partIndex values for every row with the given (documentId, pageNumber).
 *  Used to determine the next available partIndex when splitting a region. */
export async function getPagePartIndicesForPageNumber(
  documentId: number,
  pageNumber: number,
): Promise<number[]> {
  const db = await getDb();
  if (!db) return [];
  const rows = await db
    .select({ partIndex: documentPages.partIndex })
    .from(documentPages)
    .where(and(eq(documentPages.documentId, documentId), eq(documentPages.pageNumber, pageNumber)));
  return rows.map(r => r.partIndex);
}

export async function createDocumentPage(page: InsertDocumentPage) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  const [row] = await db.insert(documentPages).values(page).returning({ id: documentPages.id });
  const [created] = await db.select().from(documentPages).where(eq(documentPages.id, row.id)).limit(1);
  return created!;
}

export async function updateDocumentPage(id: number, updates: Partial<InsertDocumentPage>) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  await db.update(documentPages).set({ ...updates, updatedAt: new Date() }).where(eq(documentPages.id, id));
}

// ─── OCR Results ──────────────────────────────────────────────────────────────

export async function getOcrResultByPageId(pageId: number) {
  const db = await getDb();
  if (!db) return undefined;
  const result = await db.select().from(ocrResults).where(eq(ocrResults.pageId, pageId)).limit(1);
  return result.length > 0 ? result[0] : undefined;
}

export async function getOcrResultById(id: number) {
  const db = await getDb();
  if (!db) return undefined;
  const result = await db.select().from(ocrResults).where(eq(ocrResults.id, id)).limit(1);
  return result.length > 0 ? result[0] : undefined;
}

export async function getPagesByIds(ids: number[]) {
  const db = await getDb();
  if (!db || ids.length === 0) return [];
  const { inArray } = await import("drizzle-orm");
  return db.select().from(documentPages).where(inArray(documentPages.id, ids));
}

export async function getDocumentsByIds(ids: number[]) {
  const db = await getDb();
  if (!db || ids.length === 0) return [];
  const { inArray } = await import("drizzle-orm");
  return db.select().from(documents).where(inArray(documents.id, ids));
}

export async function getOcrResultsByPageIds(pageIds: number[]) {
  const db = await getDb();
  if (!db || pageIds.length === 0) return [];
  const { inArray } = await import("drizzle-orm");
  return db.select().from(ocrResults).where(inArray(ocrResults.pageId, pageIds));
}

export async function createOcrResult(ocrResult: InsertOcrResult & Record<string, unknown>) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  const [row] = await db.insert(ocrResults).values(ocrResult as InsertOcrResult).returning({ id: ocrResults.id });
  const [created] = await db.select().from(ocrResults).where(eq(ocrResults.id, row.id)).limit(1);
  return created!;
}

export async function updateOcrResult(id: number, updates: Partial<InsertOcrResult> & Record<string, unknown>) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  await db.update(ocrResults).set(updates as Partial<InsertOcrResult>).where(eq(ocrResults.id, id));
}

// ─── HITL Queue ───────────────────────────────────────────────────────────────

const priorityRank = sql`CASE ${hitlQueue.priority} WHEN 'critical' THEN 0 WHEN 'high' THEN 1 WHEN 'medium' THEN 2 WHEN 'low' THEN 3 ELSE 99 END`;

export async function getAllHitlItems(options?: {
  /** Single status filter — mutually exclusive with `statuses`. */
  status?: string;
  /** Multi-status OR filter (e.g. ["queued","in_progress"] for the active-review view). */
  statuses?: string[];
  priority?: string; flagCategory?: string; excludeCategory?: string;
  limit?: number; offset?: number; orderByPriority?: boolean;
  /** Filter to a specific document (matched via the page's documentId). */
  documentId?: number;
}) {
  const db = await getDb();
  if (!db) return [];
  const conditions = [];
  if (options?.statuses && options.statuses.length > 0) {
    conditions.push(inArray(hitlQueue.status, options.statuses as any[]));
  } else if (options?.status) {
    conditions.push(eq(hitlQueue.status, options.status as any));
  }
  if (options?.priority) conditions.push(eq(hitlQueue.priority, options.priority as any));
  if (options?.flagCategory) conditions.push(eq(hitlQueue.flagCategory, options.flagCategory as any));
  // Use (IS NULL OR !=) rather than plain != so that rows with a NULL flagCategory
  // are correctly included.  SQL's != returns NULL for NULL columns, silently
  // dropping all manually-flagged items (which have no flagCategory set).
  if (options?.excludeCategory) conditions.push(
    or(isNull(hitlQueue.flagCategory), ne(hitlQueue.flagCategory, options.excludeCategory as any))!
  );
  if (options?.documentId) conditions.push(eq(documentPages.documentId, options.documentId));

  // Default order: document → page → part, so pages from the same book are
  // grouped together.  Priority sort keeps priority rank first, then doc/page.
  const order = options?.orderByPriority
    ? [asc(priorityRank), asc(documentPages.documentId), asc(documentPages.pageNumber), asc(documentPages.partIndex)]
    : [asc(documentPages.documentId), asc(documentPages.pageNumber), asc(documentPages.partIndex)];

  // JOIN documentPages so we can filter/sort by document and page number.
  const baseQuery = db
    .select({ hitl: hitlQueue })
    .from(hitlQueue)
    .innerJoin(documentPages, eq(hitlQueue.pageId, documentPages.id));
  const filtered = conditions.length > 0 ? baseQuery.where(and(...conditions)) : baseQuery;
  const rows = await filtered
    .orderBy(...order)
    .limit(options?.limit ?? 100)
    .offset(options?.offset ?? 0);
  return rows.map(r => r.hitl);
}

/** Return distinct documents that currently have at least one HITL item. */
export async function getDocumentsWithHitlItems(status?: string) {
  const db = await getDb();
  if (!db) return [];
  const conditions = status ? [eq(hitlQueue.status, status as any)] : [];
  const baseQuery = db
    .select({
      id: documents.id,
      title: documents.title,
      filename: documents.filename,
      gameSystem: documents.gameSystem,
      edition: documents.edition,
    })
    .from(hitlQueue)
    .innerJoin(documentPages, eq(hitlQueue.pageId, documentPages.id))
    .innerJoin(documents, eq(documentPages.documentId, documents.id))
    .groupBy(documents.id, documents.title, documents.filename, documents.gameSystem, documents.edition);
  const q = conditions.length > 0 ? baseQuery.where(and(...conditions)) : baseQuery;
  return q.orderBy(asc(documents.id));
}

export async function getHitlItemById(id: number) {
  const db = await getDb();
  if (!db) return undefined;
  const result = await db.select().from(hitlQueue).where(eq(hitlQueue.id, id)).limit(1);
  return result.length > 0 ? result[0] : undefined;
}

export async function getHitlItemsByIds(ids: number[]) {
  const db = await getDb();
  if (!db || ids.length === 0) return [];
  const { inArray } = await import("drizzle-orm");
  return db.select().from(hitlQueue).where(inArray(hitlQueue.id, ids));
}

export async function getHitlItemsByPageId(pageId: number) {
  const db = await getDb();
  if (!db) return [];
  return db.select().from(hitlQueue).where(eq(hitlQueue.pageId, pageId)).orderBy(desc(hitlQueue.createdAt));
}

export async function createHitlItem(item: InsertHitlQueueItem & Record<string, unknown>) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  const [row] = await db.insert(hitlQueue).values(item as InsertHitlQueueItem).returning({ id: hitlQueue.id });
  const [created] = await db.select().from(hitlQueue).where(eq(hitlQueue.id, row.id)).limit(1);
  return created!;
}

export async function updateHitlItem(id: number, updates: Partial<InsertHitlQueueItem> & Record<string, unknown>) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  await db.update(hitlQueue).set(updates as Partial<InsertHitlQueueItem>).where(eq(hitlQueue.id, id));
}

export async function createHitlRetryAttempt(attempt: InsertHitlRetryAttempt & Record<string, unknown>) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  const [row] = await db.insert(hitlRetryAttempts)
    .values(attempt as InsertHitlRetryAttempt)
    .returning({ id: hitlRetryAttempts.id });
  const [created] = await db.select().from(hitlRetryAttempts).where(eq(hitlRetryAttempts.id, row.id)).limit(1);
  return created!;
}

export async function updateHitlRetryAttempt(id: number, updates: Partial<InsertHitlRetryAttempt> & Record<string, unknown>) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  await db.update(hitlRetryAttempts).set(updates as Partial<InsertHitlRetryAttempt>).where(eq(hitlRetryAttempts.id, id));
}

export async function getHitlRetryAttemptsByPageId(pageId: number) {
  const db = await getDb();
  if (!db) return [];
  return db.select().from(hitlRetryAttempts)
    .where(eq(hitlRetryAttempts.pageId, pageId))
    .orderBy(desc(hitlRetryAttempts.startedAt));
}

export async function getHitlRetryAttemptsByPageIds(pageIds: number[]) {
  const db = await getDb();
  if (!db || pageIds.length === 0) return [];
  const { inArray } = await import("drizzle-orm");
  return db.select().from(hitlRetryAttempts)
    .where(inArray(hitlRetryAttempts.pageId, pageIds))
    .orderBy(desc(hitlRetryAttempts.startedAt));
}

export async function getHitlRetryAttemptsByPage(pageId: number) {
  const db = await getDb();
  if (!db) return [];
  return db.select().from(hitlRetryAttempts)
    .where(eq(hitlRetryAttempts.pageId, pageId))
    .orderBy(desc(hitlRetryAttempts.startedAt))
    .limit(10);
}

/**
 * Active retry attempts (pending_queue or running) joined with page and document info.
 * Also includes attempts completed/failed within the last 5 minutes so operators
 * can see results immediately after a batch retry.
 */
export async function getActiveRetryAttempts() {
  const db = await getDb();
  if (!db) return [];
  const fiveMinutesAgo = new Date(Date.now() - 5 * 60 * 1000);
  const rows = await db.execute(sql`
    SELECT
      r.id,
      r.hitl_item_id,
      r.page_id,
      r.requested_stages,
      r.status,
      r.started_at,
      r.completed_at,
      r.confidence,
      r.previous_confidence,
      r.confidence_delta,
      r.stages_failed,
      r.duration_ms,
      p.page_number,
      p.printed_page_label,
      d.id   AS document_id,
      COALESCE(d.title, d.filename) AS document_title
    FROM hitl_retry_attempts r
    JOIN document_pages p ON r.page_id = p.id
    JOIN documents d ON p.document_id = d.id
    WHERE r.status IN ('pending_queue', 'running')
       OR (r.status IN ('succeeded', 'failed') AND r.completed_at >= ${fiveMinutesAgo})
    ORDER BY r.started_at ASC
    LIMIT 500
  `);
  return rows as unknown as Array<{
    id: number; hitl_item_id: number | null; page_id: number;
    requested_stages: string[]; status: string;
    started_at: string; completed_at: string | null;
    confidence: number | null; previous_confidence: number | null; confidence_delta: number | null;
    stages_failed: string[]; duration_ms: number | null;
    page_number: number; printed_page_label: string | null;
    document_id: number; document_title: string;
  }>;
}

/** Latest retry attempt status per page — used to show Retry/Error pipeline status badges. */
export async function getLatestRetryStatusByPageIds(pageIds: number[]): Promise<Map<number, string>> {
  const db = await getDb();
  if (!db || pageIds.length === 0) return new Map();
  const { inArray } = await import("drizzle-orm");
  const rows = await db
    .select({ pageId: hitlRetryAttempts.pageId, status: hitlRetryAttempts.status })
    .from(hitlRetryAttempts)
    .where(inArray(hitlRetryAttempts.pageId, pageIds))
    .orderBy(desc(hitlRetryAttempts.startedAt));
  // One pass — first row seen for each page is the latest (DESC order)
  const out = new Map<number, string>();
  for (const r of rows) {
    if (!out.has(r.pageId)) out.set(r.pageId, r.status);
  }
  return out;
}

/** Returns the set of page IDs where any LLM call used a fallback provider. */
export async function getPageIdsWithFallback(pageIds: number[]): Promise<Set<number>> {
  const db = await getDb();
  if (!db || pageIds.length === 0) return new Set();
  const { inArray } = await import("drizzle-orm");
  const rows = await db
    .selectDistinct({ pageId: llmTimingMetrics.pageId })
    .from(llmTimingMetrics)
    .where(and(
      inArray(llmTimingMetrics.pageId, pageIds),
      eq(llmTimingMetrics.isFallback, true),
    ));
  return new Set(rows.map(r => r.pageId).filter((id): id is number => id != null));
}

/**
 * Pipeline health dashboard stats — single round-trip via four parallel
 * aggregate queries. Uses PostgreSQL FILTER (WHERE …) for efficiency.
 */
export async function getPipelineStats() {
  const db = await getDb();
  const zero = {
    pages: { total: 0, withLayout: 0, withRegions: 0, ocrComplete: 0, highConf: 0, medConf: 0, lowConf: 0, noScore: 0, errorState: 0, savedCorrections: 0, processed: 0, layoutFailed: 0, bboxFailed: 0, ocrFailed: 0 },
    hitl:  { queued: 0, inProgress: 0, resolved: 0, skipped: 0, total: 0 },
    retry: { pendingQueue: 0, running: 0, failed: 0, succeeded: 0 },
    docs:  { total: 0, layoutDone: 0, regionsDone: 0, ocrDone: 0 },
  };
  if (!db) return zero;

  const n = (v: unknown) => Number(v ?? 0);

  const [pageRow, hitlRow, retryRow, ocrRow, docsRow] = await Promise.all([
    db.select({
      total:            sql<number>`COUNT(*)`,
      withLayout:       sql<number>`COUNT(*) FILTER (WHERE ${documentPages.layoutType} IS NOT NULL)`,
      withRegions:      sql<number>`COUNT(*) FILTER (WHERE ${documentPages.contentRegions} IS NOT NULL)`,
      ocrComplete:      sql<number>`COUNT(*) FILTER (WHERE ${documentPages.ocrCompleted} = TRUE)`,
      highConf:         sql<number>`COUNT(*) FILTER (WHERE ${documentPages.ocrConfidence} >= 80)`,
      medConf:          sql<number>`COUNT(*) FILTER (WHERE ${documentPages.ocrConfidence} >= 50 AND ${documentPages.ocrConfidence} < 80)`,
      lowConf:          sql<number>`COUNT(*) FILTER (WHERE ${documentPages.ocrConfidence} IS NOT NULL AND ${documentPages.ocrConfidence} < 50)`,
      noScore:          sql<number>`COUNT(*) FILTER (WHERE ${documentPages.ocrCompleted} = TRUE AND ${documentPages.ocrConfidence} IS NULL)`,
      // Per-stage failures — queried from the stages_failed array stored in pageJsonOutput.
      // Only pages with pageJsonOutput set (pipeline ran at least once) can have failures.
      processed:        sql<number>`COUNT(*) FILTER (WHERE ${documentPages.pageJsonOutput} IS NOT NULL)`,
      layoutFailed:     sql<number>`COUNT(*) FILTER (WHERE (${documentPages.pageJsonOutput}->'stages_failed') @> '["layout_analysis"]'::jsonb)`,
      bboxFailed:       sql<number>`COUNT(*) FILTER (WHERE (${documentPages.pageJsonOutput}->'stages_failed') @> '["bbox_detection"]'::jsonb)`,
      ocrFailed:        sql<number>`COUNT(*) FILTER (WHERE (${documentPages.pageJsonOutput}->'stages_failed') @> '["ocr_extraction"]'::jsonb)`,
    }).from(documentPages),

    db.select({
      queued:     sql<number>`COUNT(*) FILTER (WHERE ${hitlQueue.status} = 'queued')`,
      inProgress: sql<number>`COUNT(*) FILTER (WHERE ${hitlQueue.status} = 'in_progress')`,
      resolved:   sql<number>`COUNT(*) FILTER (WHERE ${hitlQueue.status} = 'resolved')`,
      skipped:    sql<number>`COUNT(*) FILTER (WHERE ${hitlQueue.status} = 'skipped')`,
      total:      sql<number>`COUNT(*)`,
    }).from(hitlQueue),

    db.select({
      pendingQueue: sql<number>`COUNT(*) FILTER (WHERE ${hitlRetryAttempts.status} = 'pending_queue')`,
      running:      sql<number>`COUNT(*) FILTER (WHERE ${hitlRetryAttempts.status} = 'running')`,
      failed:       sql<number>`COUNT(*) FILTER (WHERE ${hitlRetryAttempts.status} = 'failed')`,
      succeeded:    sql<number>`COUNT(*) FILTER (WHERE ${hitlRetryAttempts.status} = 'succeeded')`,
    }).from(hitlRetryAttempts),

    db.select({
      errorState:       sql<number>`COUNT(*) FILTER (WHERE ${ocrResults.status} = 'failed')`,
      savedCorrections: sql<number>`COUNT(*) FILTER (WHERE ${ocrResults.correctedText} IS NOT NULL OR ${ocrResults.correctedStructuredData} IS NOT NULL)`,
    }).from(ocrResults),

    db.execute(sql`
      SELECT
        COUNT(*)::int                                                                     AS total,
        COUNT(*) FILTER (WHERE total_pages > 0 AND layout_pages  = total_pages)::int     AS layout_done,
        COUNT(*) FILTER (WHERE total_pages > 0 AND regions_pages = total_pages)::int     AS regions_done,
        COUNT(*) FILTER (WHERE total_pages > 0 AND ocr_pages     = total_pages)::int     AS ocr_done
      FROM (
        SELECT
          document_id,
          COUNT(*)                                             AS total_pages,
          COUNT(*) FILTER (WHERE layout_type    IS NOT NULL)  AS layout_pages,
          COUNT(*) FILTER (WHERE content_regions IS NOT NULL) AS regions_pages,
          COUNT(*) FILTER (WHERE ocr_completed  = TRUE)       AS ocr_pages
        FROM document_pages
        GROUP BY document_id
      ) sub
    `),
  ]);

  const p = pageRow[0]!;
  const h = hitlRow[0]!;
  const r = retryRow[0]!;
  const o = ocrRow[0]!;
  const d = (docsRow as unknown as Array<Record<string, unknown>>)[0] ?? {};

  return {
    pages: {
      total:            n(p.total),
      withLayout:       n(p.withLayout),
      withRegions:      n(p.withRegions),
      ocrComplete:      n(p.ocrComplete),
      highConf:         n(p.highConf),
      medConf:          n(p.medConf),
      lowConf:          n(p.lowConf),
      noScore:          n(p.noScore),
      errorState:       n(o.errorState),
      savedCorrections: n(o.savedCorrections),
      processed:        n(p.processed),
      layoutFailed:     n(p.layoutFailed),
      bboxFailed:       n(p.bboxFailed),
      ocrFailed:        n(p.ocrFailed),
    },
    hitl: {
      queued:     n(h.queued),
      inProgress: n(h.inProgress),
      resolved:   n(h.resolved),
      skipped:    n(h.skipped),
      total:      n(h.total),
    },
    retry: {
      pendingQueue: n(r.pendingQueue),
      running:      n(r.running),
      failed:       n(r.failed),
      succeeded:    n(r.succeeded),
    },
    docs: {
      total:       n(d.total),
      layoutDone:  n(d.layout_done),
      regionsDone: n(d.regions_done),
      ocrDone:     n(d.ocr_done),
    },
  };
}

/** Returns IDs of pages that completed OCR but never had bbox_detection write contentRegions. */
export async function getPagesMissingRegions(): Promise<number[]> {
  const db = await getDb();
  if (!db) return [];
  const { isNull } = await import("drizzle-orm");
  const rows = await db
    .select({ id: documentPages.id })
    .from(documentPages)
    .where(and(eq(documentPages.ocrCompleted, true), isNull(documentPages.contentRegions)));
  return rows.map(r => r.id);
}

/** Returns the most recent HITL item reason string for each page ID in the set. */
export async function getLatestHitlReasonByPageIds(pageIds: number[]): Promise<Map<number, string>> {
  const db = await getDb();
  if (!db || pageIds.length === 0) return new Map();
  const { inArray } = await import("drizzle-orm");
  // Only surface a reason when the item is still active — resolved/skipped items
  // should not continue to show the flag in Chronicles.
  const ACTIVE_STATUSES = ["queued", "in_progress", "escalated"] as const;
  const rows = await db
    .select({ pageId: hitlQueue.pageId, reason: hitlQueue.reason })
    .from(hitlQueue)
    .where(and(inArray(hitlQueue.pageId, pageIds), inArray(hitlQueue.status, ACTIVE_STATUSES as unknown as string[])))
    .orderBy(desc(hitlQueue.createdAt));
  const out = new Map<number, string>();
  for (const r of rows) {
    if (!out.has(r.pageId)) out.set(r.pageId, r.reason);
  }
  return out;
}

export async function getHitlStats() {
  const db = await getDb();
  if (!db) return { total: 0, queued: 0, queuedReview: 0, queuedInfra: 0, inProgress: 0, resolved: 0, skipped: 0, escalated: 0, byCritical: 0, byHigh: 0, byMedium: 0, byLow: 0 };
  const all = await db.select().from(hitlQueue);
  const INFRA = "provider_exhausted";
  return {
    total: all.length,
    queued: all.filter(i => i.status === "queued").length,
    // Split counts so the UI can show the right number per category-group view.
    // "review" = human-correctable items; "infra" = provider_exhausted (needs retry, not manual review).
    queuedReview: all.filter(i => i.status === "queued" && i.flagCategory !== INFRA).length,
    queuedInfra:  all.filter(i => i.status === "queued" && i.flagCategory === INFRA).length,
    inProgress: all.filter(i => i.status === "in_progress").length,
    resolved: all.filter(i => i.status === "resolved").length,
    skipped: all.filter(i => i.status === "skipped").length,
    escalated: all.filter(i => i.status === "escalated").length,
    byCritical: all.filter(i => i.priority === "critical").length,
    byHigh: all.filter(i => i.priority === "high").length,
    byMedium: all.filter(i => i.priority === "medium").length,
    byLow: all.filter(i => i.priority === "low").length,
  };
}

/** All queued HITL items with a specific flagCategory (used for bulk retry). */
export async function getHitlItemsQueuedByCategory(category: string) {
  const db = await getDb();
  if (!db) return [];
  return db.select().from(hitlQueue).where(
    and(eq(hitlQueue.flagCategory, category as any), eq(hitlQueue.status, "queued")),
  );
}

/** Per-category counts of queued and total HITL items. */
export async function getHitlCategoryStats() {
  const db = await getDb();
  if (!db) return [];
  const rows = await db.execute(sql`
    SELECT
      COALESCE(flag_category, 'uncategorized')              AS category,
      COUNT(*) FILTER (WHERE status = 'queued')::int        AS queued,
      COUNT(*)::int                                         AS total
    FROM hitl_queue
    GROUP BY flag_category
    ORDER BY queued DESC, total DESC
  `);
  return rows as unknown as Array<{ category: string; queued: number; total: number }>;
}

// ─── Page Processing Attempts ─────────────────────────────────────────────────

export async function getAttemptsForPage(pageId: number) {
  const db = await getDb();
  if (!db) return [];
  return db.select().from(pageProcessingAttempts)
    .where(eq(pageProcessingAttempts.pageId, pageId))
    .orderBy(pageProcessingAttempts.passNumber);
}

export async function getAttemptsForOcrResult(ocrResultId: number) {
  const db = await getDb();
  if (!db) return [];
  return db.select().from(pageProcessingAttempts)
    .where(eq(pageProcessingAttempts.ocrResultId, ocrResultId))
    .orderBy(pageProcessingAttempts.passNumber);
}

export async function createPageProcessingAttempt(attempt: InsertPageProcessingAttempt) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  const [row] = await db.insert(pageProcessingAttempts).values(attempt).returning({ id: pageProcessingAttempts.id });
  const [created] = await db.select().from(pageProcessingAttempts).where(eq(pageProcessingAttempts.id, row.id)).limit(1);
  return created!;
}

export async function updatePageProcessingAttempt(id: number, updates: Partial<InsertPageProcessingAttempt>) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  await db.update(pageProcessingAttempts).set(updates).where(eq(pageProcessingAttempts.id, id));
}

// ─── Game Systems ─────────────────────────────────────────────────────────────

export async function getAllGameSystems(activeOnly = true) {
  const db = await getDb();
  if (!db) return [];
  const rows = await db.select().from(gameSystems)
    .orderBy(gameSystems.sortOrder, gameSystems.name);
  return activeOnly ? rows.filter(r => r.isActive) : rows;
}

export async function createGameSystem(data: Omit<InsertGameSystem, "id" | "createdAt" | "updatedAt">) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  const [row] = await db.insert(gameSystems).values(data).returning();
  return row!;
}

export async function updateGameSystem(id: number, updates: Partial<InsertGameSystem>) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  await db.update(gameSystems).set(updates).where(eq(gameSystems.id, id));
}

export async function deleteGameSystem(id: number) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  await db.delete(gameSystems).where(eq(gameSystems.id, id));
}

// ─── LLM Timing Metrics ───────────────────────────────────────────────────────

export async function insertLlmTimingMetric(data: InsertLlmTimingMetric) {
  const db = await getDb();
  if (!db) return;
  await db.insert(llmTimingMetrics).values(data);
}

/** All metric rows for a single page, ordered by time. */
export async function getLlmMetricsByPage(pageId: number) {
  const db = await getDb();
  if (!db) return [];
  return db.select().from(llmTimingMetrics)
    .where(eq(llmTimingMetrics.pageId, pageId))
    .orderBy(llmTimingMetrics.createdAt);
}

/** Per-stage aggregates for a job — total calls, avg/total duration, total tokens, failures. */
export async function getLlmMetricsJobSummary(jobId: number) {
  const db = await getDb();
  if (!db) return [];
  const rows = await db.execute(sql`
    SELECT
      stage,
      COUNT(*)::int                                           AS call_count,
      ROUND(AVG(duration_ms))::int                           AS avg_duration_ms,
      SUM(duration_ms)::int                                  AS total_duration_ms,
      SUM(tokens_used)::int                                  AS total_tokens,
      COUNT(*) FILTER (WHERE success = false)::int           AS failure_count,
      COUNT(*) FILTER (WHERE is_fallback = true)::int        AS fallback_count,
      provider_name
    FROM llm_timing_metrics
    WHERE job_id = ${jobId}
    GROUP BY stage, provider_name
    ORDER BY total_duration_ms DESC
  `);
  return rows as unknown as Array<{
    stage: string; call_count: number; avg_duration_ms: number;
    total_duration_ms: number; total_tokens: number;
    failure_count: number; fallback_count: number; provider_name: string | null;
  }>;
}

/** Per-page summary for a job — total LLM time and call count per page. */
export async function getLlmMetricsPageSummary(jobId: number) {
  const db = await getDb();
  if (!db) return [];
  const rows = await db.execute(sql`
    SELECT
      page_id,
      COUNT(*)::int        AS call_count,
      SUM(duration_ms)::int AS total_duration_ms,
      SUM(tokens_used)::int AS total_tokens
    FROM llm_timing_metrics
    WHERE job_id = ${jobId} AND page_id IS NOT NULL
    GROUP BY page_id
  `);
  return rows as unknown as Array<{
    page_id: number; call_count: number; total_duration_ms: number; total_tokens: number;
  }>;
}

// ── Provider Exchange Logs ────────────────────────────────────────────────────

/**
 * Insert a provider exchange log entry and trim the per-provider ring buffer
 * to PROVIDER_EXCHANGE_LOG_LIMIT rows.  Fire-and-forget — errors are logged,
 * never thrown, so a logging failure never aborts a pipeline call.
 */
export async function insertProviderExchangeLog(data: InsertProviderExchangeLog): Promise<void> {
  const db = await getDb();
  if (!db) return;
  await db.insert(providerExchangeLogs).values(data);
  // Trim: keep only the most recent PROVIDER_EXCHANGE_LOG_LIMIT rows per provider.
  await db.execute(sql`
    DELETE FROM provider_exchange_logs
    WHERE provider_id = ${data.providerId}
      AND id NOT IN (
        SELECT id FROM provider_exchange_logs
        WHERE provider_id = ${data.providerId}
        ORDER BY created_at DESC
        LIMIT ${PROVIDER_EXCHANGE_LOG_LIMIT}
      )
  `);
}

/**
 * Return exchange logs for a specific provider (most recent first),
 * or all logs across all providers if providerId is omitted.
 */
export async function getProviderExchangeLogs(providerId?: number) {
  const db = await getDb();
  if (!db) return [];
  const query = db.select().from(providerExchangeLogs);
  if (providerId !== undefined) {
    return query.where(eq(providerExchangeLogs.providerId, providerId))
      .orderBy(desc(providerExchangeLogs.createdAt));
  }
  return query.orderBy(desc(providerExchangeLogs.createdAt));
}

// ─── Content Summaries ────────────────────────────────────────────────────────

export async function createContentSummary(data: InsertContentSummary) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  const [row] = await db.insert(contentSummaries).values(data).returning({ id: contentSummaries.id });
  return row;
}

export async function updateContentSummary(id: number, updates: Partial<InsertContentSummary>) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  await db.update(contentSummaries)
    .set({ ...updates, updatedAt: new Date() })
    .where(eq(contentSummaries.id, id));
}

export async function getContentSummariesByDocument(documentId: number) {
  const db = await getDb();
  if (!db) return [];
  return db.select().from(contentSummaries)
    .where(eq(contentSummaries.documentId, documentId))
    .orderBy(asc(contentSummaries.startPageNumber), asc(contentSummaries.id));
}

export async function getPendingSummariesByDocument(documentId: number) {
  const db = await getDb();
  if (!db) return [];
  return db.select().from(contentSummaries)
    .where(and(
      eq(contentSummaries.documentId, documentId),
      eq(contentSummaries.summaryStatus, "pending"),
    ))
    .orderBy(asc(contentSummaries.startPageNumber));
}

/**
 * After all pages in a document are processed, resolve section boundaries and
 * parent–child relationships for all content_summaries records.
 *
 * Algorithm:
 *   - Sort all records by startPageNumber, then by level depth (chapter < section < subsection).
 *   - For each record, endPageNumber = startPageNumber of the next record at the same or higher
 *     level (lower depth number), minus 1.  Last record of its level spans to document end.
 *   - parentId = the most recently opened record at the next-higher level.
 */
export async function getOcrTextForPageRange(
  documentId: number,
  startPage: number,
  endPage: number,
): Promise<Array<{ pageNumber: number; rawText: string | null; markdownText: string | null }>> {
  const db = await getDb();
  if (!db) return [];
  return db.select({
    pageNumber: documentPages.pageNumber,
    rawText: ocrResults.rawText,
    markdownText: ocrResults.markdownText,
  })
  .from(documentPages)
  .leftJoin(ocrResults, eq(ocrResults.pageId, documentPages.id))
  .where(and(
    eq(documentPages.documentId, documentId),
    gte(documentPages.pageNumber, startPage),
    lte(documentPages.pageNumber, endPage),
  ))
  .orderBy(asc(documentPages.pageNumber));
}

export async function resolveContentSummaryBoundaries(documentId: number, totalPages: number) {
  const db = await getDb();
  if (!db) return;

  // Structural hierarchy levels in ascending depth order.
  // appendix is treated as a top-level type (depth 1) — peer to chapter.
  const VALID_TYPES = new Set(["chapter", "appendix", "section", "subsection", "page"]);
  const LEVEL_DEPTH: Record<string, number> = { chapter: 1, appendix: 1, section: 2, subsection: 3, page: 4 };

  // Purge any records with invalid/hallucinated level types (e.g. "list", "table", "figure")
  // that should never have been persisted.  These were created by LLM responses that violated
  // the allowed enum; removing them here cleans up both freshly-processed and legacy documents.
  await db.delete(contentSummaries).where(
    and(
      eq(contentSummaries.documentId, documentId),
      notInArray(contentSummaries.levelType, Array.from(VALID_TYPES)),
    ),
  );

  const all = await db.select().from(contentSummaries)
    .where(eq(contentSummaries.documentId, documentId))
    .orderBy(asc(contentSummaries.startPageNumber), asc(contentSummaries.id));

  for (let i = 0; i < all.length; i++) {
    const cur = all[i];
    const curDepth = LEVEL_DEPTH[cur.levelType] ?? 5;

    // End page: next record at same or higher level (lower depth number)
    let endPage = totalPages;
    let endPageId: number | null = null;
    for (let j = i + 1; j < all.length; j++) {
      const next = all[j];
      if ((LEVEL_DEPTH[next.levelType] ?? 5) <= curDepth) {
        endPage = next.startPageNumber - 1;
        endPageId = null; // we don't have a prior-page id, null is fine
        break;
      }
    }

    // Parent: nearest preceding record at one level higher
    let parentId: number | null = null;
    for (let j = i - 1; j >= 0; j--) {
      const prev = all[j];
      if ((LEVEL_DEPTH[prev.levelType] ?? 5) === curDepth - 1) {
        parentId = prev.id;
        break;
      }
    }

    if (cur.endPageNumber !== endPage || cur.parentId !== parentId) {
      await db.update(contentSummaries)
        .set({ endPageNumber: endPage, endPageId, parentId, updatedAt: new Date() })
        .where(eq(contentSummaries.id, cur.id));
    }
  }
}

/** Per-provider summary over the last N days.
 *
 * @param perProviderSince  Optional map of provider_id → reset Date.  When a
 *   provider's individual reset is more recent than the global `sinceOverride`,
 *   its records before that per-provider time are excluded.  This enables
 *   per-provider stat resets without a full table wipe.
 */
export async function getLlmProviderMetricsSummary(
  days = 7,
  sinceOverride?: Date,
  perProviderSince?: Record<number, Date>,
) {
  const db = await getDb();
  if (!db) return [];
  const since = sinceOverride ?? new Date(Date.now() - days * 86_400_000);

  // Use the typed query builder for the WHERE clause to avoid sql-template
  // composition bugs when per-provider overrides inject nested parameters.
  let whereCondition: SQL = gte(llmTimingMetrics.createdAt, since);
  if (perProviderSince) {
    for (const [idStr, date] of Object.entries(perProviderSince)) {
      if (date > since) {
        const numId = parseInt(idStr, 10);
        const providerCondition = and(
          eq(llmTimingMetrics.providerId, numId),
          lt(llmTimingMetrics.createdAt, date),
        );
        if (providerCondition) whereCondition = and(whereCondition, not(providerCondition)) ?? whereCondition;
      }
    }
  }

  const rows = await db
    .select({
      provider_id:     llmTimingMetrics.providerId,
      provider_name:   llmTimingMetrics.providerName,
      total_calls:     sql<number>`COUNT(*)::int`,
      avg_duration_ms: sql<number>`ROUND(AVG(duration_ms))::int`,
      min_duration_ms: sql<number>`MIN(duration_ms)::int`,
      max_duration_ms: sql<number>`MAX(duration_ms)::int`,
      total_tokens:    sql<number>`SUM(tokens_used)::bigint`,
      failure_count:   sql<number>`(COUNT(*) FILTER (WHERE success = false))::int`,
      fallback_count:  sql<number>`(COUNT(*) FILTER (WHERE is_fallback = true))::int`,
      success_rate:    sql<number>`ROUND(100.0 * COUNT(*) FILTER (WHERE success = true) / NULLIF(COUNT(*), 0), 1)::float`,
    })
    .from(llmTimingMetrics)
    .where(whereCondition)
    .groupBy(llmTimingMetrics.providerId, llmTimingMetrics.providerName)
    .orderBy(desc(sql`COUNT(*)`));

  return rows as unknown as Array<{
    provider_id: number | null; provider_name: string | null;
    total_calls: number; avg_duration_ms: number; min_duration_ms: number; max_duration_ms: number;
    total_tokens: number; failure_count: number; fallback_count: number; success_rate: number;
  }>;
}

/**
 * All-time metrics grouped by (stage, provider_name).
 * Returns one row per (stage × provider) with pass/fail counts and latency.
 */
export async function getStageArtificerMetrics() {
  const db = await getDb();
  if (!db) return [];
  const rows = await db.execute(sql`
    SELECT
      stage,
      COALESCE(provider_name, '(unknown)')                        AS provider_name,
      COUNT(*)::int                                               AS call_count,
      COUNT(*) FILTER (WHERE success = false)::int                AS failure_count,
      ROUND(AVG(duration_ms))::int                               AS avg_duration_ms,
      MAX(duration_ms)::int                                      AS peak_duration_ms,
      SUM(tokens_used)::bigint                                   AS total_tokens,
      COUNT(*) FILTER (WHERE is_fallback = true)::int             AS fallback_count
    FROM llm_timing_metrics
    GROUP BY stage, provider_name
    ORDER BY stage, call_count DESC
  `);
  return rows as unknown as Array<{
    stage: string;
    provider_name: string;
    call_count: number;
    failure_count: number;
    avg_duration_ms: number;
    peak_duration_ms: number;
    total_tokens: number;
    fallback_count: number;
  }>;
}

// ─── Document Content Blocks ──────────────────────────────────────────────────

/**
 * Bulk-insert assembled content blocks for a document.
 * Chunks into batches of 200 to stay within postgres parameter limits.
 */
export async function createDocumentContentBlocks(blocks: InsertDocumentContentBlock[]): Promise<void> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  if (blocks.length === 0) return;
  const CHUNK = 200;
  for (let i = 0; i < blocks.length; i += CHUNK) {
    await db.insert(documentContentBlocks).values(blocks.slice(i, i + CHUNK));
  }
}

export async function getContentBlocksByDocument(documentId: number) {
  const db = await getDb();
  if (!db) return [];
  return db.select().from(documentContentBlocks)
    .where(eq(documentContentBlocks.documentId, documentId))
    .orderBy(asc(documentContentBlocks.sequence));
}

export async function getContentBlocksByDocumentPaginated(
  documentId: number,
  offset: number,
  limit: number,
) {
  const db = await getDb();
  if (!db) return [];
  return db.select().from(documentContentBlocks)
    .where(eq(documentContentBlocks.documentId, documentId))
    .orderBy(asc(documentContentBlocks.sequence))
    .offset(offset)
    .limit(limit);
}

export async function getContentBlocksCount(documentId: number): Promise<number> {
  const db = await getDb();
  if (!db) return 0;
  const { count: countFn } = await import("drizzle-orm");
  const [row] = await db.select({ count: countFn() })
    .from(documentContentBlocks)
    .where(eq(documentContentBlocks.documentId, documentId));
  return Number(row?.count ?? 0);
}

export async function deleteContentBlocksByDocumentId(documentId: number): Promise<void> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  await db.delete(documentContentBlocks).where(eq(documentContentBlocks.documentId, documentId));
}

export async function updateContentBlock(id: number, updates: Partial<InsertDocumentContentBlock>): Promise<void> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  await db.update(documentContentBlocks)
    .set({ ...updates, updatedAt: new Date() })
    .where(eq(documentContentBlocks.id, id));
}

// ─── Pipeline Results Bundle (export / import) ────────────────────────────────
//
// A "bundle" is a portable JSON snapshot of everything the pipeline produced for
// a document: per-page layout, OCR, regions, structural breaks, the content-
// summary hierarchy, and optionally the page images as base64.
//
// Supersedes the old "document_export_v1" (Full JSON) format — a bundle contains
// all of that data plus raw OCR fields and re-importable summary indices.
//
// Typical workflow (no images):
//   System A — process document → Export Bundle → bundle.json
//   System B — ingest same PDF (creates images) → Import Bundle → all pipeline
//              results populated, no LLM calls needed.
//
// With images: the bundle is self-contained; System B does not need to ingest
// the PDF first.

const BUNDLE_WORKSPACE = process.env.PIPELINE_WORKSPACE ?? "/app/workspace";

export interface BundlePage {
  pageNumber:             number;
  partIndex:              number;
  printedPageLabel:       string | null;
  imageWidth:             number | null;
  imageHeight:            number | null;
  layoutType:             string | null;
  contentRegions:         unknown | null;
  continuityFlags:        unknown | null;
  structuralBreaks:       unknown | null;
  pageJsonOutput:         unknown | null;
  isFlagged:              boolean;
  ocrCompleted:           boolean;
  ocrConfidence:          number | null;
  hasEmbeddedText:        boolean;
  detectedRotation:       number | null;
  rotationCorrected:      boolean;
  sourceRegionBbox:       unknown | null;
  /** Base64-encoded PNG, present only when exported with includeImages: true */
  imageBase64?:           string;
  ocr: {
    rawText:              string | null;
    markdownText:         string | null;
    normalisedText:       string | null;
    nativeSimilarity:     number | null;
    structuredData:       unknown | null;
    layoutMetadata:       unknown | null;
    confidence:           number | null;
    status:               string;
    qualityScore:         number | null;
    qualityNotes:         string | null;
    correctedText:        string | null;
    correctedStructuredData: unknown | null;
  } | null;
}

export interface BundleSummary {
  /** 0-based position within the bundle array — used to re-link parentId on import */
  bundleIdx:       number;
  parentBundleIdx: number | null;
  levelType:       string;
  headingText:     string | null;
  startPageNumber: number;
  endPageNumber:   number | null;
  shortSummary:    string | null;
  longSummary:     string | null;
  keyTerms:        string[];
  keyEntities:     string[];
  summaryStatus:   string;
}

/** Nested summary tree node — mirrors the old Full JSON content_structure shape */
export interface ContentStructureNode {
  level_type:      string;
  heading_text:    string | null;
  start_page:      number;
  end_page:        number | null;
  summary_status:  string;
  short_summary:   string | null;
  long_summary:    string | null;
  key_terms:       string[];
  key_entities:    string[];
  children:        ContentStructureNode[];
}

export interface DocumentBundle {
  schema_version: "bundle_v1";
  exported_at:    string;
  includes_images: boolean;
  document: {
    id:              number;
    title:           string | null;
    filename:        string;
    publisher:       string | null;
    documentType:    string | null;
    gameSystem:      string | null;
    edition:         string | null;
    totalPages:      number | null;
    avgConfidence:   number | null;
    documentSummary: string | null;
    status:          string;
  };
  /** Ready-to-consume nested hierarchy tree (same shape as the old Full JSON content_structure) */
  content_structure: ContentStructureNode[];
  /** Flat summary array with bundle-local parent indices — used for re-import */
  summaries:       BundleSummary[];
  pages:           BundlePage[];
}

/** Build a nested content_structure tree from a flat list of summary rows. */
function buildContentStructure(
  summaryRows: Array<{
    id: number; parentId: number | null; levelType: string; headingText: string | null;
    startPageNumber: number; endPageNumber: number | null; summaryStatus: string;
    shortSummary: string | null; longSummary: string | null;
    keyTerms: unknown; keyEntities: unknown;
  }>,
): ContentStructureNode[] {
  const nodes = new Map<number, ContentStructureNode & { _id: number }>(
    summaryRows.map(s => [s.id, {
      _id:            s.id,
      level_type:     s.levelType,
      heading_text:   s.headingText ?? null,
      start_page:     s.startPageNumber,
      end_page:       s.endPageNumber ?? null,
      summary_status: s.summaryStatus,
      short_summary:  s.shortSummary ?? null,
      long_summary:   s.longSummary ?? null,
      key_terms:      (s.keyTerms as string[]) ?? [],
      key_entities:   (s.keyEntities as string[]) ?? [],
      children:       [],
    }]),
  );
  const roots: ContentStructureNode[] = [];
  for (const s of summaryRows) {
    const node = nodes.get(s.id)!;
    if (s.parentId != null && nodes.has(s.parentId)) {
      nodes.get(s.parentId)!.children.push(node);
    } else {
      roots.push(node);
    }
  }
  return roots;
}

/**
 * Export a complete pipeline results bundle for a document.
 *
 * @param includeImages  When true, each page's PNG is read from the workspace
 *                       and embedded as a base64 string.  Makes the bundle
 *                       self-contained but significantly larger.
 */
export async function exportDocumentBundle(
  documentId: number,
  options?: { includeImages?: boolean },
): Promise<DocumentBundle> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  const doc = await getDocumentById(documentId);
  if (!doc) throw new Error("Document not found");

  const pages = await getPagesByDocumentId(documentId);
  const pageIds = pages.map(p => p.id);
  const ocrs = pageIds.length > 0 ? await getOcrResultsByPageIds(pageIds).catch(() => []) : [];
  const ocrByPageId = new Map(ocrs.map(o => [o.pageId, o]));

  const summaryRows = await db.select().from(contentSummaries)
    .where(eq(contentSummaries.documentId, documentId))
    .orderBy(asc(contentSummaries.startPageNumber), asc(contentSummaries.id));

  // Flat summaries array (for re-import)
  const summaryIdToIdx = new Map(summaryRows.map((s, i) => [s.id, i]));
  const bundleSummaries: BundleSummary[] = summaryRows.map((s, i) => ({
    bundleIdx:        i,
    parentBundleIdx:  s.parentId != null ? (summaryIdToIdx.get(s.parentId) ?? null) : null,
    levelType:        s.levelType,
    headingText:      s.headingText ?? null,
    startPageNumber:  s.startPageNumber,
    endPageNumber:    s.endPageNumber ?? null,
    shortSummary:     s.shortSummary ?? null,
    longSummary:      s.longSummary ?? null,
    keyTerms:         (s.keyTerms as string[]) ?? [],
    keyEntities:      (s.keyEntities as string[]) ?? [],
    summaryStatus:    s.summaryStatus,
  }));

  const includeImages = options?.includeImages ?? false;

  // Build page metadata synchronously, then load images sequentially (not concurrently)
  // so that 300+ page documents with images don't spike all PNG files into memory at once.
  const bundlePages: BundlePage[] = [];
  for (const p of pages) {
    const ocr = ocrByPageId.get(p.id) ?? null;

    let imageBase64: string | undefined;
    if (includeImages && p.rawPngUrl) {
      try {
        const bytes = await readFile(p.rawPngUrl);
        imageBase64 = bytes.toString("base64");
      } catch {
        // File missing — omit rather than failing the whole export
      }
    }

    bundlePages.push({
      pageNumber:        p.pageNumber,
      partIndex:         p.partIndex,
      printedPageLabel:  p.printedPageLabel ?? null,
      imageWidth:        p.imageWidth ?? null,
      imageHeight:       p.imageHeight ?? null,
      layoutType:        p.layoutType ?? null,
      contentRegions:    p.contentRegions ?? null,
      continuityFlags:   p.continuityFlags ?? null,
      structuralBreaks:  p.structuralBreaks ?? null,
      pageJsonOutput:    p.pageJsonOutput ?? null,
      isFlagged:         p.isFlagged,
      ocrCompleted:      p.ocrCompleted,
      ocrConfidence:     p.ocrConfidence ?? null,
      hasEmbeddedText:   p.hasEmbeddedText,
      detectedRotation:  p.detectedRotation ?? null,
      rotationCorrected: p.rotationCorrected,
      sourceRegionBbox:  p.sourceRegionBbox ?? null,
      ...(imageBase64 !== undefined ? { imageBase64 } : {}),
      ocr: ocr ? {
        rawText:                 ocr.rawText ?? null,
        markdownText:            ocr.markdownText ?? null,
        normalisedText:          ocr.normalisedText ?? null,
        nativeSimilarity:        ocr.nativeSimilarity ?? null,
        structuredData:          ocr.structuredData ?? null,
        layoutMetadata:          ocr.layoutMetadata ?? null,
        confidence:              ocr.confidence ?? null,
        status:                  ocr.status,
        qualityScore:            ocr.qualityScore ?? null,
        qualityNotes:            ocr.qualityNotes ?? null,
        correctedText:           ocr.correctedText ?? null,
        correctedStructuredData: ocr.correctedStructuredData ?? null,
      } : null,
    });
  }

  return {
    schema_version:    "bundle_v1",
    exported_at:       new Date().toISOString(),
    includes_images:   includeImages,
    document: {
      id:              doc.id,
      title:           doc.title ?? null,
      filename:        doc.filename,
      publisher:       doc.publisher ?? null,
      documentType:    doc.documentType ?? null,
      gameSystem:      doc.gameSystem ?? null,
      edition:         doc.edition ?? null,
      totalPages:      doc.totalPages ?? null,
      avgConfidence:   doc.avgConfidence ?? null,
      documentSummary: doc.documentSummary ?? null,
      status:          doc.status,
    },
    content_structure: buildContentStructure(summaryRows),
    summaries:         bundleSummaries,
    pages:             bundlePages,
  };
}

/**
 * Import a pipeline results bundle into an existing (or empty) document.
 *
 * Pages are matched by (pageNumber, partIndex).  When `imageBase64` is present
 * on a bundle page AND no matching page record exists yet, a new page record is
 * created and the image written to the workspace.  When a page already exists,
 * its image is only overwritten if `overwriteImages` is true.
 *
 * Returns counts of pages updated/created, OCR records upserted, and summaries.
 */
export async function importDocumentBundle(
  documentId: number,
  bundle: DocumentBundle,
  options?: {
    overwriteImages?: boolean;
    /** "replace" (default): delete and re-insert OCR + summaries from bundle.
     *  "fill": skip pages that already have OCR; skip summaries if any exist. */
    mode?: "replace" | "fill";
  },
): Promise<{ pagesUpdated: number; pagesCreated: number; ocrUpserted: number; summariesCreated: number }> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  if (bundle.schema_version !== "bundle_v1") {
    throw new Error(`Unsupported bundle schema version: ${(bundle as any).schema_version}`);
  }

  const overwriteImages = options?.overwriteImages ?? false;
  const fillMode = (options?.mode ?? "replace") === "fill";
  const docDir = path.join(BUNDLE_WORKSPACE, `doc-${documentId}`, "pages");

  // Load existing pages so we can match by (pageNumber, partIndex)
  let existingPages = await getPagesByDocumentId(documentId);
  const pageKey = (n: number, pi: number) => `${n}:${pi}`;
  const pageByKey = () => new Map(existingPages.map(p => [pageKey(p.pageNumber, p.partIndex), p]));

  let pagesUpdated = 0;
  let pagesCreated = 0;
  let ocrUpserted = 0;

  for (const bp of bundle.pages) {
    let existing = pageByKey().get(pageKey(bp.pageNumber, bp.partIndex));

    // ── If bundle carries an image and no page exists yet, create one ──────
    if (!existing && bp.imageBase64) {
      await mkdir(docDir, { recursive: true });
      const padN = String(bp.pageNumber).padStart(3, "0");
      const filename = bp.partIndex > 0
        ? `page-${padN}-part-${bp.partIndex}.png`
        : `page-${padN}.png`;
      const filePath = path.join(docDir, filename);
      await writeFile(filePath, Buffer.from(bp.imageBase64, "base64"));

      const inserted = await db.insert(documentPages).values({
        documentId,
        pageNumber:        bp.pageNumber,
        partIndex:         bp.partIndex,
        rawPngUrl:         filePath,
        imageWidth:        bp.imageWidth ?? undefined,
        imageHeight:       bp.imageHeight ?? undefined,
      }).returning();
      existingPages = await getPagesByDocumentId(documentId); // refresh
      existing = inserted[0];
      pagesCreated++;
    }

    if (!existing) continue; // no page and no image — cannot import this page

    // ── Optionally overwrite the image on an existing page ─────────────────
    if (overwriteImages && bp.imageBase64 && existing.rawPngUrl) {
      try {
        await mkdir(path.dirname(existing.rawPngUrl), { recursive: true });
        await writeFile(existing.rawPngUrl, Buffer.from(bp.imageBase64, "base64"));
      } catch {
        // Log but don't abort the rest of the import
        console.warn(`[importBundle] Failed to write image for page ${bp.pageNumber}`);
      }
    }

    // ── Update pipeline result columns ──────────────────────────────────────
    await db.update(documentPages).set({
      printedPageLabel:  bp.printedPageLabel ?? undefined,
      imageWidth:        bp.imageWidth ?? undefined,
      imageHeight:       bp.imageHeight ?? undefined,
      layoutType:        bp.layoutType ?? undefined,
      contentRegions:    bp.contentRegions as any ?? undefined,
      continuityFlags:   bp.continuityFlags as any ?? undefined,
      structuralBreaks:  bp.structuralBreaks as any ?? undefined,
      pageJsonOutput:    bp.pageJsonOutput as any ?? undefined,
      isFlagged:         bp.isFlagged,
      ocrCompleted:      bp.ocrCompleted,
      ocrConfidence:     bp.ocrConfidence ?? undefined,
      hasEmbeddedText:   bp.hasEmbeddedText,
      detectedRotation:  bp.detectedRotation ?? undefined,
      rotationCorrected: bp.rotationCorrected,
      updatedAt:         new Date(),
    }).where(eq(documentPages.id, existing.id));
    pagesUpdated++;

    // ── Replace OCR result (skip in fill mode if one already exists) ────────
    const existingOcr = fillMode
      ? (await db.select({ id: ocrResults.id }).from(ocrResults).where(eq(ocrResults.pageId, existing.id)).limit(1))[0]
      : null;
    if (bp.ocr && !existingOcr) {
      await db.delete(ocrResults).where(eq(ocrResults.pageId, existing.id));
      await db.insert(ocrResults).values({
        pageId:                  existing.id,
        rawText:                 bp.ocr.rawText ?? undefined,
        markdownText:            bp.ocr.markdownText ?? undefined,
        normalisedText:          bp.ocr.normalisedText ?? undefined,
        nativeSimilarity:        bp.ocr.nativeSimilarity ?? undefined,
        structuredData:          bp.ocr.structuredData as any ?? undefined,
        layoutMetadata:          bp.ocr.layoutMetadata as any ?? undefined,
        confidence:              bp.ocr.confidence ?? 0,
        status:                  bp.ocr.status as any,
        qualityScore:            bp.ocr.qualityScore ?? undefined,
        qualityNotes:            bp.ocr.qualityNotes ?? undefined,
        correctedText:           bp.ocr.correctedText ?? undefined,
        correctedStructuredData: bp.ocr.correctedStructuredData as any ?? undefined,
      });
      ocrUpserted++;
    }
  }

  // ── Replace content summaries (skip entirely in fill mode if any exist) ──
  const existingSummaryCount = fillMode
    ? (await db.select({ id: contentSummaries.id }).from(contentSummaries).where(eq(contentSummaries.documentId, documentId)).limit(1)).length
    : 0;
  if (existingSummaryCount > 0) {
    return { pagesUpdated, pagesCreated, ocrUpserted, summariesCreated: 0 };
  }
  await db.delete(contentSummaries).where(eq(contentSummaries.documentId, documentId));

  // Build a pageNumber → primary page id map (partIndex 0 preferred for FK)
  const finalPages = await getPagesByDocumentId(documentId);
  const primaryPageByNumber = new Map<number, number>();
  for (const p of finalPages) {
    if (p.partIndex === 0 || !primaryPageByNumber.has(p.pageNumber)) {
      primaryPageByNumber.set(p.pageNumber, p.id);
    }
  }
  const fallbackPageId = finalPages[0]?.id ?? 0;

  // First pass: insert without parentId
  const insertedIds: number[] = [];
  for (const bs of bundle.summaries) {
    const startPageId = primaryPageByNumber.get(bs.startPageNumber) ?? fallbackPageId;
    const rows = await db.insert(contentSummaries).values({
      documentId,
      levelType:       bs.levelType,
      headingText:     bs.headingText ?? undefined,
      startPageId,
      startPageNumber: bs.startPageNumber,
      endPageNumber:   bs.endPageNumber ?? undefined,
      shortSummary:    bs.shortSummary ?? undefined,
      longSummary:     bs.longSummary ?? undefined,
      keyTerms:        bs.keyTerms as any,
      keyEntities:     bs.keyEntities as any,
      summaryStatus:   bs.summaryStatus as any,
    }).returning({ id: contentSummaries.id });
    insertedIds.push(rows[0].id);
  }

  // Second pass: wire parentId references
  for (let i = 0; i < bundle.summaries.length; i++) {
    const bs = bundle.summaries[i];
    if (bs.parentBundleIdx != null && insertedIds[bs.parentBundleIdx] != null) {
      await db.update(contentSummaries)
        .set({ parentId: insertedIds[bs.parentBundleIdx] })
        .where(eq(contentSummaries.id, insertedIds[i]));
    }
  }

  return { pagesUpdated, pagesCreated, ocrUpserted, summariesCreated: insertedIds.length };
}
