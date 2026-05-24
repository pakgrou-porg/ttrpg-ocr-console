import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Activity, Clock, CheckCircle2, AlertCircle, Pause, RotateCcw, Loader2,
  Gamepad2, Plus, Trash2, Pencil, Check, X, ChevronDown, ChevronRight,
  BookOpen, Flag, Eye, ImageOff, ChevronLeft, Timer, BarChart2,
} from "lucide-react";
import { PipelineStatusBadge, derivePipelineStatus, PIPELINE_STATUS_CONFIG } from "@/components/PipelineStatusBadge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { ConfidenceBadge } from "@/components/ConfidenceBadge";
import { BboxOverlay } from "@/components/BboxOverlay";
import { fmtMs } from "@/lib/utils";
import { trpc } from "@/lib/trpc";
import { useState, useMemo } from "react";
import { toast } from "sonner";

// ─── Game System Admin ────────────────────────────────────────────────────────

function GameSystemAdmin() {
  const { data: systems, refetch } = trpc.gameSystems.listAll.useQuery();
  const [newName, setNewName] = useState("");
  const [newAbbr, setNewAbbr] = useState("");
  const [editId, setEditId] = useState<number | null>(null);
  const [editName, setEditName] = useState("");
  const [editAbbr, setEditAbbr] = useState("");

  const createMut = trpc.gameSystems.create.useMutation({
    onSuccess: () => { refetch(); setNewName(""); setNewAbbr(""); toast.success("Game system added."); },
    onError: (e) => toast.error(e.message),
  });
  const updateMut = trpc.gameSystems.update.useMutation({
    onSuccess: () => { refetch(); setEditId(null); toast.success("Updated."); },
    onError: (e) => toast.error(e.message),
  });
  const deleteMut = trpc.gameSystems.delete.useMutation({
    onSuccess: () => { refetch(); toast.success("Removed."); },
    onError: (e) => toast.error(e.message),
  });

  const startEdit = (s: { id: number; name: string; abbreviation: string | null }) => {
    setEditId(s.id); setEditName(s.name); setEditAbbr(s.abbreviation ?? "");
  };

  return (
    <Card className="bg-card/50 backdrop-blur-sm border-border/50">
      <CardHeader>
        <CardTitle className="text-2xl flex items-center gap-2">
          <Gamepad2 className="w-5 h-5 text-primary" /> Game Systems
        </CardTitle>
        <CardDescription>Manage the list of game systems available in Summoning Rituals.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex gap-2">
          <Input placeholder="Name (e.g. Dungeons & Dragons 5e)" value={newName} onChange={e => setNewName(e.target.value)}
            onKeyDown={e => e.key === "Enter" && newName.trim() && createMut.mutate({ name: newName.trim(), abbreviation: newAbbr.trim() || undefined })}
            className="bg-background/50" />
          <Input placeholder="Abbrev." value={newAbbr} onChange={e => setNewAbbr(e.target.value)} className="bg-background/50 w-28" />
          <Button size="sm" className="gap-1.5 flex-shrink-0" disabled={!newName.trim() || createMut.isPending}
            onClick={() => createMut.mutate({ name: newName.trim(), abbreviation: newAbbr.trim() || undefined })}>
            <Plus className="w-3.5 h-3.5" /> Add
          </Button>
        </div>
        <div className="space-y-1">
          {systems?.map(s => (
            <div key={s.id} className={`flex items-center gap-2 p-2 rounded-md border ${s.isActive ? "border-border/40 bg-muted/10" : "border-dashed border-border/30 opacity-50"}`}>
              {editId === s.id ? (
                <>
                  <Input value={editName} onChange={e => setEditName(e.target.value)} className="h-7 text-xs bg-background/50 flex-1" />
                  <Input value={editAbbr} onChange={e => setEditAbbr(e.target.value)} placeholder="Abbrev." className="h-7 text-xs bg-background/50 w-20" />
                  <Button size="sm" variant="ghost" className="h-7 w-7 p-0" onClick={() => updateMut.mutate({ id: s.id, name: editName, abbreviation: editAbbr || null })}>
                    <Check className="w-3.5 h-3.5 text-green-500" />
                  </Button>
                  <Button size="sm" variant="ghost" className="h-7 w-7 p-0" onClick={() => setEditId(null)}>
                    <X className="w-3.5 h-3.5" />
                  </Button>
                </>
              ) : (
                <>
                  <span className="flex-1 text-sm">{s.name}</span>
                  {s.abbreviation && <span className="text-xs text-muted-foreground">{s.abbreviation}</span>}
                  <Button size="sm" variant="ghost" className="h-7 w-7 p-0 text-muted-foreground" onClick={() => updateMut.mutate({ id: s.id, isActive: !s.isActive })}>
                    {s.isActive ? <X className="w-3.5 h-3.5" /> : <Check className="w-3.5 h-3.5" />}
                  </Button>
                  <Button size="sm" variant="ghost" className="h-7 w-7 p-0 text-muted-foreground" onClick={() => startEdit(s)}>
                    <Pencil className="w-3.5 h-3.5" />
                  </Button>
                  <Button size="sm" variant="ghost" className="h-7 w-7 p-0 text-destructive hover:text-destructive"
                    onClick={() => { if (confirm(`Remove "${s.name}"?`)) deleteMut.mutate({ id: s.id }); }}>
                    <Trash2 className="w-3.5 h-3.5" />
                  </Button>
                </>
              )}
            </div>
          ))}
        </div>
        <p className="text-xs text-muted-foreground">Inactive systems are hidden in Summoning Rituals. Click ✕ on a row to deactivate it.</p>
      </CardContent>
    </Card>
  );
}

