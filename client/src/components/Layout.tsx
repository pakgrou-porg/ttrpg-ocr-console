import { useState } from "react";
import { Link, useLocation } from "wouter";
import {
  BookOpen,
  Settings,
  Activity,
  Edit3,
  Moon,
  Sun,
  Search,
  HelpCircle,
  BarChart2,
  Database,
  Terminal,
  ChevronDown,
  ChevronRight,
  User,
  Scroll,
} from "lucide-react";
import { useTheme } from "@/contexts/ThemeContext";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/_core/hooks/useAuth";
import { getLoginUrl } from "@/const";

interface NavItem {
  href: string;
  label: string;
  icon: React.ElementType;
}

interface NavGroup {
  label: string;
  icon: React.ElementType;
  children: NavItem[];
}

type NavEntry = NavItem | NavGroup;

function isNavGroup(entry: NavEntry): entry is NavGroup {
  return "children" in entry;
}

const topNavItems: NavItem[] = [
  { href: "/", label: "The Grand Hall", icon: BookOpen },
  { href: "/enter-arkanum", label: "Enter the Arkanum", icon: Edit3 },
  { href: "/listen-ramblings", label: "Listen to Ramblings", icon: Search },
  { href: "/tome-knowledge", label: "Tome of Knowledge", icon: HelpCircle },
  { href: "/divination-omens", label: "Divination & Omens", icon: BarChart2 },
];

const innerSanctumChildren: NavItem[] = [
  { href: "/oversee-scribes", label: "Oversee the Scribes", icon: Activity },
  { href: "/arcane-mechanisms", label: "Arcane Mechanisms", icon: Settings },
  { href: "/summoning-rituals", label: "Summoning Rituals", icon: Database },
  { href: "/incantations-runes", label: "Incantations & Runes", icon: Terminal },
];

