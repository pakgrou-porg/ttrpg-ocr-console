import { useState, useMemo } from "react";
import { trpc } from "@/lib/trpc";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ConfidenceBadge } from "@/components/ConfidenceBadge";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Separator } from "@/components/ui/separator";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  AlertTriangle, CheckCircle2, ClipboardCheck, Eye, Flag,
  Loader2, SkipForward, ArrowUpCircle, BookOpen, FileText,
  ChevronLeft, ChevronRight, ChevronsLeft, ChevronsRight,
  ZoomIn, ZoomOut, RotateCw, Maximize2, Minimize2, ImageOff,
  Edit3, Search, X, Filter, FastForward,
  Layers, Activity, RefreshCw, LayoutGrid,
} from "lucide-react";
import { toast } from "sonner";

// ─── Types ──────────────────────────────────────────────────────────────────

type HitlStatus = "queued" | "in_progress" | "resolved" | "skipped" | "escalated";
type HitlPriority = "low" | "medium" | "high" | "critical";

// ─── Helper Badges ──────────────────────────────────────────────────────────

function PriorityBadge({ priority }: { priority: string }) {
  const styles: Record<string, string> = {
    critical: "bg-red-500/10 text-red-500 border-red-500/30",
    high: "bg-orange-500/10 text-orange-500 border-orange-500/30",
    medium: "bg-amber-500/10 text-amber-500 border-amber-500/30",
    low: "bg-blue-500/10 text-blue-500 border-blue-500/30",
  };
  return (
    <Badge variant="outline" className={styles[priority] ?? "bg-muted text-muted-foreground"}>
      {priority}
    </Badge>
  );
}

function HitlStatusBadge({ status }: { status: string }) {
  const styles: Record<string, string> = {
    queued: "bg-muted text-muted-foreground",
    in_progress: "bg-blue-500/10 text-blue-500 border-blue-500/30",
    resolved: "bg-green-500/10 text-green-500 border-green-500/30",
    skipped: "bg-slate-500/10 text-slate-500 border-slate-500/30",
    escalated: "bg-red-500/10 text-red-500 border-red-500/30",
  };
  return (
    <Badge variant="outline" className={styles[status] ?? "bg-muted text-muted-foreground"}>
      {status.replace(/_/g, " ")}
    </Badge>
  );
}



// ─── Helpers ────────────────────────────────────────────────────────────────

/** Convert a pipeline workspace filesystem path to a browser-accessible URL.
 *  Strips everything up to and including the workspace directory component so
 *  the path can be served by the /api/pipeline/pages static handler. */
function pipelinePageUrl(fsPath: string | null | undefined): string | null {
  if (!fsPath) return null;
  // Strip leading filesystem prefix up to and including any "workspace/" segment
  const relative = fsPath.replace(/^.*[\\/]workspace[\\/]/, "");
  return `/api/pipeline/pages/${relative}`;
}

// ─── Region overlay colour map ──────────────────────────────────────────────

const REGION_COLORS: Record<string, string> = {
  heading:     "#f59e0b",
  subheading:  "#fbbf24",
  paragraph:   "#3b82f6",
  list:        "#60a5fa",
  sidebar:     "#f97316",
  callout:     "#06b6d4",
  table:       "#8b5cf6",
  stat_block:  "#ec4899",
  illustration:"#10b981",
  map:         "#22c55e",
  graphic:     "#4ade80",
  caption:     "#84cc16",
  header:      "#94a3b8",
  footer:      "#94a3b8",
  page_number: "#64748b",
};

// ─── Image Viewer ───────────────────────────────────────────────────────────

type BboxRegion = { type?: string; regionType?: string; label?: string; bbox: { x: number; y: number; w: number; h: number } };

