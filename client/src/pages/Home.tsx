import { Card, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { BookOpen, Settings, Activity, Edit3, Search, BarChart2, HelpCircle, User } from "lucide-react";
import { Link } from "wouter";
import { useAuth } from "@/_core/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { getLoginUrl } from "@/const";

export default function Home() {
  const { user, isAuthenticated } = useAuth();

  const modules = [
    {
      title: "Enter the Arkanum",
      description: "Access extracted records for active gameplay, save entities, and organize groups.",
      icon: Edit3,
      href: "/enter-arkanum",
      color: "text-blue-400",
    },
    {
      title: "Listen to Ramblings",
      description: "Explore the entire structured dataset with natural language queries and filters.",
      icon: Search,
      href: "/listen-ramblings",
      color: "text-emerald-400",
    },
    {
      title: "Oversee the Scribes",
      description: "Track ingestion queues, background processes, and the HITL review queue.",
      icon: Activity,
      href: "/oversee-scribes",
      color: "text-orange-400",
    },
    {
      title: "Divination & Omens",
      description: "Monitor pipeline telemetry, query volumes, and lore composition analytics.",
      icon: BarChart2,
      href: "/divination-omens",
      color: "text-yellow-400",
    },
    {
      title: "Tome of Knowledge",
      description: "Guides, tutorials, and documentation for operating the Kodex.",
      icon: HelpCircle,
      href: "/tome-knowledge",
      color: "text-sky-400",
    },
    {
      title: "The Inner Sanctum",
      description: "Configure systems, content imports, and arcane incantations.",
      icon: Settings,
      href: "/arcane-mechanisms",
      color: "text-purple-400",
    },
  ];

  return (
    <div className="space-y-8 animate-in fade-in duration-500">
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-4xl font-bold tracking-tight mb-2 flex items-center gap-3">
            <BookOpen className="w-10 h-10 text-primary" />
            Evos' Infinite Kodex
          </h1>
          <p className="text-lg text-muted-foreground max-w-3xl">
            Welcome to the Vault of Lore. Manage the scribes, monitor the arcane consensus, and resolve flagged incantations to build the ultimate grimoire.
          </p>
        </div>
        {isAuthenticated ? (
          <Link href="/personal-sanctum">
            <Button variant="outline" className="gap-2 border-primary/40 hover:border-primary">
              <User className="w-4 h-4" />
              {user?.name ?? "My Sanctum"}
            </Button>
          </Link>
        ) : (
          <a href={getLoginUrl()}>
            <Button variant="outline" className="gap-2 border-primary/40 hover:border-primary">
              <User className="w-4 h-4" />
              Enter the Gates
            </Button>
          </a>
        )}
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
        {modules.map((mod) => {
          const Icon = mod.icon;
          return (
            <Link key={mod.href} href={mod.href}>
              <Card className="h-full hover:border-primary/50 hover:shadow-[0_0_20px_rgba(139,92,246,0.15)] transition-all duration-300 bg-card/50 backdrop-blur-sm border-border/50 cursor-pointer">
                <CardHeader>
                  <CardTitle className="flex items-center gap-3 text-lg">
                    <div className={`p-2 rounded-md bg-background/50 border border-border/50 ${mod.color}`}>
                      <Icon className="w-5 h-5" />
                    </div>
                    {mod.title}
                  </CardTitle>
                  <CardDescription className="text-sm mt-1">
                    {mod.description}
                  </CardDescription>
                </CardHeader>
              </Card>
            </Link>
          );
        })}
      </div>

      <div className="p-6 rounded-lg border border-border/50 bg-card/30 backdrop-blur-sm">
        <h2 className="text-xl font-bold mb-4 tracking-wide">System Status</h2>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          {[
            { label: "Database", status: "Connected", color: "text-green-400", dot: "bg-green-400", pulse: true },
            { label: "LM Studio (Local)", status: "Online", color: "text-green-400", dot: "bg-green-400", pulse: true },
            { label: "OpenRouter API", status: "Active", color: "text-green-400", dot: "bg-green-400", pulse: true },
            { label: "Scribe Queue", status: "14 Pending", color: "text-orange-400", dot: "bg-orange-400", pulse: false },
          ].map((item) => (
            <div key={item.label} className="p-4 rounded-md bg-background/50 border border-border/50">
              <div className="text-xs text-muted-foreground mb-1">{item.label}</div>
              <div className={`flex items-center gap-2 font-mono text-sm ${item.color}`}>
                <div className={`w-2 h-2 rounded-full ${item.dot} ${item.pulse ? "animate-pulse" : ""}`}></div>
                {item.status}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
