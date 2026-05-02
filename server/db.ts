import { and, asc, eq, gte } from "drizzle-orm";
import { drizzle } from "drizzle-orm/mysql2";
import { desc, sql } from "drizzle-orm";
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
  modelAssignments, InsertModelAssignment,
  dbConnections, InsertDbConnection,
} from "../drizzle/schema";
import { ENV } from './_core/env';

let _db: ReturnType<typeof drizzle> | null = null;

export async function getDb() {
  if (!_db && process.env.DATABASE_URL) {
    try {
      _db = drizzle(process.env.DATABASE_URL);
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
    const updateSet: Record<string, unknown> = {};
    const textFields = ["name", "email", "loginMethod"] as const;
    type TextField = (typeof textFields)[number];
    const assignNullable = (field: TextField) => {
      const value = user[field];
      if (value === undefined) return;
      const normalized = value ?? null;
      values[field] = normalized;
      updateSet[field] = normalized;
    };
    textFields.forEach(assignNullable);
    if (user.lastSignedIn !== undefined) { values.lastSignedIn = user.lastSignedIn; updateSet.lastSignedIn = user.lastSignedIn; }
    if (user.role !== undefined) { values.role = user.role; updateSet.role = user.role; }
    else if (user.openId === ENV.ownerOpenId) { values.role = 'admin'; updateSet.role = 'admin'; }
    if (!values.lastSignedIn) values.lastSignedIn = new Date();
    if (Object.keys(updateSet).length === 0) updateSet.lastSignedIn = new Date();
    await db.insert(users).values(values).onDuplicateKeyUpdate({ set: updateSet });
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
  await db.insert(userProfiles).values(profile).onDuplicateKeyUpdate({ set: updateSet });
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
  // Check if a record already exists for this user+featureArea
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

export async function upsertSystemPrompt(prompt: InsertSystemPrompt) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  await db.insert(systemPrompts).values(prompt).onDuplicateKeyUpdate({
    set: {
      promptText: prompt.promptText,
      description: prompt.description,
      version: prompt.version,
    },
  });
}

export async function seedDefaultPrompts() {
  const db = await getDb();
  if (!db) return;

  const defaults: InsertSystemPrompt[] = [
    {
      name: "pass1_layout_analysis",
      category: "pipeline",
      description: "Instructions for the local VLM to identify layout bounding boxes and element types.",
      promptText: `You are an expert document layout analyzer for TTRPG (Tabletop Role-Playing Game) materials. Your task is to analyze the provided image and identify all distinct visual elements.

For each element, output a JSON object with:
- "type": one of ["heading", "body_text", "table", "stat_block", "image", "sidebar", "footer", "page_number", "decorative"]
- "bbox": [x1, y1, x2, y2] as percentages of image dimensions (0-100)
- "confidence": float 0.0-1.0
- "reading_order": integer starting from 1

Return a JSON array of all detected elements. Focus on accuracy over speed.`,
      version: 1,
    },
    {
      name: "pass2_content_extraction",
      category: "pipeline",
      description: "Instructions for cloud LLMs to extract structured JSON from TTRPG page content.",
      promptText: `You are an expert TTRPG data extractor. Given an image of a TTRPG rulebook or sourcebook page and its layout metadata, extract all content into structured JSON.

Rules:
1. Preserve ALL text exactly as written, including special characters and formatting.
2. For stat blocks, extract every field (AC, HP, Speed, Abilities, Actions, etc.).
3. For tables, preserve row/column structure as a 2D array.
4. For spells, extract: name, level, school, casting_time, range, components, duration, description.
5. Assign a "content_type" to each block: ["creature", "spell", "item", "rule", "lore", "table", "other"].
6. Include a "confidence" score (0.0-1.0) for each extracted block.

Return a JSON object with a "blocks" array containing all extracted content.`,
      version: 1,
    },
    {
      name: "referee_consensus",
      category: "pipeline",
      description: "Instructions for the adversarial referee model that resolves multi-model discrepancies.",
      promptText: `You are an impartial referee evaluating OCR extraction results from multiple AI models for TTRPG content.

You will receive:
- The source image
- Multiple JSON extraction results from different models
- A diff highlighting discrepancies

Your task:
1. Identify which model produced the most accurate extraction for each discrepancy.
2. Produce a merged, consensus JSON that takes the best from each model.
3. Flag any fields where confidence is below 0.7 for human review.
4. Output a "consensus_score" (0.0-1.0) indicating overall extraction quality.

Be especially careful with: numerical stats, proper nouns, spell names, and special abilities.`,
      version: 1,
    },
    {
      name: "voice_of_arkanum",
      category: "console_experience",
      description: "Instructions for the AI that generates random lore ramblings and thematic knowledge snippets.",
      promptText: `You are the Voice of the Arkanum — an ancient, slightly eccentric arcane intelligence that has absorbed the lore of countless TTRPG sourcebooks. You speak with wisdom, dry wit, and occasional dramatic flair.

When asked to "ramble", you will:
1. Select a random topic from the knowledge base (creatures, spells, locations, factions, history, magic items, etc.)
2. Share 2-4 sentences of interesting, accurate lore about that topic
3. Include at least one surprising or lesser-known detail
4. End with a cryptic or philosophical observation

Tone: Scholarly but approachable. Think "wise old wizard who has read everything and finds most things mildly amusing."
Format: Plain prose, no headers or bullet points. Maximum 150 words.`,
      version: 1,
    },
    {
      name: "arkanum_search",
      category: "console_experience",
      description: "Instructions for the AI that interprets natural language search queries against the lore database.",
      promptText: `You are the Arkanum's search oracle. Users will ask questions in natural language about TTRPG content.

Your task:
1. Parse the user's intent and identify: entity_type, filters, sort_preference
2. Convert to a structured query object
3. If the query is ambiguous, provide the most likely interpretation AND note alternatives

Output JSON:
{
  "interpreted_query": "human-readable interpretation",
  "entity_types": ["creature", "spell", "item", "rule", "lore"],
  "filters": { "game_system": null, "cr_min": null, "cr_max": null, "tags": [] },
  "sort_by": "relevance",
  "confidence": 0.0-1.0,
  "alternatives": []
}`,
      version: 1,
    },
  ];

  for (const prompt of defaults) {
    const existing = await getSystemPromptByName(prompt.name);
    if (!existing) {
      await db.insert(systemPrompts).values(prompt);
    }
  }
}

// ─── System Config ───────────────────────────────────────────────────────────

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
  await db.insert(systemConfig).values(config).onDuplicateKeyUpdate({
    set: { value: config.value, updatedBy: config.updatedBy },
  });
}

export async function deleteSystemConfig(key: string) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  await db.delete(systemConfig).where(eq(systemConfig.key, key));
}

