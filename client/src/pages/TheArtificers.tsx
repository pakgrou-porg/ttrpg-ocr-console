import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Switch } from "@/components/ui/switch";
import { Separator } from "@/components/ui/separator";
import { toast } from "sonner";
import {
  Cpu, Plus, Trash2, TestTube, Key, Loader2, CheckCircle2, XCircle,
  Wifi, Search, ChevronDown, ChevronUp, Zap, Edit, Info, GitBranch, Star,
  Eye, RefreshCw, AlertCircle,
} from "lucide-react";
import { PipelineVisualization } from "@/components/PipelineVisualization";

// ─── Provider Presets ─────────────────────────────────────────────────────────

interface ProviderPreset {
  name: string;
  displayName: string;
  baseUrl: string;
  port?: number;
  apiPrefix?: string;
  description: string;
  requiresApiKey: boolean;
  apiKeyHint: string;
  defaultModelId?: string;
  defaultContextLength?: number;
  defaultMaxTokens?: number;
  supportsChat: boolean;
  supportsVision: boolean;
  supportsEmbedding: boolean;
  supportsReasoning: boolean;
}

const PROVIDER_PRESETS: Record<string, ProviderPreset> = {
  openai_compatible: {
    name: "",
    displayName: "",
    baseUrl: "",
    apiPrefix: "/v1",
    description: "Any OpenAI-compatible API endpoint (custom or self-hosted).",
    requiresApiKey: false,
    apiKeyHint: "Depends on provider",
    supportsChat: true,
    supportsVision: false,
    supportsEmbedding: false,
    supportsReasoning: false,
  },
  lm_studio: {
    name: "LM Studio (Local)",
    displayName: "LM Studio — Local",
    baseUrl: "http://localhost",
    port: 1234,
    apiPrefix: "/v1",
    description: "Local LM Studio instance. Typically runs on port 1234 with no API key required.",
    requiresApiKey: false,
    apiKeyHint: "Usually not required for local instances",
    defaultContextLength: 8192,
    supportsChat: true,
    supportsVision: true,
    supportsEmbedding: false,
    supportsReasoning: false,
  },
  openrouter: {
    name: "OpenRouter",
    displayName: "OpenRouter",
    baseUrl: "https://openrouter.ai",
    apiPrefix: "/api/v1",
    description: "OpenRouter aggregates 300+ models from multiple providers with unified billing.",
    requiresApiKey: true,
    apiKeyHint: "sk-or-v1-... (from openrouter.ai/keys)",
    supportsChat: true,
    supportsVision: true,
    supportsEmbedding: false,
    supportsReasoning: false,
  },
  venice_ai: {
    name: "Venice.ai",
    displayName: "Venice.ai",
    baseUrl: "https://api.venice.ai",
    apiPrefix: "/api/v1",
    description: "Venice.ai provides privacy-focused AI inference with uncensored models.",
    requiresApiKey: true,
    apiKeyHint: "venice-... (from venice.ai/settings/api)",
    supportsChat: true,
    supportsVision: false,
    supportsEmbedding: false,
    supportsReasoning: false,
  },
  anthropic: {
    name: "Anthropic",
    displayName: "Anthropic — Claude",
    baseUrl: "https://api.anthropic.com",
    apiPrefix: "/v1",
    description: "Anthropic's Claude models. Note: uses a slightly different API format.",
    requiresApiKey: true,
    apiKeyHint: "sk-ant-... (from console.anthropic.com)",
    defaultModelId: "claude-3-5-sonnet-20241022",
    defaultContextLength: 200000,
    defaultMaxTokens: 8192,
    supportsChat: true,
    supportsVision: true,
    supportsEmbedding: false,
    supportsReasoning: false,
  },
  google: {
    name: "Google AI (Gemini)",
    displayName: "Google — Gemini",
    baseUrl: "https://generativelanguage.googleapis.com",
    apiPrefix: "/v1beta/openai",
    description: "Google's Gemini models via the OpenAI-compatible endpoint.",
    requiresApiKey: true,
    apiKeyHint: "AIza... (from aistudio.google.com/apikey)",
    defaultModelId: "gemini-2.5-pro-preview-05-06",
    defaultContextLength: 1000000,
    defaultMaxTokens: 65536,
    supportsChat: true,
    supportsVision: true,
    supportsEmbedding: false,
    supportsReasoning: true,
  },
  custom: {
    name: "",
    displayName: "",
    baseUrl: "",
    apiPrefix: "/v1",
    description: "Custom endpoint. Specify your own base URL and configuration.",
    requiresApiKey: false,
    apiKeyHint: "Depends on your endpoint",
    supportsChat: true,
    supportsVision: false,
    supportsEmbedding: false,
    supportsReasoning: false,
  },
};

// ─── Types ────────────────────────────────────────────────────────────────────

interface TestResult {
  ok: boolean;
  latencyMs: number;
  models?: string[];
  error?: string;
}

interface DiscoveredModel {
  id: string;
  name: string;
  contextLength: number | null;
  maxTokens: number | null;
  isVision: boolean;
  modality: string | null;
  pricingPrompt?: string | null;
  pricingCompletion?: string | null;
}

interface ProviderForm {
  displayName: string;
  name: string;
  providerType: string;
  baseUrl: string;
  port: string;
  apiPrefix: string;
  modelId: string;
  contextLength: string;
  maxTokens: string;
  defaultTemperature: string;
  supportsChat: boolean;
  supportsVision: boolean;
  supportsEmbedding: boolean;
  supportsReasoning: boolean;
  isDefault: boolean;
  apiKey: string;
  notes: string;
}

