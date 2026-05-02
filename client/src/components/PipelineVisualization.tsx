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
  FileText,
  GitBranch,
  Layers,
  MessageSquare,
  Search,
  Sparkles,
  Table,
  Users,
  Zap,
} from "lucide-react";

// ─── Stage metadata ─────────────────────────────────────────────────────────

export const STAGE_META: Record<string, {
  label: string;
  description: string;
  icon: React.ComponentType<{ className?: string }>;
  color: string;
  bgColor: string;
  borderColor: string;
  group: "ingestion" | "local_vlm" | "cloud_llm" | "enrichment" | "output";
}> = {
  layout_analysis: {
    label: "Layout Analysis",
    description: "Pass 1 — local VLM detects page structure, columns, headers, and regions",
    icon: Layers,
    color: "text-violet-300",
    bgColor: "bg-violet-950/60",
    borderColor: "border-violet-500/60",
    group: "local_vlm",
  },
  bbox_detection: {
    label: "BBox Detection",
    description: "Bounding-box detection for text blocks, tables, and images",
    icon: Search,
    color: "text-violet-300",
    bgColor: "bg-violet-950/60",
    borderColor: "border-violet-500/60",
    group: "local_vlm",
  },
  ocr_extraction: {
    label: "OCR Extraction",
    description: "Pass 2 — cloud LLM high-fidelity text extraction with multi-model consensus",
    icon: FileText,
    color: "text-blue-300",
    bgColor: "bg-blue-950/60",
    borderColor: "border-blue-500/60",
    group: "cloud_llm",
  },
  tabular_data: {
    label: "Tabular Data",
    description: "Structured extraction of tables, stat blocks, and lists",
    icon: Table,
    color: "text-blue-300",
    bgColor: "bg-blue-950/60",
    borderColor: "border-blue-500/60",
    group: "cloud_llm",
  },
  image_classification: {
    label: "Image Classification",
    description: "Classify embedded images: maps, illustrations, diagrams, portraits",
    icon: Brain,
    color: "text-cyan-300",
    bgColor: "bg-cyan-950/60",
    borderColor: "border-cyan-500/60",
    group: "cloud_llm",
  },
  embedding: {
    label: "Embedding",
    description: "Generate vector embeddings for RAG retrieval",
    icon: Zap,
    color: "text-emerald-300",
    bgColor: "bg-emerald-950/60",
    borderColor: "border-emerald-500/60",
    group: "enrichment",
  },
  enrichment: {
    label: "Enrichment",
    description: "Build content hierarchy, generate summaries, link entities",
    icon: Sparkles,
    color: "text-emerald-300",
    bgColor: "bg-emerald-950/60",
    borderColor: "border-emerald-500/60",
    group: "enrichment",
  },
  referee: {
    label: "Referee",
    description: "Post-OCR validation and look-ahead buffer consistency check",
    icon: GitBranch,
    color: "text-amber-300",
    bgColor: "bg-amber-950/60",
    borderColor: "border-amber-500/60",
    group: "cloud_llm",
  },
  voice_of_arkanum: {
    label: "Voice of Arkanum",
    description: "Narrative synthesis — the model that speaks the lore in-game",
    icon: MessageSquare,
    color: "text-rose-300",
    bgColor: "bg-rose-950/60",
    borderColor: "border-rose-500/60",
    group: "output",
  },
  summarization: {
    label: "Summarization",
    description: "Hierarchical summarization of sections, chapters, and books",
    icon: FileText,
    color: "text-orange-300",
    bgColor: "bg-orange-950/60",
    borderColor: "border-orange-500/60",
    group: "enrichment",
  },
};

// ─── Pipeline flow order (left-to-right) ────────────────────────────────────

const PIPELINE_FLOW: string[][] = [
  // Column 0 — ingestion (virtual, no model)
  ["__ingestion__"],
  // Column 1 — local VLM pass
  ["layout_analysis", "bbox_detection"],
  // Column 2 — cloud LLM pass
  ["ocr_extraction", "tabular_data", "image_classification"],
  // Column 3 — validation
  ["referee"],
  // Column 4 — enrichment
  ["embedding", "enrichment", "summarization"],
  // Column 5 — output
  ["voice_of_arkanum"],
];

