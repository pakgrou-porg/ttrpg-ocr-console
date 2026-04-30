import { Link, useLocation } from "wouter";
import { BookOpen, Settings, Activity, Edit3, ShieldAlert, Moon, Sun, Search, HelpCircle, BarChart2, Database, Terminal } from "lucide-react";
import { useTheme } from "@/hooks/use-theme";
import { Button } from "@/components/ui/button";

export function Layout({ children }: { children: React.ReactNode }) {
  const [location] = useLocation();
  const { theme, setTheme } = useTheme();

  const navItems = [
    { href: "/", label: "The Grand Hall", icon: BookOpen },
    { href: "/enter-arcanum", label: "Enter the Arkanum", icon: Edit3 },
    { href: "/listen-ramblings", label: "Listen to Ramblings", icon: Search },
    { href: "/tome-knowledge", label: "Tome of Knowledge", icon: HelpCircle },
    { href: "/oversee-scribes", label: "Oversee the Scribes", icon: Activity },
    { href: "/divination-omens", label: "Divination & Omens", icon: BarChart2 },
    { href: "/arcane-mechanisms", label: "Arcane Mechanisms", icon: Settings },
    { href: "/summoning-rituals", label: "Summoning Rituals", icon: Database },
    { href: "/incantations-runes", label: "Incantations & Runes", icon: Terminal },
  ];

  return (
    <div className="flex h-screen w-full overflow-hidden bg-background text-foreground">
      {/* Sidebar */}
      <aside className="w-64 flex-shrink-0 border-r border-border bg-sidebar flex flex-col">
        <div className="p-6 border-b border-border">
          <h1 className="text-xl font-bold text-sidebar-foreground tracking-wider flex items-center gap-2">
            <BookOpen className="w-6 h-6 text-primary" />
            Evos' Infinite Kodex
          </h1>
          <p className="text-xs text-sidebar-foreground/60 mt-1 font-mono">Vault of Lore</p>
        </div>

        <nav className="flex-1 overflow-y-auto py-4 px-3 space-y-1">
          {navItems.map((item) => {
            const isActive = location === item.href;
            const Icon = item.icon;
            return (
              <Link key={item.href} href={item.href}>
                <a
                  className={`flex items-center gap-3 px-3 py-2.5 rounded-md transition-colors duration-200 ${
                    isActive
                      ? "bg-sidebar-accent text-sidebar-accent-foreground shadow-[0_0_10px_rgba(var(--primary),0.2)]"
                      : "text-sidebar-foreground/80 hover:bg-sidebar-accent/50 hover:text-sidebar-foreground"
                  }`}
                >
                  <Icon className={`w-5 h-5 ${isActive ? "text-primary" : ""}`} />
                  <span className="font-medium">{item.label}</span>
                </a>
              </Link>
            );
          })}
        </nav>

        <div className="p-4 border-t border-border">
          <Button
            variant="outline"
            className="w-full justify-start gap-2 border-border text-sidebar-foreground hover:bg-sidebar-accent"
            onClick={() => setTheme(theme === "dark" ? "light" : "dark")}
          >
            {theme === "dark" ? <Sun className="w-4 h-4" /> : <Moon className="w-4 h-4" />}
            {theme === "dark" ? "Light Parchment" : "Midnight Runes"}
          </Button>
        </div>
      </aside>

      {/* Main Content */}
      <main className="flex-1 flex flex-col overflow-hidden relative">
        {/* Decorative top border */}
        <div className="absolute top-0 left-0 right-0 h-1 bg-gradient-to-r from-transparent via-primary/50 to-transparent"></div>
        
        <div className="flex-1 overflow-y-auto p-8">
          <div className="max-w-6xl mx-auto">
            {children}
          </div>
        </div>
      </main>
    </div>
  );
}
