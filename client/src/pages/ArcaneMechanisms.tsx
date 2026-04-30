import { useState } from "react";
import {
  Settings, Database, Cpu, Cloud, AlertTriangle,
  CheckCircle2, WifiOff, RefreshCw, Server, Zap, HardDrive,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { toast } from "sonner";

type ServiceStatus = "online" | "offline" | "degraded" | "checking";

interface ServiceConfig {
  id: string;
  name: string;
  description: string;
  icon: React.ElementType;
  status: ServiceStatus;
  latencyMs?: number;
  detail?: string;
  configFields: { key: string; label: string; placeholder: string; type?: string }[];
}

const INITIAL_SERVICES: ServiceConfig[] = [
  {
    id: "supabase",
    name: "The Arkanum Database",
    description: "Local Supabase / PostgREST instance storing all lore, OCR results, and metadata.",
    icon: Database,
    status: "online",
    latencyMs: 12,
    detail: "PostgreSQL 15 · PostgREST 11",
    configFields: [
      { key: "supabase_url", label: "Supabase URL", placeholder: "http://localhost:54321" },
      { key: "supabase_anon_key", label: "Anon Key", placeholder: "eyJ…", type: "password" },
      { key: "supabase_service_key", label: "Service Role Key", placeholder: "eyJ…", type: "password" },
    ],
  },
  {
    id: "lm_studio",
    name: "Local VLM (LM Studio)",
    description: "On-device Vision-Language Model for Pass 1 layout analysis. Zero cloud cost.",
    icon: Cpu,
    status: "online",
    latencyMs: 340,
    detail: "LLaVA-1.6 · GGUF Q4_K_M",
    configFields: [
      { key: "lm_studio_url", label: "LM Studio API URL", placeholder: "http://localhost:1234/v1" },
      { key: "lm_studio_model", label: "Model ID", placeholder: "llava-v1.6-mistral-7b.Q4_K_M.gguf" },
      { key: "vlm_temperature", label: "Temperature", placeholder: "0.2" },
    ],
  },
  {
    id: "openrouter",
    name: "Cloud Conduit (OpenRouter)",
    description: "Fallback chain for Pass 2 extraction: Gemini 2.5 Pro → Claude 3.5 → GPT-4o.",
    icon: Cloud,
    status: "online",
    latencyMs: 820,
    detail: "3 models configured",
    configFields: [
      { key: "openrouter_api_key", label: "OpenRouter API Key", placeholder: "sk-or-…", type: "password" },
      { key: "openrouter_primary", label: "Primary Model", placeholder: "google/gemini-2.5-pro" },
      { key: "openrouter_fallback_1", label: "Fallback 1", placeholder: "anthropic/claude-3.5-sonnet" },
      { key: "openrouter_fallback_2", label: "Fallback 2", placeholder: "openai/gpt-4o" },
    ],
  },
  {
    id: "n8n",
    name: "Workflow Orchestrator (n8n)",
    description: "Manages ingestion, OCR processing, and enrichment workflow schedules.",
    icon: Zap,
    status: "degraded",
    detail: "2 workflows paused",
    configFields: [
      { key: "n8n_url", label: "n8n URL", placeholder: "http://localhost:5678" },
      { key: "n8n_api_key", label: "n8n API Key", placeholder: "n8n_api_…", type: "password" },
    ],
  },
  {
    id: "local_storage",
    name: "Local Storage (PNG Cache)",
    description: "High-resolution PNG files from PDF conversion, stored on local disk.",
    icon: HardDrive,
    status: "online",
    detail: "14.2 GB used · 85.8 GB free",
    configFields: [
      { key: "local_image_dir", label: "Local Image Directory", placeholder: "/mnt/data/ttrpg-ocr/images" },
      { key: "local_pdf_dir", label: "PDF Input Directory", placeholder: "/mnt/data/ttrpg-ocr/pdfs" },
    ],
  },
  {
    id: "embedding_service",
    name: "Embedding Service",
    description: "Generates vector embeddings for the hybrid RAG retrieval pipeline.",
    icon: Server,
    status: "offline",
    detail: "Service not started",
    configFields: [
      { key: "embedding_model", label: "Embedding Model", placeholder: "nomic-embed-text-v1.5" },
      { key: "embedding_url", label: "Embedding API URL", placeholder: "http://localhost:11434/api/embeddings" },
    ],
  },
];

const STATUS_STYLES: Record<ServiceStatus, { color: string; label: string; icon: React.ElementType }> = {
  online:   { color: "text-emerald-500 border-emerald-500/30 bg-emerald-500/10",  label: "Online",    icon: CheckCircle2 },
  degraded: { color: "text-amber-500 border-amber-500/30 bg-amber-500/10",        label: "Degraded",  icon: AlertTriangle },
  offline:  { color: "text-red-500 border-red-500/30 bg-red-500/10",              label: "Offline",   icon: WifiOff },
  checking: { color: "text-sky-500 border-sky-500/30 bg-sky-500/10",              label: "Checking…", icon: RefreshCw },
};

export default function ArcaneMechanisms() {
  const [services, setServices] = useState<ServiceConfig[]>(INITIAL_SERVICES);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [configs, setConfigs] = useState<Record<string, Record<string, string>>>({});

  const handleCheck = (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    setServices((prev) => prev.map((s) => (s.id === id ? { ...s, status: "checking" } : s)));
    setTimeout(() => {
      setServices((prev) =>
        prev.map((s) =>
          s.id === id ? { ...s, status: s.id === "embedding_service" ? "offline" : "online" } : s
        )
      );
      toast.success(`${services.find((s) => s.id === id)?.name} — check complete.`);
    }, 1200);
  };

  const setField = (serviceId: string, key: string, value: string) => {
    setConfigs((prev) => ({
      ...prev,
      [serviceId]: { ...(prev[serviceId] ?? {}), [key]: value },
    }));
  };

  return (
    <div className="space-y-8 animate-in fade-in duration-500">
      {/* Header */}
      <div>
        <h1 className="text-3xl font-bold tracking-tight flex items-center gap-3">
          <Settings className="w-8 h-8 text-primary" />
          Arcane Mechanisms
        </h1>
        <p className="text-muted-foreground mt-1 max-w-2xl">
          Monitor and configure the underlying systems that power the Kodex. Check service health, update connection strings, and tune the pipeline infrastructure.
        </p>
      </div>

      {/* ── System Health Overview ─────────────────────────────────────── */}
      <section>
        <h2 className="text-xs font-semibold text-muted-foreground uppercase tracking-widest mb-4">
          System Health
        </h2>
        <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
          {services.map((svc) => {
            const style = STATUS_STYLES[svc.status];
            const StatusIcon = style.icon;
            const SvcIcon = svc.icon;
            return (
              <div
                key={svc.id}
                className="flex items-center gap-3 p-3 rounded-xl border border-border/40 bg-card/40 cursor-pointer hover:border-primary/30 transition-colors"
                onClick={() => setExpandedId(expandedId === svc.id ? null : svc.id)}
              >
                <div className="p-2 rounded-lg bg-background/60 border border-border/30">
                  <SvcIcon className="w-4 h-4 text-primary" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-xs font-semibold truncate">{svc.name}</p>
                  {svc.latencyMs && (
                    <p className="text-[10px] text-muted-foreground font-mono">{svc.latencyMs}ms</p>
                  )}
                </div>
                <span className={`flex items-center gap-1 text-[10px] font-semibold px-2 py-0.5 rounded-full border ${style.color}`}>
                  <StatusIcon className={`w-3 h-3 ${svc.status === "checking" ? "animate-spin" : ""}`} />
                  {style.label}
                </span>
              </div>
            );
          })}
        </div>
      </section>

      {/* ── Service Configuration Cards ────────────────────────────────── */}
      <section>
        <h2 className="text-xs font-semibold text-muted-foreground uppercase tracking-widest mb-4">
          Service Configuration
        </h2>
        <div className="space-y-3">
          {services.map((svc) => {
            const isExpanded = expandedId === svc.id;
            const style = STATUS_STYLES[svc.status];
            const StatusIcon = style.icon;
            const SvcIcon = svc.icon;

            return (
              <div key={svc.id} className="rounded-xl border border-border/50 bg-card/40 overflow-hidden">
                {/* Header row */}
                <div
                  className="flex items-center gap-4 px-5 py-4 cursor-pointer hover:bg-card/60 transition-colors"
                  onClick={() => setExpandedId(isExpanded ? null : svc.id)}
                >
                  <div className="p-2.5 rounded-lg bg-primary/10 border border-primary/20">
                    <SvcIcon className="w-5 h-5 text-primary" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <h3 className="font-semibold text-sm">{svc.name}</h3>
                      <span className={`flex items-center gap-1 text-[10px] font-semibold px-2 py-0.5 rounded-full border ${style.color}`}>
                        <StatusIcon className={`w-3 h-3 ${svc.status === "checking" ? "animate-spin" : ""}`} />
                        {style.label}
                      </span>
                      {svc.detail && (
                        <span className="text-[10px] text-muted-foreground font-mono">{svc.detail}</span>
                      )}
                    </div>
                    <p className="text-xs text-muted-foreground mt-0.5">{svc.description}</p>
                  </div>
                  <Button
                    variant="outline"
                    size="sm"
                    className="h-7 text-xs gap-1.5 flex-shrink-0"
                    onClick={(e) => handleCheck(svc.id, e)}
                  >
                    <RefreshCw className={`w-3 h-3 ${svc.status === "checking" ? "animate-spin" : ""}`} />
                    Ping
                  </Button>
                </div>

                {/* Config fields */}
                {isExpanded && (
                  <div className="border-t border-border/40 px-5 py-4 bg-background/30 space-y-4">
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                      {svc.configFields.map((field) => (
                        <div key={field.key}>
                          <label className="text-xs font-medium text-muted-foreground mb-1.5 block">
                            {field.label}
                          </label>
                          <Input
                            type={field.type ?? "text"}
                            placeholder={field.placeholder}
                            value={configs[svc.id]?.[field.key] ?? ""}
                            onChange={(e) => setField(svc.id, field.key, e.target.value)}
                            className="h-8 text-xs font-mono"
                          />
                        </div>
                      ))}
                    </div>
                    <div className="flex justify-end">
                      <Button
                        size="sm"
                        className="h-7 text-xs gap-1.5"
                        onClick={() => toast.success("Configuration inscribed. Restart the service to apply changes.")}
                      >
                        <CheckCircle2 className="w-3 h-3" />
                        Inscribe Configuration
                      </Button>
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </section>
    </div>
  );
}
