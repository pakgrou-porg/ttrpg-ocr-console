import { useAuth } from "@/_core/hooks/useAuth";
import { trpc } from "@/lib/trpc";
import { Link } from "wouter";
import { Edit3, Search, BookOpen, Activity, BarChart3, Settings } from "lucide-react";

// Orb status types
type OrbStatus = "lit" | "dim" | "pulsing" | "error";

const ORB_GLOW: Record<OrbStatus, string> = {
  lit: "shadow-[0_0_18px_4px] shadow-current opacity-100",
  pulsing: "shadow-[0_0_18px_4px] shadow-current opacity-100 animate-pulse",
  dim: "opacity-30",
  error: "shadow-[0_0_18px_4px] shadow-red-500 opacity-100",
};

const MODULES = [
  {
    title: "Enter the Arkanum",
    description: "Access extracted records for active gameplay, save entities, and organize grimoires.",
    icon: Edit3,
    href: "/enter-arkanum",
  },
  {
    title: "Listen to Ramblings",
    description: "Explore the structured dataset with natural language queries and random lore.",
    icon: Search,
    href: "/listen-ramblings",
  },
  {
    title: "Tome of Knowledge",
    description: "Guides, tutorials, and documentation for operating the Kodex.",
    icon: BookOpen,
    href: "/tome-knowledge",
  },
  {
    title: "Oversee the Scribes",
    description: "Track ingestion queues, background processes, and the HITL review queue.",
    icon: Activity,
    href: "/oversee-scribes",
  },
  {
    title: "Divination & Omens",
    description: "Monitor pipeline telemetry, query volumes, and lore composition analytics.",
    icon: BarChart3,
    href: "/divination-omens",
  },
  {
    title: "The Inner Sanctum",
    description: "Configure systems, content imports, arcane incantations, and user access.",
    icon: Settings,
    href: "/inner-sanctum/arcane-mechanisms",
  },
];

export default function Home() {
  const { user } = useAuth();
  const { data: healthData, isLoading: healthLoading } = trpc.health.all.useQuery(undefined, {
    refetchInterval: 30000, // Poll every 30s
  });
  const { data: jobStats } = trpc.jobs.stats.useQuery(undefined, {
    refetchInterval: 15000,
  });

  // Derive orb states from live data
  const orbs = [
    {
      id: "arkanum",
      label: "The Arkanum",
      sublabel: healthLoading ? "Checking..." : healthData?.database.ok ? `Online (${healthData.database.latencyMs}ms)` : "Offline",
      status: (healthLoading ? "pulsing" : healthData?.database.ok ? "lit" : "error") as OrbStatus,
      color: "from-emerald-500 to-emerald-700",
    },
    {
      id: "agents",
      label: "Agents",
      sublabel: healthLoading ? "Checking..." : healthData?.agents.ok ? healthData.agents.detail : "Unavailable",
      status: (healthLoading ? "pulsing" : healthData?.agents.ok ? "pulsing" : "error") as OrbStatus,
      color: "from-violet-500 to-violet-700",
    },
    {
      id: "scribes",
      label: "Scribes",
      sublabel: jobStats?.active ? `${jobStats.active} Job(s) Active` : "Idle — No Active Jobs",
      status: (jobStats?.active ? "pulsing" : "dim") as OrbStatus,
      color: "from-amber-500 to-amber-700",
    },
    {
      id: "openrouter",
      label: "Cloud Conduit",
      sublabel: healthLoading ? "Checking..." : healthData?.cloudConduit.ok ? healthData.cloudConduit.detail : "Unavailable",
      status: (healthLoading ? "pulsing" : healthData?.cloudConduit.ok ? "lit" : "error") as OrbStatus,
      color: "from-sky-500 to-sky-700",
    },
  ];

  return (
    <div className="space-y-10 animate-in fade-in duration-500">

      {/* ── Header ─────────────────────────────────────────────────────── */}
      <div>
        <h1 className="text-4xl font-bold tracking-tight mb-2 flex items-center gap-3">
          <BookOpen className="w-10 h-10 text-primary" />
          Evos' Infinite Kodex
        </h1>
        <p className="text-lg text-muted-foreground max-w-3xl">
          Welcome{user?.name ? `, ${user.name}` : ""} to the Vault of Lore. The Arkanum awaits your command.
        </p>
      </div>

      {/* ── Orb Status Array ────────────────────────────────────────────── */}
      <section>
        <h2 className="text-xs font-semibold text-muted-foreground uppercase tracking-widest mb-4">
          Arcane Vitals
        </h2>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-6">
          {orbs.map((orb) => (
            <div
              key={orb.id}
              className="flex flex-col items-center gap-3 p-5 rounded-xl border border-border/40 bg-card/40 backdrop-blur-sm"
            >
              {/* Orb */}
              <div className="relative flex items-center justify-center">
                <div
                  className={`w-12 h-12 rounded-full bg-gradient-to-br ${orb.color} ${ORB_GLOW[orb.status]}`}
                />
                {orb.status === "pulsing" && (
                  <div
                    className={`absolute w-12 h-12 rounded-full bg-gradient-to-br ${orb.color} opacity-40 scale-150 animate-ping`}
                  />
                )}
              </div>
              {/* Labels */}
              <div className="text-center">
                <p className="text-sm font-semibold leading-tight">{orb.label}</p>
                <p className="text-xs text-muted-foreground mt-0.5">{orb.sublabel}</p>
              </div>
            </div>
          ))}
        </div>
        <p className="text-xs text-muted-foreground mt-3 text-right">
          Full system diagnostics available in{" "}
          <Link href="/inner-sanctum/arcane-mechanisms" className="text-primary hover:underline">
            Arcane Mechanisms
          </Link>
        </p>
      </section>

      {/* ── Module Grid ─────────────────────────────────────────────────── */}
      <section>
        <h2 className="text-xs font-semibold text-muted-foreground uppercase tracking-widest mb-4">
          Chambers of the Kodex
        </h2>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {MODULES.map((mod) => {
            const Icon = mod.icon;
            return (
              <Link key={mod.href} href={mod.href}>
                <div className="group h-full p-5 rounded-xl border border-border/40 bg-card/40 hover:border-primary/50 hover:bg-card/70 hover:shadow-[0_0_20px_rgba(139,92,246,0.12)] transition-all duration-300 cursor-pointer">
                  <div className="flex items-start gap-3">
                    <div className="p-2 rounded-lg bg-primary/10 border border-primary/20 group-hover:bg-primary/20 transition-colors">
                      <Icon className="w-5 h-5 text-primary" />
                    </div>
                    <div>
                      <h3 className="font-semibold text-sm leading-tight mb-1">{mod.title}</h3>
                      <p className="text-xs text-muted-foreground leading-relaxed">{mod.description}</p>
                    </div>
                  </div>
                </div>
              </Link>
            );
          })}
        </div>
      </section>

    </div>
  );
}
