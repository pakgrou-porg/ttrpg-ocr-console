import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  CheckCircle2, ClipboardCheck, Loader2, Activity, Layers, RefreshCw,
  Filter, ExternalLink,
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

// ─── Pipeline Funnel ────────────────────────────────────────────────────────

type PipelineStatsData = {
  pages: {
    total: number; withLayout: number; withRegions: number; ocrComplete: number;
    highConf: number; medConf: number; lowConf: number; noScore: number;
    errorState: number; savedCorrections: number; processed: number;
    layoutFailed: number; bboxFailed: number; ocrFailed: number;
  };
  hitl: { queued: number; inProgress: number; resolved: number; skipped: number; total: number };
  retry: { pendingQueue: number; running: number; failed: number; succeeded: number };
  docs: { total: number; layoutDone: number; regionsDone: number; ocrDone: number };
} | undefined;

interface FunnelStage {
  name: string;
  pages: number;
  docs: number | null;
  barColor: string;
  failCount?: number;
}

function PipelineFunnel({ pStats }: { pStats: PipelineStatsData }) {
  const totalPages = pStats?.pages.total ?? 0;
  const totalDocs  = pStats?.docs?.total ?? 0;
  const pct = (n: number, d: number) => (d > 0 ? Math.round((n / d) * 100) : 0);

  const stages: FunnelStage[] = [
    {
      name: "Ingested",
      pages: totalPages,
      docs: totalDocs,
      barColor: "bg-slate-400",
    },
    {
      name: "Layout Analysis",
      pages: pStats?.pages.withLayout ?? 0,
      docs: pStats?.docs?.layoutDone ?? null,
      barColor: "bg-blue-500",
      failCount: pStats?.pages.layoutFailed,
    },
    {
      name: "Region Detection",
      pages: pStats?.pages.withRegions ?? 0,
      docs: pStats?.docs?.regionsDone ?? null,
      barColor: "bg-violet-500",
      failCount: pStats?.pages.bboxFailed,
    },
    {
      name: "OCR Complete",
      pages: pStats?.pages.ocrComplete ?? 0,
      docs: pStats?.docs?.ocrDone ?? null,
      barColor: "bg-green-500",
      failCount: pStats?.pages.ocrFailed,
    },
    {
      name: "HITL In Review",
      pages: (pStats?.hitl.queued ?? 0) + (pStats?.hitl.inProgress ?? 0),
      docs: null,
      barColor: "bg-amber-500",
    },
  ];

  const ocrDone    = pStats?.pages.ocrComplete ?? 0;
  const highConf   = pStats?.pages.highConf ?? 0;
  const medConf    = pStats?.pages.medConf ?? 0;
  const lowConf    = pStats?.pages.lowConf ?? 0;

  return (
    <Card className="flex-1 bg-card/50 backdrop-blur-sm border-border/50 overflow-hidden flex flex-col">
      <CardHeader className="pb-2 pt-3 px-4 border-b border-border/50 flex-shrink-0">
        <CardTitle className="text-sm flex items-center gap-2">
          <Layers className="w-4 h-4 text-primary" />
          Pipeline Progress
        </CardTitle>
      </CardHeader>
      <CardContent className="p-4 flex-1 overflow-auto">
        <div className="space-y-5">
          {/* Column headers */}
          <div className="grid grid-cols-[200px_1fr_96px_96px] gap-3 text-[10px] text-muted-foreground/60 uppercase tracking-wide pb-1 border-b border-border/30">
            <span>Stage</span>
            <span>Pages</span>
            <span className="text-right">Count / %</span>
            <span className="text-right">Docs / %</span>
          </div>

          {/* Stage rows */}
          {stages.map((stage) => {
            const pagePct = pct(stage.pages, totalPages);
            const docPct  = stage.docs !== null ? pct(stage.docs, totalDocs) : null;

            return (
              <div key={stage.name} className="grid grid-cols-[200px_1fr_96px_96px] gap-3 items-center">
                {/* Stage name + optional fail pill */}
                <div className="flex items-center gap-2 min-w-0">
                  <span className="text-xs font-medium truncate">{stage.name}</span>
                  {(stage.failCount ?? 0) > 0 && (
                    <span className="text-[10px] text-red-400 bg-red-500/10 border border-red-500/20 rounded px-1.5 py-0.5 flex-shrink-0">
                      {stage.failCount} failed
                    </span>
                  )}
                </div>

                {/* Progress bar */}
                <div className="h-2.5 bg-muted/20 rounded-full overflow-hidden">
                  <div
                    className={`h-full ${stage.barColor} rounded-full transition-all duration-700`}
                    style={{ width: `${pagePct}%` }}
                  />
                </div>

                {/* Pages */}
                <div className="text-right leading-tight">
                  <span className="text-sm font-bold tabular-nums">{stage.pages.toLocaleString()}</span>
                  <span className="text-[10px] text-muted-foreground ml-1">({pagePct}%)</span>
                </div>

                {/* Docs */}
                <div className="text-right leading-tight">
                  {docPct !== null ? (
                    <>
                      <span className="text-sm font-bold tabular-nums">{(stage.docs ?? 0).toLocaleString()}</span>
                      <span className="text-[10px] text-muted-foreground ml-1">({docPct}%)</span>
                    </>
                  ) : (
                    <span className="text-xs text-muted-foreground/40">—</span>
                  )}
                </div>
              </div>
            );
          })}

          {/* OCR Confidence Distribution (only when pages have completed OCR) */}
          {ocrDone > 0 && (
            <div className="mt-2 pt-4 border-t border-border/30 space-y-2.5">
              <p className="text-[10px] text-muted-foreground/60 uppercase tracking-wide">
                OCR Confidence Distribution ({ocrDone.toLocaleString()} pages)
              </p>
              <div className="h-3 bg-muted/20 rounded-full overflow-hidden flex">
                <div
                  className="bg-green-500 h-full transition-all duration-700"
                  style={{ width: `${pct(highConf, ocrDone)}%` }}
                />
                <div
                  className="bg-amber-500 h-full transition-all duration-700"
                  style={{ width: `${pct(medConf, ocrDone)}%` }}
                />
                <div
                  className="bg-red-500 h-full transition-all duration-700"
                  style={{ width: `${pct(lowConf, ocrDone)}%` }}
                />
              </div>
              <div className="flex flex-wrap gap-4 text-xs">
                <span className="text-green-400">
                  High ≥80: {highConf.toLocaleString()} ({pct(highConf, ocrDone)}%)
                </span>
                <span className="text-amber-400">
                  Med 50–79: {medConf.toLocaleString()} ({pct(medConf, ocrDone)}%)
                </span>
                <span className="text-red-400">
                  Low &lt;50: {lowConf.toLocaleString()} ({pct(lowConf, ocrDone)}%)
                </span>
                {(pStats?.pages.errorState ?? 0) > 0 && (
                  <span className="text-red-500">
                    Errors: {pStats!.pages.errorState}
                  </span>
                )}
              </div>
            </div>
          )}

          {/* HITL summary */}
          {(pStats?.hitl.total ?? 0) > 0 && (
            <div className="mt-2 pt-4 border-t border-border/30 space-y-2.5">
              <p className="text-[10px] text-muted-foreground/60 uppercase tracking-wide">HITL Queue</p>
              <div className="flex flex-wrap gap-4 text-xs">
                <span className="text-muted-foreground">
                  Queued: <span className="font-bold text-foreground">{pStats?.hitl.queued}</span>
                </span>
                <span className="text-blue-400">
                  In Review: <span className="font-bold">{pStats?.hitl.inProgress}</span>
                </span>
                <span className="text-green-400">
                  Resolved: <span className="font-bold">{pStats?.hitl.resolved}</span>
                </span>
                <span className="text-muted-foreground">
                  Skipped: <span className="font-bold text-foreground">{pStats?.hitl.skipped}</span>
                </span>
                {(pStats?.pages.savedCorrections ?? 0) > 0 && (
                  <span className="text-green-400">
                    Corrections Saved: <span className="font-bold">{pStats!.pages.savedCorrections}</span>
                  </span>
                )}
              </div>
            </div>
          )}

          {/* Empty state */}
          {totalPages === 0 && (
            <div className="flex flex-col items-center justify-center py-16 text-muted-foreground">
              <Layers className="w-12 h-12 opacity-20 mb-3" />
              <p className="text-sm">No pages ingested yet.</p>
              <p className="text-xs opacity-60 mt-1">Start an ingestion job to see pipeline progress.</p>
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
}

// ─── Main Component ─────────────────────────────────────────────────────────

export default function ArchivistsDesk() {
  const [statusFilter, setStatusFilter] = useState<HitlStatus | "all">("all");
  const [priorityFilter, setPriorityFilter] = useState<HitlPriority | "all">("all");

  const utils = trpc.useUtils();

  const { data: items, isLoading: itemsLoading } = trpc.hitl.list.useQuery({
    status: statusFilter !== "all" ? statusFilter : undefined,
    priority: priorityFilter !== "all" ? priorityFilter : undefined,
    limit: 200,
  });

  const { data: stats } = trpc.hitl.stats.useQuery();
  const { data: pStats } = trpc.pipeline.stats.useQuery(undefined, { refetchInterval: 15000 });
  const { data: jStats } = trpc.jobs.stats.useQuery(undefined, { refetchInterval: 15000 });

  const bboxRescanMutation = trpc.pipeline.enqueueBboxRescan.useMutation({
    onSuccess: (data) => {
      toast.success(`Enqueued ${data.enqueued} page${data.enqueued !== 1 ? "s" : ""} for region detection.`);
      utils.hitl.stats.invalidate();
    },
    onError: (err) => toast.error(`Rescan failed: ${err.message}`),
  });

  return (
    <div className="space-y-6 animate-in fade-in duration-500">
      {/* Header */}
      <div>
        <h1 className="text-4xl font-bold tracking-tight mb-2 flex items-center gap-3">
          <ClipboardCheck className="w-10 h-10 text-primary" />
          The Archivist's Desk
        </h1>
        <p className="text-lg text-muted-foreground max-w-3xl">
          Monitor the pipeline's progress across all stages. Use the Trials of Truth console for hands-on page review and correction.
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

        {/* Stage Errors */}
        <Card className="bg-card/50 backdrop-blur-sm border-border/50">
          <CardHeader className="pb-1 pt-3 px-3">
            <CardTitle className="text-xs text-muted-foreground uppercase tracking-wide flex items-center gap-1.5">
              <Layers className="w-3.5 h-3.5" /> Stage Errors
            </CardTitle>
          </CardHeader>
          <CardContent className="px-3 pb-3 space-y-1.5">
            <div className="grid grid-cols-[1fr_auto_auto] gap-x-3 text-[10px] text-muted-foreground/60 uppercase tracking-wide pb-0.5 border-b border-border/30">
              <span>Stage</span>
              <span className="text-green-500 text-right">✓ Pass</span>
              <span className="text-red-400 text-right">✗ Fail</span>
            </div>
            <div className="grid grid-cols-[1fr_auto_auto] gap-x-3 items-center">
              <span className="text-xs text-muted-foreground">Ingested</span>
              <span className="text-sm font-bold text-right tabular-nums">{pStats?.pages.total ?? 0}</span>
              <span className="text-sm text-right text-muted-foreground/40 tabular-nums">—</span>
            </div>
            <div className="grid grid-cols-[1fr_auto_auto] gap-x-3 items-center">
              <span className="text-xs text-muted-foreground">Layout</span>
              <span className="text-sm font-bold text-green-400 text-right tabular-nums">{pStats?.pages.withLayout ?? 0}</span>
              <span className={`text-sm font-bold text-right tabular-nums ${(pStats?.pages.layoutFailed ?? 0) > 0 ? "text-red-400" : "text-muted-foreground/40"}`}>
                {(pStats?.pages.layoutFailed ?? 0) > 0 ? pStats!.pages.layoutFailed : "—"}
              </span>
            </div>
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
            <div className="grid grid-cols-[1fr_auto_auto] gap-x-3 items-center">
              <span className="text-xs text-muted-foreground">OCR</span>
              <span className="text-sm font-bold text-green-400 text-right tabular-nums">{pStats?.pages.ocrComplete ?? 0}</span>
              <span className={`text-sm font-bold text-right tabular-nums ${(pStats?.pages.ocrFailed ?? 0) > 0 ? "text-red-400" : "text-muted-foreground/40"}`}>
                {(pStats?.pages.ocrFailed ?? 0) > 0 ? pStats!.pages.ocrFailed : "—"}
              </span>
            </div>
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

      {/* Filters */}
      <div className="flex items-center gap-3 flex-wrap">
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

      {/* Main Content: Queue List + Pipeline Funnel */}
      <div className="flex gap-4 h-[calc(100vh-380px)]">
        {/* Queue List */}
        <Card className="w-80 flex-shrink-0 bg-card/50 backdrop-blur-sm border-border/50 flex flex-col">
          <CardHeader className="pb-2 pt-3 px-3 flex-shrink-0 flex-row items-center justify-between">
            <span className="text-sm font-semibold">Review Queue</span>
            <a
              href="/inner-sanctum/trials-of-truth"
              className="flex items-center gap-1 text-xs text-primary hover:text-primary/80 transition-colors"
            >
              Open Console
              <ExternalLink className="w-3 h-3" />
            </a>
          </CardHeader>
          <CardContent className="px-2 pb-2 flex-1 overflow-hidden">
            <ScrollArea className="h-full">
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
                    <div
                      key={item.id}
                      className="w-full text-left p-2.5 rounded-lg border bg-card/50 border-border/30"
                    >
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0 flex-1">
                          <p className="text-xs font-medium truncate">{item.documentTitle}</p>
                          <p className="text-xs text-muted-foreground">
                            Page {item.page?.pageNumber ?? "?"}
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
                    </div>
                  ))}
                </div>
              )}
            </ScrollArea>
          </CardContent>
        </Card>

        {/* Pipeline Funnel Visualization */}
        <PipelineFunnel pStats={pStats as PipelineStatsData} />
      </div>
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
