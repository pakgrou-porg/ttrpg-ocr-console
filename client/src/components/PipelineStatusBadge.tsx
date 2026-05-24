import { Hourglass, Zap, CheckCircle2, Save, AlertTriangle, RefreshCw, GitBranch } from "lucide-react";

// ─── Types ────────────────────────────────────────────────────────────────────

export type PipelineStatus =
  | "pending"
  | "in_progress"
  | "complete_unsaved"
  | "complete_saved"
  | "error"
  | "retry"
  | "fallback";

export const PIPELINE_STATUS_CONFIG: Record<PipelineStatus, {
  label: string;
  cls: string;
  icon: React.ElementType;
  pulse?: boolean;
  /** When true the HITL flag button should be disabled. */
  blockFlag: boolean;
}> = {
  pending:          { label: "Pending",            cls: "text-gray-400 border-gray-500/30 bg-gray-500/10",      icon: Hourglass,     blockFlag: true  },
  in_progress:      { label: "In Progress",        cls: "text-blue-400 border-blue-500/30 bg-blue-500/10",      icon: Zap,           pulse: true, blockFlag: true  },
  complete_unsaved: { label: "Complete · Unsaved", cls: "text-amber-400 border-amber-500/30 bg-amber-500/10",   icon: CheckCircle2,  blockFlag: false },
  complete_saved:   { label: "Complete · Saved",   cls: "text-green-400 border-green-500/30 bg-green-500/10",   icon: Save,          blockFlag: false },
  error:            { label: "Error",              cls: "text-red-400 border-red-500/30 bg-red-500/10",         icon: AlertTriangle, blockFlag: false },
  retry:            { label: "Retry",              cls: "text-purple-400 border-purple-500/30 bg-purple-500/10", icon: RefreshCw,    pulse: true, blockFlag: false },
  fallback:         { label: "Fallback",           cls: "text-orange-400 border-orange-500/30 bg-orange-500/10", icon: GitBranch,   blockFlag: false },
};

// ─── Derivation ───────────────────────────────────────────────────────────────

/**
 * Derives the pipeline processing status from the enriched page object returned
 * by `browsePagesWithOcr` and `listPages` (both include ocr, latestRetryStatus,
 * hasFallback).
 *
 * Priority order:
 *   Retry → Error → Pending → In Progress → Complete (Saved | Fallback | Unsaved)
 */
export function derivePipelineStatus(page: {
  ocrCompleted?: boolean | null;
  layoutType?: string | null;
  contentRegions?: unknown | null;
  ocr?: {
    rawText?: string | null;
    correctedText?: string | null;
    correctedStructuredData?: Record<string, unknown> | null;
  } | null;
  latestRetryStatus?: string | null;
  hasFallback?: boolean | null;
}): PipelineStatus {
  const ocr = page.ocr;
  const retryStatus = page.latestRetryStatus ?? null;

  // Active retry takes top priority
  if (retryStatus === "pending_queue" || retryStatus === "running") return "retry";

  // Error: OCR marked complete but produced no usable text, or all retries failed
  if (page.ocrCompleted && (!ocr || !ocr.rawText?.trim())) return "error";
  if (retryStatus === "failed" && !page.ocrCompleted) return "error";

  // Nothing has touched this page yet
  if (!page.ocrCompleted && !page.layoutType && !page.contentRegions) return "pending";

  // Layout or bbox done but OCR not yet finished
  if (!page.ocrCompleted) return "in_progress";

  // OCR complete — distinguish whether corrections have been saved
  const hasSavedCorrections = !!(
    ocr?.correctedText ||
    (ocr?.correctedStructuredData && Object.keys(ocr.correctedStructuredData ?? {}).length > 0)
  );
  if (hasSavedCorrections) return "complete_saved";

  // Fallback provider was used for at least one LLM call on this page
  if (page.hasFallback) return "fallback";

  return "complete_unsaved";
}

// ─── Component ────────────────────────────────────────────────────────────────

export function PipelineStatusBadge({ page }: { page: Parameters<typeof derivePipelineStatus>[0] }) {
  const status = derivePipelineStatus(page);
  const cfg = PIPELINE_STATUS_CONFIG[status];
  const Icon = cfg.icon;
  return (
    <span className={`inline-flex items-center gap-1 text-[10px] font-medium px-1.5 py-0.5 rounded border ${cfg.cls}`}>
      <Icon className={`h-2.5 w-2.5 flex-shrink-0 ${cfg.pulse ? "animate-pulse" : ""}`} />
      {cfg.label}
    </span>
  );
}
