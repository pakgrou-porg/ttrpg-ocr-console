import { useState, useEffect, useRef } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import {
  CheckCircle2, XCircle, ArrowUpCircle, ChevronDown, ChevronRight,
  Loader2, ClipboardList, FileText, Layout, BoxSelect, ListTree, Braces, BookOpen,
  Trash2, ChevronLeft, Download, RefreshCw, Scissors,
} from "lucide-react";
import { BboxOverlayToggle } from "@/components/BboxOverlay";
import { trpc } from "@/lib/trpc";
import { useToast } from "@/hooks/use-toast";

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
  };
}

type HitlAction = "resolved" | "skipped" | "escalated";
type TabId = "text" | "layout" | "regions" | "structure" | "json" | "document";

// Empty JSON templates shown when a section has no source data.
// Pre-populate the correction field so reviewers have a starting structure.
const EMPTY_TEMPLATES: Partial<Record<TabId, string>> = {
  layout:    JSON.stringify({ layout_type: "", columns: 1, notes: "" }, null, 2),
  regions:   JSON.stringify([], null, 2),
  structure: JSON.stringify({ chapter: "", section: "", subsection: "", headings: [], page_summary: "" }, null, 2),
  json:      JSON.stringify({ layout_type: "", content_blocks: [], page_summary: "" }, null, 2),
};

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

