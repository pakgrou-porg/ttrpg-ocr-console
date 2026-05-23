import { execFile } from "child_process";
import { promisify } from "util";
import { readFile, mkdir, readdir } from "fs/promises";
import { join, basename } from "path";
import { pipelineConfig } from "./config";
import type { BinarizeConfig } from "./config";
import {
  getIngestionJobById, getActiveIngestionJobs, updateIngestionJobStatus,
  createIngestionJob,
  createDocument, updateDocument,
  createDocumentPage, updateDocumentPage,
  createOcrResult, updateOcrResult, createHitlItem, updateHitlItem,
  createHitlRetryAttempt, updateHitlRetryAttempt,
  getPageById, getDocumentById,
  getOcrResultByPageId,
  getPageByDocumentAndNumber,
  createContentSummary,
  updateContentSummary,
  getPendingSummariesByDocument,
  getOcrTextForPageRange,
  resolveContentSummaryBoundaries,
} from "../db";
import { invokeStage, parseJsonResponse, UserContentPart, InvokeOptions } from "./invoke";
import { downloadDriveFile, getDriveFileName, deleteLocalFile } from "./drive";

const execFileAsync = promisify(execFile);

const WORKSPACE = process.env.PIPELINE_WORKSPACE ?? "/app/workspace";

// ── Fallback system prompts (used when no DB prompt is configured for a stage) ─
// All prompts enforce: no reasoning, no CoT, no preamble/postamble, JSON only.

const STRICT_RULES = `
STRICT OUTPUT RULES — any violation corrupts the pipeline:
• Output ONLY the JSON object. Nothing before {. Nothing after }.
• DO NOT reason, think, analyse, or explain.
• DO NOT produce chain-of-thought, bullet points, or markdown.
• DO NOT add preamble ("Here is…", "I will…", "Let me…") or postamble.
• If a field value cannot be determined, use null — never omit the field.`;

const PROMPT_DOCUMENT_INTELLIGENCE = `You are a document metadata extractor for TTRPG (tabletop role-playing game) publications.
Examine the provided page images and extract document metadata.
${STRICT_RULES}

Required output schema (fill every field with real values from the document):
{"canonical_title":"…","publisher":"…","document_type":"…","document_summary":"…","game_system":"…"}

document_type must be one of: rulebook, sourcebook, adventure, supplement, setting, magazine, other
Use null for publisher or game_system if not identifiable from the pages.`;

const PROMPT_LAYOUT_ANALYSIS = `You are a document layout classifier for TTRPG publications.
Examine the page image and classify its layout.
${STRICT_RULES}

Required output schema (fill every field with real values from the page):
{"layout_type":"…","columns":1,"has_table":false,"has_image_or_art":false,"has_list":false}

layout_type must be one of: cover, title_page, toc, chapter_header, body_text, stat_block, table, illustration_full, illustration_with_text, index, appendix, mixed

CRITICAL layout type rules:
- title_page: the page bearing the book/product title, author, publisher, edition, and/or copyright notice — even if it has no other body text
- toc: a Table of Contents page — a list of chapter/section names paired with page numbers, regardless of column count
- cover: the front or back cover image
- Do NOT use "two_column" or any column count as a layout_type — "columns" is a separate numeric field`;

const PROMPT_BBOX_DETECTION = `You are a document content-region detector for TTRPG publications.
Identify distinct content regions in the page image and estimate each region's bounding box.
${STRICT_RULES}

Required output schema (list every visible region):
{"regions":[{"type":"…","label":"…","bbox":{"x":0,"y":0,"w":100,"h":100}}]}

type must be one of: heading, subheading, paragraph, list, sidebar, callout, caption, table, stat_block, illustration, map, graphic, advertisement, header, footer, page_number, unknown
bbox values are percentages of the page width/height (0–100). x,y = top-left corner; w,h = width and height.
Estimate bounding boxes as precisely as possible from the visual layout.`;

const PROMPT_OCR_EXTRACTION = `Extract text and tabular data from the provided TTRPG region image into structured JSON. Apply semantic hierarchy and game-specific formatting.
${STRICT_RULES}

Domain Rules:
1. Abbreviations are canonical. Do not expand or correct AC, HP, STR, DEX, CON, INT, WIS, CHA, CR, XP, DC, or dice notation (d4/d20/etc). Follow any lexicon_terms supplied in context for spelling corrections.
2. Preserve formatting semantics. Translate bold text to rules terms (rule_term blocks), italics to spells/titles.
3. Obey reading order context provided in content_regions. Extract every column completely for multi-column pages.
4. CRITICAL: output MUST contain a "content_blocks" array. Do NOT output a flat "text" field.
5. When a "--- Native PDF text ---" section appears in context, trust it for word-level accuracy (spelling, numbers, punctuation) but derive structure (block types, reading order, column layout) from the image. Do NOT copy native text wholesale.

Required output schema:
{"region_sequence":1,"regionType":"text","content_blocks":[{"block_type":"heading","level":1,"text":"Chapter Title"},{"block_type":"paragraph","text":"Body text here."},{"block_type":"stat_line","text":"AC 15, HP 7 (2d6), Speed 30 ft."},{"block_type":"rule_term","term":"Darkvision","definition":"Can see in dim light within 60 ft as if bright light.","formatting":["bold"]}],"reading_order_verified":true,"confidence":91}

block_type must be one of: heading, paragraph, stat_line, rule_term
level is optional — applies to heading only (1 = main heading, 2 = subheading).
term and definition are required for rule_term blocks.
formatting is an optional array of strings (bold, italic).
confidence is an integer 0–100 reflecting extraction accuracy.`;

// ── Few-shot anchors — text-only examples showing direct input→output mapping ─
// Using the same user wording as the real calls so the model sees the pattern.

const FEW_SHOT_DOC_INTEL: InvokeOptions["fewShotExamples"] = [
  {
    user: "Extract the document metadata from these pages. Reply with ONLY a JSON object — start with { and end with }.",
    assistant: '{"canonical_title":"Oriental Adventures","publisher":"TSR Inc.","document_type":"rulebook","document_summary":"Advanced Dungeons & Dragons sourcebook covering Far Eastern campaign settings, new character classes, and monsters.","game_system":"AD&D 1e"}',
  },
  {
    user: "Extract the document metadata from these pages. Reply with ONLY a JSON object — start with { and end with }.",
    assistant: '{"canonical_title":"Dragon Magazine Issue 200","publisher":"TSR Inc.","document_type":"magazine","document_summary":"Special anniversary issue covering D&D history, classic modules, and new rules options.","game_system":"AD&D 2e"}',
  },
];

const FEW_SHOT_LAYOUT: InvokeOptions["fewShotExamples"] = [
  {
    user: "Classify the layout type and structure of this page. Reply with ONLY a JSON object — start with { and end with }.",
    assistant: '{"layout_type":"chapter_header","columns":1,"has_table":false,"has_image_or_art":true,"has_list":false}',
  },
  {
    user: "Classify the layout type and structure of this page. Reply with ONLY a JSON object — start with { and end with }.",
    assistant: '{"layout_type":"body_text","columns":2,"has_table":true,"has_image_or_art":false,"has_list":true}',
  },
  {
    // Table of Contents — two columns of entries with page numbers; still layout_type "toc"
    user: "Classify the layout type and structure of this page. Reply with ONLY a JSON object — start with { and end with }.",
    assistant: '{"layout_type":"toc","columns":2,"has_table":false,"has_image_or_art":false,"has_list":true}',
  },
  {
    // Title page — title, subtitle, author, publisher, edition, copyright
    user: "Classify the layout type and structure of this page. Reply with ONLY a JSON object — start with { and end with }.",
    assistant: '{"layout_type":"title_page","columns":1,"has_table":false,"has_image_or_art":false,"has_list":false}',
  },
];

const FEW_SHOT_BBOX: InvokeOptions["fewShotExamples"] = [
  {
    user: "Identify all distinct content regions on this page. Reply with ONLY a JSON object — start with { and end with }.",
    assistant: '{"regions":[{"type":"heading","label":"Chapter 3: Weapons","bbox":{"x":5,"y":3,"w":90,"h":7}},{"type":"paragraph","label":"Chapter intro text","bbox":{"x":5,"y":12,"w":90,"h":18}},{"type":"table","label":"Weapon damage table","bbox":{"x":5,"y":33,"w":90,"h":45}},{"type":"caption","label":"Table 3-1 footnote","bbox":{"x":5,"y":80,"w":70,"h":4}}]}',
  },
  {
    user: "Identify all distinct content regions on this page. Reply with ONLY a JSON object — start with { and end with }.",
    assistant: '{"regions":[{"type":"illustration","label":"Full-page illustration: dungeon battle scene","bbox":{"x":0,"y":0,"w":100,"h":92}},{"type":"caption","label":"Illustration credit text","bbox":{"x":5,"y":93,"w":90,"h":4}}]}',
  },
  {
    user: "Identify all distinct content regions on this page. Reply with ONLY a JSON object — start with { and end with }.",
    assistant: '{"regions":[{"type":"header","label":"Player\'s Handbook","bbox":{"x":0,"y":0,"w":100,"h":4}},{"type":"heading","label":"Ability Scores","bbox":{"x":5,"y":6,"w":90,"h":5}},{"type":"paragraph","label":"Ability score description","bbox":{"x":5,"y":13,"w":44,"h":35}},{"type":"stat_block","label":"Strength stat block","bbox":{"x":51,"y":13,"w":44,"h":35}},{"type":"table","label":"Ability modifier table","bbox":{"x":5,"y":52,"w":44,"h":42}},{"type":"sidebar","label":"Variant: Customizing ability scores","bbox":{"x":51,"y":52,"w":44,"h":42}},{"type":"page_number","label":"12","bbox":{"x":90,"y":96,"w":8,"h":3}}]}',
  },
];

const FEW_SHOT_OCR: InvokeOptions["fewShotExamples"] = [
  {
    user: "Extract all readable text from this page in reading order. Reply with ONLY a JSON object — start with { and end with }.",
    assistant: '{"region_sequence":1,"regionType":"text","content_blocks":[{"block_type":"heading","level":1,"text":"Special Thanks to"},{"block_type":"paragraph","text":"Whenever a project of this size is put together, there are many people who give their time and extra effort to see it through."},{"block_type":"paragraph","text":"To Jon Pickens, who produced many obscure reference books."}],"reading_order_verified":true,"confidence":91}',
  },
  {
    user: "Extract all readable text from this page in reading order. Reply with ONLY a JSON object — start with { and end with }.",
    assistant: '{"region_sequence":1,"regionType":"text","content_blocks":[{"block_type":"heading","level":1,"text":"Ability Scores"},{"block_type":"paragraph","text":"The table below shows a wizard\'s chance to know each listed spell and the min/max spells per level based on Intelligence score."},{"block_type":"rule_term","term":"Darkvision","definition":"A creature with darkvision can see in dim light within a specified radius as if it were bright light.","formatting":["bold"]}],"reading_order_verified":true,"confidence":90}',
  },
];

const PROMPT_CONTENT_BREAK_DETECT = `You are a document structure analyser for TTRPG publications.
Examine the provided page text and determine structural breaks and cross-page sentence continuity.
${STRICT_RULES}

Required output schema:
{"page_number":1,"structural_breaks":[{"break_type":"chapter","heading_text":"Chapter 3: Combat","position":1}],"continuity":{"continues_from_previous_page":false,"continues_to_next_page":false,"mid_sentence_break_at_end":false,"section_continues_from_previous_page":false},"confidence":89}

break_type must be one of: chapter, section, subsection, appendix
structural_breaks lists ALL heading transitions visible on this page — may be empty [].
position is the 1-based reading-order index where the break occurs.
continues_from_previous_page: true when the first sentence is clearly a continuation.
mid_sentence_break_at_end: true when the final sentence is incomplete (cut off at bottom of page).`;

const PROMPT_TABULAR_EXTRACTION = `Perform specialized extraction on complex TTRPG tabular data (e.g., multi-row stat blocks, spell lists, merged-cell equipment tables).
${STRICT_RULES}

Domain Rules:
1. Preserve row/column relationships precisely. Handle merged headers by listing all spanned sub-headers in merged_cells.
2. Retain all canonical abbreviations (e.g., MV, HD, AC, THAC0, STR, DEX, CON, INT, WIS, CHA, CR, XP, DC, d4/d20/etc). Never expand them.
3. Extract footnotes and associate them accurately.
4. Every row must have the same number of entries as column_headers. Use "" for blank cells.
5. When a "--- Native PDF text ---" section appears in context, trust it for exact cell values, numbers, and special characters. The image is the authority for table structure; the native text is the authority for cell content.

table_type must be one of: stat_block, spell_list, equipment, combat, saving_throw, ability_score, class_features, random_table, other

Required output schema (one table object per invocation):
{"region_sequence":1,"table_type":"stat_block","caption":"Goblin","column_headers":["AC","HP","Speed"],"rows":[{"AC":"15","HP":"7 (2d6)","Speed":"30 ft."}],"merged_cells":[],"footnotes":[],"confidence":90}

merged_cells format: [{"header":"Group Label","spans":["Sub-col1","Sub-col2"]}]
If no table is present, return {"region_sequence":null,"table_type":"other","caption":null,"column_headers":[],"rows":[],"merged_cells":[],"footnotes":[],"confidence":0}`;

