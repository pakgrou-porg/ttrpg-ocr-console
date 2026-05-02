import { useState, useEffect } from "react";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { Switch } from "@/components/ui/switch";
import { toast } from "sonner";
import {
  GitBranch, Loader2, Layers, ChevronDown, ChevronUp,
  Settings2, Thermometer, FileText, Check, Cpu, Cloud,
  AlertCircle, Pencil, Trash2, Hash,
} from "lucide-react";

// ─── Phase groupings ──────────────────────────────────────────────────────────

const PHASE_GROUPS: Record<string, { label: string; description: string; color: string; badgeClass: string }> = {
  "Phase 1 — Ingestion & Layout": {
    label: "Phase 1 — Ingestion & Layout",
    description: "Non-OCR tasks: document registration, PDF conversion, layout classification, bbox detection, child image extraction",
    color: "text-blue-400",
    badgeClass: "border-blue-500/50 text-blue-400 bg-blue-950/30",
  },
  "Phase 2 — OCR Extraction": {
    label: "Phase 2 — OCR Extraction",
    description: "Multi-step OCR: content extraction, quality validation, multi-pass retry escalation, summarisation",
    color: "text-amber-400",
    badgeClass: "border-amber-500/50 text-amber-400 bg-amber-950/30",
  },
  "Phase 3 — Artifact Storage": {
    label: "Phase 3 — Artifact Storage",
    description: "Persisting all pipeline outputs: per-page JSONs, raw/preprocessed PNGs, embeddings, database load",
    color: "text-green-400",
    badgeClass: "border-green-500/50 text-green-400 bg-green-950/30",
  },
};

const STAGE_PHASE_MAP: Record<string, string> = {
  document_registration:   "Phase 1 — Ingestion & Layout",
  document_intelligence:   "Phase 1 — Ingestion & Layout",
  pdf_to_png:              "Phase 1 — Ingestion & Layout",
  layout_analysis:         "Phase 1 — Ingestion & Layout",
  layout_classification:   "Phase 1 — Ingestion & Layout",
  bbox_detection:          "Phase 1 — Ingestion & Layout",
  content_type_classify:   "Phase 1 — Ingestion & Layout",
  child_image_extraction:  "Phase 1 — Ingestion & Layout",
  ocr_extraction:          "Phase 2 — OCR Extraction",
  content_break_detect:    "Phase 2 — OCR Extraction",
  quality_validation:      "Phase 2 — OCR Extraction",
  pass_comparison:         "Phase 2 — OCR Extraction",
  pass2_cloud_extraction:  "Phase 2 — OCR Extraction",
  pass3_cloud_extraction:  "Phase 2 — OCR Extraction",
  pass4_cloud_extraction:  "Phase 2 — OCR Extraction",
  summarisation:           "Phase 2 — OCR Extraction",
  artifact_storage:        "Phase 3 — Artifact Storage",
  embedding_generation:    "Phase 3 — Artifact Storage",
  database_load:           "Phase 3 — Artifact Storage",
};

// ─── Inscription Edit Dialog ──────────────────────────────────────────────────

interface InscriptionDialogProps {
  stage: string;
  stageLabel: string;
  inscription: {
    id?: number;
    primaryProviderId?: number | null;
    fallbackProviderId?: number | null;
    systemPrompt?: string | null;
    temperature?: number | null;
    maxTokens?: number | null;
    isActive?: boolean;
  } | null;
  providers: { id: number; displayName: string; name: string; modelId: string | null; providerType: string; isActive: boolean }[];
  onClose: () => void;
  onSaved: () => void;
}

