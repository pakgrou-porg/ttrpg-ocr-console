import { useState, useEffect } from "react";
import {
  Settings, Database, AlertTriangle,
  CheckCircle2, WifiOff, RefreshCw, Zap, Loader2, ShieldAlert, Clock,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { trpc } from "@/lib/trpc";
import { fmtMs } from "@/lib/utils";
import { getProviderIcon } from "@/lib/providerUtils";

// ─── Types ────────────────────────────────────────────────────────────────────

type ServiceStatus = "online" | "offline" | "tripped" | "checking";

const STATUS_STYLES: Record<ServiceStatus, { color: string; label: string; icon: React.ElementType }> = {
  online:  { color: "text-emerald-500 border-emerald-500/30 bg-emerald-500/10", label: "Online",   icon: CheckCircle2 },
  offline: { color: "text-red-500 border-red-500/30 bg-red-500/10",             label: "Offline",  icon: WifiOff },
  tripped: { color: "text-amber-500 border-amber-500/30 bg-amber-500/10",       label: "Tripped",  icon: ShieldAlert },
  checking:{ color: "text-sky-500 border-sky-500/30 bg-sky-500/10",             label: "Checking…",icon: RefreshCw },
};

// ─── Database config fields ───────────────────────────────────────────────────

const DB_CONFIG_FIELDS = [
  { key: "supabase_url",         label: "Supabase URL",        placeholder: "http://localhost:54321" },
  { key: "supabase_anon_key",    label: "Anon Key",            placeholder: "eyJ…", type: "password" as const },
  { key: "supabase_service_key", label: "Service Role Key",    placeholder: "eyJ…", type: "password" as const },
];

// ─── Provider status card ─────────────────────────────────────────────────────

interface ProviderEntry {
  id: number;
  displayName: string;
  providerType: string;
  modelId: string | null;
  ok: boolean;
  latencyMs: number;
  detail: string;
  circuit: { failCount: number; trippedAt: number | null; cooldownRemainingMs: number };
}

function ProviderCard({ p }: { p: ProviderEntry }) {
  const tripped = p.circuit.cooldownRemainingMs > 0;
  const status: ServiceStatus = tripped ? "tripped" : p.ok ? "online" : "offline";
  const style = STATUS_STYLES[status];
  const StatusIcon = style.icon;
  const Icon = getProviderIcon(p.providerType);

  return (
    <div className="rounded-xl border border-border/50 bg-card/40 px-5 py-4">
      <div className="flex items-start gap-4">
        <div className="p-2.5 rounded-lg bg-primary/10 border border-primary/20 mt-0.5">
          <Icon className="w-5 h-5 text-primary" />
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <h3 className="font-semibold text-sm">{p.displayName}</h3>
            <span className={`flex items-center gap-1 text-[10px] font-semibold px-2 py-0.5 rounded-full border ${style.color}`}>
              <StatusIcon className="w-3 h-3" />
              {style.label}
            </span>
            {p.ok && p.latencyMs > 0 && (
              <span className="text-[10px] text-muted-foreground font-mono">{p.latencyMs}ms</span>
            )}
          </div>
          <p className="text-xs text-muted-foreground mt-0.5 font-mono truncate">{p.detail}</p>

          {(tripped || p.circuit.failCount > 0) && (
            <div className={`mt-2 flex items-center gap-2 text-[11px] ${tripped ? "text-amber-500" : "text-muted-foreground"}`}>
              {tripped ? (
                <>
                  <Clock className="w-3.5 h-3.5 flex-shrink-0" />
                  <span>
                    Circuit open — cooldown <span className="font-mono font-semibold">{fmtMs(p.circuit.cooldownRemainingMs)}</span> remaining
                    &nbsp;({p.circuit.failCount} consecutive failure{p.circuit.failCount !== 1 ? "s" : ""})
                  </span>
                </>
              ) : (
                <>
                  <AlertTriangle className="w-3.5 h-3.5 flex-shrink-0" />
                  <span>{p.circuit.failCount} recent failure{p.circuit.failCount !== 1 ? "s" : ""} — circuit not yet tripped</span>
                </>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ─── Static info cards (non-LLM infrastructure) ───────────────────────────────

function StaticInfoCard({
  icon: Icon, title, status, detail,
}: { icon: React.ElementType; title: string; status: ServiceStatus; detail: string }) {
  const style = STATUS_STYLES[status];
  const StatusIcon = style.icon;
  return (
    <div className="rounded-xl border border-border/50 bg-card/40 px-5 py-4">
      <div className="flex items-center gap-4">
        <div className="p-2.5 rounded-lg bg-primary/10 border border-primary/20">
          <Icon className="w-5 h-5 text-primary" />
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <h3 className="font-semibold text-sm">{title}</h3>
            <span className={`flex items-center gap-1 text-[10px] font-semibold px-2 py-0.5 rounded-full border ${style.color}`}>
              <StatusIcon className="w-3 h-3" />
              {style.label}
            </span>
          </div>
          <p className="text-xs text-muted-foreground mt-0.5 font-mono">{detail}</p>
        </div>
      </div>
    </div>
  );
}

// ─── Main page ────────────────────────────────────────────────────────────────

export default function ArcaneMechanisms() {
  const [dbConfigOpen, setDbConfigOpen] = useState(false);
  const [dbFields, setDbFields] = useState<Record<string, string>>({});

  const { data: healthData, isLoading: healthLoading } = trpc.health.all.useQuery(
    undefined,
    { refetchInterval: 30_000 },
  );
  const { data: savedConfigs, isLoading: configsLoading } = trpc.config.list.useQuery();
  const saveConfigMutation = trpc.config.set.useMutation();

  useEffect(() => {
    if (savedConfigs && Object.keys(dbFields).length === 0) {
      const grouped: Record<string, string> = {};
      savedConfigs.forEach((cfg: any) => {
        if (cfg.key.startsWith("supabase.")) {
          grouped[cfg.key.replace("supabase.", "")] = cfg.value;
        }
      });
      setDbFields(grouped);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [savedConfigs]);

  const handleSaveDbConfig = async () => {
    await Promise.all(
      Object.entries(dbFields).map(([k, v]) =>
        saveConfigMutation.mutateAsync({ key: `supabase.${k}`, value: v, category: "service_config" })
      )
    );
  };

  const providers: ProviderEntry[] = healthData?.providers ?? [];

  const dbStatus: ServiceStatus = healthLoading
    ? "checking"
    : healthData?.database.ok
      ? "online"
      : "offline";

  // Pipeline engine is always "online" when reachable — active jobs are normal operation.
  const scribesStatus: ServiceStatus = healthLoading ? "checking" : "online";

  const scribesDetail = healthLoading ? "…" : (healthData?.scribes.detail ?? "");

  return (
    <div className="space-y-8 animate-in fade-in duration-500">
      {/* Header */}
      <div>
        <h1 className="text-3xl font-bold tracking-tight flex items-center gap-3">
          <Settings className="w-8 h-8 text-primary" />
          Arcane Mechanisms
        </h1>
        <p className="text-muted-foreground mt-1 max-w-2xl">
          Monitor the health of every Artificer and connected service. Circuit breaker state, live latency, and cooldown timers update every 30 seconds.
        </p>
      </div>

      {/* ── Artificers (LLM Providers) ────────────────────────────────── */}
      <section>
        <h2 className="text-xs font-semibold text-muted-foreground uppercase tracking-widest mb-4">
          Artificers
        </h2>
        {healthLoading ? (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="w-8 h-8 animate-spin text-muted-foreground" />
          </div>
        ) : providers.length === 0 ? (
          <div className="rounded-xl border border-border/40 bg-card/30 px-5 py-8 text-center text-sm text-muted-foreground">
            No active providers configured. Add providers in <span className="font-semibold">Conclave → Artificers</span>.
          </div>
        ) : (
          <div className="space-y-3">
            {providers.map(p => <ProviderCard key={p.id} p={p} />)}
          </div>
        )}
      </section>

      {/* ── Infrastructure ────────────────────────────────────────────── */}
      <section>
        <h2 className="text-xs font-semibold text-muted-foreground uppercase tracking-widest mb-4">
          Infrastructure
        </h2>
        <div className="space-y-3">
          <StaticInfoCard
            icon={Database}
            title="The Arkanum Database"
            status={dbStatus}
            detail={
              healthLoading
                ? "…"
                : healthData?.database.ok
                  ? `Connected — ${healthData.database.latencyMs}ms`
                  : "Unreachable"
            }
          />
          <StaticInfoCard
            icon={Zap}
            title="Pipeline Engine"
            status={scribesStatus}
            detail={scribesDetail}
          />
        </div>
      </section>

      {/* ── Database Configuration ────────────────────────────────────── */}
      <section>
        <h2 className="text-xs font-semibold text-muted-foreground uppercase tracking-widest mb-4">
          Database Configuration
        </h2>
        {configsLoading ? (
          <div className="flex items-center justify-center py-8">
            <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
          </div>
        ) : (
          <div className="rounded-xl border border-border/50 bg-card/40 overflow-hidden">
            <div
              className="flex items-center gap-4 px-5 py-4 cursor-pointer hover:bg-card/60 transition-colors"
              onClick={() => setDbConfigOpen(!dbConfigOpen)}
            >
              <div className="p-2.5 rounded-lg bg-primary/10 border border-primary/20">
                <Database className="w-5 h-5 text-primary" />
              </div>
              <div className="flex-1">
                <h3 className="font-semibold text-sm">Supabase Connection</h3>
                <p className="text-xs text-muted-foreground">URL and API keys for the local Supabase instance</p>
              </div>
              <RefreshCw className={`w-4 h-4 text-muted-foreground transition-transform ${dbConfigOpen ? "rotate-90" : ""}`} />
            </div>
            {dbConfigOpen && (
              <div className="border-t border-border/40 px-5 py-4 bg-background/30 space-y-4">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  {DB_CONFIG_FIELDS.map(field => (
                    <div key={field.key}>
                      <label className="text-xs font-medium text-muted-foreground mb-1.5 block">
                        {field.label}
                      </label>
                      <Input
                        type={field.type ?? "text"}
                        placeholder={field.placeholder}
                        value={dbFields[field.key] ?? ""}
                        onChange={e => setDbFields(prev => ({ ...prev, [field.key]: e.target.value }))}
                        className="h-8 text-xs font-mono"
                      />
                    </div>
                  ))}
                </div>
                <div className="flex justify-end">
                  <Button
                    size="sm"
                    className="h-7 text-xs gap-1.5"
                    onClick={handleSaveDbConfig}
                    disabled={saveConfigMutation.isPending}
                  >
                    {saveConfigMutation.isPending
                      ? <Loader2 className="w-3 h-3 animate-spin" />
                      : <CheckCircle2 className="w-3 h-3" />}
                    Inscribe Configuration
                  </Button>
                </div>
              </div>
            )}
          </div>
        )}
        <p className="text-xs text-muted-foreground mt-3">
          Configure LLM provider URLs, models, and API keys in{" "}
          <span className="font-semibold text-foreground">Conclave → Artificers</span>.
        </p>
      </section>
    </div>
  );
}
