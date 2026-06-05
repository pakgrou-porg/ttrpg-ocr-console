import { trpc } from "@/lib/trpc";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Layers, Activity, RefreshCw, Loader2, Cpu } from "lucide-react";
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
                <div className="grid grid-cols-[1fr_auto_auto_auto_auto] gap-x-4 px-4 py-2 bg-muted/10 items-center">
                  <span className="text-xs font-semibold text-foreground/80 uppercase tracking-wide">{stageLabel}</span>
                  <span className="text-xs text-muted-foreground/50 text-right">Pass</span>
                  <span className="text-xs text-muted-foreground/50 text-right">Fail</span>
                  <span className="text-xs text-muted-foreground/50 text-right">Avg</span>
                  <span className="text-xs text-muted-foreground/50 text-right">Peak</span>
                </div>

                {/* Stage totals row (shown only when multiple providers) */}
                {providers.length > 1 && (
                  <div className="grid grid-cols-[1fr_auto_auto_auto_auto] gap-x-4 px-4 py-1 items-center border-b border-border/20">
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
                      className="grid grid-cols-[1fr_auto_auto_auto_auto] gap-x-4 px-4 py-1.5 items-center hover:bg-muted/10 transition-colors"
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
              <span className="text-xs text-muted-foreground">Regions</span>
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

      {/* Pipeline Funnel — full width */}
      <PipelineFunnel
        pStats={pStats as PipelineStatsData}
        onRescan={() => bboxRescanMutation.mutate()}
        rescanPending={bboxRescanMutation.isPending}
      />

      {/* Artificer Performance — full width */}
      <ArtificerPerformance rows={stageMetrics as StageMetricRow[] | undefined} />
    </div>
  );
}