function InscriptionDialog({ stage, stageLabel, inscription, providers, onClose, onSaved }: InscriptionDialogProps) {
  const [primaryProviderId, setPrimaryProviderId] = useState<string>(
    inscription?.primaryProviderId ? String(inscription.primaryProviderId) : ""
  );
  const [fallbackProviderId, setFallbackProviderId] = useState<string>(
    inscription?.fallbackProviderId ? String(inscription.fallbackProviderId) : ""
  );
  const [systemPrompt, setSystemPrompt] = useState(inscription?.systemPrompt ?? "");
  const [temperature, setTemperature] = useState<string>(
    inscription?.temperature !== null && inscription?.temperature !== undefined
      ? String(inscription.temperature)
      : ""
  );
  const [maxTokens, setMaxTokens] = useState<string>(
    inscription?.maxTokens !== null && inscription?.maxTokens !== undefined
      ? String(inscription.maxTokens)
      : ""
  );
  const [isActive, setIsActive] = useState(inscription?.isActive ?? true);

  const upsertMutation = trpc.assignments.upsert.useMutation({
    onSuccess: () => {
      toast.success(`Inscription saved for ${stageLabel}.`);
      onSaved();
      onClose();
    },
    onError: (e) => toast.error(e.message),
  });

  const handleSave = () => {
    upsertMutation.mutate({
      stage: stage as any,
      primaryProviderId: primaryProviderId ? Number(primaryProviderId) : null,
      fallbackProviderId: fallbackProviderId ? Number(fallbackProviderId) : null,
      systemPrompt: systemPrompt || undefined,
      temperature: temperature !== "" ? Number(temperature) : null,
      maxTokens: maxTokens !== "" ? Number(maxTokens) : null,
      isActive,
    });
  };

  const activeProviders = providers.filter(p => p.isActive);

  const providerLabel = (p: typeof providers[0]) =>
    `${p.displayName || p.name}${p.modelId ? ` — ${p.modelId}` : ""}`;

  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Settings2 className="h-5 w-5 text-amber-400" />
            Inscribe Stage: {stageLabel}
          </DialogTitle>
          <DialogDescription>
            Configure the primary and fallback providers for{" "}
            <span className="font-mono text-xs">{stage}</span>, along with the stage-specific
            system prompt and generation settings.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-5">
          {/* Primary Provider */}
          <div className="space-y-2">
            <Label className="flex items-center gap-2">
              <Cpu className="h-4 w-4 text-violet-400" />
              Primary Provider
            </Label>
            <Select value={primaryProviderId} onValueChange={setPrimaryProviderId}>
              <SelectTrigger>
                <SelectValue placeholder="Select primary provider…" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="">— None —</SelectItem>
                {activeProviders.map(p => (
                  <SelectItem key={p.id} value={String(p.id)}>
                    {providerLabel(p)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <p className="text-xs text-muted-foreground">
              The first provider to be called for this stage. Typically a local model for cost efficiency.
            </p>
          </div>

          {/* Fallback Provider */}
          <div className="space-y-2">
            <Label className="flex items-center gap-2">
              <Cloud className="h-4 w-4 text-blue-400" />
              Fallback Provider
              <span className="text-muted-foreground text-xs font-normal">(optional)</span>
            </Label>
            <Select value={fallbackProviderId} onValueChange={setFallbackProviderId}>
              <SelectTrigger>
                <SelectValue placeholder="Select fallback provider…" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="">— None —</SelectItem>
                {activeProviders.map(p => (
                  <SelectItem key={p.id} value={String(p.id)}>
                    {providerLabel(p)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <p className="text-xs text-muted-foreground">
              Used when the primary provider fails or is unavailable. Typically a cloud model.
            </p>
          </div>

          <Separator />

          {/* System Prompt */}
          <div className="space-y-2">
            <Label className="flex items-center gap-2">
              <FileText className="h-4 w-4 text-amber-400" />
              System Prompt
              <span className="text-muted-foreground text-xs font-normal">(stage-specific instructions)</span>
            </Label>
            <Textarea
              placeholder={`Enter the system prompt for the ${stageLabel} stage…\n\nExample: "You are an expert document layout analyzer for TTRPG materials. Your task is to identify all distinct visual elements and their bounding boxes on the page."`}
              value={systemPrompt}
              onChange={e => setSystemPrompt(e.target.value)}
              className="min-h-[160px] font-mono text-xs resize-y bg-muted/30"
            />
            <p className="text-xs text-muted-foreground">
              Injected as the system message for every LLM call at this stage.
              Leave blank to use no system prompt (or the provider default).
            </p>
          </div>

          <Separator />

          {/* Temperature + Max Tokens */}
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label className="flex items-center gap-2">
                <Thermometer className="h-4 w-4 text-amber-400" />
                Temperature
                <span className="text-muted-foreground text-xs font-normal">(0.0–2.0)</span>
              </Label>
              <Input
                type="number"
                min={0}
                max={2}
                step={0.05}
                placeholder="e.g. 0.1"
                value={temperature}
                onChange={e => setTemperature(e.target.value)}
                className="bg-muted/30"
              />
              <div className="flex flex-wrap gap-1">
                {[0.0, 0.1, 0.3, 0.5, 0.7, 1.0].map(t => (
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
              <p className="text-xs text-muted-foreground">
                0.0–0.1 for OCR/extraction; 0.3–0.5 for summarisation. Blank = provider default.
              </p>
            </div>

            <div className="space-y-2">
              <Label className="flex items-center gap-2">
                <Hash className="h-4 w-4 text-amber-400" />
                Max Tokens
                <span className="text-muted-foreground text-xs font-normal">(optional)</span>
              </Label>
              <Input
                type="number"
                min={1}
                placeholder="e.g. 4096"
                value={maxTokens}
                onChange={e => setMaxTokens(e.target.value)}
                className="bg-muted/30"
              />
              <p className="text-xs text-muted-foreground">
                Override the provider's max token limit for this stage. Blank = provider default.
              </p>
            </div>
          </div>

          <Separator />

          {/* Active toggle */}
          <div className="flex items-center justify-between rounded-lg border p-3 bg-muted/20">
            <div>
              <Label>Inscription Active</Label>
              <p className="text-xs text-muted-foreground mt-0.5">
                Inactive inscriptions are skipped during pipeline execution.
              </p>
            </div>
            <Switch checked={isActive} onCheckedChange={setIsActive} />
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button onClick={handleSave} disabled={upsertMutation.isPending}>
            {upsertMutation.isPending
              ? <Loader2 className="h-4 w-4 animate-spin mr-2" />
              : <Check className="h-4 w-4 mr-2" />}
            Save Inscription
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────

export default function TheAssignments() {
  const [editingStage, setEditingStage] = useState<string | null>(null);
  const [expandedPhases, setExpandedPhases] = useState<Record<string, boolean>>({
    "Phase 1 — Ingestion & Layout": true,
    "Phase 2 — OCR Extraction": true,
    "Phase 3 — Artifact Storage": true,
  });

  const { data: inscriptions, isLoading, refetch } = trpc.assignments.list.useQuery();
  const { data: stages } = trpc.assignments.stages.useQuery();
  const { data: providers } = trpc.providers.list.useQuery();

  const deleteMutation = trpc.assignments.delete.useMutation({
    onSuccess: () => { toast.success("Inscription removed."); refetch(); },
    onError: (e) => toast.error(e.message),
  });

  // Build a map of stage → inscription for fast lookup
  const inscriptionByStage = (inscriptions ?? []).reduce((acc, i) => {
    acc[i.stage] = i;
    return acc;
  }, {} as Record<string, NonNullable<typeof inscriptions>[0]>);

  // Group stages by phase
  const stagesByPhase = (stages ?? []).reduce((acc, s) => {
    const phase = STAGE_PHASE_MAP[s.id] ?? "Other";
    if (!acc[phase]) acc[phase] = [];
    acc[phase].push(s);
    return acc;
  }, {} as Record<string, typeof stages>);

  const editingInscription = editingStage
    ? inscriptionByStage[editingStage] ?? null
    : null;

  const editingStageLabel = editingStage
    ? (stages ?? []).find(s => s.id === editingStage)?.label ?? editingStage
    : "";

  const togglePhase = (phase: string) => {
    setExpandedPhases(prev => ({ ...prev, [phase]: !prev[phase] }));
  };

  const providerLabel = (p: { displayName: string; name: string; modelId: string | null }) =>
    `${p.displayName || p.name}${p.modelId ? ` — ${p.modelId}` : ""}`;

  const providerIcon = (providerType: string) => {
    if (providerType === "lm_studio" || providerType === "openai_compatible") {
      return <Cpu className="h-3.5 w-3.5 text-violet-400 flex-shrink-0" />;
    }
    return <Cloud className="h-3.5 w-3.5 text-blue-400 flex-shrink-0" />;
  };

  const totalInscribed = Object.keys(inscriptionByStage).length;
  const totalStages = stages?.length ?? 0;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold font-serif flex items-center gap-3">
            <GitBranch className="h-8 w-8 text-amber-400" />
            Stage Inscriptions
          </h1>
          <p className="text-muted-foreground mt-1">
            Assign a primary and fallback provider to each pipeline stage, and configure the stage-specific
            system prompt and generation settings. A single provider can be used across multiple stages.
          </p>
        </div>
        <div className="text-right">
          <div className="text-2xl font-bold text-amber-400">{totalInscribed} / {totalStages}</div>
          <div className="text-xs text-muted-foreground">stages inscribed</div>
        </div>
      </div>

      {/* Inscription Dialog */}
      {editingStage && (
        <InscriptionDialog
          stage={editingStage}
          stageLabel={editingStageLabel}
          inscription={editingInscription ? {
            id: editingInscription.id,
            primaryProviderId: editingInscription.primaryProvider?.id ?? null,
            fallbackProviderId: editingInscription.fallbackProvider?.id ?? null,
            systemPrompt: editingInscription.systemPrompt,
            temperature: editingInscription.temperature,
            maxTokens: editingInscription.maxTokens,
            isActive: editingInscription.isActive,
          } : null}
          providers={(providers ?? []).map(p => ({
            id: p.id,
            displayName: p.displayName ?? p.name,
            name: p.name,
            modelId: p.modelId ?? null,
            providerType: p.providerType,
            isActive: p.isActive,
          }))}
          onClose={() => setEditingStage(null)}
          onSaved={refetch}
        />
      )}

      {/* Stage Matrix grouped by phase */}
      {isLoading ? (
        <div className="flex items-center justify-center py-12">
          <Loader2 className="h-8 w-8 animate-spin text-amber-400" />
        </div>
      ) : (
        <div className="space-y-4">
          {Object.entries(PHASE_GROUPS).map(([phaseKey, phaseInfo]) => {
            const phaseStages = stagesByPhase[phaseKey] ?? [];
            const isExpanded = expandedPhases[phaseKey] ?? true;
            const inscribedCount = phaseStages.filter(s => inscriptionByStage[s.id]).length;

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
                    <Badge variant="outline" className={`text-xs ${phaseInfo.badgeClass}`}>
                      {inscribedCount} / {phaseStages.length} inscribed
                    </Badge>
                    {isExpanded
                      ? <ChevronUp className="h-4 w-4 text-muted-foreground" />
                      : <ChevronDown className="h-4 w-4 text-muted-foreground" />}
                  </div>
                </button>

                {/* Stage Rows */}
                {isExpanded && (
                  <div className="divide-y divide-border/30">
                    {phaseStages.map(stage => {
                      const inscription = inscriptionByStage[stage.id];
                      const hasInscription = !!inscription;
                      const isActive = inscription?.isActive ?? false;

                      return (
                        <div key={stage.id} className="p-4 flex items-start gap-4">
                          {/* Stage info */}
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2 flex-wrap mb-2">
                              <span className="font-medium text-sm">{stage.label}</span>
                              <Badge variant="secondary" className="text-xs font-mono">{stage.id}</Badge>
                              {hasInscription && (
                                <div className={`w-2 h-2 rounded-full flex-shrink-0 ${isActive ? "bg-green-400" : "bg-gray-500"}`} />
                              )}
                              {!hasInscription && (
                                <Badge variant="outline" className="text-xs border-dashed text-muted-foreground">
                                  <AlertCircle className="h-3 w-3 mr-1" />
                                  Not inscribed
                                </Badge>
                              )}
                            </div>

                            {hasInscription ? (
                              <div className="space-y-1.5">
                                {/* Primary Provider */}
                                {inscription.primaryProvider ? (
                                  <div className="flex items-center gap-2">
                                    <Badge variant="outline" className="text-[10px] border-emerald-500/50 text-emerald-400 bg-emerald-950/20 flex-shrink-0">Primary</Badge>
                                    {providerIcon(inscription.primaryProvider.providerType)}
                                    <span className="text-sm font-medium truncate">
                                      {providerLabel(inscription.primaryProvider)}
                                    </span>
                                  </div>
                                ) : (
                                  <div className="flex items-center gap-2 text-muted-foreground">
                                    <Badge variant="outline" className="text-[10px] border-dashed flex-shrink-0">Primary</Badge>
                                    <span className="text-xs italic">No provider selected</span>
                                  </div>
                                )}

                                {/* Fallback Provider */}
                                {inscription.fallbackProvider ? (
                                  <div className="flex items-center gap-2">
                                    <Badge variant="outline" className="text-[10px] border-amber-500/50 text-amber-400 bg-amber-950/20 flex-shrink-0">Fallback</Badge>
                                    {providerIcon(inscription.fallbackProvider.providerType)}
                                    <span className="text-sm text-muted-foreground truncate">
                                      {providerLabel(inscription.fallbackProvider)}
                                    </span>
                                  </div>
                                ) : (
                                  <div className="flex items-center gap-2 text-muted-foreground">
                                    <Badge variant="outline" className="text-[10px] border-dashed flex-shrink-0">Fallback</Badge>
                                    <span className="text-xs italic">No fallback configured</span>
                                  </div>
                                )}

                                {/* System Prompt preview */}
                                {inscription.systemPrompt && (
                                  <div className="flex items-start gap-1.5 mt-1">
                                    <FileText className="h-3 w-3 text-amber-400/60 flex-shrink-0 mt-0.5" />
                                    <p className="text-xs text-muted-foreground font-mono truncate max-w-[500px]">
                                      {inscription.systemPrompt.slice(0, 100)}{inscription.systemPrompt.length > 100 ? "…" : ""}
                                    </p>
                                  </div>
                                )}

                                {/* Temperature / Max Tokens */}
                                <div className="flex items-center gap-3 mt-0.5">
                                  {inscription.temperature !== null && inscription.temperature !== undefined && (
                                    <div className="flex items-center gap-1">
                                      <Thermometer className="h-3 w-3 text-amber-400/60" />
                                      <span className="text-xs text-muted-foreground">temp: {inscription.temperature}</span>
                                    </div>
                                  )}
                                  {inscription.maxTokens !== null && inscription.maxTokens !== undefined && (
                                    <div className="flex items-center gap-1">
                                      <Hash className="h-3 w-3 text-amber-400/60" />
                                      <span className="text-xs text-muted-foreground">max: {inscription.maxTokens}</span>
                                    </div>
                                  )}
                                </div>
                              </div>
                            ) : (
                              <p className="text-xs text-muted-foreground italic">
                                Click "Inscribe" to assign a provider and configure this stage.
                              </p>
                            )}
                          </div>

                          {/* Actions */}
                          <div className="flex items-center gap-2 flex-shrink-0">
                            <Button
                              variant="outline"
                              size="sm"
                              className="gap-1.5"
                              onClick={() => setEditingStage(stage.id)}
                            >
                              {hasInscription
                                ? <><Pencil className="h-3.5 w-3.5" /> Configure</>
                                : <><GitBranch className="h-3.5 w-3.5" /> Inscribe</>}
                            </Button>
                            {hasInscription && (
                              <Button
                                variant="ghost"
                                size="sm"
                                className="h-8 w-8 p-0 text-destructive hover:text-destructive"
                                onClick={() => {
                                  if (confirm(`Remove inscription for ${stage.label}?`)) {
                                    deleteMutation.mutate({ id: inscription.id });
                                  }
                                }}
                              >
                                <Trash2 className="h-3.5 w-3.5" />
                              </Button>
                            )}
                          </div>
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
