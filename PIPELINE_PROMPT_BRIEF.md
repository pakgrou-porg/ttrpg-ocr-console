# TTRPG OCR Pipeline — Prompt Engineering Brief

**Purpose:** This document is a complete specification of the pipeline's logic, decision points, and expected JSON structures for every LLM-driven stage. It is intended to be handed to a separate LLM to assist in generating high-quality system prompts for each stage. Read the entire document before drafting any prompt.

---

## Overview: What the Pipeline Does

The pipeline converts TTRPG PDF files (rulebooks, sourcebooks, adventure modules, periodicals) into a structured JSON dataset suitable for a hybrid RAG (Retrieval-Augmented Generation) application. Every page of every PDF passes through three sequential phases:

- **Phase 1 — Ingestion & Layout:** Non-OCR work. The PDF is converted to PNG images, duplicate pages are detected, and each page's visual structure is analysed to produce a layout map and bounding-box inventory before any text is read.
- **Phase 2 — OCR Extraction & Validation:** LLM-driven text extraction, structured JSON assembly, quality scoring, and multi-pass escalation.
- **Phase 3 — Artifact Storage & Embeddings:** Persisting all outputs, generating vector embeddings, and loading the final records into the database.

The pipeline also supports two **console experience** stages that power the web UI's AI features.

---

## Critical Context for All Prompts

Every LLM stage in this pipeline operates on TTRPG material. The following domain knowledge must be embedded in every prompt:

- **Abbreviations are canonical.** Terms like AC, HP, STR, DEX, CON, INT, WIS, CHA, CR, XP, DC, d4/d6/d8/d10/d12/d20/d100 are standard vocabulary and must never be expanded or corrected.
- **Formatting is meaningful.** Bold text typically marks game terms, italics mark spells or titles, tables encode stat blocks, and sidebars contain optional or supplementary rules.
- **Reading order is non-trivial.** Multi-column layouts must be read column-by-column (left to right), not row-by-row. Sidebars interrupt the main flow and should be extracted as separate regions.
- **Cross-page continuity matters.** Sentences, stat blocks, and tables frequently break across page boundaries. The pipeline tracks this explicitly and prompts must be aware of it.
- **Document type drives strategy.** A hardcover rulebook (single/double column, dense text) requires a different parsing strategy than a periodical (mixed editorial + advertising columns, variable layout per page).

---

## Phase 1: Ingestion & Layout

### Stage 1 — `document_registration`

**Mechanism:** Automated (no LLM). The operator supplies the filename, game system, edition, and title at upload time. The pipeline creates the `documents` record, assigns a `documentId`, and queues the document for Phase 1 processing.

**No prompt required.**

---

### Stage 2 — `document_intelligence`

**Purpose:** Extract high-level identity and classification metadata from the document's first ~10 pages (cover, title page, copyright page, table of contents). This is the only stage that operates on the document as a whole rather than page-by-page.

**Logic:**
The LLM receives images of the first 10 pages and must determine:
1. The canonical title as it appears on the cover or title page (may differ from the filename).
2. The publisher.
3. The document type: `book`, `guide`, `supplement`, `adventure`, `periodical`, `magazine`, or `unknown`.
4. A 2–3 sentence summary of the document's purpose and scope.

The `documentType` output is critical — it is stored on the `documents` record and used by Stage 4 (`layout_classification`) to select the correct parsing strategy for every subsequent page. If the type cannot be determined within the first 10 pages, the pipeline raises a `doc_type_unknown` HITL flag and halts processing until a human resolves it.

**Expected JSON output:**

```json
{
  "canonical_title": "Dungeon Master's Guide",
  "publisher": "Wizards of the Coast",
  "document_type": "book",
  "document_summary": "The core Dungeon Master's Guide for D&D 5th Edition, providing rules for world-building, encounter design, magic items, and dungeon mastering guidance.",
  "confidence": 95
}
```

| Field | Type | Allowed Values / Notes |
|---|---|---|
| `canonical_title` | string | Title as printed on the document |
| `publisher` | string | Publisher name as printed |
| `document_type` | enum | `book` \| `guide` \| `supplement` \| `adventure` \| `periodical` \| `magazine` \| `unknown` |
| `document_summary` | string | 2–3 sentences; scope and purpose |
| `confidence` | integer 0–100 | Self-assessed confidence in the classification |

