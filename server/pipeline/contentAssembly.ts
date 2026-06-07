/**
 * Content Assembly pipeline stage.
 *
 * Reads all OCR content_blocks for a completed document and assembles them into
 * a clean, reading-order content flow stored in document_content_blocks.
 *
 * What this stage does:
 *  1. Strips noise: page_number, header, footer, advertisement blocks.
 *  2. Detects running headers (title/chapter text repeated as first block on
 *     many pages) and removes them.
 *  3. Merges paragraphs/lists that are split across a physical page boundary,
 *     using the continuityFlags written by content_break_detect.
 *  4. Preserves headings, tables, rule_terms, stat_blocks, and illustrations
 *     as discrete blocks with type-specific metadata.
 *  5. Stores the resulting flow as document_content_blocks rows — idempotent,
 *     safe to re-run (deletes and rebuilds on each call).
 *
 * This stage runs in the !hasMore block of _runJob, after all pages are done
 * and after resolveContentSummaryBoundaries but before generateSectionSummaries.
 */

import {
  getPagesByDocumentId,
  getOcrResultsByPageIds,
  deleteContentBlocksByDocumentId,
  createDocumentContentBlocks,
} from "../db";
import type { InsertDocumentContentBlock } from "../../drizzle/schema";

// ─── Block-type constants ──────────────────────────────────────────────────────

/** Block types that are page furniture — strip from the content flow. */
const STRIP_TYPES = new Set([
  "page_number", "folio", "running_header", "running_footer",
]);

/**
 * Block types that are decorative / non-body even without position data.
 * We strip these regardless of page position.
 */
const DECORATIVE_TYPES = new Set([
  "advertisement", "header", "footer",
]);

/**
 * Block types whose text/structured content can be merged across a page break.
 * Headings, tables, and visual blocks are never merged — only continuous prose.
 */
const MERGEABLE_TYPES = new Set([
  "paragraph", "list", "list_item", "sidebar", "callout",
  "rule_term", "epigraph", "quote", "caption",
]);

/** Block types that carry structured table data (stored in table_data field). */
const STRUCTURED_TYPES = new Set(["table", "stat_block"]);

// ─── Block-level helpers ───────────────────────────────────────────────────────

/**
 * Normalise legacy/variant block_type aliases to canonical names.
 * Some OCR models emit "text" for paragraph, "subheading" for heading, etc.
 */
function normaliseBlockType(raw: string | undefined | null): string {
  const t = (raw ?? "unknown").trim().toLowerCase();
  switch (t) {
    case "text":        return "paragraph";
    case "subheading":  return "heading";
    case "list_item":   return "list";
    case "item":        return "list";
    default:            return t;
  }
}

/**
 * Extract a plain-text string from an OCR content_block.
 *
 * Handles the various block shapes produced by different OCR pass models:
 *   - paragraph / heading: { text: "..." }
 *   - rule_term: { term: "...", definition: "..." }
 *   - table: { caption?, headers[], rows[][] }  → readable text summary
 *   - stat_block: { stat_block_text: "..." } or { text: "..." }
 */
function extractBlockText(block: Record<string, unknown>): string {
  // rule_term: combine term + definition
  if (typeof block.term === "string" && typeof block.definition === "string") {
    const term = block.term.trim();
    const def  = block.definition.trim();
    return term && def ? `${term}: ${def}` : term || def;
  }
  if (typeof block.term === "string" && block.term.trim()) {
    return block.term.trim();
  }

  // table: build a readable text block for searching / display
  if (STRUCTURED_TYPES.has(normaliseBlockType(block.block_type as string ?? block.type as string))) {
    const caption = typeof block.caption === "string" ? block.caption.trim() : "";
    const headers: string[] = Array.isArray(block.headers)
      ? (block.headers as unknown[]).map(h => String(h ?? "")).filter(Boolean)
      : [];
    const rows: unknown[][] = Array.isArray(block.rows) ? block.rows as unknown[][] : [];
    const lines: string[] = [];
    if (caption) lines.push(caption);
    if (headers.length) lines.push(headers.join(" | "));
    for (const row of rows.slice(0, 8)) {
      if (Array.isArray(row)) {
        lines.push((row as unknown[]).map(c => String(c ?? "")).join(" | "));
      }
    }
    return lines.join("\n").trim();
  }

  // stat_block dedicated field
  if (typeof block.stat_block_text === "string" && block.stat_block_text.trim()) {
    return block.stat_block_text.trim();
  }

  // Generic text field (most block types)
  if (typeof block.text === "string" && block.text.trim()) return block.text.trim();
  if (typeof block.content === "string" && block.content.trim()) return block.content.trim();

  return "";
}