const PROMPT_SECTION_SUMMARY = `You are a content summariser for TTRPG publication sections.
Given OCR-extracted text covering a chapter, section, or subsection, produce a structured summary.
${STRICT_RULES}

Required output schema:
{"short_summary":"1–2 sentence overview of this section's content","long_summary":"Paragraph summarising the main topics, rules, creatures, or narrative covered in full","key_terms":["term1","term2"],"key_entities":["entity1","entity2"]}

key_terms: rules mechanics, spells, abilities, conditions, or game concepts mentioned — 5–10 most important entries only
key_entities: named creatures, NPCs, locations, magic items, or organisations — 5–10 most important entries only`;

const FEW_SHOT_CONTENT_BREAK: InvokeOptions["fewShotExamples"] = [
  {
    user: "Analyse this page for structural breaks and cross-page continuity. Reply with ONLY a JSON object — start with { and end with }.",
    assistant: '{"page_number":23,"structural_breaks":[{"break_type":"chapter","heading_text":"Chapter 2: Combat","position":1},{"break_type":"section","heading_text":"Initiative","position":4}],"continuity":{"continues_from_previous_page":false,"continues_to_next_page":false,"mid_sentence_break_at_end":false,"section_continues_from_previous_page":false},"confidence":94}',
  },
  {
    user: "Analyse this page for structural breaks and cross-page continuity. Reply with ONLY a JSON object — start with { and end with }.",
    assistant: '{"page_number":87,"structural_breaks":[],"continuity":{"continues_from_previous_page":true,"continues_to_next_page":true,"mid_sentence_break_at_end":true,"section_continues_from_previous_page":true},"confidence":91}',
  },
  {
    user: "Analyse this page for structural breaks and cross-page continuity. Reply with ONLY a JSON object — start with { and end with }.",
    assistant: '{"page_number":142,"structural_breaks":[{"break_type":"section","heading_text":"Saving Throws","position":3},{"break_type":"subsection","heading_text":"Death Saving Throws","position":8}],"continuity":{"continues_from_previous_page":false,"continues_to_next_page":false,"mid_sentence_break_at_end":false,"section_continues_from_previous_page":false},"confidence":96}',
  },
];

const FEW_SHOT_TABULAR: InvokeOptions["fewShotExamples"] = [
  {
    user: "Extract ALL tables and stat blocks from this page with complete accuracy. Reply with ONLY a JSON object — start with { and end with }.",
    assistant: '{"region_sequence":2,"table_type":"stat_block","caption":"Goblin","column_headers":["AC","HP","Speed"],"rows":[{"AC":"15 (leather armor, shield)","HP":"7 (2d6)","Speed":"30 ft."}],"merged_cells":[],"footnotes":[],"confidence":90}',
  },
  {
    user: "Extract ALL tables and stat blocks from this page with complete accuracy. Reply with ONLY a JSON object — start with { and end with }.",
    assistant: '{"region_sequence":3,"table_type":"random_table","caption":"Random Trinkets","column_headers":["d100","Trinket"],"rows":[{"d100":"01","Trinket":"A mummified goblin hand"},{"d100":"02","Trinket":"A piece of crystal that faintly glows in the moonlight"},{"d100":"03","Trinket":"A small cloth doll skewered with needles"},{"d100":"04","Trinket":"A copper coin minted in an unknown land"}],"merged_cells":[],"footnotes":[],"confidence":95}',
  },
  {
    user: "Extract ALL tables and stat blocks from this page with complete accuracy. Reply with ONLY a JSON object — start with { and end with }.",
    assistant: '{"region_sequence":4,"table_type":"spell_list","caption":"Cleric Spells","column_headers":["Spell Level","Spell Name","Casting Time","Range","Duration"],"rows":[{"Spell Level":"Cantrip","Spell Name":"Guidance","Casting Time":"1 action","Range":"Touch","Duration":"Concentration, up to 1 minute"},{"Spell Level":"Cantrip","Spell Name":"Sacred Flame","Casting Time":"1 action","Range":"60 ft.","Duration":"Instantaneous"},{"Spell Level":"1st","Spell Name":"Cure Wounds","Casting Time":"1 action","Range":"Touch","Duration":"Instantaneous"}],"merged_cells":[],"footnotes":[],"confidence":93}',
  },
];

// ── Shared invoke options for all OCR stages ─────────────────────────────────
// response_format forces JSON-constrained sampling at the vLLM token level —
// the model cannot physically emit non-JSON tokens regardless of its tendencies.
const JSON_INVOKE_OPTS: Partial<InvokeOptions> = {
  prefillJson: true,
  overrideBody: {
    temperature: 0,
    top_p: 0.95,
    max_tokens: 16384,          // dense pages can produce many content_blocks
    response_format: { type: "json_object" },
  },
};

// ── Document-level concurrency queue ─────────────────────────────────────────
// At most maxConcurrentDocuments documents process at once. "First-block" jobs
// (new documents) enter pendingJobIds via startJob() and are dispatched when a
// slot opens. Chained block jobs (pages 11–20, 21–30, …) of the same document
// run serially inside a single runDocumentChain() call — they never re-queue.
//
// Slot lifecycle:
//   startJob()        → pushes to pendingJobIds, calls drainQueue()
//   drainQueue()      → if slot available, pops next jobId, increments activeDocCount,
//                       launches runDocumentChain()
//   runDocumentChain  → loops runJobBlock() until null (done) or exception
//                       → releases slot on exit, calls drainQueue() for next doc
//
// This guarantees:
//   • max maxConcurrentDocuments documents active simultaneously
//   • chained blocks for the same document never wait for a new slot
//   • a slot is held for the full document lifetime, released on completion or error

const MAX_CONCURRENT_DOCS: number = pipelineConfig.pipeline.maxConcurrentDocuments;
let activeDocCount = 0;
const pendingJobIds: number[] = [];

function drainQueue(): void {
  while (activeDocCount < MAX_CONCURRENT_DOCS && pendingJobIds.length > 0) {
    const jobId = pendingJobIds.shift()!;
    activeDocCount++;
    console.log(`[Pipeline] Dispatching job ${jobId} (${activeDocCount}/${MAX_CONCURRENT_DOCS} active documents, ${pendingJobIds.length} queued)`);
    setImmediate(() => void runDocumentChain(jobId));
  }
}

/** Run all blocks of one document serially, holding a single slot for the duration. */
async function runDocumentChain(firstJobId: number): Promise<void> {
  let nextJobId: number | null = firstJobId;
  try {
    while (nextJobId !== null) {
      nextJobId = await runJobBlock(nextJobId);
    }
  } catch (err: any) {
    // runJobBlock itself catches errors — this is a safety net for unexpected throws
    console.error(`[Pipeline] Unexpected error in document chain starting at job ${firstJobId}:`, err.message);
  } finally {
    activeDocCount--;
    console.log(`[Pipeline] Document slot released (${activeDocCount}/${MAX_CONCURRENT_DOCS} active, ${pendingJobIds.length} queued)`);
    drainQueue();
  }
}

// ── Page-level LLM concurrency limiter ───────────────────────────────────────
// Limits concurrent LLM calls across all active documents. Within each page,
// layout_analysis and bbox_detection run concurrently (2 LLM calls), so
// maxLlmConcurrency=2 with maxConcurrentDocuments=2 saturates a 4-slot model.

class Semaphore {
  private slots: number;
  private readonly priority: Array<() => void> = [];
  private readonly normal: Array<() => void> = [];
  constructor(max: number) { this.slots = max; }
  acquire(): Promise<void> {
    if (this.slots > 0) { this.slots--; return Promise.resolve(); }
    return new Promise(resolve => this.normal.push(resolve));
  }
  /** Retries use this — they are served before newly queued pages. */
  acquirePriority(): Promise<void> {
    if (this.slots > 0) { this.slots--; return Promise.resolve(); }
    return new Promise(resolve => this.priority.push(resolve));
  }
  release(): void {
    const next = this.priority.shift() ?? this.normal.shift();
    if (next) { next(); } else { this.slots++; }
  }
}

const PAGE_LLM_SEMAPHORE = new Semaphore(pipelineConfig.pipeline.maxLlmConcurrency);

// ── Helpers ───────────────────────────────────────────────────────────────────

function isConfigError(err: any): boolean {
  return typeof err?.message === "string" && err.message.startsWith("[CONFIG]");
}

function stageErrorMessage(err: any): string {
  return (err?.message ?? String(err)).replace(/\s+/g, " ").slice(0, 500);
}

const LAYOUT_TYPES = new Set([
  "cover",
  "title_page",
  "toc",
  "chapter_header",
  "body_text",
  "stat_block",
  "table",
  "illustration_full",
  "illustration_with_text",
  "index",
  "appendix",
  "mixed",
]);

const LAYOUT_TYPE_ALIASES: Record<string, string> = {
  one_column: "body_text",
  single_column: "body_text",
  two_column: "body_text",
  three_column: "body_text",
  multi_column: "body_text",
  contents: "toc",
  table_of_contents: "toc",
  title: "title_page",
  full_page_art: "illustration_full",
  illustration: "illustration_with_text",
};

/** Canonical region types. These are the only values stored in contentRegions.type. */
const REGION_TYPES = new Set([
  // ── Headings ──────────────────────────────────────────────────
  "heading",       // chapter/section title
  "subheading",    // sub-section or minor heading
  // ── Text content ──────────────────────────────────────────────
  "paragraph",     // body text
  "list",          // bulleted or numbered list
  "sidebar",       // set-aside text box with supplementary content
  "callout",       // highlighted note, tip, or warning box
  "caption",       // descriptive text beneath an image or table
  // ── Tabular / structured game data ────────────────────────────
  "table",         // data table with rows and columns
  "stat_block",    // game stat block (monster, NPC, item, etc.)
  // ── Visual ────────────────────────────────────────────────────
  "illustration",  // artwork, drawings, photographs
  "map",           // cartographic or tactical map
  "graphic",       // chart, diagram, or decorative non-photo visual
  // ── Page furniture ────────────────────────────────────────────
  "advertisement", // paid advertisement (common in magazines)
  "header",        // running page header (book/chapter name)
  "footer",        // running page footer
  "page_number",   // printed page number area
  // ── Fallback ──────────────────────────────────────────────────
  "unknown",
]);

/**
 * Backward-compat aliases: map legacy/model-output type names to canonical types.
 * Applied in validateBboxRegions so stored data always uses canonical types.
 */
const REGION_TYPE_ALIASES: Record<string, string> = {
  text:      "paragraph",   // old OCR schema alias
  image:     "illustration", // generic image → illustration
  list_item: "list",        // sub-item granularity not needed at region level
  stat_line: "stat_block",  // stat_line is an OCR block concept, not a region type
};

function validateLayoutData(data: Record<string, unknown>): Record<string, unknown> {
  const rawType = String(data.layout_type ?? "").trim().toLowerCase();
  const layoutType = LAYOUT_TYPE_ALIASES[rawType] ?? rawType;
  if (!LAYOUT_TYPES.has(layoutType)) {
    throw new Error(`Invalid layout_analysis response: unsupported layout_type "${rawType || "<missing>"}"`);
  }

  const rawColumns = Number(data.columns ?? 1);
  const columns = Number.isFinite(rawColumns)
    ? Math.max(1, Math.min(4, Math.round(rawColumns)))
    : 1;

  return {
    ...data,
    layout_type: layoutType,
    columns,
    has_table: data.has_table === true,
    has_image_or_art: data.has_image_or_art === true,
    has_list: data.has_list === true,
  };
}

function assertLayoutInvokeResult(result: { content: string }): void {
  validateLayoutData(parseJsonResponse(result.content));
}

/** Normalise a raw model bbox into {x, y, w, h} percentage values (0-100).
 *  Handles {x,y,w,h}, {x,y,width,height}, {x1,y1,x2,y2}, array, and flat
 *  top-level coord variants.  If values exceed 101, treats them as pixels and
 *  scales to 0-100 using the observed page extent. */
