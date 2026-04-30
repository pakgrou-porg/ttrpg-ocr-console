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
import { toast } from "sonner";
import {
  Cpu, Plus, Trash2, TestTube, Key, Loader2, CheckCircle2, XCircle, Wifi, Search, ChevronDown, ChevronUp, Zap, Edit, Info
} from "lucide-react";

// ─── Provider Presets ─────────────────────────────────────────────────────────
// Known cloud providers with default API base URLs and helpful descriptions.
// These auto-populate when a provider type is selected, but remain fully editable.

interface ProviderPreset {
  name: string;
  baseUrl: string;
  description: string;
  requiresApiKey: boolean;
  apiKeyHint: string;
}

const PROVIDER_PRESETS: Record<string, ProviderPreset> = {
  openai_compatible: {
    name: "",
    baseUrl: "",
    description: "Any OpenAI-compatible API endpoint (custom or self-hosted).",
    requiresApiKey: false,
    apiKeyHint: "Depends on provider",
  },
  lm_studio: {
    name: "LM Studio (Local)",
    baseUrl: "http://localhost:1234/v1",
    description: "Local LM Studio instance. Typically runs on port 1234 with no API key required.",
    requiresApiKey: false,
    apiKeyHint: "Usually not required for local instances",
  },
  openrouter: {
    name: "OpenRouter",
    baseUrl: "https://openrouter.ai/api/v1",
    description: "OpenRouter aggregates 300+ models from multiple providers with unified billing.",
    requiresApiKey: true,
    apiKeyHint: "sk-or-v1-... (from openrouter.ai/keys)",
  },
  venice_ai: {
    name: "Venice.ai",
    baseUrl: "https://api.venice.ai/api/v1",
    description: "Venice.ai provides privacy-focused AI inference with uncensored models.",
    requiresApiKey: true,
    apiKeyHint: "venice-... (from venice.ai/settings/api)",
  },
  anthropic: {
    name: "Anthropic",
    baseUrl: "https://api.anthropic.com/v1",
    description: "Anthropic's Claude models. Note: uses a slightly different API format.",
    requiresApiKey: true,
    apiKeyHint: "sk-ant-... (from console.anthropic.com)",
  },
  google: {
    name: "Google AI (Gemini)",
    baseUrl: "https://generativelanguage.googleapis.com/v1beta/openai",
    description: "Google's Gemini models via the OpenAI-compatible endpoint.",
    requiresApiKey: true,
    apiKeyHint: "AIza... (from aistudio.google.com/apikey)",
  },
  custom: {
    name: "",
    baseUrl: "",
    description: "Custom endpoint. Specify your own base URL and configuration.",
    requiresApiKey: false,
    apiKeyHint: "Depends on your endpoint",
  },
};

interface TestResult {
  ok: boolean;
  latencyMs: number;
  models?: string[];
  error?: string;
}

interface ProviderForm {
  name: string;
  providerType: string;
  baseUrl: string;
  apiKey: string;
  notes: string;
}