**HITL trigger:** `confidence < 60` OR `document_type = "unknown"` → flag category `doc_type_unknown`, priority `critical`.

---

### Stage 3 — `pdf_to_png`

**Mechanism:** Automated (no LLM). Poppler (`pdftoppm`) converts each PDF page to a full-resolution PNG. A second preprocessed version (grayscale, quality-reduced) is generated for LLM input to reduce token cost. Both versions are stored in S3. A perceptual hash (pHash) is computed for duplicate detection.

**No prompt required.**

---

### Stage 4 — `layout_analysis`

**Purpose:** For each page, determine the overall visual layout structure — the macro-level column arrangement and dominant content type. This is a fast, low-cost pass using a local VLM (e.g., LLaVA via LM Studio).

**Logic:**
The LLM receives the preprocessed PNG for a single page and must classify its layout type. The output drives the bounding-box detection strategy in Stage 5:

- `single_column` → parse as one continuous text flow.
- `two_column` → parse left column first, then right column.
- `three_column` → parse left → centre → right.
- `mixed` → a combination (e.g., two-column top half, single-column bottom half separated by a horizontal rule). Requires per-region handling.
- `full_page_image` → no text extraction; extract the image as a child asset.
- `table_dominant` → the page is primarily a table or stat block grid; use tabular extraction.
- `periodical_mixed` → editorial and advertising regions coexist; each region must be classified independently.

**Expected JSON output:**

```json
{
  "layout_type": "two_column",
  "dominant_content": "text",
  "has_header": true,
  "has_footer": true,
  "has_page_number": true,
  "estimated_text_coverage": 0.82,
  "notes": "Standard two-column rulebook layout with a decorative header banner.",
  "confidence": 88
}
```

| Field | Type | Notes |
|---|---|---|
| `layout_type` | enum | `single_column` \| `two_column` \| `three_column` \| `mixed` \| `full_page_image` \| `table_dominant` \| `periodical_mixed` \| `unknown` |
| `dominant_content` | enum | `text` \| `table` \| `illustration` \| `mixed` |
| `has_header` | boolean | Running header present |
| `has_footer` | boolean | Running footer present |
| `has_page_number` | boolean | Page number visible |
| `estimated_text_coverage` | float 0–1 | Fraction of page area covered by text |
| `notes` | string | Optional free-text observation |
| `confidence` | integer 0–100 | Self-assessed confidence |

**HITL trigger:** `confidence < 55` OR `layout_type = "unknown"` → flag category `layout_ambiguous`, priority `high`.

---

### Stage 5 — `layout_classification` + `bbox_detection`

**Purpose:** Produce a precise inventory of every distinct content region on the page, each with a bounding box and content type classification. This is the most detailed layout stage and its output is the primary input for OCR extraction.

**Logic:**
The LLM receives the preprocessed PNG and the `layout_type` from Stage 4. It must identify every visually distinct region and output it as a bounding box with:
- Percentage coordinates `{x, y, w, h}` — each value is 0–100, representing percentage of the page width (x, w) or height (y, h). Top-left origin. This avoids any dependency on actual pixel dimensions.
- A `regionType` classification.
- A `sequence` number indicating reading order (1-indexed, left-to-right, top-to-bottom within each column).
- Optional `contentTypeFlags` for regions that contain mixed content.
- A `isMixedBoundary` flag for regions that span column boundaries or contain both text and non-text.

**Content region types:**

| Type | Description |
|---|---|
| `text` | Body text, paragraphs, rules text |
| `table` | Structured rows and columns (stat blocks, item lists, spell tables) |
| `illustration` | Artwork, character art, scene illustrations |
| `map` | Geographic or dungeon maps |
| `graphic` | Decorative graphic, border, divider |
| `advertisement` | Advertising content (periodicals only) |
| `header` | Running page header |
| `footer` | Running page footer |
| `page_number` | Isolated page number element |
| `sidebar` | Boxed sidebar or callout box |
| `callout` | Pull quote, tip box, rules reminder box |
| `unknown` | Cannot be classified |

**Expected JSON output:**