function normaliseBboxRegions(raw: any[]): any[] {
  type Box = { x: number; y: number; w: number; h: number };

  function extractBox(r: any): Box | null {
    const b = r?.bbox;
    let box: Box | null = null;
    if (Array.isArray(b) && b.length >= 4) {
      box = { x: b[0], y: b[1], w: b[2], h: b[3] };
    } else if (b && typeof b === "object") {
      if (b.w !== undefined && b.h !== undefined) box = { x: b.x ?? 0, y: b.y ?? 0, w: b.w, h: b.h };
      else if (b.width !== undefined && b.height !== undefined) box = { x: b.x ?? 0, y: b.y ?? 0, w: b.width, h: b.height };
      else if (b.x1 !== undefined && b.x2 !== undefined) box = { x: b.x1, y: b.y1 ?? 0, w: b.x2 - b.x1, h: b.y2 - b.y1 };
      else if (b.left !== undefined && b.right !== undefined) box = { x: b.left, y: b.top ?? 0, w: b.right - b.left, h: b.bottom - b.top };
    } else if (r.x !== undefined && r.y !== undefined) {
      if (r.w !== undefined && r.h !== undefined) box = { x: r.x, y: r.y, w: r.w, h: r.h };
      else if (r.width !== undefined && r.height !== undefined) box = { x: r.x, y: r.y, w: r.width, h: r.height };
    }
    if (!box || box.w <= 0 || box.h <= 0) return null;
    return box;
  }

  const pairs = raw.map(r => ({ r, box: extractBox(r) })).filter(p => p.box !== null) as Array<{ r: any; box: Box }>;
  if (pairs.length === 0) return raw; // leave untouched if nothing parseable

  const maxX = Math.max(...pairs.map(p => p.box.x + p.box.w));
  const maxY = Math.max(...pairs.map(p => p.box.y + p.box.h));
  const isPixels = maxX > 101 || maxY > 101;
  const scaleX = isPixels && maxX > 0 ? 100 / maxX : 1;
  const scaleY = isPixels && maxY > 0 ? 100 / maxY : 1;

  return raw.map(r => {
    const box = extractBox(r);
    if (!box) return r;
    const norm: Box = {
      x: Math.round(box.x * scaleX * 100) / 100,
      y: Math.round(box.y * scaleY * 100) / 100,
      w: Math.round(box.w * scaleX * 100) / 100,
      h: Math.round(box.h * scaleY * 100) / 100,
    };
    return { ...r, bbox: norm };
  });
}

function clampPercent(value: unknown, fallback = 0): number {
  const n = Number(value);
  if (!Number.isFinite(n)) return fallback;
  return Math.max(0, Math.min(100, Math.round(n * 100) / 100));
}

function validateBboxRegions(data: Record<string, unknown>): any[] {
  if (!Array.isArray(data.regions)) {
    throw new Error("Invalid bbox_detection response: missing regions array");
  }

  const normalised = normaliseBboxRegions(data.regions);
  const valid = normalised.flatMap((region: any) => {
    const bbox = region?.bbox;
    if (!bbox || typeof bbox !== "object") return [];

    const x = Math.min(clampPercent(bbox.x), 99.9);
    const y = Math.min(clampPercent(bbox.y), 99.9);
    const w = clampPercent(bbox.w);
    const h = clampPercent(bbox.h);
    if (w <= 0 || h <= 0) return [];

    const clampedW = Math.min(Math.max(0.1, w), 100 - x);
    const clampedH = Math.min(Math.max(0.1, h), 100 - y);
    const rawType = String(region.type ?? "paragraph").trim().toLowerCase();
    const type = REGION_TYPE_ALIASES[rawType] ?? (REGION_TYPES.has(rawType) ? rawType : "paragraph");

    return [{
      ...region,
      type,
      label: typeof region.label === "string" && region.label.trim()
        ? region.label.trim().slice(0, 160)
        : type,
      bbox: { x, y, w: clampedW, h: clampedH },
    }];
  });

  if (valid.length === 0) {
    throw new Error("Invalid bbox_detection response: no usable regions");
  }
  return valid;
}

function assertBboxInvokeResult(result: { content: string }): void {
  validateBboxRegions(parseJsonResponse(result.content));
}

/**
 * Ensure OCR output always has a `content_blocks` array.
 * Some models return a flat `{"confidence":N,"text":"…"}` instead of the
 * required `{"confidence":N,"content_blocks":[…],"page_summary":"…"}`.
 * When that happens, split the text on double-newlines and wrap each chunk
 * into a paragraph block so downstream consumers always see structured data.
 */
function coerceOcrData(data: Record<string, unknown>): Record<string, unknown> {
  if (Array.isArray(data.content_blocks) && (data.content_blocks as any[]).length > 0) {
    return data; // already structured
  }

  // Gather any flat text the model provided
  const flatText = typeof data.text === "string" && data.text.trim()
    ? data.text.trim()
    : Object.values(data)
        .filter((v): v is string => typeof v === "string" && v.length > 20)
        .join("\n\n");

  if (!flatText) return data;

  // Split on blank lines and classify very short leading lines as headings
  const chunks = flatText.split(/\n{2,}/).filter(c => c.trim().length > 0);
  const content_blocks = chunks.map((chunk, i) => {
    const trimmed = chunk.trim();
    const isLikelyHeading = trimmed.length < 80 && !trimmed.endsWith(".");
    return { type: isLikelyHeading && i === 0 ? "heading" : "paragraph", text: trimmed, sequence: i + 1 };
  });

  console.warn("[Pipeline] OCR model returned flat text — coerced to content_blocks");
  return { ...data, content_blocks };
}

/** Extract the printed page label (e.g. "i", "42") from OCR content blocks. */
function extractPrintedPageLabel(data: Record<string, unknown>): string | null {
  if (!Array.isArray(data.content_blocks)) return null;
  const block = (data.content_blocks as any[]).find((b: any) => (b.block_type ?? b.type) === "page_number");
  const label = block?.text?.trim() ?? null;
  return label || null;
}

/** Extract readable text from a single OCR block (shared by buildRawText variants). */
function blockToText(b: any): string {
  const btype = b.block_type ?? b.type;
  if (btype === "table") {
    const caption = b.caption ? `[Table: ${b.caption}]\n` : "[Table]\n";
    const headers: string[] = Array.isArray(b.headers) ? b.headers : [];
    const headerLine = headers.length > 0 ? headers.join("\t") + "\n" : "";
    const rows = Array.isArray(b.rows)
      ? (b.rows as any[]).map(r =>
          Array.isArray(r) ? r.join("\t") : headers.map(h => r[h] ?? "").join("\t"),
        ).join("\n")
      : "";
    return caption + headerLine + rows;
  }
  if (btype === "rule_term") {
    return b.term && b.definition ? `${b.term}: ${b.definition}` : (b.text ?? b.term ?? "");
  }
  return b.text ?? b.content ?? "";
}

/**
 * Build the rawText string from OCR structured data.
 * Handles three model output shapes:
 *   1. Standard: {"content_blocks":[…]}
 *   2. Single block at root: {"type":"text","text":"…","bbox":{…}}
 *   3. Fallback: any root-level string fields joined together
 */
function buildRawText(data: Record<string, unknown>): string {
  if (Array.isArray(data.content_blocks)) {
    return (data.content_blocks as any[]).map(blockToText).filter(Boolean).join("\n\n");
  }
  // Model returned a single block at the root level (schema non-compliance)
  if (typeof data.text === "string" && data.text.length > 0) return data.text as string;
  // Try extracting any string values from the root object
  const texts = Object.values(data)
    .filter((v): v is string => typeof v === "string" && v.length > 10);
  return texts.length > 0 ? texts.join("\n\n") : "";
}

function parseRetryOcrResponse(content: string): Record<string, unknown> {
  try {
    return parseJsonResponse(content);
  } catch (err: any) {
    const text = content.trim();
    if (!text) throw err;
    return {
      content_blocks: [{ type: "text", text }],
      page_summary: text.slice(0, 240),
      confidence: 25,
      retry_parse_warning: stageErrorMessage(err),
    };
  }
}

/**
 * Like buildRawText but strips page-furniture blocks (page_number etc.).
 * Used as the input to normaliseText.
 */
function buildCleanText(data: Record<string, unknown>): string {
  if (!Array.isArray(data.content_blocks)) return buildRawText(data);
  return buildRawText({
    ...data,
    content_blocks: (data.content_blocks as any[]).filter(
      (b: any) => !NOISE_BLOCK_TYPES.has(b.block_type ?? b.type),
    ),
  });
}

/**
 * Build a layout-preserving Markdown string from OCR content blocks.
 * Tables become GFM pipe tables; headings become # / ## / ###.
 * Page-furniture blocks (page_number) are suppressed.
 * Falls back to buildRawText when content_blocks is absent.
 */
function buildMarkdownText(data: Record<string, unknown>): string {
  if (!Array.isArray(data.content_blocks)) return buildRawText(data);

  return (data.content_blocks as any[])
    .filter((b: any) => !NOISE_BLOCK_TYPES.has(b.block_type ?? b.type))
    .map((b: any) => {
    const btype = b.block_type ?? b.type;
    switch (btype) {
      case "heading":    return b.level === 2 ? `### ${b.text ?? ""}` : `## ${b.text ?? ""}`;
      case "subheading": return `### ${b.text ?? ""}`;
      case "rule_term":  return b.term && b.definition ? `**${b.term}**: ${b.definition}` : (b.text ? `**${b.text}**` : "");
      case "table": {
        const lines: string[] = [];
        if (b.caption) lines.push(`**${b.caption}**`);
        const headers: string[] = Array.isArray(b.headers) ? b.headers : [];
        if (headers.length > 0) {
          lines.push(`| ${headers.join(" | ")} |`);
          lines.push(`| ${headers.map(() => "---").join(" | ")} |`);
        }
        if (Array.isArray(b.rows)) {
          for (const row of b.rows as any[]) {
            const cells: string[] = Array.isArray(row)
              ? row.slice(0, headers.length).concat(Array(Math.max(0, headers.length - row.length)).fill(""))
              : headers.map(h => String((row as Record<string, unknown>)[h] ?? ""));
            lines.push(`| ${cells.join(" | ")} |`);
          }
        }
        return lines.join("\n");
      }
      default:
        return b.text ?? "";
    }
  }).filter(Boolean).join("\n\n");
}

/**
 * Normalise a single table object from any tabular extraction schema version into
 * a canonical internal shape with array headers and array-of-arrays rows.
 *
 * New schema (v2): column_headers (string[]), rows (object[]), table_type, region_sequence
 * Old schema (v1): headers (string[]), rows (string[][]), type
 */
function normaliseSingleTable(t: any): any {
  const headers: string[] = Array.isArray(t.column_headers) ? t.column_headers
    : Array.isArray(t.headers) ? t.headers : [];
  const rawRows: any[] = Array.isArray(t.rows) ? t.rows : [];
  const rows: string[][] = rawRows.map(row =>
    Array.isArray(row) ? row
      : headers.map(h => String((row as Record<string, unknown>)[h] ?? "")),
  );
  return {
    type: t.table_type ?? t.type ?? "other",
    caption: t.caption ?? t.entity_name ?? null,
    headers,
    rows,
    ...(t.ability_scores    ? { ability_scores: t.ability_scores }     : {}),
    ...(t.challenge_rating  ? { challenge_rating: t.challenge_rating } : {}),
    ...(t.xp !== undefined  ? { xp: t.xp }                            : {}),
    ...(t.region_sequence   ? { region_sequence: t.region_sequence }   : {}),
    ...(t.merged_cells?.length  ? { merged_cells: t.merged_cells }     : {}),
    ...(t.footnotes?.length     ? { footnotes: t.footnotes }           : {}),
  };
}

/**
 * Convert any tabular extraction response into a normalised array of table objects.
 * Handles two schema shapes:
 *   v1 (old): {"tables":[{type, headers, rows (array-of-arrays)}, …]}
 *   v2 (new): {table_type, column_headers, rows (array-of-objects), …}  ← single table at root
 */
function normaliseTabularData(data: Record<string, unknown>): any[] {
  if (Array.isArray(data.column_headers)) return [normaliseSingleTable(data)];
  if (Array.isArray(data.tables)) return (data.tables as any[]).map(normaliseSingleTable);
  return [];
}

/**
 * Merge higher-accuracy tabular_extraction results into OCR structured data.
 * Replaces existing table content_blocks in order; appends any extras found.
 * With the new OCR schema (block_type), OCR won't produce table blocks, so
 * extracted tables are always appended in that case.
 */
