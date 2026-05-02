import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { toast } from "sonner";
import {
  GitBranch, Plus, Trash2, Loader2, Layers, ChevronDown, ChevronUp,
  Settings2, Thermometer, FileText, Edit3, Check, X,
} from "lucide-react";

// ─── Phase groupings for visual organisation ─────────────────────────────────

const PHASE_GROUPS: Record<string, { label: string; description: string; color: string }> = {
  "Phase 1 — Ingestion & Layout": {
    label: "Phase 1 — Ingestion & Layout",
    description: "Non-OCR tasks: document registration, PDF conversion, layout classification, bbox detection",
    color: "text-blue-400",
  },
  "Phase 2 — OCR Extraction": {
    label: "Phase 2 — OCR Extraction",
    description: "Multi-step OCR: layout analysis, content extraction, quality validation, retry escalation",
    color: "text-amber-400",
  },
  "Phase 3 — Artifact Storage": {
    label: "Phase 3 — Artifact Storage",
    description: "Persisting all pipeline outputs: JSONs, images, cross-page continuity data",
    color: "text-green-400",
  },
};

const STAGE_PHASE_MAP: Record<string, string> = {
  layout_analysis:        "Phase 1 — Ingestion & Layout",
  bbox_detection:         "Phase 1 — Ingestion & Layout",
  content_type_classify:  "Phase 1 — Ingestion & Layout",
  ocr_extraction:         "Phase 2 — OCR Extraction",
  content_break_detect:   "Phase 2 — OCR Extraction",
  quality_validation:     "Phase 2 — OCR Extraction",
  pass2_cloud_extraction: "Phase 2 — OCR Extraction",
  pass3_cloud_extraction: "Phase 2 — OCR Extraction",
  pass4_cloud_extraction: "Phase 2 — OCR Extraction",
  summarisation:          "Phase 2 — OCR Extraction",
  artifact_storage:       "Phase 3 — Artifact Storage",
  embedding_generation:   "Phase 3 — Artifact Storage",
  database_load:          "Phase 3 — Artifact Storage",
};

// ─── Edit Assignment Dialog ───────────────────────────────────────────────────

interface EditDialogProps {
  assignment: {
    id: number;
    modelName: string;
    pipelineStage: string;
    priority: number;
    isActive: boolean;
    providerName: string;
    systemPrompt?: string | null;
    temperature?: number | null;
    llmSettings?: Record<string, unknown> | null;
  };
  onClose: () => void;
}