function JsonViewer({ value, emptyTemplate }: { value: unknown; emptyTemplate?: string }) {
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
    <pre className="text-xs bg-muted/20 border border-border/40 rounded p-3 overflow-auto max-h-64 whitespace-pre-wrap break-all">
      {typeof value === "string" ? value : JSON.stringify(value, null, 2)}
    </pre>
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
          {looksLikeJson && trimmed.length > 2 && (
            <button onClick={handlePrune}
              className="flex items-center gap-1 text-xs px-2 py-0.5 rounded border border-border/40 text-muted-foreground hover:text-foreground hover:border-border transition-colors"
              title="Remove object keys with empty string, empty array, or empty object values">
              <Scissors className="w-3 h-3" />
              Prune empty
            </button>
          )}
          {onSave && (
            <button onClick={onSave} disabled={isSaving}
              className="flex items-center gap-1 text-xs px-2 py-0.5 rounded border border-border/40 text-muted-foreground hover:text-foreground hover:border-border transition-colors disabled:opacity-50">
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

  return (
    <div>
      <JsonViewer value={displayText ?? "No OCR text extracted"} />
      <CorrectionField label="Corrected text" value={correction} onChange={onCorrect} onSave={onSave} isSaving={isSaving} />
    </div>
  );
}

function LayoutTab({ item, correction, onCorrect, onSave, isSaving }: TabProps) {
  const sd = item.ocr?.structuredData as any;
  const layoutType = item.page?.layoutType ?? sd?.layout_type;
  const layoutMeta = sd?.layout ?? sd?.layout_metadata ?? sd?.page_layout;

  return (
    <div className="space-y-3">
      <div className="flex gap-3 items-center">
        <span className="text-xs text-muted-foreground uppercase tracking-wide">Layout Type</span>
        <span className="text-sm font-mono px-2 py-0.5 rounded bg-muted/30 border border-border/40">
          {layoutType ?? <span className="text-muted-foreground/50 italic">not detected</span>}
        </span>
      </div>
      <div>
        <p className="text-xs text-muted-foreground mb-1">Layout metadata</p>
        <JsonViewer value={layoutMeta ?? null} emptyTemplate={EMPTY_TEMPLATES.layout} />
      </div>
      <CorrectionField label="Layout correction (JSON or plain description)"
        value={correction} onChange={onCorrect} onSave={onSave} isSaving={isSaving} />
    </div>
  );
}

function RegionsTab({ item, correction, onCorrect, onSave, isSaving }: TabProps) {
  const sd = item.ocr?.structuredData as any;
  const regions = item.page?.contentRegions ?? sd?.regions ?? sd?.bounding_boxes ?? sd?.content_regions;

  return (
    <div className="space-y-3">
      <p className="text-xs text-muted-foreground">
        {regions
          ? (Array.isArray(regions) ? `${regions.length} region(s) detected` : "Region data")
          : <span className="italic">No bounding box / region data detected — empty template shown below.</span>}
      </p>
      <JsonViewer value={regions ?? null} emptyTemplate={EMPTY_TEMPLATES.regions} />
      <CorrectionField label="Region correction (JSON array)"
        value={correction} onChange={onCorrect} onSave={onSave} isSaving={isSaving} />
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
      <JsonViewer value={sd ?? null} emptyTemplate={EMPTY_TEMPLATES.json} />
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

// ── Main HITL card ────────────────────────────────────────────────────────────

const TABS: { id: TabId; label: string; icon: React.ElementType }[] = [
  { id: "text",      label: "OCR Text",  icon: FileText  },
  { id: "layout",    label: "Layout",    icon: Layout    },
  { id: "regions",   label: "Regions",   icon: BoxSelect },
  { id: "structure", label: "Structure", icon: ListTree  },
  { id: "json",      label: "JSON",      icon: Braces    },
  { id: "document",  label: "Document",  icon: BookOpen  },
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
  const [corrections, setCorrections] = useState<Record<TabId, string>>(() => {
    const sd = item.ocr?.structuredData as any;
    const hasLayout    = !!(item.page?.layoutType || sd?.layout_type || sd?.layout || sd?.layout_metadata || sd?.page_layout);
    const hasRegions   = !!(item.page?.contentRegions || sd?.regions || sd?.bounding_boxes || sd?.content_regions);
    const hasStructure = !!(sd?.chapter || sd?.section || sd?.subsection || sd?.headings || sd?.document_summary || sd?.page_summary || sd?.summary);
    const hasJson      = !!sd;
    return {
      text:      "",
      layout:    hasLayout    ? "" : (EMPTY_TEMPLATES.layout    ?? ""),
      regions:   hasRegions   ? "" : (EMPTY_TEMPLATES.regions   ?? ""),
      structure: hasStructure ? "" : (EMPTY_TEMPLATES.structure ?? ""),
      json:      hasJson      ? "" : (EMPTY_TEMPLATES.json      ?? ""),
      document:  "",
    };
  });
  const [notes, setNotes] = useState("");

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
    onSuccess: (r) => {
      const msg = r.stagesFailed.length > 0
        ? `Retry done — ${r.stagesFailed.join(", ")} failed. Confidence: ${r.confidence}%`
        : `Retry succeeded — confidence ${r.confidence}%`;
      toast({ title: "Retry complete", description: msg });
      onResolved();
    },
    onError: (e) => toast({ title: "Retry failed", description: e.message, variant: "destructive" }),
  });

  const toggleRetryStage = (s: RetryStageId) =>
    setRetryStages(prev => { const n = new Set(prev); n.has(s) ? n.delete(s) : n.add(s); return n; });

  const runRetry = () => {
    if (retryStages.size === 0) return;
    retryMut.mutate({
      pageId: item.page?.id ?? item.pageId,
      hitlId: item.id,
      stages: [...retryStages],
    });
  };

  const saveCorrectionMut = trpc.hitl.saveCorrection.useMutation({
    onSuccess: () => toast({ title: "Section saved" }),
    onError: (e) => toast({ title: "Save failed", description: e.message, variant: "destructive" }),
  });
  const saveSection = (field: "text" | "layout" | "regions" | "structure" | "json") => () => {
    saveCorrectionMut.mutate({ pageId: item.page?.id ?? item.pageId, field, value: corrections[field] });
  };

  // Auto-expand and scroll when this card becomes the active keyboard target
  useEffect(() => {
    if (isActive) {
      setExpanded(true);
      cardRef.current?.scrollIntoView({ behavior: "smooth", block: "nearest" });
    }
  }, [isActive]);

  const isPending = resolveMut.isPending || skipMut.isPending || escalateMut.isPending || retryMut.isPending;

  const setCorrection = (tab: TabId) => (v: string) =>
    setCorrections(c => ({ ...c, [tab]: v }));

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
  useEffect(() => {
    if (!isActive || !expanded) return;
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
  }, [isActive, expanded]);

  const pageImagePath = item.page?.rawPngUrl
    ? `/api/pipeline/pages/${item.page.rawPngUrl.replace(/.*\/workspace\//, "")}`
    : null;

  const hasCorrections = Object.values(corrections).some(v => v.trim());

  return (
    <div ref={cardRef}>
    <Card className={`bg-card/50 backdrop-blur-sm border-border/50 transition-colors ${isActive ? "border-primary/30" : ""}`}>
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <div className="flex items-center gap-3 min-w-0">
            <input
              type="checkbox"
              checked={isSelected}
              onChange={onToggle}
              onClick={e => e.stopPropagation()}
              className="flex-shrink-0 accent-primary cursor-pointer w-4 h-4"
            />
            <button onClick={() => { const next = !expanded; setExpanded(next); if (next) onActivate(); }} className="text-muted-foreground hover:text-foreground flex-shrink-0">
              {expanded ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
            </button>
            <CardTitle className="text-base truncate">
              PDF p.{item.page?.pageNumber ?? "?"}
              {item.page?.printedPageLabel && (
                <span className="text-muted-foreground font-normal"> / Doc p.{item.page.printedPageLabel}</span>
              )}
              {" — "}{item.reason}
            </CardTitle>
          </div>
          <div className="flex items-center gap-2 flex-shrink-0">
            <StatusBadge status={item.status} />
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
              {pageImagePath ? (
                <BboxOverlayToggle
                  imageUrl={pageImagePath}
                  regions={(item.page?.contentRegions as any[]) ?? []}
                  imageClassName="w-full rounded border border-border/50 object-contain max-h-[600px]"
                />
              ) : (
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
                    {corrections[id]?.trim() && (
                      <span className="w-1.5 h-1.5 rounded-full bg-orange-400 flex-shrink-0" title="Has correction" />
                    )}
                  </button>
                ))}
              </div>

              {/* Tab content */}
              <div className="flex-1 overflow-auto">
                {activeTab === "text"      && <TextTab      item={item} correction={corrections.text}      onCorrect={setCorrection("text")}      onSave={saveSection("text")}      isSaving={saveCorrectionMut.isPending} />}
                {activeTab === "layout"    && <LayoutTab    item={item} correction={corrections.layout}    onCorrect={setCorrection("layout")}    onSave={saveSection("layout")}    isSaving={saveCorrectionMut.isPending} />}
                {activeTab === "regions"   && <RegionsTab   item={item} correction={corrections.regions}   onCorrect={setCorrection("regions")}   onSave={saveSection("regions")}   isSaving={saveCorrectionMut.isPending} />}
                {activeTab === "structure" && <StructureTab item={item} correction={corrections.structure} onCorrect={setCorrection("structure")} onSave={saveSection("structure")} isSaving={saveCorrectionMut.isPending} />}
                {activeTab === "json"      && <JsonTab      item={item} correction={corrections.json}      onCorrect={setCorrection("json")}      onSave={saveSection("json")}      isSaving={saveCorrectionMut.isPending} />}
                {activeTab === "document"  && <DocumentTab  item={item} />}
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
                onClick={runRetry} disabled={isPending || retryStages.size === 0}>
                {retryMut.isPending
                  ? <><Loader2 className="w-3.5 h-3.5 animate-spin" /> Retrying…</>
                  : <><RefreshCw className="w-3.5 h-3.5" /> Retry</>}
              </Button>
            </div>

            <div className="flex items-center justify-between gap-4 flex-wrap">
              <div className="flex items-center gap-3 min-w-0">
                {hasCorrections ? (
                  <p className="text-xs text-orange-400">
                    {Object.values(corrections).filter(v => v.trim()).length} tab(s) with corrections — will be saved on Approve.
                  </p>
                ) : (
                  <p className="text-xs text-muted-foreground">No corrections — Approve accepts OCR output as-is.</p>
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
  const [page, setPage] = useState(0);
  const [selected, setSelected] = useState<Set<number>>(new Set());
  const [activeItemId, setActiveItemId] = useState<number | null>(null);

  const { data: items, isLoading, refetch } = trpc.hitl.list.useQuery({
    status: statusFilter,
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
  const totalForStatus: number = stats?.[statusFilter] ?? 0;
  const totalPages = Math.ceil(totalForStatus / PAGE_SIZE);

  const switchFilter = (s: typeof statusFilter) => { setStatusFilter(s); setPage(0); };

  const toggleSelect = (id: number) =>
    setSelected(prev => { const s = new Set(prev); s.has(id) ? s.delete(id) : s.add(id); return s; });
  const toggleSelectAll = () =>
    setSelected(prev => prev.size === (items?.length ?? 0) ? new Set() : new Set(items?.map((i: any) => i.id) ?? []));

  const [isExporting, setIsExporting] = useState(false);

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
                <p className={`text-3xl font-bold ${color}`}>{(stats as any)[key] ?? 0}</p>
                <p className="text-xs text-muted-foreground mt-1">{label}</p>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* Filter + bulk actions */}
      <div className="space-y-2">
        <div className="flex items-center justify-between gap-4 flex-wrap">
          <div className="flex gap-2 flex-wrap">
            {(["queued", "resolved", "escalated", "skipped"] as const).map(s => (
              <button key={s} onClick={() => { switchFilter(s); setSelected(new Set()); }}
                className={`px-3 py-1.5 rounded-md text-sm font-medium transition-colors ${
                  statusFilter === s ? "bg-primary text-primary-foreground" : "bg-muted/30 text-muted-foreground hover:text-foreground"
                }`}>
                {s.charAt(0).toUpperCase() + s.slice(1)}
                {stats && <span className="ml-1.5 opacity-60 text-xs">({(stats as any)[s] ?? 0})</span>}
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
        {(items?.length ?? 0) > 0 && (
          <div className="flex items-center gap-3 flex-wrap text-sm">
            <label className="flex items-center gap-2 text-muted-foreground cursor-pointer select-none">
              <input type="checkbox"
                checked={selected.size > 0 && selected.size === (items?.length ?? 0)}
                ref={el => { if (el) el.indeterminate = selected.size > 0 && selected.size < (items?.length ?? 0); }}
                onChange={toggleSelectAll}
                className="accent-primary w-4 h-4"
              />
              {selected.size === 0 ? "Select all" : `${selected.size} selected`}
            </label>
            {selected.size > 0 && (
              <Button variant="outline" size="sm" className="gap-1.5 h-7 text-xs"
                onClick={downloadSelected}>
                <Download className="w-3.5 h-3.5" />
                Download Selected ({selected.size})
              </Button>
            )}
            <Button variant="outline" size="sm" className="gap-1.5 h-7 text-xs ml-auto"
              onClick={downloadAll} disabled={isExporting}>
              {isExporting ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Download className="w-3.5 h-3.5" />}
              Download All {statusFilter.charAt(0).toUpperCase() + statusFilter.slice(1)}
            </Button>
          </div>
        )}
      </div>

      {/* Items */}
      {isLoading ? (
        <div className="flex items-center gap-2 text-muted-foreground">
          <Loader2 className="w-4 h-4 animate-spin" /> Loading…
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