const EMPTY_FORM: ProviderForm = {
  displayName: "",
  name: "",
  providerType: "openai_compatible",
  baseUrl: "",
  port: "",
  apiPrefix: "/v1",
  modelId: "",
  contextLength: "",
  maxTokens: "",
  defaultTemperature: "0.2",
  supportsChat: true,
  supportsVision: false,
  supportsEmbedding: false,
  supportsReasoning: false,
  isDefault: false,
  apiKey: "",
  notes: "",
};

// ─── Model Picker Component ───────────────────────────────────────────────────

function ModelPicker({
  form,
  setForm,
  providerId,
}: {
  form: ProviderForm;
  setForm: React.Dispatch<React.SetStateAction<ProviderForm>>;
  providerId?: number; // if editing an existing provider, use its stored key
}) {
  const [discoveredModels, setDiscoveredModels] = useState<DiscoveredModel[]>([]);
  const [isDiscovering, setIsDiscovering] = useState(false);
  const [discoverError, setDiscoverError] = useState<string | null>(null);
  const [modelSearch, setModelSearch] = useState("");
  const [showPicker, setShowPicker] = useState(false);

  const discoverMutation = trpc.providers.discoverModels.useMutation({
    onSuccess: (result) => {
      setIsDiscovering(false);
      if (result.ok) {
        setDiscoveredModels(result.models as DiscoveredModel[]);
        setShowPicker(true);
        setDiscoverError(null);
        toast.success(`${result.models.length} model${result.models.length !== 1 ? "s" : ""} discovered.`);
      } else {
        setDiscoverError(result.error ?? "Unknown error");
        toast.error(`Discovery failed: ${result.error}`);
      }
    },
    onError: (e) => {
      setIsDiscovering(false);
      setDiscoverError(e.message);
      toast.error(e.message);
    },
  });

  const handleDiscover = () => {
    setIsDiscovering(true);
    setDiscoverError(null);
    setShowPicker(false);
    discoverMutation.mutate({
      providerType: form.providerType as any,
      apiKey: form.apiKey || undefined,
      baseUrl: form.baseUrl || undefined,
      port: form.port ? Number(form.port) : undefined,
      visionOnly: false,
      providerId,
    });
  };

  const handleSelectModel = (model: DiscoveredModel) => {
    setForm(f => ({
      ...f,
      modelId: model.id,
      contextLength: model.contextLength ? String(model.contextLength) : f.contextLength,
      maxTokens: model.maxTokens ? String(model.maxTokens) : f.maxTokens,
      // Auto-set vision capability if selecting a vision model
      supportsVision: model.isVision ? true : f.supportsVision,
    }));
    setShowPicker(false);
    setModelSearch("");
    toast.success(`Model "${model.id}" selected. Context and token limits auto-filled.`);
  };

  const filteredModels = discoveredModels.filter(m =>
    modelSearch === "" || m.id.toLowerCase().includes(modelSearch.toLowerCase()) || m.name.toLowerCase().includes(modelSearch.toLowerCase())
  );

  const canDiscover = ["openrouter", "openai_compatible", "lm_studio", "anthropic", "google", "custom"].includes(form.providerType);

  return (
    <div className="space-y-2">
      <Label>Default Model ID <span className="text-muted-foreground text-xs">(used when no inscription specifies a model)</span></Label>
      <div className="flex gap-2">
        <Input
          placeholder="e.g., llava-v1.6-mistral-7b, gemini-2.5-pro-preview-05-06"
          value={form.modelId}
          onChange={e => setForm(f => ({ ...f, modelId: e.target.value }))}
          className="flex-1"
        />
        {canDiscover && (
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={handleDiscover}
            disabled={isDiscovering}
            className="gap-1.5 shrink-0"
          >
            {isDiscovering ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Search className="h-3.5 w-3.5" />}
            Discover
          </Button>
        )}
      </div>

      {/* Discovery error */}
      {discoverError && (
        <div className="flex items-center gap-2 text-xs text-red-400 bg-red-950/20 border border-red-700/40 rounded p-2">
          <AlertCircle className="h-3.5 w-3.5 shrink-0" />
          {discoverError}
        </div>
      )}

      {/* Model picker dropdown */}
      {showPicker && discoveredModels.length > 0 && (
        <div className="border rounded-lg bg-card shadow-lg overflow-hidden">
          <div className="p-2 border-b flex items-center gap-2">
            <Search className="h-3.5 w-3.5 text-muted-foreground" />
            <Input
              placeholder="Search models..."
              value={modelSearch}
              onChange={e => setModelSearch(e.target.value)}
              className="h-7 text-xs border-0 p-0 focus-visible:ring-0 bg-transparent"
            />
            <Button variant="ghost" size="sm" className="h-6 px-2 text-xs" onClick={() => setShowPicker(false)}>
              Close
            </Button>
          </div>
          <div className="max-h-64 overflow-y-auto">
            {filteredModels.length === 0 ? (
              <div className="py-4 text-center text-xs text-muted-foreground">No models match your filter.</div>
            ) : (
              filteredModels.map(model => (
                <button
                  key={model.id}
                  type="button"
                  className="w-full text-left px-3 py-2 hover:bg-muted/50 transition-colors border-b border-border/30 last:border-0"
                  onClick={() => handleSelectModel(model)}
                >
                  <div className="flex items-center justify-between gap-2">
                    <div className="min-w-0">
                      <div className="flex items-center gap-1.5">
                        <span className="text-xs font-mono truncate">{model.id}</span>
                        {model.isVision && (
                          <Badge className="text-[9px] py-0 px-1 bg-purple-900/40 text-purple-300 border-purple-700/40 gap-0.5">
                            <Eye className="h-2.5 w-2.5" /> vision
                          </Badge>
                        )}
                      </div>
                      {model.name !== model.id && (
                        <div className="text-[10px] text-muted-foreground truncate">{model.name}</div>
                      )}
                    </div>
                    <div className="flex items-center gap-2 shrink-0 text-[10px] text-muted-foreground">
                      {model.contextLength && (
                        <span>ctx: {(model.contextLength / 1000).toFixed(0)}k</span>
                      )}
                      {model.maxTokens && (
                        <span>max: {(model.maxTokens / 1000).toFixed(0)}k</span>
                      )}
                      {model.pricingPrompt && (
                        <span className="text-green-600">${(Number(model.pricingPrompt) * 1_000_000).toFixed(2)}/M</span>
                      )}
                    </div>
                  </div>
                </button>
              ))
            )}
          </div>
          <div className="px-3 py-1.5 bg-muted/30 border-t text-[10px] text-muted-foreground">
            {filteredModels.length} model{filteredModels.length !== 1 ? "s" : ""} shown
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Provider Form Fields ─────────────────────────────────────────────────────

function ProviderFormFields({
  form,
  setForm,
  providerTypes,
  isEdit = false,
  hasApiKey = false,
  providerId,
}: {
  form: ProviderForm;
  setForm: React.Dispatch<React.SetStateAction<ProviderForm>>;
  providerTypes?: { id: string; label: string }[];
  isEdit?: boolean;
  hasApiKey?: boolean;
  providerId?: number;
}) {
  const preset = PROVIDER_PRESETS[form.providerType];

  const handleProviderTypeChange = (providerType: string) => {
    const p = PROVIDER_PRESETS[providerType];
    const prev = PROVIDER_PRESETS[form.providerType];
    setForm(f => ({
      ...f,
      providerType,
      displayName: !f.displayName || f.displayName === prev?.displayName ? (p?.displayName ?? "") : f.displayName,
      name: !f.name || f.name === prev?.name ? (p?.name ?? "") : f.name,
      baseUrl: !f.baseUrl || f.baseUrl === prev?.baseUrl ? (p?.baseUrl ?? "") : f.baseUrl,
      port: !f.port || f.port === String(prev?.port ?? "") ? (p?.port ? String(p.port) : "") : f.port,
      apiPrefix: !f.apiPrefix || f.apiPrefix === (prev?.apiPrefix ?? "/v1") ? (p?.apiPrefix ?? "/v1") : f.apiPrefix,
      modelId: !f.modelId ? (p?.defaultModelId ?? "") : f.modelId,
      contextLength: !f.contextLength ? (p?.defaultContextLength ? String(p.defaultContextLength) : "") : f.contextLength,
      maxTokens: !f.maxTokens ? (p?.defaultMaxTokens ? String(p.defaultMaxTokens) : "") : f.maxTokens,
      supportsChat: p?.supportsChat ?? true,
      supportsVision: p?.supportsVision ?? false,
      supportsEmbedding: p?.supportsEmbedding ?? false,
      supportsReasoning: p?.supportsReasoning ?? false,
    }));
  };

  return (
    <div className="space-y-4">
      {/* Provider Type */}
      <div className="space-y-2">
        <Label>Provider Type</Label>
        <Select value={form.providerType} onValueChange={handleProviderTypeChange}>
          <SelectTrigger><SelectValue /></SelectTrigger>
          <SelectContent>
            {providerTypes?.map(t => (
              <SelectItem key={t.id} value={t.id}>{t.label}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        {preset?.description && (
          <p className="text-xs text-muted-foreground flex items-start gap-1.5">
            <Info className="h-3.5 w-3.5 mt-0.5 shrink-0 text-purple-400" />
            {preset.description}
          </p>
        )}
      </div>

      {/* Display Name + Internal Name */}
      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-2">
          <Label>Display Name <span className="text-muted-foreground text-xs">(shown in UI)</span></Label>
          <Input
            placeholder={preset?.displayName || "e.g., LMStudio — LLaVA Vision"}
            value={form.displayName}
            onChange={e => setForm(f => ({ ...f, displayName: e.target.value }))}
          />
        </div>
        <div className="space-y-2">
          <Label>Internal Name</Label>
          <Input
            placeholder={preset?.name || "e.g., lm-studio-local"}
            value={form.name}
            onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
          />
        </div>
      </div>

      {/* Capabilities */}
      <div className="space-y-2">
        <Label>Capabilities</Label>
        <div className="flex items-center gap-6 flex-wrap">
          <label className="flex items-center gap-2 cursor-pointer">
            <input
              type="checkbox"
              checked={form.supportsChat}
              onChange={e => setForm(f => ({ ...f, supportsChat: e.target.checked }))}
              className="w-4 h-4 rounded accent-purple-500"
            />
            <span className="text-sm">Chat</span>
          </label>
          <label className="flex items-center gap-2 cursor-pointer">
            <input
              type="checkbox"
              checked={form.supportsVision}
              onChange={e => setForm(f => ({ ...f, supportsVision: e.target.checked }))}
              className="w-4 h-4 rounded accent-purple-500"
            />
            <span className="text-sm flex items-center gap-1"><Eye className="h-3.5 w-3.5 text-purple-400" />Vision</span>
          </label>
          <label className="flex items-center gap-2 cursor-pointer">
            <input
              type="checkbox"
              checked={form.supportsEmbedding}
              onChange={e => setForm(f => ({ ...f, supportsEmbedding: e.target.checked }))}
              className="w-4 h-4 rounded accent-purple-500"
            />
            <span className="text-sm">Embedding</span>
          </label>
          <label className="flex items-center gap-2 cursor-pointer">
            <input
              type="checkbox"
              checked={form.supportsReasoning}
              onChange={e => setForm(f => ({ ...f, supportsReasoning: e.target.checked }))}
              className="w-4 h-4 rounded accent-purple-500"
            />
            <span className="text-sm flex items-center gap-1"><Zap className="h-3.5 w-3.5 text-amber-400" />Reasoning</span>
          </label>
        </div>
      </div>

      {/* Base URL + Port + API Prefix */}
      <div className="space-y-1">
        <p className="text-xs text-muted-foreground flex items-center gap-1">
          <Info className="h-3 w-3" />
          Paste a full URL (e.g. <code className="font-mono">http://10.0.0.1:1234/v1</code>) to auto-decompose into host, port, and prefix.
        </p>
      </div>
      <div className="grid grid-cols-5 gap-3">
        <div className="col-span-2 space-y-2">
          <Label>
            Base URL (host only)
            {preset?.baseUrl && form.baseUrl === preset.baseUrl && (
              <Badge variant="secondary" className="ml-2 text-[10px] py-0">auto-filled</Badge>
            )}
          </Label>
          <Input
            placeholder={preset?.baseUrl || "http://localhost"}
            value={form.baseUrl}
            onChange={e => setForm(f => ({ ...f, baseUrl: e.target.value }))}
            onPaste={e => {
              const pasted = e.clipboardData.getData("text").trim();
              try {
                const url = new URL(pasted);
                // Only decompose if it looks like a full URL with path or port
                if (url.pathname !== "/" || url.port) {
                  e.preventDefault();
                  const host = `${url.protocol}//${url.hostname}`;
                  const port = url.port || "";
                  const prefix = url.pathname.replace(/\/$/, "") || "/v1";
                  setForm(f => ({ ...f, baseUrl: host, port, apiPrefix: prefix }));
                  toast.success("URL decomposed into host, port, and API prefix.");
                }
              } catch {
                // Not a valid URL, let normal paste proceed
              }
            }}
          />
        </div>
        <div className="space-y-2">
          <Label>Port <span className="text-muted-foreground text-xs">(optional)</span></Label>
          <Input
            type="number"
            placeholder="1234"
            value={form.port}
            onChange={e => setForm(f => ({ ...f, port: e.target.value }))}
          />
        </div>
        <div className="col-span-2 space-y-2">
          <Label>API Prefix <span className="text-muted-foreground text-xs">(path before /models)</span></Label>
          <Input
            placeholder="/v1"
            value={form.apiPrefix}
            onChange={e => setForm(f => ({ ...f, apiPrefix: e.target.value }))}
          />
        </div>
      </div>

      {/* Model Picker with Discovery */}
      <ModelPicker form={form} setForm={setForm} providerId={providerId} />

      {/* Context Length + Max Tokens + Default Temperature */}
      <div className="grid grid-cols-3 gap-3">
        <div className="space-y-2">
          <Label>Context Length</Label>
          <Input
            type="number"
            placeholder="e.g. 8192"
            value={form.contextLength}
            onChange={e => setForm(f => ({ ...f, contextLength: e.target.value }))}
          />
        </div>
        <div className="space-y-2">
          <Label>Max Tokens</Label>
          <Input
            type="number"
            placeholder="e.g. 4096"
            value={form.maxTokens}
            onChange={e => setForm(f => ({ ...f, maxTokens: e.target.value }))}
          />
        </div>
        <div className="space-y-2">
          <Label>Default Temp.</Label>
          <Input
            type="number"
            min={0}
            max={2}
            step={0.05}
            placeholder="0.2"
            value={form.defaultTemperature}
            onChange={e => setForm(f => ({ ...f, defaultTemperature: e.target.value }))}
          />
        </div>
      </div>

      {/* API Key */}
      <div className="space-y-2">
        <Label>
          API Key
          {preset?.requiresApiKey && (
            <Badge variant="destructive" className="ml-2 text-[10px] py-0">required</Badge>
          )}
          {!preset?.requiresApiKey && (
            <span className="text-muted-foreground text-xs ml-1">(optional, encrypted at rest)</span>
          )}
          {isEdit && hasApiKey && (
            <Badge variant="secondary" className="ml-2 text-[10px] py-0">currently set — leave blank to keep</Badge>
          )}
        </Label>
        <Input
          type="password"
          placeholder={preset?.apiKeyHint || "sk-..."}
          value={form.apiKey}
          onChange={e => setForm(f => ({ ...f, apiKey: e.target.value }))}
        />
      </div>

      {/* Notes */}
      <div className="space-y-2">
        <Label>Notes</Label>
        <Textarea
          placeholder="Optional notes about this provider..."
          value={form.notes}
          onChange={e => setForm(f => ({ ...f, notes: e.target.value }))}
          className="min-h-[60px] resize-y"
        />
      </div>

      {/* Set as Default */}
      <div className="flex items-center justify-between rounded-lg border p-3 bg-muted/20">
        <div>
          <Label className="flex items-center gap-2">
            <Star className="h-4 w-4 text-amber-400" />
            Set as Default Provider
          </Label>
          <p className="text-xs text-muted-foreground mt-0.5">
            New stage inscriptions will pre-select this provider. Only one provider can be default.
          </p>
        </div>
        <Switch
          checked={form.isDefault}
          onCheckedChange={v => setForm(f => ({ ...f, isDefault: v }))}
        />
      </div>
    </div>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────

export default function TheArtificers() {
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [isEditOpen, setIsEditOpen] = useState(false);
  const [editingProvider, setEditingProvider] = useState<any>(null);
  const [testResults, setTestResults] = useState<Record<number, TestResult>>({});
  const [testingId, setTestingId] = useState<number | null>(null);
  const [expandedModels, setExpandedModels] = useState<Record<number, boolean>>({});

  // Per-card discover state
  const [cardDiscoverState, setCardDiscoverState] = useState<Record<number, {
    loading: boolean;
    models: DiscoveredModel[];
    error: string | null;
    visionOnly: boolean;
    showPicker: boolean;
    search: string;
  }>>({});

  const { data: providers, isLoading, refetch } = trpc.providers.list.useQuery();
  const { data: providerTypes } = trpc.providers.types.useQuery();
  const { data: topology, isLoading: isTopologyLoading, refetch: refetchTopology } = trpc.assignments.topology.useQuery();

  const createMutation = trpc.providers.create.useMutation({
    onSuccess: () => { toast.success("Provider forged successfully."); refetch(); setIsCreateOpen(false); },
    onError: (e) => toast.error(e.message),
  });

  const updateMutation = trpc.providers.update.useMutation({
    onSuccess: () => { toast.success("Provider updated."); refetch(); setIsEditOpen(false); setEditingProvider(null); },
    onError: (e) => toast.error(e.message),
  });

  const deleteMutation = trpc.providers.delete.useMutation({
    onSuccess: () => { toast.success("Provider banished."); refetch(); },
    onError: (e) => toast.error(e.message),
  });

  const testMutation = trpc.providers.test.useMutation({
    onSuccess: (result, variables) => {
      setTestResults(prev => ({ ...prev, [variables.id]: result as TestResult }));
      if (result.ok) {
        toast.success(`Connection successful (${result.latencyMs}ms). ${result.models?.length ?? 0} models discovered.`);
        refetch();
      } else {
        toast.error(`Connection failed: ${(result as TestResult).error}`);
      }
      setTestingId(null);
    },
    onError: (e) => { toast.error(e.message); setTestingId(null); },
  });

  const discoverMutation = trpc.providers.discoverModels.useMutation({
    onSuccess: (result, variables) => {
      const id = variables.providerId!;
      if (result.ok) {
        setCardDiscoverState(prev => ({
          ...prev,
          [id]: { ...prev[id], loading: false, models: result.models as DiscoveredModel[], showPicker: true, error: null },
        }));
        toast.success(`${result.models.length} model${result.models.length !== 1 ? "s" : ""} discovered.`);
        // Update the provider's availableModels cache
        updateMutation.mutate({ id, availableModels: result.models.map((m: any) => m.id) });
      } else {
        setCardDiscoverState(prev => ({
          ...prev,
          [id]: { ...prev[id], loading: false, error: result.error ?? "Unknown error", showPicker: false },
        }));
        toast.error(`Discovery failed: ${result.error}`);
      }
    },
    onError: (e, variables) => {
      const id = variables.providerId!;
      setCardDiscoverState(prev => ({ ...prev, [id]: { ...prev[id], loading: false, error: e.message, showPicker: false } }));
      toast.error(e.message);
    },
  });

  const [form, setForm] = useState<ProviderForm>({ ...EMPTY_FORM });
  const [editForm, setEditForm] = useState<ProviderForm>({ ...EMPTY_FORM });

  const resetForm = () => setForm({ ...EMPTY_FORM });

  const handleCreate = () => {
    createMutation.mutate({
      displayName: form.displayName || form.name,
      name: form.name,
      providerType: form.providerType as any,
      baseUrl: form.baseUrl,
      port: form.port ? Number(form.port) : undefined,
      apiPrefix: form.apiPrefix || "/v1",
      modelId: form.modelId || undefined,
      contextLength: form.contextLength ? Number(form.contextLength) : undefined,
      maxTokens: form.maxTokens ? Number(form.maxTokens) : undefined,
      defaultTemperature: form.defaultTemperature ? Number(form.defaultTemperature) : undefined,
      supportsChat: form.supportsChat,
      supportsVision: form.supportsVision,
      supportsEmbedding: form.supportsEmbedding,
      supportsReasoning: form.supportsReasoning,
      isDefault: form.isDefault,
      apiKey: form.apiKey || undefined,
      notes: form.notes || undefined,
    });
  };

  const handleEdit = (provider: any) => {
    setEditingProvider(provider);
    setEditForm({
      displayName: provider.displayName ?? "",
      name: provider.name ?? "",
      providerType: provider.providerType ?? "openai_compatible",
      baseUrl: provider.baseUrl ?? "",
      port: provider.port ? String(provider.port) : "",
      apiPrefix: provider.apiPrefix ?? "/v1",
      modelId: provider.modelId ?? "",
      contextLength: provider.contextLength ? String(provider.contextLength) : "",
      maxTokens: provider.maxTokens ? String(provider.maxTokens) : "",
      defaultTemperature: provider.defaultTemperature !== null && provider.defaultTemperature !== undefined ? String(provider.defaultTemperature) : "0.2",
      supportsChat: provider.supportsChat ?? true,
      supportsVision: provider.supportsVision ?? false,
      supportsEmbedding: provider.supportsEmbedding ?? false,
      supportsReasoning: provider.supportsReasoning ?? false,
      isDefault: provider.isDefault ?? false,
      apiKey: "",
      notes: provider.notes ?? "",
    });
    setIsEditOpen(true);
  };

  const handleUpdate = () => {
    if (!editingProvider) return;
    updateMutation.mutate({
      id: editingProvider.id,
      displayName: editForm.displayName || undefined,
      name: editForm.name || undefined,
      providerType: editForm.providerType as any,
      baseUrl: editForm.baseUrl || undefined,
      port: editForm.port ? Number(editForm.port) : undefined,
      apiPrefix: editForm.apiPrefix || "/v1",
      modelId: editForm.modelId || undefined,
      contextLength: editForm.contextLength ? Number(editForm.contextLength) : undefined,
      maxTokens: editForm.maxTokens ? Number(editForm.maxTokens) : undefined,
      defaultTemperature: editForm.defaultTemperature ? Number(editForm.defaultTemperature) : undefined,
      supportsChat: editForm.supportsChat,
      supportsVision: editForm.supportsVision,
      supportsEmbedding: editForm.supportsEmbedding,
      supportsReasoning: editForm.supportsReasoning,
      isDefault: editForm.isDefault,
      apiKey: editForm.apiKey || undefined,
      notes: editForm.notes || undefined,
    });
  };

  const handleTestConnection = (providerId: number) => {
    setTestingId(providerId);
    testMutation.mutate({ id: providerId });
  };

  const handleCardDiscover = (provider: any) => {
    const id = provider.id;
    const visionOnly = cardDiscoverState[id]?.visionOnly ?? false;
    setCardDiscoverState(prev => ({
      ...prev,
      [id]: { loading: true, models: [], error: null, visionOnly, showPicker: false, search: "" },
    }));
    discoverMutation.mutate({
      providerType: provider.providerType,
      baseUrl: provider.baseUrl,
      port: provider.port ?? undefined,
      visionOnly,
      providerId: id,
    });
  };

  const toggleModelExpand = (providerId: number) => {
    setExpandedModels(prev => ({ ...prev, [providerId]: !prev[providerId] }));
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold font-serif flex items-center gap-3">
            <Cpu className="h-8 w-8 text-purple-400" />
            The Artificers
          </h1>
          <p className="text-muted-foreground mt-1">
            Forge and manage the arcane intelligences that power the Kodex. Each Artificer represents an LLM provider endpoint.
          </p>
        </div>
        <Dialog open={isCreateOpen} onOpenChange={setIsCreateOpen}>
          <DialogTrigger asChild>
            <Button onClick={resetForm}>
              <Plus className="h-4 w-4 mr-2" /> Forge New Artificer
            </Button>
          </DialogTrigger>
          <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>Forge New Artificer</DialogTitle>
              <DialogDescription>Register a new LLM provider endpoint for use in the pipeline.</DialogDescription>
            </DialogHeader>
            <ProviderFormFields form={form} setForm={setForm} providerTypes={providerTypes} />
            <DialogFooter>
              <Button variant="outline" onClick={() => setIsCreateOpen(false)}>Cancel</Button>
              <Button
                onClick={handleCreate}
                disabled={!form.name || !form.baseUrl || createMutation.isPending}
              >
                {createMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
                Forge Artificer
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>

      {/* Edit Dialog */}
      <Dialog open={isEditOpen} onOpenChange={(open) => { setIsEditOpen(open); if (!open) setEditingProvider(null); }}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Edit Artificer</DialogTitle>
            <DialogDescription>Modify the configuration of this LLM provider.</DialogDescription>
          </DialogHeader>
          <ProviderFormFields
            form={editForm}
            setForm={setEditForm}
            providerTypes={providerTypes}
            isEdit
            hasApiKey={editingProvider?.hasApiKey}
            providerId={editingProvider?.id}
          />
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsEditOpen(false)}>Cancel</Button>
            <Button onClick={handleUpdate} disabled={!editForm.name || !editForm.baseUrl || updateMutation.isPending}>
              {updateMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
              Update Artificer
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Tabs: Providers list + Pipeline Map */}
      <Tabs defaultValue="providers" className="space-y-4">
        <TabsList className="grid w-full max-w-sm grid-cols-2">
          <TabsTrigger value="providers" className="gap-2">
            <Cpu className="h-4 w-4" /> Artificers
          </TabsTrigger>
          <TabsTrigger value="pipeline" className="gap-2" onClick={() => refetchTopology()}>
            <GitBranch className="h-4 w-4" /> Pipeline Map
          </TabsTrigger>
        </TabsList>

        {/* ── Artificers (Provider List) Tab ─────────────────────────── */}
        <TabsContent value="providers" className="space-y-4">
          {isLoading ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="h-8 w-8 animate-spin text-purple-400" />
            </div>
          ) : providers?.length === 0 ? (
            <Card>
              <CardContent className="flex flex-col items-center justify-center py-12 text-center">
                <Cpu className="h-12 w-12 text-muted-foreground mb-4" />
                <h3 className="text-lg font-semibold">No Artificers Forged</h3>
                <p className="text-muted-foreground mt-1">Click "Forge New Artificer" to register your first LLM provider.</p>
              </CardContent>
            </Card>
          ) : (
            <div className="grid gap-4">
              {providers?.map(provider => {
                const result = testResults[provider.id];
                const isTestingThis = testingId === provider.id;
                const models = (provider.availableModels as string[]) ?? [];
                const isExpanded = expandedModels[provider.id] ?? false;
                const cardDiscover = cardDiscoverState[provider.id];
                const isDiscoveringThis = cardDiscover?.loading ?? false;

                return (
                  <Card key={provider.id} className={`transition-all ${!provider.isActive ? "opacity-60" : ""}`}>
                    <CardHeader className="pb-3">
                      <div className="flex items-center justify-between flex-wrap gap-2">
                        <div className="flex items-center gap-3 flex-wrap">
                          <div className={`w-3 h-3 rounded-full flex-shrink-0 ${provider.isActive ? "bg-green-500 shadow-[0_0_8px_rgba(34,197,94,0.6)]" : "bg-gray-500"}`} />
                          <div>
                            <div className="flex items-center gap-2">
                              <CardTitle className="text-lg">{provider.displayName || provider.name}</CardTitle>
                              {provider.isDefault && (
                                <Badge className="bg-amber-500/20 text-amber-400 border-amber-500/30 gap-1 text-xs">
                                  <Star className="h-3 w-3" /> Default
                                </Badge>
                              )}
                            </div>
                            {provider.displayName && provider.name !== provider.displayName && (
                              <p className="text-xs text-muted-foreground">{provider.name}</p>
                            )}
                          </div>
                          <Badge variant="secondary">{provider.providerType?.split("_").map((w: string) => w.charAt(0).toUpperCase() + w.slice(1)).join(" ")}</Badge>
                          {provider.supportsVision && (
                            <Badge variant="outline" className="text-xs border-purple-500/40 text-purple-300">
                              <Eye className="h-3 w-3 mr-1" />Vision
                            </Badge>
                          )}
                          {provider.supportsChat && (
                            <Badge variant="outline" className="text-xs">Chat</Badge>
                          )}
                          {provider.supportsEmbedding && (
                            <Badge variant="outline" className="text-xs">Embedding</Badge>
                          )}
                          {provider.supportsReasoning && (
                            <Badge variant="outline" className="text-xs border-amber-500/40 text-amber-300 gap-1">
                              <Zap className="h-3 w-3" />Reasoning
                            </Badge>
                          )}
                          {result && !isTestingThis && (
                            result.ok ? (
                              <Badge className="bg-green-900/30 text-green-400 border-green-700 gap-1">
                                <CheckCircle2 className="h-3 w-3" />
                                {result.latencyMs}ms
                              </Badge>
                            ) : (
                              <Badge className="bg-red-900/30 text-red-400 border-red-700 gap-1">
                                <XCircle className="h-3 w-3" />
                                Failed
                              </Badge>
                            )
                          )}
                        </div>
                        <div className="flex items-center gap-2 flex-shrink-0 flex-wrap">
                          <Button variant="outline" size="sm" onClick={() => handleTestConnection(provider.id)} disabled={isTestingThis || isDiscoveringThis} className="gap-1.5">
                            {isTestingThis ? <Loader2 className="h-4 w-4 animate-spin" /> : <TestTube className="h-4 w-4" />}
                            Test
                          </Button>
                          <Button variant="outline" size="sm" onClick={() => handleCardDiscover(provider)} disabled={isTestingThis || isDiscoveringThis} className="gap-1.5">
                            {isDiscoveringThis ? <Loader2 className="h-4 w-4 animate-spin" /> : <Search className="h-4 w-4" />}
                            Discover
                          </Button>
                          <Button variant="outline" size="sm" onClick={() => handleEdit(provider)} className="gap-1.5">
                            <Edit className="h-4 w-4" />
                            Edit
                          </Button>
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => updateMutation.mutate({ id: provider.id, isActive: !provider.isActive })}
                            disabled={updateMutation.isPending}
                          >
                            <Wifi className="h-4 w-4" />
                            <span className="ml-1">{provider.isActive ? "Disable" : "Enable"}</span>
                          </Button>
                          <Button
                            variant="destructive"
                            size="sm"
                            onClick={() => {
                              if (confirm("Banish this Artificer? All stage inscriptions using this provider will be affected.")) {
                                deleteMutation.mutate({ id: provider.id });
                              }
                            }}
                            disabled={deleteMutation.isPending}
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </div>
                      </div>
                      <CardDescription className="ml-6">{provider.baseUrl}{provider.port ? `:${provider.port}` : ""}</CardDescription>
                    </CardHeader>
                    <CardContent className="space-y-3">
                      <div className="flex flex-wrap items-center gap-x-6 gap-y-1 text-sm text-muted-foreground">
                        {/* API Key */}
                        <div className="flex items-center gap-1">
                          <Key className="h-3.5 w-3.5" />
                          {provider.hasApiKey ? (
                            <span className="font-mono text-xs">{provider.maskedApiKey}</span>
                          ) : (
                            <span className="italic">No API key</span>
                          )}
                        </div>
                        {/* Model ID */}
                        {provider.modelId && (
                          <div className="flex items-center gap-1">
                            <Cpu className="h-3.5 w-3.5 text-purple-400" />
                            <span className="font-mono text-xs">{provider.modelId}</span>
                          </div>
                        )}
                        {/* Context / Max Tokens */}
                        {provider.contextLength && (
                          <span className="text-xs">ctx: {Number(provider.contextLength).toLocaleString()}</span>
                        )}
                        {provider.maxTokens && (
                          <span className="text-xs">max: {Number(provider.maxTokens).toLocaleString()}</span>
                        )}
                        {/* Default Temperature */}
                        {provider.defaultTemperature !== null && provider.defaultTemperature !== undefined && (
                          <span className="text-xs">temp: {provider.defaultTemperature}</span>
                        )}
                        {/* Available models count */}
                        {models.length > 0 && (
                          <div className="flex items-center gap-1">
                            <Zap className="h-3.5 w-3.5 text-purple-400" />
                            <span>{models.length} models cached</span>
                          </div>
                        )}
                        {provider.notes && (
                          <div className="text-xs italic truncate max-w-[300px]">{provider.notes}</div>
                        )}
                      </div>

                      {/* Card-level discover controls */}
                      {cardDiscover?.showPicker && cardDiscover.models.length > 0 && (
                        <div className="border rounded-lg bg-muted/10 overflow-hidden">
                          <div className="flex items-center gap-2 px-3 py-2 border-b bg-muted/20">
                            <Search className="h-3.5 w-3.5 text-muted-foreground" />
                            <Input
                              placeholder="Filter discovered models..."
                              value={cardDiscover.search}
                              onChange={e => setCardDiscoverState(prev => ({ ...prev, [provider.id]: { ...prev[provider.id], search: e.target.value } }))}
                              className="h-7 text-xs border-0 p-0 focus-visible:ring-0 bg-transparent flex-1"
                            />
                            <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                              <Switch
                                checked={cardDiscover.visionOnly}
                                onCheckedChange={v => setCardDiscoverState(prev => ({ ...prev, [provider.id]: { ...prev[provider.id], visionOnly: v } }))}
                                className="scale-75"
                              />
                              <Eye className="h-3 w-3" />
                              <span>Vision only</span>
                            </div>
                            <Button variant="ghost" size="sm" className="h-6 px-2 text-xs" onClick={() => setCardDiscoverState(prev => ({ ...prev, [provider.id]: { ...prev[provider.id], showPicker: false } }))}>
                              Close
                            </Button>
                          </div>
                          <div className="max-h-48 overflow-y-auto">
                            {cardDiscover.models
                              .filter(m => (!cardDiscover.visionOnly || m.isVision) && (cardDiscover.search === "" || m.id.toLowerCase().includes(cardDiscover.search.toLowerCase())))
                              .map(model => (
                                <div key={model.id} className="flex items-center justify-between px-3 py-1.5 border-b border-border/20 last:border-0 text-xs">
                                  <div className="flex items-center gap-1.5 min-w-0">
                                    <span className="font-mono truncate">{model.id}</span>
                                    {model.isVision && (
                                      <Badge className="text-[9px] py-0 px-1 bg-purple-900/40 text-purple-300 border-purple-700/40">
                                        <Eye className="h-2.5 w-2.5 mr-0.5" />vision
                                      </Badge>
                                    )}
                                  </div>
                                  <div className="flex items-center gap-3 shrink-0 text-muted-foreground">
                                    {model.contextLength && <span>ctx: {(model.contextLength / 1000).toFixed(0)}k</span>}
                                    {model.maxTokens && <span>max: {(model.maxTokens / 1000).toFixed(0)}k</span>}
                                    {model.pricingPrompt && <span className="text-green-600">${(Number(model.pricingPrompt) * 1_000_000).toFixed(2)}/M</span>}
                                  </div>
                                </div>
                              ))}
                          </div>
                          <div className="px-3 py-1.5 bg-muted/20 border-t text-[10px] text-muted-foreground">
                            {cardDiscover.models.filter(m => !cardDiscover.visionOnly || m.isVision).length} models — click Edit to select a model and auto-fill context/token limits
                          </div>
                        </div>
                      )}

                      {cardDiscover?.error && (
                        <div className="flex items-center gap-2 text-xs text-red-400 bg-red-950/20 border border-red-700/40 rounded p-2">
                          <AlertCircle className="h-3.5 w-3.5 shrink-0" />
                          {cardDiscover.error}
                        </div>
                      )}

                      {/* Cached models list */}
                      {models.length > 0 && !cardDiscover?.showPicker && (
                        <div className="mt-1">
                          <div className="flex flex-wrap gap-1.5">
                            {(isExpanded ? models : models.slice(0, 8)).map((model: string) => (
                              <Badge key={model} variant="outline" className="text-xs font-mono">{model}</Badge>
                            ))}
                          </div>
                          {models.length > 8 && (
                            <Button variant="ghost" size="sm" className="mt-2 text-xs text-muted-foreground hover:text-foreground gap-1" onClick={() => toggleModelExpand(provider.id)}>
                              {isExpanded ? (
                                <><ChevronUp className="h-3 w-3" /> Show fewer</>
                              ) : (
                                <><ChevronDown className="h-3 w-3" /> Show all {models.length} models</>
                              )}
                            </Button>
                          )}
                        </div>
                      )}

                      {/* Test result details */}
                      {result && !isTestingThis && (
                        <div className={`p-3 rounded-md border text-sm ${result.ok ? "border-green-700/50 bg-green-950/20" : "border-red-700/50 bg-red-950/20"}`}>
                          {result.ok ? (
                            <div className="flex items-center gap-2 text-green-400">
                              <CheckCircle2 className="h-4 w-4" />
                              <span>Connection established in <strong>{result.latencyMs}ms</strong></span>
                              {result.models && result.models.length > 0 && (
                                <span className="text-muted-foreground">— {result.models.length} model{result.models.length !== 1 ? "s" : ""} discovered</span>
                              )}
                            </div>
                          ) : (
                            <div className="flex items-center gap-2 text-red-400">
                              <XCircle className="h-4 w-4" />
                              <span>Connection failed after {result.latencyMs}ms: {result.error}</span>
                            </div>
                          )}
                        </div>
                      )}
                    </CardContent>
                  </Card>
                );
              })}
            </div>
          )}
        </TabsContent>

        {/* ── Pipeline Map Tab ──────────────────────────────────────── */}
        <TabsContent value="pipeline">
          <Card>
            <CardHeader className="pb-2">
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle className="flex items-center gap-2">
                    <GitBranch className="h-5 w-5 text-indigo-400" />
                    Pipeline Relationship Map
                  </CardTitle>
                  <CardDescription className="mt-1">
                    Shows every OCR pipeline stage and the providers inscribed to each. Primary and fallback providers are displayed per stage.
                    Drag to pan · scroll to zoom · use the minimap to navigate.
                  </CardDescription>
                </div>
                <Button variant="outline" size="sm" onClick={() => refetchTopology()} disabled={isTopologyLoading}>
                  {isTopologyLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
                  <span className="ml-2">Refresh</span>
                </Button>
              </div>
            </CardHeader>
            <CardContent className="p-0">
              <div style={{ height: "600px" }} className="rounded-b-lg overflow-hidden">
                <PipelineVisualization
                  topology={topology ?? []}
                  isLoading={isTopologyLoading}
                />
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