```json
{
  "page_id": 142,
  "layout_type": "two_column",
  "regions": [
    {
      "sequence": 1,
      "regionType": "header",
      "bbox": { "x": 0, "y": 0, "w": 100, "h": 4 },
      "contentTypeFlags": [],
      "isMixedBoundary": false
    },
    {
      "sequence": 2,
      "regionType": "text",
      "bbox": { "x": 3, "y": 5, "w": 45, "h": 87 },
      "contentTypeFlags": ["has_bold_terms", "has_italic"],
      "isMixedBoundary": false
    },
    {
      "sequence": 3,
      "regionType": "table",
      "bbox": { "x": 52, "y": 5, "w": 45, "h": 20 },
      "contentTypeFlags": ["stat_block"],
      "isMixedBoundary": false
    },
    {
      "sequence": 4,
      "regionType": "text",
      "bbox": { "x": 52, "y": 26, "w": 45, "h": 66 },
      "contentTypeFlags": [],
      "isMixedBoundary": false
    },
    {
      "sequence": 5,
      "regionType": "footer",
      "bbox": { "x": 0, "y": 96, "w": 100, "h": 4 },
      "contentTypeFlags": [],
      "isMixedBoundary": false
    }
  ],
  "confidence": 91
}
```

**HITL trigger:** `confidence < 60` OR any region has `regionType = "unknown"` → flag category `layout_ambiguous`, priority `medium`.

---

### Stage 6 — `content_type_classify`

**Purpose:** For regions flagged as `isMixedBoundary` or with ambiguous `contentTypeFlags`, perform a secondary classification pass to resolve the content type at a finer granularity. Also identifies the precise boundary between adjacent content types within a single bounding box.

**Logic:**
This stage is only invoked when Stage 5 produces regions with `isMixedBoundary: true` or `contentTypeFlags` containing `"ambiguous"`. The LLM receives the cropped region image and must output a refined classification with sub-region splits if necessary.

**Expected JSON output:**

```json
{
  "original_region_sequence": 3,
  "resolved": true,
  "sub_regions": [
    {
      "sequence": 1,
      "regionType": "text",
      "bbox": { "x": 0, "y": 0, "w": 760, "h": 200 },
      "contentTypeFlags": ["introductory_paragraph"]
    },
    {
      "sequence": 2,
      "regionType": "table",
      "bbox": { "x": 0, "y": 210, "w": 760, "h": 420 },
      "contentTypeFlags": ["stat_block"]
    }
  ],
  "confidence": 85
}
```

---

### Stage 7 — `child_image_extraction`

**Mechanism:** Automated (no LLM). For every region classified as `illustration`, `map`, or `graphic`, the pipeline crops the bounding box from the raw PNG and stores the child image in S3. The `childImageUrl` field on the region record is populated with the S3 URL.

**No prompt required.**

---

## Phase 2: OCR Extraction & Validation

### Stage 8 — `ocr_extraction`

**Purpose:** The primary extraction stage. For each text and table region identified in Phase 1, extract all content as structured JSON, preserving reading order, semantic hierarchy, and game-specific formatting.

**Logic:**
This stage uses a **multi-pass retry escalation** model:

| Pass | Model | Trigger |
|---|---|---|
| Pass 1 | Primary inscribed provider (local or cloud) | Always |
| Pass 2 | Same primary model, independent re-run | Always (contrasted with Pass 1) |
| Pass 3 | Fallback cloud model (e.g., Gemini 2.5 Pro) | If Pass 1 vs Pass 2 quality score < threshold |
| Pass 4 | Same cloud model, independent retry | If Pass 3 quality score < threshold |
| HITL | Human review | If Pass 4 quality score < threshold |

The LLM receives:
- The cropped region image (or full page image with region bounding box highlighted).
- The `layout_type` and `regionType` for context.
- The `content_regions` array from Stage 5 to understand the page's reading order.
- A `lexicon_terms` list of known game-specific terms for the detected game system (used to guide spelling correction).
- The `json_schema` (the target output structure).

**Expected JSON output — text region:**

