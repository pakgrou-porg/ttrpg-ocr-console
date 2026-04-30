import { eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/mysql2";
import { InsertUser, users, userProfiles, systemPrompts, InsertUserProfile, InsertSystemPrompt } from "../drizzle/schema";
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
  if (profile.savedEntries !== undefined) updateSet.savedEntries = profile.savedEntries;
  if (profile.savedGroups !== undefined) updateSet.savedGroups = profile.savedGroups;
  await db.insert(userProfiles).values(profile).onDuplicateKeyUpdate({ set: updateSet });
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

export async function updateSystemPromptText(name: string, promptText: string) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  await db.update(systemPrompts)
    .set({ promptText, version: db.$count(systemPrompts) })
    .where(eq(systemPrompts.name, name));
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