/**
 * Extract structured data payload for table-type blocks.
 */
function extractTableData(
  block: Record<string, unknown>,
): { caption: string | null; headers: string[]; rows: unknown[][] } | null {
  const headers: string[] = Array.isArray(block.headers)
    ? (block.headers as unknown[]).map(h => String(h ?? ""))
    : [];
  const rows: unknown[][] = Array.isArray(block.rows) ? block.rows as unknown[][] : [];
  if (headers.length === 0 && rows.length === 0) return null;
  return {
    caption: typeof block.caption === "string" ? block.caption.trim() || null : null,
    headers,
    rows,
  };
}

/**
 * Extract block-specific metadata: heading level, list type, rule term, etc.
 */
function extractBlockMetadata(block: Record<string, unknown>): Record<string, unknown> {
  const meta: Record<string, unknown> = {};
  if (typeof block.level === "number")     meta.level     = block.level;
  if (typeof block.list_type === "string") meta.list_type = block.list_type;
  if (typeof block.term === "string")      meta.term      = block.term.trim();
  if (typeof block.caption === "string" && block.caption.trim()) {
    meta.caption = block.caption.trim();
  }
  return meta;
}

/**
 * Can the open cross-page block (openType) absorb the first block of the next
 * page (nextType)?  We only merge prose-like blocks, never headings or tables.
 */
function canMergeTypes(openType: string, nextType: string): boolean {
  return MERGEABLE_TYPES.has(openType) && MERGEABLE_TYPES.has(nextType);
}

/**
 * Concatenate the tail of page N's text with the head of page N+1's text,
 * respecting hyphenated line-breaks and mid-sentence continuation signals.
 */
function joinCrossPageText(prev: string, next: string, midSentenceBreak: boolean): string {
  const p = prev.trimEnd();
  const n = next.trimStart();
  if (!p) return n;
  if (!n) return p;

  // Hard hyphen at page boundary: "mag-" + "ic" → "magic"
  if (p.endsWith("-")) return p.slice(0, -1) + n;

  // Mid-sentence break or any other continuation: join with a space.
  // (Page-break does not imply paragraph break — both cases use a space.)
  return p + " " + n;
}

// ─── Running-header detection ──────────────────────────────────────────────────

/**
 * Identify "running header" text: a short heading/paragraph that appears as
 * the first content block on ≥20% of pages (min 3).
 *
 * These are book/chapter titles that are printed at the top of every leaf and
 * should be excluded from the assembled content flow.
 *
 * We normalise to lowercase for comparison but preserve original for logging.
 */
function detectRunningHeaderTexts(
  pagesWithBlocks: Array<{ blocks: Array<Record<string, unknown>> }>,
): Set<string> {
  const pageCount = pagesWithBlocks.length;
  if (pageCount < 5) return new Set(); // too few pages to detect a pattern reliably

  const firstTextCounts = new Map<string, number>();

  for (const { blocks } of pagesWithBlocks) {
    // Find the first block that isn't already stripped noise
    const firstBlock = blocks.find(b => {
      const t = normaliseBlockType((b.block_type as string) ?? (b.type as string));
      return !STRIP_TYPES.has(t) && !DECORATIVE_TYPES.has(t);
    });
    if (!firstBlock) continue;

    const text = extractBlockText(firstBlock).trim().toLowerCase();
    if (text.length > 0 && text.length <= 80) {
      firstTextCounts.set(text, (firstTextCounts.get(text) ?? 0) + 1);
    }
  }

  const threshold = Math.max(3, Math.floor(pageCount * 0.20));
  const runningHeaders = new Set<string>();
  firstTextCounts.forEach((count, text) => {
    if (count >= threshold) runningHeaders.add(text);
  });

  if (runningHeaders.size > 0) {
    console.log(
      `[ContentAssembly] Running headers detected (${runningHeaders.size}): ` +
      Array.from(runningHeaders).map(t => `"${t}"`).join(", "),
    );
  }

  return runningHeaders;
}