```json
{
  "region_sequence": 2,
  "regionType": "text",
  "content_blocks": [
    {
      "block_type": "heading",
      "level": 2,
      "text": "Goblin",
      "formatting": ["bold"]
    },
    {
      "block_type": "stat_line",
      "text": "Small humanoid (goblinoid), neutral evil",
      "formatting": []
    },
    {
      "block_type": "paragraph",
      "text": "Goblins are small, black-hearted humanoids that lair in despoiled dungeons and other dismal settings.",
      "formatting": []
    },
    {
      "block_type": "rule_term",
      "term": "Nimble Escape",
      "definition": "The goblin can take the Disengage or Hide action as a bonus action on each of its turns.",
      "formatting": ["bold_term"]
    }
  ],
  "reading_order_verified": true,
  "confidence": 92
}
```

**Expected JSON output — table region (stat block):**

```json
{
  "region_sequence": 3,
  "regionType": "table",
  "table_type": "stat_block",
  "entity_name": "Goblin",
  "headers": ["AC", "HP", "Speed"],
  "rows": [
    ["15 (leather armor, shield)", "7 (2d6)", "30 ft."]
  ],
  "ability_scores": {
    "STR": 8, "DEX": 14, "CON": 10,
    "INT": 10, "WIS": 8, "CHA": 8
  },
  "saving_throws": {},
  "skills": { "Stealth": 6 },
  "damage_immunities": [],
  "condition_immunities": [],
  "senses": "darkvision 60 ft., passive Perception 9",
  "languages": "Common, Goblin",
  "challenge_rating": "1/4",
  "xp": 50,
  "confidence": 96
}
```

**Expected JSON output — table region (generic table):**

```json
{
  "region_sequence": 3,
  "regionType": "table",
  "table_type": "generic",
  "caption": "Trinkets",
  "headers": ["d100", "Trinket"],
  "rows": [
    ["01", "A mummified goblin hand"],
    ["02", "A piece of crystal that faintly glows in the moonlight"]
  ],
  "confidence": 94
}
```

**HITL trigger:** Quality score from Stage 10 (`quality_validation`) < 70 after Pass 4 → flag category `ocr_quality_failed`, priority `critical`.

---

### Stage 9 — `content_break_detect`

**Purpose:** Identify structural breaks in the document hierarchy (chapter, section, subsection) and detect cross-page sentence continuity. This stage operates on the extracted text from Stage 8, not on images.

**Logic:**
The LLM receives:
- The extracted text for the current page (from Stage 8).
- The last 3–5 lines of text from the previous page (the "look-ahead buffer") to detect mid-sentence breaks.
- The current page number and document ID.

It must output:
1. Any structural breaks detected on this page (chapter start, section start, subsection start).
2. Whether the first sentence on this page is a continuation from the previous page.
3. Whether the last sentence on this page continues onto the next page.

**Expected JSON output:**

```json
{
  "page_number": 142,
  "structural_breaks": [
    {
      "break_type": "section",
      "heading_text": "Combat",
      "position_in_reading_order": 1
    }
  ],
  "continuity": {
    "continues_from_previous_page": false,
    "continues_to_next_page": true,
    "mid_sentence_break_at_end": true,
    "section_continues_from_previous_page": false
  },
  "confidence": 89
}
```

| Field | Type | Notes |
|---|---|---|
| `break_type` | enum | `chapter` \| `section` \| `subsection` \| `appendix` \| `none` |
| `heading_text` | string | Exact heading text as extracted |
| `position_in_reading_order` | integer | Which content block in the page's reading order this break occurs at |
| `continues_from_previous_page` | boolean | First content block is a continuation |
| `continues_to_next_page` | boolean | Last content block continues on next page |
| `mid_sentence_break_at_end` | boolean | The final sentence is incomplete |

---

### Stage 10 — `summarisation`

**Purpose:** Generate hierarchical summaries at the section and chapter level for use as embedding metadata and RAG retrieval context. Summaries are generated after all pages within a section have been extracted.

**Logic:**
The LLM receives the full extracted text for a section (assembled from Stage 8 outputs, with continuity flags from Stage 9 applied). It must produce:
1. A short summary (1–2 sentences) suitable for use as a vector store metadata field.
2. A longer summary (1–3 paragraphs) for use as the "big" chunk in Small-to-Big Retrieval.
3. A list of key game terms, entities, and concepts mentioned in the section.