function mergeTabularExtraction(
  ocrData: Record<string, unknown>,
  extractedTables: any[],
): Record<string, unknown> {
  if (!Array.isArray(ocrData.content_blocks) || extractedTables.length === 0) return ocrData;

  let tableIdx = 0;
  const merged = (ocrData.content_blocks as any[]).map((block: any) => {
    if ((block.block_type ?? block.type) !== "table" || tableIdx >= extractedTables.length) return block;
    const t = extractedTables[tableIdx++];
    return {
      type: "table",
      caption: t.caption ?? block.caption,
      headers: t.headers,
      rows: t.rows,
      table_type: t.type,
      ...(t.ability_scores   ? { ability_scores: t.ability_scores }     : {}),
      ...(t.challenge_rating ? { challenge_rating: t.challenge_rating } : {}),
      ...(t.xp !== undefined ? { xp: t.xp }                            : {}),
      ...(t.merged_cells     ? { merged_cells: t.merged_cells }         : {}),
      ...(t.footnotes        ? { footnotes: t.footnotes }               : {}),
      sequence: block.sequence,
    };
  });

  // Append any extra tables not matched to an existing OCR block (common with
  // the new OCR schema which does not produce table-typed content_blocks).
  while (tableIdx < extractedTables.length) {
    const t = extractedTables[tableIdx++];
    merged.push({
      type: "table",
      caption: t.caption,
      headers: t.headers,
      rows: t.rows,
      table_type: t.type,
      ...(t.ability_scores   ? { ability_scores: t.ability_scores }     : {}),
      ...(t.challenge_rating ? { challenge_rating: t.challenge_rating } : {}),
      ...(t.xp !== undefined ? { xp: t.xp }                            : {}),
      ...(t.merged_cells     ? { merged_cells: t.merged_cells }         : {}),
      ...(t.footnotes        ? { footnotes: t.footnotes }               : {}),
      sequence: merged.length + 1,
    });
  }

  return { ...ocrData, content_blocks: merged };
}

const HITL_CONFIDENCE_THRESHOLD = pipelineConfig.pipeline.hitlConfidenceThreshold;

/** F1 score below this triggers HITL for pages that have a native PDF text layer. */
const NATIVE_SIMILARITY_THRESHOLD = 0.75;

/** Content-block types that are page furniture, not body content. Suppressed in cleanText/markdown. */
const NOISE_BLOCK_TYPES = new Set(["page_number"]);

/** Region/block types that indicate readable text content. */
const TEXT_CONTENT_TYPES = new Set(["heading", "subheading", "paragraph", "sidebar", "callout", "caption", "list"]);
/** Region/block types that indicate tabular or structured game data. */
const TABULAR_CONTENT_TYPES = new Set(["table", "stat_block"]);
/** Region types that are purely visual (images, maps, art). */
const VISUAL_CONTENT_TYPES = new Set(["illustration", "map", "graphic"]);
/** Region types that are ornamental or non-body (headers, footers, ads). */
const DECORATIVE_CONTENT_TYPES = new Set(["advertisement", "header", "footer", "page_number"]);

/**
 * Build the consolidated `layout` section for pageJsonOutput.
 *
 * Merges signals from three sources:
 *   - layoutData  : layout_analysis output (layout_type, columns, has_* flags)
 *   - regions     : bbox_detection output  (region type names)
 *   - structuredData : ocr_extraction output (block_type values)
 *
 * "text" is a legacy alias for "paragraph" emitted by some models; it is
 * normalised away so content_types only ever contains "paragraph".
 *
 * content_types is a sorted, deduplicated list of every content kind detected
 * on the page — from either the visual region detector or the OCR block extractor.
 * This lets consumers answer "does this page have headings/tables/images?" from
 * a single field without walking content_regions or content_blocks.
 */
function buildLayoutSection(
  layoutData: Record<string, unknown>,
  regions: any[],
  structuredData: Record<string, unknown> | null,
): Record<string, unknown> {
  const typeSet = new Set<string>();

  for (const r of regions) {
    let t = String(r.type ?? "unknown");
    if (t === "text") t = "paragraph"; // normalise legacy alias
    typeSet.add(t);
  }

  const blocks: any[] = Array.isArray(structuredData?.content_blocks) ? structuredData!.content_blocks as any[] : [];
  for (const b of blocks) {
    let t = String(b.block_type ?? b.type ?? "unknown");
    if (t === "text") t = "paragraph"; // normalise legacy alias
    typeSet.add(t);
  }

  const contentTypes = Array.from(typeSet).sort();

  const headingLevelSet = new Set<number>();
  for (const b of blocks) {
    if ((b.block_type ?? b.type) === "heading" && typeof b.level === "number") {
      headingLevelSet.add(b.level);
    }
  }
  const headingLevels = Array.from(headingLevelSet).sort((a, b) => a - b);

  return {
    /** Primary intent of the page — cover | title_page | toc | chapter_header | body_text | stat_block | table | illustration_full | illustration_with_text | index | appendix | mixed */
    layout_type:    layoutData.layout_type ?? null,
    /** Number of text columns detected (1–4). */
    columns:        layoutData.columns ?? 1,
    /** Every content type present on this page, sorted. Combines bbox region types and OCR block types. */
    content_types:  contentTypes,
    /** Heading levels present (e.g. [1, 2] means H1 + H2). Empty when no headings detected. */
    heading_levels: headingLevels,
    // ── Derived boolean flags for quick filtering ──
    has_text:       contentTypes.some(t => TEXT_CONTENT_TYPES.has(t)),
    has_tabular:    contentTypes.some(t => TABULAR_CONTENT_TYPES.has(t)) || layoutData.has_table === true,
    has_visual:     contentTypes.some(t => VISUAL_CONTENT_TYPES.has(t)) || layoutData.has_image_or_art === true,
    has_decorative: contentTypes.some(t => DECORATIVE_CONTENT_TYPES.has(t)),
    has_list:       layoutData.has_list === true || contentTypes.includes("list") || contentTypes.includes("list_item"),
  };
}

/**
 * Assemble the comprehensive per-page JSON output written to documentPages.pageJsonOutput
 * after all pipeline stages complete.  This is the canonical structured representation of
 * what was extracted from the page and is used by the document export and RAG layer.
 *
 * sequence_number: 1-indexed sequential position in the pipeline (PDF page order).
 *   Always starts at 1 for the first page the job processes, regardless of whether
 *   that page is a cover, front matter, or body page.
 *
 * printed_page_number: the number actually printed on the page (e.g. "i", "42").
 *   Null for covers, decorative pages, or any page where no label was detected.
 *   Will frequently differ from sequence_number — a document whose cover is
 *   sequence_number=1 will typically have printed_page_number=null, and body text
 *   may start at sequence_number=13 with printed_page_number="1".
 *
 * inferred_page_number: for pages with no printed number, a number inferred from
 *   surrounding context. Null until resolved in a post-processing pass.
 *
 * section_context: the chapter/section/subsection headings active at this page.
 *   Derived by tracking heading breaks across all preceding pages in the job.
 *
 * structural_position.continuity.text_from_previous_page: the tail of the
 *   previous page's OCR text when continues_from_previous_page is true.
 *   Lets consumers reconstruct complete sentences/paragraphs that span a page
 *   boundary without having to fetch and join adjacent pages.
 */
function buildPageJsonOutput(params: {
  pageNumber: number;
  printedPageLabel: string | null;
  layoutData: Record<string, unknown>;
  regions: any[];
  structuredData: Record<string, unknown> | null;
  structuralBreaks: any[];
  continuityFlags: any | null;
  nativeText: string | null;
  ocrConfidence: number;
  nativeSimilarity: number | null;
  stagesFailed: string[];
  stagesCompleted: string[];
  /** Tail of the previous page's OCR text (~500 chars). Used when continues_from_previous_page. */
  prevPageTailText: string | null;
  /** Chapter/section/subsection headings active at this page, accumulated across the job. */
  sectionContext: { chapter: string | null; section: string | null; subsection: string | null };
}): Record<string, unknown> {
  const {
    pageNumber, printedPageLabel, layoutData, regions, structuredData,
    structuralBreaks, continuityFlags, nativeText, ocrConfidence,
    nativeSimilarity, stagesFailed, stagesCompleted,
    prevPageTailText, sectionContext,
  } = params;

  const contentBlocks: any[] = Array.isArray(structuredData?.content_blocks)
    ? (structuredData!.content_blocks as any[]).filter((b: any) => !NOISE_BLOCK_TYPES.has(b.block_type ?? b.type))
    : [];

  // Sort content regions top-to-bottom, left-to-right for reading order
  const sortedRegions = [...regions].sort(
    (a, b) => ((a.bbox?.y ?? 0) - (b.bbox?.y ?? 0)) || ((a.bbox?.x ?? 0) - (b.bbox?.x ?? 0)),
  );

  return {
    schema_version: "page_v1",
    /** Sequential 1-indexed position in the pipeline (PDF page order, not printed number). */
    sequence_number: pageNumber,
    /** Number printed on the page (null when absent — e.g. covers, unnumbered plates). */
    printed_page_number: printedPageLabel,
    /** Inferred page number for pages with no printed number; null until resolved post-processing. */
    inferred_page_number: null,
    layout: buildLayoutSection(layoutData, regions, structuredData),
    /** Where this page sits within the document hierarchy (chapter/section/subsection). */
    section_context: sectionContext,
    structural_position: {
      structural_breaks: structuralBreaks,
      continuity: continuityFlags ? {
        continues_from_previous_page:         continuityFlags.continuesFromPreviousPage ?? false,
        /** Tail of the previous page's text (~500 chars) when continues_from_previous_page is true. */
        text_from_previous_page:              (continuityFlags.continuesFromPreviousPage && prevPageTailText) ? prevPageTailText : null,
        continues_to_next_page:               continuityFlags.continuesToNextPage ?? false,
        mid_sentence_break_at_end:            continuityFlags.midSentenceBreakAtEnd ?? false,
        section_continues_from_previous_page: continuityFlags.sectionContinuesFromPreviousPage ?? false,
      } : null,
    },
    content_regions: sortedRegions,
    content_blocks: contentBlocks,
    ocr_confidence: ocrConfidence,
    native_similarity: nativeSimilarity,
    ...(nativeText ? { native_pdf_text: nativeText } : {}),
    stages_completed: stagesCompleted,
    stages_failed: stagesFailed,
  };
}

// ── Post-processing: section summary generation ───────────────────────────────

/**
 * For every content_summary record still in "pending" status, gather the OCR
 * text from its page range and invoke the section_summary stage to populate
 * shortSummary, longSummary, keyTerms, and keyEntities.
 *
 * Called once per document after resolveContentSummaryBoundaries so that page
 * ranges are final.  Non-fatal: a missing stage inscription is logged and the
 * loop aborts cleanly; individual LLM failures mark the record "failed" and
 * move on.
 */
async function generateSectionSummaries(documentId: number, jobId: number): Promise<void> {
  const pending = await getPendingSummariesByDocument(documentId);
  if (pending.length === 0) return;
  console.log(`[Pipeline] Job ${jobId}: generating summaries for ${pending.length} content section(s)`);

  for (const summary of pending) {
    try {
      const endPage = summary.endPageNumber ?? summary.startPageNumber;
      const pages = await getOcrTextForPageRange(documentId, summary.startPageNumber, endPage);
      const combinedText = pages
        .map(p => p.rawText ?? "")
        .filter(t => t.length > 0)
        .join("\n\n---\n\n");

      if (!combinedText.trim()) {
        await updateContentSummary(summary.id, { summaryStatus: "skipped" });
        continue;
      }

      const sectionLabel = [
        summary.levelType,
        summary.headingText ? `"${summary.headingText}"` : null,
        `(pages ${summary.startPageNumber}–${endPage})`,
      ].filter(Boolean).join(" ");

      const content: UserContentPart[] = [{
        type: "text",
        text: `Summarise the following ${sectionLabel}.\n\n${combinedText.slice(0, 8000)}\n\nReply with ONLY a JSON object — start with { and end with }.`,
      }];

      const result = await invokeStage("section_summary", content, undefined, PROMPT_SECTION_SUMMARY,
        { ...JSON_INVOKE_OPTS }, { jobId });
      const data = parseJsonResponse(result.content);

      await updateContentSummary(summary.id, {
        shortSummary: typeof data.short_summary === "string" ? data.short_summary.slice(0, 500) : null,
        longSummary: typeof data.long_summary === "string" ? data.long_summary.slice(0, 2000) : null,
        keyTerms: Array.isArray(data.key_terms) ? (data.key_terms as string[]).slice(0, 20) : [],
        keyEntities: Array.isArray(data.key_entities) ? (data.key_entities as string[]).slice(0, 20) : [],
        summaryStatus: "complete",
      });
      console.log(`[Pipeline] Job ${jobId}: summarised ${sectionLabel}`);
    } catch (err: any) {
      if (isConfigError(err)) {
        // section_summary stage not configured — silently skip all summaries
        console.warn(`[Pipeline] Job ${jobId}: section_summary stage not configured, skipping summary generation`);
        break;
      }
      console.warn(`[Pipeline] Job ${jobId}: section_summary for "${summary.headingText ?? summary.id}" failed: ${err.message}`);
      await updateContentSummary(summary.id, { summaryStatus: "failed" }).catch(() => {});
    }
  }
}

