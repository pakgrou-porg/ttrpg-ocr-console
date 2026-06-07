import { useState, useMemo } from "react";
import { trpc } from "@/lib/trpc";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
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
  BookOpen, Layers, RefreshCw, ChevronsUpDown, ScrollText, ChevronRight, ChevronDown,
  Check, Edit, Loader2, FileImage, ChevronLeft, Eye, Code2, AlignLeft,
  History, FileText, Grid3x3, Flag, LayoutGrid, List,
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

// ── Region type pill ──────────────────────────────────────────────────────────

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

function regionPillClass(type: string) {
  return REGION_COLORS[type] ?? "bg-muted text-muted-foreground";
}

// ── Edit dialog ───────────────────────────────────────────────────────────────

const SUMMARY_STATUSES = ["pending", "generating", "generated", "approved", "failed"] as const;
const HITL_PRIORITIES = ["low", "medium", "high", "critical"] as const;
const RETRY_STAGES = [
  { value: "layout_analysis",  label: "Layout Analysis" },
  { value: "bbox_detection",   label: "BBox Detection" },
  { value: "ocr_extraction",   label: "OCR Extraction" },
] as const;

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

  const handleSave = () => {
    update.mutate({
      id: node.id,
      shortSummary: shortSummary || null,
      longSummary: longSummary || null,
      keyTerms: keyTerms.split(",").map(s => s.trim()).filter(Boolean),
      keyEntities: keyEntities.split(",").map(s => s.trim()).filter(Boolean),
      summaryStatus: status as (typeof SUMMARY_STATUSES)[number],
    });
  };

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <LevelBadge level={node.levelType} />
            {node.headingText ?? `Page ${node.startPageNumber}`}
          </DialogTitle>
          <DialogDescription>
            Pages {node.startPageNumber}–{node.endPageNumber ?? "?"}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-2">
          <div className="space-y-1.5">
            <Label>Short Summary</Label>
            <Textarea
              value={shortSummary}
              onChange={e => setShortSummary(e.target.value)}
              rows={3}
              placeholder="Brief 1–2 sentence summary used for embeddings…"
            />
          </div>
          <div className="space-y-1.5">
            <Label>Long Summary</Label>
            <Textarea
              value={longSummary}
              onChange={e => setLongSummary(e.target.value)}
              rows={6}
              placeholder="Detailed summary returned as context in search results…"
            />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <Label>
                Key Terms{" "}
                <span className="text-muted-foreground text-xs">(comma-separated)</span>
              </Label>
              <Input
                value={keyTerms}
                onChange={e => setKeyTerms(e.target.value)}
                placeholder="fireball, arcane, spell…"
              />
            </div>
            <div className="space-y-1.5">
              <Label>
                Key Entities{" "}
                <span className="text-muted-foreground text-xs">(comma-separated)</span>
              </Label>
              <Input
                value={keyEntities}
                onChange={e => setKeyEntities(e.target.value)}
                placeholder="Gandalf, Mordor, Mithril…"
              />
            </div>
          </div>
          <div className="space-y-1.5">
            <Label>Status</Label>
            <Select value={status} onValueChange={setStatus}>
              <SelectTrigger className="w-48">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {SUMMARY_STATUSES.map(s => (
                  <SelectItem key={s} value={s}>{s}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button onClick={handleSave} disabled={update.isPending}>
            {update.isPending && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
            Save Changes
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ── HITL re-queue section (used inside PageDetailDialog) ──────────────────────

function HitlSection({
  pageId,
  isAlreadyFlagged,
  onFlagged,
}: {
  pageId: number;
  isAlreadyFlagged?: boolean | null;
  onFlagged?: () => void;
}) {
  const [reason, setReason] = useState("");
  const [priority, setPriority] = useState<"low" | "medium" | "high" | "critical">("medium");
  const [selectedStages, setSelectedStages] = useState<Set<string>>(new Set());
  const [open, setOpen] = useState(false);

  const flagMutation = trpc.hitl.flag.useMutation({
    onError: (err) => toast.error(err.message),
  });
  const retryMutation = trpc.hitl.retryPage.useMutation({
    onError: (err) => toast.error(err.message),
  });

  const toggleStage = (stage: string) => {
    setSelectedStages(prev => {
      const next = new Set(prev);
      if (next.has(stage)) next.delete(stage);
      else next.add(stage);
      return next;
    });
  };

  const handleFlag = async () => {
    if (!reason.trim()) { toast.error("Please enter a reason."); return; }
    try {
      const result = await flagMutation.mutateAsync({ pageId, reason: reason.trim(), priority });
      if (result.alreadyQueued) {
        toast.info("Page is already queued for HITL review.");
      } else {
        toast.success("Page flagged for HITL review.");
      }
      if (selectedStages.size > 0) {
        await retryMutation.mutateAsync({
          pageId,
          hitlId: result.id,
          stages: Array.from(selectedStages) as ("layout_analysis" | "bbox_detection" | "ocr_extraction")[],
        });
        toast.success(`Re-queued ${selectedStages.size} stage${selectedStages.size > 1 ? "s" : ""} for reprocessing.`);
      }
      setReason("");
      setSelectedStages(new Set());
      setOpen(false);
      onFlagged?.();
    } catch {
      // errors already toasted by individual mutations
    }
  };

  const isBusy = flagMutation.isPending || retryMutation.isPending;

  return (
    <div className="border-t border-border/30 pt-3 mt-1 flex-shrink-0">
      {isAlreadyFlagged && !open ? (
        <div className="flex items-center justify-between">
          <span className="text-xs text-amber-400 flex items-center gap-1.5">
            <Flag className="w-3.5 h-3.5" />
            Already flagged for HITL review
          </span>
          <Button size="sm" variant="ghost" className="h-7 text-xs gap-1.5" onClick={() => setOpen(true)}>
            Re-queue stages
          </Button>
        </div>
      ) : !open ? (
        <Button
          size="sm"
          variant="ghost"
          className="h-7 text-xs gap-1.5 text-muted-foreground hover:text-amber-400"
          onClick={() => setOpen(true)}
        >
          <Flag className="w-3.5 h-3.5" />
          Flag for HITL review / re-queue
        </Button>
      ) : (
        <div className="space-y-2.5">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium flex items-center gap-1.5 text-amber-400">
              <Flag className="w-3.5 h-3.5" />
              Flag for HITL Review
            </span>
            <Button size="sm" variant="ghost" className="h-6 text-xs px-2" onClick={() => setOpen(false)}>
              Cancel
            </Button>
          </div>

          <div className="grid grid-cols-[1fr_auto] gap-2">
            <Textarea
              value={reason}
              onChange={e => setReason(e.target.value)}
              placeholder="Describe the issue: wrong layout, missed regions, poor OCR quality…"
              rows={2}
              className="text-xs resize-none"
            />
            <Select value={priority} onValueChange={v => setPriority(v as typeof priority)}>
              <SelectTrigger className="w-28 h-9 text-xs self-start">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {HITL_PRIORITIES.map(p => (
                  <SelectItem key={p} value={p} className="text-xs">{p}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-1">
            <p className="text-[11px] text-muted-foreground">Re-trigger stages (optional):</p>
            <div className="flex items-center gap-4">
              {RETRY_STAGES.map(s => (
                <label key={s.value} className="flex items-center gap-1.5 cursor-pointer">
                  <Checkbox
                    checked={selectedStages.has(s.value)}
                    onCheckedChange={() => toggleStage(s.value)}
                    className="w-3.5 h-3.5"
                  />
                  <span className="text-xs text-muted-foreground">{s.label}</span>
                </label>
              ))}
            </div>
          </div>

          <Button
            size="sm"
            className="gap-1.5 text-xs"
            onClick={handleFlag}
            disabled={isBusy || !reason.trim()}
          >
            {isBusy ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Flag className="w-3.5 h-3.5" />}
            {selectedStages.size > 0 ? "Flag & Re-queue" : "Flag for Review"}
          </Button>
        </div>
      )}
    </div>
  );
}

// ── Page detail dialog ────────────────────────────────────────────────────────

function PageDetailDialog({ pageId, open, onClose }: { pageId: number; open: boolean; onClose: () => void }) {
  const [detailTab, setDetailTab] = useState<"image" | "ocr" | "regions" | "json" | "history">("image");
  const utils = trpc.useUtils();
  const { data, isLoading, refetch } = trpc.library.getPageDetail.useQuery(
    { pageId },
    { enabled: open && pageId > 0 },
  );

  const ocr = data?.ocr as any;
  const sd = ocr?.structuredData as any;
  const regions = Array.isArray(data?.contentRegions) ? (data!.contentRegions as any[]) : [];
  const retryAttempts = data?.retryAttempts ?? [];

  const handleFlagged = () => {
    refetch();
    utils.library.listPages.invalidate();
  };

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-5xl max-h-[90vh] overflow-hidden flex flex-col">
        <DialogHeader className="flex-shrink-0">
          <DialogTitle className="flex items-center gap-2">
            <FileImage className="w-4 h-4 text-primary" />
            Page {data?.pageNumber ?? pageId}
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
            {data?.ocrConfidence != null && (
              <span className="text-xs text-muted-foreground ml-auto mr-6">
                {data.ocrConfidence}% confidence
              </span>
            )}
          </DialogTitle>
          {(data as any)?.printedPageLabel && (data as any).printedPageLabel !== "[unnumbered]" && (
            <DialogDescription>Printed label: {(data as any).printedPageLabel}</DialogDescription>
          )}
        </DialogHeader>

        <Tabs value={detailTab} onValueChange={v => setDetailTab(v as any)} className="flex-1 overflow-hidden flex flex-col min-h-0">
          <TabsList className="flex-shrink-0 w-full justify-start">
            <TabsTrigger value="image" className="gap-1.5"><Eye className="w-3.5 h-3.5" />Image</TabsTrigger>
            <TabsTrigger value="ocr" className="gap-1.5"><AlignLeft className="w-3.5 h-3.5" />OCR Text</TabsTrigger>
            <TabsTrigger value="regions" className="gap-1.5"><Grid3x3 className="w-3.5 h-3.5" />Regions ({regions.length})</TabsTrigger>
            <TabsTrigger value="json" className="gap-1.5"><Code2 className="w-3.5 h-3.5" />JSON</TabsTrigger>
            <TabsTrigger value="history" className="gap-1.5"><History className="w-3.5 h-3.5" />History ({retryAttempts.length})</TabsTrigger>
          </TabsList>

          {isLoading ? (
            <div className="flex items-center justify-center py-16 text-muted-foreground gap-2">
              <Loader2 className="w-5 h-5 animate-spin" />Loading page…
            </div>
          ) : (
            <>
              <TabsContent value="image" className="flex-1 overflow-auto mt-0 pt-3">
                {data?.rawPngUrl ? (
                  <img src={data.rawPngUrl} alt={`Page ${data.pageNumber}`} className="max-w-full rounded border border-border/40 mx-auto block" />
                ) : (
                  <p className="text-center text-muted-foreground py-8">No image available.</p>
                )}
              </TabsContent>

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

              <TabsContent value="regions" className="flex-1 overflow-auto mt-0 pt-3">
                {regions.length === 0 ? (
                  <p className="text-center text-muted-foreground py-8">No regions detected.</p>
                ) : (
                  <div className="space-y-1.5">
                    {regions.map((r: any, i: number) => (
                      <div key={i} className="flex items-start gap-2 text-xs p-2 rounded bg-muted/20 border border-border/20 hover:bg-muted/40">
                        <span className="font-mono text-muted-foreground w-6 flex-shrink-0">{r.sequence ?? i + 1}</span>
                        <span className={`px-1.5 py-0.5 rounded text-[10px] font-mono flex-shrink-0 ${regionPillClass(r.type ?? r.regionType ?? "")}`}>
                          {r.type ?? r.regionType}
                        </span>
                        <span className="font-mono text-muted-foreground flex-shrink-0 text-[10px]">
                          ({Math.round(r.bbox?.x ?? 0)},{Math.round(r.bbox?.y ?? 0)}) {Math.round(r.bbox?.w ?? 0)}×{Math.round(r.bbox?.h ?? 0)}
                        </span>
                        <span className="flex-1 text-foreground/80 line-clamp-1 min-w-0">{r.text ?? r.content ?? ""}</span>
                      </div>
                    ))}
                  </div>
                )}
              </TabsContent>

              <TabsContent value="json" className="flex-1 overflow-auto mt-0 pt-3">
                <pre className="text-xs font-mono whitespace-pre-wrap break-words bg-muted/30 rounded p-3 border border-border/30 text-foreground/80">
                  {JSON.stringify(sd ?? ocr?.structuredData ?? null, null, 2)}
                </pre>
              </TabsContent>

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
        <HitlSection
          pageId={pageId}
          isAlreadyFlagged={(data as any)?.isFlagged}
          onFlagged={handleFlagged}
        />
      </DialogContent>
    </Dialog>
  );
}

// ── Regions overview (bulk view across all pages) ─────────────────────────────

function tabulateRegions(regions: any[]): Record<string, number> {
  const counts: Record<string, number> = {};
  for (const r of regions) {
    const t = (r.type ?? r.regionType ?? "unknown") as string;
    counts[t] = (counts[t] ?? 0) + 1;
  }
  return counts;
}

function RegionsOverview({
  documentId,
  onPageClick,
}: {
  documentId: number;
  onPageClick: (id: number) => void;
}) {
  const { data, isLoading } = trpc.library.listPages.useQuery(
    { documentId, offset: 0, limit: 500 },
    { enabled: documentId > 0 },
  );
  const pages = data?.pages ?? [];

  // Compute aggregate stats for the header
  const totalRegions = useMemo(
    () => pages.reduce((sum, p: any) => sum + (Array.isArray(p.contentRegions) ? p.contentRegions.length : 0), 0),
    [pages],
  );
  const pagesNoRegions = pages.filter((p: any) => !Array.isArray(p.contentRegions) || p.contentRegions.length === 0).length;
  const avgConf = useMemo(() => {
    const withConf = pages.filter((p: any) => p.ocrConfidence != null);
    if (withConf.length === 0) return null;
    return Math.round(withConf.reduce((s: number, p: any) => s + p.ocrConfidence, 0) / withConf.length);
  }, [pages]);

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-16 text-muted-foreground gap-2">
        <Loader2 className="w-4 h-4 animate-spin" />Loading all pages…
      </div>
    );
  }
  if (pages.length === 0) {
    return (
      <div className="py-10 text-center text-muted-foreground">
        <FileImage className="w-8 h-8 mx-auto mb-2 opacity-30" />
        <p className="text-sm">No pages found.</p>
      </div>
    );
  }

  return (
    <div className="space-y-2">
      {/* Summary bar */}
      <div className="flex items-center gap-4 text-xs text-muted-foreground pb-1 flex-wrap">
        <span>{pages.length} pages</span>
        <span>{totalRegions} total regions</span>
        {pagesNoRegions > 0 && (
          <span className="text-amber-400 font-medium">{pagesNoRegions} pages missing regions</span>
        )}
        {avgConf != null && <span>avg confidence {avgConf}%</span>}
        <span className="ml-auto text-[11px]">Click any row to inspect page details.</span>
      </div>

      {/* Column headers */}
      <div className="grid grid-cols-[3rem_5rem_1fr_5rem_4.5rem_auto] gap-x-3 px-3 py-1 text-[10px] font-mono text-muted-foreground uppercase tracking-wide border-b border-border/20">
        <span>Page</span>
        <span>Layout</span>
        <span>Regions</span>
        <span>Confidence</span>
        <span>Status</span>
        <span></span>
      </div>

      {/* Rows */}
      <div className="space-y-0.5 max-h-[520px] overflow-y-auto pr-1">
        {pages.map((page: any) => {
          const regions = Array.isArray(page.contentRegions) ? page.contentRegions as any[] : [];
          const typeCounts = tabulateRegions(regions);
          const sortedTypes = Object.entries(typeCounts).sort((a, b) => b[1] - a[1]);
          const conf = page.ocrConfidence;
          const confColor = conf == null ? "" : conf >= 80 ? "text-green-400" : conf >= 60 ? "text-amber-400" : "text-red-400";

          return (
            <button
              key={page.id}
              onClick={() => onPageClick(page.id)}
              className="w-full grid grid-cols-[3rem_5rem_1fr_5rem_4.5rem_auto] gap-x-3 px-3 py-1.5 rounded hover:bg-muted/40 text-left group transition-colors"
            >
              {/* Page # */}
              <span className="text-xs font-mono text-muted-foreground self-center">
                {page.pageNumber}
              </span>

              {/* Layout */}
              <span className="text-[10px] font-mono text-muted-foreground self-center truncate">
                {page.layoutType ?? <span className="opacity-40">—</span>}
              </span>

              {/* Region type pills */}
              <div className="flex items-center gap-1 flex-wrap self-center min-w-0">
                {regions.length === 0 ? (
                  <span className="text-[10px] text-amber-500/70 font-mono">no regions</span>
                ) : (
                  sortedTypes.map(([type, count]) => (
                    <span key={type} className={`text-[10px] font-mono px-1.5 py-0.5 rounded ${regionPillClass(type)}`}>
                      {count} {type}
                    </span>
                  ))
                )}
              </div>

              {/* Confidence */}
              <span className={`text-xs font-mono self-center ${confColor}`}>
                {conf != null ? `${conf}%` : <span className="text-muted-foreground/40">—</span>}
              </span>

              {/* Pipeline status */}
              <div className="self-center">
                <PipelineStatusBadge page={page} />
              </div>

              {/* HITL badge + hover arrow */}
              <div className="flex items-center gap-1.5 self-center justify-end">
                {page.isFlagged && (
                  <span className="text-[10px] bg-amber-500/20 text-amber-400 border border-amber-500/30 px-1 rounded flex items-center gap-0.5">
                    <Flag className="w-2.5 h-2.5" />HITL
                  </span>
                )}
                <ChevronRight className="w-3.5 h-3.5 text-muted-foreground/30 group-hover:text-primary transition-colors" />
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
}

// ── Page browser ──────────────────────────────────────────────────────────────

function PageBrowser({ documentIds }: { documentIds: number[] }) {
  const [documentId, setDocumentId] = useState<number>(documentIds[0] ?? 0);
  const [offset, setOffset] = useState(0);
  const [selectedPageId, setSelectedPageId] = useState<number | null>(null);
  const [viewMode, setViewMode] = useState<"thumbnails" | "regions">("thumbnails");
  const LIMIT = 20;

  const exportMutation = trpc.library.exportUnsloth.useMutation({
    onSuccess: (data) => {
      if (!data.jsonl) { toast.error("No exportable data found."); return; }
      const blob = new Blob([data.jsonl], { type: "application/jsonl" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `document-${documentId}-unsloth.jsonl`;
      a.click();
      URL.revokeObjectURL(url);
      toast.success(`Exported ${data.lineCount} training examples.`);
    },
    onError: (err) => toast.error(err.message),
  });

  const exportFullMutation = trpc.library.exportFull.useMutation({
    onSuccess: (data) => {
      const json = JSON.stringify(data, null, 2);
      const blob = new Blob([json], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `document-${documentId}-full.json`;
      a.click();
      URL.revokeObjectURL(url);
      toast.success(`Exported ${data.pages.length} pages.`);
    },
    onError: (err) => toast.error(err.message),
  });

  const { data, isLoading } = trpc.library.listPages.useQuery(
    { documentId, offset, limit: LIMIT },
    { enabled: documentId > 0 && viewMode === "thumbnails" },
  );

  const pages = data?.pages ?? [];
  const total = data?.total ?? 0;

  return (
    <div className="space-y-3">
      {/* Toolbar row */}
      <div className="flex items-center gap-2 flex-wrap">
        {documentIds.length > 1 && (
          <Select value={String(documentId)} onValueChange={v => { setDocumentId(Number(v)); setOffset(0); }}>
            <SelectTrigger className="w-48">
              <SelectValue placeholder="Select batch…" />
            </SelectTrigger>
            <SelectContent>
              {documentIds.map((id, i) => (
                <SelectItem key={id} value={String(id)}>Batch {i + 1} (doc #{id})</SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}

        {/* View mode toggle */}
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

      {viewMode === "regions" ? (
        <RegionsOverview documentId={documentId} onPageClick={setSelectedPageId} />
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
                  <img src={page.rawPngUrl} alt={`Page ${page.pageNumber}`} className="w-full aspect-[3/4] object-cover object-top" />
                ) : (
                  <div className="w-full aspect-[3/4] bg-muted/30 flex items-center justify-center">
                    <FileImage className="w-8 h-8 text-muted-foreground/30" />
                  </div>
                )}
                <div className="p-1.5 space-y-0.5">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-medium">p.{page.pageNumber}</span>
                    <div className="flex items-center gap-1">
                      {page.isFlagged && <Flag className="w-3 h-3 text-amber-400" />}
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

          <div className="flex items-center justify-between pt-1">
            {total > LIMIT ? (
              <>
                <span className="text-xs text-muted-foreground">{total} pages total</span>
                <div className="flex gap-2">
                  <Button size="sm" variant="outline" onClick={() => setOffset(Math.max(0, offset - LIMIT))} disabled={offset === 0} className="h-7 gap-1">
                    <ChevronLeft className="w-3.5 h-3.5" />Prev
                  </Button>
                  <Button size="sm" variant="outline" onClick={() => setOffset(offset + LIMIT)} disabled={offset + LIMIT >= total} className="h-7 gap-1">
                    Next<ChevronRight className="w-3.5 h-3.5" />
                  </Button>
                </div>
              </>
            ) : (
              <span className="text-xs text-muted-foreground">{total} pages total</span>
            )}
            <div className="flex gap-2 ml-auto">
              <Button
                size="sm"
                variant="outline"
                className="gap-1.5 text-xs"
                onClick={() => exportMutation.mutate({ documentId })}
                disabled={exportMutation.isPending || documentId === 0}
              >
                {exportMutation.isPending ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <FileText className="w-3.5 h-3.5" />}
                Export Unsloth JSONL
              </Button>
              <Button
                size="sm"
                variant="outline"
                className="gap-1.5 text-xs"
                onClick={() => exportFullMutation.mutate({ documentId })}
                disabled={exportFullMutation.isPending || documentId === 0}
              >
                {exportFullMutation.isPending ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Code2 className="w-3.5 h-3.5" />}
                Export Full JSON
              </Button>
            </div>
          </div>
        </>
      )}

      {selectedPageId != null && (
        <PageDetailDialog
          pageId={selectedPageId}
          open={true}
          onClose={() => setSelectedPageId(null)}
        />
      )}
    </div>
  );
}

// ── Tree node component ───────────────────────────────────────────────────────

const INDENT: Record<string, number> = { chapter: 0, section: 20, subsection: 40, page: 60 };

function SummaryNode({
  node,
  onEdit,
  onApprove,
  approving,
}: {
  node: TreeNode;
  onEdit: (r: SummaryRecord) => void;
  onApprove: (id: number) => void;
  approving: number | null;
}) {
  const [open, setOpen] = useState(node.levelType !== "page");
  const hasChildren = node.children.length > 0;
  const indent = INDENT[node.levelType] ?? 0;

  return (
    <div>
      <div
        className="flex items-start gap-2 py-2 px-3 rounded-md hover:bg-card/60 group"
        style={{ paddingLeft: `${indent + 12}px` }}
      >
        {/* Expand toggle */}
        <button
          className="mt-0.5 flex-shrink-0 w-4 h-4 text-muted-foreground"
          onClick={() => setOpen(o => !o)}
          disabled={!hasChildren}
          aria-label={open ? "Collapse" : "Expand"}
        >
          {hasChildren
            ? open
              ? <ChevronDown className="w-4 h-4" />
              : <ChevronRight className="w-4 h-4" />
            : <span className="block w-4" />}
        </button>

        {/* Content */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <LevelBadge level={node.levelType} />
            <span className="text-sm font-medium truncate">
              {node.headingText ?? (
                <span className="text-muted-foreground italic">Page {node.startPageNumber}</span>
              )}
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
                <span key={t} className="text-[10px] bg-primary/10 text-primary/70 px-1 rounded">
                  {t}
                </span>
              ))}
              {node.keyTerms.length > 6 && (
                <span className="text-[10px] text-muted-foreground">
                  +{node.keyTerms.length - 6} more
                </span>
              )}
            </div>
          )}
        </div>

        {/* Actions */}
        <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity flex-shrink-0">
          <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => onEdit(node)}>
            <Edit className="w-3.5 h-3.5" />
          </Button>
          {node.summaryStatus === "generated" && (
            <Button
              size="icon"
              variant="ghost"
              className="h-7 w-7 text-green-500 hover:text-green-400"
              onClick={() => onApprove(node.id)}
              disabled={approving === node.id}
              aria-label="Approve"
            >
              {approving === node.id
                ? <Loader2 className="w-3.5 h-3.5 animate-spin" />
                : <Check className="w-3.5 h-3.5" />}
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
            />
          ))}
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

  const { data: docs = [] } = trpc.library.listDocuments.useQuery(undefined);

  // Deduplicate docs by title/filename — one PDF may produce many batch rows.
  // Exclude docs with totalPages=0: these have been purged (pages deleted) or
  // were never fully ingested, so they won't have any summaries to review.
  const groupMap = useMemo(() => {
    const map = new Map<string, { label: string; ids: number[] }>();
    for (const d of docs) {
      if ((d.totalPages ?? 0) === 0) continue;
      const label = d.title ?? d.filename ?? `Document #${d.id}`;
      const existing = map.get(label);
      if (existing) {
        existing.ids.push(d.id);
      } else {
        map.set(label, { label, ids: [d.id] });
      }
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
    onError: (err) => {
      toast.error(err.message);
      setApproving(null);
    },
  });

  const approveAllMutation = trpc.summaries.approveAll.useMutation({
    onError: (err) => toast.error(err.message),
  });

  const handleApproveAll = async () => {
    if (selectedDocIds.length === 0) return;
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
    for (const s of rawSummaries) {
      counts[s.summaryStatus] = (counts[s.summaryStatus] ?? 0) + 1;
    }
    return counts;
  }, [rawSummaries]);

  const generatedCount = stats["generated"] ?? 0;

  const handleApprove = (id: number) => {
    setApproving(id);
    approveMutation.mutate({ id });
  };

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
            <RefreshCw className="w-4 h-4" />
            Refresh
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
              <Button
                variant="outline"
                role="combobox"
                aria-expanded={selectorOpen}
                className="w-full max-w-lg justify-between font-normal text-left h-auto min-h-9 py-2"
              >
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
            <PopoverContent
              className="w-[var(--radix-popover-trigger-width)] max-w-lg p-0"
              align="start"
            >
              <Command>
                <CommandInput placeholder="Search documents…" />
                <CommandList className="max-h-72">
                  <CommandEmpty>No documents found.</CommandEmpty>
                  <CommandGroup>
                    {Array.from(groupMap.entries()).map(([label, group]) => (
                      <CommandItem
                        key={label}
                        value={label}
                        onSelect={() => {
                          setSelectedLabel(label === selectedLabel ? null : label);
                          setSelectorOpen(false);
                        }}
                      >
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

      {/* Stats bar + approve-all */}
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
              <Button
                size="sm"
                variant="outline"
                className="gap-2 text-green-400 border-green-500/30 hover:bg-green-500/10"
                onClick={handleApproveAll}
                disabled={approveAllMutation.isPending}
              >
                {approveAllMutation.isPending
                  ? <Loader2 className="w-4 h-4 animate-spin" />
                  : <Check className="w-4 h-4" />}
                Approve All Generated ({generatedCount})
              </Button>
            </div>
          )}
        </div>
      )}

      {/* Content tabs — shown once a document is selected */}
      {selectedLabel !== null && (
        <Tabs defaultValue="summaries">
          <TabsList>
            <TabsTrigger value="summaries" className="gap-1.5">
              <Layers className="w-3.5 h-3.5" />Summaries
            </TabsTrigger>
            <TabsTrigger value="pages" className="gap-1.5">
              <FileImage className="w-3.5 h-3.5" />Pages
            </TabsTrigger>
          </TabsList>

          <TabsContent value="summaries">
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-base flex items-center gap-2">
                  <Layers className="w-4 h-4 text-primary" />
                  {selectedLabel} — Hierarchy
                </CardTitle>
                {rawSummaries.length > 0 && (
                  <CardDescription>{rawSummaries.length} summary records</CardDescription>
                )}
              </CardHeader>
              <CardContent className="p-0">
                {isLoading ? (
                  <div className="flex items-center justify-center py-16 text-muted-foreground gap-2">
                    <Loader2 className="w-5 h-5 animate-spin" />
                    Loading summaries…
                  </div>
                ) : tree.length === 0 ? (
                  <div className="py-16 text-center text-muted-foreground">
                    <ScrollText className="w-8 h-8 mx-auto mb-3 opacity-30" />
                    <p className="text-sm">No summaries yet for this document.</p>
                    <p className="text-xs mt-1">
                      Run the pipeline to generate content break detection and summaries.
                    </p>
                  </div>
                ) : (
                  <div className="py-2">
                    {tree.map(node => (
                      <SummaryNode
                        key={node.id}
                        node={node}
                        onEdit={setEditTarget}
                        onApprove={handleApprove}
                        approving={approving}
                      />
                    ))}
                  </div>
                )}
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

      {/* Edit dialog */}
      {editTarget !== null && (
        <EditDialog
          node={editTarget}
          open={true}
          onClose={() => setEditTarget(null)}
        />
      )}
    </div>
  );
}