**Expected JSON output:**

```json
{
  "section_id": "ch3_combat",
  "section_type": "section",
  "heading": "Combat",
  "short_summary": "Covers the full rules for combat encounters in D&D 5e, including initiative, attack rolls, damage, conditions, and special actions.",
  "long_summary": "This section details the structured turn-based combat system of D&D 5th Edition. It explains how to determine initiative order, resolve attack rolls against Armour Class, calculate damage, and apply conditions such as Prone, Restrained, and Incapacitated. Special actions including Dash, Disengage, Dodge, Help, Hide, and Ready are defined. The section also covers opportunity attacks, two-weapon fighting, grappling, and mounted combat.",
  "key_terms": ["initiative", "attack roll", "AC", "damage roll", "conditions", "opportunity attack", "bonus action"],
  "key_entities": [],
  "confidence": 93
}
```

---

### Stage 11 — `quality_validation`

**Purpose:** An independent LLM judge that scores each extraction result for quality without access to the source image (text-only assessment) or with access to the source image (vision assessment). This is the gate that determines whether a pass is accepted or escalated.

**Logic:**
The quality validator receives:
- The source page image (for vision-capable models) or the extracted JSON alone (for text-only models).
- The extracted JSON from the current pass.
- The `layout_metadata` from Stage 5 (bounding boxes and region types).
- The `confidence_threshold` (default: 70 out of 100).

It must score the extraction on four dimensions:

| Dimension | Weight | Description |
|---|---|---|
| **Completeness** | 30% | All visible text in the image has been captured |
| **Layout accuracy** | 25% | Reading order, column assignment, and region boundaries are correct |
| **Context decisions** | 25% | Headings, rule terms, stat blocks, and tables are correctly typed |
| **Text continuity** | 20% | Sentence breaks, hyphenation, and cross-column joins are handled correctly |

**Expected JSON output:**

```json
{
  "pass_number": 1,
  "overall_score": 84,
  "accepted": true,
  "dimension_scores": {
    "completeness": 90,
    "layout_accuracy": 82,
    "context_decisions": 80,
    "text_continuity": 85
  },
  "issues": [
    {
      "severity": "minor",
      "dimension": "layout_accuracy",
      "description": "The sidebar on the right side of the page was merged into the main text flow instead of being extracted as a separate region."
    }
  ],
  "recommendation": "accept",
  "confidence": 88
}
```

| Field | Type | Notes |
|---|---|---|
| `overall_score` | integer 0–100 | Weighted composite of dimension scores |
| `accepted` | boolean | `true` if `overall_score >= confidence_threshold` |
| `recommendation` | enum | `accept` \| `escalate_to_pass3` \| `flag_hitl` |
| `issues` | array | List of specific problems found |
| `issues[].severity` | enum | `minor` \| `major` \| `critical` |

**Escalation logic:**
- `overall_score >= 70` → accept current pass as final.
- `overall_score >= 50` AND `pass_number < 3` → escalate to next pass.
- `overall_score < 50` OR `pass_number = 4` → flag for HITL.

---

### Stage 12 — `pass_comparison`

**Purpose:** When multiple passes have been completed, compare their outputs to select the best candidate or identify irreconcilable differences that require human review.

**Logic:**
The LLM receives all available pass outputs (Pass 1 through Pass 4, whichever have been completed) and the source page image. It must:
1. Identify which pass produced the most complete and accurate extraction.
2. Highlight specific differences between passes.
3. Recommend the winning pass or flag for HITL if passes are irreconcilably different.

**Expected JSON output:**

```json
{
  "passes_compared": [1, 2, 3],
  "recommended_pass": 3,
  "winner_rationale": "Pass 3 (Gemini 2.5 Pro) correctly identified the sidebar as a separate region and preserved the stat block table structure, which Passes 1 and 2 merged into the main text flow.",
  "differences": [
    {
      "region_sequence": 4,
      "dimension": "layout_accuracy",
      "pass1_behaviour": "Merged sidebar into main text flow",
      "pass3_behaviour": "Correctly extracted sidebar as separate callout region"
    }
  ],
  "hitl_required": false,
  "confidence": 91
}
```

---

### Stage 13 — `tabular_extraction`

