import { useState, useMemo, useEffect, useRef } from "react";
import { trpc } from "@/lib/trpc";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import { toast } from "sonner";
import {
  BookOpen, Layers, RefreshCw, RotateCcw, RotateCw, ChevronsUpDown, ScrollText, ChevronRight, ChevronDown,
  Check, Edit, Loader2, FileImage, ChevronLeft, Eye, Code2, AlignLeft,
  History, FileText, Grid3x3, Flag, LayoutGrid, List, Package, Upload,
} from "lucide-react";
import { PipelineStatusBadge } from "@/components/PipelineStatusBadge";

// ── Types ─────────────────────────────────────────────────────────────────────

type SummaryRecord = {
  id: number;
  documentId: number;
  levelType: string;
  headingText: string | null;
  startPageId: number;
  endPageId: number | null;
  startPageNumber: number;
  endPageNumber: number | null;
  shortSummary: string | null;
  longSummary: string | null;
  keyTerms: string[] | null;
  keyEntities: string[] | null;
  parentId: number | null;
  summaryStatus: string;
  embeddingStatus: string;
  createdAt: Date;
  updatedAt: Date;
};

type TreeNode = SummaryRecord & { children: TreeNode[] };

// ── Tree builder ──────────────────────────────────────────────────────────────

function buildTree(records: SummaryRecord[]): TreeNode[] {
  const byId = new Map<number, TreeNode>(
    records.map(r => [r.id, { ...r, children: [] }]),
  );
  const roots: TreeNode[] = [];
  for (const node of Array.from(byId.values())) {
    if (node.parentId !== null && byId.has(node.parentId)) {
      byId.get(node.parentId)!.children.push(node);
    } else {
      roots.push(node);
    }
  }
  const sort = (nodes: TreeNode[]) => {
    nodes.sort((a, b) => a.startPageNumber - b.startPageNumber);
    for (const n of nodes) sort(n.children);
  };
  sort(roots);
  return roots;
}

// ── Status badge ──────────────────────────────────────────────────────────────

const STATUS_STYLES: Record<string, string> = {
  pending:    "bg-gray-500/20 text-gray-400 border-gray-500/30",
  generating: "bg-blue-500/20 text-blue-400 border-blue-500/30",
  generated:  "bg-amber-500/20 text-amber-400 border-amber-500/30",
  approved:   "bg-green-500/20 text-green-400 border-green-500/30",
  failed:     "bg-red-500/20 text-red-400 border-red-500/30",
};

function StatusBadge({ status }: { status: string }) {
  return (
    <span className={`text-[10px] font-mono px-1.5 py-0.5 rounded border ${STATUS_STYLES[status] ?? STATUS_STYLES.pending}`}>
      {status}
    </span>
  );
}

// ── Level badge ───────────────────────────────────────────────────────────────

const LEVEL_STYLES: Record<string, string> = {
  chapter:    "bg-purple-500/20 text-purple-300 border-purple-500/30",
  appendix:   "bg-amber-500/20 text-amber-300 border-amber-500/30",
  section:    "bg-indigo-500/20 text-indigo-300 border-indigo-500/30",
  subsection: "bg-sky-500/20 text-sky-300 border-sky-500/30",
  page:       "bg-slate-500/20 text-slate-300 border-slate-500/30",
};

function LevelBadge({ level }: { level: string }) {
  return (
    <span className={`text-[10px] font-mono px-1.5 py-0.5 rounded border ${LEVEL_STYLES[level] ?? "bg-gray-500/20 text-gray-400 border-gray-500/30"}`}>
      {level}
    </span>
  );
}

// ── Region type pill + bbox overlay colours ───────────────────────────────────

const REGION_COLORS: Record<string, string> = {
  heading:      "bg-purple-500/20 text-purple-300",
  paragraph:    "bg-blue-500/20 text-blue-300",
  table:        "bg-orange-500/20 text-orange-300",
  illustration: "bg-green-500/20 text-green-300",
  map:          "bg-teal-500/20 text-teal-300",
  caption:      "bg-sky-500/20 text-sky-300",
  list:         "bg-indigo-500/20 text-indigo-300",
  sidebar:      "bg-pink-500/20 text-pink-300",
  stat_block:   "bg-amber-500/20 text-amber-300",
};

const REGION_BOX: Record<string, { border: string; bg: string; bgSel: string }> = {
  heading:      { border:"rgba(168,85,247,.85)",  bg:"rgba(168,85,247,.08)",  bgSel:"rgba(168,85,247,.30)" },
  paragraph:    { border:"rgba(59,130,246,.75)",  bg:"rgba(59,130,246,.06)",  bgSel:"rgba(59,130,246,.25)" },
  table:        { border:"rgba(249,115,22,.85)",  bg:"rgba(249,115,22,.08)",  bgSel:"rgba(249,115,22,.28)" },
  illustration: { border:"rgba(34,197,94,.85)",   bg:"rgba(34,197,94,.08)",   bgSel:"rgba(34,197,94,.28)" },
  map:          { border:"rgba(20,184,166,.85)",  bg:"rgba(20,184,166,.08)",  bgSel:"rgba(20,184,166,.28)" },
  caption:      { border:"rgba(14,165,233,.80)",  bg:"rgba(14,165,233,.07)",  bgSel:"rgba(14,165,233,.25)" },
  list:         { border:"rgba(99,102,241,.85)",  bg:"rgba(99,102,241,.08)",  bgSel:"rgba(99,102,241,.28)" },
  sidebar:      { border:"rgba(236,72,153,.85)",  bg:"rgba(236,72,153,.08)",  bgSel:"rgba(236,72,153,.28)" },
  stat_block:   { border:"rgba(245,158,11,.85)",  bg:"rgba(245,158,11,.08)",  bgSel:"rgba(245,158,11,.28)" },
};
const REGION_BOX_DEFAULT = { border:"rgba(156,163,175,.65)", bg:"rgba(156,163,175,.06)", bgSel:"rgba(156,163,175,.22)" };

function regionPillClass(type: string) {
  return REGION_COLORS[type] ?? "bg-muted text-muted-foreground";
}
function regionBoxColor(type: string) {
  return REGION_BOX[type] ?? REGION_BOX_DEFAULT;
}

// ── Bbox overlay (reused by thumbnail grid + detail dialog) ───────────────────

function BboxOverlay({
  regions,
  selectedIdx,
  onSelect,
}: {
  regions: any[];
  selectedIdx: number | null;
  onSelect?: (i: number | null) => void;
}) {
  return (
    <>
      {regions.map((r: any, i: number) => {
        const { x = 0, y = 0, w = 0, h = 0 } = r.bbox ?? {};
        if (w === 0 && h === 0) return null;
        const c = regionBoxColor(r.type ?? r.regionType ?? "");
        const isSel = i === selectedIdx;
        return (
          <div
            key={i}
            onClick={onSelect ? (e) => { e.stopPropagation(); onSelect(isSel ? null : i); } : undefined}
            style={{
              position: "absolute",
              left: `${x}%`, top: `${y}%`,
              width: `${w}%`, height: `${h}%`,
              border: `${isSel ? 2 : 1}px solid ${c.border}`,
              backgroundColor: isSel ? c.bgSel : c.bg,
              boxSizing: "border-box",
              cursor: onSelect ? "pointer" : "default",
              pointerEvents: onSelect ? "auto" : "none",
              transition: "background-color .12s",
              zIndex: isSel ? 2 : 1,
            }}
            title={onSelect ? `${r.type ?? r.regionType}` : undefined}
          />
        );
      })}
    </>
  );
}

// ── HITL re-queue section ────────────────────────────────────────────────────

const HITL_PRIORITIES = ["low", "medium", "high", "critical"] as const;
const RETRY_STAGES = [
  { value: "layout_analysis",  label: "Layout Analysis" },
  { value: "bbox_detection",   label: "BBox Detection" },
  { value: "ocr_extraction",   label: "OCR Extraction" },
] as const;

function HitlSection({
  pageId,
  isAlreadyFlagged,
  onFlagged,
  onFlagAndNext,
}: {
  pageId: number;
  isAlreadyFlagged?: boolean | null;
  /** Called after flagging when no "next" action — closes the dialog. */
  onFlagged?: () => void;
  /** Called after flagging with the "Review & Next" action — navigates to the next page. */
  onFlagAndNext?: () => void;
}) {
  const flagMutation  = trpc.hitl.flag.useMutation({ onError: (err) => toast.error(err.message) });
  const retryMutation = trpc.hitl.retryPage.useMutation({ onError: (err) => toast.error(err.message) });

  /**
   * Flag the page for HITL review, optionally re-trigger pipeline stages,
   * then invoke the appropriate navigation callback.
   * @param stages  Pipeline stages to re-trigger (empty = flag only)
   * @param andNext true = navigate to next page; false = close dialog
   */
  const doFlag = async (stages: string[], andNext: boolean) => {
    try {
      const result = await flagMutation.mutateAsync({
        pageId,
        reason: "Failed human review",
        priority: "medium",
      });
      if (result.alreadyQueued) toast.info("Page is already queued for HITL review.");
      else toast.success("Page flagged for HITL review.");

      if (stages.length > 0) {
        await retryMutation.mutateAsync({
          pageId,
          hitlId: result.id,
          stages: stages as ("layout_analysis" | "bbox_detection" | "ocr_extraction")[],
        });
        toast.success(`Re-queued: ${stages.map(s => s.replace(/_/g, " ")).join(", ")}.`);
      }

      if (andNext) onFlagAndNext?.();
      else onFlagged?.();
    } catch { /* already toasted */ }
  };

  const isBusy = flagMutation.isPending || retryMutation.isPending;

  return (
    <div className="border-t border-border/30 pt-2.5 mt-1 flex-shrink-0 space-y-2">
      {isAlreadyFlagged && (
        <span className="text-[11px] text-amber-400/80 flex items-center gap-1">
          <Flag className="w-3 h-3" />Already in HITL queue — buttons below re-queue with that stage
        </span>
      )}
      <div className="flex items-center gap-1.5 flex-wrap">
        {/* Primary: flag only */}
        <Button
          size="sm" variant="outline"
          className="gap-1.5 h-7 text-xs border-amber-500/30 text-amber-400 hover:bg-amber-500/10 hover:border-amber-500/50"
          onClick={() => doFlag([], false)}
          disabled={isBusy}
        >
          {isBusy ? <Loader2 className="w-3 h-3 animate-spin" /> : <Flag className="w-3 h-3" />}
          HITL Review
        </Button>

        {/* Per-stage re-queue buttons */}
        {RETRY_STAGES.map(s => (
          <Button
            key={s.value} size="sm" variant="ghost"
            className="gap-1.5 h-7 text-xs text-muted-foreground hover:text-amber-300 hover:bg-amber-500/10"
            onClick={() => doFlag([s.value], false)}
            disabled={isBusy}
          >
            <Flag className="w-3 h-3" />
            {s.label}
          </Button>
        ))}

        {/* Review & Next — only shown when a next page is available */}
        {onFlagAndNext && (
          <Button
            size="sm" variant="ghost"
            className="gap-1.5 h-7 text-xs text-muted-foreground hover:text-primary hover:bg-primary/10 ml-auto"
            onClick={() => doFlag([], true)}
            disabled={isBusy}
          >
            {isBusy ? <Loader2 className="w-3 h-3 animate-spin" /> : <ChevronRight className="w-3 h-3" />}
            Review & Next
          </Button>
        )}
      </div>
    </div>
  );
}

