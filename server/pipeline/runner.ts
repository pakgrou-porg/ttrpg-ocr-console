import { execFile } from "child_process";
import { promisify } from "util";
import { readFile, mkdir, readdir } from "fs/promises";
import { join, basename } from "path";
import { pipelineConfig } from "./config";
import type { BinarizeConfig } from "./config";
import {
  getIngestionJobById, updateIngestionJobStatus,
  createIngestionJob,
  createDocument, updateDocument,
  createDocumentPage, updateDocumentPage,
  createOcrResult, updateOcrResult, createHitlItem, updateHitlItem,
  getPageById, getDocumentById,
  getOcrResultByPageId,
  getPageByDocumentAndNumber,
  createContentSummary,
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

layout_type must be one of: cover, title_page, toc, chapter_header, body_text, stat_block, table, illustration_full, illustration_with_text, index, appendix, mixed`;

const PROMPT_BBOX_DETECTION = `You are a document content-region detector for TTRPG publications.
Identify distinct content regions in the page image and estimate each region's bounding box.
${STRICT_RULES}

Required output schema (list every visible region):
{"regions":[{"type":"…","label":"…","bbox":{"x":0,"y":0,"w":100,"h":100}}]}

type must be one of: heading, subheading, paragraph, table, list, image, stat_block, sidebar, caption, header, footer, page_number
bbox values are percentages of the page width/height (0–100). x,y = top-left corner; w,h = width and height.
Estimate bounding boxes as precisely as possible from the visual layout.`;

const PROMPT_OCR_EXTRACTION = `You are an OCR text extraction system for TTRPG document pages.
Extract ALL readable text from the page image in reading order.
${STRICT_RULES}

Required output schema (include every readable text block):
{"confidence":91,"content_blocks":[{"type":"…","text":"…","sequence":1}],"page_summary":"…"}

confidence is an integer 0–100 reflecting extraction accuracy.
type must be one of: heading, subheading, paragraph, list_item, table, caption, stat_line, page_number, sidebar

MULTI-COLUMN PAGES: Extract every column completely. Read left-to-right across columns, top-to-bottom within each column. Never stop mid-page — if context indicates N columns, produce content_blocks from all N columns.

IMPORTANT — tables MUST use this schema (never flatten a table into a text string):
{"type":"table","caption":"optional title","headers":["Col1","Col2","Col3"],"rows":[["r1c1","r1c2","r1c3"],["r2c1","r2c2","r2c3"]],"sequence":N}
If a column value is blank or not applicable use "" (empty string). Preserve ALL columns and ALL rows exactly as they appear.`;

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
];

const FEW_SHOT_BBOX: InvokeOptions["fewShotExamples"] = [
  {
    user: "Identify all distinct content regions on this page. Reply with ONLY a JSON object — start with { and end with }.",
    assistant: '{"regions":[{"type":"heading","label":"Chapter 3: Weapons","bbox":{"x":5,"y":3,"w":90,"h":7}},{"type":"paragraph","label":"Chapter intro text","bbox":{"x":5,"y":12,"w":90,"h":18}},{"type":"table","label":"Weapon damage table","bbox":{"x":5,"y":33,"w":90,"h":45}},{"type":"caption","label":"Table 3-1 footnote","bbox":{"x":5,"y":80,"w":70,"h":4}}]}',
  },
  {
    user: "Identify all distinct content regions on this page. Reply with ONLY a JSON object — start with { and end with }.",
    assistant: '{"regions":[{"type":"image","label":"Full-page illustration: dungeon battle scene","bbox":{"x":0,"y":0,"w":100,"h":92}},{"type":"caption","label":"Illustration credit text","bbox":{"x":5,"y":93,"w":90,"h":4}}]}',
  },
  {
    user: "Identify all distinct content regions on this page. Reply with ONLY a JSON object — start with { and end with }.",
    assistant: '{"regions":[{"type":"header","label":"Player\'s Handbook","bbox":{"x":0,"y":0,"w":100,"h":4}},{"type":"heading","label":"Ability Scores","bbox":{"x":5,"y":6,"w":90,"h":5}},{"type":"paragraph","label":"Ability score description","bbox":{"x":5,"y":13,"w":44,"h":35}},{"type":"stat_block","label":"Strength stat block","bbox":{"x":51,"y":13,"w":44,"h":35}},{"type":"table","label":"Ability modifier table","bbox":{"x":5,"y":52,"w":44,"h":42}},{"type":"sidebar","label":"Variant: Customizing ability scores","bbox":{"x":51,"y":52,"w":44,"h":42}},{"type":"page_number","label":"12","bbox":{"x":90,"y":96,"w":8,"h":3}}]}',
  },
];

const FEW_SHOT_OCR: InvokeOptions["fewShotExamples"] = [
  {
    user: "Extract all readable text from this page in reading order. Reply with ONLY a JSON object — start with { and end with }.",
    assistant: '{"confidence":91,"content_blocks":[{"type":"heading","text":"Special Thanks to","sequence":1},{"type":"paragraph","text":"Whenever a project of this size is put together, there are many people who give their time and extra effort to see it through.","sequence":2},{"type":"list_item","text":"To Jon Pickens, who produced many obscure reference books.","sequence":3}],"page_summary":"Acknowledgements page crediting contributors to the book."}',
  },
  {
    user: "Extract all readable text from this page in reading order. Reply with ONLY a JSON object — start with { and end with }.",
    assistant: '{"confidence":90,"content_blocks":[{"type":"heading","text":"Intelligence & Spell Knowledge","sequence":1},{"type":"paragraph","text":"The table below shows a wizard\'s chance to know each listed spell and the min/max spells per level based on Intelligence score.","sequence":2},{"type":"table","caption":"Chance to Know Each Listed Spell","headers":["Intelligence","Chance to Know Spell","Min Spells/Level","Max Spells/Level"],"rows":[["9","35%","6",""],["10","45%","7",""],["11","45%","7",""],["12","45%","7",""],["13","55%","9",""],["14","55%","9",""],["15","65%","11",""],["16","65%","11",""],["17","75%","14",""],["18","85%","18",""],["19","95%","All",""],["20","96%","All",""],["21","97%","All",""],["22","98%","All",""],["23","99%","All",""],["24","100%","All",""],["25","100%","All",""]],"sequence":3}],"page_summary":"Intelligence-based spell knowledge table for wizard characters showing chance to know spells and spells per level."}',
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

const PROMPT_TABULAR_EXTRACTION = `You are a table and stat block extraction specialist for TTRPG publications.
Extract ALL tables, stat blocks, and structured data grids from this page image with complete accuracy.
${STRICT_RULES}

Required output schema:
{"tables":[{"type":"stat_block","caption":"Goblin","headers":["AC","HP","Speed"],"rows":[["15","7 (2d6)","30 ft."]],"ability_scores":{"STR":8,"DEX":14,"CON":10,"INT":10,"WIS":8,"CHA":8},"challenge_rating":"1/4","xp":50}]}

type must be one of: stat_block, generic, spell_list, equipment, ability_scores
Preserve ALL columns, ALL rows, ALL headers exactly. Never truncate or merge cells.
TTRPG abbreviations (AC, HP, STR, DEX, CON, INT, WIS, CHA, CR, XP, DC, d4/d6/d8/d10/d12/d20) must never be expanded.
For stat_block type: include ability_scores, challenge_rating, and xp when visible.
If no tables are present, return {"tables":[]}.`;

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
    assistant: '{"tables":[{"type":"stat_block","caption":"Goblin","headers":["AC","HP","Speed"],"rows":[["15 (leather armor, shield)","7 (2d6)","30 ft."]],"ability_scores":{"STR":8,"DEX":14,"CON":10,"INT":10,"WIS":8,"CHA":8},"challenge_rating":"1/4","xp":50}]}',
  },
  {
    user: "Extract ALL tables and stat blocks from this page with complete accuracy. Reply with ONLY a JSON object — start with { and end with }.",
    assistant: '{"tables":[{"type":"generic","caption":"Random Trinkets","headers":["d100","Trinket"],"rows":[["01","A mummified goblin hand"],["02","A piece of crystal that faintly glows in the moonlight"],["03","A small cloth doll skewered with needles"],["04","A copper coin minted in an unknown land"]]}]}',
  },
  {
    user: "Extract ALL tables and stat blocks from this page with complete accuracy. Reply with ONLY a JSON object — start with { and end with }.",
    assistant: '{"tables":[{"type":"spell_list","caption":"Cleric Spells","headers":["Spell Level","Spell Name","Casting Time","Range","Duration"],"rows":[["Cantrip","Guidance","1 action","Touch","Concentration, up to 1 minute"],["Cantrip","Sacred Flame","1 action","60 ft.","Instantaneous"],["1st","Cure Wounds","1 action","Touch","Instantaneous"],["1st","Guiding Bolt","1 action","120 ft.","1 round"]]}]}',
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

// ── Concurrency limiter ───────────────────────────────────────────────────────
// Shared across all concurrent jobs — at most 4 pages may be in the LLM-call
// stages (layout → bbox → OCR) simultaneously to avoid overwhelming the local
// inference server and triggering 5-minute timeouts.

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

/** Extract the printed page label (e.g. "i", "42") from OCR content blocks. */
function extractPrintedPageLabel(data: Record<string, unknown>): string | null {
  if (!Array.isArray(data.content_blocks)) return null;
  const block = (data.content_blocks as any[]).find((b: any) => b.type === "page_number");
  const label = block?.text?.trim() ?? null;
  return label || null;
}

/** Build the rawText string from OCR content blocks (tables rendered as TSV). Never modified. */
function buildRawText(data: Record<string, unknown>): string {
  if (!Array.isArray(data.content_blocks)) return JSON.stringify(data);
  return (data.content_blocks as any[]).map((b: any) => {
    if (b.type === "table") {
      const caption = b.caption ? `[Table: ${b.caption}]\n` : "[Table]\n";
      const headers = Array.isArray(b.headers) ? b.headers.join("\t") + "\n" : "";
      const rows = Array.isArray(b.rows)
        ? (b.rows as any[][]).map((r: any[]) => r.join("\t")).join("\n")
        : "";
      return caption + headers + rows;
    }
    return b.text ?? "";
  }).filter(Boolean).join("\n\n");
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
      (b: any) => !NOISE_BLOCK_TYPES.has(b.type),
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
    .filter((b: any) => !NOISE_BLOCK_TYPES.has(b.type))
    .map((b: any) => {
    switch (b.type) {
      case "heading":    return `## ${b.text ?? ""}`;
      case "subheading": return `### ${b.text ?? ""}`;
      case "table": {
        const lines: string[] = [];
        if (b.caption) lines.push(`**${b.caption}**`);
        const headers: string[] = Array.isArray(b.headers) ? b.headers : [];
        if (headers.length > 0) {
          lines.push(`| ${headers.join(" | ")} |`);
          lines.push(`| ${headers.map(() => "---").join(" | ")} |`);
        }
        if (Array.isArray(b.rows)) {
          for (const row of b.rows as string[][]) {
            const cells = headers.length > 0
              ? row.slice(0, headers.length).concat(Array(Math.max(0, headers.length - row.length)).fill(""))
              : row;
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
 * Merge higher-accuracy tabular_extraction results into OCR structured data.
 * Replaces existing table content_blocks in order; appends any extras found.
 */
function mergeTabularExtraction(
  ocrData: Record<string, unknown>,
  extractedTables: any[],
): Record<string, unknown> {
  if (!Array.isArray(ocrData.content_blocks) || extractedTables.length === 0) return ocrData;

  let tableIdx = 0;
  const merged = (ocrData.content_blocks as any[]).map((block: any) => {
    if (block.type !== "table" || tableIdx >= extractedTables.length) return block;
    const t = extractedTables[tableIdx++];
    return {
      type: "table",
      caption: t.caption ?? t.entity_name ?? block.caption,
      headers: t.headers ?? block.headers ?? [],
      rows: t.rows ?? block.rows ?? [],
      table_type: t.type,
      ...(t.ability_scores    ? { ability_scores: t.ability_scores }     : {}),
      ...(t.challenge_rating  ? { challenge_rating: t.challenge_rating } : {}),
      ...(t.xp !== undefined  ? { xp: t.xp }                            : {}),
      sequence: block.sequence,
    };
  });

  // Append any extra tables not matched to an OCR block
  while (tableIdx < extractedTables.length) {
    const t = extractedTables[tableIdx++];
    merged.push({
      type: "table",
      caption: t.caption ?? t.entity_name,
      headers: t.headers ?? [],
      rows: t.rows ?? [],
      table_type: t.type,
      ...(t.ability_scores   ? { ability_scores: t.ability_scores }     : {}),
      ...(t.challenge_rating ? { challenge_rating: t.challenge_rating } : {}),
      ...(t.xp !== undefined ? { xp: t.xp }                            : {}),
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

// ── Public entry point ────────────────────────────────────────────────────────

export function startJob(jobId: number): void {
  setImmediate(() => {
    runJob(jobId).catch(err => {
      console.error(`[Pipeline] Job ${jobId} unhandled error:`, err);
    });
  });
}

// ── Internal runner ───────────────────────────────────────────────────────────

async function runJob(jobId: number): Promise<void> {
  console.log(`[Pipeline] Starting job ${jobId}`);
  try {
    await _runJob(jobId);
  } catch (err: any) {
    console.error(`[Pipeline] Job ${jobId} failed:`, err.message);
    await updateIngestionJobStatus(jobId, {
      status: "failed",
      errorMessage: err.message,
      completedAt: new Date(),
    }).catch(() => {});
  }
}

async function _runJob(jobId: number): Promise<void> {
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

  const createdDoc = await createDocument({
    filename: basename(sourceFile),
    gameSystem: job.gameSystem ?? undefined,
    status: "phase1_non_ocr",
    ingestionJobId: jobId,
  });
  const documentId = createdDoc.id;

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
  let prevRawText: string | null = null; // tail of previous page — fed to content_break_detect

  // Region types that contain visual content — original image must be used for these.
  const VISUAL_REGION_TYPES = new Set(["illustration", "image", "map", "graphic", "advertisement"]);

  for (let i = 0; i < pageFiles.length; i++) {
    const pageNum = pageOffset + i + 1;
    const pageId = pageIds[i];
    const pagePath = pageFiles[i];         // preprocessed (binarized/grayscale) — use for text stages
    const rawPagePath = rawPageFiles[i];   // original full-colour — use for visual content stages
    const stagesFailed: string[] = [];
    let ocrConfidence = 0;
    let nativeSimilarity: number | null = null;
    let ocrResultId: number | null = null;
    let currentRawText: string | null = null; // set when OCR succeeds; used by content_break_detect

    await updateIngestionJobStatus(jobId, { currentStage: "layout_analysis", processedPages });

    // Preprocessed image: used for layout, bbox, OCR, tabular (text clarity wins)
    const imgPart = await imageContent(pagePath);
    // Original image: lazily resolved below only when visual regions are detected
    let origImgPart: Awaited<ReturnType<typeof imageContent>> | null = null;

    await PAGE_LLM_SEMAPHORE.acquire();
    console.log(`[Pipeline] Job ${jobId}: page ${pageNum} acquired LLM slot`);
    try {

    // layout_analysis
    let layoutData: Record<string, unknown> = {};
    try {
      const layoutContent: UserContentPart[] = [imgPart, { type: "text", text: "Classify the layout type and structure of this page. Reply with ONLY a JSON object — start with { and end with }." }];
      const r = await invokeStage("layout_analysis", layoutContent, undefined, PROMPT_LAYOUT_ANALYSIS,
        { ...JSON_INVOKE_OPTS, fewShotExamples: FEW_SHOT_LAYOUT }, { pageId, jobId });
      layoutData = parseJsonResponse(r.content);
      await updateDocumentPage(pageId, { layoutType: (layoutData.layout_type as string) || undefined });
    } catch (err: any) {
      if (isConfigError(err)) throw err; // fatal — halt job
      stagesFailed.push("layout_analysis");
      console.warn(`[Pipeline] Job ${jobId} p${pageNum} layout_analysis: ${err.message}`);
    }

    // bbox_detection (optional — no provider is acceptable, any other config error is fatal)
    let regions: any[] = [];
    try {
      await updateIngestionJobStatus(jobId, { currentStage: "bbox_detection" });
      const bboxContent: UserContentPart[] = [imgPart, { type: "text", text: "Identify all distinct content regions on this page. Reply with ONLY a JSON object — start with { and end with }." }];
      const r = await invokeStage("bbox_detection", bboxContent, undefined, PROMPT_BBOX_DETECTION,
        { ...JSON_INVOKE_OPTS, fewShotExamples: FEW_SHOT_BBOX }, { pageId, jobId });
      const data = parseJsonResponse(r.content);
      regions = Array.isArray(data.regions) ? data.regions : [];
      await updateDocumentPage(pageId, { contentRegions: regions });
    } catch (err: any) {
      if (isConfigError(err)) throw err; // fatal — halt job (bbox stage explicitly configured but broken)
      console.warn(`[Pipeline] Job ${jobId} p${pageNum} bbox_detection: ${err.message}`);
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
      const regionContext = contextParts.length > 0 ? contextParts.join("\n") : undefined;
      const ocrContent: UserContentPart[] = [imgPart, { type: "text", text: "Extract all readable text from this page in reading order. Reply with ONLY a JSON object — start with { and end with }." }];
      const r = await invokeStage("ocr_extraction", ocrContent, regionContext, PROMPT_OCR_EXTRACTION,
        { ...JSON_INVOKE_OPTS, fewShotExamples: FEW_SHOT_OCR }, { pageId, jobId });
      const data = parseJsonResponse(r.content);
      ocrConfidence = typeof data.confidence === "number" ? data.confidence : 0;

      currentRawText = buildRawText(data);
      const nt = nativePageTexts[i];
      nativeSimilarity = nt !== null ? nativeTextSimilarity(nt, currentRawText) : null;
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

        await updateDocumentPage(pageId, {
          ...(contObj ? {
            continuityFlags: {
              continuesFromPreviousPage:        !!contObj.continues_from_previous_page,
              continuesToNextPage:              !!contObj.continues_to_next_page,
              midSentenceBreakAtEnd:            !!contObj.mid_sentence_break_at_end,
              sectionContinuesFromPreviousPage: !!contObj.section_continues_from_previous_page,
            },
          } : {}),
          structuralBreaks: breaks.map((b: any) => ({
            breakType: b.break_type,
            headingText: b.heading_text ?? "",
            position: b.position ?? 1,
          })),
        });

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
      // Advance so next page's content_break_detect gets THIS page as its prevRawText
      prevRawText = currentRawText;
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
        const tableCtx = tableRegions.length > 0
          ? `Table/stat-block regions detected: ${JSON.stringify(tableRegions)}`
          : undefined;
        const tabContent: UserContentPart[] = [
          imgPart,
          { type: "text", text: "Extract ALL tables and stat blocks from this page with complete accuracy. Reply with ONLY a JSON object — start with { and end with }." },
        ];
        const tabResult = await invokeStage("tabular_extraction", tabContent, tableCtx, PROMPT_TABULAR_EXTRACTION,
          { ...JSON_INVOKE_OPTS, fewShotExamples: FEW_SHOT_TABULAR }, { pageId, jobId });
        const tabData = parseJsonResponse(tabResult.content);

        if (Array.isArray(tabData.tables) && tabData.tables.length > 0) {
          const existing = await getOcrResultByPageId(pageId);
          if (existing?.structuredData) {
            const mergedData = mergeTabularExtraction(existing.structuredData, tabData.tables);
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
      } catch (err: any) {
        if (isConfigError(err)) throw err;
        console.warn(`[Pipeline] Job ${jobId} p${pageNum} tabular_extraction: ${err.message}`);
      }
    }

    // Queue for HITL review: stage failure, low model confidence, or significant
    // divergence from the embedded PDF text (ground truth for digital-native PDFs).
    const poorNativeAlignment = nativeSimilarity !== null && nativeSimilarity < NATIVE_SIMILARITY_THRESHOLD;
    const needsHitl = stagesFailed.length > 0 || ocrConfidence < HITL_CONFIDENCE_THRESHOLD || poorNativeAlignment;
    if (needsHitl) {
      const reasonParts: string[] = [`Page ${pageNum} of ${totalDocPages}`];
      if (stagesFailed.length > 0) reasonParts.push(`failed stages: ${stagesFailed.join(", ")}`);
      if (ocrConfidence < HITL_CONFIDENCE_THRESHOLD) reasonParts.push(`low confidence: ${ocrConfidence}%`);
      if (poorNativeAlignment) reasonParts.push(`native text divergence: ${Math.round(nativeSimilarity! * 100)}% similarity`);
      await createHitlItem({
        pageId,
        ocrResultId: ocrResultId ?? undefined,
        reason: reasonParts.join(" — "),
        flagCategory: stagesFailed.length > 0 ? "stage_failure"
          : poorNativeAlignment ? "native_text_divergence"
          : "low_confidence",
        priority: stagesFailed.includes("ocr_extraction") || ocrConfidence < 50
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
    processedPages,
    avgConfidence,
    totalPages: pageFiles.length,
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
      pageOffset: nextOffset,
      blockSize,
      status: "queued",
    } as any);
    startJob(nextJobId);
  }
}

// ── Page retry (called from HITL UI) ─────────────────────────────────────────

export type RetryStage = "layout_analysis" | "bbox_detection" | "ocr_extraction";

export async function retryPageStages(
  pageId: number,
  stages: RetryStage[],
  hitlId?: number,
): Promise<{ confidence: number; stagesFailed: string[] }> {
  const page = await getPageById(pageId);
  if (!page) throw new Error(`Page ${pageId} not found`);
  if (!page.rawPngUrl) throw new Error(`Page ${pageId} has no image on disk`);

  const [doc, prevPage, nextPage] = await Promise.all([
    getDocumentById(page.documentId),
    getPageByDocumentAndNumber(page.documentId, page.pageNumber - 1),
    getPageByDocumentAndNumber(page.documentId, page.pageNumber + 1),
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
  let ocrConfidence = 0;

  await PAGE_LLM_SEMAPHORE.acquirePriority();
  console.log(`[Pipeline] Page ${pageId} retry: acquired LLM slot (stages: ${stages.join(", ")})`);
  try {
    // layout_analysis
    if (stages.includes("layout_analysis")) {
      try {
        const content: UserContentPart[] = [imgPart, { type: "text", text: "Classify the layout type and structure of this page. Reply with ONLY a JSON object — start with { and end with }." }];
        const r = await invokeStage("layout_analysis", content, surroundingContext, PROMPT_LAYOUT_ANALYSIS,
          { ...JSON_INVOKE_OPTS, fewShotExamples: FEW_SHOT_LAYOUT }, { pageId, jobId: doc?.ingestionJobId ?? undefined });
        const data = parseJsonResponse(r.content);
        await updateDocumentPage(pageId, { layoutType: (data.layout_type as string) || undefined });
      } catch (err: any) {
        if (isConfigError(err)) throw err;
        stagesFailed.push("layout_analysis");
        console.warn(`[Pipeline] Page ${pageId} retry layout_analysis: ${err.message}`);
      }
    }

    // bbox_detection — use existing regions if not re-running
    let regions: any[] = stages.includes("bbox_detection") ? [] : ((page.contentRegions as any[]) ?? []);
    if (stages.includes("bbox_detection")) {
      try {
        const content: UserContentPart[] = [imgPart, { type: "text", text: "Identify all distinct content regions on this page. Reply with ONLY a JSON object — start with { and end with }." }];
        const r = await invokeStage("bbox_detection", content, surroundingContext, PROMPT_BBOX_DETECTION,
          { ...JSON_INVOKE_OPTS, fewShotExamples: FEW_SHOT_BBOX }, { pageId, jobId: doc?.ingestionJobId ?? undefined });
        const data = parseJsonResponse(r.content);
        regions = Array.isArray(data.regions) ? data.regions : [];
        await updateDocumentPage(pageId, { contentRegions: regions });
      } catch (err: any) {
        if (isConfigError(err)) throw err;
        stagesFailed.push("bbox_detection");
        console.warn(`[Pipeline] Page ${pageId} retry bbox_detection: ${err.message}`);
      }
    }

    // ocr_extraction
    if (stages.includes("ocr_extraction")) {
      try {
        const regionCtx = regions.length > 0
          ? `Content regions already detected: ${JSON.stringify(regions.slice(0, 5))}`
          : undefined;
        const fullContext = [surroundingContext, regionCtx].filter(Boolean).join("\n\n") || undefined;
        const content: UserContentPart[] = [imgPart, { type: "text", text: "Extract all readable text from this page in reading order. Reply with ONLY a JSON object — start with { and end with }." }];
        const r = await invokeStage("ocr_extraction", content, fullContext, PROMPT_OCR_EXTRACTION,
          { ...JSON_INVOKE_OPTS, fewShotExamples: FEW_SHOT_OCR }, { pageId, jobId: doc?.ingestionJobId ?? undefined });
        const data = parseJsonResponse(r.content);
        ocrConfidence = typeof data.confidence === "number" ? data.confidence : 0;

        const rawText = buildRawText(data);
        const markdownText = buildMarkdownText(data);
        const normalisedText = normaliseText(buildCleanText(data));
        const printedPageLabel = extractPrintedPageLabel(data);

        const existing = await getOcrResultByPageId(pageId);
        if (existing) {
          await updateOcrResult(existing.id, {
            structuredData: data, rawText, markdownText, normalisedText, confidence: ocrConfidence,
            status: "pass1_complete", pass1Model: r.model,
            auditLog: [...((existing.auditLog as any[]) ?? []),
              { timestamp: new Date().toISOString(), action: "retry", model: r.model }],
          } as any);
        } else {
          await createOcrResult({
            pageId, structuredData: data, rawText, markdownText, normalisedText, confidence: ocrConfidence,
            status: "pass1_complete", pass1Model: r.model,
            auditLog: [{ timestamp: new Date().toISOString(), action: "retry", model: r.model }],
          } as any);
        }
        await updateDocumentPage(pageId, {
          ocrCompleted: true, ocrConfidence,
          printedPageLabel: printedPageLabel ?? "[unnumbered]",
        });
      } catch (err: any) {
        if (isConfigError(err)) throw err;
        stagesFailed.push("ocr_extraction");
        console.warn(`[Pipeline] Page ${pageId} retry ocr_extraction: ${err.message}`);
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
      if (ocrConfidence < HITL_CONFIDENCE_THRESHOLD) parts.push(`confidence ${ocrConfidence}%`);
      await updateHitlItem(hitlId, { resolutionNotes: parts.join(" — ") });
    }
  }

  console.log(`[Pipeline] Page ${pageId} retry done (confidence: ${ocrConfidence}, failed: ${stagesFailed.join(", ") || "none"})`);
  return { confidence: ocrConfidence, stagesFailed };
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