const FLOW_EDGES: Array<{ from: string; to: string }> = [
  { from: "__ingestion__", to: "layout_analysis" },
  { from: "__ingestion__", to: "bbox_detection" },
  { from: "layout_analysis", to: "ocr_extraction" },
  { from: "bbox_detection", to: "tabular_data" },
  { from: "layout_analysis", to: "image_classification" },
  { from: "ocr_extraction", to: "referee" },
  { from: "tabular_data", to: "referee" },
  { from: "image_classification", to: "referee" },
  { from: "referee", to: "embedding" },
  { from: "referee", to: "enrichment" },
  { from: "referee", to: "summarization" },
  { from: "enrichment", to: "voice_of_arkanum" },
  { from: "summarization", to: "voice_of_arkanum" },
];

// ─── Types ───────────────────────────────────────────────────────────────────

export interface AssignmentInfo {
  id: number;
  modelName: string;
  priority: number;
  isActive: boolean;
  providerName: string;
  providerType: string;
  configOverrides?: Record<string, unknown> | null;
}

export interface TopologyStage {
  stage: string;
  assignments: AssignmentInfo[];
}

// ─── Custom node: Stage ──────────────────────────────────────────────────────

function StageNode({ data }: NodeProps) {
  const d = data as {
    stage: string;
    assignments: AssignmentInfo[];
    isIngestion?: boolean;
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

  const meta = STAGE_META[d.stage];
  if (!meta) return null;
  const Icon = meta.icon;

  const primary = d.assignments.filter(a => a.isActive && a.priority === 1);
  const fallbacks = d.assignments.filter(a => a.isActive && a.priority > 1).sort((a, b) => a.priority - b.priority);
  const inactive = d.assignments.filter(a => !a.isActive);

  return (
    <div className={`flex flex-col min-w-[200px] max-w-[240px] rounded-xl border-2 ${meta.borderColor} ${meta.bgColor} shadow-lg overflow-hidden`}>
      <Handle type="target" position={Position.Left} className="!bg-slate-400" />

      {/* Header */}
      <div className={`flex items-center gap-2 px-3 py-2 border-b ${meta.borderColor}`}>
        <Icon className={`w-4 h-4 flex-shrink-0 ${meta.color}`} />
        <span className={`text-xs font-bold uppercase tracking-wider ${meta.color}`}>{meta.label}</span>
      </div>

      {/* Assignments */}
      <div className="flex flex-col gap-1 p-2">
        {d.assignments.length === 0 ? (
          <div className="flex items-center gap-1.5 px-2 py-1.5 rounded bg-slate-700/40 border border-dashed border-slate-600/50">
            <span className="text-xs text-slate-500 italic">No model assigned</span>
          </div>
        ) : (
          <>
            {primary.map(a => (
              <Tooltip key={a.id}>
                <TooltipTrigger asChild>
                  <div className="flex items-center gap-1.5 px-2 py-1.5 rounded bg-slate-700/60 border border-slate-600/40 cursor-default">
                    {a.providerType === "local_vlm" ? (
                      <Cpu className="w-3 h-3 text-violet-400 flex-shrink-0" />
                    ) : (
                      <Cloud className="w-3 h-3 text-blue-400 flex-shrink-0" />
                    )}
                    <span className="text-xs text-slate-200 font-medium truncate flex-1">{a.modelName}</span>
                    <Badge variant="outline" className="text-[10px] px-1 py-0 h-4 border-emerald-500/50 text-emerald-400">P1</Badge>
                  </div>
                </TooltipTrigger>
                <TooltipContent side="right" className="max-w-xs">
                  <p className="font-semibold">{a.modelName}</p>
                  <p className="text-xs text-muted-foreground">Provider: {a.providerName}</p>
                  <p className="text-xs text-muted-foreground">Priority: {a.priority} (Primary)</p>
                  {a.configOverrides && Object.keys(a.configOverrides).length > 0 && (
                    <p className="text-xs text-muted-foreground mt-1">
                      Config: {JSON.stringify(a.configOverrides)}
                    </p>
                  )}
                </TooltipContent>
              </Tooltip>
            ))}
            {fallbacks.map(a => (
              <Tooltip key={a.id}>
                <TooltipTrigger asChild>
                  <div className="flex items-center gap-1.5 px-2 py-1.5 rounded bg-slate-800/60 border border-dashed border-slate-600/40 cursor-default">
                    {a.providerType === "local_vlm" ? (
                      <Cpu className="w-3 h-3 text-violet-400/60 flex-shrink-0" />
                    ) : (
                      <Cloud className="w-3 h-3 text-blue-400/60 flex-shrink-0" />
                    )}
                    <span className="text-xs text-slate-400 truncate flex-1">{a.modelName}</span>
                    <Badge variant="outline" className="text-[10px] px-1 py-0 h-4 border-amber-500/50 text-amber-400">
                      F{a.priority - 1}
                    </Badge>
                  </div>
                </TooltipTrigger>
                <TooltipContent side="right" className="max-w-xs">
                  <p className="font-semibold">{a.modelName}</p>
                  <p className="text-xs text-muted-foreground">Provider: {a.providerName}</p>
                  <p className="text-xs text-muted-foreground">Fallback #{a.priority - 1}</p>
                </TooltipContent>
              </Tooltip>
            ))}
            {inactive.length > 0 && (
              <div className="flex items-center gap-1 mt-0.5">
                <span className="text-[10px] text-slate-600">{inactive.length} inactive</span>
              </div>
            )}
          </>
        )}
      </div>

      {/* Footer: provider summary */}
      {d.assignments.length > 0 && (
        <div className={`px-3 py-1 border-t ${meta.borderColor} flex items-center gap-1`}>
          <Users className="w-3 h-3 text-slate-500" />
          <span className="text-[10px] text-slate-500 truncate">
            {Array.from(new Set(d.assignments.map(a => a.providerName))).join(", ")}
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
const COL_X_GAP = 280;
const ROW_Y_START = 40;
const ROW_Y_GAP = 160;

function buildNodesAndEdges(topology: TopologyStage[]): { nodes: Node[]; edges: Edge[] } {
  const assignmentMap = new Map<string, AssignmentInfo[]>();
  for (const t of topology) {
    assignmentMap.set(t.stage, t.assignments);
  }

  const nodes: Node[] = [];
  const edges: Edge[] = [];

  // Build nodes
  for (let col = 0; col < PIPELINE_FLOW.length; col++) {
    const stages = PIPELINE_FLOW[col];
    const totalRows = stages.length;
    for (let row = 0; row < totalRows; row++) {
      const stage = stages[row];
      const yOffset = (totalRows - 1) * ROW_Y_GAP / 2;
      const x = COL_X_START + col * COL_X_GAP;
      const y = ROW_Y_START + row * ROW_Y_GAP - yOffset + (PIPELINE_FLOW.length > 1 ? 200 : 0);

      if (stage === "__ingestion__") {
        nodes.push({
          id: stage,
          type: "stage",
          position: { x, y: 180 },
          data: { stage, isIngestion: true, assignments: [] },
        });
      } else {
        nodes.push({
          id: stage,
          type: "stage",
          position: { x, y },
          data: {
            stage,
            assignments: assignmentMap.get(stage) ?? [],
          },
        });
      }
    }
  }

  // Build edges
  for (const { from, to } of FLOW_EDGES) {
    const isFallback = false; // future: detect fallback chains
    edges.push({
      id: `${from}->${to}`,
      source: from,
      target: to,
      type: "smoothstep",
      animated: !isFallback,
      style: {
        stroke: isFallback ? "#f59e0b" : "#6366f1",
        strokeWidth: 1.5,
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
        minZoom={0.3}
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
        <Controls
          className="!bg-slate-800 !border-slate-700 [&>button]:!bg-slate-800 [&>button]:!border-slate-700 [&>button]:!text-slate-300 [&>button:hover]:!bg-slate-700"
        />
        <MiniMap
          className="!bg-slate-900 !border-slate-700"
          nodeColor={(n) => {
            if ((n.data as any).isIngestion) return "#475569";
            const meta = STAGE_META[(n.data as any).stage];
            if (!meta) return "#475569";
            const hasAssignments = ((n.data as any).assignments as AssignmentInfo[]).some(a => a.isActive);
            return hasAssignments ? "#6366f1" : "#374151";
          }}
          maskColor="rgba(15, 23, 42, 0.7)"
        />
      </ReactFlow>
    </div>
  );
}