// ─── Page Browser ─────────────────────────────────────────────────────────────

function PageCard({ page, jobId, onFlagged, timing }: {
  page: any; jobId: number; onFlagged: () => void;
  timing?: { total_duration_ms: number; call_count: number };
}) {
  const [flagReason, setFlagReason] = useState("");
  const [showFlagInput, setShowFlagInput] = useState(false);
  const pipelineStatus = derivePipelineStatus(page);
  const flagBlocked = PIPELINE_STATUS_CONFIG[pipelineStatus].blockFlag ?? false;

  const flagMut = trpc.hitl.flag.useMutation({
    onSuccess: () => {
      toast.success(`Page ${page.pageNumber} queued for HITL review.`);
      setShowFlagInput(false);
      setFlagReason("");
      onFlagged();
    },
    onError: (e) => toast.error(e.message),
  });

  const ocr = page.ocr;
  const sd = ocr?.structuredData as any;
  const blocks: any[] = Array.isArray(sd?.content_blocks) ? sd.content_blocks : [];
  const displayText = ocr?.rawText || (blocks.length > 0 ? blocks.map((b: any) => b.text ?? b.content ?? "").join("\n\n") : null);
  const nativeText: string | null = page.nativeText ?? null;
  const regions = page.contentRegions;

  return (
    <div className="border border-border/40 rounded-lg overflow-hidden bg-card/30">
      {/* Header */}
      <div className="flex items-center gap-3 px-4 py-2 bg-muted/20 border-b border-border/40">
        <span className="font-mono text-sm font-medium">
          PDF p.{page.pageNumber}
          {page.printedPageLabel && (
            <span className="ml-1 text-muted-foreground">
              / Doc p.{page.printedPageLabel}
            </span>
          )}
        </span>
        <PipelineStatusBadge page={page} />
        <ConfidenceBadge confidence={page.ocrConfidence} />
        {page.layoutType && (
          <Badge variant="outline" className="text-xs text-muted-foreground">{page.layoutType}</Badge>
        )}
        {page.isFlagged && (
          <Badge variant="outline" className="text-xs text-orange-500 border-orange-500/30 bg-orange-500/10">In HITL</Badge>
        )}
        {timing && (
          <Badge variant="outline" className="text-xs text-muted-foreground gap-1 flex items-center">
            <Timer className="h-2.5 w-2.5" />
            {fmtMs(timing.total_duration_ms)} · {timing.call_count} call{timing.call_count !== 1 ? "s" : ""}
          </Badge>
        )}
        <div className="ml-auto flex items-center gap-2">
          {!page.isFlagged && !showFlagInput && (
            <Button
              size="sm" variant="outline"
              className={`h-7 text-xs gap-1.5 ${flagBlocked
                ? "text-muted-foreground border-border/40 cursor-not-allowed opacity-50"
                : "text-orange-400 border-orange-500/30 hover:bg-orange-500/10"}`}
              title={flagBlocked ? `Cannot flag: page is ${PIPELINE_STATUS_CONFIG[pipelineStatus].label.toLowerCase()} — wait for OCR to complete first` : undefined}
              disabled={flagBlocked}
              onClick={() => !flagBlocked && setShowFlagInput(true)}>
              <Flag className="h-3 w-3" /> Flag for HITL Review
            </Button>
          )}
          {showFlagInput && (
            <div className="flex items-center gap-2">
              <Input
                value={flagReason}
                onChange={e => setFlagReason(e.target.value)}
                placeholder="Reason (optional)…"
                className="h-7 text-xs w-48 bg-background/50"
              />
              <Button size="sm" variant="outline" className="h-7 text-xs" disabled={flagMut.isPending}
                onClick={() => flagMut.mutate({
                  pageId: page.id,
                  ocrResultId: ocr?.id,
                  reason: flagReason.trim() || `Page ${page.pageNumber} — manually flagged from job browser`,
                  priority: "medium",
                })}>
                {flagMut.isPending ? <Loader2 className="h-3 w-3 animate-spin" /> : "Confirm"}
              </Button>
              <Button size="sm" variant="ghost" className="h-7 text-xs" onClick={() => setShowFlagInput(false)}>Cancel</Button>
            </div>
          )}
        </div>
      </div>

      {/* Body: image + tabs */}
      <Tabs defaultValue="text" className="flex gap-0">
        {/* Thumbnail */}
        <div className="w-40 flex-shrink-0 border-r border-border/40 bg-muted/10 flex items-start justify-center p-2">
          {page.rawPngUrl ? (
            <img
              src={page.rawPngUrl}
              alt={`Page ${page.pageNumber}`}
              className="w-full object-contain rounded max-h-48"
              loading="lazy"
            />
          ) : (
            <div className="flex flex-col items-center justify-center h-32 text-muted-foreground/40">
              <ImageOff className="h-8 w-8 mb-1" />
              <span className="text-xs">No image</span>
            </div>
          )}
        </div>

        <div className="flex-1 min-w-0 p-3">
          <TabsList className="h-7 mb-2">
            <TabsTrigger value="text"    className="text-xs h-6 px-2">OCR Text</TabsTrigger>
            <TabsTrigger value="regions" className="text-xs h-6 px-2">Regions</TabsTrigger>
            <TabsTrigger value="json"    className="text-xs h-6 px-2">Raw JSON</TabsTrigger>
            {page.rawPngUrl && (
              <TabsTrigger value="overlay" className="text-xs h-6 px-2">Overlay</TabsTrigger>
            )}
          </TabsList>

          <TabsContent value="text" className="space-y-2">
            <div>
              <p className="text-[10px] text-muted-foreground uppercase tracking-wide mb-1">OCR Extracted Text</p>
              <pre className="text-xs font-mono whitespace-pre-wrap break-words max-h-36 overflow-y-auto text-foreground/80 bg-background/30 rounded p-2 border border-border/30">
                {displayText ?? <span className="text-muted-foreground italic">No OCR text extracted</span>}
              </pre>
            </div>
            {nativeText && (
              <div>
                <p className="text-[10px] text-muted-foreground uppercase tracking-wide mb-1">Native PDF Text</p>
                <pre className="text-xs font-mono whitespace-pre-wrap break-words max-h-36 overflow-y-auto text-foreground/80 bg-background/30 rounded p-2 border border-border/30">
                  {nativeText}
                </pre>
              </div>
            )}
          </TabsContent>

          <TabsContent value="regions">
            <pre className="text-xs font-mono whitespace-pre-wrap break-words max-h-36 overflow-y-auto text-foreground/80 bg-background/30 rounded p-2 border border-border/30">
              {regions ? JSON.stringify(regions, null, 2) : <span className="text-muted-foreground italic">No regions detected</span>}
            </pre>
          </TabsContent>

          <TabsContent value="json">
            <pre className="text-xs font-mono whitespace-pre-wrap break-words max-h-36 overflow-y-auto text-foreground/80 bg-background/30 rounded p-2 border border-border/30">
              {ocr ? JSON.stringify(ocr.structuredData, null, 2) : <span className="text-muted-foreground italic">No OCR result</span>}
            </pre>
          </TabsContent>

          {page.rawPngUrl && (
            <TabsContent value="overlay">
              <BboxOverlay
                imageUrl={page.rawPngUrl}
                regions={Array.isArray(regions) ? regions : []}
                className="max-h-96 overflow-y-auto rounded border border-border/30"
              />
            </TabsContent>
          )}

          {ocr?.pass1Model && (
            <p className="text-xs text-muted-foreground mt-1.5">Model: {ocr.pass1Model}</p>
          )}
        </div>
      </Tabs>
    </div>
  );
}