**Purpose:** Specialised extraction for pages where `layout_type = "table_dominant"` or for individual regions with `regionType = "table"` that contain complex nested structures (e.g., multi-row stat blocks, spell lists, equipment tables with merged cells).

**Logic:**
This stage is invoked in addition to `ocr_extraction` for table-dominant pages, or as a retry when `ocr_extraction` produces a low-confidence table output. The LLM receives the cropped table region image and must produce a fully structured representation.

**Expected JSON output:**

```json
{
  "region_sequence": 3,
  "table_type": "spell_list",
  "caption": "Cleric Spells",
  "column_headers": ["Spell Level", "Spell Name", "School", "Casting Time", "Range", "Components", "Duration"],
  "rows": [
    {
      "spell_level": "Cantrip",
      "spell_name": "Guidance",
      "school": "Divination",
      "casting_time": "1 action",
      "range": "Touch",
      "components": "V, S",
      "duration": "Concentration, up to 1 minute"
    }
  ],
  "merged_cells": [],
  "footnotes": [],
  "confidence": 95
}
```

---

### Stage 14 — `json_assembly`

**Purpose:** Assemble all region-level extraction outputs for a page into the final `pageJsonOutput` structure that is stored on the `document_pages` record.

**Mechanism:** Primarily automated, but an LLM pass is used to resolve any ordering or continuity conflicts between regions before final assembly.

**Final assembled page JSON structure:**

```json
{
  "document_id": 7,
  "page_number": 142,
  "layout_type": "two_column",
  "source_images": {
    "raw_png_url": "https://s3.../raw/page_142.png",
    "preprocessed_png_url": "https://s3.../preprocessed/page_142.png",
    "thumbnail_url": "https://s3.../thumbnails/page_142.jpg"
  },
  "continuity": {
    "continues_from_previous_page": false,
    "continues_to_next_page": true,
    "mid_sentence_break_at_end": true,
    "section_continues_from_previous_page": false
  },
  "structural_breaks": [
    {
      "break_type": "section",
      "heading_text": "Combat",
      "position_in_reading_order": 1
    }
  ],
  "regions": [
    {
      "sequence": 1,
      "regionType": "header",
      "bbox": { "x": 0, "y": 0, "w": 100, "h": 4 },
      "content_blocks": [
        { "block_type": "header_text", "text": "Chapter 3: Adventuring", "formatting": [] }
      ]
    },
    {
      "sequence": 2,
      "regionType": "text",
      "bbox": { "x": 3, "y": 5, "w": 45, "h": 87 },
      "content_blocks": [
        { "block_type": "heading", "level": 2, "text": "Combat", "formatting": ["bold"] },
        { "block_type": "paragraph", "text": "A typical combat encounter...", "formatting": [] }
      ]
    },
    {
      "sequence": 3,
      "regionType": "table",
      "bbox": { "x": 52, "y": 5, "w": 45, "h": 20 },
      "table_type": "stat_block",
      "entity_name": "Goblin",
      "headers": ["AC", "HP", "Speed"],
      "rows": [["15", "7 (2d6)", "30 ft."]],
      "ability_scores": { "STR": 8, "DEX": 14, "CON": 10, "INT": 10, "WIS": 8, "CHA": 8 },
      "challenge_rating": "1/4",
      "xp": 50
    }
  ],
  "ocr_metadata": {
    "winning_pass": 2,
    "quality_score": 84,
    "models_used": {
      "pass1": "llava-1.6-mistral-7b",
      "pass2": "llava-1.6-mistral-7b"
    }
  }
}
```

---

## Phase 3: Artifact Storage & Embeddings

### Stage 15 — `artifact_storage`

**Mechanism:** Automated. All S3 URLs, structured JSON, and metadata are written to the database. No LLM required.

---

### Stage 16 — `embedding_generation`

**Purpose:** Generate vector embeddings for each content chunk for use in the RAG retrieval layer. Uses a **Small-to-Big Retrieval** strategy.

**Strategy:**
- **Small chunks** (used for retrieval): Individual content blocks (paragraphs, rule terms, table rows). Each small chunk is embedded independently.
- **Big chunks** (returned as context): The full section text (assembled from all pages in a section). When a small chunk is retrieved, the retrieval system returns the parent big chunk as context to the LLM.