// ── Public entry points ───────────────────────────────────────────────────────

/**
 * Enqueue a new document job.  If a concurrency slot is free it starts immediately;
 * otherwise it waits in pendingJobIds until one opens.
 * Called from the tRPC router and the file-upload route.
 */
export function startJob(jobId: number): void {
  pendingJobIds.push(jobId);
  console.log(`[Pipeline] Job ${jobId} queued (${pendingJobIds.length} pending, ${activeDocCount}/${MAX_CONCURRENT_DOCS} active)`);
  drainQueue();
}

/**
 * On server restart, any job still at status "queued" in the DB was sitting in
 * the in-memory pendingJobIds when the process exited.  Re-enqueue them in
 * creation order so processing resumes without manual intervention.
 * Jobs that were mid-processing ("pass1_ocr" etc.) are left for the operator to
 * restart explicitly from the UI.
 */
export async function recoverQueuedJobs(): Promise<void> {
  const jobs = await getActiveIngestionJobs();
  const queued = jobs
    .filter(j => j.status === "queued")
    .sort((a, b) => (a.createdAt?.getTime() ?? 0) - (b.createdAt?.getTime() ?? 0));
  if (queued.length === 0) return;
  console.log(`[Pipeline] Recovering ${queued.length} queued job(s) from previous session`);
  for (const job of queued) {
    pendingJobIds.push(job.id);
  }
  drainQueue();
}

// ── Internal runner ───────────────────────────────────────────────────────────

/**
 * Run one block job.  Returns the next chained job ID when more pages remain,
 * or null when the document is fully processed or the job failed.
 * Errors are caught here; runDocumentChain's loop treats null as "done".
 */
async function runJobBlock(jobId: number): Promise<number | null> {
  console.log(`[Pipeline] Starting job ${jobId}`);
  try {
    return await _runJob(jobId);
  } catch (err: any) {
    console.error(`[Pipeline] Job ${jobId} failed:`, err.message);
    await updateIngestionJobStatus(jobId, {
      status: "failed",
      errorMessage: err.message,
      completedAt: new Date(),
    }).catch(() => {});
    return null;
  }
}