export default function TheArtificers() {
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [isEditOpen, setIsEditOpen] = useState(false);
  const [editingProvider, setEditingProvider] = useState<any>(null);
  const [testResults, setTestResults] = useState<Record<number, TestResult>>({});
  const [testingId, setTestingId] = useState<number | null>(null);
  const [discoveringId, setDiscoveringId] = useState<number | null>(null);
  const [expandedModels, setExpandedModels] = useState<Record<number, boolean>>({});

  const { data: providers, isLoading, refetch } = trpc.providers.list.useQuery();
  const { data: providerTypes } = trpc.providers.types.useQuery();

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
      setDiscoveringId(null);
    },
    onError: (e) => {
      toast.error(e.message);
      setTestingId(null);
      setDiscoveringId(null);
    },
  });

  const [form, setForm] = useState<ProviderForm>({
    name: "", providerType: "openai_compatible", baseUrl: "", apiKey: "", notes: "",
  });

  const [editForm, setEditForm] = useState<ProviderForm>({
    name: "", providerType: "openai_compatible", baseUrl: "", apiKey: "", notes: "",
  });

  const resetForm = () => setForm({ name: "", providerType: "openai_compatible", baseUrl: "", apiKey: "", notes: "" });

  // Auto-populate form fields when provider type changes (Create dialog)
  const handleProviderTypeChange = (providerType: string) => {
    const preset = PROVIDER_PRESETS[providerType];
    setForm(f => ({
      ...f,
      providerType,
      // Only auto-populate if the user hasn't manually typed something
      name: f.name === "" || f.name === PROVIDER_PRESETS[f.providerType]?.name ? (preset?.name ?? "") : f.name,
      baseUrl: f.baseUrl === "" || f.baseUrl === PROVIDER_PRESETS[f.providerType]?.baseUrl ? (preset?.baseUrl ?? "") : f.baseUrl,
    }));
  };

  // Auto-populate form fields when provider type changes (Edit dialog)
  const handleEditProviderTypeChange = (providerType: string) => {
    const preset = PROVIDER_PRESETS[providerType];
    setEditForm(f => ({
      ...f,
      providerType,
      // Only auto-populate baseUrl if it matches the old preset (user hasn't customized it)
      baseUrl: f.baseUrl === PROVIDER_PRESETS[f.providerType]?.baseUrl ? (preset?.baseUrl ?? f.baseUrl) : f.baseUrl,
    }));
  };

  const handleCreate = () => {
    createMutation.mutate({
      name: form.name,
      providerType: form.providerType as any,
      baseUrl: form.baseUrl,
      apiKey: form.apiKey || undefined,
      notes: form.notes || undefined,
    });
  };

  const handleEdit = (provider: any) => {
    setEditingProvider(provider);
    setEditForm({
      name: provider.name,
      providerType: provider.providerType,
      baseUrl: provider.baseUrl,
      apiKey: "",
      notes: provider.notes ?? "",
    });
    setIsEditOpen(true);
  };

  const handleUpdate = () => {
    if (!editingProvider) return;
    updateMutation.mutate({
      id: editingProvider.id,
      name: editForm.name || undefined,
      providerType: editForm.providerType as any,
      baseUrl: editForm.baseUrl || undefined,
      apiKey: editForm.apiKey || undefined,
      notes: editForm.notes || undefined,
    });
  };

  const handleTestConnection = (providerId: number) => {
    setTestingId(providerId);
    testMutation.mutate({ id: providerId });
  };

  const handleDiscoverModels = (providerId: number) => {
    setDiscoveringId(providerId);
    testMutation.mutate({ id: providerId });
  };

  const toggleModelExpand = (providerId: number) => {
    setExpandedModels(prev => ({ ...prev, [providerId]: !prev[providerId] }));
  };

  const currentPreset = PROVIDER_PRESETS[form.providerType];
  const editPreset = PROVIDER_PRESETS[editForm.providerType];

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
          <DialogContent className="max-w-lg">
            <DialogHeader>
              <DialogTitle>Forge New Artificer</DialogTitle>
              <DialogDescription>Register a new LLM provider endpoint for use in the pipeline.</DialogDescription>
            </DialogHeader>
            <div className="space-y-4">
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
                {currentPreset?.description && (
                  <p className="text-xs text-muted-foreground flex items-start gap-1.5 mt-1">
                    <Info className="h-3.5 w-3.5 mt-0.5 shrink-0 text-purple-400" />
                    {currentPreset.description}
                  </p>
                )}
              </div>
              <div className="space-y-2">
                <Label>Name</Label>
                <Input
                  placeholder={currentPreset?.name || "e.g., My Provider Instance"}
                  value={form.name}
                  onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
                />
              </div>
              <div className="space-y-2">
                <Label>
                  Base URL
                  {currentPreset?.baseUrl && form.baseUrl === currentPreset.baseUrl && (
                    <Badge variant="secondary" className="ml-2 text-[10px] py-0">auto-filled</Badge>
                  )}
                </Label>
                <Input
                  placeholder={currentPreset?.baseUrl || "http://localhost:1234/v1"}
                  value={form.baseUrl}
                  onChange={e => setForm(f => ({ ...f, baseUrl: e.target.value }))}
                />
              </div>
              <div className="space-y-2">
                <Label>
                  API Key
                  {currentPreset?.requiresApiKey && (
                    <Badge variant="destructive" className="ml-2 text-[10px] py-0">required</Badge>
                  )}
                  {!currentPreset?.requiresApiKey && (
                    <span className="text-muted-foreground text-xs ml-1">(optional, encrypted at rest)</span>
                  )}
                </Label>
                <Input
                  type="password"
                  placeholder={currentPreset?.apiKeyHint || "sk-..."}
                  value={form.apiKey}
                  onChange={e => setForm(f => ({ ...f, apiKey: e.target.value }))}
                />
              </div>
              <div className="space-y-2">
                <Label>Notes</Label>
                <Textarea placeholder="Optional notes about this provider..." value={form.notes} onChange={e => setForm(f => ({ ...f, notes: e.target.value }))} />
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setIsCreateOpen(false)}>Cancel</Button>
              <Button onClick={handleCreate} disabled={!form.name || !form.baseUrl || createMutation.isPending}>
                {createMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
                Forge Artificer
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>

      {/* Edit Dialog */}
      <Dialog open={isEditOpen} onOpenChange={(open) => { setIsEditOpen(open); if (!open) setEditingProvider(null); }}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Edit Artificer</DialogTitle>
            <DialogDescription>Modify the configuration of this LLM provider. Leave API Key blank to keep the existing key.</DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>Provider Type</Label>
              <Select value={editForm.providerType} onValueChange={handleEditProviderTypeChange}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {providerTypes?.map(t => (
                    <SelectItem key={t.id} value={t.id}>{t.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {editPreset?.description && (
                <p className="text-xs text-muted-foreground flex items-start gap-1.5 mt-1">
                  <Info className="h-3.5 w-3.5 mt-0.5 shrink-0 text-purple-400" />
                  {editPreset.description}
                </p>
              )}
            </div>
            <div className="space-y-2">
              <Label>Name</Label>
              <Input
                placeholder={editPreset?.name || "e.g., My Provider Instance"}
                value={editForm.name}
                onChange={e => setEditForm(f => ({ ...f, name: e.target.value }))}
              />
            </div>
            <div className="space-y-2">
              <Label>
                Base URL
                {editPreset?.baseUrl && editForm.baseUrl === editPreset.baseUrl && (
                  <Badge variant="secondary" className="ml-2 text-[10px] py-0">default</Badge>
                )}
              </Label>
              <Input
                placeholder={editPreset?.baseUrl || "http://localhost:1234/v1"}
                value={editForm.baseUrl}
                onChange={e => setEditForm(f => ({ ...f, baseUrl: e.target.value }))}
              />
            </div>
            <div className="space-y-2">
              <Label>
                API Key
                {editingProvider?.hasApiKey && (
                  <Badge variant="secondary" className="ml-2 text-[10px] py-0">currently set</Badge>
                )}
                <span className="text-muted-foreground text-xs ml-1">(leave blank to keep existing)</span>
              </Label>
              <Input
                type="password"
                placeholder={editPreset?.apiKeyHint || "sk-..."}
                value={editForm.apiKey}
                onChange={e => setEditForm(f => ({ ...f, apiKey: e.target.value }))}
              />
            </div>
            <div className="space-y-2">
              <Label>Notes</Label>
              <Textarea placeholder="Optional notes about this provider..." value={editForm.notes} onChange={e => setEditForm(f => ({ ...f, notes: e.target.value }))} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsEditOpen(false)}>Cancel</Button>
            <Button onClick={handleUpdate} disabled={!editForm.name || !editForm.baseUrl || updateMutation.isPending}>
              {updateMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
              Update Artificer
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Provider List */}
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
            const isDiscoveringThis = discoveringId === provider.id;
            const models = (provider.availableModels as string[]) ?? [];
            const isExpanded = expandedModels[provider.id] ?? false;

            return (
              <Card key={provider.id} className={`transition-all ${!provider.isActive ? "opacity-60" : ""}`}>
                <CardHeader className="pb-3">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <div className={`w-3 h-3 rounded-full ${provider.isActive ? "bg-green-500 shadow-[0_0_8px_rgba(34,197,94,0.6)]" : "bg-gray-500"}`} />
                      <CardTitle className="text-lg">{provider.name}</CardTitle>
                      <Badge variant="secondary">{provider.providerType?.split("_").map((w: string) => w.charAt(0).toUpperCase() + w.slice(1)).join(" ")}</Badge>
                      {/* Inline test result badge */}
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
                    <div className="flex items-center gap-2">
                      {/* Test Connection Button */}
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => handleTestConnection(provider.id)}
                        disabled={isTestingThis || isDiscoveringThis}
                        className="gap-1.5"
                      >
                        {isTestingThis ? (
                          <Loader2 className="h-4 w-4 animate-spin" />
                        ) : (
                          <TestTube className="h-4 w-4" />
                        )}
                        Test Connection
                      </Button>
                      {/* Discover Models Button */}
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => handleDiscoverModels(provider.id)}
                        disabled={isTestingThis || isDiscoveringThis}
                        className="gap-1.5"
                      >
                        {isDiscoveringThis ? (
                          <Loader2 className="h-4 w-4 animate-spin" />
                        ) : (
                          <Search className="h-4 w-4" />
                        )}
                        Discover Models
                      </Button>
                      {/* Edit Button */}
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => handleEdit(provider)}
                        className="gap-1.5"
                      >
                        <Edit className="h-4 w-4" />
                        Edit
                      </Button>
                      {/* Enable/Disable Toggle */}
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => updateMutation.mutate({ id: provider.id, isActive: !provider.isActive })}
                      >
                        <Wifi className="h-4 w-4" />
                        <span className="ml-1">{provider.isActive ? "Disable" : "Enable"}</span>
                      </Button>
                      {/* Delete Button */}
                      <Button
                        variant="destructive"
                        size="sm"
                        onClick={() => { if (confirm("Banish this Artificer? All model assignments will also be removed.")) deleteMutation.mutate({ id: provider.id }); }}
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>
                  <CardDescription className="ml-6">{provider.baseUrl}</CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="flex items-center gap-6 text-sm text-muted-foreground">
                    <div className="flex items-center gap-1">
                      <Key className="h-3.5 w-3.5" />
                      {provider.hasApiKey ? (
                        <span className="font-mono text-xs">{provider.maskedApiKey}</span>
                      ) : (
                        <span className="italic">No API key set</span>
                      )}
                    </div>
                    {models.length > 0 && (
                      <div className="flex items-center gap-1">
                        <Zap className="h-3.5 w-3.5 text-purple-400" />
                        <span>{models.length} models available</span>
                      </div>
                    )}
                    {provider.notes && (
                      <div className="text-xs italic truncate max-w-[300px]">{provider.notes}</div>
                    )}
                  </div>

                  {/* Available Models Section */}
                  {models.length > 0 && (
                    <div className="mt-3">
                      <div className="flex flex-wrap gap-1.5">
                        {(isExpanded ? models : models.slice(0, 8)).map((model: string) => (
                          <Badge key={model} variant="outline" className="text-xs font-mono">{model}</Badge>
                        ))}
                      </div>
                      {models.length > 8 && (
                        <Button
                          variant="ghost"
                          size="sm"
                          className="mt-2 text-xs text-muted-foreground hover:text-foreground gap-1"
                          onClick={() => toggleModelExpand(provider.id)}
                        >
                          {isExpanded ? (
                            <>
                              <ChevronUp className="h-3 w-3" />
                              Show fewer models
                            </>
                          ) : (
                            <>
                              <ChevronDown className="h-3 w-3" />
                              Show all {models.length} models
                            </>
                          )}
                        </Button>
                      )}
                    </div>
                  )}

                  {/* Test result details (shown after a test) */}
                  {result && !isTestingThis && (
                    <div className={`mt-3 p-3 rounded-md border text-sm ${result.ok ? "border-green-700/50 bg-green-950/20" : "border-red-700/50 bg-red-950/20"}`}>
                      {result.ok ? (
                        <div className="flex items-center gap-2 text-green-400">
                          <CheckCircle2 className="h-4 w-4" />
                          <span>Connection established in <strong>{result.latencyMs}ms</strong></span>
                          {result.models && result.models.length > 0 && (
                            <span className="text-muted-foreground">— {result.models.length} model{result.models.length !== 1 ? "s" : ""} discovered and cached</span>
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
    </div>
  );
}
