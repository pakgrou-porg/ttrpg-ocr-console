import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { BookOpen, Settings, Activity, Edit3, ShieldAlert, Search } from "lucide-react";
import { Link } from "wouter";

export default function Home() {
  const modules = [
    {
      title: "Enter the Arcanum",
      description: "Access extracted records for active gameplay, save entities, and organize groups.",
      icon: Edit3,
      href: "/enter-arcanum",
      color: "text-blue-500",
    },
    {
      title: "Listen to Ramblings",
      description: "Explore the entire structured dataset with natural language queries and filters.",
      icon: Search,
      href: "/listen-ramblings",
      color: "text-green-500",
    },
    {
      title: "Oversee the Scribes",
      description: "Track ingestion queues, background processes, and the HITL review queue.",
      icon: Activity,
      href: "/oversee-scribes",
      color: "text-orange-500",
    },
    {
      title: "Arcane Mechanisms",
      description: "Manage systems, tools, content imports, and system prompts.",
      icon: Settings,
      href: "/arcane-mechanisms",
      color: "text-purple-500",
    },
  ];

  return (
    <div className="space-y-8 animate-in fade-in duration-500">
      <div>
        <h1 className="text-4xl font-bold tracking-tight mb-2 flex items-center gap-3">
          <BookOpen className="w-10 h-10 text-primary" />
          The Grand Arcanum
        </h1>
        <p className="text-lg text-muted-foreground max-w-3xl">
          Welcome to the Vault of Infinite Lore. Manage the scribes, monitor the arcane consensus, and resolve flagged incantations to build the ultimate grimoire.
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {modules.map((mod) => {
          const Icon = mod.icon;
          return (
            <Link key={mod.href} href={mod.href}>
              <a className="block h-full">
                <Card className="h-full hover:border-primary/50 hover:shadow-[0_0_15px_rgba(var(--primary),0.15)] transition-all duration-300 bg-card/50 backdrop-blur-sm border-border/50">
                  <CardHeader>
                    <CardTitle className="flex items-center gap-3 text-xl">
                      <div className={`p-2 rounded-md bg-background/50 border border-border/50 ${mod.color}`}>
                        <Icon className="w-6 h-6" />
                      </div>
                      {mod.title}
                    </CardTitle>
                    <CardDescription className="text-base mt-2">
                      {mod.description}
                    </CardDescription>
                  </CardHeader>
                </Card>
              </a>
            </Link>
          );
        })}
      </div>

      <div className="mt-12 p-6 rounded-lg border border-border/50 bg-card/30 backdrop-blur-sm">
        <h2 className="text-2xl font-bold mb-4">System Status</h2>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <div className="p-4 rounded-md bg-background/50 border border-border/50">
            <div className="text-sm text-muted-foreground mb-1">Supabase</div>
            <div className="flex items-center gap-2 font-mono text-green-500">
              <div className="w-2 h-2 rounded-full bg-green-500 animate-pulse"></div>
              Connected
            </div>
          </div>
          <div className="p-4 rounded-md bg-background/50 border border-border/50">
            <div className="text-sm text-muted-foreground mb-1">LM Studio (Local)</div>
            <div className="flex items-center gap-2 font-mono text-green-500">
              <div className="w-2 h-2 rounded-full bg-green-500 animate-pulse"></div>
              Online
            </div>
          </div>
          <div className="p-4 rounded-md bg-background/50 border border-border/50">
            <div className="text-sm text-muted-foreground mb-1">OpenRouter API</div>
            <div className="flex items-center gap-2 font-mono text-green-500">
              <div className="w-2 h-2 rounded-full bg-green-500 animate-pulse"></div>
              Active
            </div>
          </div>
          <div className="p-4 rounded-md bg-background/50 border border-border/50">
            <div className="text-sm text-muted-foreground mb-1">HITL Queue</div>
            <div className="flex items-center gap-2 font-mono text-orange-500">
              <div className="w-2 h-2 rounded-full bg-orange-500"></div>
              14 Pending
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