async function _runJob(jobId: number): Promise<number | null> {
  const job = await getIngestionJobById(jobId);
  if (!job) throw new Error(`Job ${jobId} not found`);

  const pageOffset = (job as any).pageOffset ?? 0;
  const blockSize  = (job as any).blockSize  ?? 10;

  // ── Stage: document_registration ───────────────────────────────────────────
  await updateIngestionJobStatus(jobId, {
    status: "converting",
    currentPhase: 1,
    currentStage: "document_registration",
    startedAt: new Date(),
  });

  const jobWorkspace = join(WORKSPACE, String(jobId));
  const pagesDir = join(jobWorkspace, "pages");
  await mkdir(pagesDir, { recursive: true });

  // ── Resolve source file (local path or Drive download) ──────────────────────
  let sourceFile = job.sourceFile;
  let tempDownloadPath: string | null = null;

  if ((job as any).storageProvider === "google_drive" && (job as any).driveFileId) {
    await updateIngestionJobStatus(jobId, { currentStage: "downloading_source" });
    const driveFileId = (job as any).driveFileId as string;
    const fileName = await getDriveFileName(driveFileId);
    tempDownloadPath = join(jobWorkspace, fileName);
    await downloadDriveFile(driveFileId, tempDownloadPath);
    sourceFile = tempDownloadPath;
    console.log(`[Pipeline] Job ${jobId}: downloaded "${fileName}" from Google Drive`);
  }

  // Chained block jobs carry the parent document's ID so all blocks write to the
  // same document record.  First-block jobs have no documentId yet — they create
  // the document and then store the ID back on their own job row so that (a) the
  // chain creation below can forward it, and (b) recoverQueuedJobs finds it after
  // a server restart.
  const existingDocumentId = (job as any).documentId as number | null | undefined;
  let documentId: number;
  if (existingDocumentId) {
    documentId = existingDocumentId;
  } else {
    const createdDoc = await createDocument({
      filename: basename(sourceFile),
      gameSystem: job.gameSystem ?? undefined,
      status: "phase1_non_ocr",
      ingestionJobId: jobId,
    });
    documentId = createdDoc.id;
    // Persist so the chain job (and recovery) can reuse it
    await updateIngestionJobStatus(jobId, { documentId } as any);
  }

  // ── Stage: pdf_to_png ─────────────────────────────────────────────────────
  await updateIngestionJobStatus(jobId, { currentStage: "pdf_to_png" });

  // Count total pages so we know whether to chain a follow-up job
  const totalDocPages = /\.pdf$/i.test(sourceFile)
    ? await countPdfPages(sourceFile)
    : 1;

  const firstPage = pageOffset + 1;
  const lastPage  = pageOffset + blockSize;

  console.log(`[Pipeline] Job ${jobId}: converting pages ${firstPage}–${Math.min(lastPage, totalDocPages)} of ${totalDocPages}…`);

  let pageFiles = await convertToPages(sourceFile, pagesDir, firstPage, Math.min(lastPage, totalDocPages));
  if (pageFiles.length === 0) throw new Error("No pages produced from source file");

  // ── Stage: pdf_text_extract ───────────────────────────────────────────────
  // Must run while sourceFile is still on disk — Drive temp files are deleted
  // immediately after this block. Non-fatal: image-only PDFs produce no usable
  // text and simply leave every entry in nativePageTexts as null.
  const nativePageTexts: Array<string | null> = new Array(pageFiles.length).fill(null);
  if (/\.pdf$/i.test(sourceFile)) {
    await updateIngestionJobStatus(jobId, { currentStage: "pdf_text_extract" });
    try {
      const rawTexts = await extractNativePdfTextBatch(
        sourceFile, firstPage, Math.min(lastPage, totalDocPages),
      );
      for (let i = 0; i < pageFiles.length; i++) {
        const t = rawTexts[i] ?? "";
        nativePageTexts[i] = hasUsableEmbeddedText(t) ? t : null;
      }
      const embeddedCount = nativePageTexts.filter(t => t !== null).length;
      console.log(`[Pipeline] Job ${jobId}: native PDF text — ${embeddedCount}/${pageFiles.length} pages have embedded text`);
    } catch (err: any) {
      console.warn(`[Pipeline] Job ${jobId}: pdf_text_extract failed (non-fatal): ${err.message}`);
    }
  }

  // Delete the Drive temp download now that pages are extracted
  if (tempDownloadPath) await deleteLocalFile(tempDownloadPath);

  await updateIngestionJobStatus(jobId, { totalPages: pageFiles.length });
  console.log(`[Pipeline] Job ${jobId}: ${pageFiles.length} pages in this block`);

  // Create documentPage records for all pages upfront
  const pageIds: number[] = [];
  for (let i = 0; i < pageFiles.length; i++) {
    const page = await createDocumentPage({
      documentId,
      pageNumber: pageOffset + i + 1,
      rawPngUrl: pageFiles[i],
    });
    pageIds.push(page.id);
  }

  // Persist native text and embedded-text flag now that page IDs are known
  for (let i = 0; i < pageIds.length; i++) {
    const nt = nativePageTexts[i];
    if (nt !== null) {
      await updateDocumentPage(pageIds[i], { nativeText: nt, hasEmbeddedText: true });
    }
  }

  // ── Stage: preprocess (binarize/denoise) — optional ──────────────────────
  // rawPageFiles = original full-colour PNGs (always preserved).
  // pageFiles    = preprocessed versions after this block (used for all text/OCR/tabular stages).
  //
  // IMPORTANT: stages that extract or describe visual content (illustrations,
  // maps, photographs) MUST use rawPageFiles paths, not pageFiles, so that colour
  // information and image quality are preserved. Text-extraction stages (layout,
  // bbox, OCR, tabular) benefit from the cleaner binarized versions.
  const rawPageFiles = [...pageFiles]; // snapshot originals before possible reassignment

  if (pipelineConfig.binarize.enabled) {
    await updateIngestionJobStatus(jobId, { currentStage: "preprocess" });
    const preprocessDir = join(jobWorkspace, "preprocessed");
    const preprocessed = await preprocessPageImages(pageFiles, preprocessDir, pipelineConfig.binarize);

    // Update DB records with the preprocessed URLs; pipeline uses preprocessed paths
    for (let i = 0; i < preprocessed.length; i++) {
      if (preprocessed[i] !== pageFiles[i]) {
        await updateDocumentPage(pageIds[i], {
          preprocessedPngUrl: preprocessed[i],
          wasPreprocessed: true,
          preprocessingApplied: [
            pipelineConfig.binarize.grayscale ? "grayscale" : null,
            pipelineConfig.binarize.sharpenSigma > 0 ? `sharpen(${pipelineConfig.binarize.sharpenSigma})` : null,
            pipelineConfig.binarize.threshold > 0 ? `threshold(${pipelineConfig.binarize.threshold})` : "threshold(otsu)",
            pipelineConfig.binarize.denoise ? "denoise" : null,
          ].filter(Boolean).join("+"),
        });
      }
    }
    pageFiles = preprocessed;
    console.log(`[Pipeline] Job ${jobId}: preprocessing applied to ${preprocessed.length} pages`);
  }

  // ── Stage: document_intelligence (first block only) ───────────────────────
  // Uses ORIGINAL images: cover art, publisher logos, and background colours
  // are lost in binarized versions and are needed for accurate metadata extraction.
  if (pageOffset === 0) {
    await updateIngestionJobStatus(jobId, {
      status: "pass1_ocr",
      currentStage: "document_intelligence",
    });

    const sampleFiles = rawPageFiles.slice(0, Math.min(2, rawPageFiles.length));
    try {
      const sampleContent: UserContentPart[] = [];
      for (const f of sampleFiles) sampleContent.push(await imageContent(f));
      sampleContent.push({ type: "text", text: "Extract the document metadata from these pages. Reply with ONLY a JSON object — start with { and end with }." });

      const result = await invokeStage("document_intelligence", sampleContent, undefined, PROMPT_DOCUMENT_INTELLIGENCE,
        { ...JSON_INVOKE_OPTS, fewShotExamples: FEW_SHOT_DOC_INTEL }, { jobId });
      const meta = parseJsonResponse(result.content);

      await updateDocument(documentId, {
        title: (meta.canonical_title as string) || undefined,
        publisher: (meta.publisher as string) || undefined,
        documentType: (meta.document_type as string) || undefined,
        documentSummary: (meta.document_summary as string) || undefined,
      });
      console.log(`[Pipeline] Job ${jobId}: document_intelligence — "${meta.canonical_title}"`);
    } catch (err: any) {
      console.warn(`[Pipeline] Job ${jobId}: document_intelligence failed (continuing): ${err.message}`);
      await updateDocument(documentId, { title: basename(sourceFile) });
    }
  } else {
    await updateIngestionJobStatus(jobId, { status: "pass1_ocr", currentStage: "layout_analysis" });
  }

  // ── Per-page stages ───────────────────────────────────────────────────────
  const confidences: number[] = [];
  let processedPages = 0;
  let prevRawText: string | null = null;       // full text of previous page — fed to content_break_detect
  let prevPageTailText: string | null = null;  // last ~500 chars of previous page — stored in pageJsonOutput continuation context
  // Running section headings — updated as structural breaks are encountered across pages
  let currentChapterHeading: string | null = null;
  let currentSectionHeading: string | null = null;
  let currentSubsectionHeading: string | null = null;

  // Region types that contain visual content — original image must be used for these.
  const VISUAL_REGION_TYPES = new Set(["illustration", "image", "map", "graphic", "advertisement"]);

  for (let i = 0; i < pageFiles.length; i++) {
    const pageNum = pageOffset + i + 1;
    const pageId = pageIds[i];
    const pagePath = pageFiles[i];         // preprocessed (binarized/grayscale) — use for text stages
    const rawPagePath = rawPageFiles[i];   // original full-colour — use for visual content stages
    const stagesFailed: string[] = [];
    const stagesCompleted: string[] = [];
    let ocrConfidence = 0;
    let confidenceFromModel: number | null = null; // null = model didn't provide a score
    let nativeSimilarity: number | null = null;
    let ocrResultId: number | null = null;
    let currentRawText: string | null = null; // set when OCR succeeds; used by content_break_detect
    // Captured for pageJsonOutput assembly at the end of per-page processing
    let finalOcrStructuredData: Record<string, unknown> | null = null;
    let capturedStructuralBreaks: any[] = [];
    let capturedContinuityFlags: any = null;

    await updateIngestionJobStatus(jobId, { currentStage: "layout_analysis", processedPages });

    // Preprocessed image: used for layout, bbox, OCR, tabular (text clarity wins)
    const imgPart = await imageContent(pagePath);
    // Original image: lazily resolved below only when visual regions are detected
    let origImgPart: Awaited<ReturnType<typeof imageContent>> | null = null;

    await PAGE_LLM_SEMAPHORE.acquire();
    console.log(`[Pipeline] Job ${jobId}: page ${pageNum} acquired LLM slot`);
    try {

    // layout_analysis + bbox_detection — run concurrently.
    // Both stages read the same page image and are fully independent of each
    // other, so they can occupy both Artificer slots simultaneously.  OCR then
    // receives both results as context, improving multi-column extraction quality.
    let layoutData: Record<string, unknown> = {};
    let regions: any[] = [];

    const layoutContent: UserContentPart[] = [imgPart, { type: "text", text: "Classify the layout type and structure of this page. Reply with ONLY a JSON object — start with { and end with }." }];
    const bboxContent: UserContentPart[] = [imgPart, { type: "text", text: "Identify all distinct content regions on this page. Reply with ONLY a JSON object — start with { and end with }." }];

    const [layoutSettled, bboxSettled] = await Promise.allSettled([
      invokeStage("layout_analysis", layoutContent, undefined, PROMPT_LAYOUT_ANALYSIS,
        { ...JSON_INVOKE_OPTS, fewShotExamples: FEW_SHOT_LAYOUT, validateResult: assertLayoutInvokeResult }, { pageId, jobId })
        .then(async r => {
          const data = validateLayoutData(parseJsonResponse(r.content));
          await updateDocumentPage(pageId, { layoutType: (data.layout_type as string) || undefined });
          return data;
        }),
      invokeStage("bbox_detection", bboxContent, undefined, PROMPT_BBOX_DETECTION,
        { ...JSON_INVOKE_OPTS, fewShotExamples: FEW_SHOT_BBOX, validateResult: assertBboxInvokeResult }, { pageId, jobId })
        .then(async r => {
          const data = parseJsonResponse(r.content);
          const regs: any[] = validateBboxRegions(data);
          await updateDocumentPage(pageId, { contentRegions: regs });
          return regs;
        }),
    ]);

    // Re-throw config errors (fatal — no provider or broken config)
    for (const result of [layoutSettled, bboxSettled]) {
      if (result.status === "rejected" && isConfigError(result.reason)) throw result.reason;
    }

    if (layoutSettled.status === "fulfilled") {
      layoutData = layoutSettled.value;
      stagesCompleted.push("layout_analysis");
    } else {
      stagesFailed.push("layout_analysis");
      console.warn(`[Pipeline] Job ${jobId} p${pageNum} layout_analysis: ${layoutSettled.reason?.message}`);
    }

    if (bboxSettled.status === "fulfilled") {
      regions = bboxSettled.value;
      stagesCompleted.push("bbox_detection");
    } else {
      console.warn(`[Pipeline] Job ${jobId} p${pageNum} bbox_detection: ${bboxSettled.reason?.message}`);
    }

    // Lazily load the original full-colour image when the page contains visual
    // content regions (illustrations, maps, etc.).  Any future stage that
    // describes, captions, or extracts these regions MUST use origImgPart instead
    // of imgPart so colour and fine detail are preserved.
    // origImgPart is intentionally unused here — it is the pre-loaded handle for
    // the upcoming image_extraction stage (see TODO: add image captioning stage).
    const hasVisualRegions = regions.some((r: any) => VISUAL_REGION_TYPES.has(r.type));
    if (hasVisualRegions && rawPagePath !== pagePath) {
      origImgPart = await imageContent(rawPagePath);
    }
    void origImgPart; // acknowledged — consumed by future image_extraction stage

    // ocr_extraction
    try {
      await updateIngestionJobStatus(jobId, { currentStage: "ocr_extraction" });
      const columnCount = typeof layoutData.columns === "number" ? layoutData.columns : null;
      const contextParts: string[] = [];
      if (columnCount && columnCount > 1)
        contextParts.push(`Layout analysis determined this page has ${columnCount} columns. Extract text from ALL columns in left-to-right, top-to-bottom reading order — do NOT stop after the first column.`);
      if (regions.length > 0)
        contextParts.push(`Content regions already detected: ${JSON.stringify(regions.slice(0, 5))}`);
      const nativeText = nativePageTexts[i];
      if (nativeText)
        contextParts.push(`--- Native PDF text (ground-truth reference) ---\n${nativeText.slice(0, 6000)}\n--- End native PDF text ---`);
      const regionContext = contextParts.length > 0 ? contextParts.join("\n\n") : undefined;
      const ocrContent: UserContentPart[] = [imgPart, { type: "text", text: "Extract all readable text from this page in reading order. Reply with ONLY a JSON object — start with { and end with }." }];
      const r = await invokeStage("ocr_extraction", ocrContent, regionContext, PROMPT_OCR_EXTRACTION,
        { ...JSON_INVOKE_OPTS, fewShotExamples: FEW_SHOT_OCR }, { pageId, jobId });
      const data = coerceOcrData(parseJsonResponse(r.content));
      // Track whether the model actually provided a confidence score.
      // When it's absent we don't treat the page as low-confidence — we rely
      // on native-text similarity instead.  confidenceFromModel=null lets the
      // HITL gate below distinguish "model said 0%" from "model was silent".
      confidenceFromModel = typeof data.confidence === "number" ? data.confidence : null;
      ocrConfidence = confidenceFromModel ?? 0;

      currentRawText = buildRawText(data);
      const nt = nativePageTexts[i];
      // Skip similarity when buildRawText produced empty or JSON-like output
      // (indicates the model returned a non-standard schema — garbage-in would
      // produce misleadingly low F1 scores and trigger spurious HITL flags).
      const rawIsUsable = currentRawText.length > 0 && !currentRawText.startsWith("{");
      nativeSimilarity = (nt !== null && rawIsUsable) ? nativeTextSimilarity(nt, currentRawText) : null;
      if (nativeSimilarity !== null) {
        console.log(`[Pipeline] Job ${jobId} p${pageNum} native similarity: ${Math.round(nativeSimilarity * 100)}%`);
      }
      const ocrResult = await createOcrResult({
        pageId,
        structuredData: data,
        rawText: currentRawText,
        markdownText: buildMarkdownText(data),
        normalisedText: normaliseText(buildCleanText(data)),
        confidence: ocrConfidence,
        nativeSimilarity,
        status: "pass1_complete",
        pass1Model: r.model,
        auditLog: [{ timestamp: new Date().toISOString(), action: "pass1", model: r.model }],
      } as any);
      ocrResultId = ocrResult.id;

      finalOcrStructuredData = data;
      stagesCompleted.push("ocr_extraction");
      const printedPageLabel = extractPrintedPageLabel(data);
      await updateDocumentPage(pageId, {
        ocrCompleted: true, ocrConfidence,
        printedPageLabel: printedPageLabel ?? "[unnumbered]",
      });
    } catch (err: any) {
      if (isConfigError(err)) throw err; // fatal — halt job
      stagesFailed.push("ocr_extraction");
      console.warn(`[Pipeline] Job ${jobId} p${pageNum} ocr_extraction: ${err.message}`);
      const ocrResult = await createOcrResult({ pageId, status: "failed", confidence: 0 });
      ocrResultId = ocrResult.id;
    }

    // ── content_break_detect ────────────────────────────────────────────────
    // Text-only stage — runs only when OCR produced text. Not critical: failures
    // are logged but do not add to stagesFailed and do not trigger HITL.
    if (currentRawText !== null) {
      try {
        await updateIngestionJobStatus(jobId, { currentStage: "content_break_detect" });
        // prevRawText still holds the PREVIOUS page's text here — we advance it below.
        const prevTail = prevRawText
          ? `Previous page ends with:\n${prevRawText.slice(-400).trim()}`
          : "";
        const cbText = [
          prevTail,
          `Current page text (page ${pageNum}):\n${currentRawText}`,
          "Analyse this page for structural breaks and cross-page continuity. Reply with ONLY a JSON object — start with { and end with }.",
        ].filter(Boolean).join("\n\n");
        const cbContent: UserContentPart[] = [{ type: "text", text: cbText }];
        const cbResult = await invokeStage("content_break_detect", cbContent, undefined, PROMPT_CONTENT_BREAK_DETECT,
          { ...JSON_INVOKE_OPTS, fewShotExamples: FEW_SHOT_CONTENT_BREAK }, { pageId, jobId });
        const cbData = parseJsonResponse(cbResult.content);

        const contObj = cbData.continuity as any;
        const breaks: any[] = Array.isArray(cbData.structural_breaks) ? cbData.structural_breaks : [];

        capturedStructuralBreaks = breaks.map((b: any) => ({
          breakType: b.break_type,
          headingText: b.heading_text ?? "",
          position: b.position ?? 1,
        }));
        if (contObj) {
          capturedContinuityFlags = {
            continuesFromPreviousPage:        !!contObj.continues_from_previous_page,
            continuesToNextPage:              !!contObj.continues_to_next_page,
            midSentenceBreakAtEnd:            !!contObj.mid_sentence_break_at_end,
            sectionContinuesFromPreviousPage: !!contObj.section_continues_from_previous_page,
          };
        }
        await updateDocumentPage(pageId, {
          ...(capturedContinuityFlags ? { continuityFlags: capturedContinuityFlags } : {}),
          structuralBreaks: capturedStructuralBreaks,
        });
        stagesCompleted.push("content_break_detect");

        // Advance running section context — later pages inherit the deepest heading seen so far.
        // A chapter break resets section/subsection; a section break resets subsection only.
        for (const brk of capturedStructuralBreaks) {
          if (brk.breakType === "chapter") {
            currentChapterHeading = brk.headingText || null;
            currentSectionHeading = null;
            currentSubsectionHeading = null;
          } else if (brk.breakType === "section") {
            currentSectionHeading = brk.headingText || null;
            currentSubsectionHeading = null;
          } else if (brk.breakType === "subsection") {
            currentSubsectionHeading = brk.headingText || null;
          }
        }

        // Skeleton contentSummaries records — boundaries resolved after all pages are done
        for (const brk of breaks) {
          if (brk.break_type && brk.break_type !== "none") {
            await createContentSummary({
              documentId,
              levelType: brk.break_type,
              headingText: brk.heading_text ?? null,
              startPageId: pageId,
              startPageNumber: pageNum,
            });
          }
        }
      } catch (err: any) {
        if (isConfigError(err)) throw err;
        console.warn(`[Pipeline] Job ${jobId} p${pageNum} content_break_detect: ${err.message}`);
      }
      // Advance so next page's content_break_detect gets THIS page as its prevRawText,
      // and so pageJsonOutput can embed the tail as cross-page continuation context.
      prevRawText = currentRawText;
      prevPageTailText = currentRawText.slice(-500);
    }

    // ── tabular_extraction ──────────────────────────────────────────────────
    // Runs when layout analysis or bbox detection found table/stat-block content.
    // Not critical: failures are logged but do not trigger HITL.
    const hasTableContent = layoutData.has_table === true
      || regions.some((r: any) => r.type === "table" || r.type === "stat_block");
    if (hasTableContent && ocrResultId !== null) {
      try {
        await updateIngestionJobStatus(jobId, { currentStage: "tabular_extraction" });
        const tableRegions = regions.filter((r: any) => r.type === "table" || r.type === "stat_block");
        const tableCtxParts: string[] = [];
        if (tableRegions.length > 0)
          tableCtxParts.push(`Table/stat-block regions detected: ${JSON.stringify(tableRegions)}`);
        const nativeTextForTable = nativePageTexts[i];
        if (nativeTextForTable)
          tableCtxParts.push(`--- Native PDF text (ground-truth reference) ---\n${nativeTextForTable.slice(0, 6000)}\n--- End native PDF text ---`);
        const tableCtx = tableCtxParts.length > 0 ? tableCtxParts.join("\n\n") : undefined;
        const tabContent: UserContentPart[] = [
          imgPart,
          { type: "text", text: "Extract ALL tables and stat blocks from this page with complete accuracy. Reply with ONLY a JSON object — start with { and end with }." },
        ];
        const tabResult = await invokeStage("tabular_extraction", tabContent, tableCtx, PROMPT_TABULAR_EXTRACTION,
          { ...JSON_INVOKE_OPTS, fewShotExamples: FEW_SHOT_TABULAR }, { pageId, jobId });
        const tabData = parseJsonResponse(tabResult.content);
        const extractedTables = normaliseTabularData(tabData);

        if (extractedTables.length > 0) {
          const existing = await getOcrResultByPageId(pageId);
          if (existing?.structuredData) {
            const mergedData = mergeTabularExtraction(existing.structuredData, extractedTables);
            finalOcrStructuredData = mergedData;
            await updateOcrResult(existing.id, {
              structuredData: mergedData,
              rawText: buildRawText(mergedData),
              markdownText: buildMarkdownText(mergedData),
              normalisedText: normaliseText(buildCleanText(mergedData)),
              auditLog: [...((existing.auditLog as any[]) ?? []),
                { timestamp: new Date().toISOString(), action: "tabular_extraction", model: tabResult.model }],
            } as any);
          }
        }
        stagesCompleted.push("tabular_extraction");
      } catch (err: any) {
        if (isConfigError(err)) {
          // tabular_extraction is optional — a missing inscription means "skip table enhancement"
          console.warn(`[Pipeline] Job ${jobId} p${pageNum} tabular_extraction: not configured, skipping table extraction`);
        } else {
          console.warn(`[Pipeline] Job ${jobId} p${pageNum} tabular_extraction: ${err.message}`);
        }
      }
    }

    // ── Assemble pageJsonOutput ─────────────────────────────────────────────
    // Written to documentPages.pageJsonOutput so the full structured result is
    // available for document export, RAG, and downstream consumers without
    // having to join across pages + ocrResults + structural tables.
    await updateDocumentPage(pageId, {
      pageJsonOutput: buildPageJsonOutput({
        pageNumber: pageNum,
        printedPageLabel: extractPrintedPageLabel(finalOcrStructuredData ?? {}) ?? null,
        layoutData,
        regions,
        structuredData: finalOcrStructuredData,
        structuralBreaks: capturedStructuralBreaks,
        continuityFlags: capturedContinuityFlags,
        nativeText: nativePageTexts[i],
        ocrConfidence,
        nativeSimilarity,
        stagesFailed,
        stagesCompleted,
        prevPageTailText,
        sectionContext: {
          chapter: currentChapterHeading,
          section: currentSectionHeading,
          subsection: currentSubsectionHeading,
        },
      }),
    });

    // Queue for HITL review: stage failure, low model confidence (only when the
    // model actually returned a score), or significant native-text divergence.
    const poorNativeAlignment = nativeSimilarity !== null && nativeSimilarity < NATIVE_SIMILARITY_THRESHOLD;
    const lowConfidence = confidenceFromModel !== null && ocrConfidence < HITL_CONFIDENCE_THRESHOLD;
    const needsHitl = stagesFailed.length > 0 || lowConfidence || poorNativeAlignment;
    if (needsHitl) {
      const reasonParts: string[] = [`Page ${pageNum} of ${totalDocPages}`];
      if (stagesFailed.length > 0) reasonParts.push(`failed stages: ${stagesFailed.join(", ")}`);
      if (lowConfidence) reasonParts.push(`low confidence: ${ocrConfidence}%`);
      if (poorNativeAlignment) reasonParts.push(`native text divergence: ${Math.round(nativeSimilarity! * 100)}% similarity`);
      await createHitlItem({
        pageId,
        ocrResultId: ocrResultId ?? undefined,
        reason: reasonParts.join(" — "),
        flagCategory: stagesFailed.length > 0 ? "stage_failure"
          : poorNativeAlignment ? "native_text_divergence"
          : "low_confidence",
        priority: stagesFailed.includes("ocr_extraction")
          || (confidenceFromModel !== null && ocrConfidence < 50)
          || (poorNativeAlignment && nativeSimilarity! < 0.5) ? "high" : "medium",
      });
    }

    } finally {
      PAGE_LLM_SEMAPHORE.release();
    }

    confidences.push(ocrConfidence);
    processedPages++;

    const avgConfidence = Math.round(confidences.reduce((a, b) => a + b, 0) / confidences.length);
    await updateIngestionJobStatus(jobId, { processedPages, avgConfidence });
    console.log(`[Pipeline] Job ${jobId}: page ${pageNum}/${totalDocPages} (confidence: ${ocrConfidence})`);
  }

  // ── Finalize this block ───────────────────────────────────────────────────
  const avgConfidence = confidences.length > 0
    ? Math.round(confidences.reduce((a, b) => a + b, 0) / confidences.length)
    : 0;

  await updateDocument(documentId, {
    // Accumulate across blocks: offset + this block's count
    processedPages: pageOffset + processedPages,
    avgConfidence,
    // Use true PDF page count when known; fall back to running high-water mark
    totalPages: isFinite(totalDocPages) ? totalDocPages : pageOffset + pageFiles.length,
    status: "hitl_required",
  });

  const nextOffset = pageOffset + pageFiles.length;
  const hasMore = nextOffset < totalDocPages;

  await updateIngestionJobStatus(jobId, {
    status: "review",
    processedPages,
    avgConfidence,
    completedAt: new Date(),
  });

  console.log(`[Pipeline] Job ${jobId}: ${processedPages} pages queued for HITL (avg confidence: ${avgConfidence})`);

  // ── Resolve section boundaries (final block only) ────────────────────────
  // Once all pages are done, close content_summary intervals and assign parentIds.
  if (!hasMore) {
    await resolveContentSummaryBoundaries(documentId, totalDocPages).catch(err =>
      console.warn(`[Pipeline] Job ${jobId}: resolveContentSummaryBoundaries failed: ${err.message}`)
    );
    // Generate short/long summaries for every chapter, section, and subsection.
    // Runs after boundaries are resolved so endPageNumber is available for range queries.
    await generateSectionSummaries(documentId, jobId).catch(err =>
      console.warn(`[Pipeline] Job ${jobId}: section summary generation failed: ${err.message}`)
    );
  }

  // ── Auto-chain next block ─────────────────────────────────────────────────
  // Re-fetch the job to check whether a cancel was requested while this block ran
  const currentJob = await getIngestionJobById(jobId);
  const wasCancelled = currentJob?.status === "failed" && currentJob?.errorMessage === "Cancelled by user";

  if (hasMore && !wasCancelled) {
    console.log(`[Pipeline] Job ${jobId}: chaining next block starting at page ${nextOffset + 1}`);
    const nextJobId = await createIngestionJob({
      sourceFile: job.sourceFile,
      storageProvider: (job as any).storageProvider ?? "local",
      driveFileId: (job as any).driveFileId ?? null,
      gameSystem: job.gameSystem ?? null,
      documentId,
      pageOffset: nextOffset,
      blockSize,
      status: "queued",
    } as any);
    // Return the next job ID — runDocumentChain will start it immediately in the
    // same slot, bypassing the queue (same document, same concurrency slot).
    return nextJobId;
  }
  return null;
}