function ImageViewer({
  imageUrl,
  pageNumber,
  regions,
}: {
  imageUrl: string | null | undefined;
  pageNumber: number;
  regions?: BboxRegion[] | null;
}) {
  const [zoom, setZoom] = useState(1);
  const [rotation, setRotation] = useState(0);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [showRegions, setShowRegions] = useState(false);

  if (!imageUrl) {
    return (
      <div className="flex flex-col items-center justify-center h-full bg-muted/10 rounded-lg border border-dashed border-border/50">
        <ImageOff className="w-12 h-12 text-muted-foreground/30 mb-3" />
        <p className="text-sm text-muted-foreground">No image available for page {pageNumber}</p>
      </div>
    );
  }

  const hasRegions = regions && regions.length > 0;
  const containerClass = isFullscreen
    ? "fixed inset-0 z-50 bg-background/95 backdrop-blur-sm flex flex-col"
    : "flex flex-col h-full";

  return (
    <div className={containerClass}>
      <div className="flex items-center justify-between px-3 py-2 border-b border-border/50 bg-card/50 flex-shrink-0">
        <span className="text-xs font-mono text-muted-foreground">
          Page {pageNumber} &middot; {Math.round(zoom * 100)}%
          {hasRegions && (
            <span className="ml-2 text-muted-foreground/60">{regions.length} region{regions.length !== 1 ? "s" : ""}</span>
          )}
        </span>
        <div className="flex items-center gap-1">
          <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => setZoom(z => Math.max(z - 0.25, 0.25))}>
            <ZoomOut className="w-3.5 h-3.5" />
          </Button>
          <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => setZoom(z => Math.min(z + 0.25, 4))}>
            <ZoomIn className="w-3.5 h-3.5" />
          </Button>
          <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => setRotation(r => (r + 90) % 360)}>
            <RotateCw className="w-3.5 h-3.5" />
          </Button>
          {hasRegions && (
            <>
              <Separator orientation="vertical" className="h-4 mx-1" />
              <Button
                variant="ghost"
                size="icon"
                className={`h-7 w-7 ${showRegions ? "text-violet-400 bg-violet-500/10" : ""}`}
                title="Toggle region overlay"
                onClick={() => setShowRegions(s => !s)}
              >
                <LayoutGrid className="w-3.5 h-3.5" />
              </Button>
            </>
          )}
          <Separator orientation="vertical" className="h-4 mx-1" />
          <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => setIsFullscreen(f => !f)}>
            {isFullscreen ? <Minimize2 className="w-3.5 h-3.5" /> : <Maximize2 className="w-3.5 h-3.5" />}
          </Button>
        </div>
      </div>
      <div className="flex-1 overflow-auto bg-muted/5 flex items-center justify-center p-4">
        {/* Wrapper applies zoom/rotation to both the image and SVG overlay together */}
        <div
          className="relative transition-transform duration-200"
          style={{ transform: `scale(${zoom}) rotate(${rotation}deg)`, transformOrigin: "center center" }}
        >
          <img
            src={imageUrl}
            alt={`Page ${pageNumber}`}
            className="max-w-full shadow-lg rounded block"
            draggable={false}
          />
          {showRegions && hasRegions && (
            <svg
              className="absolute inset-0 w-full h-full pointer-events-none"
              viewBox="0 0 100 100"
              preserveAspectRatio="none"
            >
              {regions.map((r, i) => {
                const rtype = r.type ?? r.regionType ?? "paragraph";
                const color = REGION_COLORS[rtype] ?? "#7c3aed";
                return (
                  <g key={i}>
                    <rect
                      x={r.bbox.x} y={r.bbox.y}
                      width={r.bbox.w} height={r.bbox.h}
                      fill={color + "1a"}
                      stroke={color}
                      strokeWidth="0.8"
                      vectorEffect="non-scaling-stroke"
                    />
                    <text
                      x={r.bbox.x + 0.5}
                      y={r.bbox.y + 3}
                      fontSize="2.5"
                      fill={color}
                      style={{ fontFamily: "monospace", textShadow: "0 0 2px #000" }}
                    >
                      {r.label ?? rtype}
                    </text>
                  </g>
                );
              })}
            </svg>
          )}
        </div>
      </div>
    </div>
  );
}

// ─── Main Component ─────────────────────────────────────────────────────────