export function Layout({ children }: { children: React.ReactNode }) {
  const [location] = useLocation();
  const { theme, toggleTheme } = useTheme();
  const { user, isAuthenticated } = useAuth();

  // Auto-expand Inner Sanctum if current route is one of its children
  const isInnerSanctumActive = innerSanctumChildren.some((c) => location === c.href);
  const [sanctumOpen, setSanctumOpen] = useState(isInnerSanctumActive);

  return (
    <div className="flex h-screen w-full overflow-hidden bg-background text-foreground">
      {/* Sidebar */}
      <aside className="w-64 flex-shrink-0 border-r border-border bg-sidebar flex flex-col">
        {/* Logo */}
        <div className="p-5 border-b border-border">
          <Link href="/">
            <a className="block">
              <h1 className="text-lg font-bold text-sidebar-foreground tracking-wider flex items-center gap-2">
                <BookOpen className="w-5 h-5 text-primary" />
                Evos' Infinite Kodex
              </h1>
              <p className="text-xs text-sidebar-foreground/50 mt-0.5 font-mono tracking-widest">
                ✦ Vault of Lore ✦
              </p>
            </a>
          </Link>
        </div>

        {/* Navigation */}
        <nav className="flex-1 overflow-y-auto py-3 px-2 space-y-0.5">
          {topNavItems.map((item) => {
            const isActive = location === item.href;
            const Icon = item.icon;
            return (
              <Link key={item.href} href={item.href}>
                <a
                  className={`flex items-center gap-3 px-3 py-2.5 rounded-md transition-colors duration-200 text-sm ${
                    isActive
                      ? "bg-sidebar-accent text-sidebar-accent-foreground shadow-[0_0_10px_rgba(139,92,246,0.2)]"
                      : "text-sidebar-foreground/75 hover:bg-sidebar-accent/40 hover:text-sidebar-foreground"
                  }`}
                >
                  <Icon className={`w-4 h-4 flex-shrink-0 ${isActive ? "text-primary" : ""}`} />
                  <span className="font-medium truncate">{item.label}</span>
                </a>
              </Link>
            );
          })}

          {/* Divider */}
          <div className="my-2 border-t border-border/40" />

          {/* The Inner Sanctum — collapsible group */}
          <div>
            <button
              onClick={() => setSanctumOpen((o) => !o)}
              className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-md transition-colors duration-200 text-sm ${
                isInnerSanctumActive
                  ? "bg-sidebar-accent/60 text-sidebar-accent-foreground"
                  : "text-sidebar-foreground/75 hover:bg-sidebar-accent/40 hover:text-sidebar-foreground"
              }`}
            >
              <Scroll className={`w-4 h-4 flex-shrink-0 ${isInnerSanctumActive ? "text-primary" : ""}`} />
              <span className="font-medium flex-1 text-left truncate">The Inner Sanctum</span>
              {sanctumOpen ? (
                <ChevronDown className="w-3.5 h-3.5 text-sidebar-foreground/50" />
              ) : (
                <ChevronRight className="w-3.5 h-3.5 text-sidebar-foreground/50" />
              )}
            </button>

            {sanctumOpen && (
              <div className="mt-0.5 ml-3 pl-3 border-l border-border/40 space-y-0.5">
                {innerSanctumChildren.map((item) => {
                  const isActive = location === item.href;
                  const Icon = item.icon;
                  return (
                    <Link key={item.href} href={item.href}>
                      <a
                        className={`flex items-center gap-3 px-3 py-2 rounded-md transition-colors duration-200 text-sm ${
                          isActive
                            ? "bg-sidebar-accent text-sidebar-accent-foreground shadow-[0_0_8px_rgba(139,92,246,0.2)]"
                            : "text-sidebar-foreground/65 hover:bg-sidebar-accent/40 hover:text-sidebar-foreground"
                        }`}
                      >
                        <Icon className={`w-4 h-4 flex-shrink-0 ${isActive ? "text-primary" : ""}`} />
                        <span className="font-medium truncate">{item.label}</span>
                      </a>
                    </Link>
                  );
                })}
              </div>
            )}
          </div>
        </nav>

        {/* Footer */}
        <div className="p-3 border-t border-border space-y-2">
          {/* User profile link */}
          {isAuthenticated ? (
            <Link href="/personal-sanctum">
              <a className="flex items-center gap-2 px-3 py-2 rounded-md text-sm text-sidebar-foreground/75 hover:bg-sidebar-accent/40 hover:text-sidebar-foreground transition-colors">
                <User className="w-4 h-4" />
                <span className="truncate">{user?.name ?? "My Sanctum"}</span>
              </a>
            </Link>
          ) : (
            <a
              href={getLoginUrl()}
              className="flex items-center gap-2 px-3 py-2 rounded-md text-sm text-sidebar-foreground/75 hover:bg-sidebar-accent/40 hover:text-sidebar-foreground transition-colors"
            >
              <User className="w-4 h-4" />
              <span>Enter the Gates</span>
            </a>
          )}

          {/* Theme toggle */}
          <Button
            variant="outline"
            size="sm"
            className="w-full justify-start gap-2 border-border/50 text-sidebar-foreground/70 hover:bg-sidebar-accent/40 hover:text-sidebar-foreground"
            onClick={toggleTheme}
          >
            {theme === "dark" ? <Sun className="w-4 h-4" /> : <Moon className="w-4 h-4" />}
            <span className="text-xs">{theme === "dark" ? "Light Parchment" : "Midnight Runes"}</span>
          </Button>
        </div>
      </aside>

      {/* Main Content */}
      <main className="flex-1 flex flex-col overflow-hidden relative">
        <div className="absolute top-0 left-0 right-0 h-px bg-gradient-to-r from-transparent via-primary/40 to-transparent" />
        <div className="flex-1 overflow-y-auto p-8">
          <div className="max-w-6xl mx-auto">{children}</div>
        </div>
      </main>
    </div>
  );
}