function JobPageBrowser({ jobId, onClose }: { jobId: number; onClose: () => void }) {
  const [page, setPage] = useState(0);
  const limit = 10;

  const { data: doc } = trpc.library.getByJobId.useQuery({ jobId });
  const { data: result, isLoading, refetch } = trpc.library.browsePagesWithOcr.useQuery(
    { documentId: doc?.id ?? 0, offset: page * limit, limit },
    { enabled: !!doc?.id },
  );
  const { data: pageTiming } = trpc.metrics.pageSummary.useQuery({ jobId });
  const timingMap = useMemo(
    () => new Map((pageTiming ?? []).map((t: any) => [t.page_id, t])),
    [pageTiming],
  );

  const totalPages = result?.total ?? 0;
  const pageCount = Math.max(1, Math.ceil(totalPages / limit));

  if (!doc && !isLoading) {
    return (
      <div className="px-4 py-6 text-sm text-muted-foreground">
        No document found for this job. The pipeline may not have created one yet.
      </div>
    );
  }

  return (
    <div className="border-t border-border/50 bg-muted/5 px-4 py-4 space-y-3">
      {/* Header */}
      <div className="flex items-center gap-3">
        <BookOpen className="h-4 w-4 text-muted-foreground" />
        <span className="text-sm font-medium">
          {doc ? (doc.title ?? doc.filename) : "Loading…"}
        </span>
        {doc && <span className="text-xs text-muted-foreground">· {totalPages} page{totalPages !== 1 ? "s" : ""} in this block</span>}
        <Button size="sm" variant="ghost" className="ml-auto h-7 w-7 p-0 text-muted-foreground" onClick={onClose}>
          <X className="h-4 w-4" />
        </Button>
      </div>

      {/* Page list */}
      {isLoading ? (
        <div className="flex items-center justify-center py-8">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </div>
      ) : (
        <div className="space-y-3">
          {result?.pages.map((p: any) => {
            const timing = timingMap.get(p.id);
            return (
              <PageCard key={p.id} page={p} jobId={jobId} onFlagged={refetch}
                timing={timing ? { total_duration_ms: timing.total_duration_ms, call_count: timing.call_count } : undefined} />
            );
          })}
        </div>
      )}

      {/* Pagination */}
      {pageCount > 1 && (
        <div className="flex items-center gap-2 pt-1">
          <Button size="sm" variant="outline" className="h-7 gap-1 text-xs" disabled={page === 0} onClick={() => setPage(p => p - 1)}>
            <ChevronLeft className="h-3 w-3" /> Prev
          </Button>
          <span className="text-xs text-muted-foreground">Page {page + 1} of {pageCount}</span>
          <Button size="sm" variant="outline" className="h-7 gap-1 text-xs" disabled={page >= pageCount - 1} onClick={() => setPage(p => p + 1)}>
            Next <ChevronRight className="h-3 w-3" />
          </Button>
        </div>
      )}
    </div>
  );
}