export default function ArchivistsDesk() {
  const [statusFilter, setStatusFilter] = useState<HitlStatus | "all">("all");
  const [priorityFilter, setPriorityFilter] = useState<HitlPriority | "all">("all");
  const [selectedItemId, setSelectedItemId] = useState<number | null>(null);
  const [correctedText, setCorrectedText] = useState("");
  const [resolutionNotes, setResolutionNotes] = useState("");
  const [showResolveDialog, setShowResolveDialog] = useState(false);

  const utils = trpc.useUtils();

  // Fetch HITL queue items
  const { data: items, isLoading: itemsLoading } = trpc.hitl.list.useQuery({
    status: statusFilter !== "all" ? statusFilter : undefined,
    priority: priorityFilter !== "all" ? priorityFilter : undefined,
    limit: 200,
  });

  // Fetch HITL stats
  const { data: stats } = trpc.hitl.stats.useQuery();

  // Fetch pipeline + job stats for the metrics dashboard
  const { data: pStats } = trpc.pipeline.stats.useQuery(undefined, { refetchInterval: 15000 });
  const { data: jStats } = trpc.jobs.stats.useQuery(undefined, { refetchInterval: 15000 });

  // Fetch selected item with full context
  const { data: itemDetail, isLoading: detailLoading } = trpc.hitl.get.useQuery(
    { id: selectedItemId! },
    { enabled: !!selectedItemId }
  );

  // Mutations
  const resolveMutation = trpc.hitl.resolve.useMutation({
    onSuccess: () => {
      toast.success("Item resolved and corrections saved.");
      utils.hitl.list.invalidate();
      utils.hitl.stats.invalidate();
      utils.hitl.get.invalidate();
      setShowResolveDialog(false);
      setCorrectedText("");
      setResolutionNotes("");
      // Auto-advance to next item
      advanceToNext();
    },
    onError: (err) => toast.error(`Failed to resolve: ${err.message}`),
  });

  const skipMutation = trpc.hitl.skip.useMutation({
    onSuccess: () => {
      toast.info("Item skipped.");
      utils.hitl.list.invalidate();
      utils.hitl.stats.invalidate();
      advanceToNext();
    },
    onError: (err) => toast.error(`Failed to skip: ${err.message}`),
  });

  const bboxRescanMutation = trpc.pipeline.enqueueBboxRescan.useMutation({
    onSuccess: (data) => {
      toast.success(`Enqueued ${data.enqueued} page${data.enqueued !== 1 ? "s" : ""} for region detection.`);
      utils.hitl.stats.invalidate();
    },
    onError: (err) => toast.error(`Rescan failed: ${err.message}`),
  });

  const escalateMutation = trpc.hitl.escalate.useMutation({
    onSuccess: () => {
      toast.warning("Item escalated for further review.");
      utils.hitl.list.invalidate();
      utils.hitl.stats.invalidate();
      advanceToNext();
    },
    onError: (err) => toast.error(`Failed to escalate: ${err.message}`),
  });

  // Navigate to the next unresolved item
  const advanceToNext = () => {
    if (!items) return;
    const currentIdx = items.findIndex(i => i.id === selectedItemId);
    const next = items.find((i, idx) => idx > currentIdx && (i.status === "queued" || i.status === "in_progress"));
    if (next) {
      setSelectedItemId(next.id);
    } else {
      setSelectedItemId(null);
    }
  };

  // Open resolve dialog with pre-filled text
  const handleStartResolve = () => {
    const displayText = itemDetail?.ocrResult?.correctedText ?? itemDetail?.ocrResult?.rawText ?? "";
    setCorrectedText(displayText);
    setResolutionNotes("");
    setShowResolveDialog(true);
  };

  return (
    <div className="space-y-6 animate-in fade-in duration-500">
      {/* Header */}
      <div>
        <h1 className="text-4xl font-bold tracking-tight mb-2 flex items-center gap-3">
          <ClipboardCheck className="w-10 h-10 text-primary" />
          The Archivist's Desk
        </h1>
        <p className="text-lg text-muted-foreground max-w-3xl">
          Review flagged pages, compare source images with OCR results, and apply corrections to ensure data quality. Your edits feed back into the pipeline for continuous improvement.
        </p>
      </div>

      {/* Pipeline Metrics Dashboard */}
      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-3">
        {/* Jobs */}
        <Card className="bg-card/50 backdrop-blur-sm border-border/50">
          <CardHeader className="pb-1 pt-3 px-3">
            <CardTitle className="text-xs text-muted-foreground uppercase tracking-wide flex items-center gap-1.5">
              <Activity className="w-3.5 h-3.5" /> Jobs
            </CardTitle>
          </CardHeader>
          <CardContent className="px-3 pb-3 grid grid-cols-2 gap-2">
            <div className="text-center">
              <p className="text-xl font-bold text-blue-400">{jStats?.active ?? 0}</p>
              <p className="text-xs text-muted-foreground">Active</p>
              <p className="text-xs text-muted-foreground/60">{jStats?.queued ?? 0} queued</p>
            </div>
            <div className="text-center">
              <p className="text-xl font-bold text-green-400">{jStats?.completed ?? 0}</p>
              <p className="text-xs text-muted-foreground">Completed</p>
            </div>
            <div className="text-center">
              <p className="text-xl font-bold text-red-400">{jStats?.failed ?? 0}</p>
              <p className="text-xs text-muted-foreground">Failed</p>
            </div>
            <div className="text-center">
              <p className="text-xl font-bold">{jStats?.total ?? 0}</p>
              <p className="text-xs text-muted-foreground">Total</p>
            </div>
          </CardContent>
        </Card>

        {/* Pipeline Funnel */}
        <Card className="bg-card/50 backdrop-blur-sm border-border/50">
          <CardHeader className="pb-1 pt-3 px-3">
            <CardTitle className="text-xs text-muted-foreground uppercase tracking-wide flex items-center gap-1.5">
              <Layers className="w-3.5 h-3.5" /> Pipeline Funnel
            </CardTitle>
          </CardHeader>
          <CardContent className="px-3 pb-3 space-y-1.5">
            {/* Header row */}
            <div className="grid grid-cols-[1fr_auto_auto] gap-x-3 text-[10px] text-muted-foreground/60 uppercase tracking-wide pb-0.5 border-b border-border/30">
              <span>Stage</span>
              <span className="text-green-500 text-right">✓ Pass</span>
              <span className="text-red-400 text-right">✗ Fail</span>
            </div>
            {/* Ingested */}
            <div className="grid grid-cols-[1fr_auto_auto] gap-x-3 items-center">
              <span className="text-xs text-muted-foreground">Ingested</span>
              <span className="text-sm font-bold text-right tabular-nums">{pStats?.pages.total ?? 0}</span>
              <span className="text-sm text-right text-muted-foreground/40 tabular-nums">—</span>
            </div>
            {/* Layout Analysis */}
            <div className="grid grid-cols-[1fr_auto_auto] gap-x-3 items-center">
              <span className="text-xs text-muted-foreground">Layout</span>
              <span className="text-sm font-bold text-green-400 text-right tabular-nums">{pStats?.pages.withLayout ?? 0}</span>
              <span className={`text-sm font-bold text-right tabular-nums ${(pStats?.pages.layoutFailed ?? 0) > 0 ? "text-red-400" : "text-muted-foreground/40"}`}>
                {(pStats?.pages.layoutFailed ?? 0) > 0 ? pStats!.pages.layoutFailed : "—"}
              </span>
            </div>
            {/* Bbox / Regions */}
            <div className="grid grid-cols-[1fr_auto_auto] gap-x-3 items-center">
              <div className="flex items-center gap-1">
                <span className="text-xs text-muted-foreground">Regions</span>
                {(pStats?.pages.withRegions ?? 0) < (pStats?.pages.ocrComplete ?? 0) && (
                  <button
                    className="text-[10px] text-amber-400 hover:text-amber-300 underline underline-offset-2 disabled:opacity-50"
                    disabled={bboxRescanMutation.isPending}
                    onClick={() => bboxRescanMutation.mutate()}
                    title="Re-run bbox detection on pages missing regions"
                  >
                    {bboxRescanMutation.isPending ? <Loader2 className="w-2.5 h-2.5 inline animate-spin" /> : "rescan"}
                  </button>
                )}
              </div>
              <span className="text-sm font-bold text-green-400 text-right tabular-nums">{pStats?.pages.withRegions ?? 0}</span>
              <span className={`text-sm font-bold text-right tabular-nums ${(pStats?.pages.bboxFailed ?? 0) > 0 ? "text-red-400" : "text-muted-foreground/40"}`}>
                {(pStats?.pages.bboxFailed ?? 0) > 0 ? pStats!.pages.bboxFailed : "—"}
              </span>
            </div>
            {/* OCR */}
            <div className="grid grid-cols-[1fr_auto_auto] gap-x-3 items-center">
              <span className="text-xs text-muted-foreground">OCR</span>
              <span className="text-sm font-bold text-green-400 text-right tabular-nums">{pStats?.pages.ocrComplete ?? 0}</span>
              <span className={`text-sm font-bold text-right tabular-nums ${(pStats?.pages.ocrFailed ?? 0) > 0 ? "text-red-400" : "text-muted-foreground/40"}`}>
                {(pStats?.pages.ocrFailed ?? 0) > 0 ? pStats!.pages.ocrFailed : "—"}
              </span>
            </div>
            {/* Pending (not yet processed) */}
            {((pStats?.pages.total ?? 0) - (pStats?.pages.processed ?? 0)) > 0 && (
              <div className="grid grid-cols-[1fr_auto_auto] gap-x-3 items-center pt-0.5 border-t border-border/30">
                <span className="text-xs text-muted-foreground/60">Pending</span>
                <span className="text-sm text-amber-400 text-right tabular-nums col-span-2">
                  {(pStats?.pages.total ?? 0) - (pStats?.pages.processed ?? 0)}
                </span>
              </div>
            )}
          </CardContent>
        </Card>

        {/* OCR Quality */}
        <Card className="bg-card/50 backdrop-blur-sm border-border/50">
          <CardHeader className="pb-1 pt-3 px-3">
            <CardTitle className="text-xs text-muted-foreground uppercase tracking-wide flex items-center gap-1.5">
              <Activity className="w-3.5 h-3.5" /> OCR Quality
            </CardTitle>
          </CardHeader>
          <CardContent className="px-3 pb-3 space-y-1.5">
            <div className="flex justify-between items-center">
              <span className="text-xs text-green-400">High ≥80%</span>
              <span className="text-sm font-bold text-green-400">{pStats?.pages.highConf ?? 0}</span>
            </div>
            <div className="flex justify-between items-center">
              <span className="text-xs text-amber-400">Med 50–79%</span>
              <span className="text-sm font-bold text-amber-400">{pStats?.pages.medConf ?? 0}</span>
            </div>
            <div className="flex justify-between items-center">
              <span className="text-xs text-red-400">Low &lt;50%</span>
              <span className="text-sm font-bold text-red-400">{pStats?.pages.lowConf ?? 0}</span>
            </div>
            <div className="flex justify-between items-center">
              <span className="text-xs text-muted-foreground">No Score</span>
              <span className="text-sm font-bold">{pStats?.pages.noScore ?? 0}</span>
            </div>
            <div className="flex justify-between items-center">
              <span className="text-xs text-red-500">OCR Errors</span>
              <span className="text-sm font-bold text-red-500">{pStats?.pages.errorState ?? 0}</span>
            </div>
          </CardContent>
        </Card>

        {/* Review & Rescan */}
        <Card className="bg-card/50 backdrop-blur-sm border-border/50">
          <CardHeader className="pb-1 pt-3 px-3">
            <CardTitle className="text-xs text-muted-foreground uppercase tracking-wide flex items-center gap-1.5">
              <RefreshCw className="w-3.5 h-3.5" /> Review & Rescan
            </CardTitle>
          </CardHeader>
          <CardContent className="px-3 pb-3 space-y-1.5">
            <div className="flex justify-between items-center">
              <span className="text-xs text-muted-foreground">HITL Pending</span>
              <span className="text-sm font-bold">{pStats?.hitl.queued ?? 0}</span>
            </div>
            <div className="flex justify-between items-center">
              <span className="text-xs text-blue-400">Under Review</span>
              <span className="text-sm font-bold text-blue-400">{pStats?.hitl.inProgress ?? 0}</span>
            </div>
            <div className="flex justify-between items-center">
              <span className="text-xs text-green-400">HITL Resolved</span>
              <span className="text-sm font-bold text-green-400">{pStats?.hitl.resolved ?? 0}</span>
            </div>
            <div className="flex justify-between items-center">
              <span className="text-xs text-amber-400">Rescan Queued</span>
              <span className="text-sm font-bold text-amber-400">{pStats?.retry.pendingQueue ?? 0}</span>
            </div>
            <div className="flex justify-between items-center">
              <span className="text-xs text-violet-400">Rescanning</span>
              <span className="text-sm font-bold text-violet-400">{pStats?.retry.running ?? 0}</span>
            </div>
            <div className="flex justify-between items-center">
              <span className="text-xs text-green-400">Corrections Saved</span>
              <span className="text-sm font-bold text-green-400">{pStats?.pages.savedCorrections ?? 0}</span>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Stats Bar */}
      {stats && (
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
          <StatCard label="Total" value={stats.total} />
          <StatCard label="Queued" value={stats.queued} color="text-muted-foreground" />
          <StatCard label="In Progress" value={stats.inProgress} color="text-blue-500" />
          <StatCard label="Resolved" value={stats.resolved} color="text-green-500" />
          <StatCard label="Critical" value={stats.byCritical} color="text-red-500" />
          <StatCard label="High Priority" value={stats.byHigh} color="text-orange-500" />
        </div>
      )}

      {/* Filters + Next Unreviewed CTA */}
      <div className="flex items-center gap-3 flex-wrap">
        {/* Next Unreviewed — prominent CTA */}
        {(() => {
          const nextUnreviewed = items?.find(i => i.status === "queued" || i.status === "in_progress");
          const unreviewedCount = items?.filter(i => i.status === "queued" || i.status === "in_progress").length ?? 0;
          return nextUnreviewed ? (
            <Button
              className="gap-2 h-9 bg-primary hover:bg-primary/90 shadow-[0_0_12px_rgba(139,92,246,0.3)] hover:shadow-[0_0_18px_rgba(139,92,246,0.45)] transition-all"
              onClick={() => setSelectedItemId(nextUnreviewed.id)}
            >
              <FastForward className="w-4 h-4" />
              Next Unreviewed
              <Badge variant="secondary" className="ml-0.5 bg-white/20 text-white border-0 text-xs">
                {unreviewedCount}
              </Badge>
            </Button>
          ) : (
            <Button variant="outline" className="gap-2 h-9" disabled>
              <CheckCircle2 className="w-4 h-4 text-green-500" />
              All Reviewed
            </Button>
          );
        })()}

        <Separator orientation="vertical" className="h-6" />

        <div className="flex items-center gap-2">
          <Filter className="w-4 h-4 text-muted-foreground" />
          <span className="text-sm text-muted-foreground">Filters:</span>
        </div>
        <Select value={statusFilter} onValueChange={(v) => setStatusFilter(v as any)}>
          <SelectTrigger className="w-40 h-9">
            <SelectValue placeholder="Status" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Statuses</SelectItem>
            <SelectItem value="queued">Queued</SelectItem>
            <SelectItem value="in_progress">In Progress</SelectItem>
            <SelectItem value="resolved">Resolved</SelectItem>
            <SelectItem value="skipped">Skipped</SelectItem>
            <SelectItem value="escalated">Escalated</SelectItem>
          </SelectContent>
        </Select>
        <Select value={priorityFilter} onValueChange={(v) => setPriorityFilter(v as any)}>
          <SelectTrigger className="w-40 h-9">
            <SelectValue placeholder="Priority" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Priorities</SelectItem>
            <SelectItem value="critical">Critical</SelectItem>
            <SelectItem value="high">High</SelectItem>
            <SelectItem value="medium">Medium</SelectItem>
            <SelectItem value="low">Low</SelectItem>
          </SelectContent>
        </Select>
        <span className="text-xs text-muted-foreground ml-auto">
          {items?.length ?? 0} items
        </span>
      </div>

      {/* Main Content: Queue List + Review Pane */}
      <div className="flex gap-4 h-[calc(100vh-380px)]">
        {/* Queue List (left sidebar) */}
        <Card className="w-80 flex-shrink-0 bg-card/50 backdrop-blur-sm border-border/50">
          <CardHeader className="pb-2 pt-3 px-3">
            <CardTitle className="text-sm">Review Queue</CardTitle>
          </CardHeader>
          <CardContent className="px-2 pb-2">
            <ScrollArea className="h-[calc(100vh-480px)]">
              {itemsLoading ? (
                <div className="flex items-center justify-center py-8">
                  <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" />
                </div>
              ) : !items || items.length === 0 ? (
                <div className="text-center py-8 text-muted-foreground">
                  <CheckCircle2 className="w-8 h-8 mx-auto mb-2 opacity-40" />
                  <p className="text-sm">No items in the queue.</p>
                  <p className="text-xs opacity-60 mt-1">
                    {statusFilter !== "all" || priorityFilter !== "all"
                      ? "Try adjusting your filters."
                      : "Pages will appear here when flagged by the OCR pipeline."}
                  </p>
                </div>
              ) : (
                <div className="space-y-1">
                  {items.map((item) => (
                    <button
                      key={item.id}
                      onClick={() => setSelectedItemId(item.id)}
                      className={`w-full text-left p-2.5 rounded-lg border transition-all duration-200 ${
                        selectedItemId === item.id
                          ? "bg-primary/10 border-primary/40 shadow-[0_0_8px_rgba(139,92,246,0.15)]"
                          : "bg-card/50 border-border/30 hover:bg-card/80 hover:border-border"
                      }`}
                    >
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0 flex-1">
                          <p className="text-xs font-medium truncate">{item.documentTitle}</p>
                          <p className="text-xs text-muted-foreground">
                            Page {item.pageNumber ?? "?"}
                          </p>
                          <p className="text-xs text-muted-foreground/70 truncate mt-0.5">
                            {item.reason}
                          </p>
                        </div>
                        <div className="flex flex-col items-end gap-1 flex-shrink-0">
                          <PriorityBadge priority={item.priority} />
                          <HitlStatusBadge status={item.status} />
                        </div>
                      </div>
                    </button>
                  ))}
                </div>
              )}
            </ScrollArea>
          </CardContent>
        </Card>

        {/* Review Pane (center + right) */}
        {selectedItemId && itemDetail ? (
          <div className="flex-1 flex flex-col gap-3 overflow-hidden">
            {/* Item Header */}
            <div className="flex items-center justify-between flex-shrink-0 px-1">
              <div className="flex items-center gap-3">
                <div>
                  <p className="font-semibold text-sm">
                    {itemDetail.document?.title ?? itemDetail.document?.filename ?? "Unknown Document"}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    Page {itemDetail.page?.pageNumber ?? "?"} &middot; HITL #{itemDetail.item.id}
                  </p>
                </div>
                <PriorityBadge priority={itemDetail.item.priority} />
                <HitlStatusBadge status={itemDetail.item.status} />
                {itemDetail.ocrResult && (
                  <ConfidenceBadge confidence={itemDetail.ocrResult.confidence} />
                )}
              </div>
              <div className="flex items-center gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  className="gap-1.5 text-xs"
                  onClick={() => skipMutation.mutate({ id: selectedItemId, resolutionNotes: "Skipped during review" })}
                  disabled={skipMutation.isPending || itemDetail.item.status === "resolved"}
                >
                  <SkipForward className="w-3.5 h-3.5" />
                  Skip
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  className="gap-1.5 text-xs text-red-500 border-red-500/30 hover:bg-red-500/10"
                  onClick={() => escalateMutation.mutate({ id: selectedItemId, resolutionNotes: "Escalated during review" })}
                  disabled={escalateMutation.isPending || itemDetail.item.status === "resolved"}
                >
                  <ArrowUpCircle className="w-3.5 h-3.5" />
                  Escalate
                </Button>
                <Button
                  size="sm"
                  className="gap-1.5 text-xs"
                  onClick={handleStartResolve}
                  disabled={itemDetail.item.status === "resolved"}
                >
                  <CheckCircle2 className="w-3.5 h-3.5" />
                  Resolve & Correct
                </Button>
              </div>
            </div>

            {/* Reason */}
            <div className="px-1">
              <div className="flex items-start gap-2 p-2.5 rounded-lg bg-amber-500/5 border border-amber-500/20">
                <AlertTriangle className="w-4 h-4 text-amber-500 flex-shrink-0 mt-0.5" />
                <div>
                  <p className="text-xs font-medium text-amber-500">Flag Reason</p>
                  <p className="text-xs text-muted-foreground">{itemDetail.item.reason}</p>
                </div>
              </div>
            </div>

            {/* Split Pane: Image + OCR */}
            <div className="flex-1 flex gap-3 overflow-hidden">
              {/* Image */}
              <div className="flex-1 rounded-lg border border-border/50 overflow-hidden bg-card/30">
                {itemDetail.page ? (
                  <ImageViewer
                    imageUrl={
                      pipelinePageUrl(itemDetail.page.preprocessedPngUrl) ??
                      pipelinePageUrl(itemDetail.page.rawPngUrl)
                    }
                    pageNumber={itemDetail.page.pageNumber}
                    regions={itemDetail.page.contentRegions as BboxRegion[] | null}
                  />
                ) : (
                  <div className="flex items-center justify-center h-full text-muted-foreground">
                    <ImageOff className="w-10 h-10 opacity-30" />
                  </div>
                )}
              </div>

              {/* OCR Data */}
              <div className="w-[400px] flex-shrink-0 rounded-lg border border-border/50 overflow-hidden bg-card/30">
                <ScrollArea className="h-full">
                  <div className="p-4 space-y-4">
                    {itemDetail.ocrResult ? (
                      <>
                        {/* Model info */}
                        {(itemDetail.ocrResult.pass1Model || itemDetail.ocrResult.pass2Model) && (
                          <div className="flex flex-wrap gap-2 text-xs">
                            {itemDetail.ocrResult.pass1Model && (
                              <span className="px-2 py-1 rounded bg-muted/30 border border-border/50">
                                Pass 1: {itemDetail.ocrResult.pass1Model}
                              </span>
                            )}
                            {itemDetail.ocrResult.pass2Model && (
                              <span className="px-2 py-1 rounded bg-muted/30 border border-border/50">
                                Pass 2: {itemDetail.ocrResult.pass2Model}
                              </span>
                            )}
                          </div>
                        )}

                        {/* Extracted Text */}
                        <div>
                          <h4 className="text-sm font-semibold mb-2 flex items-center gap-2">
                            <FileText className="w-4 h-4 text-muted-foreground" />
                            {itemDetail.ocrResult.correctedText ? "Corrected Text" : "Extracted Text"}
                          </h4>
                          <div className="p-3 rounded-lg bg-muted/10 border border-border/50 whitespace-pre-wrap font-mono text-sm leading-relaxed max-h-[300px] overflow-y-auto">
                            {itemDetail.ocrResult.correctedText ?? itemDetail.ocrResult.rawText ?? (
                              <span className="text-muted-foreground italic">No text extracted</span>
                            )}
                          </div>
                        </div>

                        {/* Structured Data */}
                        {itemDetail.ocrResult.structuredData && Object.keys(itemDetail.ocrResult.structuredData).length > 0 && (
                          <div>
                            <h4 className="text-sm font-semibold mb-2 flex items-center gap-2">
                              <Eye className="w-4 h-4 text-muted-foreground" />
                              Structured Data
                            </h4>
                            <div className="p-3 rounded-lg bg-muted/10 border border-border/50 overflow-x-auto">
                              <pre className="text-xs font-mono whitespace-pre-wrap">
                                {JSON.stringify(itemDetail.ocrResult.structuredData, null, 2)}
                              </pre>
                            </div>
                          </div>
                        )}
                      </>
                    ) : (
                      <div className="flex flex-col items-center justify-center py-12 text-muted-foreground">
                        <FileText className="w-10 h-10 opacity-30 mb-3" />
                        <p className="text-sm">No OCR data available.</p>
                      </div>
                    )}
                  </div>
                </ScrollArea>
              </div>
            </div>
          </div>
        ) : detailLoading ? (
          <div className="flex-1 flex items-center justify-center">
            <Loader2 className="w-8 h-8 animate-spin text-muted-foreground" />
          </div>
        ) : (
          <div className="flex-1 flex flex-col items-center justify-center text-muted-foreground">
            <ClipboardCheck className="w-16 h-16 opacity-20 mb-4" />
            <p className="text-lg font-medium">Select an item from the queue</p>
            <p className="text-sm opacity-60 mt-1">
              Choose a flagged page to review, compare the source image with OCR results, and apply corrections.
            </p>
          </div>
        )}
      </div>

      {/* Resolve Dialog */}
      <Dialog open={showResolveDialog} onOpenChange={setShowResolveDialog}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <CheckCircle2 className="w-5 h-5 text-green-500" />
              Resolve & Apply Corrections
            </DialogTitle>
            <DialogDescription>
              Edit the extracted text below. Your corrections will be saved to the OCR result and used for pipeline improvement.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <label className="text-sm font-medium mb-1.5 block">Corrected Text</label>
              <Textarea
                value={correctedText}
                onChange={(e) => setCorrectedText(e.target.value)}
                className="min-h-[250px] font-mono text-sm bg-muted/20"
                placeholder="Edit the extracted text..."
              />
            </div>
            <div>
              <label className="text-sm font-medium mb-1.5 block">Resolution Notes (optional)</label>
              <Textarea
                value={resolutionNotes}
                onChange={(e) => setResolutionNotes(e.target.value)}
                className="min-h-[80px] text-sm bg-muted/20"
                placeholder="Describe what was corrected and why..."
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowResolveDialog(false)}>
              Cancel
            </Button>
            <Button
              onClick={() => {
                if (selectedItemId) {
                  resolveMutation.mutate({
                    id: selectedItemId,
                    correctedText,
                    resolutionNotes,
                  });
                }
              }}
              disabled={resolveMutation.isPending}
              className="gap-1.5"
            >
              {resolveMutation.isPending ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <CheckCircle2 className="w-4 h-4" />
              )}
              Save & Resolve
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

// ─── Stat Card ──────────────────────────────────────────────────────────────

function StatCard({ label, value, color }: { label: string; value: number; color?: string }) {
  return (
    <Card className="bg-card/50 backdrop-blur-sm border-border/50">
      <CardContent className="p-3 text-center">
        <p className={`text-2xl font-bold ${color ?? "text-foreground"}`}>{value}</p>
        <p className="text-xs text-muted-foreground">{label}</p>
      </CardContent>
    </Card>
  );
}
