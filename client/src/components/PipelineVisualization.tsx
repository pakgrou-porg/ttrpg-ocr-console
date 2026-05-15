import { useCallback, useMemo } from "react";
import {
  ReactFlow,
  Background,
  Controls,
  MiniMap,
  Handle,
  Position,
  type NodeProps,
  type Node,
  type Edge,
  MarkerType,
  useNodesState,
  useEdgesState,
  BackgroundVariant,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import { Badge } from "@/components/ui/badge";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import {
  Brain,
  Cloud,
  Cpu,
  Database,
  FileSearch,
  FileText,
  GitBranch,
  Gavel,
  Layers,
  MessageSquare,
  ScanLine,
  Search,
  Sparkles,
  Table,
  Table2,
  Users,
  Zap,
  Shield,
  AlertTriangle,
  CheckCircle2,
  Thermometer,
  GitCompare,
} from "lucide-react";

// ─── Stage metadata ─────────────────────────────────────────────────────────

export const STAGE_META: Record<string, {
  label: string;
  description: string;
  icon: React.ComponentType<{ className?: string }>;
  color: string;
  bgColor: string;
  borderColor: string;
  group: "phase1" | "phase2" | "phase3" | "output";
  phase: 1 | 2 | 3;
}> = {
  // ── Phase 1: Ingestion & Layout ───────────────────────────────────────────
  pdf_text_extract: {
    label: "Native PDF Text",
    description: "Phase 1 — extracts embedded text directly from the PDF using pdftotext; detects pages with a usable text layer (≥50 printable chars) and computes token-level F1 similarity against OCR output as an automated quality baseline",
    icon: FileText,
    color: "text-violet-300",
    bgColor: "bg-violet-950/60",
    borderColor: "border-violet-500/60",
    group: "phase1",
    phase: 1,
  },
  document_intelligence: {
    label: "Document Intelligence",
    description: "Phase 1 — identifies document type, canonical title, publisher, and generates a summary from the first 10 pages; drives layout strategy for all subsequent pages",
    icon: FileSearch,
    color: "text-violet-300",
    bgColor: "bg-violet-950/60",
    borderColor: "border-violet-500/60",
    group: "phase1",
    phase: 1,
  },
  layout_analysis: {
    label: "Layout Analysis",
    description: "Phase 1 — local VLM detects page structure, columns, headers, and content regions",
    icon: Layers,
    color: "text-violet-300",
    bgColor: "bg-violet-950/60",
    borderColor: "border-violet-500/60",
    group: "phase1",
    phase: 1,
  },
  bbox_detection: {
    label: "BBox & Content Classification",
    description: "Phase 1 — bounding-box detection and content type classification (text, table, illustration, map, advertisement)",
    icon: Search,
    color: "text-violet-300",
    bgColor: "bg-violet-950/60",
    borderColor: "border-violet-500/60",
    group: "phase1",
    phase: 1,
  },
  content_type_classify: {
    label: "Mixed-Boundary Resolver",
    description: "Phase 1 — resolves ambiguous or mixed-boundary regions; outputs refined sub-region splits with corrected content type classifications and pixel-accurate bounding boxes",
    icon: ScanLine,
    color: "text-violet-300",
    bgColor: "bg-violet-950/60",
    borderColor: "border-violet-500/60",
    group: "phase1",
    phase: 1,
  },
  // ── Phase 2: OCR Extraction ─────────────────────────────────────────────
  ocr_extraction: {
    label: "OCR Extraction (Pass 1–2)",
    description: "Phase 2 — primary extraction pass: structured JSON per page, preserving reading order, tables, illustrations, and content hierarchy",
    icon: FileText,
    color: "text-blue-300",
    bgColor: "bg-blue-950/60",
    borderColor: "border-blue-500/60",
    group: "phase2",
    phase: 2,
  },
  content_break_detect: {
    label: "Content Break Detection",
    description: "Phase 2 — identifies chapter/section/subsection breaks and cross-page sentence continuity",
    icon: GitBranch,
    color: "text-blue-300",
    bgColor: "bg-blue-950/60",
    borderColor: "border-blue-500/60",
    group: "phase2",
    phase: 2,
  },
  summarisation: {
    label: "Hierarchical Summarisation",
    description: "Phase 2 — LLM generates chapter, section, and subsection summaries for embeddings and RAG retrieval",
    icon: Sparkles,
    color: "text-blue-300",
    bgColor: "bg-blue-950/60",
    borderColor: "border-blue-500/60",
    group: "phase2",
    phase: 2,
  },
  quality_validation: {
    label: "Quality Validation",
    description: "Phase 2 — LLM assesses extraction quality: completeness, layout accuracy, context decisions, text continuity",
    icon: Shield,
    color: "text-amber-300",
    bgColor: "bg-amber-950/60",
    borderColor: "border-amber-500/60",
    group: "phase2",
    phase: 2,
  },
  tabular_extraction: {
    label: "Tabular Extraction",
    description: "Phase 2 — specialised extraction for table-dominant pages and complex table regions (stat blocks, spell lists, equipment tables, multi-row nested structures)",
    icon: Table2,
    color: "text-blue-300",
    bgColor: "bg-blue-950/60",
    borderColor: "border-blue-500/60",
    group: "phase2",
    phase: 2,
  },
  pass_comparison: {
    label: "Multi-Pass Comparison",
    description: "Phase 2 — contrasts all available pass outputs (Pass 1–4) to select the best candidate or flag for HITL when passes are irreconcilably different",
    icon: GitCompare,
    color: "text-amber-300",
    bgColor: "bg-amber-950/60",
    borderColor: "border-amber-500/60",
    group: "phase2",
    phase: 2,
  },
  pass3_cloud_extraction: {
    label: "Pass 3 — Cloud Retry",
    description: "Phase 2 — if Pass 1/2 fail quality check: designated cloud model re-extracts independently; results scored and compared",
    icon: Cloud,
    color: "text-orange-300",
    bgColor: "bg-orange-950/60",
    borderColor: "border-orange-500/60",
    group: "phase2",
    phase: 2,
  },
  pass4_cloud_extraction: {
    label: "Pass 4 — Cloud Final",
    description: "Phase 2 — if Pass 3 still fails: same cloud model retries; all 4 pass results preserved for HITL if still unacceptable",
    icon: AlertTriangle,
    color: "text-red-300",
    bgColor: "bg-red-950/60",
    borderColor: "border-red-500/60",
    group: "phase2",
    phase: 2,
  },
  // ── Phase 3: Artifact Storage ───────────────────────────────────────────
  artifact_storage: {
    label: "Artifact Storage",
    description: "Phase 3 — persist per-page JSONs, raw PNGs, preprocessed PNGs, child/extracted images, cross-page continuity data",
    icon: Database,
    color: "text-emerald-300",
    bgColor: "bg-emerald-950/60",
    borderColor: "border-emerald-500/60",
    group: "phase3",
    phase: 3,
  },
  embedding_generation: {
    label: "Embedding Generation",
    description: "Phase 3 — multimodal embedding generation for text, tables, and images for hybrid RAG retrieval",
    icon: Zap,
    color: "text-emerald-300",
    bgColor: "bg-emerald-950/60",
    borderColor: "border-emerald-500/60",
    group: "phase3",
    phase: 3,
  },
  database_load: {
    label: "Database Load",
    description: "Phase 3 — final step: load all structured data, embeddings, and metadata into the Arkanum database",
    icon: Database,
    color: "text-emerald-300",
    bgColor: "bg-emerald-950/60",
    borderColor: "border-emerald-500/60",
    group: "phase3",
    phase: 3,
  },
  // ── Output ──────────────────────────────────────────────────────────────────────────────────────────
  voice_of_arkanum: {
    label: "Voice of Arkanum",
    description: "Console AI — generates atmospheric lore ramblings and thematic knowledge snippets from the database",
    icon: MessageSquare,
    color: "text-rose-300",
    bgColor: "bg-rose-950/60",
    borderColor: "border-rose-500/60",
    group: "output",
    phase: 3,
  },
  referee: {
    label: "The Referee",
    description: "Console AI — authoritative rules referee that answers rules questions and resolves edge cases by citing source material from the lore database",
    icon: Gavel,
    color: "text-rose-300",
    bgColor: "bg-rose-950/60",
    borderColor: "border-rose-500/60",
    group: "output",
    phase: 3,
  },
};

// ─── Pipeline flow order (left-to-right columns) ──────────────────────────────────────────────────────────────────────────────────────────

const PIPELINE_FLOW: string[][] = [
  // Col 0 — ingestion (virtual)
  ["__ingestion__"],
  // Col 1 — Phase 1: batch pre-processing (whole-document, before per-page loop)
  ["pdf_text_extract", "document_intelligence"],
  // Col 2 — Phase 1: layout
  ["layout_analysis", "bbox_detection", "content_type_classify"],
  // Col 3 — Phase 2: extraction
  ["ocr_extraction", "content_break_detect", "summarisation", "tabular_extraction"],
  // Col 4 — Phase 2: validation & comparison
  ["quality_validation", "pass_comparison"],
  // Col 5 — Phase 2: retry escalation
  ["pass3_cloud_extraction", "pass4_cloud_extraction"],
  // Col 6 — Phase 3: storage
  ["artifact_storage", "embedding_generation", "database_load"],
  // Col 7 — output
  ["voice_of_arkanum", "referee"],
];

const FLOW_EDGES: Array<{ from: string; to: string; style?: "normal" | "fallback" | "conditional" }> = [
  // Ingestion → batch pre-processing
  { from: "__ingestion__", to: "pdf_text_extract" },
  { from: "__ingestion__", to: "document_intelligence" },
  // Native text baseline feeds OCR quality scoring (conditional — only when embedded text found)
  { from: "pdf_text_extract", to: "ocr_extraction", style: "conditional" },
  // Document Intelligence → Phase 1 layout
  { from: "document_intelligence", to: "layout_analysis" },
  { from: "document_intelligence", to: "bbox_detection" },
  { from: "document_intelligence", to: "content_type_classify" },
  // Phase 1 → Phase 2
  { from: "layout_analysis", to: "ocr_extraction" },
  { from: "bbox_detection", to: "ocr_extraction" },
  { from: "content_type_classify", to: "ocr_extraction" },
  { from: "ocr_extraction", to: "content_break_detect" },
  { from: "ocr_extraction", to: "summarisation" },
  // Table-dominant pages branch to tabular_extraction
  { from: "ocr_extraction", to: "tabular_extraction", style: "conditional" },
  // Phase 2 → Quality Validation
  { from: "content_break_detect", to: "quality_validation" },
  { from: "summarisation", to: "quality_validation" },
  { from: "tabular_extraction", to: "quality_validation" },
  // Quality Validation → Multi-Pass Comparison
  { from: "quality_validation", to: "pass_comparison", style: "conditional" },
  // Quality Validation / Pass Comparison → Retry escalation (conditional)
  { from: "pass_comparison", to: "pass3_cloud_extraction", style: "fallback" },
  { from: "pass3_cloud_extraction", to: "pass4_cloud_extraction", style: "fallback" },
  // All paths → Phase 3
  { from: "quality_validation", to: "artifact_storage" },
  { from: "pass_comparison", to: "artifact_storage" },
  { from: "pass4_cloud_extraction", to: "artifact_storage" },
  { from: "artifact_storage", to: "embedding_generation" },
  { from: "embedding_generation", to: "database_load" },
  // Phase 3 → Output
  { from: "database_load", to: "voice_of_arkanum" },
  { from: "database_load", to: "referee" },
];

// ─── Phase group headers ──────────────────────────────────────────────────────

const PHASE_LABELS: Record<number, { label: string; color: string }> = {
  1: { label: "Phase 1 — Ingestion & Layout", color: "text-violet-400" },
  2: { label: "Phase 2 — OCR Extraction & Validation", color: "text-blue-400" },
  3: { label: "Phase 3 — Artifact Storage & Embeddings", color: "text-emerald-400" },
};

// ─── Types ───────────────────────────────────────────────────────────────────

export interface ProviderInfo {
  id: number;
  displayName: string;
  name: string;
  modelId: string | null;
  providerType: string;
  isActive: boolean;
}

export interface InscriptionInfo {
  id: number;
  isActive: boolean;
  systemPrompt?: string | null;
  temperature?: number | null;
  maxTokens?: number | null;
  llmSettings?: Record<string, unknown> | null;
}

export interface TopologyStage {
  stage: string;
  inscription: InscriptionInfo | null;
  primaryProvider: ProviderInfo | null;
  fallbackProvider: ProviderInfo | null;
}

// ─── Custom node: Stage ──────────────────────────────────────────────────────

function StageNode({ data }: NodeProps) {
  const d = data as {
    stage: string;
    inscription: InscriptionInfo | null;
    primaryProvider: ProviderInfo | null;
    fallbackProvider: ProviderInfo | null;
    isIngestion?: boolean;
    isHitl?: boolean;
  };

  if (d.isIngestion) {
    return (
      <div className="flex flex-col items-center justify-center w-28 h-20 rounded-xl border-2 border-slate-500/60 bg-slate-800/80 shadow-lg">
        <Database className="w-6 h-6 text-slate-300 mb-1" />
        <span className="text-xs font-semibold text-slate-300 text-center leading-tight">PDF<br />Ingestion</span>
        <Handle type="source" position={Position.Right} className="!bg-slate-400" />
      </div>
    );
  }

  if (d.isHitl) {
    return (
      <div className="flex flex-col items-center justify-center w-32 h-20 rounded-xl border-2 border-rose-500/60 bg-rose-950/60 shadow-lg">
        <Handle type="target" position={Position.Left} className="!bg-rose-400" />
        <Users className="w-6 h-6 text-rose-300 mb-1" />
        <span className="text-xs font-semibold text-rose-300 text-center leading-tight">HITL<br />Review</span>
      </div>
    );
  }

  const meta = STAGE_META[d.stage];
  if (!meta) return null;
  const Icon = meta.icon;

  const hasInscription = d.inscription !== null;
  const isInscriptionActive = d.inscription?.isActive ?? false;

  return (
    <div className={`flex flex-col min-w-[200px] max-w-[240px] rounded-xl border-2 ${meta.borderColor} ${meta.bgColor} shadow-lg overflow-hidden`}>
      <Handle type="target" position={Position.Left} className="!bg-slate-400" />

      {/* Header */}
      <div className={`flex items-center gap-2 px-3 py-2 border-b ${meta.borderColor}`}>
        <Icon className={`w-4 h-4 flex-shrink-0 ${meta.color}`} />
        <span className={`text-xs font-bold uppercase tracking-wider ${meta.color} leading-tight flex-1`}>{meta.label}</span>
        {hasInscription && (
          <div className={`w-2 h-2 rounded-full flex-shrink-0 ${isInscriptionActive ? "bg-green-400" : "bg-gray-500"}`} />
        )}
      </div>

      {/* Providers */}
      <div className="flex flex-col gap-1 p-2">
        {!hasInscription ? (
          <div className="flex items-center gap-1.5 px-2 py-1.5 rounded bg-slate-700/40 border border-dashed border-slate-600/50">
            <span className="text-xs text-slate-500 italic">No provider inscribed</span>
          </div>
        ) : (
          <>
            {d.primaryProvider && (
              <Tooltip>
                <TooltipTrigger asChild>
                  <div className="flex items-center gap-1.5 px-2 py-1.5 rounded bg-slate-700/60 border border-slate-600/40 cursor-default">
                    {d.primaryProvider.providerType === "lm_studio" || d.primaryProvider.providerType === "openai_compatible" ? (
                      <Cpu className="w-3 h-3 text-violet-400 flex-shrink-0" />
                    ) : (
                      <Cloud className="w-3 h-3 text-blue-400 flex-shrink-0" />
                    )}
                    <span className="text-xs text-slate-200 font-medium truncate flex-1">
                      {d.primaryProvider.modelId || d.primaryProvider.displayName}
                    </span>
                    <Badge variant="outline" className="text-[10px] px-1 py-0 h-4 border-emerald-500/50 text-emerald-400">Primary</Badge>
                  </div>
                </TooltipTrigger>
                <TooltipContent side="right" className="max-w-xs space-y-1">
                  <p className="font-semibold">{d.primaryProvider.displayName}</p>
                  {d.primaryProvider.modelId && (
                    <p className="text-xs text-muted-foreground font-mono">{d.primaryProvider.modelId}</p>
                  )}
                  <p className="text-xs text-muted-foreground">Type: {d.primaryProvider.providerType}</p>
                  {d.inscription?.temperature !== null && d.inscription?.temperature !== undefined && (
                    <p className="text-xs text-muted-foreground flex items-center gap-1">
                      <Thermometer className="w-3 h-3" /> temp: {d.inscription.temperature}
                    </p>
                  )}
                  {d.inscription?.systemPrompt && (
                    <p className="text-xs text-muted-foreground font-mono truncate max-w-[200px]">
                      prompt: {d.inscription.systemPrompt.slice(0, 60)}…
                    </p>
                  )}
                </TooltipContent>
              </Tooltip>
            )}
            {d.fallbackProvider && (
              <Tooltip>
                <TooltipTrigger asChild>
                  <div className="flex items-center gap-1.5 px-2 py-1.5 rounded bg-slate-800/60 border border-dashed border-slate-600/40 cursor-default">
                    {d.fallbackProvider.providerType === "lm_studio" || d.fallbackProvider.providerType === "openai_compatible" ? (
                      <Cpu className="w-3 h-3 text-violet-400/60 flex-shrink-0" />
                    ) : (
                      <Cloud className="w-3 h-3 text-blue-400/60 flex-shrink-0" />
                    )}
                    <span className="text-xs text-slate-400 truncate flex-1">
                      {d.fallbackProvider.modelId || d.fallbackProvider.displayName}
                    </span>
                    <Badge variant="outline" className="text-[10px] px-1 py-0 h-4 border-amber-500/50 text-amber-400">Fallback</Badge>
                  </div>
                </TooltipTrigger>
                <TooltipContent side="right" className="max-w-xs">
                  <p className="font-semibold">{d.fallbackProvider.displayName}</p>
                  {d.fallbackProvider.modelId && (
                    <p className="text-xs text-muted-foreground font-mono">{d.fallbackProvider.modelId}</p>
                  )}
                  <p className="text-xs text-muted-foreground">Type: {d.fallbackProvider.providerType}</p>
                </TooltipContent>
              </Tooltip>
            )}
          </>
        )}
      </div>

      {/* Footer: provider summary */}
      {hasInscription && (d.primaryProvider || d.fallbackProvider) && (
        <div className={`px-3 py-1 border-t ${meta.borderColor} flex items-center gap-1`}>
          <Users className="w-3 h-3 text-slate-500" />
          <span className="text-[10px] text-slate-500 truncate">
            {[d.primaryProvider?.displayName, d.fallbackProvider ? `→ ${d.fallbackProvider.displayName}` : null].filter(Boolean).join(" ")}
          </span>
        </div>
      )}

      <Handle type="source" position={Position.Right} className="!bg-slate-400" />
    </div>
  );
}

const nodeTypes = { stage: StageNode };

// ─── Layout helpers ──────────────────────────────────────────────────────────

const COL_X_START = 40;
const COL_X_GAP = 290;
const ROW_Y_START = 40;
const ROW_Y_GAP = 170;

function buildNodesAndEdges(topology: TopologyStage[]): { nodes: Node[]; edges: Edge[] } {
  const topologyMap = new Map<string, TopologyStage>();
  for (const t of topology) {
    topologyMap.set(t.stage, t);
  }

  const nodes: Node[] = [];
  const edges: Edge[] = [];

  // Build nodes from PIPELINE_FLOW
  for (let col = 0; col < PIPELINE_FLOW.length; col++) {
    const stages = PIPELINE_FLOW[col];
    const totalRows = stages.length;
    for (let row = 0; row < totalRows; row++) {
      const stage = stages[row];
      const yOffset = (totalRows - 1) * ROW_Y_GAP / 2;
      const x = COL_X_START + col * COL_X_GAP;
      const y = ROW_Y_START + row * ROW_Y_GAP - yOffset + 200;

      if (stage === "__ingestion__") {
        nodes.push({
          id: stage,
          type: "stage",
          position: { x, y: 180 },
          data: { stage, isIngestion: true, assignments: [] },
        });
      } else {
        const t = topologyMap.get(stage);
        nodes.push({
          id: stage,
          type: "stage",
          position: { x, y },
          data: {
            stage,
            inscription: t?.inscription ?? null,
            primaryProvider: t?.primaryProvider ?? null,
            fallbackProvider: t?.fallbackProvider ?? null,
          },
        });
      }
    }
  }

  // Add HITL node below pass4
  const pass4Col = PIPELINE_FLOW.findIndex(col => col.includes("pass4_cloud_extraction"));
  if (pass4Col >= 0) {
    nodes.push({
      id: "__hitl__",
      type: "stage",
      position: {
        x: COL_X_START + pass4Col * COL_X_GAP,
        y: ROW_Y_START + 3 * ROW_Y_GAP + 200,
      },
      data: { stage: "__hitl__", isHitl: true, inscription: null, primaryProvider: null, fallbackProvider: null },
    });
    edges.push({
      id: "pass4->hitl",
      source: "pass4_cloud_extraction",
      target: "__hitl__",
      type: "smoothstep",
      animated: false,
      style: { stroke: "#f43f5e", strokeWidth: 2, strokeDasharray: "6,4" },
      label: "HITL flag",
      labelStyle: { fill: "#f43f5e", fontSize: 10 },
      markerEnd: { type: MarkerType.ArrowClosed, color: "#f43f5e", width: 14, height: 14 },
    });
  }

  // Build edges
  for (const { from, to, style } of FLOW_EDGES) {
    const isFallback = style === "fallback";
    const isConditional = style === "conditional";
    edges.push({
      id: `${from}->${to}`,
      source: from,
      target: to,
      type: "smoothstep",
      animated: !isFallback && !isConditional,
      label: isFallback ? "if fails" : undefined,
      labelStyle: isFallback ? { fill: "#f59e0b", fontSize: 10 } : undefined,
      style: {
        stroke: isFallback ? "#f59e0b" : "#6366f1",
        strokeWidth: isFallback ? 2 : 1.5,
        strokeDasharray: isFallback ? "5,5" : undefined,
      },
      markerEnd: {
        type: MarkerType.ArrowClosed,
        color: isFallback ? "#f59e0b" : "#6366f1",
        width: 16,
        height: 16,
      },
    });
  }

  return { nodes, edges };
}

// ─── Main component ──────────────────────────────────────────────────────────

interface PipelineVisualizationProps {
  topology: TopologyStage[];
  isLoading?: boolean;
}

export function PipelineVisualization({ topology, isLoading }: PipelineVisualizationProps) {
  const { nodes: initialNodes, edges: initialEdges } = useMemo(
    () => buildNodesAndEdges(topology),
    [topology]
  );

  const [nodes, , onNodesChange] = useNodesState(initialNodes);
  const [edges, , onEdgesChange] = useEdgesState(initialEdges);

  const onInit = useCallback(() => {}, []);

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-full text-slate-400">
        <div className="flex flex-col items-center gap-3">
          <div className="w-8 h-8 border-2 border-indigo-500 border-t-transparent rounded-full animate-spin" />
          <span className="text-sm">Weaving the pipeline threads…</span>
        </div>
      </div>
    );
  }

  return (
    <div className="w-full h-full" style={{ background: "transparent" }}>
      <ReactFlow
        nodes={nodes}
        edges={edges}
        onNodesChange={onNodesChange}
        onEdgesChange={onEdgesChange}
        onInit={onInit}
        nodeTypes={nodeTypes}
        fitView
        fitViewOptions={{ padding: 0.15 }}
        minZoom={0.2}
        maxZoom={1.5}
        proOptions={{ hideAttribution: true }}
        colorMode="dark"
      >
        <Background
          variant={BackgroundVariant.Dots}
          gap={20}
          size={1}
          color="#334155"
        />
        <Controls showInteractive={false} className="!bg-slate-800/80 !border-slate-700/50 !rounded-lg" />
        <MiniMap
          nodeColor={(n) => {
            if (n.data?.isIngestion) return "#64748b";
            if (n.data?.isHitl) return "#f43f5e";
            const meta = STAGE_META[(n.data?.stage as string) ?? ""];
            if (!meta) return "#64748b";
            if (meta.phase === 1) return "#8b5cf6";
            if (meta.phase === 2) return "#3b82f6";
            return "#10b981";
          }}
          maskColor="rgba(15,23,42,0.7)"
          className="!bg-slate-900/80 !border-slate-700/50 !rounded-lg"
        />
      </ReactFlow>

      {/* Phase legend */}
      <div className="absolute bottom-16 left-4 flex flex-col gap-1.5 pointer-events-none">
        <div className="flex items-center gap-2 px-2 py-1 rounded bg-slate-900/80 border border-slate-700/50">
          <div className="w-3 h-3 rounded-sm bg-violet-500/60 border border-violet-500" />
          <span className="text-[10px] text-violet-300 font-medium">Phase 1 — Ingestion & Layout</span>
        </div>
        <div className="flex items-center gap-2 px-2 py-1 rounded bg-slate-900/80 border border-slate-700/50">
          <div className="w-3 h-3 rounded-sm bg-blue-500/60 border border-blue-500" />
          <span className="text-[10px] text-blue-300 font-medium">Phase 2 — OCR & Validation</span>
        </div>
        <div className="flex items-center gap-2 px-2 py-1 rounded bg-slate-900/80 border border-slate-700/50">
          <div className="w-3 h-3 rounded-sm bg-emerald-500/60 border border-emerald-500" />
          <span className="text-[10px] text-emerald-300 font-medium">Phase 3 — Storage & Embeddings</span>
        </div>
        <div className="flex items-center gap-2 px-2 py-1 rounded bg-slate-900/80 border border-slate-700/50">
          <div className="w-3 h-0.5 bg-amber-500" style={{ borderTop: "2px dashed #f59e0b" }} />
          <span className="text-[10px] text-amber-300 font-medium">Conditional / Fallback path</span>
        </div>
        <div className="flex items-center gap-2 px-2 py-1 rounded bg-slate-900/80 border border-slate-700/50">
          <div className="w-3 h-0.5 bg-rose-500" style={{ borderTop: "2px dashed #f43f5e" }} />
          <span className="text-[10px] text-rose-300 font-medium">HITL escalation path</span>
        </div>
      </div>
    </div>
  );
}
