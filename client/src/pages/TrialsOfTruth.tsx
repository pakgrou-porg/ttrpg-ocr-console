import { useState, useEffect, useMemo, useRef, Fragment, type ElementType } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  CheckCircle2, XCircle, ArrowUpCircle, ChevronDown, ChevronRight,
  Loader2, ClipboardList, FileText, Layout, BoxSelect, ListTree, Braces, BookOpen,
  Trash2, ChevronLeft, Download, RefreshCw, Scissors, Save, Copy, ClipboardPaste,
  ArrowUp, ArrowDown, RotateCcw, RotateCw, History, TrendingUp, TrendingDown, Minus, ShieldCheck,
} from "lucide-react";
import { BboxOverlayToggle } from "@/components/BboxOverlay";
import { BboxRegionEditor, parseRegionJson, TYPE_COLORS, sortRegionsByPosition } from "@/components/BboxRegionEditor";
import { trpc } from "@/lib/trpc";
import { useToast } from "@/hooks/use-toast";

// ── Document label helper ─────────────────────────────────────────────────────

/** Produce a human-readable document label, optionally appending game system and edition. */
function docLabel(doc: { title?: string | null; filename: string; gameSystem?: string | null; edition?: string | null }) {
  const base = doc.title ?? doc.filename;
  const meta = [doc.gameSystem, doc.edition].filter(Boolean).join(" · ");
  return meta ? `${base} [${meta}]` : base;
}

// ── Download helpers ──────────────────────────────────────────────────────────

function triggerJsonDownload(filename: string, data: unknown) {
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

function formatExportRecord(item: any) {
  const imageUrl = item.page?.rawPngUrl
    ? `/api/pipeline/pages/${item.page.rawPngUrl.replace(/.*\/workspace\//, "")}`
    : null;
  return {
    hitl_id: item.id,
    hitl_status: item.status,
    hitl_reason: item.reason,
    document: {
      title: item.documentTitle ?? "Unknown",
      publisher: null,
      type: null,
      game_system: null,
    },
    page: {
      number: item.page?.pageNumber ?? null,
      image_url: imageUrl,
      layout_type: item.page?.layoutType ?? null,
      ocr_confidence: item.ocr?.confidence ?? null,
      model: item.ocr?.pass1Model ?? null,
      extracted_at: item.ocr?.createdAt ?? null,
    },
    regions: item.page?.contentRegions ?? [],
    ocr_output: item.ocr?.structuredData ?? null,
    raw_text: item.ocr?.rawText ?? null,
    human_corrections: (item.ocr?.correctedStructuredData || item.ocr?.correctedText)
      ? { corrected_text: item.ocr?.correctedText ?? null, corrected_data: item.ocr?.correctedStructuredData ?? null }
      : null,
    retry_attempts: item.retryAttempts ?? [],
  };
}

type HitlAction = "resolved" | "skipped" | "escalated";
type TabId = "text" | "layout" | "regions" | "structure" | "json" | "document" | "history";

// Empty JSON templates shown when a section has no source data.
// Pre-populate the correction field so reviewers have a starting structure.
const EMPTY_TEMPLATES: Partial<Record<TabId, string>> = {
  layout:    JSON.stringify({ layout_type: "body_text", columns: 2, has_table: true, has_image_or_art: true, has_list: false }, null, 2),
  regions:   JSON.stringify([], null, 2),
  structure: JSON.stringify({ chapter: "", section: "", subsection: "", headings: [], page_summary: "" }, null, 2),
  json:      JSON.stringify({ layout_type: "", content_blocks: [], page_summary: "" }, null, 2),
};

const LAYOUT_TYPES = [
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
  "unknown",
] as const;

function parseLayoutCorrection(value: string): Record<string, unknown> {
  if (!value.trim()) return {};
  try {
    const parsed = JSON.parse(value);
    return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed as Record<string, unknown> : {};
  } catch {
    return {};
  }
}

const LAYOUT_LABEL_OVERRIDES: Record<string, string> = {
  toc: "Table of Contents",
};

function layoutLabel(value: string) {
  return LAYOUT_LABEL_OVERRIDES[value]
    ?? value.split("_").map(part => part.charAt(0).toUpperCase() + part.slice(1)).join(" ");
}

function formatRetryTimestamp(value: string | Date | null | undefined) {
  if (!value) return "";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "" : date.toLocaleString();
}

function retryStatusClass(status: string) {
  if (status === "succeeded") return "text-green-400";
  if (status === "failed") return "text-red-400";
  return "text-yellow-400";
}

// ── JSON pruning ──────────────────────────────────────────────────────────────

/** Recursively remove object keys whose value is "", [], or {}. Arrays are traversed but not filtered. */
function pruneEmpty(val: unknown): unknown {
  if (Array.isArray(val)) return val.map(pruneEmpty);
  if (val !== null && typeof val === "object") {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(val as Record<string, unknown>)) {
      const p = pruneEmpty(v);
      const isEmpty =
        p === "" ||
        (Array.isArray(p) && p.length === 0) ||
        (p !== null && typeof p === "object" && !Array.isArray(p) && Object.keys(p as object).length === 0);
      if (!isEmpty) out[k] = p;
    }
    return out;
  }
  return val;
}

function StatusBadge({ status }: { status: string }) {
  const variants: Record<string, string> = {
    queued:      "bg-yellow-500/20 text-yellow-400 border-yellow-500/30",
    in_progress: "bg-blue-500/20 text-blue-400 border-blue-500/30",
    resolved:    "bg-green-500/20 text-green-400 border-green-500/30",
    skipped:     "bg-muted text-muted-foreground border-border/30",
    escalated:   "bg-red-500/20 text-red-400 border-red-500/30",
  };
  return (
    <span className={`text-xs px-2 py-0.5 rounded-full border font-medium ${variants[status] ?? "bg-muted text-muted-foreground border-border/30"}`}>
      {status}
    </span>
  );
}

// ── Tab content helpers ───────────────────────────────────────────────────────

function JsonViewer({ value, emptyTemplate, onCopyToEdit }: {
  value: unknown;
  emptyTemplate?: string;
  onCopyToEdit?: (v: string) => void;
}) {
  const text = value == null ? null
    : typeof value === "string" ? value
    : JSON.stringify(value, null, 2);

  const copyToClipboard = () => {
    if (text) navigator.clipboard.writeText(text).catch(() => {});
  };

  if (value == null) {
    if (emptyTemplate) {
      return (
        <pre className="text-xs bg-muted/10 border border-dashed border-border/40 rounded p-3 overflow-auto max-h-64 whitespace-pre-wrap break-all text-muted-foreground/50">
          {emptyTemplate}
        </pre>
      );
    }
    return <span className="text-muted-foreground italic text-xs">—</span>;
  }
  return (
    <div className="relative group">
      <pre className="text-xs bg-muted/20 border border-border/40 rounded p-3 overflow-auto max-h-64 whitespace-pre-wrap break-all">
        {text}
      </pre>
      <div className="absolute top-1.5 right-1.5 flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
        <button
          type="button"
          onClick={copyToClipboard}
          title="Copy to clipboard"
          className="flex items-center gap-0.5 text-[10px] px-1.5 py-0.5 rounded bg-background/90 border border-border/60 text-muted-foreground hover:text-foreground transition-colors"
        >
          <Copy className="w-3 h-3" />
        </button>
        {onCopyToEdit && (
          <button
            type="button"
            onClick={() => onCopyToEdit(text!)}
            title="Copy into correction field for editing"
            className="flex items-center gap-0.5 text-[10px] px-1.5 py-0.5 rounded bg-background/90 border border-border/60 text-muted-foreground hover:text-foreground transition-colors"
          >
            <ClipboardPaste className="w-3 h-3" />
            Edit
          </button>
        )}
      </div>
    </div>
  );
}

function CorrectionField({ label, value, onChange, onSave, isSaving }: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  onSave?: () => void;
  isSaving?: boolean;
}) {
  const trimmed = value.trim();
  const looksLikeJson = trimmed.startsWith("{") || trimmed.startsWith("[");

  const handlePrune = () => {
    try {
      const pruned = pruneEmpty(JSON.parse(value));
      onChange(JSON.stringify(pruned, null, 2));
    } catch {
      // Invalid JSON — silently ignore; button is only shown when field looks like JSON
    }
  };

  return (
    <div className="space-y-1 mt-3">
      <div className="flex items-center justify-between gap-2">
        <p className="text-xs text-muted-foreground min-w-0 truncate">
          {label} <span className="opacity-60">(leave blank to clear)</span>
        </p>
        <div className="flex items-center gap-1.5 flex-shrink-0">
          {trimmed && (
            <button
              type="button"
              onClick={() => navigator.clipboard.writeText(trimmed).catch(() => {})}
              title="Copy to clipboard"
              className="flex items-center gap-0.5 text-[10px] px-1.5 py-0.5 rounded border border-border/40 text-muted-foreground hover:text-foreground transition-colors"
            >
              <Copy className="w-3 h-3" />
            </button>
          )}
          {looksLikeJson && trimmed.length > 2 && (
            <button onClick={handlePrune}
              className="flex items-center gap-1 text-xs px-2 py-0.5 rounded border border-border/40 text-muted-foreground hover:text-foreground hover:border-border transition-colors"
              title="Remove object keys with empty string, empty array, or empty object values">
              <Scissors className="w-3 h-3" />
              Prune empty
            </button>
          )}
          {onSave && (
            <button onClick={onSave} disabled={isSaving || !trimmed}
              className="flex items-center gap-1 text-xs px-2 py-0.5 rounded border border-border/40 text-muted-foreground hover:text-foreground hover:border-border transition-colors disabled:opacity-50"
              title={trimmed ? "Save this correction" : "Enter a correction value first"}>
              {isSaving ? <Loader2 className="w-3 h-3 animate-spin" /> : <CheckCircle2 className="w-3 h-3" />}
              Save section
            </button>
          )}
        </div>
      </div>
      <Textarea value={value} onChange={e => onChange(e.target.value)}
        placeholder="Enter correction here…"
        className="text-xs font-mono h-24 bg-background/50 resize-y" />
    </div>
  );
}

type TabProps = { item: any; correction: string; onCorrect: (v: string) => void; onSave: () => void; isSaving: boolean };

