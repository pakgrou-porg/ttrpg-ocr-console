import { and, asc, desc, eq, gte, ilike, ne, or, sql } from "drizzle-orm";
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
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
  pageProcessingAttempts, InsertPageProcessingAttempt,
  llmProviders, InsertLlmProvider,
  stageInscriptions, InsertStageInscription,
  supabaseInstances, InsertSupabaseInstance,
  promptVersions, InsertPromptVersion,
  gameSystems, InsertGameSystem,
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
    else if (user.openId === ENV.ownerOpenId) { values.role = 'admin'; updateSet.role = 'admin'; }
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

export async function updateUserRole(userId: number, role: "user" | "admin") {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  await db.update(users).set({ role }).where(eq(users.id, userId));
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

Output JSON Schema:
{
  "page_number": "integer",
  "structural_breaks": [
    {
      "break_type": "enum (chapter | section | subsection | appendix | none)",
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
    active: all.filter(j => !["completed", "failed", "queued"].includes(j.status)).length,
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
  const cancellable = ["queued", "converting", "pass1_ocr", "pass2_ocr", "enriching"];
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

// ─── Document Pages ───────────────────────────────────────────────────────────

export async function getPagesByDocumentId(documentId: number) {
  const db = await getDb();
  if (!db) return [];
  return db.select().from(documentPages)
    .where(eq(documentPages.documentId, documentId))
    .orderBy(documentPages.pageNumber);
}

export async function getPageById(id: number) {
  const db = await getDb();
  if (!db) return undefined;
  const result = await db.select().from(documentPages).where(eq(documentPages.id, id)).limit(1);
  return result.length > 0 ? result[0] : undefined;
}

export async function getPageByPhash(phash: string) {
  const db = await getDb();
  if (!db) return undefined;
  const result = await db.select().from(documentPages).where(eq(documentPages.phash, phash)).limit(1);
  return result.length > 0 ? result[0] : undefined;
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
  await db.update(documentPages).set(updates).where(eq(documentPages.id, id));
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

export async function getAllHitlItems(options?: { status?: string; priority?: string; limit?: number; offset?: number; orderByPriority?: boolean }) {
  const db = await getDb();
  if (!db) return [];
  const conditions = [];
  if (options?.status) conditions.push(eq(hitlQueue.status, options.status as any));
  if (options?.priority) conditions.push(eq(hitlQueue.priority, options.priority as any));

  const order = options?.orderByPriority
    ? [asc(priorityRank), asc(hitlQueue.createdAt)]
    : [desc(hitlQueue.createdAt)];

  const baseQuery = db.select().from(hitlQueue);
  const filtered = conditions.length > 0 ? baseQuery.where(and(...conditions)) : baseQuery;
  return filtered
    .orderBy(...order)
    .limit(options?.limit ?? 100)
    .offset(options?.offset ?? 0);
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

export async function getHitlStats() {
  const db = await getDb();
  if (!db) return { total: 0, queued: 0, inProgress: 0, resolved: 0, skipped: 0, escalated: 0, byCritical: 0, byHigh: 0, byMedium: 0, byLow: 0 };
  const all = await db.select().from(hitlQueue);
  return {
    total: all.length,
    queued: all.filter(i => i.status === "queued").length,
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
