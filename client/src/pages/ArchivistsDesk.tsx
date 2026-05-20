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

// ─── Image Viewer ───────────────────────────────────────────────────────────

function ImageViewer({ imageUrl, pageNumber }: { imageUrl: string | null | undefined; pageNumber: number }) {
  const [zoom, setZoom] = useState(1);
  const [rotation, setRotation] = useState(0);
  const [isFullscreen, setIsFullscreen] = useState(false);

  if (!imageUrl) {
    return (
      <div className="flex flex-col items-center justify-center h-full bg-muted/10 rounded-lg border border-dashed border-border/50">
        <ImageOff className="w-12 h-12 text-muted-foreground/30 mb-3" />
        <p className="text-sm text-muted-foreground">No image available for page {pageNumber}</p>
      </div>
    );
  }

  const containerClass = isFullscreen
    ? "fixed inset-0 z-50 bg-background/95 backdrop-blur-sm flex flex-col"
    : "flex flex-col h-full";

  return (
    <div className={containerClass}>
      <div className="flex items-center justify-between px-3 py-2 border-b border-border/50 bg-card/50 flex-shrink-0">
        <span className="text-xs font-mono text-muted-foreground">
          Page {pageNumber} &middot; {Math.round(zoom * 100)}%
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
          <Separator orientation="vertical" className="h-4 mx-1" />
          <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => setIsFullscreen(f => !f)}>
            {isFullscreen ? <Minimize2 className="w-3.5 h-3.5" /> : <Maximize2 className="w-3.5 h-3.5" />}
          </Button>
        </div>
      </div>
      <div className="flex-1 overflow-auto bg-muted/5 flex items-center justify-center p-4">
        <img
          src={imageUrl}
          alt={`Page ${pageNumber}`}
          className="max-w-full transition-transform duration-200 shadow-lg rounded"
          style={{ transform: `scale(${zoom}) rotate(${rotation}deg)`, transformOrigin: "center center" }}
          draggable={false}
        />
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