function TextTab({ item, correction, onCorrect, onSave, isSaving }: TabProps) {
  const sd = item.ocr?.structuredData as any;
  const blocks: any[] = Array.isArray(sd?.content_blocks) ? sd.content_blocks : [];
  const displayText = item.ocr?.rawText
    || (blocks.length > 0 ? blocks.map((b: any) => b.text ?? b.content ?? "").join("\n\n") : null);

  const nativeText: string | null = item.page?.nativeText ?? null;

  return (
    <div className="space-y-3">
      <div>
        <p className="text-xs text-muted-foreground uppercase tracking-wide mb-1">OCR Extracted Text</p>
        <JsonViewer value={displayText ?? "No OCR text extracted"} onCopyToEdit={onCorrect} />
      </div>
      {nativeText && (
        <div>
          <p className="text-xs text-muted-foreground uppercase tracking-wide mb-1">Native PDF Text</p>
          <JsonViewer value={nativeText} onCopyToEdit={onCorrect} />
        </div>
      )}
      <CorrectionField label="Corrected text" value={correction} onChange={onCorrect} onSave={onSave} isSaving={isSaving} />
    </div>
  );
}

/** Default metadata fields for each layout type — seeded into the correction
 *  JSON when the user picks a type, so they can immediately edit columns etc. */
const LAYOUT_METADATA_TEMPLATES: Partial<Record<string, Record<string, unknown>>> = {
  cover:                  { columns: 1, has_table: false, has_image_or_art: true,  has_list: false },
  title_page:             { columns: 1, has_table: false, has_image_or_art: false, has_list: false },
  toc:                    { columns: 1, has_table: false, has_image_or_art: false, has_list: true  },
  chapter_header:         { columns: 1, has_table: false, has_image_or_art: false, has_list: false },
  body_text:              { columns: 2, has_table: true,  has_image_or_art: false, has_list: false },
  stat_block:             { columns: 1, has_table: true,  has_image_or_art: false, has_list: false },
  table:                  { columns: 1, has_table: true,  has_image_or_art: false, has_list: false },
  illustration_full:      { columns: 1, has_table: false, has_image_or_art: true,  has_list: false },
  illustration_with_text: { columns: 1, has_table: false, has_image_or_art: true,  has_list: false },
  index:                  { columns: 2, has_table: false, has_image_or_art: false, has_list: true  },
  appendix:               { columns: 1, has_table: false, has_image_or_art: false, has_list: false },
  mixed:                  { columns: 1, has_table: false, has_image_or_art: false, has_list: false },
};

