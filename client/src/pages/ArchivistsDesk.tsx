import { trpc } from "@/lib/trpc";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Layers, Activity, RefreshCw, Loader2, Cpu, AlertTriangle, BarChart2, RotateCcw } from "lucide-react";
import { toast } from "sonner";

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

function PipelineFunnel({ pStats, onRescan, rescanPending }: {
  pStats: PipelineStatsData;
  onRescan: () => void;
  rescanPending: boolean;
}) {
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

  const ocrDone  = pStats?.pages.ocrComplete ?? 0;
  const highConf = pStats?.pages.highConf ?? 0;
  const medConf  = pStats?.pages.medConf ?? 0;
  const lowConf  = pStats?.pages.lowConf ?? 0;

  const regionsMissing = (pStats?.pages.withRegions ?? 0) < (pStats?.pages.ocrComplete ?? 0);

  return (
    <Card className="bg-card/50 backdrop-blur-sm border-border/50">
      <CardHeader className="pb-2 pt-3 px-4 border-b border-border/50">
        <CardTitle className="text-sm flex items-center gap-2">
          <Layers className="w-4 h-4 text-primary" />
          Pipeline Progress
        </CardTitle>
      </CardHeader>
      <CardContent className="p-6">
        <div className="space-y-5">
          {/* Column headers */}
          <div className="grid grid-cols-[200px_1fr_120px_120px] gap-4 text-[10px] text-muted-foreground/60 uppercase tracking-wide pb-1 border-b border-border/30">
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
              <div key={stage.name} className="grid grid-cols-[200px_1fr_120px_120px] gap-4 items-center">
                {/* Stage name + optional fail pill + rescan */}
                <div className="flex items-center gap-2 min-w-0">
                  <span className="text-sm font-medium truncate">{stage.name}</span>
                  {(stage.failCount ?? 0) > 0 && (
                    <span className="text-[10px] text-red-400 bg-red-500/10 border border-red-500/20 rounded px-1.5 py-0.5 flex-shrink-0">
                      {stage.failCount} failed
                    </span>
                  )}
                  {stage.name === "Region Detection" && regionsMissing && (
                    <button
                      className="text-[10px] text-amber-400 hover:text-amber-300 underline underline-offset-2 disabled:opacity-50 flex-shrink-0"
                      disabled={rescanPending}
                      onClick={onRescan}
                      title="Re-run bbox detection on pages missing regions"
                    >
                      {rescanPending ? <Loader2 className="w-2.5 h-2.5 inline animate-spin" /> : "rescan"}
                    </button>
                  )}
                </div>

                {/* Progress bar */}
                <div className="h-3 bg-muted/20 rounded-full overflow-hidden">
                  <div
                    className={`h-full ${stage.barColor} rounded-full transition-all duration-700`}
                    style={{ width: `${pagePct}%` }}
                  />
                </div>

                {/* Pages */}
                <div className="text-right leading-tight">
                  <span className="text-sm font-bold tabular-nums">{stage.pages.toLocaleString()}</span>
                  <span className="text-xs text-muted-foreground ml-1">({pagePct}%)</span>
                </div>

                {/* Docs */}
                <div className="text-right leading-tight">
                  {docPct !== null ? (
                    <>
                      <span className="text-sm font-bold tabular-nums">{(stage.docs ?? 0).toLocaleString()}</span>
                      <span className="text-xs text-muted-foreground ml-1">({docPct}%)</span>
                    </>
                  ) : (
                    <span className="text-sm text-muted-foreground/40">—</span>
                  )}
                </div>
              </div>
            );
          })}

          {/* OCR Confidence Distribution */}
          {ocrDone > 0 && (
            <div className="pt-4 border-t border-border/30 space-y-3">
              <p className="text-[10px] text-muted-foreground/60 uppercase tracking-wide">
                OCR Confidence Distribution ({ocrDone.toLocaleString()} pages)
              </p>
              <div className="h-3 bg-muted/20 rounded-full overflow-hidden flex">
                <div className="bg-green-500 h-full transition-all duration-700" style={{ width: `${pct(highConf, ocrDone)}%` }} />
                <div className="bg-amber-500 h-full transition-all duration-700" style={{ width: `${pct(medConf, ocrDone)}%` }} />
                <div className="bg-red-500 h-full transition-all duration-700"   style={{ width: `${pct(lowConf, ocrDone)}%` }} />
              </div>
              <div className="flex flex-wrap gap-6 text-xs">
                <span className="text-green-400">High ≥80: {highConf.toLocaleString()} ({pct(highConf, ocrDone)}%)</span>
                <span className="text-amber-400">Med 50–79: {medConf.toLocaleString()} ({pct(medConf, ocrDone)}%)</span>
                <span className="text-red-400">Low &lt;50: {lowConf.toLocaleString()} ({pct(lowConf, ocrDone)}%)</span>
                {(pStats?.pages.errorState ?? 0) > 0 && (
                  <span className="text-red-500">Errors: {pStats!.pages.errorState}</span>
                )}
              </div>
            </div>
          )}

          {/* HITL summary */}
          {(pStats?.hitl.total ?? 0) > 0 && (
            <div className="pt-4 border-t border-border/30 space-y-3">
              <p className="text-[10px] text-muted-foreground/60 uppercase tracking-wide">HITL Queue</p>
              <div className="flex flex-wrap gap-6 text-xs">
                <span className="text-muted-foreground">Queued: <span className="font-bold text-foreground">{pStats?.hitl.queued}</span></span>
                <span className="text-blue-400">In Review: <span className="font-bold">{pStats?.hitl.inProgress}</span></span>
                <span className="text-green-400">Resolved: <span className="font-bold">{pStats?.hitl.resolved}</span></span>
                <span className="text-muted-foreground">Skipped: <span className="font-bold text-foreground">{pStats?.hitl.skipped}</span></span>
                {(pStats?.pages.savedCorrections ?? 0) > 0 && (
                  <span className="text-green-400">Corrections Saved: <span className="font-bold">{pStats!.pages.savedCorrections}</span></span>
                )}
                {(pStats?.retry.pendingQueue ?? 0) > 0 && (
                  <span className="text-amber-400">Rescan Queued: <span className="font-bold">{pStats!.retry.pendingQueue}</span></span>
                )}
                {(pStats?.retry.running ?? 0) > 0 && (
                  <span className="text-violet-400">Rescanning: <span className="font-bold">{pStats!.retry.running}</span></span>
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

// ─── HITL Category Panel ────────────────────────────────────────────────────

type CategoryStat = { category: string; queued: number; total: number };

/** Human-readable label, description, and default retry stages per flagCategory. */
const CATEGORY_META: Record<string, {
  label: string;
  description: string;
  color: string;
  retryStages: ("layout_analysis" | "bbox_detection" | "ocr_extraction")[];
}> = {
  provider_exhausted: {
    label: "Provider Exhausted",
    description: "All configured LLM providers failed or were circuit-broken. No OCR output produced.",
    color: "text-orange-400",
    retryStages: ["layout_analysis", "bbox_detection", "ocr_extraction"],
  },
  stage_failure: {
    label: "Stage Failure",
    description: "One or more pipeline stages returned an error (malformed JSON, timeout, etc.).",
    color: "text-red-400",
    retryStages: ["ocr_extraction"],
  },
  low_confidence: {
    label: "Low Confidence",
    description: "OCR model returned a confidence score below the configured threshold.",
    color: "text-amber-400",
    retryStages: ["ocr_extraction"],
  },
  native_text_divergence: {
    label: "Native Text Divergence",
    description: "OCR output diverges significantly from the embedded PDF text layer.",
    color: "text-yellow-400",
    retryStages: ["ocr_extraction"],
  },
  manual_flag: {
    label: "Manual Flag",
    description: "Manually flagged for review.",
    color: "text-blue-400",
    retryStages: [],
  },
};

function HitlCategoryPanel({ stats, onRetried }: {
  stats: CategoryStat[] | undefined;
  onRetried: () => void;
}) {
  const bulkRetry = trpc.hitl.bulkRetryByCategory.useMutation({
    onSuccess: (r) => { toast.success(`Enqueued ${r.enqueued} page${r.enqueued !== 1 ? "s" : ""} for retry.`); onRetried(); },
    onError: (e) => toast.error(`Retry failed: ${e.message}`),
  });

  const active = (stats ?? []).filter(s => s.queued > 0);
  if (active.length === 0) return null;

  return (
    <Card className="bg-card/50 backdrop-blur-sm border-border/50">
      <CardHeader className="pb-2 pt-3 px-4 border-b border-border/50">
        <CardTitle className="text-sm flex items-center gap-2">
          <AlertTriangle className="w-4 h-4 text-amber-400" />
          HITL Failure Categories
          <span className="text-xs text-muted-foreground font-normal ml-1">
            — queued items by root cause
          </span>
        </CardTitle>
      </CardHeader>
      <CardContent className="p-0">
        <div className="divide-y divide-border/30">
          {active.map(stat => {
            const meta = CATEGORY_META[stat.category];
            const label = meta?.label ?? stat.category;
            const color = meta?.color ?? "text-muted-foreground";
            const stages = meta?.retryStages ?? [];
            return (
              <div key={stat.category} className="flex items-center gap-4 px-4 py-3">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className={`text-sm font-semibold ${color}`}>{label}</span>
                    <span className="text-xs bg-muted/30 rounded px-1.5 py-0.5 tabular-nums">
                      {stat.queued} queued
                      {stat.total > stat.queued && (
                        <span className="text-muted-foreground/60"> / {stat.total} total</span>
                      )}
                    </span>
                  </div>
                  {meta?.description && (
                    <p className="text-xs text-muted-foreground/70 mt-0.5">{meta.description}</p>
                  )}
                </div>
                {stages.length > 0 && (
                  <Button
                    variant="outline"
                    size="sm"
                    className="flex-shrink-0 gap-1.5 text-xs"
                    disabled={bulkRetry.isPending || stat.queued === 0}
                    onClick={() => {
                      if (!confirm(`Enqueue retry for all ${stat.queued} "${label}" page${stat.queued !== 1 ? "s" : ""}?\n\nStages: ${stages.join(", ")}`)) return;
                      bulkRetry.mutate({ category: stat.category, stages });
                    }}
                  >
                    {bulkRetry.isPending ? <Loader2 className="w-3 h-3 animate-spin" /> : <RefreshCw className="w-3 h-3" />}
                    Retry All
                  </Button>
                )}
              </div>
            );
          })}
        </div>
      </CardContent>
    </Card>
  );
}

// ─── Artificer Performance ──────────────────────────────────────────────────

type StageMetricRow = {
  stage: string;
  provider_name: string;
  call_count: number;
  failure_count: number;
  avg_duration_ms: number;
  peak_duration_ms: number;
  total_tokens: number;
  fallback_count: number;
};

const STAGE_LABELS: Record<string, string> = {
  layout_analysis:      "Layout Analysis",
  bbox_detection:       "Region Detection",
  ocr_extraction:       "OCR Extraction",
  tabular_extraction:   "Table Extraction",
  document_intelligence:"Doc Intelligence",
  content_break_detect: "Content Break Detect",
  section_summary:      "Section Summary",
  pdf_column_detect:    "Column Detection",
};

const STAGE_ORDER = [
  "layout_analysis", "bbox_detection", "ocr_extraction",
  "tabular_extraction", "document_intelligence", "content_break_detect",
  "section_summary", "pdf_column_detect",
];

function fmt(ms: number) {
  if (ms >= 10_000) return `${(ms / 1000).toFixed(1)}s`;
  if (ms >= 1000)   return `${(ms / 1000).toFixed(2)}s`;
  return `${ms}ms`;
}

function ArtificerPerformance({ rows }: { rows: StageMetricRow[] | undefined }) {
  if (!rows || rows.length === 0) {
    return (
      <Card className="bg-card/50 backdrop-blur-sm border-border/50">
        <CardHeader className="pb-2 pt-3 px-4 border-b border-border/50">
          <CardTitle className="text-sm flex items-center gap-2">
            <Cpu className="w-4 h-4 text-primary" />
            Artificer Performance by Stage
          </CardTitle>
        </CardHeader>
        <CardContent className="p-6 text-center text-muted-foreground text-sm">
          No LLM call metrics yet. Run an ingestion job to populate this view.
        </CardContent>
      </Card>
    );
  }

  // Group rows by stage, preserving STAGE_ORDER then any extras alphabetically
  const byStage = new Map<string, StageMetricRow[]>();
  for (const row of rows) {
    const list = byStage.get(row.stage) ?? [];
    list.push(row);
    byStage.set(row.stage, list);
  }
  const stageKeys = [
    ...STAGE_ORDER.filter(s => byStage.has(s)),
    ...Array.from(byStage.keys()).filter(s => !STAGE_ORDER.includes(s)).sort(),
  ];

  return (
    <Card className="bg-card/50 backdrop-blur-sm border-border/50">
      <CardHeader className="pb-2 pt-3 px-4 border-b border-border/50">
        <CardTitle className="text-sm flex items-center gap-2">
          <Cpu className="w-4 h-4 text-primary" />
          Artificer Performance by Stage
        </CardTitle>
      </CardHeader>
      <CardContent className="p-0">
        <div className="divide-y divide-border/30">
          {stageKeys.map(stage => {
            const providers = byStage.get(stage)!;
            const stageTotal   = providers.reduce((s, r) => s + r.call_count, 0);
            const stageFailed  = providers.reduce((s, r) => s + r.failure_count, 0);
            const stagePassed  = stageTotal - stageFailed;
            const stageLabel   = STAGE_LABELS[stage] ?? stage;

            return (
              <div key={stage}>
                {/* Stage header */}
                <div className="grid grid-cols-[1fr_52px_52px_68px_68px] gap-x-4 px-4 py-2 bg-muted/10 items-center">
                  <span className="text-xs font-semibold text-foreground/80 uppercase tracking-wide">{stageLabel}</span>
                  <span className="text-xs text-muted-foreground/50 text-right">Pass</span>
                  <span className="text-xs text-muted-foreground/50 text-right">Fail</span>
                  <span className="text-xs text-muted-foreground/50 text-right">Avg</span>
                  <span className="text-xs text-muted-foreground/50 text-right">Peak</span>
                </div>

                {/* Stage totals row (shown only when multiple providers) */}
                {providers.length > 1 && (
                  <div className="grid grid-cols-[1fr_52px_52px_68px_68px] gap-x-4 px-4 py-1 items-center border-b border-border/20">
                    <span className="text-[11px] text-muted-foreground italic pl-2">All providers</span>
                    <span className="text-xs font-bold text-green-400 text-right tabular-nums">{stagePassed.toLocaleString()}</span>
                    <span className={`text-xs font-bold text-right tabular-nums ${stageFailed > 0 ? "text-red-400" : "text-muted-foreground/40"}`}>
                      {stageFailed > 0 ? stageFailed.toLocaleString() : "—"}
                    </span>
                    <span className="text-xs text-muted-foreground/50 text-right">—</span>
                    <span className="text-xs text-muted-foreground/50 text-right">—</span>
                  </div>
                )}

                {/* Per-provider rows */}
                {providers.map(row => {
                  const passed = row.call_count - row.failure_count;
                  const failRate = row.call_count > 0
                    ? Math.round((row.failure_count / row.call_count) * 100)
                    : 0;
                  return (
                    <div
                      key={row.provider_name}
                      className="grid grid-cols-[1fr_52px_52px_68px_68px] gap-x-4 px-4 py-1.5 items-center hover:bg-muted/10 transition-colors"
                    >
                      <div className="flex items-center gap-1.5 min-w-0 pl-4">
                        <span className="text-xs text-foreground/80 truncate">{row.provider_name}</span>
                        {row.fallback_count > 0 && (
                          <span className="text-[10px] text-amber-400/70 bg-amber-400/10 border border-amber-400/20 rounded px-1 flex-shrink-0">
                            fallback
                          </span>
                        )}
                        {failRate >= 20 && (
                          <span className="text-[10px] text-red-400/70 bg-red-400/10 border border-red-400/20 rounded px-1 flex-shrink-0">
                            {failRate}% fail
                          </span>
                        )}
                      </div>
                      <span className="text-xs font-bold text-green-400 text-right tabular-nums">{passed.toLocaleString()}</span>
                      <span className={`text-xs font-bold text-right tabular-nums ${row.failure_count > 0 ? "text-red-400" : "text-muted-foreground/40"}`}>
                        {row.failure_count > 0 ? row.failure_count.toLocaleString() : "—"}
                      </span>
                      <span className="text-xs text-muted-foreground text-right tabular-nums">{fmt(row.avg_duration_ms)}</span>
                      <span className="text-xs text-muted-foreground/70 text-right tabular-nums">{fmt(row.peak_duration_ms)}</span>
                    </div>
                  );
                })}
              </div>
            );
          })}
        </div>
      </CardContent>
    </Card>
  );
}

// ─── Main Component ─────────────────────────────────────────────────────────

export default function ArchivistsDesk() {
  const utils = trpc.useUtils();

  const { data: pStats }        = trpc.pipeline.stats.useQuery(undefined, { refetchInterval: 15000 });
  const { data: jStats }        = trpc.jobs.stats.useQuery(undefined, { refetchInterval: 15000 });
  const { data: stageMetrics }  = trpc.pipeline.stageMetrics.useQuery(undefined, { refetchInterval: 30000 });
  const { data: categoryStats, refetch: refetchCategoryStats } = trpc.hitl.categoryStats.useQuery(undefined, { refetchInterval: 30000 });
  const { data: tokenStats, error: tokenStatsError, refetch: refetchTokenStats } = trpc.metrics.providerStatsSinceReset.useQuery(undefined, { refetchInterval: 60000 });
  const { data: resetTimeData } = trpc.metrics.resetTime.useQuery();
  const resetMetricsMutation = trpc.metrics.reset.useMutation({
    onSuccess: () => { toast.success("Token stats reset."); refetchTokenStats(); },
    onError: (err) => toast.error(`Reset failed: ${err.message}`),
  });
  const clearResetMutation = trpc.metrics.clearReset.useMutation({
    onSuccess: () => { toast.success("Reset timestamp cleared — showing all-time data."); refetchTokenStats(); },
    onError: (err) => toast.error(`Clear failed: ${err.message}`),
  });
  const resetProviderMutation = trpc.metrics.resetProvider.useMutation({
    onSuccess: () => { toast.success("Provider stats reset."); refetchTokenStats(); },
    onError: (err) => toast.error(`Reset failed: ${err.message}`),
  });

  const bboxRescanMutation = trpc.pipeline.enqueueBboxRescan.useMutation({
    onSuccess: (data) => {
      toast.success(`Enqueued ${data.enqueued} page${data.enqueued !== 1 ? "s" : ""} for region detection.`);
      utils.pipeline.stats.invalidate();
    },
    onError: (err) => toast.error(`Rescan failed: ${err.message}`),
  });

  return (
    <div className="space-y-6 animate-in fade-in duration-500">
      {/* Header */}
      <div>
        <h1 className="text-4xl font-bold tracking-tight mb-2 flex items-center gap-3">
          <Activity className="w-10 h-10 text-primary" />
          The Archivist's Desk
        </h1>
        <p className="text-lg text-muted-foreground max-w-3xl">
          Monitor the pipeline's progress across all stages. Use the Trials of Truth console for hands-on page review and correction.
        </p>
      </div>

      {/* Metric Cards */}
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
            <div className="grid grid-cols-[minmax(0,1fr)_3rem_3rem] text-[10px] text-muted-foreground/60 uppercase tracking-wide pb-0.5 border-b border-border/30">
              <span>Stage</span>
              <span className="text-green-500 text-right">✓ Pass</span>
              <span className="text-red-400 text-right">✗ Fail</span>
            </div>
            <div className="grid grid-cols-[minmax(0,1fr)_3rem_3rem] items-center">
              <span className="text-xs text-muted-foreground">Ingested</span>
              <span className="text-sm font-bold text-right tabular-nums">{pStats?.pages.total ?? 0}</span>
              <span className="text-sm text-right text-muted-foreground/40 tabular-nums">—</span>
            </div>
            <div className="grid grid-cols-[minmax(0,1fr)_3rem_3rem] items-center">
              <span className="text-xs text-muted-foreground">Layout</span>
              <span className="text-sm font-bold text-green-400 text-right tabular-nums">{pStats?.pages.withLayout ?? 0}</span>
              <span className={`text-sm font-bold text-right tabular-nums ${(pStats?.pages.layoutFailed ?? 0) > 0 ? "text-red-400" : "text-muted-foreground/40"}`}>
                {(pStats?.pages.layoutFailed ?? 0) > 0 ? pStats!.pages.layoutFailed : "—"}
              </span>
            </div>
            <div className="grid grid-cols-[minmax(0,1fr)_3rem_3rem] items-center">
              <span className="text-xs text-muted-foreground">Regions</span>
              <span className="text-sm font-bold text-green-400 text-right tabular-nums">{pStats?.pages.withRegions ?? 0}</span>
              <span className={`text-sm font-bold text-right tabular-nums ${(pStats?.pages.bboxFailed ?? 0) > 0 ? "text-red-400" : "text-muted-foreground/40"}`}>
                {(pStats?.pages.bboxFailed ?? 0) > 0 ? pStats!.pages.bboxFailed : "—"}
              </span>
            </div>
            <div className="grid grid-cols-[minmax(0,1fr)_3rem_3rem] items-center">
              <span className="text-xs text-muted-foreground">OCR</span>
              <span className="text-sm font-bold text-green-400 text-right tabular-nums">{pStats?.pages.ocrComplete ?? 0}</span>
              <span className={`text-sm font-bold text-right tabular-nums ${(pStats?.pages.ocrFailed ?? 0) > 0 ? "text-red-400" : "text-muted-foreground/40"}`}>
                {(pStats?.pages.ocrFailed ?? 0) > 0 ? pStats!.pages.ocrFailed : "—"}
              </span>
            </div>
            {((pStats?.pages.total ?? 0) - (pStats?.pages.processed ?? 0)) > 0 && (
              <div className="grid grid-cols-[minmax(0,1fr)_3rem_3rem] items-center pt-0.5 border-t border-border/30">
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

      {/* Pipeline Funnel — full width */}
      <PipelineFunnel
        pStats={pStats as PipelineStatsData}
        onRescan={() => bboxRescanMutation.mutate()}
        rescanPending={bboxRescanMutation.isPending}
      />

      {/* HITL failure categories with batch retry */}
      <HitlCategoryPanel
        stats={categoryStats as CategoryStat[] | undefined}
        onRetried={() => { refetchCategoryStats(); }}
      />

      {/* Artificer Performance — full width */}
      <ArtificerPerformance rows={stageMetrics as StageMetricRow[] | undefined} />

      {/* Token Usage by Provider — always rendered so reset is accessible even with no data */}
      <Card className="bg-card/50 backdrop-blur-sm border-border/50">
        <CardHeader className="pb-2 pt-3 px-4 border-b border-border/50">
          <div className="flex items-center justify-between">
            <CardTitle className="text-sm flex items-center gap-2">
              <BarChart2 className="w-4 h-4 text-violet-400" />
              Token Usage by Artificer
              <span className="text-xs font-normal text-muted-foreground">
                {resetTimeData?.resetAt
                  ? `since ${new Date(resetTimeData.resetAt).toLocaleDateString()}`
                  : "(all-time)"}
              </span>
            </CardTitle>
            <Button
              variant="outline"
              size="sm"
              className="h-7 gap-1.5 text-xs"
              onClick={() => resetMetricsMutation.mutate()}
              disabled={resetMetricsMutation.isPending}
            >
              {resetMetricsMutation.isPending
                ? <Loader2 className="h-3 w-3 animate-spin" />
                : <RotateCcw className="h-3 w-3" />}
              Reset All
            </Button>
          </div>
        </CardHeader>
        <CardContent className="p-4">
          {tokenStatsError ? (
            <p className="text-xs text-destructive/70 py-2">
              Failed to load token stats: {tokenStatsError.message}
            </p>
          ) : (tokenStats ?? []).filter(s => s.total_calls > 0).length === 0 ? (
            <p className="text-xs text-muted-foreground/60 py-2">
              No usage data recorded{resetTimeData?.resetAt ? ` since ${new Date(resetTimeData.resetAt).toLocaleDateString()}` : ""}. Data is captured when the pipeline runs LLM stages.
              {resetTimeData?.resetAt && (
                <button
                  className="ml-2 underline text-muted-foreground hover:text-foreground"
                  onClick={() => clearResetMutation.mutate()}
                >
                  Clear reset timestamp to see all-time data.
                </button>
              )}
            </p>
          ) : (
            <>
              {/* Column headers */}
              <div className="grid grid-cols-[minmax(0,1fr)_5rem_5rem_5rem_4rem_4rem_2rem] gap-x-3 text-[10px] text-muted-foreground/60 uppercase tracking-wide pb-2 border-b border-border/30 mb-2">
                <span>Provider</span>
                <span className="text-right">Calls</span>
                <span className="text-right">Tokens</span>
                <span className="text-right">Avg ms</span>
                <span className="text-right">Success</span>
                <span className="text-right">Fallbacks</span>
                <span />
              </div>
              <div className="space-y-1.5">
                {(tokenStats ?? []).filter(s => s.total_calls > 0).map(s => {
                  const fmtTokens = (n: number) => n >= 1_000_000 ? `${(n/1_000_000).toFixed(1)}M` : n >= 1000 ? `${(n/1000).toFixed(0)}K` : String(n);
                  return (
                    <div key={s.provider_id ?? s.provider_name} className="grid grid-cols-[minmax(0,1fr)_5rem_5rem_5rem_4rem_4rem_2rem] gap-x-3 items-center text-sm">
                      <span className="truncate text-sm font-medium">{s.provider_name ?? "(unknown)"}</span>
                      <span className="text-right tabular-nums">{s.total_calls.toLocaleString()}</span>
                      <span className="text-right tabular-nums">{fmtTokens(s.total_tokens)}</span>
                      <span className="text-right tabular-nums">{s.avg_duration_ms.toLocaleString()}</span>
                      <span className={`text-right tabular-nums font-medium ${s.success_rate >= 90 ? "text-green-400" : s.success_rate >= 70 ? "text-amber-400" : "text-red-400"}`}>
                        {s.success_rate.toFixed(0)}%
                      </span>
                      <span className={`text-right tabular-nums ${s.fallback_count > 0 ? "text-amber-400" : "text-muted-foreground"}`}>
                        {s.fallback_count}
                      </span>
                      <button
                        title="Reset stats for this provider"
                        className="text-muted-foreground/40 hover:text-muted-foreground"
                        onClick={() => s.provider_id != null && resetProviderMutation.mutate({ providerId: s.provider_id })}
                        disabled={s.provider_id == null || resetProviderMutation.isPending}
                      >
                        <RotateCcw className="h-3 w-3" />
                      </button>
                    </div>
                  );
                })}
              </div>
            </>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
