import { useState } from "react";
import { Link, useLocation } from "wouter";
import {
  BookOpen, Settings, Activity, Edit3, Moon, Sun, Search,
  HelpCircle, BarChart2, Database, Terminal, ChevronDown,
  ChevronRight, User, Scroll, Shield, LogOut, UserCircle,
  Cpu, GitBranch,
} from "lucide-react";
import { useTheme } from "@/contexts/ThemeContext";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { useAuth } from "@/_core/hooks/useAuth";
import { getLoginUrl } from "@/const";
import { trpc } from "@/lib/trpc";

interface NavItem {
  href: string;
  label: string;
  icon: React.ElementType;
  adminOnly?: boolean;
}

interface NavGroup {
  label: string;
  icon: React.ElementType;
  basePath: string;
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
  { href: "/inner-sanctum/oversee-scribes", label: "Oversee the Scribes", icon: Activity },
  { href: "/inner-sanctum/arcane-mechanisms", label: "Arcane Mechanisms", icon: Settings },
  { href: "/inner-sanctum/summoning-rituals", label: "Summoning Rituals", icon: Database },
  { href: "/inner-sanctum/incantations-runes", label: "Incantations & Runes", icon: Terminal },
  { href: "/inner-sanctum/the-artificers", label: "The Artificers", icon: Cpu, adminOnly: true },
  { href: "/inner-sanctum/the-assignments", label: "The Assignments", icon: GitBranch, adminOnly: true },
  { href: "/inner-sanctum/vault-nexus", label: "The Vault Nexus", icon: Database, adminOnly: true },
  { href: "/inner-sanctum/the-conclave", label: "The Conclave", icon: Shield, adminOnly: true },
];

function getInitials(name?: string | null): string {
  if (!name) return "?";
  return name
    .split(" ")
    .map((n) => n[0])
    .slice(0, 2)
    .join("")
    .toUpperCase();
}

export function Layout({ children }: { children: React.ReactNode }) {
  const [location] = useLocation();
  const { theme, toggleTheme } = useTheme();
  const { user, isAuthenticated, logout } = useAuth();

  const { data: profile } = trpc.profile.get.useQuery(undefined, {
    enabled: isAuthenticated,
  });

  const isInnerSanctumActive = innerSanctumChildren.some((c) => location.startsWith(c.href));
  const [sanctumOpen, setSanctumOpen] = useState(isInnerSanctumActive || location.startsWith("/inner-sanctum"));

  const displayName = profile?.displayName ?? user?.name ?? "Scholar";
  const avatarUrl = profile?.avatarUrl ?? undefined;
  const isAdmin = user?.role === "admin";

  return (
    <div className="flex h-screen w-full overflow-hidden bg-background text-foreground">
      {/* ── Sidebar ──────────────────────────────────────────────────────── */}
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
                {innerSanctumChildren
                  .filter((item) => !item.adminOnly || isAdmin)
                  .map((item) => {
                    const isActive = location === item.href || location.startsWith(item.href);
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
                          {item.adminOnly && (
                            <span className="ml-auto text-[10px] font-mono text-amber-500/80 border border-amber-500/30 rounded px-1">
                              ADMIN
                            </span>
                          )}
                        </a>
                      </Link>
                    );
                  })}
              </div>
            )}
          </div>
        </nav>

        {/* Footer — theme toggle only */}
        <div className="p-3 border-t border-border">
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

      {/* ── Main Content ─────────────────────────────────────────────────── */}
      <main className="flex-1 flex flex-col overflow-hidden relative">
        {/* Top bar with avatar */}
        <header className="flex items-center justify-end px-6 py-3 border-b border-border/50 bg-background/80 backdrop-blur-sm flex-shrink-0">
          {isAuthenticated ? (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <button className="flex items-center gap-2.5 rounded-full pl-3 pr-1 py-1 border border-border/50 hover:border-primary/50 hover:bg-card/60 transition-all duration-200 group">
                  <span className="text-sm font-medium text-foreground/80 group-hover:text-foreground transition-colors max-w-[120px] truncate">
                    {displayName}
                  </span>
                  <Avatar className="w-8 h-8">
                    <AvatarImage src={avatarUrl} alt={displayName} />
                    <AvatarFallback className="bg-primary/20 text-primary text-xs font-bold">
                      {getInitials(displayName)}
                    </AvatarFallback>
                  </Avatar>
                </button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-52">
                <DropdownMenuLabel className="font-normal">
                  <div className="flex flex-col space-y-1">
                    <p className="text-sm font-semibold leading-none">{displayName}</p>
                    {user?.email && (
                      <p className="text-xs leading-none text-muted-foreground truncate">{user.email}</p>
                    )}
                    {isAdmin && (
                      <span className="text-[10px] font-mono text-amber-500 mt-0.5">⚔ Arch-Magister</span>
                    )}
                  </div>
                </DropdownMenuLabel>
                <DropdownMenuSeparator />
                <DropdownMenuItem asChild>
                  <Link href="/personal-sanctum">
                    <a className="flex items-center gap-2 w-full cursor-pointer">
                      <UserCircle className="w-4 h-4" />
                      My Sanctum
                    </a>
                  </Link>
                </DropdownMenuItem>
                {isAdmin && (
                  <DropdownMenuItem asChild>
                    <Link href="/inner-sanctum/the-conclave">
                      <a className="flex items-center gap-2 w-full cursor-pointer">
                        <Shield className="w-4 h-4 text-amber-500" />
                        The Conclave
                      </a>
                    </Link>
                  </DropdownMenuItem>
                )}
                <DropdownMenuSeparator />
                <DropdownMenuItem
                  className="text-destructive focus:text-destructive cursor-pointer"
                  onClick={() => logout()}
                >
                  <LogOut className="w-4 h-4 mr-2" />
                  Depart the Kodex
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          ) : (
            <a
              href={getLoginUrl()}
              className="flex items-center gap-2 px-4 py-1.5 rounded-full border border-primary/40 text-sm text-primary hover:bg-primary/10 transition-colors"
            >
              <User className="w-4 h-4" />
              Enter the Gates
            </a>
          )}
        </header>

        {/* Page content */}
        <div className="absolute top-0 left-0 right-0 h-px bg-gradient-to-r from-transparent via-primary/40 to-transparent" />
        <div className="flex-1 overflow-y-auto p-8">
          <div className="max-w-6xl mx-auto">{children}</div>
        </div>
      </main>
    </div>
  );
}
