import { useState, useEffect } from "react";
import { Link, useLocation } from "wouter";
import {
  BookOpen, Settings, Activity, Edit3, Moon, Sun, Search,
  HelpCircle, BarChart2, Database, ChevronDown,
  ChevronRight, User, Scroll, Shield, LogOut, UserCircle,
  Cpu, ClipboardCheck, ClipboardList, ChevronLeft, ScrollText,
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
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { useAuth } from "@/_core/hooks/useAuth";
import { getLoginUrl } from "@/const";
import { trpc } from "@/lib/trpc";

interface NavItem {
  href: string;
  label: string;
  icon: React.ElementType;
  /** Minimum role required to see this item. "reviewer" allows reviewers + admins; "admin" allows admins only. */
  minRole?: "reviewer" | "admin";
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
  { href: "/inner-sanctum/archivists-desk", label: "Archivist's Desk", icon: ClipboardCheck },
  { href: "/inner-sanctum/oversee-scribes", label: "Oversee the Scribes", icon: Activity },
  { href: "/inner-sanctum/arcane-mechanisms", label: "Arcane Mechanisms", icon: Settings },
  { href: "/inner-sanctum/summoning-rituals", label: "Summoning Rituals", icon: Database },
  { href: "/inner-sanctum/trials-of-truth", label: "Trials of Truth", icon: ClipboardList, minRole: "reviewer" },
  { href: "/inner-sanctum/the-artificers", label: "The Artificers", icon: Cpu, minRole: "admin" },
  { href: "/inner-sanctum/vault-nexus", label: "The Vault Nexus", icon: Database, minRole: "admin" },
  { href: "/inner-sanctum/the-chronicles", label: "The Chronicles", icon: ScrollText, minRole: "admin" },
  { href: "/inner-sanctum/the-conclave", label: "The Conclave", icon: Shield, minRole: "admin" },
];

const SIDEBAR_STORAGE_KEY = "ttrpg-sidebar-collapsed";

function getInitials(name?: string | null): string {
  if (!name) return "?";
  return name
    .split(" ")
    .map((n) => n[0])
    .slice(0, 2)
    .join("")
    .toUpperCase();
}

const ROLE_BADGE: Record<string, { label: string; color: string }> = {
  admin: { label: "ADMIN", color: "text-amber-500/80 border-amber-500/30" },
  reviewer: { label: "REVIEW", color: "text-sky-500/80 border-sky-500/30" },
};

/** A nav link that shows tooltip in collapsed mode */
function NavLink({
  item,
  isActive,
  collapsed,
  isAdmin,
  isReviewer,
}: {
  item: NavItem;
  isActive: boolean;
  collapsed: boolean;
  isAdmin: boolean;
  isReviewer: boolean;
}) {
  const Icon = item.icon;
  const roleBadge = item.minRole ? ROLE_BADGE[item.minRole] : null;
  const link = (
    <Link key={item.href} href={item.href}>
      <a
        className={`flex items-center gap-3 rounded-md transition-colors duration-200 text-sm ${
          collapsed ? "justify-center px-0 py-2.5 w-full" : "px-3 py-2.5"
        } ${
          isActive
            ? "bg-sidebar-accent text-sidebar-accent-foreground shadow-[0_0_10px_rgba(139,92,246,0.2)]"
            : "text-sidebar-foreground/75 hover:bg-sidebar-accent/40 hover:text-sidebar-foreground"
        }`}
      >
        <Icon className={`w-4 h-4 flex-shrink-0 ${isActive ? "text-primary" : ""}`} />
        {!collapsed && (
          <>
            <span className="font-medium truncate">{item.label}</span>
            {roleBadge && (
              <span className={`ml-auto text-[10px] font-mono border rounded px-1 ${roleBadge.color}`}>
                {roleBadge.label}
              </span>
            )}
          </>
        )}
      </a>
    </Link>
  );

  if (collapsed) {
    return (
      <Tooltip>
        <TooltipTrigger asChild>{link}</TooltipTrigger>
        <TooltipContent side="right" className="flex items-center gap-2">
          {item.label}
          {roleBadge && (
            <span className={`text-[10px] font-mono ${roleBadge.color.split(" ")[0]}`}>{roleBadge.label}</span>
          )}
        </TooltipContent>
      </Tooltip>
    );
  }
  return link;
}

export function Layout({ children }: { children: React.ReactNode }) {
  const [location] = useLocation();
  const { theme, toggleTheme } = useTheme();
  const { user, isAuthenticated, logout } = useAuth();

  // Sidebar collapsed state — persisted in localStorage
  const [collapsed, setCollapsed] = useState<boolean>(() => {
    try {
      return localStorage.getItem(SIDEBAR_STORAGE_KEY) === "true";
    } catch {
      return false;
    }
  });

  useEffect(() => {
    try {
      localStorage.setItem(SIDEBAR_STORAGE_KEY, String(collapsed));
    } catch {
      // ignore
    }
  }, [collapsed]);

  const { data: profile } = trpc.profile.get.useQuery(undefined, {
    enabled: isAuthenticated,
  });

  const isInnerSanctumActive = innerSanctumChildren.some((c) => location.startsWith(c.href));
  const [sanctumOpen, setSanctumOpen] = useState(
    isInnerSanctumActive || location.startsWith("/inner-sanctum")
  );

  const displayName = profile?.displayName ?? user?.name ?? "Scholar";
  const avatarUrl = profile?.avatarUrl ?? undefined;
  const isAdmin = user?.role === "admin";
  const isReviewer = user?.role === "reviewer";

  // In collapsed mode, Inner Sanctum shows its children directly as icons
  const sanctumIcon = Scroll;

  return (
    <div className="flex h-screen w-full overflow-hidden bg-background text-foreground">
      {/* ── Sidebar ──────────────────────────────────────────────────────── */}
      <aside
        className={`relative flex-shrink-0 border-r border-border bg-sidebar flex flex-col transition-all duration-300 ease-in-out ${
          collapsed ? "w-14" : "w-72"
        }`}
      >
        {/* Logo / Collapse toggle */}
        <div
          className={`border-b border-border flex items-center ${
            collapsed ? "justify-center p-3" : "p-5 justify-between"
          }`}
        >
          {!collapsed && (
            <Link href="/">
              <a className="block min-w-0">
                <h1 className="text-lg font-bold text-sidebar-foreground tracking-wider flex items-center gap-2">
                  <BookOpen className="w-5 h-5 text-primary flex-shrink-0" />
                  <span className="whitespace-nowrap">Evos' Infinite Kodex</span>
                </h1>
                <p className="text-xs text-sidebar-foreground/50 mt-0.5 font-mono tracking-widest">
                  ✦ Vault of Lore ✦
                </p>
              </a>
            </Link>
          )}

          {collapsed && (
            <Tooltip>
              <TooltipTrigger asChild>
                <Link href="/">
                  <a>
                    <BookOpen className="w-5 h-5 text-primary" />
                  </a>
                </Link>
              </TooltipTrigger>
              <TooltipContent side="right">Evos' Infinite Kodex</TooltipContent>
            </Tooltip>
          )}


        </div>

        {/* Navigation */}
        <nav
          className={`flex-1 overflow-y-auto py-3 space-y-0.5 ${
            collapsed ? "px-1" : "px-2"
          }`}
        >
          {topNavItems.map((item) => {
            const isActive = location === item.href;
            return (
              <NavLink
                key={item.href}
                item={item}
                isActive={isActive}
                collapsed={collapsed}
                isAdmin={isAdmin}
                isReviewer={isReviewer}
              />
            );
          })}

          {/* Divider */}
          <div className="my-2 border-t border-border/40" />

          {/* The Inner Sanctum */}
          {collapsed ? (
            /* In collapsed mode: show all sanctum children as icon-only links */
            <>
              <Tooltip>
                <TooltipTrigger asChild>
                  <div
                    className={`flex justify-center px-0 py-2 rounded-md text-xs font-mono tracking-widest ${
                      isInnerSanctumActive
                        ? "text-primary"
                        : "text-sidebar-foreground/30"
                    }`}
                  >
                    <Scroll className="w-3 h-3" />
                  </div>
                </TooltipTrigger>
                <TooltipContent side="right">The Inner Sanctum</TooltipContent>
              </Tooltip>
              {innerSanctumChildren
                .filter((item) => !item.minRole || (item.minRole === "reviewer" ? isAdmin || isReviewer : isAdmin))
                .map((item) => {
                  const isActive =
                    location === item.href || location.startsWith(item.href);
                  return (
                    <NavLink
                      key={item.href}
                      item={item}
                      isActive={isActive}
                      collapsed={true}
                      isAdmin={isAdmin}
                      isReviewer={isReviewer}
                    />
                  );
                })}
            </>
          ) : (
            /* In expanded mode: collapsible group */
            <div>
              <button
                onClick={() => setSanctumOpen((o) => !o)}
                className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-md transition-colors duration-200 text-sm ${
                  isInnerSanctumActive
                    ? "bg-sidebar-accent/60 text-sidebar-accent-foreground"
                    : "text-sidebar-foreground/75 hover:bg-sidebar-accent/40 hover:text-sidebar-foreground"
                }`}
              >
                <Scroll
                  className={`w-4 h-4 flex-shrink-0 ${
                    isInnerSanctumActive ? "text-primary" : ""
                  }`}
                />
                <span className="font-medium flex-1 text-left truncate">
                  The Inner Sanctum
                </span>
                {sanctumOpen ? (
                  <ChevronDown className="w-3.5 h-3.5 text-sidebar-foreground/50" />
                ) : (
                  <ChevronRight className="w-3.5 h-3.5 text-sidebar-foreground/50" />
                )}
              </button>

              {sanctumOpen && (
                <div className="mt-0.5 ml-3 pl-3 border-l border-border/40 space-y-0.5">
                  {innerSanctumChildren
                    .filter((item) => !item.minRole || (item.minRole === "reviewer" ? isAdmin || isReviewer : isAdmin))
                    .map((item) => {
                      const isActive =
                        location === item.href || location.startsWith(item.href);
                      return (
                        <NavLink
                          key={item.href}
                          item={item}
                          isActive={isActive}
                          collapsed={false}
                          isAdmin={isAdmin}
                          isReviewer={isReviewer}
                        />
                      );
                    })}
                </div>
              )}
            </div>
          )}
        </nav>

        {/* Floating boundary arrow — sits on the right edge of the sidebar, always visible */}
        <Tooltip>
          <TooltipTrigger asChild>
            <button
              onClick={() => setCollapsed((c) => !c)}
              aria-label={collapsed ? "Expand navigation" : "Collapse navigation"}
              className="absolute top-1/2 -translate-y-1/2 -right-3 z-50
                flex items-center justify-center
                h-6 w-6 rounded-full
                bg-sidebar border border-border shadow-md
                hover:bg-sidebar-accent hover:border-primary/40
                transition-all duration-200
                focus:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              {collapsed
                ? <ChevronRight className="h-3.5 w-3.5 text-sidebar-foreground/70" />
                : <ChevronLeft className="h-3.5 w-3.5 text-sidebar-foreground/70" />}
            </button>
          </TooltipTrigger>
          <TooltipContent side="right">
            {collapsed ? "Expand navigation" : "Collapse navigation"}
          </TooltipContent>
        </Tooltip>

        {/* Footer — theme toggle */}
        <div className={`border-t border-border ${collapsed ? "p-2" : "p-3"}`}>
          {collapsed ? (
            <Tooltip>
              <TooltipTrigger asChild>
                <button
                  onClick={toggleTheme}
                  className="w-full flex justify-center items-center p-2 rounded-md text-sidebar-foreground/70 hover:bg-sidebar-accent/40 hover:text-sidebar-foreground transition-colors"
                  aria-label="Toggle theme"
                >
                  {theme === "dark" ? (
                    <Sun className="w-4 h-4" />
                  ) : (
                    <Moon className="w-4 h-4" />
                  )}
                </button>
              </TooltipTrigger>
              <TooltipContent side="right">
                {theme === "dark" ? "Light Parchment" : "Midnight Runes"}
              </TooltipContent>
            </Tooltip>
          ) : (
            <Button
              variant="outline"
              size="sm"
              className="w-full justify-start gap-2 border-border/50 text-sidebar-foreground/70 hover:bg-sidebar-accent/40 hover:text-sidebar-foreground"
              onClick={toggleTheme}
            >
              {theme === "dark" ? (
                <Sun className="w-4 h-4" />
              ) : (
                <Moon className="w-4 h-4" />
              )}
              <span className="text-xs">
                {theme === "dark" ? "Light Parchment" : "Midnight Runes"}
              </span>
            </Button>
          )}
        </div>
      </aside>

      {/* ── Main Content ─────────────────────────────────────────────────── */}
      <main className="flex-1 flex flex-col overflow-hidden relative min-w-0">
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
                      <p className="text-xs leading-none text-muted-foreground truncate">
                        {user.email}
                      </p>
                    )}
                    {isAdmin && (
                      <span className="text-[10px] font-mono text-amber-500 mt-0.5">
                        ⚔ Arch-Magister
                      </span>
                    )}
                    {isReviewer && (
                      <span className="text-[10px] font-mono text-sky-500 mt-0.5">
                        ✦ Scribe Reviewer
                      </span>
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
          <div className="w-full max-w-[1800px] mx-auto">{children}</div>
        </div>
      </main>
    </div>
  );
}
