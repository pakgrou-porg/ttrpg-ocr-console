import { and, eq, gte } from "drizzle-orm";
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

import { llmProviders, InsertLlmProvider, modelAssignments, InsertModelAssignment, dbConnections, InsertDbConnection } from "../drizzle/schema";

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