// ─── Ingestion Jobs ──────────────────────────────────────────────────────────

export async function getAllIngestionJobs() {
  const db = await getDb();
  if (!db) return [];
  return db.select().from(ingestionJobs).orderBy(desc(ingestionJobs.createdAt)).limit(100);
}

export async function getActiveIngestionJobs() {
  const db = await getDb();
  if (!db) return [];
  return db.select().from(ingestionJobs)
    .where(
      and(
        sql`${ingestionJobs.status} != 'completed'`,
        sql`${ingestionJobs.status} != 'failed'`
      )
    )
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
  const result = await db.insert(ingestionJobs).values(job);
  return result[0].insertId;
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

// ─── Telemetry Events ────────────────────────────────────────────────────────

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

// ─── Health Check (DB ping) ──────────────────────────────────────────────────

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

// ─── LLM Providers ──────────────────────────────────────────────────────────



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
  const result = await db.insert(llmProviders).values(provider);
  return result[0].insertId;
}

export async function updateLlmProvider(id: number, updates: Partial<InsertLlmProvider>) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  await db.update(llmProviders).set(updates).where(eq(llmProviders.id, id));
}

export async function deleteLlmProvider(id: number) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  // Also delete any model assignments for this provider
  await db.delete(modelAssignments).where(eq(modelAssignments.providerId, id));
  await db.delete(llmProviders).where(eq(llmProviders.id, id));
}

// ─── Model Assignments ──────────────────────────────────────────────────────

export async function getAllModelAssignments() {
  const db = await getDb();
  if (!db) return [];
  return db.select().from(modelAssignments).orderBy(modelAssignments.pipelineStage, modelAssignments.priority);
}

export async function getModelAssignmentsByStage(stage: string) {
  const db = await getDb();
  if (!db) return [];
  return db.select().from(modelAssignments)
    .where(eq(modelAssignments.pipelineStage, stage))
    .orderBy(modelAssignments.priority);
}

export async function createModelAssignment(assignment: InsertModelAssignment) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  const result = await db.insert(modelAssignments).values(assignment);
  return result[0].insertId;
}

export async function updateModelAssignment(id: number, updates: Partial<InsertModelAssignment>) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  await db.update(modelAssignments).set(updates).where(eq(modelAssignments.id, id));
}

export async function deleteModelAssignment(id: number) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  await db.delete(modelAssignments).where(eq(modelAssignments.id, id));
}

// ─── Database Connections ───────────────────────────────────────────────────

export async function getAllDbConnections() {
  const db = await getDb();
  if (!db) return [];
  return db.select().from(dbConnections).orderBy(dbConnections.name);
}

export async function getDbConnectionById(id: number) {
  const db = await getDb();
  if (!db) return undefined;
  const result = await db.select().from(dbConnections).where(eq(dbConnections.id, id)).limit(1);
  return result.length > 0 ? result[0] : undefined;
}

export async function createDbConnection(connection: InsertDbConnection) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  const result = await db.insert(dbConnections).values(connection);
  return result[0].insertId;
}