**No prompt required** (embedding models do not use system prompts).

---

### Stage 17 — `database_load`

**Mechanism:** Automated. Final records are written to all relevant tables. No LLM required.

---

## Console Experience Stages

These stages power the web UI's AI features and are not part of the ingestion pipeline.

### `voice_of_arkanum`

**Purpose:** Generates thematic, atmospheric lore ramblings for the "Listen to Ramblings" feature. The LLM is given a random seed topic and must produce a short, evocative piece of TTRPG-flavoured lore or game knowledge.

**Variables available:** `{{random_seed}}`, `{{database_schema_summary}}`, `{{preferred_game}}`

---

### `referee`

**Purpose:** Powers the "Arkanum Search Oracle" — interprets natural language queries from users and translates them into structured search parameters for the lore database.

**Variables available:** `{{user_query}}`, `{{available_filters}}`, `{{preferred_game}}`

---

## Summary: Stage-to-Prompt Mapping

| Stage Name | Prompt Name | Phase | LLM Required | Primary Input | Key Output Fields |
|---|---|---|---|---|---|
| `document_intelligence` | *(not yet in Incantations)* | 1 | Yes | First 10 page images | `document_type`, `canonical_title`, `document_summary` |
| `layout_analysis` | `layout_analysis` | 1 | Yes (VLM) | Page PNG | `layout_type`, `dominant_content`, `confidence` |
| `bbox_detection` | `bbox_detection` | 1 | Yes (VLM) | Page PNG + layout_type | `regions[]` with `bbox`, `regionType`, `sequence` |
| `content_type_classify` | *(not yet in Incantations)* | 1 | Yes (VLM) | Cropped region PNG | `sub_regions[]` with refined types |
| `ocr_extraction` | `ocr_extraction` | 2 | Yes | Region PNG + context | `content_blocks[]` or table structure |
| `content_break_detect` | `content_break_detect` | 2 | Yes | Extracted text + prev page tail | `structural_breaks[]`, `continuity` flags |
| `summarisation` | `summarisation` | 2 | Yes | Section text | `short_summary`, `long_summary`, `key_terms` |
| `quality_validation` | `quality_validation` | 2 | Yes | Page image + extracted JSON | `overall_score`, `dimension_scores`, `recommendation` |
| `pass_comparison` | `pass_comparison` | 2 | Yes | All pass outputs + page image | `recommended_pass`, `differences[]`, `hitl_required` |
| `tabular_extraction` | *(not yet in Incantations)* | 2 | Yes | Table region PNG | `rows[]`, `column_headers`, `table_type` |
| `voice_of_arkanum` | `voice_of_arkanum` | Console | Yes | Random seed + game context | Free-form lore text |
| `referee` | `arkanum_search` | Console | Yes | User query + filters | Structured search parameters |

---

## Instructions for the Prompt-Crafting LLM

When generating a system prompt for any stage listed above, follow these rules:

1. **Output format is non-negotiable.** Every prompt must instruct the model to respond with **only** a valid JSON object matching the schema defined for that stage. No preamble, no explanation, no markdown fences — raw JSON only.

2. **Confidence scoring is mandatory.** Every prompt must instruct the model to include a `confidence` field (integer 0–100) representing its self-assessed certainty. This field drives the HITL escalation logic.

3. **TTRPG domain vocabulary must be respected.** Every prompt must explicitly instruct the model not to correct, expand, or normalise TTRPG abbreviations (AC, HP, STR, d20, CR, etc.).

4. **Reading order must be explicit.** For any layout or extraction prompt, the model must be instructed to process columns left-to-right and regions top-to-bottom within each column, not row-by-row across the full page width.

5. **Failure modes must be handled.** Every prompt must instruct the model on what to output when it is uncertain: use the `"unknown"` enum value for classification fields, set `confidence` below 60, and never hallucinate content that is not visible in the image.

6. **Temperature guidance:** Layout analysis and classification stages should use low temperature (0.1–0.2) for deterministic output. OCR extraction stages should use slightly higher temperature (0.3–0.4) to allow for natural language variation in extracted text. Quality validation and comparison stages should use low temperature (0.1–0.2) for consistent scoring.