/** Structured form editor for the "body_text" layout type — replaces raw JSON editing. */
function BodyTextLayoutForm({ corrected, onCorrect, onSave, isSaving }: {
  corrected: Record<string, unknown>;
  onCorrect: (v: string) => void;
  onSave: () => void;
  isSaving: boolean;
}) {
  const columns  = typeof corrected.columns        === "number"  ? corrected.columns        : 2;
  const hasTable = corrected.has_table        != null ? Boolean(corrected.has_table)        : false;
  const hasArt   = corrected.has_image_or_art != null ? Boolean(corrected.has_image_or_art) : false;
  const hasList  = corrected.has_list         != null ? Boolean(corrected.has_list)         : false;

  // Seed the correction JSON with body_text defaults only when there is no correction yet.
  // Skip seeding if layout_type is already "body_text" — a previously saved correction
  // was pre-populated from correctedStructuredData and must not be overwritten with defaults.
  useEffect(() => {
    if (corrected.layout_type !== "body_text") {
      onCorrect(JSON.stringify(
        { layout_type: "body_text", columns: 2, has_table: false, has_image_or_art: false, has_list: false },
        null, 2,
      ));
    }
  // One-time seed on mount only
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Write the full JSON object on every field change so the correction string stays complete
  const push = (patch: Record<string, unknown>) => {
    onCorrect(JSON.stringify({
      layout_type: "body_text",
      columns,
      has_table: hasTable,
      has_image_or_art: hasArt,
      has_list: hasList,
      ...patch,
    }, null, 2));
  };

  const toggles: Array<{ key: string; label: string; value: boolean }> = [
    { key: "has_table",        label: "Has Table",       value: hasTable },
    { key: "has_image_or_art", label: "Has Image / Art", value: hasArt   },
    { key: "has_list",         label: "Has List",        value: hasList  },
  ];

  return (
    <div className="mt-3 rounded-lg border border-border/40 bg-muted/10 divide-y divide-border/30 overflow-hidden">
      {/* Layout Style — read-only fixed label */}
      <div className="flex items-center gap-3 px-3 py-2.5">
        <span className="text-xs text-muted-foreground w-36 flex-shrink-0">Layout Style</span>
        <span className="text-xs font-medium px-2.5 py-0.5 rounded-full bg-primary/10 border border-primary/20 text-primary/80">
          Body Text
        </span>
      </div>

      {/* Columns — number with ± stepper */}
      <div className="flex items-center gap-3 px-3 py-2.5">
        <span className="text-xs text-muted-foreground w-36 flex-shrink-0">Columns</span>
        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={() => push({ columns: Math.max(1, columns - 1) })}
            disabled={columns <= 1}
            className="w-6 h-6 rounded border border-border/50 text-sm leading-none text-muted-foreground hover:text-foreground hover:border-border disabled:opacity-30 transition-colors"
          >−</button>
          <Input
            type="number"
            min={1}
            max={6}
            value={columns}
            onChange={e => {
              const v = parseInt(e.target.value);
              if (!Number.isNaN(v)) push({ columns: Math.max(1, Math.min(6, v)) });
            }}
            className="w-12 h-7 text-center text-sm bg-background/50 [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
          />
          <button
            type="button"
            onClick={() => push({ columns: Math.min(6, columns + 1) })}
            disabled={columns >= 6}
            className="w-6 h-6 rounded border border-border/50 text-sm leading-none text-muted-foreground hover:text-foreground hover:border-border disabled:opacity-30 transition-colors"
          >+</button>
        </div>
      </div>

      {/* Boolean toggles */}
      {toggles.map(({ key, label, value }) => (
        <div key={key} className="flex items-center gap-3 px-3 py-2.5">
          <span className="text-xs text-muted-foreground w-36 flex-shrink-0">{label}</span>
          <button
            type="button"
            role="switch"
            aria-checked={value}
            onClick={() => push({ [key]: !value })}
            className={`relative inline-flex h-5 w-9 flex-shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ${
              value ? "bg-primary" : "bg-input"
            }`}
          >
            <span className={`pointer-events-none inline-block h-4 w-4 rounded-full bg-white shadow-sm ring-0 transition-transform duration-200 ${
              value ? "translate-x-4" : "translate-x-0"
            }`} />
          </button>
          <span className="text-xs text-muted-foreground/60">{value ? "Yes" : "No"}</span>
        </div>
      ))}

      {/* Save row */}
      <div className="flex justify-end px-3 py-2 bg-muted/5">
        <button
          type="button"
          onClick={onSave}
          disabled={isSaving}
          className="flex items-center gap-1.5 text-xs px-3 py-1 rounded border border-border/40 text-muted-foreground hover:text-foreground hover:border-border transition-colors disabled:opacity-50"
        >
          {isSaving ? <Loader2 className="w-3 h-3 animate-spin" /> : <Save className="w-3 h-3" />}
          Save Layout
        </button>
      </div>
    </div>
  );
}

function LayoutTab({ item, correction, onCorrect, onSave, isSaving, onRotate, isRotating }: TabProps & {
  onRotate?: (degrees: 90 | 180 | 270) => void;
  isRotating?: boolean;
}) {
  const sd = item.ocr?.structuredData as any;
  const corrected = parseLayoutCorrection(correction);
  const layoutType = String(corrected.layout_type || corrected.layoutType || item.page?.layoutType || sd?.layout_type || "unknown");
  const layoutMeta = sd?.layout ?? sd?.layout_metadata ?? sd?.page_layout;

  const setLayoutType = (value: string) => {
    const template = LAYOUT_METADATA_TEMPLATES[value] ?? {};
    // Template provides defaults; any existing corrections override them;
    // the newly selected layout_type always wins.
    onCorrect(JSON.stringify({
      ...template,
      ...corrected,
      layout_type: value,
    }, null, 2));
  };

  return (
    <div className="space-y-3">
      <div className="flex gap-3 items-center flex-wrap">
        <span className="text-xs text-muted-foreground uppercase tracking-wide">Layout Type</span>
        <Select value={layoutType} onValueChange={setLayoutType}>
          <SelectTrigger size="sm" className="w-[220px] bg-background/50">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {LAYOUT_TYPES.map(type => (
              <SelectItem key={type} value={type}>{layoutLabel(type)}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        {onRotate && (
          <>
            <span className="text-muted-foreground/30 select-none">|</span>
            <span className="text-xs text-muted-foreground">Rotate:</span>
            <Button
              size="sm" variant="outline"
              className="gap-1.5 h-7 text-xs"
              onClick={() => onRotate(270)}
              disabled={isRotating}
              title="Rotate 90° counter-clockwise"
            >
              <RotateCcw className="w-3 h-3" />CCW
            </Button>
            <Button
              size="sm" variant="outline"
              className="gap-1.5 h-7 text-xs"
              onClick={() => onRotate(90)}
              disabled={isRotating}
              title="Rotate 90° clockwise"
            >
              <RotateCw className="w-3 h-3" />CW
            </Button>
            <Button
              size="sm" variant="outline"
              className="gap-1.5 h-7 text-xs"
              onClick={() => onRotate(180)}
              disabled={isRotating}
              title="Flip 180°"
            >
              {isRotating
                ? <Loader2 className="w-3 h-3 animate-spin" />
                : <span className="font-mono text-[11px]">180°</span>}
              Flip
            </Button>
          </>
        )}
      </div>

      {layoutType === "body_text" ? (
        <BodyTextLayoutForm
          corrected={corrected}
          onCorrect={onCorrect}
          onSave={onSave}
          isSaving={isSaving}
        />
      ) : (
        <>
          <div>
            <p className="text-xs text-muted-foreground mb-1">Layout metadata</p>
            <JsonViewer value={layoutMeta ?? null} emptyTemplate={EMPTY_TEMPLATES.layout} onCopyToEdit={onCorrect} />
          </div>
          <CorrectionField label="Layout correction (JSON)"
            value={correction} onChange={onCorrect} onSave={onSave} isSaving={isSaving} />
        </>
      )}
    </div>
  );
}

function RegionsTab({ item, correction, onCorrect, onSave, isSaving, editableRegions, onReorder, manualOrder, onAutoSort, onSplitRegion, isSplitting }: TabProps & {
  editableRegions?: any[];
  onReorder?: (regions: any[]) => void;
  manualOrder?: boolean;
  onAutoSort?: () => void;
  /** Called when the user requests a region crop+rotate split. bbox is in % coords 0–100. */
  onSplitRegion?: (bbox: { x: number; y: number; w: number; h: number }, degrees: 90 | 180 | 270) => void;
  isSplitting?: boolean;
}) {
  const [splittingIdx, setSplittingIdx] = useState<number | null>(null);

  const sd = item.ocr?.structuredData as any;
  const regions = item.page?.contentRegions ?? sd?.regions ?? sd?.bounding_boxes ?? sd?.content_regions;

  const sortedRegions = editableRegions
    ? editableRegions.slice().sort((a: any, b: any) => (a.sequence ?? 0) - (b.sequence ?? 0))
    : null;

  const reorderByStep = (idx: number, direction: "up" | "down") => {
    if (!sortedRegions || !onReorder) return;
    const ordered = sortedRegions.slice();
    const swapWith = direction === "up" ? idx - 1 : idx + 1;
    if (swapWith < 0 || swapWith >= ordered.length) return;
    [ordered[idx], ordered[swapWith]] = [ordered[swapWith], ordered[idx]];
    onReorder(ordered.map((r: any, i: number) => ({ ...r, sequence: i + 1 })));
  };

  return (
    <div className="space-y-3">
      <p className="text-xs text-muted-foreground">
        {regions
          ? (Array.isArray(regions) ? `${regions.length} region(s) detected` : "Region data")
          : <span className="italic">No bounding box / region data detected — empty template shown below.</span>}
      </p>
      <JsonViewer value={regions ?? null} emptyTemplate={EMPTY_TEMPLATES.regions} onCopyToEdit={onCorrect} />
      <CorrectionField label="Region correction (JSON array)"
        value={correction} onChange={onCorrect} onSave={onSave} isSaving={isSaving} />

      {sortedRegions && sortedRegions.length >= 2 && (
        <div className="rounded border border-border/40 bg-muted/10 p-2 space-y-1.5">
          <div className="flex items-center justify-between gap-2">
            <p className="text-[11px] font-medium text-muted-foreground uppercase tracking-wide">
              Reading Order
              {manualOrder && (
                <span className="ml-2 text-[10px] text-primary/70 normal-case tracking-normal font-normal">manual</span>
              )}
            </p>
            {manualOrder && onAutoSort && (
              <button
                type="button"
                onClick={onAutoSort}
                className="flex items-center gap-1 text-[10px] px-1.5 py-0.5 rounded border border-border/40 text-muted-foreground hover:text-foreground transition-colors"
                title="Reset to position-based auto-sort"
              >
                <RotateCcw className="w-2.5 h-2.5" />
                Auto-sort
              </button>
            )}
          </div>
          <div className="space-y-0.5 max-h-64 overflow-y-auto">
            {sortedRegions.map((region: any, idx: number, arr: any[]) => {
              const type = region.type ?? region.regionType ?? "unknown";
              const color = TYPE_COLORS[type] ?? TYPE_COLORS.unknown;
              const isSplittingThis = splittingIdx === idx;
              return (
                <Fragment key={region.reviewId ?? idx}>
                  <div
                    className={`flex items-center gap-2 px-2 py-1 rounded text-xs text-muted-foreground transition-colors ${isSplittingThis ? "bg-amber-500/5" : "hover:bg-muted/30"}`}
                  >
                    <span className="font-mono w-5 text-center flex-shrink-0 text-muted-foreground/60">{idx + 1}</span>
                    <span className="w-2 h-2 rounded-sm flex-shrink-0" style={{ background: color }} />
                    <span className="flex-1 truncate">{type}</span>
                    <span className="text-[10px] text-muted-foreground/40 flex-shrink-0 font-mono">
                      {(region.bbox?.x ?? 0).toFixed(0)},{(region.bbox?.y ?? 0).toFixed(0)}
                    </span>
                    <div className="flex gap-0.5 flex-shrink-0">
                      <button
                        type="button"
                        onClick={e => { e.stopPropagation(); reorderByStep(idx, "up"); }}
                        disabled={idx === 0}
                        className="p-0.5 rounded hover:bg-muted/50 disabled:opacity-20 transition-colors"
                        title="Move earlier in reading order"
                      >
                        <ArrowUp className="w-3 h-3" />
                      </button>
                      <button
                        type="button"
                        onClick={e => { e.stopPropagation(); reorderByStep(idx, "down"); }}
                        disabled={idx === arr.length - 1}
                        className="p-0.5 rounded hover:bg-muted/50 disabled:opacity-20 transition-colors"
                        title="Move later in reading order"
                      >
                        <ArrowDown className="w-3 h-3" />
                      </button>
                      {onSplitRegion && region.bbox && (
                        <button
                          type="button"
                          onClick={e => { e.stopPropagation(); setSplittingIdx(isSplittingThis ? null : idx); }}
                          className={`p-0.5 rounded transition-colors ${isSplittingThis ? "text-amber-400" : "text-muted-foreground/40 hover:text-amber-400 hover:bg-muted/50"}`}
                          title="Extract & rotate this region as a separate page part"
                        >
                          <Scissors className="w-3 h-3" />
                        </button>
                      )}
                    </div>
                  </div>
                  {isSplittingThis && onSplitRegion && region.bbox && (
                    <div className="flex items-center gap-1.5 px-2 py-1.5 mx-0.5 rounded-b border border-t-0 border-amber-500/20 bg-amber-500/5 text-xs">
                      <Scissors className="w-3 h-3 text-amber-400 flex-shrink-0" />
                      <span className="text-muted-foreground text-[11px] flex-shrink-0">Split & rotate:</span>
                      <Button
                        size="sm" variant="outline"
                        className="gap-1 h-6 text-[11px] px-1.5"
                        disabled={isSplitting}
                        title="Extract counter-clockwise 90°"
                        onClick={() => { onSplitRegion(region.bbox, 270); setSplittingIdx(null); }}
                      >
                        <RotateCcw className="w-2.5 h-2.5" />CCW
                      </Button>
                      <Button
                        size="sm" variant="outline"
                        className="gap-1 h-6 text-[11px] px-1.5"
                        disabled={isSplitting}
                        title="Extract clockwise 90°"
                        onClick={() => { onSplitRegion(region.bbox, 90); setSplittingIdx(null); }}
                      >
                        <RotateCw className="w-2.5 h-2.5" />CW
                      </Button>
                      <Button
                        size="sm" variant="outline"
                        className="gap-1 h-6 text-[11px] px-1.5"
                        disabled={isSplitting}
                        title="Extract and flip 180°"
                        onClick={() => { onSplitRegion(region.bbox, 180); setSplittingIdx(null); }}
                      >
                        {isSplitting
                          ? <Loader2 className="w-2.5 h-2.5 animate-spin" />
                          : <span className="font-mono text-[10px]">180°</span>}
                        Flip
                      </Button>
                      <button
                        type="button"
                        className="ml-auto text-[10px] text-muted-foreground/50 hover:text-muted-foreground transition-colors px-1"
                        onClick={() => setSplittingIdx(null)}
                      >
                        Cancel
                      </button>
                    </div>
                  )}
                </Fragment>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}

function StructureTab({ item, correction, onCorrect, onSave, isSaving }: TabProps) {
  const sd = item.ocr?.structuredData as any;
  const fields: [string, unknown][] = [
    ["Chapter", sd?.chapter ?? sd?.chapter_title],
    ["Section", sd?.section ?? sd?.section_title],
    ["Subsection", sd?.subsection ?? sd?.subsection_title],
    ["Headings", sd?.headings ?? sd?.heading_hierarchy],
    ["Document summary", sd?.document_summary],
    ["Page summary", sd?.page_summary ?? sd?.summary],
  ].filter(([, v]) => v != null);

  return (
    <div className="space-y-3">
      {fields.length === 0 ? (
        <>
          <p className="text-xs text-muted-foreground italic">
            No structural metadata (chapter, section, headings) found in OCR output — empty template shown below.
          </p>
          <JsonViewer value={null} emptyTemplate={EMPTY_TEMPLATES.structure} />
        </>
      ) : (
        <div className="space-y-3">
          {fields.map(([label, value]) => (
            <div key={label}>
              <p className="text-xs text-muted-foreground mb-1">{label}</p>
              <JsonViewer value={value} />
            </div>
          ))}
        </div>
      )}
      <CorrectionField label="Structure correction (JSON with chapter/section/subsection keys)"
        value={correction} onChange={onCorrect} onSave={onSave} isSaving={isSaving} />
    </div>
  );
}

function JsonTab({ item, correction, onCorrect, onSave, isSaving }: TabProps) {
  const sd = item.ocr?.structuredData;
  return (
    <div>
      <p className="text-xs text-muted-foreground mb-2">
        {sd ? "Full structured output from OCR extraction" : <span className="italic">No structured data — empty template shown below.</span>}
      </p>
      <JsonViewer value={sd ?? null} emptyTemplate={EMPTY_TEMPLATES.json} onCopyToEdit={onCorrect} />
      <CorrectionField label="Full JSON correction (paste complete corrected JSON)"
        value={correction} onChange={onCorrect} onSave={onSave} isSaving={isSaving} />
    </div>
  );
}

function DocumentTab({ item }: { item: any }) {
  return (
    <div className="space-y-4">
      <div>
        <p className="text-xs text-muted-foreground mb-1">Document</p>
        <p className="text-sm font-medium">{item.documentTitle ?? "Unknown"}</p>
        {(item.gameSystem || item.edition) && (
          <p className="text-xs text-muted-foreground mt-0.5">
            {[item.gameSystem, item.edition].filter(Boolean).join(" · ")}
          </p>
        )}
      </div>
      {item.page?.pageNumber && (
        <div>
          <p className="text-xs text-muted-foreground mb-1">Page</p>
          <p className="text-sm font-mono">
            PDF p.{item.page.pageNumber}
            {item.page.printedPageLabel && (
              <span className="ml-2 text-muted-foreground">/ Doc p.{item.page.printedPageLabel}</span>
            )}
          </p>
        </div>
      )}
      <p className="text-xs text-muted-foreground italic">
        Document-level metadata (title, summary, publisher) is set by the document_intelligence stage
        and can be edited from the Archivist's Desk.
      </p>
    </div>
  );
}

// ── History tab ───────────────────────────────────────────────────────────────

function ConfidenceDelta({ delta }: { delta: number | null | undefined }) {
  if (delta == null) return null;
  const abs = Math.abs(delta);
  if (delta > 0) return (
    <span className="flex items-center gap-0.5 text-green-400 font-medium">
      <TrendingUp className="w-3 h-3" />+{abs}pp
    </span>
  );
  if (delta < 0) return (
    <span className="flex items-center gap-0.5 text-red-400 font-medium">
      <TrendingDown className="w-3 h-3" />−{abs}pp
    </span>
  );
  return (
    <span className="flex items-center gap-0.5 text-muted-foreground">
      <Minus className="w-3 h-3" />0pp
    </span>
  );
}

function HistoryTab({ item }: { item: any }) {
  const [expandedId, setExpandedId] = useState<number | null>(null);
  const attempts: any[] = Array.isArray(item.retryAttempts) ? item.retryAttempts : [];

  if (attempts.length === 0) {
    return (
      <div className="py-8 text-center text-muted-foreground text-sm italic">
        No retry history for this page yet.
      </div>
    );
  }

  // Most recent first — the list comes back DESC from the DB but the item list
  // query may not guarantee order, so sort defensively here.
  const sorted = attempts.slice().sort((a: any, b: any) =>
    new Date(b.startedAt).getTime() - new Date(a.startedAt).getTime()
  );

  return (
    <div className="space-y-2">
      {sorted.map((attempt: any, idx: number) => {
        const isExpanded = expandedId === attempt.id;
        const isRunning  = attempt.status === "running";
        const isSuccess  = attempt.status === "succeeded";
        const stages: string[]  = attempt.requestedStages ?? [];
        const fields: string[]  = attempt.savedCorrectionFields ?? [];
        const failed: string[]  = attempt.stagesFailed ?? [];
        const errors: Record<string, string> = attempt.stageErrors ?? {};
        const models: Record<string, string> = attempt.modelTrace ?? {};
        const regionsBefore: any[] | null = Array.isArray(attempt.regionsBefore) ? attempt.regionsBefore : null;
        const regionsAfter: number | null = attempt.confidence != null
          ? null  // region count after isn't stored separately — use page regions from parent
          : null;
        const attemptNum = sorted.length - idx;
        const date = attempt.startedAt ? new Date(attempt.startedAt) : null;

        return (
          <div key={attempt.id} className="rounded border border-border/40 bg-muted/10 overflow-hidden">
            {/* Summary row */}
            <button
              type="button"
              onClick={() => setExpandedId(isExpanded ? null : attempt.id)}
              className="w-full flex items-start gap-3 px-3 py-2.5 text-left hover:bg-muted/20 transition-colors"
            >
              {/* Status icon */}
              <span className="mt-0.5 flex-shrink-0">
                {isRunning  ? <Loader2 className="w-4 h-4 text-amber-400 animate-spin" /> :
                 isSuccess  ? <CheckCircle2 className="w-4 h-4 text-green-400" /> :
                              <XCircle className="w-4 h-4 text-red-400" />}
              </span>

              <div className="flex-1 min-w-0 space-y-1">
                {/* Top row: attempt label + timestamp + duration */}
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="text-xs font-medium">Attempt #{attemptNum}</span>
                  {date && (
                    <span className="text-[10px] text-muted-foreground">
                      {date.toLocaleDateString()} {date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                    </span>
                  )}
                  {attempt.durationMs != null && (
                    <span className="text-[10px] text-muted-foreground">
                      {attempt.durationMs < 1000 ? `${attempt.durationMs}ms` : `${(attempt.durationMs / 1000).toFixed(1)}s`}
                    </span>
                  )}
                </div>

                {/* Stages + correction flags */}
                <div className="flex items-center gap-1.5 flex-wrap">
                  {stages.map(s => (
                    <span key={s} className="text-[10px] px-1.5 py-0.5 rounded bg-primary/10 text-primary/80 font-mono">
                      {s.replace(/_/g, " ")}
                    </span>
                  ))}
                  {fields.includes("layout")    && <span className="text-[10px] px-1.5 py-0.5 rounded bg-blue-500/10 text-blue-400">layout ✓</span>}
                  {fields.includes("regions")   && <span className="text-[10px] px-1.5 py-0.5 rounded bg-orange-500/10 text-orange-400">regions ✓</span>}
                  {fields.includes("structure") && <span className="text-[10px] px-1.5 py-0.5 rounded bg-purple-500/10 text-purple-400">structure ✓</span>}
                  {fields.includes("text")      && <span className="text-[10px] px-1.5 py-0.5 rounded bg-teal-500/10 text-teal-400">text ✓</span>}
                  {failed.length > 0 && (
                    <span className="text-[10px] px-1.5 py-0.5 rounded bg-red-500/10 text-red-400">
                      {failed.length} stage{failed.length > 1 ? "s" : ""} failed
                    </span>
                  )}
                </div>
              </div>

              {/* Confidence column */}
              <div className="flex-shrink-0 text-right space-y-0.5">
                {(attempt.previousConfidence != null || attempt.confidence != null) && (
                  <div className="flex items-center gap-1.5 justify-end text-xs">
                    {attempt.previousConfidence != null && (
                      <span className="text-muted-foreground font-mono">{attempt.previousConfidence}%</span>
                    )}
                    {attempt.previousConfidence != null && attempt.confidence != null && (
                      <span className="text-muted-foreground/40">→</span>
                    )}
                    {attempt.confidence != null && (
                      <span className={`font-mono font-medium ${attempt.confidence >= 80 ? "text-green-400" : attempt.confidence >= 60 ? "text-amber-400" : "text-red-400"}`}>
                        {attempt.confidence}%
                      </span>
                    )}
                  </div>
                )}
                <div className="flex justify-end">
                  <ConfidenceDelta delta={attempt.confidenceDelta} />
                </div>
              </div>

              <ChevronRight className={`w-3.5 h-3.5 flex-shrink-0 text-muted-foreground/40 mt-1 transition-transform ${isExpanded ? "rotate-90" : ""}`} />
            </button>

            {/* Expanded detail */}
            {isExpanded && (
              <div className="border-t border-border/30 px-3 py-2.5 space-y-2.5 text-xs">
                {/* Before-state */}
                {(attempt.previousLayoutType != null || attempt.previousRegionCount != null) && (
                  <div>
                    <p className="text-[11px] font-medium text-muted-foreground uppercase tracking-wide mb-1">Before</p>
                    <div className="flex gap-4 flex-wrap">
                      {attempt.previousLayoutType != null && (
                        <span className="text-muted-foreground">
                          Layout: <span className="text-foreground font-mono">{attempt.previousLayoutType}</span>
                        </span>
                      )}
                      {attempt.previousRegionCount != null && (
                        <span className="text-muted-foreground">
                          Regions: <span className="text-foreground font-mono">{attempt.previousRegionCount}</span>
                        </span>
                      )}
                    </div>
                  </div>
                )}

                {/* Region snapshot diff summary */}
                {regionsBefore && regionsBefore.length > 0 && (
                  <div>
                    <p className="text-[11px] font-medium text-muted-foreground uppercase tracking-wide mb-1">
                      Region snapshot ({regionsBefore.length} before)
                    </p>
                    <div className="space-y-0.5 max-h-32 overflow-y-auto font-mono text-[10px] text-muted-foreground">
                      {regionsBefore.map((r: any, i: number) => (
                        <div key={i} className="flex items-center gap-2">
                          <span className="w-4 text-muted-foreground/50">{i + 1}</span>
                          <span className="text-foreground/70">{r.type ?? r.regionType ?? "unknown"}</span>
                          {r.bbox && (
                            <span className="text-muted-foreground/50">
                              ({(r.bbox.x ?? 0).toFixed(0)},{(r.bbox.y ?? 0).toFixed(0)})
                            </span>
                          )}
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Model trace */}
                {Object.keys(models).length > 0 && (
                  <div>
                    <p className="text-[11px] font-medium text-muted-foreground uppercase tracking-wide mb-1">Models</p>
                    <div className="space-y-0.5">
                      {Object.entries(models).map(([stage, model]) => (
                        <div key={stage} className="flex gap-2">
                          <span className="text-muted-foreground/60 w-28 flex-shrink-0 font-mono">{stage.replace(/_/g, " ")}</span>
                          <span className="text-foreground/80 font-mono truncate">{model as string}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Stage errors */}
                {Object.keys(errors).length > 0 && (
                  <div>
                    <p className="text-[11px] font-medium text-red-400/80 uppercase tracking-wide mb-1">Errors</p>
                    <div className="space-y-1">
                      {Object.entries(errors).map(([stage, msg]) => (
                        <div key={stage} className="rounded bg-red-500/5 border border-red-500/20 px-2 py-1">
                          <span className="text-red-400/80 font-mono">{stage.replace(/_/g, " ")}: </span>
                          <span className="text-muted-foreground">{msg as string}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

// ── Main HITL card ────────────────────────────────────────────────────────────

const TABS: { id: TabId; label: string; icon: ElementType }[] = [
  { id: "text",      label: "OCR Text",  icon: FileText  },
  { id: "layout",    label: "Layout",    icon: Layout    },
  { id: "regions",   label: "Regions",   icon: BoxSelect },
  { id: "structure", label: "Structure", icon: ListTree  },
  { id: "json",      label: "JSON",      icon: Braces    },
  { id: "document",  label: "Document",  icon: BookOpen  },
  { id: "history",   label: "History",   icon: History   },
];

function HitlCard({ item, onResolved, isSelected, onToggle, isActive, onActivate, onNext }: {
  item: any;
  onResolved: () => void;
  isSelected: boolean;
  onToggle: () => void;
  isActive: boolean;
  onActivate: () => void;
  onNext: () => void;
}) {
  const { toast } = useToast();
  const [expanded, setExpanded] = useState(false);
  const cardRef = useRef<HTMLDivElement>(null);
  const [activeTab, setActiveTab] = useState<TabId>("text");
  const [savedFields, setSavedFields] = useState<Set<string>>(new Set());
  const [corrections, setCorrections] = useState<Record<TabId, string>>(() => {
    const sd = item.ocr?.structuredData as any;
    const correctedSd = item.ocr?.correctedStructuredData as any;
    const hasLayout    = !!(item.page?.layoutType || sd?.layout_type || sd?.layout || sd?.layout_metadata || sd?.page_layout);
    const hasRegions   = !!(item.page?.contentRegions || sd?.regions || sd?.bounding_boxes || sd?.content_regions);
    const hasStructure = !!(sd?.chapter || sd?.section || sd?.subsection || sd?.headings || sd?.document_summary || sd?.page_summary || sd?.summary);
    const hasJson      = !!sd;
    // Pre-populate layout from the previously saved correction so body_text metadata
    // (columns, has_table, etc.) is restored on re-open instead of resetting to defaults.
    const savedLayoutCorrection = correctedSd?.layout_correction;
    const layoutInit = savedLayoutCorrection != null
      ? JSON.stringify(savedLayoutCorrection, null, 2)
      : hasLayout ? "" : (EMPTY_TEMPLATES.layout ?? "");
    return {
      text:      "",
      layout:    layoutInit,
      regions:   hasRegions   ? "" : (EMPTY_TEMPLATES.regions   ?? ""),
      structure: hasStructure ? "" : (EMPTY_TEMPLATES.structure ?? ""),
      json:      hasJson      ? "" : (EMPTY_TEMPLATES.json      ?? ""),
      document:  "",
      history:   "",
    };
  });
  const [notes, setNotes] = useState("");
  // Tracks whether the reviewer has manually reordered regions (disables auto-sort).
  // Shared between BboxRegionEditor (canvas) and RegionsTab (reading order list) so
  // both sides stay in sync when either one triggers a reorder.
  const [regionsManualOrder, setRegionsManualOrder] = useState(false);
  // Incremented after each manual rotation to bust the browser image cache.
  const [imageKey, setImageKey] = useState(0);

  const splitMut = trpc.library.splitPageRegion.useMutation({
    onSuccess: (data) => {
      toast({
        title: "Region extracted",
        description: `Page part ${data.partIndex} created (id ${data.newPageId}) — pipeline re-running.`,
      });
    },
    onError: (e) => toast({ title: "Split failed", description: e.message, variant: "destructive" }),
  });

  const handleSplitRegion = (bbox: { x: number; y: number; w: number; h: number }, degrees: 90 | 180 | 270) => {
    if (!item.page?.id) return;
    splitMut.mutate({ pageId: item.page.id, bbox, degrees });
  };

  const rotateMut = trpc.library.rotatePage.useMutation({
    onSuccess: () => {
      setImageKey(k => k + 1);
      // Layout and regions were cleared server-side — reset local correction fields too
      setCorrections(c => ({ ...c, layout: "", regions: "" }));
    },
    onError: (e) => toast({ title: "Rotation failed", description: e.message, variant: "destructive" }),
  });

  const handleRotate = (degrees: 90 | 180 | 270) => {
    if (!item.page?.id) return;
    rotateMut.mutate({ pageId: item.page.id, degrees });
  };

  const resolveMut = trpc.hitl.resolve.useMutation({
    onSuccess: () => { toast({ title: "Approved" }); onResolved(); },
    onError: (e) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });
  const skipMut = trpc.hitl.skip.useMutation({
    onSuccess: () => { toast({ title: "Skipped" }); onResolved(); },
    onError: (e) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });
  const escalateMut = trpc.hitl.escalate.useMutation({
    onSuccess: () => { toast({ title: "Escalated" }); onResolved(); },
    onError: (e) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  type RetryStageId = "layout_analysis" | "bbox_detection" | "ocr_extraction";
  const ALL_RETRY_STAGES: RetryStageId[] = ["layout_analysis", "bbox_detection", "ocr_extraction"];
  const [retryStages, setRetryStages] = useState<Set<RetryStageId>>(new Set(ALL_RETRY_STAGES));
  const retryMut = trpc.hitl.retryPage.useMutation({
    onSuccess: () => {
      toast({ title: "Retry queued", description: "The retry has been queued and will run in the background." });
      onResolved();
    },
    onError: (e) => toast({ title: "Retry failed", description: e.message, variant: "destructive" }),
  });

  const toggleRetryStage = (s: RetryStageId) =>
    setRetryStages(prev => { const n = new Set(prev); n.has(s) ? n.delete(s) : n.add(s); return n; });

  const runRetry = () => {
    if (retryStages.size === 0) return;
    void (async () => {
      const pageId = item.page?.id ?? item.pageId;
      const dependencyFields = (["text", "layout", "regions", "structure", "json"] as const)
        .filter(field => corrections[field].trim());
      try {
        for (const field of dependencyFields) {
          await saveCorrectionMut.mutateAsync({ pageId, field, value: corrections[field] });
        }
      } catch {
        return;
      }
      // Don't clear layout/regions corrections — the visual editors use them
      // as the source of truth and would revert to stale data if cleared.
      // Text/structure/json can be cleared; the card is dismissed on retry success anyway.
      const fieldsToClear = dependencyFields.filter(f => !KEEP_ON_SAVE.has(f));
      if (fieldsToClear.length > 0) {
        setCorrections(c => ({
          ...c,
          ...Object.fromEntries(fieldsToClear.map(field => [field, ""])),
        }));
      }
      retryMut.mutate({
        pageId,
        hitlId: item.id,
        stages: [...retryStages],
        savedCorrectionFields: dependencyFields,
      });
    })();
  };

  const saveCorrectionMut = trpc.hitl.saveCorrection.useMutation({
    onSuccess: () => toast({ title: "Section saved" }),
    onError: (e) => toast({ title: "Save failed", description: e.message, variant: "destructive" }),
  });

  const [ocrApproved, setOcrApproved] = useState<boolean>(() => !!(item.ocr?.ocrApprovedAt));
  const approveOcrMut = trpc.hitl.approveOcr.useMutation({
    onSuccess: () => {
      setOcrApproved(true);
      toast({ title: "OCR approved", description: "Marked as human-curated for training inclusion." });
    },
    onError: (e) => toast({ title: "OCR approval failed", description: e.message, variant: "destructive" }),
  });

  // Tabs backed by a visual editor (BboxRegionEditor / layout selector): keep the
  // correction value after save so the editor doesn't revert to stale source data.
  // Text / structure / json are free-text fields with no visual dependency — clear
  // them on success so the indicator dot goes away.
  const KEEP_ON_SAVE = new Set(["layout", "regions"]);

  const saveSection = (field: "text" | "layout" | "regions" | "structure" | "json") => () => {
    saveCorrectionMut.mutate(
      { pageId: item.page?.id ?? item.pageId, field, value: corrections[field] },
      { onSuccess: () => {
        if (KEEP_ON_SAVE.has(field)) setSavedFields(s => new Set([...s, field]));
        else setCorrections(c => ({ ...c, [field]: "" }));
      }},
    );
  };
  const EDITABLE_FIELDS = ["text", "layout", "regions", "structure", "json"] as const;

  const saveAllCorrections = async () => {
    const pageId = item.page?.id ?? item.pageId;
    const fields = EDITABLE_FIELDS.filter(f => corrections[f].trim());
    if (fields.length === 0) return;
    for (const f of fields) {
      await saveCorrectionMut.mutateAsync({ pageId, field: f, value: corrections[f] });
    }
    const toMark = fields.filter(f => KEEP_ON_SAVE.has(f));
    if (toMark.length > 0) setSavedFields(s => new Set([...s, ...toMark]));
    const toClear = fields.filter(f => !KEEP_ON_SAVE.has(f));
    if (toClear.length > 0)
      setCorrections(c => ({ ...c, ...Object.fromEntries(toClear.map(f => [f, ""])) }));
  };

  const saveAllAndRetryOcr = () => {
    void (async () => {
      const pageId = item.page?.id ?? item.pageId;
      const fields = EDITABLE_FIELDS.filter(f => corrections[f].trim());
      try {
        for (const f of fields) {
          await saveCorrectionMut.mutateAsync({ pageId, field: f, value: corrections[f] });
        }
      } catch {
        return;
      }
      const toMark = fields.filter(f => KEEP_ON_SAVE.has(f));
      if (toMark.length > 0) setSavedFields(s => new Set([...s, ...toMark]));
      const toClear = fields.filter(f => !KEEP_ON_SAVE.has(f));
      if (toClear.length > 0)
        setCorrections(c => ({ ...c, ...Object.fromEntries(toClear.map(f => [f, ""])) }));
      retryMut.mutate({
        pageId,
        hitlId: item.id,
        stages: ["ocr_extraction"],
        savedCorrectionFields: fields,
      });
    })();
  };

  // When the reviewer switches to the Layout or Regions tab they are manually
  // providing that correction, so deselect the corresponding pipeline stage from
  // the retry set — re-running it would overwrite their edits.
  useEffect(() => {
    if (activeTab === "layout") {
      setRetryStages(prev => { const n = new Set(prev); n.delete("layout_analysis"); return n; });
    } else if (activeTab === "regions") {
      setRetryStages(prev => { const n = new Set(prev); n.delete("bbox_detection"); return n; });
    }
  }, [activeTab]);

  // Auto-expand and scroll when this card becomes the active keyboard target
  useEffect(() => {
    if (isActive) {
      setExpanded(true);
      cardRef.current?.scrollIntoView({ behavior: "smooth", block: "nearest" });
    }
  }, [isActive]);

  const isPending = resolveMut.isPending || skipMut.isPending || escalateMut.isPending || retryMut.isPending;

  const setCorrection = (tab: TabId) => (v: string) => {
    setSavedFields(s => { const n = new Set(s); n.delete(tab); return n; });
    setCorrections(c => ({ ...c, [tab]: v }));
  };

  const buildCorrectedData = () => {
    const entries = Object.entries(corrections).filter(([, v]) => v.trim());
    if (entries.length === 0) return undefined;
    return Object.fromEntries(entries.map(([k, v]) => [`${k}_correction`, v]));
  };

  const submit = (action: HitlAction) => {
    const opts = { resolutionNotes: notes || undefined };
    if (action === "resolved") {
      resolveMut.mutate({
        id: item.id,
        ...opts,
        correctedText: corrections.text || undefined,
        correctedStructuredData: buildCorrectedData(),
      });
    } else if (action === "skipped") {
      skipMut.mutate({ id: item.id, ...opts });
    } else {
      escalateMut.mutate({ id: item.id, ...opts });
    }
  };

  // Stable refs — updated every render so the keyboard effect always calls the latest versions
  // of submit/onNext without needing to re-register the listener.
  const submitRef = useRef(submit);
  submitRef.current = submit;
  const onNextRef = useRef(onNext);
  onNextRef.current = onNext;

  // Keyboard shortcuts: A = approve, F = flag/escalate, N = next item
  // Depends only on isActive — not expanded — because for cards navigated via N the
  // isActive and expanded transitions happen in separate render cycles (card 1 batches
  // both in a single click; card 2 auto-expands in a subsequent useEffect). Gating on
  // expanded causes the handler to miss registration in that second cycle.
  useEffect(() => {
    if (!isActive) return;
    const handler = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement;
      if (target.tagName === "TEXTAREA" || target.tagName === "INPUT" || target.isContentEditable) return;
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      switch (e.key.toLowerCase()) {
        case "a": e.preventDefault(); submitRef.current("resolved");  break;
        case "f": e.preventDefault(); submitRef.current("escalated"); break;
        case "n": e.preventDefault(); onNextRef.current();            break;
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [isActive]);

  const pageImagePath = item.page?.rawPngUrl
    ? `/api/pipeline/pages/${item.page.rawPngUrl.replace(/.*\/workspace\//, "")}`
    : null;
  const sourceRegions = (item.page?.contentRegions as any[]) ?? [];
  const editableRegions = useMemo(
    () => parseRegionJson(corrections.regions, sourceRegions),
    [corrections.regions, sourceRegions],
  );
  const setEditableRegions = (regions: any[]) => {
    setCorrections(c => ({ ...c, regions: JSON.stringify(regions, null, 2) }));
  };

  const hasCorrections = Object.values(corrections).some(v => v.trim());
  const activeEditableTab = activeTab !== "document" && activeTab !== "history";
  const activeOcrTab = activeTab === "text" || activeTab === "structure" || activeTab === "json";
  const retryAttempts: any[] = Array.isArray(item.retryAttempts) ? item.retryAttempts : [];

  return (
    <div ref={cardRef}>
    <Card className={`bg-card/50 backdrop-blur-sm border-border/50 transition-colors ${isActive ? "border-primary/30" : ""}`}>
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <div className="flex items-center gap-3 min-w-0 flex-1">
            <input
              type="checkbox"
              checked={isSelected}
              onChange={onToggle}
              onClick={e => e.stopPropagation()}
              className="flex-shrink-0 accent-primary cursor-pointer w-4 h-4"
            />
            <button
              onClick={() => { const next = !expanded; setExpanded(next); if (next) onActivate(); }}
              className="flex items-center gap-3 min-w-0 flex-1 text-left text-muted-foreground hover:text-foreground"
            >
              {expanded ? <ChevronDown className="w-4 h-4 flex-shrink-0" /> : <ChevronRight className="w-4 h-4 flex-shrink-0" />}
              <div className="min-w-0 flex-1">
                <CardTitle className="text-base truncate">
                  PDF p.{item.page?.pageNumber ?? "?"}
                  {item.page?.printedPageLabel && (
                    <span className="text-muted-foreground font-normal"> / Doc p.{item.page.printedPageLabel}</span>
                  )}
                  {" — "}{item.reason}
                </CardTitle>
                <p className="text-xs text-muted-foreground truncate mt-0.5">
                  {item.documentTitle ?? "Unknown"}
                  {(item.gameSystem || item.edition) && (
                    <span className="ml-1 opacity-70">
                      [{[item.gameSystem, item.edition].filter(Boolean).join(" · ")}]
                    </span>
                  )}
                </p>
              </div>
            </button>
          </div>
          <div className="flex items-center gap-2 flex-shrink-0">
            <StatusBadge status={item.status} />
            {item.flag_category && item.flag_category !== "manual_flag" && (
              <span className={`text-[10px] rounded px-1.5 py-0.5 border flex-shrink-0 ${
                item.flag_category === "provider_exhausted"
                  ? "text-orange-400 bg-orange-400/10 border-orange-400/20"
                  : item.flag_category === "low_confidence"
                  ? "text-amber-400 bg-amber-400/10 border-amber-400/20"
                  : item.flag_category === "native_text_divergence"
                  ? "text-yellow-400 bg-yellow-400/10 border-yellow-400/20"
                  : item.flag_category === "stage_failure"
                  ? "text-red-400 bg-red-400/10 border-red-400/20"
                  : "text-muted-foreground bg-muted/20 border-border/30"
              }`}>
                {item.flag_category.replace(/_/g, " ")}
              </span>
            )}
            {item.ocr?.confidence != null && (
              <span className="text-xs text-muted-foreground font-mono">conf: {item.ocr.confidence}%</span>
            )}
            <button
              title="Download this page's OCR data"
              onClick={() => triggerJsonDownload(
                `ocr-p${item.page?.pageNumber ?? item.id}.json`,
                formatExportRecord(item),
              )}
              className="text-muted-foreground hover:text-foreground p-1 rounded hover:bg-muted/30 flex-shrink-0"
            >
              <Download className="w-3.5 h-3.5" />
            </button>
            {item.status === "queued" && !expanded && (
              <div className="flex items-center gap-1 ml-2">
                <Button size="sm" variant="ghost" className="h-7 text-xs px-2 text-yellow-500 hover:bg-yellow-500/10"
                  onClick={() => submit("escalated")} disabled={isPending}>
                  <ArrowUpCircle className="w-3 h-3 mr-1" /> Escalate
                </Button>
                <Button size="sm" variant="ghost" className="h-7 text-xs px-2"
                  onClick={() => submit("skipped")} disabled={isPending}>
                  <XCircle className="w-3 h-3 mr-1" /> Skip
                </Button>
                <Button size="sm" className="h-7 text-xs px-2 bg-green-600 hover:bg-green-700 text-white"
                  onClick={() => submit("resolved")} disabled={isPending}>
                  {isPending ? <Loader2 className="w-3 h-3 animate-spin" /> : <CheckCircle2 className="w-3 h-3 mr-1" />}
                  Approve
                </Button>
              </div>
            )}
          </div>
        </div>
      </CardHeader>

      {expanded && (
        <CardContent className="space-y-4 pt-0">
          <div className="grid grid-cols-1 lg:grid-cols-[40%_1fr] gap-4">
            {/* Left: page image */}
            <div>
              <p className="text-xs text-muted-foreground uppercase tracking-wide mb-2">Page Image</p>
              {pageImagePath ? (() => {
                const url = imageKey > 0 ? `${pageImagePath}?_k=${imageKey}` : pageImagePath;
                return activeTab === "regions" ? (
                  <BboxRegionEditor
                    key={imageKey}
                    imageUrl={url}
                    regions={editableRegions}
                    onChange={setEditableRegions}
                    manualOrder={regionsManualOrder}
                    onManualOrderChange={setRegionsManualOrder}
                  />
                ) : (
                  <BboxOverlayToggle
                    key={imageKey}
                    imageUrl={url}
                    regions={editableRegions}
                    imageClassName="w-full rounded border border-border/50 object-contain max-h-[600px]"
                  />
                );
              })() : (
                <div className="h-48 flex items-center justify-center rounded border border-dashed border-border/50 bg-muted/10 text-muted-foreground text-sm">
                  Image not available
                </div>
              )}
            </div>

            {/* Right: tabs */}
            <div className="flex flex-col gap-3">
              {/* Tab bar */}
              <div className="flex gap-1 flex-wrap p-1 rounded-md bg-muted/20 border border-border/30">
                {TABS.map(({ id, label, icon: Icon }) => (
                  <button
                    key={id}
                    onClick={() => setActiveTab(id)}
                    className={`flex items-center gap-1.5 px-2.5 py-1 rounded text-xs font-medium transition-colors ${
                      activeTab === id
                        ? "bg-background shadow text-foreground"
                        : "text-muted-foreground hover:text-foreground"
                    }`}
                  >
                    <Icon className="w-3 h-3" />
                    {label}
                    {id === "history" && retryAttempts.length > 0 ? (
                      <span className="min-w-[1.1rem] h-[1.1rem] rounded-full bg-primary/20 text-primary text-[9px] font-bold flex items-center justify-center px-0.5 flex-shrink-0">
                        {retryAttempts.length}
                      </span>
                    ) : id !== "history" && corrections[id]?.trim() && !savedFields.has(id) ? (
                      <span className="w-1.5 h-1.5 rounded-full bg-orange-400 flex-shrink-0" title="Has correction" />
                    ) : (id === "text" || id === "structure" || id === "json") && ocrApproved ? (
                      <span title="OCR approved for training" className="flex-shrink-0">
                        <ShieldCheck className="w-2.5 h-2.5 text-green-500" />
                      </span>
                    ) : null}
                  </button>
                ))}
              </div>

              {/* Tab content */}
              <div className="flex-1 overflow-auto">
                {activeTab === "text"      && <TextTab      item={item} correction={corrections.text}      onCorrect={setCorrection("text")}      onSave={saveSection("text")}      isSaving={saveCorrectionMut.isPending} />}
                {activeTab === "layout"    && <LayoutTab    item={item} correction={corrections.layout}    onCorrect={setCorrection("layout")}    onSave={saveSection("layout")}    isSaving={saveCorrectionMut.isPending} onRotate={handleRotate} isRotating={rotateMut.isPending} />}
                {activeTab === "regions"   && <RegionsTab   item={item} correction={corrections.regions}   onCorrect={setCorrection("regions")}   onSave={saveSection("regions")}   isSaving={saveCorrectionMut.isPending}
                  editableRegions={editableRegions}
                  onReorder={(rs) => { setRegionsManualOrder(true); setEditableRegions(rs); }}
                  manualOrder={regionsManualOrder}
                  onAutoSort={() => { setRegionsManualOrder(false); setEditableRegions(sortRegionsByPosition(editableRegions)); }}
                  onSplitRegion={handleSplitRegion}
                  isSplitting={splitMut.isPending}
                />}
                {activeTab === "structure" && <StructureTab item={item} correction={corrections.structure} onCorrect={setCorrection("structure")} onSave={saveSection("structure")} isSaving={saveCorrectionMut.isPending} />}
                {activeTab === "json"      && <JsonTab      item={item} correction={corrections.json}      onCorrect={setCorrection("json")}      onSave={saveSection("json")}      isSaving={saveCorrectionMut.isPending} />}
                {activeTab === "document"  && <DocumentTab  item={item} />}
                {activeTab === "history"   && <HistoryTab   item={item} />}
              </div>
            </div>
          </div>

          {/* Notes + actions */}
          <div className="border-t border-border/30 pt-4 space-y-3">
            <div className="space-y-1">
              <p className="text-xs text-muted-foreground">Review notes (optional)</p>
              <Textarea
                value={notes}
                onChange={e => setNotes(e.target.value)}
                placeholder="Add notes about this page…"
                className="text-xs h-14 bg-background/50"
              />
            </div>
            {/* Retry section */}
            <div className="flex items-center gap-3 py-2 border-t border-border/30 flex-wrap">
              <span className="text-xs text-muted-foreground font-medium flex-shrink-0">Retry stages:</span>
              {(["layout_analysis", "bbox_detection", "ocr_extraction"] as const).map(s => {
                const label = s === "layout_analysis" ? "Layout" : s === "bbox_detection" ? "Regions" : "OCR";
                const active = retryStages.has(s);
                return (
                  <button key={s} onClick={() => toggleRetryStage(s)} disabled={isPending}
                    className={`px-2.5 py-1 rounded text-xs font-medium border transition-colors ${
                      active
                        ? "bg-primary/10 border-primary/40 text-primary"
                        : "bg-transparent border-border/40 text-muted-foreground hover:text-foreground"
                    }`}>
                    {label}
                  </button>
                );
              })}
              <Button size="sm" variant="outline" className="gap-1.5 ml-auto"
                onClick={runRetry} disabled={isPending || saveCorrectionMut.isPending || retryStages.size === 0}>
                {retryMut.isPending
                  ? <><Loader2 className="w-3.5 h-3.5 animate-spin" /> Retrying…</>
                  : <><RefreshCw className="w-3.5 h-3.5" /> Retry</>}
              </Button>
              {activeEditableTab && (
                <>
                  <Button size="sm" variant="outline" className="gap-1.5"
                    onClick={() => void saveAllCorrections()} disabled={isPending || saveCorrectionMut.isPending}>
                    {saveCorrectionMut.isPending
                      ? <><Loader2 className="w-3.5 h-3.5 animate-spin" /> Saving...</>
                      : <><Save className="w-3.5 h-3.5" /> Save</>}
                  </Button>
                  <Button size="sm" variant="outline" className="gap-1.5"
                    onClick={saveAllAndRetryOcr} disabled={isPending || saveCorrectionMut.isPending}>
                    {saveCorrectionMut.isPending || retryMut.isPending
                      ? <><Loader2 className="w-3.5 h-3.5 animate-spin" /> Applying...</>
                      : hasCorrections
                        ? <><RefreshCw className="w-3.5 h-3.5" /> Save + OCR</>
                        : <><RefreshCw className="w-3.5 h-3.5" /> Retry OCR</>}
                  </Button>
                </>
              )}
              {activeOcrTab && (
                <Button
                  size="sm"
                  variant="outline"
                  className={`gap-1.5 ml-auto ${ocrApproved ? "border-green-500/50 text-green-500 hover:bg-green-500/10" : "text-muted-foreground"}`}
                  onClick={() => approveOcrMut.mutate({ pageId: item.page?.id ?? item.pageId })}
                  disabled={approveOcrMut.isPending}
                  title={ocrApproved ? "OCR output has been explicitly human-approved for training inclusion" : "Mark this OCR output as human-curated and safe for training"}
                >
                  {approveOcrMut.isPending
                    ? <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    : <ShieldCheck className="w-3.5 h-3.5" />}
                  {ocrApproved ? "OCR Approved" : "Approve OCR"}
                </Button>
              )}
            </div>
            {retryAttempts.length > 0 && (
              <div className="space-y-1 border-t border-border/30 pt-3">
                <p className="text-xs text-muted-foreground font-medium">Retry history</p>
                <div className="space-y-1">
                  {retryAttempts.slice(0, 4).map(attempt => {
                    const errors = attempt.stageErrors && Object.keys(attempt.stageErrors).length > 0
                      ? Object.entries(attempt.stageErrors).map(([stage, message]) => `${stage}: ${String(message)}`).join(" | ")
                      : "";
                    return (
                      <div key={attempt.id} className="text-[11px] rounded border border-border/30 bg-muted/10 p-2 space-y-1">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className={`font-semibold ${retryStatusClass(attempt.status)}`}>{attempt.status}</span>
                          <span className="text-muted-foreground">{formatRetryTimestamp(attempt.completedAt ?? attempt.startedAt)}</span>
                          <span className="font-mono text-muted-foreground">
                            {(attempt.requestedStages ?? []).join(", ") || "no stages"}
                          </span>
                          {typeof attempt.confidence === "number" && (
                            <span className="text-muted-foreground">conf: {attempt.confidence}%</span>
                          )}
                        </div>
                        {(attempt.savedCorrectionFields ?? []).length > 0 && (
                          <p className="text-muted-foreground">
                            saved before retry: {(attempt.savedCorrectionFields ?? []).join(", ")}
                          </p>
                        )}
                        {errors && <p className="text-red-300 truncate">{errors}</p>}
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            <div className="flex items-center justify-between gap-4 flex-wrap">
              <div className="flex items-center gap-3 min-w-0">
                {hasCorrections ? (
                  <p className="text-xs text-orange-400">
                    {Object.values(corrections).filter(v => v.trim()).length} tab(s) with corrections — will be saved on Approve.
                  </p>
                ) : (
                  <p className="text-xs text-muted-foreground">No corrections — Approve accepts OCR output as-is.</p>
                )}
                {ocrApproved && (
                  <p className="text-xs text-green-500 flex items-center gap-1 flex-shrink-0">
                    <ShieldCheck className="w-3 h-3" /> OCR approved for training
                  </p>
                )}
                {isActive && (
                  <p className="text-[10px] font-mono text-muted-foreground/40 flex-shrink-0 hidden sm:block">
                    <kbd className="px-0.5 border border-border/30 rounded">A</kbd> approve ·{" "}
                    <kbd className="px-0.5 border border-border/30 rounded">F</kbd> flag ·{" "}
                    <kbd className="px-0.5 border border-border/30 rounded">N</kbd> next
                  </p>
                )}
              </div>
              <div className="flex gap-2 flex-shrink-0">
                <Button variant="outline" size="sm" className="gap-1.5 text-yellow-500 border-yellow-500/30 hover:bg-yellow-500/10"
                  onClick={() => submit("escalated")} disabled={isPending}>
                  <ArrowUpCircle className="w-4 h-4" /> Escalate
                </Button>
                <Button variant="outline" size="sm" className="gap-1.5"
                  onClick={() => submit("skipped")} disabled={isPending}>
                  <XCircle className="w-4 h-4" /> Skip
                </Button>
                <Button size="sm" className="gap-1.5 bg-green-600 hover:bg-green-700 text-white"
                  onClick={() => submit("resolved")} disabled={isPending}>
                  {resolveMut.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <CheckCircle2 className="w-4 h-4" />}
                  Approve
                </Button>
              </div>
            </div>
          </div>
        </CardContent>
      )}
    </Card>
    </div>
  );
}

// ── Page ──────────────────────────────────────────────────────────────────────

const PAGE_SIZE = 25;

export default function TrialsOfTruth() {
  const { toast } = useToast();
  const [statusFilter, setStatusFilter] = useState<"queued" | "resolved" | "escalated" | "skipped">("queued");
  // "review" = all categories except provider_exhausted (needs human judgment);
  // "infrastructure" = only provider_exhausted (needs batch retry, not manual review)
  const [categoryGroup, setCategoryGroup] = useState<"review" | "infrastructure">("review");
  const [documentFilter, setDocumentFilter] = useState<number | undefined>(undefined);
  const [page, setPage] = useState(0);
  const [selected, setSelected] = useState<Set<number>>(new Set());
  const [activeItemId, setActiveItemId] = useState<number | null>(null);

  // Documents available for filtering — fetched independently of status so the
  // dropdown always shows all docs that have HITL items of any kind.
  const { data: hitlDocs = [] } = trpc.hitl.listDocuments.useQuery(undefined);

  const { data: items, isLoading, error, refetch } = trpc.hitl.list.useQuery({
    status: statusFilter,
    excludeCategory: categoryGroup === "review" ? "provider_exhausted" : undefined,
    flagCategory:    categoryGroup === "infrastructure" ? "provider_exhausted" : undefined,
    documentId: documentFilter,
    limit: PAGE_SIZE,
    offset: page * PAGE_SIZE,
  });
  const { data: stats, refetch: refetchStats } = trpc.hitl.stats.useQuery();
  const utils = trpc.useUtils();

  const onAction = () => { refetch(); refetchStats(); };

  const bulkApproveMut = trpc.hitl.bulkResolve.useMutation({
    onSuccess: (r) => { toast({ title: `Approved ${r.count} items` }); onAction(); },
    onError: (e) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });
  const clearMut = trpc.hitl.clear.useMutation({
    onSuccess: () => { toast({ title: "HITL items cleared" }); setPage(0); onAction(); },
    onError: (e) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  const queuedIds = (items ?? []).filter((i: any) => i.status === "queued").map((i: any) => i.id);
  // Use the view-specific queued count so the stat card and tab label match what the list
  // actually returns: "review" excludes provider_exhausted; "infrastructure" shows only those.
  const effectiveQueuedCount = categoryGroup === "review"
    ? (stats?.queuedReview ?? 0)
    : (stats?.queuedInfra ?? 0);
  const totalForStatus: number = statusFilter === "queued" ? effectiveQueuedCount : (stats?.[statusFilter] ?? 0);
  const totalPages = Math.ceil(totalForStatus / PAGE_SIZE);

  const switchFilter = (s: typeof statusFilter) => { setStatusFilter(s); setPage(0); setSelected(new Set()); };

  const toggleSelect = (id: number) =>
    setSelected(prev => { const s = new Set(prev); s.has(id) ? s.delete(id) : s.add(id); return s; });
  const toggleSelectAll = () =>
    setSelected(prev => prev.size === (items?.length ?? 0) ? new Set() : new Set(items?.map((i: any) => i.id) ?? []));

  const [isExporting, setIsExporting] = useState(false);
  const [trainingDocumentId, setTrainingDocumentId] = useState("");
  const [trainingPageStart, setTrainingPageStart] = useState("");
  const [trainingPageEnd, setTrainingPageEnd] = useState("");

  const downloadSelected = () => {
    const toExport = (items ?? []).filter((i: any) => selected.has(i.id));
    triggerJsonDownload(`ocr-export-selected-${Date.now()}.json`, toExport.map(formatExportRecord));
  };

  const downloadAll = async () => {
    setIsExporting(true);
    try {
      const data = await utils.hitl.exportOcr.fetch({ status: statusFilter });
      triggerJsonDownload(`ocr-export-${statusFilter}-${Date.now()}.json`, data);
    } catch (e: any) {
      toast({ title: "Export failed", description: e.message, variant: "destructive" });
    } finally {
      setIsExporting(false);
    }
  };

  const downloadTrainingData = async () => {
    setIsExporting(true);
    try {
      const data = await utils.hitl.exportTrainingData.fetch({ status: statusFilter });
      triggerJsonDownload(`ocr-training-${statusFilter}-${Date.now()}.json`, data);
    } catch (e: any) {
      toast({ title: "Export failed", description: e.message, variant: "destructive" });
    } finally {
      setIsExporting(false);
    }
  };

  const downloadTrainingRange = async () => {
    const documentId = Number(trainingDocumentId);
    if (!Number.isInteger(documentId) || documentId <= 0) {
      toast({ title: "Document ID required", variant: "destructive" });
      return;
    }
    const pageStart = trainingPageStart ? Number(trainingPageStart) : undefined;
    const pageEnd = trainingPageEnd ? Number(trainingPageEnd) : undefined;
    setIsExporting(true);
    try {
      const data = await utils.hitl.exportTrainingData.fetch({
        documentId,
        pageStart: Number.isInteger(pageStart) ? pageStart : undefined,
        pageEnd: Number.isInteger(pageEnd) ? pageEnd : undefined,
      });
      triggerJsonDownload(`ocr-training-doc-${documentId}-${pageStart ?? "first"}-${pageEnd ?? "last"}-${Date.now()}.json`, data);
    } catch (e: any) {
      toast({ title: "Export failed", description: e.message, variant: "destructive" });
    } finally {
      setIsExporting(false);
    }
  };

  return (
    <div className="space-y-8 animate-in fade-in duration-500">
      <div>
        <h1 className="text-4xl font-bold tracking-tight mb-2 flex items-center gap-3">
          <ClipboardList className="w-10 h-10 text-primary" />
          Trials of Truth
        </h1>
        <p className="text-lg text-muted-foreground max-w-3xl">
          Review each processed page. Approve, correct, skip, or escalate.
          Each tab reveals a different aspect of the OCR output — correct only what needs fixing.
        </p>
      </div>

      {/* Stats */}
      {stats && (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
          {([
            { key: "queued",    label: "Awaiting Review", color: "text-yellow-400" },
            { key: "resolved",  label: "Resolved",        color: "text-green-400"  },
            { key: "escalated", label: "Escalated",       color: "text-red-400"    },
            { key: "skipped",   label: "Skipped",         color: "text-muted-foreground" },
          ] as const).map(({ key, label, color }) => (
            <Card key={key} className="bg-card/50 backdrop-blur-sm border-border/50 cursor-pointer hover:border-border/80 transition-colors"
              onClick={() => switchFilter(key)}>
              <CardContent className="pt-4 pb-3">
                <p className={`text-3xl font-bold ${color}`}>
                  {key === "queued" ? effectiveQueuedCount : ((stats as any)[key] ?? 0)}
                </p>
                <p className="text-xs text-muted-foreground mt-1">{label}</p>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* Filter + bulk actions */}
      <div className="space-y-2">
        {/* Category group toggle */}
        <div className="flex items-center gap-2 pb-1">
          {(["review", "infrastructure"] as const).map(g => (
            <button key={g} onClick={() => { setCategoryGroup(g); setPage(0); setSelected(new Set()); }}
              className={`px-3 py-1 rounded-md text-xs font-medium transition-colors ${
                categoryGroup === g
                  ? g === "infrastructure" ? "bg-orange-500/20 text-orange-300 border border-orange-500/30" : "bg-primary/20 text-primary border border-primary/30"
                  : "bg-muted/20 text-muted-foreground hover:text-foreground"
              }`}>
              {g === "review" ? "Needs Review" : "⚡ Infrastructure Failures"}
            </button>
          ))}
          <span className="text-xs text-muted-foreground/50">
            {categoryGroup === "review" ? "Human-reviewable quality issues" : "Provider exhaustion — use Retry All from Archivist's Desk"}
          </span>
        </div>
        {/* Document filter */}
        {hitlDocs.length > 0 && (
          <div className="flex items-center gap-2">
            <span className="text-xs text-muted-foreground">Document:</span>
            <Select
              value={documentFilter !== undefined ? String(documentFilter) : "all"}
              onValueChange={v => { setDocumentFilter(v === "all" ? undefined : Number(v)); setPage(0); setSelected(new Set()); }}
            >
              <SelectTrigger className="h-7 text-xs w-64">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All documents</SelectItem>
                {hitlDocs.map((d: any) => (
                  <SelectItem key={d.id} value={String(d.id)}>
                    {docLabel(d)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        )}

        <div className="flex items-center justify-between gap-4 flex-wrap">
          <div className="flex gap-2 flex-wrap">
            {(["queued", "resolved", "escalated", "skipped"] as const).map(s => (
              <button key={s} onClick={() => { switchFilter(s); setSelected(new Set()); }}
                className={`px-3 py-1.5 rounded-md text-sm font-medium transition-colors ${
                  statusFilter === s ? "bg-primary text-primary-foreground" : "bg-muted/30 text-muted-foreground hover:text-foreground"
                }`}>
                {s.charAt(0).toUpperCase() + s.slice(1)}
                {stats && <span className="ml-1.5 opacity-60 text-xs">({s === "queued" ? effectiveQueuedCount : ((stats as any)[s] ?? 0)})</span>}
              </button>
            ))}
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            {statusFilter === "queued" && queuedIds.length > 0 && (
              <Button variant="outline" size="sm"
                className="gap-2 text-green-500 border-green-500/30 hover:bg-green-500/10"
                onClick={() => { if (confirm(`Approve all ${queuedIds.length} queued items on this page as-is?`)) bulkApproveMut.mutate({ ids: queuedIds }); }}
                disabled={bulkApproveMut.isPending}>
                {bulkApproveMut.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <CheckCircle2 className="w-4 h-4" />}
                Approve Page ({queuedIds.length})
              </Button>
            )}
            <Button variant="outline" size="sm"
              className="gap-2 text-red-400 border-red-500/30 hover:bg-red-500/10"
              onClick={() => {
                const label = statusFilter === "queued" ? "ALL queued" : `all ${statusFilter}`;
                if (confirm(`Delete ${label} HITL items? This cannot be undone.`))
                  clearMut.mutate({ statuses: [statusFilter] });
              }}
              disabled={clearMut.isPending}>
              <Trash2 className="w-4 h-4" />
              Clear {statusFilter.charAt(0).toUpperCase() + statusFilter.slice(1)}
            </Button>
            <Button variant="outline" size="sm"
              className="gap-2 text-muted-foreground border-border/30 hover:bg-red-500/10 hover:text-red-400 hover:border-red-500/30"
              onClick={() => { if (confirm("Delete ALL HITL items across all statuses? This cannot be undone.")) clearMut.mutate({ statuses: [] }); }}
              disabled={clearMut.isPending}>
              <Trash2 className="w-4 h-4" /> Clear All
            </Button>
          </div>
        </div>

        {/* Selection + download bar */}
        <div className="flex items-center gap-3 flex-wrap text-sm">
          {(items?.length ?? 0) > 0 && (
            <label className="flex items-center gap-2 text-muted-foreground cursor-pointer select-none">
              <input type="checkbox"
                checked={selected.size > 0 && selected.size === (items?.length ?? 0)}
                ref={el => { if (el) el.indeterminate = selected.size > 0 && selected.size < (items?.length ?? 0); }}
                onChange={toggleSelectAll}
                className="accent-primary w-4 h-4"
              />
              {selected.size === 0 ? "Select all" : `${selected.size} selected`}
            </label>
          )}
            {selected.size > 0 && (
              <Button variant="outline" size="sm" className="gap-1.5 h-7 text-xs"
                onClick={downloadSelected}>
                <Download className="w-3.5 h-3.5" />
                Download Selected ({selected.size})
              </Button>
            )}
            <Button variant="outline" size="sm" className="gap-1.5 h-7 text-xs ml-auto"
              onClick={downloadAll} disabled={isExporting || totalForStatus === 0}>
              {isExporting ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Download className="w-3.5 h-3.5" />}
              Download All {statusFilter.charAt(0).toUpperCase() + statusFilter.slice(1)}
            </Button>
            <Button variant="outline" size="sm" className="gap-1.5 h-7 text-xs"
              onClick={downloadTrainingData} disabled={isExporting || totalForStatus === 0}>
              {isExporting ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Download className="w-3.5 h-3.5" />}
              Training Data
            </Button>
            <div className="flex items-center gap-1.5 ml-auto sm:ml-0">
              <Input
                value={trainingDocumentId}
                onChange={e => setTrainingDocumentId(e.target.value)}
                type="number"
                min="1"
                placeholder="Doc"
                className="h-7 w-20 text-xs"
              />
              <Input
                value={trainingPageStart}
                onChange={e => setTrainingPageStart(e.target.value)}
                type="number"
                min="1"
                placeholder="From"
                className="h-7 w-20 text-xs"
              />
              <Input
                value={trainingPageEnd}
                onChange={e => setTrainingPageEnd(e.target.value)}
                type="number"
                min="1"
                placeholder="To"
                className="h-7 w-20 text-xs"
              />
              <Button variant="outline" size="sm" className="gap-1.5 h-7 text-xs"
                onClick={downloadTrainingRange} disabled={isExporting}>
                {isExporting ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Download className="w-3.5 h-3.5" />}
                Range
              </Button>
            </div>
          </div>
      </div>

      {/* Items */}
      {isLoading ? (
        <div className="flex items-center gap-2 text-muted-foreground">
          <Loader2 className="w-4 h-4 animate-spin" /> Loading…
        </div>
      ) : error ? (
        <div className="py-10 text-center text-destructive/70">
          <p className="text-sm font-medium">Failed to load queue items</p>
          <p className="text-xs mt-1 opacity-70">{error.message}</p>
        </div>
      ) : items?.length === 0 ? (
        <div className="text-center py-16 text-muted-foreground">
          <CheckCircle2 className="w-12 h-12 mx-auto mb-3 opacity-30" />
          <p>No {statusFilter} items in the queue.</p>
        </div>
      ) : (
        <>
          <div className="space-y-3">
            {items?.map((item: any, idx: number) => (
              <HitlCard
                key={item.id}
                item={item}
                onResolved={onAction}
                isSelected={selected.has(item.id)}
                onToggle={() => toggleSelect(item.id)}
                isActive={activeItemId === item.id}
                onActivate={() => setActiveItemId(item.id)}
                onNext={() => {
                  const nextItem = (items as any[])[idx + 1];
                  if (nextItem) setActiveItemId(nextItem.id);
                }}
              />
            ))}
          </div>

          {/* Pagination */}
          {totalPages > 1 && (
            <div className="flex items-center justify-center gap-3 pt-2">
              <Button variant="outline" size="sm" className="gap-1.5"
                onClick={() => setPage(p => Math.max(0, p - 1))} disabled={page === 0}>
                <ChevronLeft className="w-4 h-4" /> Prev
              </Button>
              <span className="text-sm text-muted-foreground">
                Page {page + 1} of {totalPages} ({totalForStatus} total)
              </span>
              <Button variant="outline" size="sm" className="gap-1.5"
                onClick={() => setPage(p => p + 1)} disabled={(items?.length ?? 0) < PAGE_SIZE}>
                Next <ChevronDown className="w-4 h-4 rotate-[-90deg]" />
              </Button>
            </div>
          )}
        </>
      )}
    </div>
  );
}