// ─── Open-block type ──────────────────────────────────────────────────────────

type OpenBlock = {
  documentId: number;
  blockType: string;
  content: string;
  tableData: { caption: string | null; headers: string[]; rows: unknown[][] } | null;
  startPageId: number;
  endPageId: number;
  startPageNumber: number;
  endPageNumber: number;
  sourceRegions: Array<{ pageId: number; pageNumber: number; blockIdx: number }>;
  isCrossPage: boolean;
  status: string;
  metadata: Record<string, unknown>;
};

function finaliseBlock(ob: OpenBlock, sequence: number): InsertDocumentContentBlock {
  return {
    ...ob,
    sequence,
    content: ob.content || null,
  };
}

// ─── Main export ──────────────────────────────────────────────────────────────

/**
 * Assemble the content flow for a document that has completed all per-page
 * pipeline stages.
 *
 * Called from runner.ts _runJob → !hasMore block, after
 * resolveContentSummaryBoundaries and before generateSectionSummaries.
 *
 * The function is idempotent: it deletes any existing content blocks before
 * writing new ones, so it is safe to re-trigger without manual cleanup.
 */
export async function assembleDocumentContent(documentId: number, jobId: number): Promise<void> {
  // 1. Load all pages in reading order
  const pages = await getPagesByDocumentId(documentId);
  if (pages.length === 0) {
    console.log(`[ContentAssembly] Doc ${documentId}: no pages found, skipping.`);
    return;
  }

  // 2. Bulk-fetch all OCR results (one query instead of N)
  const pageIds = pages.map(p => p.id);
  const ocrs = await getOcrResultsByPageIds(pageIds);
  const ocrMap = new Map(ocrs.map(r => [r.pageId, r]));

  // 3. Pre-build (page, blocks[]) pairs
  const pagesWithBlocks = pages.map(page => {
    const structured = ocrMap.get(page.id)?.structuredData as Record<string, unknown> | null | undefined;
    const blocks: Array<Record<string, unknown>> = Array.isArray(structured?.content_blocks)
      ? (structured!.content_blocks as Array<Record<string, unknown>>)
      : [];
    return { page, blocks };
  });

  // 4. Running-header detection (scans first block on every page)
  const runningHeaderTexts = detectRunningHeaderTexts(
    pagesWithBlocks.map(p => ({ blocks: p.blocks })),
  );

  // 5. Delete any previous assembly (idempotent re-run)
  await deleteContentBlocksByDocumentId(documentId);

  // 6. Walk all pages and assemble blocks ──────────────────────────────────────
  const assembled: InsertDocumentContentBlock[] = [];
  let sequence = 0;
  let openBlock: OpenBlock | null = null;

  for (const { page, blocks } of pagesWithBlocks) {
    const cf = page.continuityFlags as {
      continuesFromPreviousPage?: boolean;
      continuesToNextPage?: boolean;
      midSentenceBreakAtEnd?: boolean;
    } | null;

    const continuesFrom  = cf?.continuesFromPreviousPage  ?? false;
    const continuesTo    = cf?.continuesToNextPage         ?? false;
    const midSentBreak   = cf?.midSentenceBreakAtEnd       ?? false;

    if (blocks.length === 0) {
      // No OCR content on this page — close any pending cross-page block
      if (openBlock) {
        assembled.push(finaliseBlock(openBlock, ++sequence));
        openBlock = null;
      }
      continue;
    }

    // Find the first content block index (skip leading noise)
    let firstContentIdx = -1;
    for (let i = 0; i < blocks.length; i++) {
      const bt = normaliseBlockType((blocks[i].block_type as string) ?? (blocks[i].type as string));
      if (!STRIP_TYPES.has(bt) && !DECORATIVE_TYPES.has(bt)) {
        firstContentIdx = i;
        break;
      }
    }
    if (firstContentIdx === -1) {
      // All blocks on this page are noise
      if (openBlock) {
        assembled.push(finaliseBlock(openBlock, ++sequence));
        openBlock = null;
      }
      continue;
    }

    for (let idx = 0; idx < blocks.length; idx++) {
      const block    = blocks[idx];
      const blockType = normaliseBlockType((block.block_type as string) ?? (block.type as string));

      // ── Strip noise ─────────────────────────────────────────────────────────
      if (STRIP_TYPES.has(blockType) || DECORATIVE_TYPES.has(blockType)) continue;

      // ── Strip running headers (first content block only, matched by text) ───
      const blockText = extractBlockText(block);
      if (idx === firstContentIdx && runningHeaderTexts.has(blockText.trim().toLowerCase())) {
        continue;
      }

      const isFirstContent = idx === firstContentIdx;
      const isLastBlock    = idx === blocks.length - 1;

      // ── Should we merge with the open cross-page block? ──────────────────────
      const shouldMerge =
        openBlock !== null &&
        isFirstContent &&
        continuesFrom &&
        canMergeTypes(openBlock.blockType, blockType);

      if (shouldMerge && openBlock) {
        // Extend the open block
        if (blockText) {
          openBlock.content = joinCrossPageText(openBlock.content, blockText, midSentBreak);
        }
        openBlock.endPageId     = page.id;
        openBlock.endPageNumber = page.pageNumber;
        openBlock.isCrossPage   = true;
        openBlock.sourceRegions.push({ pageId: page.id, pageNumber: page.pageNumber, blockIdx: idx });

        if (isLastBlock && continuesTo) {
          // Keep open — will be extended on the next page
        } else {
          assembled.push(finaliseBlock(openBlock, ++sequence));
          openBlock = null;
        }
      } else {
        // ── Close any existing open block before opening a new one ─────────────
        if (openBlock) {
          assembled.push(finaliseBlock(openBlock, ++sequence));
          openBlock = null;
        }

        // ── Create a new block ─────────────────────────────────────────────────
        const newBlock: OpenBlock = {
          documentId,
          blockType,
          content:       blockText,
          tableData:     STRUCTURED_TYPES.has(blockType) ? extractTableData(block) : null,
          startPageId:   page.id,
          endPageId:     page.id,
          startPageNumber: page.pageNumber,
          endPageNumber:   page.pageNumber,
          sourceRegions: [{ pageId: page.id, pageNumber: page.pageNumber, blockIdx: idx }],
          isCrossPage:   false,
          status:        "assembled",
          metadata:      extractBlockMetadata(block),
        };

        // If this is the last block on the page AND the page continues onto the
        // next page, hold the block open to be extended.
        if (isLastBlock && continuesTo && MERGEABLE_TYPES.has(blockType)) {
          openBlock = newBlock;
        } else {
          assembled.push(finaliseBlock(newBlock, ++sequence));
        }
      }
    }
  }

  // Close any block still open at the end of the document
  if (openBlock) {
    assembled.push(finaliseBlock(openBlock, ++sequence));
  }

  // 7. Batch-insert all assembled blocks
  if (assembled.length > 0) {
    await createDocumentContentBlocks(assembled);
  }

  const crossPageCount = assembled.filter(b => b.isCrossPage).length;
  console.log(
    `[ContentAssembly] Doc ${documentId} (job ${jobId}): ` +
    `${assembled.length} blocks assembled from ${pages.length} pages` +
    (crossPageCount > 0 ? `, ${crossPageCount} cross-page merges` : "") + ".",
  );
}