// ── Page retry (called from HITL UI) ─────────────────────────────────────────

export type RetryStage = "layout_analysis" | "bbox_detection" | "ocr_extraction";

export type RetryPageMetadata = {
  reviewerUserId?: number;
  savedCorrectionFields?: string[];
};

export async function retryPageStages(
  pageId: number,
  stages: RetryStage[],
  hitlId?: number,
  metadata: RetryPageMetadata = {},
): Promise<{ confidence: number; stagesFailed: string[]; stageErrors: Record<string, string> }> {
  const page = await getPageById(pageId);
  if (!page) throw new Error(`Page ${pageId} not found`);
  if (!page.rawPngUrl) throw new Error(`Page ${pageId} has no image on disk`);

  const [doc, prevPage, nextPage, currentOcrBefore] = await Promise.all([
    getDocumentById(page.documentId),
    getPageByDocumentAndNumber(page.documentId, page.pageNumber - 1),
    getPageByDocumentAndNumber(page.documentId, page.pageNumber + 1),
    getOcrResultByPageId(pageId),
  ]);
  const [prevOcr, nextOcr] = await Promise.all([
    prevPage ? getOcrResultByPageId(prevPage.id) : Promise.resolve(null),
    nextPage ? getOcrResultByPageId(nextPage.id) : Promise.resolve(null),
  ]);

  // Build surrounding-context string for the LLM
  const ctxParts: string[] = [];
  if (doc?.title || doc?.gameSystem)
    ctxParts.push(`Document: ${doc.title ?? doc.filename} (${doc.gameSystem ?? "unknown game system"})`);
  if (prevOcr?.rawText)
    ctxParts.push(`Previous page ends with:\n${prevOcr.rawText.slice(-600).trim()}`);
  if (nextOcr?.rawText)
    ctxParts.push(`Next page begins with:\n${nextOcr.rawText.slice(0, 200).trim()}`);
  const surroundingContext = ctxParts.length > 0 ? ctxParts.join("\n\n") : undefined;

  // For text/OCR stages use the preprocessed image when available — binarization
  // yields cleaner text extraction. rawPngUrl is always the fallback (and is the
  // correct choice for any future visual-content stages in retry).
  const ocrImgPath = (page.wasPreprocessed && page.preprocessedPngUrl) ? page.preprocessedPngUrl : page.rawPngUrl!;
  const imgPart = await imageContent(ocrImgPath);
  const stagesFailed: string[] = [];
  const stageErrors: Record<string, string> = {};
  let layoutType = page.layoutType ?? undefined;
  let ocrConfidence = 0;
  let retryOcrResultId: number | null = currentOcrBefore?.id ?? null;
  const modelTrace: Record<string, string> = {};
  const retryStartedAt = Date.now();
  const savedCorrectionFields = [...new Set(metadata.savedCorrectionFields ?? [])];
  const corrected = (currentOcrBefore?.correctedStructuredData as Record<string, unknown> | null) ?? {};
  const usedReviewedLayout = savedCorrectionFields.includes("layout") || page.layoutType != null;
  const usedReviewedRegions = savedCorrectionFields.includes("regions") || page.contentRegions != null;
  const usedReviewedStructure = savedCorrectionFields.some(f => ["text", "structure", "json"].includes(f))
    || currentOcrBefore?.correctedText != null
    || corrected.structure_correction != null
    || corrected.json_correction != null;
  let retryAttemptId: number | null = null;
  try {
    const attempt = await createHitlRetryAttempt({
      hitlItemId: hitlId ?? null,
      pageId,
      requestedStages: stages,
      savedCorrectionFields,
      usedReviewedLayout,
      usedReviewedRegions,
      usedReviewedStructure,
      status: "running",
      confidence: null,
      stagesFailed: [],
      stageErrors: {},
      modelTrace: {},
      ocrResultId: retryOcrResultId,
      createdBy: metadata.reviewerUserId ?? null,
    } as any);
    retryAttemptId = attempt.id;
  } catch (err: any) {
    console.warn(`[Pipeline] Page ${pageId} retry tracking start failed: ${err?.message ?? String(err)}`);
  }

  await PAGE_LLM_SEMAPHORE.acquirePriority();
  console.log(`[Pipeline] Page ${pageId} retry: acquired LLM slot (stages: ${stages.join(", ")})`);
  try {
    // layout_analysis
    if (stages.includes("layout_analysis")) {
      try {
        const content: UserContentPart[] = [imgPart, { type: "text", text: "Classify the layout type and structure of this page. Reply with ONLY a JSON object — start with { and end with }." }];
        const r = await invokeStage("layout_analysis", content, surroundingContext, PROMPT_LAYOUT_ANALYSIS,
          { ...JSON_INVOKE_OPTS, fewShotExamples: FEW_SHOT_LAYOUT, validateResult: assertLayoutInvokeResult }, { pageId, jobId: doc?.ingestionJobId ?? undefined });
        modelTrace.layout_analysis = r.model;
        const data = validateLayoutData(parseJsonResponse(r.content));
        layoutType = (data.layout_type as string) || undefined;
        await updateDocumentPage(pageId, { layoutType });
      } catch (err: any) {
        const msg = stageErrorMessage(err);
        stagesFailed.push("layout_analysis");
        stageErrors.layout_analysis = msg;
        console.warn(`[Pipeline] Page ${pageId} retry layout_analysis: ${msg}`);
      }
    }

    // bbox_detection — use existing regions if not re-running
    let regions: any[] = stages.includes("bbox_detection")
      ? []
      : (Array.isArray(page.contentRegions) ? (page.contentRegions as any[]) : []);
    if (stages.includes("bbox_detection")) {
      try {
        const content: UserContentPart[] = [imgPart, { type: "text", text: "Identify all distinct content regions on this page. Reply with ONLY a JSON object — start with { and end with }." }];
        const r = await invokeStage("bbox_detection", content, surroundingContext, PROMPT_BBOX_DETECTION,
          { ...JSON_INVOKE_OPTS, fewShotExamples: FEW_SHOT_BBOX, validateResult: assertBboxInvokeResult }, { pageId, jobId: doc?.ingestionJobId ?? undefined });
        modelTrace.bbox_detection = r.model;
        const data = parseJsonResponse(r.content);
        regions = validateBboxRegions(data);
        await updateDocumentPage(pageId, { contentRegions: regions });
      } catch (err: any) {
        const msg = stageErrorMessage(err);
        stagesFailed.push("bbox_detection");
        stageErrors.bbox_detection = msg;
        console.warn(`[Pipeline] Page ${pageId} retry bbox_detection: ${msg}`);
      }
    }

    // ocr_extraction
    if (stages.includes("ocr_extraction")) {
      try {
        const layoutCtx = layoutType
          ? `Reviewed page_layout: ${layoutType}`
          : undefined;
        const regionCtx = regions.length > 0
          ? `Reviewed content_regions (${regions.length}) in percent coordinates; use sequence order when present: ${JSON.stringify(regions.slice(0, 50))}`
          : undefined;
        const pageNativeText = typeof (page as any).nativeText === "string" && (page as any).nativeText.trim()
          ? (page as any).nativeText.trim()
          : null;
        const nativeCtx = pageNativeText
          ? `--- Native PDF text (ground-truth reference) ---\n${pageNativeText.slice(0, 6000)}\n--- End native PDF text ---`
          : undefined;
        const reviewedContext = [layoutCtx, regionCtx, nativeCtx].filter(Boolean).join("\n\n");
        const fullContext = [surroundingContext, reviewedContext].filter(Boolean).join("\n\n") || undefined;
        const content: UserContentPart[] = [imgPart, {
          type: "text",
          text: "Extract all readable text from this page in reading order. Use reviewed page_layout and content_regions from context as authoritative HITL corrections. If regions are present, process them in sequence order, then include any remaining readable text outside the boxes. Reply with ONLY a JSON object - start with { and end with }.",
        }];
        const r = await invokeStage("ocr_extraction", content, fullContext, PROMPT_OCR_EXTRACTION,
          { ...JSON_INVOKE_OPTS, fewShotExamples: FEW_SHOT_OCR }, { pageId, jobId: doc?.ingestionJobId ?? undefined });
        modelTrace.ocr_extraction = r.model;
        console.log(`[Pipeline] Page ${pageId} retry ocr_extraction: model=${r.model} durationMs=${r.durationMs} raw=${JSON.stringify(r.content.slice(0, 400))}`);
        const data = coerceOcrData(parseRetryOcrResponse(r.content));
        ocrConfidence = typeof data.confidence === "number" ? data.confidence : 0;

        const rawText = buildRawText(data);
        if (!rawText.trim()) {
          // Model returned parseable JSON but with no extractable text — treat as
          // a failed attempt so the existing OCR result is preserved unchanged.
          throw new Error(`OCR retry produced empty text (confidence=${ocrConfidence}%) — model returned: ${JSON.stringify(r.content.slice(0, 300))}`);
        }
        const markdownText = buildMarkdownText(data);
        const normalisedText = normaliseText(buildCleanText(data));
        const printedPageLabel = extractPrintedPageLabel(data);

        const existing = await getOcrResultByPageId(pageId);
        const retryAudit: any = { timestamp: new Date().toISOString(), action: "retry", model: r.model };
        if (data.retry_parse_warning) retryAudit.warning = String(data.retry_parse_warning);
        if (existing) {
          await updateOcrResult(existing.id, {
            structuredData: data, rawText, markdownText, normalisedText, confidence: ocrConfidence,
            status: "pass1_complete", pass1Model: r.model,
            auditLog: [...((existing.auditLog as any[]) ?? []),
              retryAudit],
          } as any);
        } else {
          const created = await createOcrResult({
            pageId, structuredData: data, rawText, markdownText, normalisedText, confidence: ocrConfidence,
            status: "pass1_complete", pass1Model: r.model,
            auditLog: [retryAudit],
          } as any);
          retryOcrResultId = created.id;
        }
        if (existing) retryOcrResultId = existing.id;
        await updateDocumentPage(pageId, {
          ocrCompleted: true, ocrConfidence,
          printedPageLabel: printedPageLabel ?? "[unnumbered]",
        });
      } catch (err: any) {
        const msg = stageErrorMessage(err);
        stagesFailed.push("ocr_extraction");
        stageErrors.ocr_extraction = msg;
        console.warn(`[Pipeline] Page ${pageId} retry ocr_extraction: ${msg}`);
      }
    }
  } finally {
    PAGE_LLM_SEMAPHORE.release();
  }

  // Auto-resolve the HITL item if retry passed; otherwise update notes
  if (hitlId != null) {
    const passed = stagesFailed.length === 0 && ocrConfidence >= HITL_CONFIDENCE_THRESHOLD;
    if (passed) {
      await updateHitlItem(hitlId, {
        status: "resolved",
        resolutionNotes: `Auto-resolved by retry — confidence ${ocrConfidence}%`,
        resolvedAt: new Date(),
      });
    } else {
      const parts = ["Retry attempted"];
      if (stagesFailed.length > 0) parts.push(`failed: ${stagesFailed.join(", ")}`);
      for (const stage of stagesFailed) {
        if (stageErrors[stage]) parts.push(`${stage}: ${stageErrors[stage].slice(0, 160)}`);
      }
      if (ocrConfidence < HITL_CONFIDENCE_THRESHOLD) parts.push(`confidence ${ocrConfidence}%`);
      await updateHitlItem(hitlId, { resolutionNotes: parts.join(" — ") });
    }
  }

  if (retryAttemptId != null) {
    try {
      await updateHitlRetryAttempt(retryAttemptId, {
        status: stagesFailed.length === 0 ? "succeeded" : "failed",
        confidence: ocrConfidence,
        stagesFailed,
        stageErrors,
        modelTrace,
        ocrResultId: retryOcrResultId,
        completedAt: new Date(),
        durationMs: Date.now() - retryStartedAt,
      } as any);
    } catch (err: any) {
      console.warn(`[Pipeline] Page ${pageId} retry tracking finish failed: ${err?.message ?? String(err)}`);
    }
  }

  console.log(`[Pipeline] Page ${pageId} retry done (confidence: ${ocrConfidence}, failed: ${stagesFailed.join(", ") || "none"})`);
  return { confidence: ocrConfidence, stagesFailed, stageErrors };
}