function EditAssignmentDialog({ assignment, onClose }: EditDialogProps) {
  const [systemPrompt, setSystemPrompt] = useState(assignment.systemPrompt ?? "");
  const [temperature, setTemperature] = useState<string>(
    assignment.temperature !== null && assignment.temperature !== undefined
      ? String(assignment.temperature)
      : ""
  );

  const updateMutation = trpc.assignments.update.useMutation({
    onSuccess: () => { toast.success("Assignment updated."); onClose(); },
    onError: (e) => toast.error(e.message),
  });

  const handleSave = () => {
    updateMutation.mutate({
      id: assignment.id,
      systemPrompt: systemPrompt || undefined,
      temperature: temperature !== "" ? Number(temperature) : undefined,
    });
  };

  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Settings2 className="h-5 w-5 text-amber-400" />
            Configure Assignment
          </DialogTitle>
          <DialogDescription>
            <span className="font-mono text-sm">{assignment.modelName}</span>
            {" "}via {assignment.providerName} — stage:{" "}
            <span className="font-mono text-xs">{assignment.pipelineStage}</span>
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-5">
          {/* System Prompt */}
          <div className="space-y-2">
            <Label className="flex items-center gap-2">
              <FileText className="h-4 w-4 text-amber-400" />
              System Prompt
              <span className="text-muted-foreground text-xs font-normal">(stage-specific instructions for this model)</span>
            </Label>
            <Textarea
              placeholder={`Enter the system prompt for the ${assignment.pipelineStage} stage…\n\nExample: "You are an expert document layout analyzer for TTRPG materials. Your task is to identify all distinct visual elements and their bounding boxes."`}
              value={systemPrompt}
              onChange={e => setSystemPrompt(e.target.value)}
              className="min-h-[200px] font-mono text-xs resize-y bg-muted/30"
            />
            <p className="text-xs text-muted-foreground">
              This prompt is injected as the system message for every LLM call at this stage.
              Leave blank to use the global default from the System Prompts library.
            </p>
          </div>

          <Separator />

          {/* Temperature */}
          <div className="space-y-2">
            <Label className="flex items-center gap-2">
              <Thermometer className="h-4 w-4 text-amber-400" />
              Temperature
              <span className="text-muted-foreground text-xs font-normal">(0.0 = deterministic, 1.0 = creative)</span>
            </Label>
            <div className="flex items-center gap-3">
              <Input
                type="number"
                min={0}
                max={2}
                step={0.05}
                placeholder="e.g. 0.1"
                value={temperature}
                onChange={e => setTemperature(e.target.value)}
                className="w-32 bg-muted/30"
              />
              <div className="flex gap-1">
                {[0.0, 0.1, 0.3, 0.7, 1.0].map(t => (
                  <Badge
                    key={t}
                    variant="outline"
                    className="cursor-pointer hover:bg-accent text-xs"
                    onClick={() => setTemperature(String(t))}
                  >
                    {t}
                  </Badge>
                ))}
              </div>
            </div>
            <p className="text-xs text-muted-foreground">
              Recommended: 0.0–0.1 for OCR/extraction stages, 0.3–0.5 for summarisation, 0.7+ for creative tasks.
              Leave blank to use the provider default.
            </p>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button onClick={handleSave} disabled={updateMutation.isPending}>
            {updateMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Check className="h-4 w-4 mr-2" />}
            Save Configuration
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────

export default function TheAssignments() {
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [expandedPhases, setExpandedPhases] = useState<Record<string, boolean>>({
    "Phase 1 — Ingestion & Layout": true,
    "Phase 2 — OCR Extraction": true,
    "Phase 3 — Artifact Storage": true,
  });

  const { data: assignments, isLoading, refetch } = trpc.assignments.list.useQuery();
  const { data: stages } = trpc.assignments.stages.useQuery();
  const { data: providers } = trpc.providers.list.useQuery();

  const createMutation = trpc.assignments.create.useMutation({
    onSuccess: () => { toast.success("Assignment inscribed."); refetch(); setIsCreateOpen(false); },
    onError: (e) => toast.error(e.message),
  });

  const updateMutation = trpc.assignments.update.useMutation({
    onSuccess: () => { toast.success("Assignment updated."); refetch(); },
    onError: (e) => toast.error(e.message),
  });

  const deleteMutation = trpc.assignments.delete.useMutation({
    onSuccess: () => { toast.success("Assignment removed."); refetch(); },
    onError: (e) => toast.error(e.message),
  });

  const [form, setForm] = useState({
    providerId: 0,
    modelName: "",
    pipelineStage: "ocr_extraction" as string,
    priority: 1,
    systemPrompt: "",
    temperature: "",
  });

  const resetForm = () => setForm({
    providerId: 0, modelName: "", pipelineStage: "ocr_extraction", priority: 1,
    systemPrompt: "", temperature: "",
  });

  const handleCreate = () => {
    createMutation.mutate({
      providerId: form.providerId,
      modelName: form.modelName,
      pipelineStage: form.pipelineStage as any,
      priority: form.priority,
      configOverrides: {
        ...(form.systemPrompt ? { systemPrompt: form.systemPrompt } : {}),
        ...(form.temperature !== "" ? { temperature: Number(form.temperature) } : {}),
      },
    });
  };

  // Group assignments by pipeline stage
  const groupedByStage = assignments?.reduce((acc: Record<string, typeof assignments>, a) => {
    const stage = a.pipelineStage;
    if (!acc[stage]) acc[stage] = [];
    acc[stage].push(a);
    return acc;
  }, {} as Record<string, typeof assignments>) ?? {};

  // Group stages by phase
  const stagesByPhase = stages?.reduce((acc: Record<string, typeof stages>, s) => {
    const phase = STAGE_PHASE_MAP[s.id] ?? "Other";
    if (!acc[phase]) acc[phase] = [];
    acc[phase].push(s);
    return acc;
  }, {} as Record<string, typeof stages>) ?? {};

  const editingAssignment = editingId !== null
    ? assignments?.find(a => a.id === editingId)
    : null;

  const togglePhase = (phase: string) => {
    setExpandedPhases(prev => ({ ...prev, [phase]: !prev[phase] }));
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold font-serif flex items-center gap-3">
            <GitBranch className="h-8 w-8 text-amber-400" />
            The Assignments
          </h1>
          <p className="text-muted-foreground mt-1">
            Map models to pipeline stages. Each stage has its own system prompt, temperature, and fallback chain.
          </p>
        </div>
        <Dialog open={isCreateOpen} onOpenChange={setIsCreateOpen}>
          <DialogTrigger asChild>
            <Button onClick={resetForm}>
              <Plus className="h-4 w-4 mr-2" /> Inscribe Assignment
            </Button>
          </DialogTrigger>
          <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>Inscribe New Assignment</DialogTitle>
              <DialogDescription>Assign a model to a pipeline stage with optional system prompt and temperature.</DialogDescription>
            </DialogHeader>
            <div className="space-y-4">
              <div className="space-y-2">
                <Label>Pipeline Stage</Label>
                <Select value={form.pipelineStage} onValueChange={v => setForm(f => ({ ...f, pipelineStage: v }))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {Object.entries(stagesByPhase).map(([phase, phaseStages]) => (
                      <div key={phase}>
                        <div className="px-2 py-1 text-xs font-semibold text-muted-foreground uppercase tracking-wider">{phase}</div>
                        {phaseStages?.map(s => (
                          <SelectItem key={s.id} value={s.id}>{s.label}</SelectItem>
                        ))}
                      </div>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Provider</Label>
                <Select value={form.providerId ? String(form.providerId) : ""} onValueChange={v => setForm(f => ({ ...f, providerId: Number(v) }))}>
                  <SelectTrigger><SelectValue placeholder="Select a provider..." /></SelectTrigger>
                  <SelectContent>
                    {providers?.filter(p => p.isActive).map(p => (
                      <SelectItem key={p.id} value={String(p.id)}>{p.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Model Name</Label>
                <Input placeholder="e.g., gpt-4o, llava-v1.6, gemini-2.5-pro" value={form.modelName} onChange={e => setForm(f => ({ ...f, modelName: e.target.value }))} />
                {form.providerId > 0 && providers?.find(p => p.id === form.providerId)?.availableModels && (
                  <div className="flex flex-wrap gap-1 mt-1">
                    {(providers.find(p => p.id === form.providerId)?.availableModels as string[] ?? []).slice(0, 6).map((m: string) => (
                      <Badge key={m} variant="outline" className="text-xs cursor-pointer hover:bg-accent" onClick={() => setForm(f => ({ ...f, modelName: m }))}>
                        {m}
                      </Badge>
                    ))}
                  </div>
                )}
              </div>
              <div className="space-y-2">
                <Label>Priority <span className="text-muted-foreground text-xs">(1 = primary, higher = fallback)</span></Label>
                <Input type="number" min={1} max={10} value={form.priority} onChange={e => setForm(f => ({ ...f, priority: Number(e.target.value) }))} />
              </div>
              <Separator />
              <div className="space-y-2">
                <Label className="flex items-center gap-2">
                  <FileText className="h-3.5 w-3.5 text-amber-400" />
                  System Prompt <span className="text-muted-foreground text-xs font-normal">(optional)</span>
                </Label>
                <Textarea
                  placeholder="Stage-specific system prompt…"
                  value={form.systemPrompt}
                  onChange={e => setForm(f => ({ ...f, systemPrompt: e.target.value }))}
                  className="min-h-[80px] font-mono text-xs resize-y bg-muted/30"
                />
              </div>
              <div className="space-y-2">
                <Label className="flex items-center gap-2">
                  <Thermometer className="h-3.5 w-3.5 text-amber-400" />
                  Temperature <span className="text-muted-foreground text-xs font-normal">(optional, 0.0–2.0)</span>
                </Label>
                <Input
                  type="number" min={0} max={2} step={0.05}
                  placeholder="e.g. 0.1"
                  value={form.temperature}
                  onChange={e => setForm(f => ({ ...f, temperature: e.target.value }))}
                  className="w-32"
                />
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setIsCreateOpen(false)}>Cancel</Button>
              <Button onClick={handleCreate} disabled={!form.modelName || !form.providerId || createMutation.isPending}>
                {createMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
                Inscribe
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>

      {/* Edit Dialog */}
      {editingAssignment && (
        <EditAssignmentDialog
          assignment={editingAssignment as any}
          onClose={() => { setEditingId(null); refetch(); }}
        />
      )}

      {/* Assignment Matrix grouped by phase then stage */}
      {isLoading ? (
        <div className="flex items-center justify-center py-12">
          <Loader2 className="h-8 w-8 animate-spin text-amber-400" />
        </div>
      ) : (
        <div className="space-y-6">
          {Object.entries(PHASE_GROUPS).map(([phaseKey, phaseInfo]) => {
            const phaseStages = stagesByPhase[phaseKey] ?? [];
            const isExpanded = expandedPhases[phaseKey] ?? true;
            const totalAssignments = phaseStages.reduce((sum, s) => sum + (groupedByStage[s.id]?.length ?? 0), 0);

            return (
              <div key={phaseKey} className="rounded-xl border border-border/50 overflow-hidden">
                {/* Phase Header */}
                <button
                  className="w-full flex items-center justify-between p-4 bg-muted/20 hover:bg-muted/30 transition-colors"
                  onClick={() => togglePhase(phaseKey)}
                >
                  <div className="flex items-center gap-3">
                    <Layers className={`h-5 w-5 ${phaseInfo.color}`} />
                    <div className="text-left">
                      <div className={`font-semibold ${phaseInfo.color}`}>{phaseKey}</div>
                      <div className="text-xs text-muted-foreground mt-0.5">{phaseInfo.description}</div>
                    </div>
                  </div>
                  <div className="flex items-center gap-3">
                    <Badge variant="outline" className="text-xs">
                      {totalAssignments} assignment{totalAssignments !== 1 ? "s" : ""}
                    </Badge>
                    {isExpanded ? <ChevronUp className="h-4 w-4 text-muted-foreground" /> : <ChevronDown className="h-4 w-4 text-muted-foreground" />}
                  </div>
                </button>

                {/* Phase Stages */}
                {isExpanded && (
                  <div className="divide-y divide-border/30">
                    {phaseStages.map(stage => {
                      const stageAssignments = groupedByStage[stage.id] ?? [];
                      return (
                        <div key={stage.id} className="p-4">
                          <div className="flex items-center justify-between mb-3">
                            <div className="flex items-center gap-2">
                              <span className="font-medium text-sm">{stage.label}</span>
                              <Badge variant="secondary" className="text-xs font-mono">{stage.id}</Badge>
                              <Badge variant={stageAssignments.length > 0 ? "default" : "outline"} className="text-xs">
                                {stageAssignments.length} model{stageAssignments.length !== 1 ? "s" : ""}
                              </Badge>
                            </div>
                          </div>

                          {stageAssignments.length > 0 ? (
                            <div className="space-y-2">
                              {stageAssignments
                                .sort((a: any, b: any) => a.priority - b.priority)
                                .map((assignment: any, idx: number) => (
                                  <div
                                    key={assignment.id}
                                    className={`flex items-start justify-between p-3 rounded-lg border gap-3 ${assignment.isActive ? "bg-card" : "bg-muted opacity-60"}`}
                                  >
                                    <div className="flex items-start gap-3 flex-1 min-w-0">
                                      <div className="flex items-center justify-center w-6 h-6 rounded-full bg-amber-500/20 text-amber-400 text-xs font-bold flex-shrink-0 mt-0.5">
                                        {assignment.priority}
                                      </div>
                                      <div className="flex-1 min-w-0">
                                        <div className="flex items-center gap-2 flex-wrap">
                                          <span className="font-mono text-sm font-medium">{assignment.modelName}</span>
                                          <span className="text-muted-foreground text-xs">via {assignment.providerName}</span>
                                          {idx === 0 && <Badge className="bg-amber-500/20 text-amber-400 border-amber-500/30 text-xs">Primary</Badge>}
                                          {idx > 0 && <Badge variant="outline" className="text-xs">Fallback #{idx}</Badge>}
                                        </div>
                                        {/* System Prompt preview */}
                                        {assignment.systemPrompt && (
                                          <div className="mt-1.5 flex items-start gap-1.5">
                                            <FileText className="h-3 w-3 text-amber-400/60 flex-shrink-0 mt-0.5" />
                                            <p className="text-xs text-muted-foreground font-mono truncate max-w-[400px]">
                                              {assignment.systemPrompt.slice(0, 80)}{assignment.systemPrompt.length > 80 ? "…" : ""}
                                            </p>
                                          </div>
                                        )}
                                        {/* Temperature badge */}
                                        {assignment.temperature !== null && assignment.temperature !== undefined && (
                                          <div className="mt-1 flex items-center gap-1">
                                            <Thermometer className="h-3 w-3 text-amber-400/60" />
                                            <span className="text-xs text-muted-foreground">temp: {assignment.temperature}</span>
                                          </div>
                                        )}
                                      </div>
                                    </div>
                                    <div className="flex items-center gap-1 flex-shrink-0">
                                      <Button
                                        variant="ghost"
                                        size="sm"
                                        className="h-8 px-2 text-xs"
                                        onClick={() => setEditingId(assignment.id)}
                                      >
                                        <Edit3 className="h-3.5 w-3.5 mr-1" />
                                        Configure
                                      </Button>
                                      <Button
                                        variant="ghost"
                                        size="sm"
                                        className="h-8 px-2 text-xs"
                                        onClick={() => updateMutation.mutate({ id: assignment.id, isActive: !assignment.isActive })}
                                      >
                                        {assignment.isActive ? "Disable" : "Enable"}
                                      </Button>
                                      <Button
                                        variant="ghost"
                                        size="sm"
                                        className="h-8 w-8 p-0 text-destructive"
                                        onClick={() => { if (confirm("Remove this assignment?")) deleteMutation.mutate({ id: assignment.id }); }}
                                      >
                                        <Trash2 className="h-3.5 w-3.5" />
                                      </Button>
                                    </div>
                                  </div>
                                ))}
                            </div>
                          ) : (
                            <div className="text-xs text-muted-foreground italic py-2 pl-9">
                              No models assigned to this stage yet.
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