// ─── Per-Job Metrics Panel ────────────────────────────────────────────────────

function JobMetricsPanel({ jobId, onClose }: { jobId: number; onClose: () => void }) {
  const { data: rows, isLoading } = trpc.metrics.jobSummary.useQuery({ jobId });

  const totalMs    = rows?.reduce((s: number, r: any) => s + r.total_duration_ms, 0) ?? 0;
  const totalTok   = rows?.reduce((s: number, r: any) => s + r.total_tokens, 0) ?? 0;
  const totalCalls = rows?.reduce((s: number, r: any) => s + r.call_count, 0) ?? 0;

  return (
    <div className="border-t border-border/50 bg-muted/5 px-4 py-4 space-y-3">
      <div className="flex items-center gap-3">
        <BarChart2 className="h-4 w-4 text-muted-foreground" />
        <span className="text-sm font-medium">LLM Timing — JOB-{jobId}</span>
        {!isLoading && rows && (
          <span className="text-xs text-muted-foreground ml-1">
            {totalCalls} calls · {fmtMs(totalMs)} total · {totalTok.toLocaleString()} tokens
          </span>
        )}
        <button className="ml-auto text-muted-foreground hover:text-foreground" onClick={onClose}>
          <X className="h-4 w-4" />
        </button>
      </div>

      {isLoading ? (
        <div className="flex items-center gap-2 py-4 text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" /> Loading metrics…
        </div>
      ) : !rows || rows.length === 0 ? (
        <p className="text-xs text-muted-foreground italic py-2">No metrics recorded yet — metrics are captured during active pipeline runs.</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead>
              <tr className="text-muted-foreground border-b border-border/40">
                <th className="text-left pb-2 pr-4 font-medium">Stage</th>
                <th className="text-left pb-2 pr-4 font-medium">Provider</th>
                <th className="text-right pb-2 pr-4 font-medium">Calls</th>
                <th className="text-right pb-2 pr-4 font-medium">Avg</th>
                <th className="text-right pb-2 pr-4 font-medium">Total</th>
                <th className="text-right pb-2 pr-4 font-medium">Tokens</th>
                <th className="text-right pb-2 font-medium">Fallbacks</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border/20">
              {(rows as any[]).map((r: any, i: number) => (
                <tr key={i} className="hover:bg-muted/10 transition-colors">
                  <td className="py-1.5 pr-4 font-mono">{r.stage}</td>
                  <td className="py-1.5 pr-4 text-muted-foreground">{r.provider_name ?? "—"}</td>
                  <td className="py-1.5 pr-4 text-right tabular-nums">{r.call_count}</td>
                  <td className="py-1.5 pr-4 text-right tabular-nums">{fmtMs(r.avg_duration_ms)}</td>
                  <td className="py-1.5 pr-4 text-right tabular-nums font-medium">{fmtMs(r.total_duration_ms)}</td>
                  <td className="py-1.5 pr-4 text-right tabular-nums">{(r.total_tokens ?? 0).toLocaleString()}</td>
                  <td className={`py-1.5 text-right tabular-nums ${r.fallback_count > 0 ? "text-orange-400" : "text-muted-foreground"}`}>
                    {r.fallback_count}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────

export default function OverseeScribes() {
  const { data: stats, isLoading: statsLoading } = trpc.jobs.stats.useQuery(undefined, { refetchInterval: 10000 });
  const { data: jobs, isLoading: jobsLoading, refetch } = trpc.jobs.list.useQuery(undefined, { refetchInterval: 10000 });

  const [expandedJobId, setExpandedJobId]   = useState<number | null>(null);
  const [browsingJobId, setBrowsingJobId]   = useState<number | null>(null);
  const [metricsJobId, setMetricsJobId]     = useState<number | null>(null);
  const [selectedJobIds, setSelectedJobIds] = useState<Set<number>>(new Set());

  const deleteMut = trpc.jobs.delete.useMutation({
    onSuccess: () => { refetch(); toast.success("Job removed."); },
    onError: (e) => toast.error(e.message),
  });
  const clearMut = trpc.jobs.clear.useMutation({
    onSuccess: () => { refetch(); toast.success("Jobs cleared."); },
    onError: (e) => toast.error(e.message),
  });
  const cancelMut = trpc.jobs.cancel.useMutation({
    onSuccess: () => { refetch(); toast.success("Job chain cancelled."); },
    onError: (e) => toast.error(e.message),
  });
  const purgeMut = trpc.jobs.purgePages.useMutation({
    onSuccess: () => { refetch(); toast.success("Pages purged."); },
    onError: (e) => toast.error(e.message),
  });

  const visibleJobIds: number[] = (jobs as any[] ?? []).map((j: any) => j.id);
  const allSelected = visibleJobIds.length > 0 && visibleJobIds.every(id => selectedJobIds.has(id));
  const someSelected = !allSelected && visibleJobIds.some(id => selectedJobIds.has(id));

  const toggleSelectAll = () => {
    if (allSelected) {
      setSelectedJobIds(new Set());
    } else {
      setSelectedJobIds(new Set(visibleJobIds));
    }
  };

  const toggleSelectJob = (id: number) => {
    setSelectedJobIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  const handleClearSelected = () => {
    if (selectedJobIds.size === 0) return;
    if (!confirm(`Delete ${selectedJobIds.size} selected job${selectedJobIds.size === 1 ? "" : "s"}? This cannot be undone.`)) return;
    const ids = Array.from(selectedJobIds);
    let completed = 0;
    for (const id of ids) {
      deleteMut.mutate({ id }, {
        onSuccess: () => {
          completed++;
          if (completed === ids.length) {
            setSelectedJobIds(new Set());
            toast.success(`${ids.length} job${ids.length === 1 ? "" : "s"} removed.`);
          }
        },
      });
    }
  };

  const statusColors: Record<string, { bg: string; text: string; dot?: boolean }> = {
    queued:            { bg: "bg-muted/50",          text: "text-muted-foreground" },
    processing:        { bg: "bg-blue-500/10",        text: "text-blue-500",   dot: true },
    pass1_layout:      { bg: "bg-yellow-500/10",      text: "text-yellow-500", dot: true },
    pass2_extraction:  { bg: "bg-blue-500/10",        text: "text-blue-500",   dot: true },
    binarization:      { bg: "bg-yellow-500/10",      text: "text-yellow-500", dot: true },
    completed:         { bg: "bg-green-500/10",       text: "text-green-500" },
    failed:            { bg: "bg-red-500/10",         text: "text-red-500" },
    review:            { bg: "bg-orange-500/10",      text: "text-orange-500" },
    hitl_review:       { bg: "bg-orange-500/10",      text: "text-orange-500", dot: true },
  };

  const getStatusStyle = (s: string) => statusColors[s] ?? statusColors.queued;
  const hasFailed   = (jobs ?? []).some((j: any) => j.status === "failed");
  const hasCompleted = (jobs ?? []).some((j: any) => j.status === "completed");

  const FINISHED_STATUSES = new Set(["completed", "failed", "review"]);

  // Split jobs into three buckets:
  //   running  — actively processing (any non-queued, non-finished status)
  //   queued   — waiting for a concurrency slot, FIFO: lowest id (oldest) first
  //   finished — completed / failed / review
  const { runningJobs, queuedJobs, finishedJobs } = useMemo(() => {
    const all = (jobs as any[] ?? []);
    return {
      runningJobs:  all.filter(j => j.status !== "queued" && !FINISHED_STATUSES.has(j.status))
                       .sort((a: any, b: any) => b.id - a.id),
      queuedJobs:   all.filter(j => j.status === "queued")
                       .sort((a: any, b: any) => a.id - b.id),
      finishedJobs: all.filter(j => FINISHED_STATUSES.has(j.status))
                       .sort((a: any, b: any) => b.id - a.id),
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [jobs]);

  const renderJobRow = (job: any) => {
    const style       = getStatusStyle(job.status);
    const progress    = job.totalPages > 0 ? Math.round((job.processedPages / job.totalPages) * 100) : 0;
    const progressColor = job.status === "completed" ? "bg-green-500" : job.status === "failed" ? "bg-red-500" : "bg-blue-500";
    const isErrExpanded = expandedJobId === job.id;
    const isBrowsing  = browsingJobId === job.id;
    const isMetrics   = metricsJobId === job.id;
    const pageOffset  = job.pageOffset ?? 0;
    const blockSize   = job.blockSize  ?? 10;
    const blockLabel  = `pp. ${pageOffset + 1}–${pageOffset + blockSize}`;
    const isChecked   = selectedJobIds.has(job.id);

    return (
      <div key={job.id}>
        <div className="flex items-center gap-3 px-4 py-3 hover:bg-muted/10 transition-colors">
          <Checkbox
            checked={isChecked}
            onCheckedChange={() => toggleSelectJob(job.id)}
            aria-label={`Select JOB-${job.id}`}
            className="flex-shrink-0"
          />
          <span className="font-mono text-sm w-20 flex-shrink-0">JOB-{job.id}</span>

          <div className="flex-1 min-w-0">
            <div className="font-medium text-sm truncate" title={job.sourceFile}>{job.sourceFile}</div>
            <div className="text-xs text-muted-foreground">{blockLabel}</div>
          </div>

          {/* Progress */}
          <div className="flex flex-col gap-1 flex-shrink-0 w-32">
            <div className="flex items-center justify-between text-xs font-mono">
              <span>{job.processedPages ?? 0}/{job.totalPages ?? 0} pp</span>
              <span className="text-muted-foreground">{progress}%</span>
            </div>
            <div className="bg-muted rounded-full h-1.5">
              <div className={`${progressColor} h-1.5 rounded-full transition-all`} style={{ width: `${progress}%` }} />
            </div>
          </div>

          {/* Status */}
          <div className="flex items-center gap-1.5 flex-shrink-0">
            <span className={`inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-medium ${style.bg} ${style.text} border border-current/20`}>
              {style.dot && <span className="w-1.5 h-1.5 rounded-full bg-current animate-pulse" />}
              {job.status.replace(/_/g, " ").replace(/\b\w/g, (c: string) => c.toUpperCase())}
            </span>
            {job.errorMessage && (
              <button onClick={() => setExpandedJobId(isErrExpanded ? null : job.id)} className="text-red-400 hover:text-red-300">
                {isErrExpanded ? <ChevronDown className="w-3.5 h-3.5" /> : <ChevronRight className="w-3.5 h-3.5" />}
              </button>
            )}
          </div>

          {/* Started */}
          <span className="text-xs text-muted-foreground flex-shrink-0 w-32 text-right">
            {job.startedAt ? new Date(job.startedAt).toLocaleString() : "—"}
          </span>

          {/* Actions */}
          <div className="flex items-center gap-1.5 flex-shrink-0">
            <Button size="sm" variant={isBrowsing ? "secondary" : "outline"} className="h-7 text-xs gap-1.5"
              onClick={() => setBrowsingJobId(isBrowsing ? null : job.id)}>
              <Eye className="w-3 h-3" />
              {isBrowsing ? "Close" : "Browse Pages"}
            </Button>
            <Button size="sm" variant={isMetrics ? "secondary" : "outline"} className="h-7 text-xs gap-1.5"
              onClick={() => setMetricsJobId(isMetrics ? null : job.id)}>
              <BarChart2 className="w-3 h-3" />
              {isMetrics ? "Close" : "Metrics"}
            </Button>
            {["queued", "converting", "pass1_ocr", "pass2_ocr", "enriching"].includes(job.status) && (
              <button onClick={() => cancelMut.mutate({ id: job.id })} disabled={cancelMut.isPending}
                title="Cancel job chain" className="text-muted-foreground hover:text-orange-400 transition-colors p-1">
                <Pause className="w-3.5 h-3.5" />
              </button>
            )}
            <button
              onClick={() => { if (confirm(`Purge all pages for JOB-${job.id}?`)) purgeMut.mutate({ id: job.id }); }}
              disabled={purgeMut.isPending} title="Purge pages" className="text-muted-foreground hover:text-yellow-400 transition-colors p-1">
              <RotateCcw className="w-3.5 h-3.5" />
            </button>
            <button onClick={() => deleteMut.mutate({ id: job.id })} disabled={deleteMut.isPending}
              className="text-muted-foreground hover:text-destructive transition-colors p-1" title="Delete job record">
              <Trash2 className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>

        {/* Error expansion */}
        {isErrExpanded && job.errorMessage && (
          <div className="px-4 py-2 bg-red-500/5 border-t border-red-500/20">
            <p className="text-xs font-mono text-red-400 whitespace-pre-wrap break-all">{job.errorMessage}</p>
          </div>
        )}

        {/* Page browser */}
        {isBrowsing && (
          <JobPageBrowser jobId={job.id} onClose={() => setBrowsingJobId(null)} />
        )}

        {/* Metrics panel */}
        {isMetrics && (
          <JobMetricsPanel jobId={job.id} onClose={() => setMetricsJobId(null)} />
        )}
      </div>
    );
  };

  return (
    <div className="space-y-8 animate-in fade-in duration-500">
      <div>
        <h1 className="text-4xl font-bold tracking-tight mb-2 flex items-center gap-3">
          <Activity className="w-10 h-10 text-primary" />
          Oversee the Scribes
        </h1>
        <p className="text-lg text-muted-foreground max-w-3xl">
          Track the status of active ingestion queues, background processes, and the Human-in-the-Loop (HITL) review queue. Ensure the scribes are working efficiently.
        </p>
      </div>

      {/* ── Stats ── */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card className="bg-card/50 backdrop-blur-sm border-border/50">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
              <Clock className="w-4 h-4" /> Active Scribes
            </CardTitle>
          </CardHeader>
          <CardContent>
            {statsLoading ? <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" /> : (
              <>
                <div className="text-3xl font-bold font-mono">{(stats?.active ?? 0) + (stats?.queued ?? 0)}</div>
                <p className="text-xs text-muted-foreground mt-1">{stats?.active ?? 0} processing, {stats?.queued ?? 0} queued</p>
              </>
            )}
          </CardContent>
        </Card>
        <Card className="bg-card/50 backdrop-blur-sm border-border/50">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
              <CheckCircle2 className="w-4 h-4 text-green-500" /> Completed
            </CardTitle>
          </CardHeader>
          <CardContent>
            {statsLoading ? <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" /> : (
              <>
                <div className="text-3xl font-bold font-mono text-green-500">{stats?.completed ?? 0}</div>
                <p className="text-xs text-muted-foreground mt-1">Total completed jobs</p>
              </>
            )}
          </CardContent>
        </Card>
        <Card className="bg-card/50 backdrop-blur-sm border-border/50">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
              <AlertCircle className="w-4 h-4 text-orange-500" /> Scribe Queries (HITL)
            </CardTitle>
          </CardHeader>
          <CardContent>
            {statsLoading ? <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" /> : (
              <>
                <div className="text-3xl font-bold font-mono text-orange-500">
                  {(stats?.total ?? 0) - (stats?.completed ?? 0) - (stats?.failed ?? 0) - (stats?.active ?? 0) - (stats?.queued ?? 0)}
                </div>
                <p className="text-xs text-muted-foreground mt-1">Requires manual review</p>
              </>
            )}
          </CardContent>
        </Card>
      </div>

      {/* ── Transcription Queue ── */}
      <Card className="bg-card/50 backdrop-blur-sm border-border/50">
        <CardHeader className="flex flex-row items-center justify-between">
          <div>
            <CardTitle className="text-2xl">Transcription Queue</CardTitle>
            <CardDescription>Current status of PDF processing batches. Click Browse Pages to inspect any job's output.</CardDescription>
          </div>
          <div className="flex gap-2 flex-wrap items-center">
            {selectedJobIds.size > 0 && (
              <>
                <span className="text-sm text-muted-foreground">{selectedJobIds.size} selected</span>
                <Button variant="outline" size="sm" className="gap-2 text-destructive border-destructive/30 hover:bg-destructive/10"
                  onClick={handleClearSelected} disabled={deleteMut.isPending}>
                  <Trash2 className="w-4 h-4" /> Clear Selected
                </Button>
                <Button variant="ghost" size="sm" className="gap-2 text-muted-foreground"
                  onClick={() => setSelectedJobIds(new Set())}>
                  Deselect All
                </Button>
              </>
            )}
            {hasFailed && (
              <Button variant="outline" size="sm" className="gap-2 text-red-400 border-red-500/30 hover:bg-red-500/10"
                onClick={() => clearMut.mutate({ statuses: ["failed"] })} disabled={clearMut.isPending}>
                <Trash2 className="w-4 h-4" /> Clear Failed
              </Button>
            )}
            {hasCompleted && (
              <Button variant="outline" size="sm" className="gap-2 text-muted-foreground"
                onClick={() => clearMut.mutate({ statuses: ["completed"] })} disabled={clearMut.isPending}>
                <Trash2 className="w-4 h-4" /> Clear Completed
              </Button>
            )}
            <Button variant="outline" size="sm" className="gap-2" onClick={() => refetch()}>
              <RotateCcw className="w-4 h-4" /> Refresh
            </Button>
          </div>
        </CardHeader>
        <CardContent className="p-0">
          {jobsLoading ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="w-8 h-8 animate-spin text-muted-foreground" />
            </div>
          ) : !jobs || jobs.length === 0 ? (
            <div className="text-center py-12 text-muted-foreground px-6">
              <Activity className="w-12 h-12 mx-auto mb-3 opacity-30" />
              <p className="text-lg font-medium">No active jobs</p>
              <p className="text-sm">The scribes are idle. Start a new ingestion from Summoning Rituals.</p>
            </div>
          ) : (
            <div className="divide-y divide-border/50">
              {/* Select-all header row */}
              <div className="flex items-center gap-3 px-4 py-2 bg-muted/10 border-b border-border/50">
                <Checkbox
                  checked={allSelected ? true : someSelected ? "indeterminate" : false}
                  onCheckedChange={toggleSelectAll}
                  aria-label="Select all jobs"
                  className="flex-shrink-0"
                />
                <span className="text-xs text-muted-foreground">Select all</span>
              </div>

              {/* ── Running ─────────────────────────────────────────────────── */}
              {runningJobs.length > 0 && (
                <>
                  <div className="px-4 py-1.5 bg-blue-500/5 border-b border-blue-500/10 flex items-center gap-2">
                    <span className="w-1.5 h-1.5 rounded-full bg-blue-400 animate-pulse flex-shrink-0" />
                    <span className="text-[11px] font-semibold text-blue-400 uppercase tracking-widest">
                      Running · {runningJobs.length}
                    </span>
                  </div>
                  {runningJobs.map(renderJobRow)}
                </>
              )}

              {/* ── Queued ──────────────────────────────────────────────────── */}
              {queuedJobs.length > 0 && (
                <>
                  <div className="px-4 py-1.5 bg-muted/5 border-b border-border/40 flex items-center gap-2">
                    <span className="text-[11px] font-semibold text-muted-foreground uppercase tracking-widest">
                      Queued · {queuedJobs.length}
                    </span>
                    <span className="text-[10px] text-muted-foreground/50 normal-case">
                      ↑ next up
                    </span>
                  </div>
                  {queuedJobs.map(renderJobRow)}
                </>
              )}

              {/* ── Finished ────────────────────────────────────────────────── */}
              {finishedJobs.length > 0 && (
                <>
                  <div className="px-4 py-1.5 bg-muted/5 border-b border-border/30 flex items-center gap-2">
                    <span className="text-[11px] font-semibold text-muted-foreground/50 uppercase tracking-widest">
                      Finished · {finishedJobs.length}
                    </span>
                  </div>
                  {finishedJobs.map(renderJobRow)}
                </>
              )}
            </div>
          )}
        </CardContent>
      </Card>

      <GameSystemAdmin />
    </div>
  );
}