// ── Page detail dialog ────────────────────────────────────────────────────────

function PageDetailDialog({ pageId, open, onClose, onNext }: { pageId: number; open: boolean; onClose: () => void; onNext?: () => void }) {
  const [detailTab, setDetailTab] = useState<"image" | "ocr" | "regions" | "json" | "history">("image");
  const [selectedRegionIdx, setSelectedRegionIdx] = useState<number | null>(null);
  const [showOverlays, setShowOverlays] = useState(true);
  // Incremented after each manual rotation to bust the browser's image cache
  const [imageKey, setImageKey] = useState(0);

  const utils = trpc.useUtils();
  const { data, isLoading, refetch } = trpc.library.getPageDetail.useQuery(
    { pageId },
    { enabled: open && pageId > 0 },
  );

  const rotateMutation = trpc.library.rotatePage.useMutation({
    onError: (err) => toast.error(`Rotation failed: ${err.message}`),
  });

  const handleRotate = async (degrees: 90 | 180 | 270) => {
    await rotateMutation.mutateAsync({ pageId, degrees });
    setImageKey(k => k + 1);
    refetch();
    void utils.library.listPages.invalidate();
  };

  // Reset selected region when page changes
  useEffect(() => { setSelectedRegionIdx(null); }, [pageId]);

  const ocr = data?.ocr as any;
  const sd = ocr?.structuredData as any;
  const regions = Array.isArray(data?.contentRegions) ? (data!.contentRegions as any[]) : [];
  const retryAttempts = data?.retryAttempts ?? [];

  // Clicking a region in the list → jump to image tab and highlight it
  const selectRegion = (i: number | null) => {
    setSelectedRegionIdx(i);
    if (i !== null) setDetailTab("image");
  };

  const handleFlagged = () => {
    refetch();
    utils.library.listPages.invalidate();
    onClose();
  };

  const handleFlagAndNext = onNext ? () => {
    refetch();
    utils.library.listPages.invalidate();
    onNext();
  } : undefined;

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-5xl max-h-[90vh] overflow-hidden flex flex-col">
        <DialogHeader className="flex-shrink-0">
          <div className="flex items-center gap-2 flex-wrap">
            <FileImage className="w-4 h-4 text-primary flex-shrink-0" />
            <span className="font-semibold">Page {data?.pageNumber ?? pageId}</span>
            {data?.layoutType && (
              <span className="text-xs font-mono bg-muted px-1.5 py-0.5 rounded text-muted-foreground">
                {data.layoutType}
              </span>
            )}
            {(data as any)?.isFlagged && (
              <span className="text-xs bg-amber-500/20 text-amber-400 border border-amber-500/30 px-1.5 py-0.5 rounded flex items-center gap-1">
                <Flag className="w-3 h-3" />HITL
              </span>
            )}
            {(data as any)?.rotationCorrected && (
              <span title={`Page was auto-rotated ${(data as any).detectedRotation}° to correct orientation`}
                className="text-xs bg-sky-500/20 text-sky-400 border border-sky-500/30 px-1.5 py-0.5 rounded flex items-center gap-1">
                <RotateCcw className="w-3 h-3" />Rotated {(data as any).detectedRotation}°
              </span>
            )}
            {!(data as any)?.rotationCorrected && (data as any)?.detectedRotation != null && (data as any)?.detectedRotation !== 0 && (
              <span title="Rotation suspected but direction unknown — verify in HITL review"
                className="text-xs bg-amber-500/10 text-amber-400 border border-amber-500/30 px-1.5 py-0.5 rounded flex items-center gap-1">
                <RotateCcw className="w-3 h-3" />Rotation?
              </span>
            )}
            {data?.ocrConfidence != null && (
              <span className="text-xs text-muted-foreground ml-auto mr-6">
                {data.ocrConfidence}% confidence
              </span>
            )}
          </div>
          {(data as any)?.printedPageLabel && (data as any).printedPageLabel !== "[unnumbered]" && (
            <div className="text-sm text-muted-foreground">Printed label: {(data as any).printedPageLabel}</div>
          )}
        </DialogHeader>

        <Tabs value={detailTab} onValueChange={v => setDetailTab(v as any)} className="flex-1 overflow-hidden flex flex-col min-h-0">
          <TabsList className="flex-shrink-0 w-full justify-start">
            <TabsTrigger value="image" className="gap-1.5"><Eye className="w-3.5 h-3.5" />Image</TabsTrigger>
            <TabsTrigger value="ocr" className="gap-1.5"><AlignLeft className="w-3.5 h-3.5" />OCR Text</TabsTrigger>
            <TabsTrigger value="regions" className="gap-1.5">
              <Grid3x3 className="w-3.5 h-3.5" />Regions ({regions.length})
            </TabsTrigger>
            <TabsTrigger value="json" className="gap-1.5"><Code2 className="w-3.5 h-3.5" />JSON</TabsTrigger>
            <TabsTrigger value="history" className="gap-1.5">
              <History className="w-3.5 h-3.5" />History ({retryAttempts.length})
            </TabsTrigger>
          </TabsList>

          {isLoading ? (
            <div className="flex items-center justify-center py-16 text-muted-foreground gap-2">
              <Loader2 className="w-5 h-5 animate-spin" />Loading page…
            </div>
          ) : (
            <>
              {/* ── Image tab — with region overlays ───────────────────── */}
              <TabsContent value="image" className="flex-1 overflow-auto mt-0 pt-3">
                {data?.rawPngUrl ? (
                  <div className="space-y-2">
                    <div className="flex items-center gap-2 flex-wrap">
                      {/* Region overlay toggle */}
                      {regions.length > 0 && (
                        <button
                          onClick={() => setShowOverlays(v => !v)}
                          className={`flex items-center gap-1.5 text-xs px-2 py-1 rounded border transition-colors ${
                            showOverlays
                              ? "bg-primary/15 border-primary/40 text-primary"
                              : "border-border/30 text-muted-foreground hover:border-border/60"
                          }`}
                        >
                          <Grid3x3 className="w-3 h-3" />
                          {showOverlays ? "Regions on" : "Regions off"}
                        </button>
                      )}
                      {selectedRegionIdx !== null && (
                        <span className="text-xs text-muted-foreground">
                          Focused: <span className={`px-1.5 py-0.5 rounded font-mono text-[10px] ${regionPillClass(regions[selectedRegionIdx]?.type ?? "")}`}>
                            {regions[selectedRegionIdx]?.type}
                          </span>
                          {" "}#{selectedRegionIdx + 1}
                          <button className="ml-2 text-muted-foreground hover:text-foreground" onClick={() => setSelectedRegionIdx(null)}>✕</button>
                        </span>
                      )}

                      {/* Manual rotation controls */}
                      <div className={`flex items-center gap-1 ml-auto ${regions.length === 0 ? "" : "border-l border-border/30 pl-2"}`}>
                        <span className="text-xs text-muted-foreground mr-0.5">Rotate:</span>
                        <button
                          onClick={() => handleRotate(270)}
                          disabled={rotateMutation.isPending}
                          title="Rotate 90° counter-clockwise"
                          className="flex items-center gap-1 text-xs px-2 py-1 rounded border border-border/30 text-muted-foreground hover:text-foreground hover:border-border/60 disabled:opacity-40 transition-colors"
                        >
                          <RotateCcw className="w-3 h-3" />CCW
                        </button>
                        <button
                          onClick={() => handleRotate(90)}
                          disabled={rotateMutation.isPending}
                          title="Rotate 90° clockwise"
                          className="flex items-center gap-1 text-xs px-2 py-1 rounded border border-border/30 text-muted-foreground hover:text-foreground hover:border-border/60 disabled:opacity-40 transition-colors"
                        >
                          <RotateCw className="w-3 h-3" />CW
                        </button>
                        <button
                          onClick={() => handleRotate(180)}
                          disabled={rotateMutation.isPending}
                          title="Rotate 180° (flip upside-down)"
                          className="flex items-center gap-1 text-xs px-2 py-1 rounded border border-border/30 text-muted-foreground hover:text-foreground hover:border-border/60 disabled:opacity-40 transition-colors"
                        >
                          {rotateMutation.isPending
                            ? <Loader2 className="w-3 h-3 animate-spin" />
                            : <span className="font-mono">180°</span>}
                        </button>
                      </div>
                    </div>

                    <div className="relative w-full">
                      <img
                        key={imageKey}
                        src={`${data.rawPngUrl}${imageKey > 0 ? `?_k=${imageKey}` : ""}`}
                        alt={`Page ${data.pageNumber}`}
                        className="w-full block rounded border border-border/40"
                      />
                      {showOverlays && (
                        <BboxOverlay regions={regions} selectedIdx={selectedRegionIdx} onSelect={setSelectedRegionIdx} />
                      )}
                    </div>
                  </div>
                ) : (
                  <p className="text-center text-muted-foreground py-8">No image available.</p>
                )}
              </TabsContent>

              {/* ── OCR text tab ─────────────────────────────────────────── */}
              <TabsContent value="ocr" className="flex-1 overflow-auto mt-0 pt-3 space-y-3">
                <div>
                  <p className="text-xs text-muted-foreground uppercase tracking-wide mb-1.5">OCR Extracted Text</p>
                  <pre className="text-xs font-mono whitespace-pre-wrap break-words bg-muted/30 rounded p-3 border border-border/30 max-h-72 overflow-y-auto">
                    {ocr?.rawText ?? <span className="italic text-muted-foreground">No OCR text.</span>}
                  </pre>
                </div>
                {(data as any)?.nativeText && (
                  <div>
                    <p className="text-xs text-muted-foreground uppercase tracking-wide mb-1.5">Native PDF Text</p>
                    <pre className="text-xs font-mono whitespace-pre-wrap break-words bg-muted/30 rounded p-3 border border-border/30 max-h-72 overflow-y-auto">
                      {(data as any).nativeText}
                    </pre>
                  </div>
                )}
                {ocr?.correctedText && (
                  <div>
                    <p className="text-xs text-muted-foreground uppercase tracking-wide mb-1.5">Corrected Text</p>
                    <pre className="text-xs font-mono whitespace-pre-wrap break-words bg-green-950/20 rounded p-3 border border-green-800/30 max-h-48 overflow-y-auto">
                      {ocr.correctedText}
                    </pre>
                  </div>
                )}
              </TabsContent>

              {/* ── Regions tab — mini-image with overlays + list ─────────── */}
              <TabsContent value="regions" className="flex-1 overflow-hidden mt-0 pt-3">
                {regions.length === 0 ? (
                  <p className="text-center text-muted-foreground py-8">No regions detected.</p>
                ) : (
                  <div className="flex gap-4 h-full min-h-0">
                    {/* Mini page preview with bbox overlays */}
                    {data?.rawPngUrl && (
                      <div className="w-44 flex-shrink-0 self-start sticky top-0">
                        <div className="relative w-full">
                          <img
                            src={data.rawPngUrl}
                            alt=""
                            className="w-full block rounded border border-border/30"
                          />
                          <BboxOverlay
                            regions={regions}
                            selectedIdx={selectedRegionIdx}
                            onSelect={i => setSelectedRegionIdx(i)}
                          />
                        </div>
                        {selectedRegionIdx !== null && (
                          <div className="mt-1.5 p-1.5 rounded bg-muted/30 border border-border/20 text-[10px] space-y-0.5">
                            <div className={`px-1.5 py-0.5 rounded font-mono inline-block ${regionPillClass(regions[selectedRegionIdx]?.type ?? "")}`}>
                              {regions[selectedRegionIdx]?.type ?? "unknown"}
                            </div>
                            <div className="text-muted-foreground font-mono">
                              ({Math.round(regions[selectedRegionIdx]?.bbox?.x ?? 0)},
                              {Math.round(regions[selectedRegionIdx]?.bbox?.y ?? 0)})
                              {" "}{Math.round(regions[selectedRegionIdx]?.bbox?.w ?? 0)}×
                              {Math.round(regions[selectedRegionIdx]?.bbox?.h ?? 0)}
                            </div>
                            <div className="text-foreground/70 line-clamp-3">
                              {regions[selectedRegionIdx]?.text ?? regions[selectedRegionIdx]?.content ?? ""}
                            </div>
                          </div>
                        )}
                      </div>
                    )}

                    {/* Regions list */}
                    <div className="flex-1 overflow-y-auto space-y-1 pr-1">
                      {regions.map((r: any, i: number) => (
                        <div
                          key={i}
                          onClick={() => setSelectedRegionIdx(selectedRegionIdx === i ? null : i)}
                          className={`flex items-start gap-2 text-xs p-2 rounded border cursor-pointer transition-colors ${
                            i === selectedRegionIdx
                              ? "bg-primary/10 border-primary/40 ring-1 ring-primary/20"
                              : "bg-muted/20 border-border/20 hover:bg-muted/40"
                          }`}
                        >
                          <span className="font-mono text-muted-foreground w-6 flex-shrink-0">{r.sequence ?? i + 1}</span>
                          <span className={`px-1.5 py-0.5 rounded text-[10px] font-mono flex-shrink-0 ${regionPillClass(r.type ?? r.regionType ?? "")}`}>
                            {r.type ?? r.regionType}
                          </span>
                          <span className="font-mono text-muted-foreground flex-shrink-0 text-[10px]">
                            ({Math.round(r.bbox?.x ?? 0)},{Math.round(r.bbox?.y ?? 0)}) {Math.round(r.bbox?.w ?? 0)}×{Math.round(r.bbox?.h ?? 0)}
                          </span>
                          <span className="flex-1 text-foreground/80 line-clamp-1 min-w-0">{r.text ?? r.content ?? ""}</span>
                          {i === selectedRegionIdx && (
                            <button
                              className="flex-shrink-0 text-primary text-[10px] hover:underline"
                              onClick={e => { e.stopPropagation(); setDetailTab("image"); }}
                            >
                              ↑ image
                            </button>
                          )}
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </TabsContent>

              {/* ── JSON tab ─────────────────────────────────────────────── */}
              <TabsContent value="json" className="flex-1 overflow-auto mt-0 pt-3">
                <pre className="text-xs font-mono whitespace-pre-wrap break-words bg-muted/30 rounded p-3 border border-border/30 text-foreground/80">
                  {JSON.stringify(sd ?? ocr?.structuredData ?? null, null, 2)}
                </pre>
              </TabsContent>

              {/* ── History tab ──────────────────────────────────────────── */}
              <TabsContent value="history" className="flex-1 overflow-auto mt-0 pt-3">
                {retryAttempts.length === 0 ? (
                  <p className="text-center text-muted-foreground py-8">No retry history.</p>
                ) : (
                  <div className="space-y-2">
                    {retryAttempts.map((a: any) => (
                      <div key={a.id} className="p-3 rounded border border-border/30 bg-muted/20 text-xs space-y-1">
                        <div className="flex items-center gap-2">
                          <span className={`px-1.5 py-0.5 rounded font-mono text-[10px] ${a.status === "succeeded" ? "bg-green-500/20 text-green-300" : a.status === "failed" ? "bg-red-500/20 text-red-300" : "bg-blue-500/20 text-blue-300"}`}>
                            {a.status}
                          </span>
                          <span className="text-muted-foreground">{new Date(a.startedAt).toLocaleString()}</span>
                          {a.confidence != null && <span className="ml-auto text-muted-foreground">{a.confidence}% confidence</span>}
                          {a.durationMs != null && <span className="text-muted-foreground">{(a.durationMs / 1000).toFixed(1)}s</span>}
                        </div>
                        <div className="text-muted-foreground">Stages: {(a.requestedStages as string[])?.join(", ")}</div>
                        {(a.stagesFailed as string[])?.length > 0 && (
                          <div className="text-red-400">Failed: {(a.stagesFailed as string[]).join(", ")}</div>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </TabsContent>
            </>
          )}
        </Tabs>

        {/* HITL re-queue footer */}
        <HitlSection pageId={pageId} isAlreadyFlagged={(data as any)?.isFlagged} onFlagged={handleFlagged} onFlagAndNext={handleFlagAndNext} />
      </DialogContent>
    </Dialog>
  );
}

// ── Page thumbnail with region overlays (used in RegionsOverview) ─────────────

function PageThumbnailWithRegions({
  page,
  onClick,
  selected,
  onToggleSelect,
}: {
  page: any;
  onClick: () => void;
  selected?: boolean;
  onToggleSelect?: () => void;
}) {
  const regions = Array.isArray(page.contentRegions) ? page.contentRegions as any[] : [];
  const conf = page.ocrConfidence;
  const confColor = conf == null ? "" : conf >= 80 ? "text-green-400" : conf >= 60 ? "text-amber-400" : "text-red-400";

  return (
    <div
      className={`group relative block w-full rounded-lg overflow-hidden transition-all bg-card text-left cursor-pointer ${
        selected
          ? "border-2 border-amber-500/70 shadow-amber-500/20 shadow-md"
          : "border border-border/40 hover:border-primary/50 hover:shadow-md"
      }`}
      onClick={onClick}
    >
      {/* Image + overlays */}
      <div
        className="relative w-full overflow-hidden"
        style={{ aspectRatio: page.imageWidth && page.imageHeight ? `${page.imageWidth}/${page.imageHeight}` : "3/4" }}
      >
        {page.rawPngUrl ? (
          <img
            src={page.rawPngUrl}
            alt={`Page ${page.pageNumber}`}
            loading="lazy"
            className="w-full h-full object-cover object-top"
          />
        ) : (
          <div className="w-full h-full bg-muted/30 flex items-center justify-center">
            <FileImage className="w-8 h-8 text-muted-foreground/30" />
          </div>
        )}
        {/* Bbox overlays (non-interactive on thumbnails) */}
        <BboxOverlay regions={regions} selectedIdx={null} />
        {/* Hover tint */}
        <div className="absolute inset-0 bg-primary/10 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center pointer-events-none">
          <Eye className="w-5 h-5 text-primary drop-shadow" />
        </div>
        {/* Selection checkbox — top-left corner */}
        {onToggleSelect && (
          <div
            onClick={(e) => { e.stopPropagation(); onToggleSelect(); }}
            className={`absolute top-1 left-1 z-10 w-5 h-5 rounded flex items-center justify-center transition-colors cursor-pointer ${
              selected
                ? "bg-amber-500 border-2 border-amber-300"
                : "bg-background/80 border border-border/60 hover:border-amber-400/70"
            }`}
          >
            {selected && <Check className="w-3 h-3 text-white" />}
          </div>
        )}
      </div>

      {/* Footer */}
      <div className="p-1.5">
        <div className="flex items-center justify-between gap-1">
          <span className="text-xs font-mono font-medium">p.{page.pageNumber}</span>
          <div className="flex items-center gap-1">
            {(page as any).isFlagged && <Flag className="w-2.5 h-2.5 text-amber-400" />}
            {(page as any).rotationCorrected && (
              <span title={`Rotation auto-corrected: ${(page as any).detectedRotation}°`}
                className="flex items-center gap-0.5 text-[10px] font-mono text-sky-400">
                <RotateCcw className="w-2.5 h-2.5" />{(page as any).detectedRotation}°
              </span>
            )}
            {!(page as any).rotationCorrected && (page as any).detectedRotation != null && (page as any).detectedRotation !== 0 && (
              <span title={`Possible rotation detected: ${(page as any).detectedRotation}° (needs HITL review)`}
                className="flex items-center gap-0.5 text-[10px] font-mono text-amber-400">
                <RotateCcw className="w-2.5 h-2.5" />?
              </span>
            )}
            {regions.length > 0 && (
              <span className="text-[10px] font-mono text-muted-foreground">{regions.length}r</span>
            )}
            {conf != null && (
              <span className={`text-[10px] font-mono ${confColor}`}>{conf}%</span>
            )}
          </div>
        </div>
        {regions.length === 0 ? (
          <div className="text-[10px] text-amber-500/70 font-mono mt-0.5">no regions</div>
        ) : (
          <div className="mt-0.5">
            <PipelineStatusBadge page={page} />
          </div>
        )}
      </div>
    </div>
  );
}

// ── Regions overview — visual thumbnail grid with bbox overlays ───────────────

function RegionsOverview({
  documentId,
  offset,
  onOffsetChange,
}: {
  documentId: number;
  offset: number;
  onOffsetChange: (n: number) => void;
}) {
  const LIMIT = 20;
  const [selected, setSelected] = useState<Set<number>>(new Set());
  const [isBulkFlagging, setIsBulkFlagging] = useState(false);
  const [selectedPageId, setSelectedPageId] = useState<number | null>(null);

  const utils = trpc.useUtils();

  const { data, isLoading } = trpc.library.listPages.useQuery(
    { documentId, offset, limit: LIMIT },
    { enabled: documentId > 0 },
  );
  const pages = data?.pages ?? [];
  const total = data?.total ?? 0;

  const flagMutation = trpc.hitl.flag.useMutation({
    onError: (err) => toast.error(err.message),
  });

  // Clear selection when the user pages forward/back
  useEffect(() => { setSelected(new Set()); }, [offset]);

  const setOffset = onOffsetChange;

  const totalRegions = useMemo(
    () => pages.reduce((s: number, p: any) => s + (Array.isArray(p.contentRegions) ? p.contentRegions.length : 0), 0),
    [pages],
  );
  const noRegionCount = pages.filter((p: any) => !Array.isArray(p.contentRegions) || p.contentRegions.length === 0).length;
  const avgConf = useMemo(() => {
    const ws = pages.filter((p: any) => p.ocrConfidence != null);
    if (!ws.length) return null;
    return Math.round(ws.reduce((s: number, p: any) => s + p.ocrConfidence, 0) / ws.length);
  }, [pages]);

  const toggleSelect = (pageId: number) => {
    setSelected(prev => {
      const next = new Set(prev);
      if (next.has(pageId)) next.delete(pageId);
      else next.add(pageId);
      return next;
    });
  };

  const allOnPageSelected = pages.length > 0 && pages.every((p: any) => selected.has(p.id));

  const toggleSelectAll = () => {
    if (allOnPageSelected) {
      setSelected(prev => {
        const next = new Set(prev);
        pages.forEach((p: any) => next.delete(p.id));
        return next;
      });
    } else {
      setSelected(prev => {
        const next = new Set(prev);
        pages.forEach((p: any) => next.add(p.id));
        return next;
      });
    }
  };

  const handleBulkFlag = async () => {
    const ids = Array.from(selected);
    if (ids.length === 0) return;
    setIsBulkFlagging(true);
    try {
      let flagged = 0;
      let alreadyQueued = 0;
      const results = await Promise.all(
        ids.map(pageId =>
          flagMutation.mutateAsync({ pageId, reason: "Failed human review", priority: "medium" })
        )
      );
      for (const r of results) {
        if ((r as any).alreadyQueued) alreadyQueued++;
        else flagged++;
      }
      const parts: string[] = [];
      if (flagged > 0) parts.push(`${flagged} page${flagged !== 1 ? "s" : ""} flagged`);
      if (alreadyQueued > 0) parts.push(`${alreadyQueued} already queued`);
      toast.success(parts.join(", ") + ".");
      setSelected(new Set());
      void utils.library.listPages.invalidate({ documentId });
    } catch {
      /* individual errors already toasted */
    } finally {
      setIsBulkFlagging(false);
    }
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-16 text-muted-foreground gap-2">
        <Loader2 className="w-4 h-4 animate-spin" />Loading pages…
      </div>
    );
  }
  if (total === 0) {
    return (
      <div className="py-10 text-center text-muted-foreground">
        <FileImage className="w-8 h-8 mx-auto mb-2 opacity-30" />
        <p className="text-sm">No pages found.</p>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {/* Summary bar */}
      <div className="flex items-center gap-4 text-xs text-muted-foreground flex-wrap">
        <span>Showing {offset + 1}–{Math.min(offset + LIMIT, total)} of {total} pages</span>
        <span>{totalRegions} regions on this batch</span>
        {noRegionCount > 0 && (
          <span className="text-amber-400 font-medium">{noRegionCount} missing regions</span>
        )}
        {avgConf != null && <span>avg {avgConf}% confidence</span>}
        <button
          onClick={toggleSelectAll}
          className="underline underline-offset-2 hover:text-foreground transition-colors"
        >
          {allOnPageSelected ? "Deselect all" : "Select all"}
        </button>
        <span className="ml-auto opacity-60">Click any page to inspect · checkbox to select.</span>
      </div>

      {/* Bulk action bar — visible only when pages are selected */}
      {selected.size > 0 && (
        <div className="flex items-center gap-3 px-3 py-2 rounded-md bg-amber-500/10 border border-amber-500/30">
          <span className="text-xs font-medium text-amber-300">
            {selected.size} page{selected.size !== 1 ? "s" : ""} selected
          </span>
          <Button
            size="sm"
            onClick={handleBulkFlag}
            disabled={isBulkFlagging}
            className="h-7 gap-1.5 text-xs bg-amber-500/20 text-amber-300 hover:bg-amber-500/30 border border-amber-500/30"
            variant="ghost"
          >
            {isBulkFlagging
              ? <Loader2 className="w-3 h-3 animate-spin" />
              : <Flag className="w-3 h-3" />}
            Flag for HITL Review
          </Button>
          <button
            onClick={() => setSelected(new Set())}
            className="ml-auto text-xs text-muted-foreground hover:text-foreground transition-colors underline underline-offset-2"
          >
            Clear selection
          </button>
        </div>
      )}

      {/* Thumbnail grid */}
      <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-2.5">
        {pages.map((page: any) => (
          <PageThumbnailWithRegions
            key={page.id}
            page={page}
            onClick={() => setSelectedPageId(page.id)}
            selected={selected.has(page.id)}
            onToggleSelect={() => toggleSelect(page.id)}
          />
        ))}
      </div>

      {/* Pagination */}
      {total > LIMIT && (
        <div className="flex items-center justify-between pt-1">
          <span className="text-xs text-muted-foreground">
            Showing {offset + 1}–{Math.min(offset + LIMIT, total)} of {total} pages
          </span>
          <div className="flex gap-2">
            <Button size="sm" variant="outline" onClick={() => setOffset(Math.max(0, offset - LIMIT))} disabled={offset === 0} className="h-7 gap-1">
              <ChevronLeft className="w-3.5 h-3.5" />Prev
            </Button>
            <Button size="sm" variant="outline" onClick={() => setOffset(offset + LIMIT)} disabled={offset + LIMIT >= total} className="h-7 gap-1">
              Next<ChevronRight className="w-3.5 h-3.5" />
            </Button>
          </div>
        </div>
      )}

      {/* Page detail dialog — owns next-page navigation against its own pages array */}
      {selectedPageId != null && (() => {
        const currentIdx = pages.findIndex((p: any) => p.id === selectedPageId);
        const nextId = currentIdx >= 0 && currentIdx < pages.length - 1
          ? (pages[currentIdx + 1] as any).id
          : null;
        return (
          <PageDetailDialog
            pageId={selectedPageId}
            open={true}
            onClose={() => setSelectedPageId(null)}
            onNext={nextId ? () => setSelectedPageId(nextId) : undefined}
          />
        );
      })()}
    </div>
  );
}

// ── Edit dialog ───────────────────────────────────────────────────────────────

const SUMMARY_STATUSES = ["pending", "generating", "generated", "approved", "failed"] as const;

function EditDialog({
  node,
  open,
  onClose,
}: {
  node: SummaryRecord;
  open: boolean;
  onClose: () => void;
}) {
  const [shortSummary, setShortSummary] = useState(node.shortSummary ?? "");
  const [longSummary, setLongSummary] = useState(node.longSummary ?? "");
  const [keyTerms, setKeyTerms] = useState((node.keyTerms ?? []).join(", "));
  const [keyEntities, setKeyEntities] = useState((node.keyEntities ?? []).join(", "));
  const [status, setStatus] = useState(node.summaryStatus);

  const utils = trpc.useUtils();
  const update = trpc.summaries.update.useMutation({
    onSuccess: () => {
      toast.success("Summary updated.");
      utils.summaries.listByDocumentIds.invalidate();
      onClose();
    },
    onError: (err) => toast.error(err.message),
  });

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <div className="flex items-center gap-2">
            <LevelBadge level={node.levelType} />
            <span className="font-semibold">{node.headingText ?? `Page ${node.startPageNumber}`}</span>
          </div>
          <div className="text-sm text-muted-foreground">Pages {node.startPageNumber}–{node.endPageNumber ?? "?"}</div>
        </DialogHeader>

        <div className="space-y-4 py-2">
          <div className="space-y-1.5">
            <Label>Short Summary</Label>
            <Textarea value={shortSummary} onChange={e => setShortSummary(e.target.value)} rows={3}
              placeholder="Brief 1–2 sentence summary used for embeddings…" />
          </div>
          <div className="space-y-1.5">
            <Label>Long Summary</Label>
            <Textarea value={longSummary} onChange={e => setLongSummary(e.target.value)} rows={6}
              placeholder="Detailed summary returned as context in search results…" />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <Label>Key Terms <span className="text-muted-foreground text-xs">(comma-separated)</span></Label>
              <Input value={keyTerms} onChange={e => setKeyTerms(e.target.value)} placeholder="fireball, arcane, spell…" />
            </div>
            <div className="space-y-1.5">
              <Label>Key Entities <span className="text-muted-foreground text-xs">(comma-separated)</span></Label>
              <Input value={keyEntities} onChange={e => setKeyEntities(e.target.value)} placeholder="Gandalf, Mordor, Mithril…" />
            </div>
          </div>
          <div className="space-y-1.5">
            <Label>Status</Label>
            <Select value={status} onValueChange={setStatus}>
              <SelectTrigger className="w-48"><SelectValue /></SelectTrigger>
              <SelectContent>
                {SUMMARY_STATUSES.map(s => <SelectItem key={s} value={s}>{s}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
        </div>

        <div className="flex justify-end gap-2 pt-2">
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button onClick={() => update.mutate({
            id: node.id,
            shortSummary: shortSummary || null,
            longSummary: longSummary || null,
            keyTerms: keyTerms.split(",").map(s => s.trim()).filter(Boolean),
            keyEntities: keyEntities.split(",").map(s => s.trim()).filter(Boolean),
            summaryStatus: status as (typeof SUMMARY_STATUSES)[number],
          })} disabled={update.isPending}>
            {update.isPending && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
            Save Changes
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

// ── Page browser ──────────────────────────────────────────────────────────────

function PageBrowser({ documentIds }: { documentIds: number[] }) {
  const [documentId, setDocumentId] = useState<number>(documentIds[0] ?? 0);
  const [offset, setOffset] = useState(0);
  const [selectedPageId, setSelectedPageId] = useState<number | null>(null);
  const [viewMode, setViewMode] = useState<"thumbnails" | "regions">("thumbnails");
  const LIMIT = 20;

  /** Trigger a browser file download from a Blob. Appends/removes a temporary
   *  anchor so the click works in all browsers, and delays URL revocation so
   *  the browser has time to read the blob before it's freed. */
  const triggerDownload = (blob: Blob, filename: string) => {
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    a.style.display = "none";
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setTimeout(() => URL.revokeObjectURL(url), 2000);
  };

  const exportMutation = trpc.library.exportUnsloth.useMutation({
    onSuccess: (data) => {
      if (!data.jsonl) { toast.error("No exportable data found."); return; }
      triggerDownload(
        new Blob([data.jsonl], { type: "application/jsonl" }),
        `document-${documentId}-unsloth.jsonl`,
      );
      toast.success(`Exported ${data.lineCount} training examples.`);
    },
    onError: (err) => toast.error(err.message),
  });

  // ── Bundle export state ──────────────────────────────────────────────────────
  const [exportDialogOpen, setExportDialogOpen] = useState(false);
  const [exportIncludeImages, setExportIncludeImages] = useState(false);

  const exportBundleMutation = trpc.library.exportBundle.useMutation({
    onSuccess: (data) => {
      const d = data as any;
      const suffix = d.includes_images ? "-with-images" : "";
      const json = JSON.stringify(data, null, 2);
      triggerDownload(
        new Blob([json], { type: "application/json" }),
        `document-${documentId}-bundle${suffix}.json`,
      );
      toast.success(`Bundle exported — ${d.pages?.length ?? 0} pages${d.includes_images ? " with images" : ""}.`);
      setExportDialogOpen(false);
    },
    onError: (err) => toast.error(err.message),
  });

  // ── Bundle import state ──────────────────────────────────────────────────────
  const [importDialogOpen, setImportDialogOpen] = useState(false);
  const [importFile, setImportFile] = useState<File | null>(null);
  const [importOverwriteImages, setImportOverwriteImages] = useState(false);
  const [importBundleHasImages, setImportBundleHasImages] = useState(false);
  const importFileRef = useRef<HTMLInputElement>(null);

  const importBundleMutation = trpc.library.importBundle.useMutation({
    onSuccess: (result) => {
      const r = result as any;
      const parts = [
        `${r.pagesUpdated} pages updated`,
        r.pagesCreated > 0 ? `${r.pagesCreated} created` : null,
        `${r.ocrUpserted} OCR records`,
        `${r.summariesCreated} summaries`,
      ].filter(Boolean).join(", ");
      toast.success(`Bundle imported — ${parts}.`);
      setImportDialogOpen(false);
      setImportFile(null);
      setImportBundleHasImages(false);
      setImportOverwriteImages(false);
    },
    onError: (err) => toast.error(err.message),
  });

  const handleImportFileChange = async (file: File | null) => {
    setImportFile(file);
    setImportBundleHasImages(false);
    if (!file) return;
    try {
      // Peek at the top of the file to detect includes_images without parsing the whole thing
      const head = await file.slice(0, 512).text();
      setImportBundleHasImages(/"includes_images"\s*:\s*true/.test(head));
    } catch { /* ignore */ }
  };

  const handleImportBundle = async () => {
    if (!importFile || documentId === 0) return;
    try {
      const text = await importFile.text();
      const bundle = JSON.parse(text);
      importBundleMutation.mutate({ documentId, overwriteImages: importOverwriteImages, bundle });
    } catch {
      toast.error("Invalid bundle file — could not parse JSON.");
    }
  };

  const { data, isLoading } = trpc.library.listPages.useQuery(
    { documentId, offset, limit: LIMIT },
    { enabled: documentId > 0 },
  );

  const pages = data?.pages ?? [];
  const total = data?.total ?? 0;

  return (
    <div className="space-y-3">
      {/* Toolbar */}
      <div className="flex items-center gap-2 flex-wrap">
        {documentIds.length > 1 && (
          <Select value={String(documentId)} onValueChange={v => { setDocumentId(Number(v)); setOffset(0); }}>
            <SelectTrigger className="w-48"><SelectValue placeholder="Select batch…" /></SelectTrigger>
            <SelectContent>
              {documentIds.map((id, i) => (
                <SelectItem key={id} value={String(id)}>Batch {i + 1} (doc #{id})</SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}

        {/* Export / Import buttons */}
        <Button size="sm" variant="outline" className="gap-1.5 text-xs"
          onClick={() => exportMutation.mutate({ documentId })} disabled={exportMutation.isPending || documentId === 0}>
          {exportMutation.isPending ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <FileText className="w-3.5 h-3.5" />}
          Export Unsloth JSONL
        </Button>
        <Button size="sm" variant="outline" className="gap-1.5 text-xs"
          onClick={() => { setExportIncludeImages(false); setExportDialogOpen(true); }}
          disabled={documentId === 0}
          title="Export a portable pipeline results bundle (layout, OCR, summaries, optional images)">
          <Package className="w-3.5 h-3.5" />
          Export Bundle
        </Button>
        <Button size="sm" variant="outline" className="gap-1.5 text-xs"
          onClick={() => setImportDialogOpen(true)} disabled={documentId === 0}
          title="Import a pipeline results bundle into the current document — replaces existing OCR and summaries">
          <Upload className="w-3.5 h-3.5" />
          Import Bundle
        </Button>

        {/* View toggle */}
        <div className="flex items-center rounded-md border border-border/40 overflow-hidden ml-auto">
          <button
            onClick={() => setViewMode("thumbnails")}
            className={`flex items-center gap-1.5 px-2.5 py-1.5 text-xs transition-colors ${viewMode === "thumbnails" ? "bg-primary/20 text-primary" : "text-muted-foreground hover:bg-muted/40"}`}
          >
            <LayoutGrid className="w-3.5 h-3.5" />Thumbnails
          </button>
          <button
            onClick={() => setViewMode("regions")}
            className={`flex items-center gap-1.5 px-2.5 py-1.5 text-xs transition-colors border-l border-border/40 ${viewMode === "regions" ? "bg-primary/20 text-primary" : "text-muted-foreground hover:bg-muted/40"}`}
          >
            <List className="w-3.5 h-3.5" />Regions Overview
          </button>
        </div>
      </div>

      {/* Persistent navigation — shown in both Thumbnails and Regions Overview */}
      {total > LIMIT && (
        <div className="flex items-center justify-between">
          <span className="text-xs text-muted-foreground">Showing {offset + 1}–{Math.min(offset + LIMIT, total)} of {total} pages</span>
          <div className="flex gap-2">
            <Button size="sm" variant="outline" onClick={() => setOffset(Math.max(0, offset - LIMIT))} disabled={offset === 0} className="h-7 gap-1">
              <ChevronLeft className="w-3.5 h-3.5" />Prev
            </Button>
            <Button size="sm" variant="outline" onClick={() => setOffset(offset + LIMIT)} disabled={offset + LIMIT >= total} className="h-7 gap-1">
              Next<ChevronRight className="w-3.5 h-3.5" />
            </Button>
          </div>
        </div>
      )}

      {viewMode === "regions" ? (
        <RegionsOverview documentId={documentId} offset={offset} onOffsetChange={setOffset} />
      ) : isLoading ? (
        <div className="flex items-center justify-center py-10 text-muted-foreground gap-2">
          <Loader2 className="w-4 h-4 animate-spin" />Loading pages…
        </div>
      ) : pages.length === 0 ? (
        <div className="py-10 text-center text-muted-foreground">
          <FileImage className="w-8 h-8 mx-auto mb-2 opacity-30" />
          <p className="text-sm">No pages found.</p>
        </div>
      ) : (
        <>

          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-3">
            {pages.map((page: any) => (
              <button
                key={page.id}
                onClick={() => setSelectedPageId(page.id)}
                className="group relative rounded-lg border border-border/40 overflow-hidden hover:border-primary/50 hover:shadow-md transition-all text-left bg-card"
              >
                {page.rawPngUrl ? (
                  <img
                    src={page.rawPngUrl}
                    alt={`Page ${page.pageNumber}`}
                    className="w-full object-cover object-top"
                    style={{ aspectRatio: page.imageWidth && page.imageHeight ? `${page.imageWidth}/${page.imageHeight}` : "3/4" }}
                  />
                ) : (
                  <div
                    className="w-full bg-muted/30 flex items-center justify-center"
                    style={{ aspectRatio: "3/4" }}
                  >
                    <FileImage className="w-8 h-8 text-muted-foreground/30" />
                  </div>
                )}
                <div className="p-1.5 space-y-0.5">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-medium">p.{page.pageNumber}</span>
                    <div className="flex items-center gap-1">
                      {(page as any).isFlagged && <Flag className="w-3 h-3 text-amber-400" />}
                      {page.ocrConfidence != null && (
                        <span className={`text-[10px] font-mono ${page.ocrConfidence >= 80 ? "text-green-400" : page.ocrConfidence >= 60 ? "text-amber-400" : "text-red-400"}`}>
                          {page.ocrConfidence}%
                        </span>
                      )}
                    </div>
                  </div>
                  <PipelineStatusBadge page={page} />
                </div>
                <div className="absolute inset-0 bg-primary/10 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                  <Eye className="w-6 h-6 text-primary drop-shadow" />
                </div>
              </button>
            ))}
          </div>

          {/* Pagination — bottom */}
          {total > LIMIT && (
            <div className="flex items-center justify-between pt-1">
              <span className="text-xs text-muted-foreground">Showing {offset + 1}–{Math.min(offset + LIMIT, total)} of {total} pages</span>
              <div className="flex gap-2">
                <Button size="sm" variant="outline" onClick={() => setOffset(Math.max(0, offset - LIMIT))} disabled={offset === 0} className="h-7 gap-1">
                  <ChevronLeft className="w-3.5 h-3.5" />Prev
                </Button>
                <Button size="sm" variant="outline" onClick={() => setOffset(offset + LIMIT)} disabled={offset + LIMIT >= total} className="h-7 gap-1">
                  Next<ChevronRight className="w-3.5 h-3.5" />
                </Button>
              </div>
            </div>
          )}
        </>
      )}

      {/* Thumbnails-mode dialog — Regions view owns its own dialog internally */}
      {viewMode === "thumbnails" && selectedPageId != null && (() => {
        const currentIdx = pages.findIndex((p: any) => p.id === selectedPageId);
        const nextId = currentIdx >= 0 && currentIdx < pages.length - 1
          ? (pages[currentIdx + 1] as any).id
          : null;
        return (
          <PageDetailDialog
            pageId={selectedPageId}
            open={true}
            onClose={() => setSelectedPageId(null)}
            onNext={nextId ? () => setSelectedPageId(nextId) : undefined}
          />
        );
      })()}

      {/* ── Export Bundle dialog ───────────────────────────────────────────── */}
      <Dialog open={exportDialogOpen} onOpenChange={setExportDialogOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Package className="h-5 w-5 text-emerald-400" />
              Export Pipeline Bundle
            </DialogTitle>
            <DialogDescription>
              Exports a portable snapshot of all pipeline results — page layout, OCR text,
              regions, and content summaries — as a single JSON file for archiving or
              transferring to another system.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-2">
            {/* Include images toggle */}
            <div className="flex items-start gap-3 rounded-md border border-border/50 px-4 py-3">
              <input
                id="export-include-images"
                type="checkbox"
                checked={exportIncludeImages}
                onChange={(e) => setExportIncludeImages(e.target.checked)}
                className="mt-0.5 h-4 w-4 cursor-pointer accent-emerald-500"
              />
              <div className="flex flex-col gap-0.5">
                <label htmlFor="export-include-images" className="text-sm font-medium cursor-pointer select-none">
                  Include page images (base-64)
                </label>
                <p className="text-xs text-muted-foreground">
                  Embeds each page PNG as base-64 in the bundle, making it fully
                  self-contained. <strong className="text-amber-400">Warning:</strong> this
                  can significantly increase file size (multi-page documents may be
                  100 MB+). Only enable if you need a system-independent archive or
                  if the target system has no access to the originals.
                </p>
              </div>
            </div>

            {exportIncludeImages && (
              <div className="rounded-md bg-amber-500/10 border border-amber-500/20 px-3 py-2 text-xs text-amber-300">
                Image export reads all page PNGs from the workspace. Large documents may take
                several seconds and produce very large files.
              </div>
            )}
          </div>

          <div className="flex justify-end gap-2 pt-2">
            <Button variant="outline" size="sm" onClick={() => setExportDialogOpen(false)}>
              Cancel
            </Button>
            <Button
              size="sm"
              onClick={() => exportBundleMutation.mutate({ documentId, includeImages: exportIncludeImages })}
              disabled={exportBundleMutation.isPending}
              className="gap-1.5"
            >
              {exportBundleMutation.isPending
                ? <Loader2 className="h-4 w-4 animate-spin" />
                : <Package className="h-4 w-4" />}
              Export
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* ── Import Bundle dialog ───────────────────────────────────────────── */}
      <Dialog open={importDialogOpen} onOpenChange={(open) => {
        if (!open) { setImportDialogOpen(false); setImportFile(null); setImportBundleHasImages(false); setImportOverwriteImages(false); }
      }}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Upload className="h-5 w-5 text-violet-400" />
              Import Pipeline Bundle
            </DialogTitle>
            <DialogDescription>
              Select a <code className="text-xs bg-muted px-1 rounded">-bundle.json</code> file
              exported from another system. Existing OCR results and content summaries for
              document #{documentId} will be replaced.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-2">
            <div
              className="flex flex-col items-center justify-center gap-2 rounded-md border-2 border-dashed border-border/60 p-6 text-sm text-muted-foreground cursor-pointer hover:border-primary/40 hover:bg-muted/20 transition-colors"
              onClick={() => importFileRef.current?.click()}
            >
              <Package className="h-8 w-8 opacity-40" />
              {importFile
                ? <span className="text-foreground font-medium">{importFile.name}</span>
                : <span>Click to select a bundle JSON file</span>}
              <input
                ref={importFileRef}
                type="file"
                accept=".json,application/json"
                className="hidden"
                onChange={(e) => handleImportFileChange(e.target.files?.[0] ?? null)}
              />
            </div>

            {/* Overwrite images toggle — only shown when bundle contains images */}
            {importBundleHasImages && (
              <div className="flex items-start gap-3 rounded-md border border-border/50 px-4 py-3">
                <input
                  id="import-overwrite-images"
                  type="checkbox"
                  checked={importOverwriteImages}
                  onChange={(e) => setImportOverwriteImages(e.target.checked)}
                  className="mt-0.5 h-4 w-4 cursor-pointer accent-violet-500"
                />
                <div className="flex flex-col gap-0.5">
                  <label htmlFor="import-overwrite-images" className="text-sm font-medium cursor-pointer select-none">
                    Overwrite existing page images
                  </label>
                  <p className="text-xs text-muted-foreground">
                    The bundle contains embedded page images. If a page already has an image in
                    the workspace, overwrite it with the bundle version. Leave unchecked to only
                    write images for pages that don't yet exist locally.
                  </p>
                </div>
              </div>
            )}

            {importFile && (
              <div className="rounded-md bg-amber-500/10 border border-amber-500/20 px-3 py-2 text-xs text-amber-300">
                This will overwrite all OCR results and content summaries for document #{documentId}.
                {importBundleHasImages && " Page images from the bundle will be written to the workspace."}
              </div>
            )}
          </div>

          <div className="flex justify-end gap-2 pt-2">
            <Button variant="outline" size="sm" onClick={() => {
              setImportDialogOpen(false); setImportFile(null);
              setImportBundleHasImages(false); setImportOverwriteImages(false);
            }}>
              Cancel
            </Button>
            <Button
              size="sm"
              onClick={handleImportBundle}
              disabled={!importFile || importBundleMutation.isPending}
              className="gap-1.5"
            >
              {importBundleMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />}
              Import
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}

// ── Tree node component ───────────────────────────────────────────────────────

const INDENT: Record<string, number> = { chapter: 0, appendix: 0, section: 20, subsection: 40, page: 60 };

function SummaryNode({
  node,
  onEdit,
  onApprove,
  approving,
  depth,
  collapseLevel,
}: {
  node: TreeNode;
  onEdit: (r: SummaryRecord) => void;
  onApprove: (id: number) => void;
  approving: number | null;
  depth: number;
  collapseLevel: number | null;
}) {
  // Local open state — default: non-page nodes start expanded
  const [open, setOpen] = useState(
    collapseLevel !== null ? depth < collapseLevel - 1 : node.levelType !== "page",
  );
  const hasChildren = node.children.length > 0;
  const indent = INDENT[node.levelType] ?? Math.min(depth * 20, 80);

  // Sync with global collapse level when it changes
  useEffect(() => {
    if (collapseLevel !== null) {
      setOpen(depth < collapseLevel - 1);
    }
  }, [collapseLevel, depth]);

  return (
    <div>
      <div
        className="flex items-start gap-2 py-2 px-3 rounded-md hover:bg-card/60 group"
        style={{ paddingLeft: `${indent + 12}px` }}
      >
        <button
          className="mt-0.5 flex-shrink-0 w-4 h-4 text-muted-foreground"
          onClick={() => setOpen(o => !o)}
          disabled={!hasChildren}
          aria-label={open ? "Collapse" : "Expand"}
        >
          {hasChildren
            ? open ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />
            : <span className="block w-4" />}
        </button>

        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <LevelBadge level={node.levelType} />
            <span className="text-sm font-medium truncate">
              {node.headingText ?? <span className="text-muted-foreground italic">Page {node.startPageNumber}</span>}
            </span>
            <span className="text-xs text-muted-foreground">
              pp.{node.startPageNumber}–{node.endPageNumber ?? "?"}
            </span>
            <StatusBadge status={node.summaryStatus} />
          </div>
          {node.shortSummary && (
            <p className="text-xs text-muted-foreground mt-1 line-clamp-2">{node.shortSummary}</p>
          )}
          {node.keyTerms && node.keyTerms.length > 0 && (
            <div className="flex flex-wrap gap-1 mt-1">
              {node.keyTerms.slice(0, 6).map(t => (
                <span key={t} className="text-[10px] bg-primary/10 text-primary/70 px-1 rounded">{t}</span>
              ))}
              {node.keyTerms.length > 6 && (
                <span className="text-[10px] text-muted-foreground">+{node.keyTerms.length - 6} more</span>
              )}
            </div>
          )}
        </div>

        <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity flex-shrink-0">
          <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => onEdit(node)}>
            <Edit className="w-3.5 h-3.5" />
          </Button>
          {node.summaryStatus === "generated" && (
            <Button size="icon" variant="ghost" className="h-7 w-7 text-green-500 hover:text-green-400"
              onClick={() => onApprove(node.id)} disabled={approving === node.id} aria-label="Approve">
              {approving === node.id ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Check className="w-3.5 h-3.5" />}
            </Button>
          )}
        </div>
      </div>

      {open && hasChildren && (
        <div>
          {node.children.map(child => (
            <SummaryNode
              key={child.id}
              node={child}
              onEdit={onEdit}
              onApprove={onApprove}
              approving={approving}
              depth={depth + 1}
              collapseLevel={collapseLevel}
            />
          ))}
        </div>
      )}
    </div>
  );
}

// ── Content Flow ──────────────────────────────────────────────────────────────

const BLOCK_STYLES: Record<string, { bar: string; badge: string; text: string; label: string }> = {
  heading:     { bar: "border-l-2 border-purple-500/60 bg-purple-500/8",  badge: "bg-purple-500/20 text-purple-300",  text: "text-foreground",         label: "H"       },
  paragraph:   { bar: "",                                                   badge: "bg-muted/40 text-muted-foreground", text: "text-foreground/90",       label: "¶"       },
  table:       { bar: "border-l-2 border-orange-500/60 bg-orange-500/8",   badge: "bg-orange-500/20 text-orange-300",  text: "text-foreground",         label: "Table"   },
  rule_term:   { bar: "border-l-2 border-blue-500/60 bg-blue-500/8",       badge: "bg-blue-500/20 text-blue-300",      text: "text-foreground",         label: "Rule"    },
  stat_block:  { bar: "border-l-2 border-emerald-500/60 bg-emerald-500/8", badge: "bg-emerald-500/20 text-emerald-300",text: "text-foreground",         label: "Stat"    },
  list:        { bar: "border-l-2 border-sky-500/60 bg-sky-500/8",         badge: "bg-sky-500/20 text-sky-300",        text: "text-foreground",         label: "List"    },
  sidebar:     { bar: "border-l-2 border-amber-500/60 bg-amber-500/8",     badge: "bg-amber-500/20 text-amber-300",    text: "text-foreground",         label: "Aside"   },
  callout:     { bar: "border-l-2 border-amber-400/60 bg-amber-400/8",     badge: "bg-amber-400/20 text-amber-200",    text: "text-foreground",         label: "Callout" },
  illustration:{ bar: "border border-dashed border-pink-500/40 bg-pink-500/5", badge: "bg-pink-500/20 text-pink-300", text: "text-muted-foreground italic", label: "Illus." },
  map:         { bar: "border border-dashed border-pink-400/40 bg-pink-400/5", badge: "bg-pink-400/20 text-pink-200", text: "text-muted-foreground italic", label: "Map"    },
  caption:     { bar: "bg-muted/20",                                        badge: "bg-muted/40 text-muted-foreground", text: "text-muted-foreground italic", label: "Caption" },
  quote:       { bar: "border-l-4 border-muted bg-muted/10",                badge: "bg-muted/40 text-muted-foreground", text: "text-foreground/70 italic",    label: "Quote"   },
};

function getBlockStyle(blockType: string) {
  return BLOCK_STYLES[blockType] ?? { bar: "bg-muted/10", badge: "bg-muted/30 text-muted-foreground", text: "text-foreground", label: blockType };
}

type ContentBlock = {
  id: number;
  sequence: number;
  blockType: string;
  content: string | null;
  tableData: { caption: string | null; headers: string[]; rows: unknown[][] } | null;
  startPageNumber: number;
  endPageNumber: number;
  isCrossPage: boolean;
  status: string;
  metadata: Record<string, unknown> | null;
};

function ContentBlockCard({ block }: { block: ContentBlock }) {
  const [expanded, setExpanded] = useState(false);
  const s = getBlockStyle(block.blockType);
  const isHeading = block.blockType === "heading";
  const isTable   = block.blockType === "table" || block.blockType === "stat_block";
  const level     = typeof (block.metadata as any)?.level === "number" ? (block.metadata as any).level : null;
  const isCross   = block.isCrossPage;
  const pageLabel = block.startPageNumber === block.endPageNumber
    ? `p.${block.startPageNumber}`
    : `pp.${block.startPageNumber}–${block.endPageNumber}`;

  const PREVIEW_CHARS = 300;
  const longContent = (block.content?.length ?? 0) > PREVIEW_CHARS;
  const displayText = longContent && !expanded
    ? block.content!.slice(0, PREVIEW_CHARS) + "…"
    : block.content ?? "";

  return (
    <div className={`rounded-md px-3 py-2 space-y-1 ${s.bar}`}>
      {/* Meta row */}
      <div className="flex items-start justify-between gap-2">
        <div className="flex items-center gap-1.5 flex-wrap min-w-0">
          <span className={`text-[10px] font-mono font-semibold uppercase tracking-wide px-1.5 py-0.5 rounded ${s.badge}`}>
            {isHeading && level ? `H${level}` : s.label}
          </span>
          {isCross && (
            <span className="text-[10px] px-1.5 py-0.5 rounded bg-yellow-500/15 text-yellow-400 font-mono">↕ cross-page</span>
          )}
          {isHeading && block.content && (
            <span className={`font-semibold truncate ${level === 1 ? "text-sm" : "text-xs"}`}>
              {block.content}
            </span>
          )}
        </div>
        <span className="text-[10px] text-muted-foreground flex-shrink-0 font-mono">{pageLabel}</span>
      </div>

      {/* Text content (non-heading) */}
      {!isHeading && displayText && (
        <div className={`text-xs leading-relaxed whitespace-pre-wrap break-words ${s.text}`}>
          {displayText}
          {longContent && (
            <button
              onClick={() => setExpanded(e => !e)}
              className="ml-1 text-primary underline underline-offset-2 not-italic"
            >
              {expanded ? "show less" : "show more"}
            </button>
          )}
        </div>
      )}

      {/* Table data */}
      {isTable && block.tableData && (
        <div className="overflow-x-auto mt-1">
          {block.tableData.caption && (
            <p className="text-[11px] text-muted-foreground mb-1 italic">{block.tableData.caption}</p>
          )}
          <table className="text-[11px] w-full border-collapse">
            {block.tableData.headers.length > 0 && (
              <thead>
                <tr>
                  {block.tableData.headers.map((h, hi) => (
                    <th key={hi} className="border border-border/30 px-2 py-0.5 text-left font-semibold bg-muted/30">
                      {String(h ?? "")}
                    </th>
                  ))}
                </tr>
              </thead>
            )}
            <tbody>
              {(block.tableData.rows as unknown[][]).slice(0, expanded ? 9999 : 8).map((row, ri) => (
                <tr key={ri} className="even:bg-muted/10">
                  {(Array.isArray(row) ? row : []).map((cell, ci) => (
                    <td key={ci} className="border border-border/30 px-2 py-0.5 whitespace-pre-wrap">
                      {String(cell ?? "")}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
          {!expanded && block.tableData.rows.length > 8 && (
            <button onClick={() => setExpanded(true)} className="text-[11px] text-primary mt-1 underline underline-offset-2">
              Show all {block.tableData.rows.length} rows…
            </button>
          )}
        </div>
      )}
    </div>
  );
}

const FLOW_FILTERS = [
  { label: "All",        value: "" },
  { label: "Headings",   value: "heading" },
  { label: "Paragraphs", value: "paragraph" },
  { label: "Tables",     value: "table" },
  { label: "Rules",      value: "rule_term" },
  { label: "Stats",      value: "stat_block" },
  { label: "Lists",      value: "list" },
];

const FLOW_PAGE = 100;

function ContentFlowPanel({ documentId }: { documentId: number }) {
  const [offset, setOffset]       = useState(0);
  const [filterType, setFilterType] = useState("");
  const utils = trpc.useUtils();

  const rerunMutation = trpc.contentBlocks.rerun.useMutation({
    onSuccess: (r) => {
      toast.success(`Content flow rebuilt: ${r.total} blocks.`);
      utils.contentBlocks.listByDocument.invalidate({ documentId });
    },
    onError: (err) => toast.error(err.message),
  });

  const { data, isLoading, refetch } = trpc.contentBlocks.listByDocument.useQuery(
    { documentId, offset, limit: FLOW_PAGE, blockType: filterType || undefined },
    { enabled: documentId > 0 },
  );

  const blocks = (data?.blocks ?? []) as ContentBlock[];
  const total  = data?.total ?? 0;

  // Reset offset when filter or document changes
  useEffect(() => setOffset(0), [filterType, documentId]);

  const hasPrev = offset > 0;
  const hasNext = offset + FLOW_PAGE < total;

  return (
    <div className="space-y-3">
      {/* Toolbar */}
      <div className="flex items-center gap-2 flex-wrap">
        <div className="flex rounded-md border border-border/40 overflow-hidden">
          {FLOW_FILTERS.map((f, i) => (
            <button
              key={f.value}
              onClick={() => setFilterType(f.value)}
              className={`px-2.5 py-1 text-xs transition-colors ${i > 0 ? "border-l border-border/40" : ""} ${
                filterType === f.value
                  ? "bg-primary/20 text-primary"
                  : "text-muted-foreground hover:bg-muted/40"
              }`}
            >
              {f.label}
            </button>
          ))}
        </div>
        <span className="text-xs text-muted-foreground ml-auto">
          {total} block{total !== 1 ? "s" : ""}
        </span>
        <Button
          variant="outline"
          size="sm"
          className="gap-1.5 h-7 text-xs"
          onClick={() => rerunMutation.mutate({ documentId })}
          disabled={rerunMutation.isPending}
        >
          {rerunMutation.isPending
            ? <Loader2 className="w-3 h-3 animate-spin" />
            : <RefreshCw className="w-3 h-3" />}
          Re-assemble
        </Button>
        <Button
          variant="ghost"
          size="icon"
          className="h-7 w-7"
          onClick={() => refetch()}
          title="Refresh"
        >
          <RefreshCw className="w-3 h-3" />
        </Button>
      </div>

      {/* Block list */}
      {isLoading ? (
        <div className="flex items-center justify-center py-16 text-muted-foreground gap-2">
          <Loader2 className="w-5 h-5 animate-spin" />
          Loading content flow…
        </div>
      ) : blocks.length === 0 ? (
        <div className="py-16 text-center text-muted-foreground">
          <AlignLeft className="w-8 h-8 mx-auto mb-3 opacity-30" />
          <p className="text-sm">No content blocks assembled yet.</p>
          <p className="text-xs mt-1 opacity-70">
            Finish the pipeline (or click Re-assemble) to build the content flow.
          </p>
        </div>
      ) : (
        <div className="space-y-1.5">
          {blocks.map(b => <ContentBlockCard key={b.id} block={b} />)}
        </div>
      )}

      {/* Pagination */}
      {total > FLOW_PAGE && (
        <div className="flex items-center justify-between pt-1">
          <Button
            variant="outline"
            size="sm"
            disabled={!hasPrev}
            onClick={() => setOffset(o => Math.max(0, o - FLOW_PAGE))}
          >
            <ChevronLeft className="w-3.5 h-3.5 mr-1" />Prev
          </Button>
          <span className="text-xs text-muted-foreground">
            {offset + 1}–{Math.min(offset + FLOW_PAGE, total)} of {total}
          </span>
          <Button
            variant="outline"
            size="sm"
            disabled={!hasNext}
            onClick={() => setOffset(o => o + FLOW_PAGE)}
          >
            Next<ChevronRight className="w-3.5 h-3.5 ml-1" />
          </Button>
        </div>
      )}
    </div>
  );
}

// ── Main page ─────────────────────────────────────────────────────────────────

export default function TheChronicles() {
  const [selectedLabel, setSelectedLabel] = useState<string | null>(null);
  const [selectorOpen, setSelectorOpen] = useState(false);
  const [editTarget, setEditTarget] = useState<SummaryRecord | null>(null);
  const [approving, setApproving] = useState<number | null>(null);
  const [collapseLevel, setCollapseLevel] = useState<number | null>(null);

  const { data: docs = [] } = trpc.library.listDocuments.useQuery(undefined);

  const groupMap = useMemo(() => {
    const map = new Map<string, { label: string; ids: number[] }>();
    for (const d of docs) {
      if ((d.totalPages ?? 0) === 0) continue;
      const base = d.title ?? d.filename ?? `Document #${d.id}`;
      const meta = [d.gameSystem, d.edition].filter(Boolean).join(" · ");
      const label = meta ? `${base} [${meta}]` : base;
      const existing = map.get(label);
      if (existing) { existing.ids.push(d.id); }
      else { map.set(label, { label, ids: [d.id] }); }
    }
    return map;
  }, [docs]);

  const selectedDocIds = selectedLabel ? (groupMap.get(selectedLabel)?.ids ?? []) : [];

  const { data: rawSummaries = [], isLoading, refetch } = trpc.summaries.listByDocumentIds.useQuery(
    { documentIds: selectedDocIds },
    { enabled: selectedDocIds.length > 0 },
  );

  const utils = trpc.useUtils();

  const approveMutation = trpc.summaries.approve.useMutation({
    onSuccess: () => {
      toast.success("Summary approved.");
      utils.summaries.listByDocumentIds.invalidate();
      setApproving(null);
    },
    onError: (err) => { toast.error(err.message); setApproving(null); },
  });

  const approveAllMutation = trpc.summaries.approveAll.useMutation({
    onError: (err) => toast.error(err.message),
  });

  const rebuildHierarchyMutation = trpc.library.rebuildHierarchy.useMutation({
    onSuccess: () => {
      toast.success("Hierarchy rebuilt — invalid entries removed.");
      utils.summaries.listByDocumentIds.invalidate();
    },
    onError: (err) => toast.error(err.message),
  });

  const handleApproveAll = async () => {
    if (!selectedDocIds.length) return;
    let total = 0;
    for (const docId of selectedDocIds) {
      const result = await approveAllMutation.mutateAsync({ documentId: docId });
      total += result.count;
    }
    toast.success(`${total} ${total === 1 ? "summary" : "summaries"} approved.`);
    utils.summaries.listByDocumentIds.invalidate();
  };

  const tree = useMemo(() => buildTree(rawSummaries as SummaryRecord[]), [rawSummaries]);

  const stats = useMemo(() => {
    const counts: Record<string, number> = {};
    for (const s of rawSummaries) counts[s.summaryStatus] = (counts[s.summaryStatus] ?? 0) + 1;
    return counts;
  }, [rawSummaries]);

  const generatedCount = stats["generated"] ?? 0;

  const COLLAPSE_LEVELS = [
    { label: "L1", value: 1 as const, title: "Show top level only (chapters/appendices)" },
    { label: "L2", value: 2 as const, title: "Expand to second level (sections)" },
    { label: "L3", value: 3 as const, title: "Expand to third level (subsections)" },
    { label: "All", value: null as null, title: "Expand all" },
  ];

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <ScrollText className="w-6 h-6 text-primary" />
            The Chronicles
          </h1>
          <p className="text-muted-foreground text-sm mt-1">
            Review and correct AI-generated content summaries across the document hierarchy.
          </p>
        </div>
        {selectedLabel !== null && (
          <Button variant="outline" size="sm" onClick={() => refetch()} className="gap-2">
            <RefreshCw className="w-4 h-4" />Refresh
          </Button>
        )}
      </div>

      {/* Document selector */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2">
            <BookOpen className="w-4 h-4 text-primary" />
            Select a Document
            <span className="ml-auto text-xs font-normal text-muted-foreground">
              {groupMap.size} document{groupMap.size !== 1 ? "s" : ""}
            </span>
          </CardTitle>
        </CardHeader>
        <CardContent>
          <Popover open={selectorOpen} onOpenChange={setSelectorOpen}>
            <PopoverTrigger asChild>
              <Button variant="outline" role="combobox" aria-expanded={selectorOpen}
                className="w-full max-w-lg justify-between font-normal text-left h-auto min-h-9 py-2">
                <span className="truncate flex-1">
                  {selectedLabel
                    ? (groupMap.get(selectedLabel)?.ids.length ?? 0) > 1
                      ? `${selectedLabel} (${groupMap.get(selectedLabel)!.ids.length} batches)`
                      : selectedLabel
                    : <span className="text-muted-foreground">Choose a document to review…</span>}
                </span>
                <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-[var(--radix-popover-trigger-width)] max-w-lg p-0" align="start">
              <Command>
                <CommandInput placeholder="Search documents…" />
                <CommandList className="max-h-72">
                  <CommandEmpty>No documents found.</CommandEmpty>
                  <CommandGroup>
                    {Array.from(groupMap.entries()).map(([label, group]) => (
                      <CommandItem key={label} value={label} onSelect={() => {
                        setSelectedLabel(label === selectedLabel ? null : label);
                        setSelectorOpen(false);
                      }}>
                        <Check className={`mr-2 h-4 w-4 flex-shrink-0 ${label === selectedLabel ? "opacity-100" : "opacity-0"}`} />
                        <span className="flex-1 truncate">
                          {group.ids.length > 1 ? `${label} (${group.ids.length} batches)` : label}
                        </span>
                      </CommandItem>
                    ))}
                  </CommandGroup>
                </CommandList>
              </Command>
            </PopoverContent>
          </Popover>
        </CardContent>
      </Card>

      {/* Stats bar */}
      {selectedLabel !== null && rawSummaries.length > 0 && (
        <div className="flex items-center gap-4 flex-wrap">
          {Object.entries(stats).map(([status, count]) => (
            <div key={status} className="flex items-center gap-1.5">
              <StatusBadge status={status} />
              <span className="text-sm text-muted-foreground">{count}</span>
            </div>
          ))}
          {generatedCount > 0 && (
            <div className="ml-auto">
              <Button size="sm" variant="outline" className="gap-2 text-green-400 border-green-500/30 hover:bg-green-500/10"
                onClick={handleApproveAll} disabled={approveAllMutation.isPending}>
                {approveAllMutation.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />}
                Approve All Generated ({generatedCount})
              </Button>
            </div>
          )}
        </div>
      )}

      {/* Content tabs */}
      {selectedLabel !== null && (
        <Tabs defaultValue="summaries">
          <TabsList>
            <TabsTrigger value="summaries" className="gap-1.5">
              <Layers className="w-3.5 h-3.5" />Summaries
            </TabsTrigger>
            <TabsTrigger value="flow" className="gap-1.5">
              <AlignLeft className="w-3.5 h-3.5" />Content Flow
            </TabsTrigger>
            <TabsTrigger value="pages" className="gap-1.5">
              <FileImage className="w-3.5 h-3.5" />Pages
            </TabsTrigger>
          </TabsList>

          <TabsContent value="summaries">
            <Card>
              <CardHeader className="pb-3">
                <div className="flex items-start justify-between gap-4 flex-wrap">
                  <div>
                    <CardTitle className="text-base flex items-center gap-2">
                      <Layers className="w-4 h-4 text-primary" />
                      {selectedLabel} — Hierarchy
                    </CardTitle>
                    {rawSummaries.length > 0 && (
                      <CardDescription>{rawSummaries.length} summary records</CardDescription>
                    )}
                  </div>

                  <div className="flex items-center gap-2 flex-shrink-0 flex-wrap">
                    {/* Rebuild hierarchy button — purges invalid types, re-resolves bounds */}
                    {selectedDocIds.length > 0 && (
                      <Button
                        variant="outline"
                        size="sm"
                        className="h-7 gap-1.5 text-xs"
                        onClick={() => {
                          for (const docId of selectedDocIds) {
                            rebuildHierarchyMutation.mutate({ documentId: docId });
                          }
                        }}
                        disabled={rebuildHierarchyMutation.isPending}
                        title="Remove invalid hierarchy entries (lists, tables, etc.) and re-resolve chapter boundaries"
                      >
                        {rebuildHierarchyMutation.isPending
                          ? <Loader2 className="w-3 h-3 animate-spin" />
                          : <RefreshCw className="w-3 h-3" />}
                        Rebuild
                      </Button>
                    )}

                    {/* Collapse level selector */}
                    {tree.length > 0 && (
                      <div className="flex items-center gap-2">
                        <span className="text-xs text-muted-foreground">Collapse to:</span>
                        <div className="flex rounded-md border border-border/40 overflow-hidden">
                          {COLLAPSE_LEVELS.map((opt, i) => (
                            <button
                              key={opt.label}
                              onClick={() => setCollapseLevel(opt.value)}
                              title={opt.title}
                              className={`px-2.5 py-1.5 text-xs transition-colors ${i > 0 ? "border-l border-border/40" : ""} ${
                                collapseLevel === opt.value
                                  ? "bg-primary/20 text-primary"
                                  : "text-muted-foreground hover:bg-muted/40"
                              }`}
                            >
                              {opt.label}
                            </button>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              </CardHeader>

              <CardContent className="p-0">
                {isLoading ? (
                  <div className="flex items-center justify-center py-16 text-muted-foreground gap-2">
                    <Loader2 className="w-5 h-5 animate-spin" />Loading summaries…
                  </div>
                ) : tree.length === 0 ? (
                  <div className="py-16 text-center text-muted-foreground">
                    <ScrollText className="w-8 h-8 mx-auto mb-3 opacity-30" />
                    <p className="text-sm">No summaries yet for this document.</p>
                    <p className="text-xs mt-1">Run the pipeline to generate content break detection and summaries.</p>
                  </div>
                ) : (
                  <div className="py-2">
                    {tree.map(node => (
                      <SummaryNode
                        key={node.id}
                        node={node}
                        onEdit={setEditTarget}
                        onApprove={(id) => { setApproving(id); approveMutation.mutate({ id }); }}
                        approving={approving}
                        depth={0}
                        collapseLevel={collapseLevel}
                      />
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="flow">
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-base flex items-center gap-2">
                  <AlignLeft className="w-4 h-4 text-primary" />
                  {selectedLabel} — Content Flow
                </CardTitle>
                <CardDescription>
                  Reading-order content: paragraphs merged across page breaks, headers/footers/page numbers stripped.
                </CardDescription>
              </CardHeader>
              <CardContent>
                <ContentFlowPanel documentId={selectedDocIds[0] ?? 0} />
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="pages">
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-base flex items-center gap-2">
                  <FileImage className="w-4 h-4 text-primary" />
                  {selectedLabel} — Pages
                </CardTitle>
              </CardHeader>
              <CardContent>
                <PageBrowser documentIds={groupMap.get(selectedLabel)?.ids ?? []} />
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      )}

      {editTarget !== null && (
        <EditDialog node={editTarget} open={true} onClose={() => setEditTarget(null)} />
      )}
    </div>
  );
}