export async function updateDbConnection(id: number, updates: Partial<InsertDbConnection>) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  await db.update(dbConnections).set(updates).where(eq(dbConnections.id, id));
}

export async function deleteDbConnection(id: number) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  await db.delete(dbConnections).where(eq(dbConnections.id, id));
}

export async function setActiveDbConnection(id: number) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  // Deactivate all connections first
  await db.update(dbConnections).set({ isActive: false }).where(sql`1=1`);
  // Activate the selected one
  await db.update(dbConnections).set({ isActive: true }).where(eq(dbConnections.id, id));
}

// ─── Documents (Library Shelves) ────────────────────────────────────────────

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
  const result = await db.insert(documents).values(doc);
  const insertId = result[0].insertId;
  const [created] = await db.select().from(documents).where(eq(documents.id, insertId));
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
  // P1: Wrap cascade delete in a transaction to prevent partial deletion
  // if a concurrent write reinserts related rows during deletion.
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
    .where(sql`${documents.title} LIKE ${pattern} OR ${documents.filename} LIKE ${pattern} OR ${documents.gameSystem} LIKE ${pattern}`)
    .orderBy(desc(documents.createdAt))
    .limit(50);
}

// ─── Document Pages ─────────────────────────────────────────────────────────

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
  const result = await db.insert(documentPages).values(page);
  const newId = result[0].insertId;
  const created = await db.select().from(documentPages).where(eq(documentPages.id, newId)).limit(1);
  return created[0]!;
}

export async function updateDocumentPage(id: number, updates: Partial<InsertDocumentPage>) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  await db.update(documentPages).set(updates).where(eq(documentPages.id, id));
}

// ─── OCR Results ────────────────────────────────────────────────────────────

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

export async function createOcrResult(ocrResult: InsertOcrResult) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  const result = await db.insert(ocrResults).values(ocrResult);
  const newId = result[0].insertId;
  const created = await db.select().from(ocrResults).where(eq(ocrResults.id, newId)).limit(1);
  return created[0]!;
}

export async function updateOcrResult(id: number, updates: Partial<InsertOcrResult>) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  await db.update(ocrResults).set(updates).where(eq(ocrResults.id, id));
}

// ─── HITL Queue ─────────────────────────────────────────────────────────────

const PRIORITY_ORDER: Record<string, number> = { critical: 0, high: 1, medium: 2, low: 3 };

export async function getAllHitlItems(options?: { status?: string; priority?: string; limit?: number; orderByPriority?: boolean }) {
  const db = await getDb();
  if (!db) return [];
  const conditions = [];
  if (options?.status) conditions.push(eq(hitlQueue.status, options.status as any));
  if (options?.priority) conditions.push(eq(hitlQueue.priority, options.priority as any));

  const query = db.select().from(hitlQueue);
  let results: any[];
  if (conditions.length > 0) {
    results = await query.where(and(...conditions)).orderBy(asc(hitlQueue.createdAt)).limit(options?.limit ?? 100);
  } else {
    results = await query.orderBy(desc(hitlQueue.createdAt)).limit(options?.limit ?? 100);
  }
  if (options?.orderByPriority) {
    results = results.sort((a, b) => {
      const pa = PRIORITY_ORDER[a.priority] ?? 99;
      const pb = PRIORITY_ORDER[b.priority] ?? 99;
      if (pa !== pb) return pa - pb;
      return new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime();
    });
    if (options.limit) results = results.slice(0, options.limit);
  }
  return results;
}

export async function getHitlItemById(id: number) {
  const db = await getDb();
  if (!db) return undefined;
  const result = await db.select().from(hitlQueue).where(eq(hitlQueue.id, id)).limit(1);
  return result.length > 0 ? result[0] : undefined;
}

export async function getHitlItemsByPageId(pageId: number) {
  const db = await getDb();
  if (!db) return [];
  return db.select().from(hitlQueue).where(eq(hitlQueue.pageId, pageId)).orderBy(desc(hitlQueue.createdAt));
}

export async function createHitlItem(item: InsertHitlQueueItem) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  const result = await db.insert(hitlQueue).values(item);
  const newId = result[0].insertId;
  const created = await db.select().from(hitlQueue).where(eq(hitlQueue.id, newId)).limit(1);
  return created[0]!;
}

export async function updateHitlItem(id: number, updates: Partial<InsertHitlQueueItem>) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  await db.update(hitlQueue).set(updates).where(eq(hitlQueue.id, id));
}

// ─── Page Processing Attempts ───────────────────────────────────────────────

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
  const result = await db.insert(pageProcessingAttempts).values(attempt);
  const newId = result[0].insertId;
  const created = await db.select().from(pageProcessingAttempts).where(eq(pageProcessingAttempts.id, newId)).limit(1);
  return created[0]!;
}

export async function updatePageProcessingAttempt(id: number, updates: Partial<InsertPageProcessingAttempt>) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  await db.update(pageProcessingAttempts).set(updates).where(eq(pageProcessingAttempts.id, id));
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