// ── Helpers ───────────────────────────────────────────────────────────────────

/**
 * Apply binarization / denoising preprocessing to a set of page images using Sharp.
 * Returns the preprocessed file paths (in a new outputDir) on success, or the
 * original paths unchanged if Sharp is not installed or preprocessing fails.
 */
async function preprocessPageImages(
  files: string[],
  outputDir: string,
  opts: BinarizeConfig,
): Promise<string[]> {
  // Dynamic import — graceful no-op if Sharp isn't installed
  let sharpFn: ((input: string) => any) | null = null;
  try {
    const mod = await import("sharp");
    sharpFn = (mod.default ?? mod) as (input: string) => any;
  } catch {
    console.warn("[Pipeline] Sharp not installed — skipping image preprocessing. Run: pnpm add sharp");
    return files;
  }

  await mkdir(outputDir, { recursive: true });
  const results: string[] = [];

  for (const src of files) {
    const dest = join(outputDir, basename(src));
    try {
      let img = sharpFn(src);
      if (opts.grayscale) img = img.grayscale();
      if (opts.denoise)   img = img.median(3);
      if (opts.sharpenSigma > 0) img = img.sharpen({ sigma: opts.sharpenSigma });
      // threshold(0) means Otsu automatic; Sharp's threshold() accepts 0–255
      img = img.threshold(opts.threshold);
      await img.png({ compressionLevel: 6 }).toFile(dest);
      results.push(dest);
    } catch (err: any) {
      console.warn(`[Pipeline] Preprocessing failed for ${src}: ${err.message} — using original`);
      results.push(src);
    }
  }

  return results;
}

// ── Text normalisation ────────────────────────────────────────────────────────

/** Unicode ligature → ASCII pairs that OCR engines and pdftotext commonly emit. */
const LIGATURE_MAP: Array<[RegExp, string]> = [
  [/ﬀ/g, "ff"],   // ﬀ
  [/ﬁ/g, "fi"],   // ﬁ
  [/ﬂ/g, "fl"],   // ﬂ
  [/ﬃ/g, "ffi"],  // ﬃ
  [/ﬄ/g, "ffl"],  // ﬄ
  [/ﬅ/g, "st"],   // ﬅ
  [/ﬆ/g, "st"],   // ﬆ
  [/­/g, ""],     // soft hyphen — remove entirely
];

/**
 * Produce a clean, normalised string suitable for chunking and embedding.
 * Input should be the output of buildCleanText (noise blocks already filtered).
 *
 * Transformations (in order):
 *   1. Unicode NFC
 *   2. Ligature expansion + soft-hyphen removal
 *   3. Dehyphenation: "charac-\nter" → "character"
 *      Only fires when a letter precedes the hyphen-newline and a lowercase
 *      letter follows — preserves intentional hyphenated compounds.
 *   4. Horizontal whitespace collapse (tabs, multiple spaces → single space)
 *   5. Trailing whitespace trimmed per line
 *   6. Runs of 3+ blank lines collapsed to two
 *
 * rawText is NEVER passed through this function — it must remain verbatim.
 */
function normaliseText(text: string): string {
  if (!text) return text;
  let t = text.normalize("NFC");
  for (const [re, rep] of LIGATURE_MAP) t = t.replace(re, rep);
  t = t.replace(/([a-zA-Z])-\n[ \t]*([a-z])/g, "$1$2");
  t = t.replace(/[ \t]{2,}/g, " ");
  t = t.replace(/[ \t]+$/gm, "");
  t = t.replace(/\n{3,}/g, "\n\n");
  return t.trim();
}

/**
 * Extract embedded text from a block of PDF pages in a single pdftotext call.
 * Pages are separated by form-feed (\f) in the output; returns one string per
 * page. Empty strings indicate pages with no embedded text layer.
 */
async function extractNativePdfTextBatch(
  pdfPath: string,
  firstPage: number,
  lastPage: number,
): Promise<string[]> {
  const { stdout } = await execFileAsync(
    "pdftotext",
    ["-f", String(firstPage), "-l", String(lastPage), "-layout", pdfPath, "-"],
    { timeout: 60_000 },
  );
  // pdftotext terminates each page with \f, including the last one
  const pages = stdout.split("\f");
  if (pages.length > 0 && pages[pages.length - 1].trim() === "") pages.pop();
  const count = lastPage - firstPage + 1;
  while (pages.length < count) pages.push("");
  return pages.slice(0, count);
}

/**
 * Returns true when pdftotext output contains enough printable characters to
 * be considered a real embedded text layer. Image-only pages produce empty or
 * near-empty output (whitespace, stray control chars) and return false.
 */
function hasUsableEmbeddedText(raw: string): boolean {
  return raw.replace(/[\s\x00-\x1F\x7F]/g, "").length >= 50;
}

/**
 * Token-level F1 similarity between native PDF text and OCR output (0–1).
 * Tokenises on word boundaries, deduplicates each side, then measures
 * precision and recall of OCR tokens against the native token set.
 * Returns 0 when either input produces no tokens.
 */
function nativeTextSimilarity(native: string, ocr: string): number {
  const tokenize = (s: string): string[] => s.toLowerCase().match(/\b[a-z0-9']+\b/g) ?? [];
  const tokNative = tokenize(native);
  const tokOcr    = tokenize(ocr);
  if (tokNative.length === 0 || tokOcr.length === 0) return 0;
  const uniqNative = Array.from(new Set(tokNative));
  const setOcr     = new Set(tokOcr);
  const intersection = uniqNative.filter(t => setOcr.has(t)).length;
  const precision = intersection / setOcr.size;
  const recall    = intersection / uniqNative.length;
  if (precision + recall === 0) return 0;
  return Math.round((2 * precision * recall / (precision + recall)) * 100) / 100;
}

async function countPdfPages(pdfPath: string): Promise<number> {
  try {
    const { stdout } = await execFileAsync("pdfinfo", [pdfPath], { timeout: 30_000 });
    const match = stdout.match(/^Pages:\s*(\d+)/m);
    return match ? parseInt(match[1], 10) : Infinity;
  } catch {
    return Infinity; // unknown — treat as unlimited
  }
}

async function convertToPages(
  sourceFile: string,
  pagesDir: string,
  firstPage: number,
  lastPage: number,
): Promise<string[]> {
  if (/\.(png|jpe?g|webp|tiff?)$/i.test(sourceFile)) {
    return [sourceFile];
  }
  if (/\.pdf$/i.test(sourceFile)) {
    const outputPrefix = join(pagesDir, "page");
    await execFileAsync(
      "pdftoppm",
      ["-png", "-r", String(pipelineConfig.pipeline.pdfDpi), "-f", String(firstPage), "-l", String(lastPage), sourceFile, outputPrefix],
      { timeout: 180_000 },
    );
    const files = await readdir(pagesDir);
    return files
      .filter(f => f.endsWith(".png"))
      .sort()
      .map(f => join(pagesDir, f));
  }
  throw new Error(`Unsupported source format: ${sourceFile}. Expected .pdf or image file.`);
}

async function imageContent(filePath: string): Promise<{ type: "image_url"; image_url: { url: string } }> {
  const b64 = await readFile(filePath, "base64");
  return { type: "image_url", image_url: { url: `data:image/png;base64,${b64}` } };
}
