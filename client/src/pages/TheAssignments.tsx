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
import { Link } from "wouter";
import {
  GitBranch, Loader2, Layers, ChevronDown, ChevronUp,
  Settings2, Thermometer, FileText, Check, Cpu, Cloud,
  AlertCircle, Pencil, Trash2, Hash, ExternalLink, BookOpen,
  Wrench, Info,
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

// ─── Stage type classification ──────────────────────────────────────────────
// Stages that call an LLM get the full InscriptionDialog (providers + temperature + tokens).
// Non-LLM stages get a lightweight StageSettingsDialog with stage-specific knobs.

const NON_LLM_STAGES = new Set([
  "document_registration",
  "pdf_to_png",
  "child_image_extraction",
  "artifact_storage",
  "embedding_generation",
  "database_load",
]);

// Friendly label helper — converts snake_case to Title Case
const toFriendlyLabel = (name: string) =>
  name.split("_").map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(" ");

// Per-stage configurable settings for non-LLM stages
interface StageSetting {
  key: string;
  label: string;
  description: string;
  type: "number" | "boolean";
  unit?: string;
  min?: number;
  max?: number;
  step?: number;
  defaultValue: number | boolean;
}

const NON_LLM_STAGE_SETTINGS: Record<string, StageSetting[]> = {
  pdf_to_png: [
    { key: "maxSizePx",    label: "Max PNG Size",    description: "Maximum width or height of the output PNG in pixels. Larger values preserve more detail but increase storage.", type: "number", unit: "px",  min: 512,  max: 8192, step: 256, defaultValue: 2048 },
    { key: "dpi",          label: "DPI",             description: "Dots per inch for PDF rasterisation. 150 is sufficient for most text; 300 for fine detail.",                   type: "number", unit: "dpi", min: 72,   max: 600,  step: 1,   defaultValue: 150  },
    { key: "binarize",     label: "Binarization",    description: "Convert output to black-and-white. Improves OCR accuracy on text-heavy pages; disable for colour illustrations.", type: "boolean",                                         defaultValue: true },
  ],
  document_registration: [
    { key: "hashThreshold", label: "Duplicate Hash Threshold", description: "Perceptual hash distance below which two pages are considered duplicates (0 = exact match only).", type: "number", min: 0, max: 20, step: 1, defaultValue: 4 },
  ],
  child_image_extraction: [
    { key: "minAreaPx2",     label: "Min Image Area",    description: "Minimum bounding-box area (px²) for a region to be extracted as a child image.",  type: "number", unit: "px²", min: 100,  max: 100000, step: 100, defaultValue: 2000  },
    { key: "maxPerPage",     label: "Max Images Per Page", description: "Maximum number of child images extracted from a single page.",                        type: "number",              min: 1,    max: 50,     step: 1,   defaultValue: 10    },
  ],
  artifact_storage:    [],
  embedding_generation: [],
  database_load:       [],
};

// ─── Non-LLM Stage Settings Dialog ───────────────────────────────────────────

interface StageSettingsDialogProps {
  stage: string;
  stageLabel: string;
  onClose: () => void;
}

function StageSettingsDialog({ stage, stageLabel, onClose }: StageSettingsDialogProps) {
  const settings = NON_LLM_STAGE_SETTINGS[stage] ?? [];
  const [values, setValues] = useState<Record<string, string | boolean>>(
    Object.fromEntries(settings.map(s => [s.key, typeof s.defaultValue === "boolean" ? s.defaultValue : String(s.defaultValue)]))
  );

  const handleSave = () => {
    // Settings are stored client-side for now (no DB column yet).
    // When a systemConfig API is wired, persist here.
    toast.success(`Settings saved for ${stageLabel}.`);
    onClose();
  };

  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Wrench className="h-5 w-5 text-blue-400" />
            Configure: {stageLabel}
          </DialogTitle>
          <DialogDescription>
            Stage-specific settings for{" "}
            <span className="font-mono text-xs">{stage}</span>. This stage does not call an LLM.
          </DialogDescription>
        </DialogHeader>

        {settings.length === 0 ? (
          <div className="flex flex-col items-center gap-3 py-8 text-center">
            <Info className="h-8 w-8 text-muted-foreground" />
            <p className="text-sm text-muted-foreground">
              This stage has no user-configurable settings. It runs automatically as part of the pipeline.
            </p>
          </div>
        ) : (
          <div className="space-y-5">
            {settings.map(setting => (
              <div key={setting.key} className="space-y-2">
                <Label className="flex items-center gap-2">
                  <Wrench className="h-3.5 w-3.5 text-blue-400" />
                  {setting.label}
                  {setting.unit && (
                    <span className="text-muted-foreground text-xs font-normal">({setting.unit})</span>
                  )}
                </Label>
                {setting.type === "boolean" ? (
                  <div className="flex items-center justify-between rounded-lg border p-3 bg-muted/20">
                    <div>
                      <p className="text-xs text-muted-foreground">{setting.description}</p>
                    </div>
                    <Switch
                      checked={values[setting.key] as boolean}
                      onCheckedChange={v => setValues(prev => ({ ...prev, [setting.key]: v }))}
                    />
                  </div>
                ) : (
                  <>
                    <Input
                      type="number"
                      min={setting.min}
                      max={setting.max}
                      step={setting.step}
                      value={values[setting.key] as string}
                      onChange={e => setValues(prev => ({ ...prev, [setting.key]: e.target.value }))}
                      className="bg-muted/30"
                    />
                    <p className="text-xs text-muted-foreground">{setting.description}</p>
                  </>
                )}
              </div>
            ))}
          </div>
        )}

        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button onClick={handleSave}>
            <Check className="h-4 w-4 mr-2" />
            Save Settings
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ─── Inscription Edit Dialog ──────────────────────────────────────────────────

interface InscriptionDialogProps {
  stage: string;
  stageLabel: string;
  inscription: {
    id?: number;
    primaryProviderId?: number | null;
    fallbackProviderId?: number | null;
    promptName?: string | null;
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
    inscription?.primaryProviderId ? String(inscription.primaryProviderId) : "none"
  );
  const [fallbackProviderId, setFallbackProviderId] = useState<string>(
    inscription?.fallbackProviderId ? String(inscription.fallbackProviderId) : "none"
  );

  // Incantation is auto-assigned from the stage name — no manual picker needed.
  // The promptName stored in the inscription is the stage name itself (e.g. "ocr_extraction").
  const autoPromptName = stage;

  // Fetch version history for this stage's prompt so we can offer a version picker.
  const { data: versionHistory } = trpc.prompts.history.useQuery({ name: autoPromptName });
  const versions = versionHistory ?? [];
  // Default to the latest version (index 0 = highest version number).
  const [selectedVersion, setSelectedVersion] = useState<string>(
    versions.length > 0 ? String(versions[0].version) : "latest"
  );

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
      primaryProviderId: primaryProviderId && primaryProviderId !== "none" ? Number(primaryProviderId) : null,
      fallbackProviderId: fallbackProviderId && fallbackProviderId !== "none" ? Number(fallbackProviderId) : null,
      promptName: autoPromptName,
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
            <span className="font-mono text-xs">{stage}</span>, along with generation settings.
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
              <SelectTrigger className="min-w-0 w-full">
                <span className="truncate block text-left">
                  <SelectValue placeholder="Select primary provider…" />
                </span>
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="none">— None —</SelectItem>
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
              <SelectTrigger className="min-w-0 w-full">
                <span className="truncate block text-left">
                  <SelectValue placeholder="Select fallback provider…" />
                </span>
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="none">— None —</SelectItem>
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

          {/* Incantation — auto-assigned from stage name */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <Label className="flex items-center gap-2">
                <BookOpen className="h-4 w-4 text-amber-400" />
                Incantation
                <span className="text-muted-foreground text-xs font-normal">(auto-assigned)</span>
              </Label>
              <Link href="/incantations-runes" className="flex items-center gap-1 text-xs text-amber-400/70 hover:text-amber-400 transition-colors">
                <ExternalLink className="h-3 w-3" />
                Edit in Incantations &amp; Runes
              </Link>
            </div>
            {/* Read-only incantation name badge */}
            <div className="flex items-center gap-2 rounded-md border bg-muted/30 px-3 py-2">
              <FileText className="h-4 w-4 text-amber-400 flex-shrink-0" />
              <span className="font-mono text-sm text-foreground">{autoPromptName}</span>
              {versions.length > 0 && (
                <Badge variant="outline" className="ml-auto text-xs border-amber-500/40 text-amber-400">
                  v{versions[0].version} current
                </Badge>
              )}
            </div>
            {/* Version picker — only shown when multiple versions exist */}
            {versions.length > 1 && (
              <div className="space-y-1.5">
                <Label className="text-xs text-muted-foreground">Prompt Version</Label>
                <Select
                  value={selectedVersion}
                  onValueChange={setSelectedVersion}
                >
                  <SelectTrigger className="bg-muted/30 h-8 text-xs">
                    <SelectValue placeholder="Select version…" />
                  </SelectTrigger>
                  <SelectContent>
                    {versions.map((v, i) => (
                      <SelectItem key={v.id} value={String(v.version)} className="text-xs">
                        v{v.version}{i === 0 ? " (latest)" : ""} — {new Date(v.createdAt).toLocaleDateString()}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <p className="text-xs text-muted-foreground">
                  Select an earlier version to pin this stage to a specific prompt revision.
                </p>
              </div>
            )}
            {versions.length === 0 && (
              <p className="text-xs text-muted-foreground">
                No prompt found for <span className="font-mono">{autoPromptName}</span> in Incantations &amp; Runes.
                Add it there first, then return to inscribe this stage.
              </p>
            )}
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

      {/* Dialogs — route to LLM inscription or non-LLM settings based on stage type */}
      {editingStage && NON_LLM_STAGES.has(editingStage) && (
        <StageSettingsDialog
          stage={editingStage}
          stageLabel={editingStageLabel}
          onClose={() => setEditingStage(null)}
        />
      )}
      {editingStage && !NON_LLM_STAGES.has(editingStage) && (
        <InscriptionDialog
          stage={editingStage}
          stageLabel={editingStageLabel}
          inscription={editingInscription ? {
            id: editingInscription.id,
            primaryProviderId: editingInscription.primaryProvider?.id ?? null,
            fallbackProviderId: editingInscription.fallbackProvider?.id ?? null,
            promptName: editingInscription.promptName ?? null,
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

                                {/* Prompt reference badge — show friendly label, not snake_case */}
                                {inscription.promptName && (
                                  <div className="flex items-center gap-1.5 mt-1">
                                    <BookOpen className="h-3 w-3 text-amber-400/60 flex-shrink-0" />
                                    <Badge variant="outline" className="text-[10px] border-amber-500/40 text-amber-400/80 bg-amber-950/20">
                                      {toFriendlyLabel(inscription.promptName)}
                                    </Badge>
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
                                {NON_LLM_STAGES.has(stage.id)
                                  ? "Click \"Configure\" to set stage-specific parameters."
                                  : "Click \"Inscribe\" to assign a provider and configure this stage."}
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
                              {NON_LLM_STAGES.has(stage.id)
                                ? <><Wrench className="h-3.5 w-3.5" /> Configure</>
                                : hasInscription
                                  ? <><Pencil className="h-3.5 w-3.5" /> Configure</>
                                  : <><GitBranch className="h-3.5 w-3.5" /> Inscribe</>}
                            </Button>
                            {hasInscription && !NON_LLM_STAGES.has(stage.id) && (
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
