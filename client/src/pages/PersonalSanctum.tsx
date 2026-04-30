import { useState } from "react";
import { useAuth } from "@/_core/hooks/useAuth";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { toast } from "sonner";
import { User, BookOpen, Star, Users, Shield, LogOut, Wand2 } from "lucide-react";
import { getLoginUrl } from "@/const";

const POPULAR_GAMES = [
  "Dungeons & Dragons",
  "Pathfinder",
  "Call of Cthulhu",
  "Shadowrun",
  "Warhammer Fantasy",
  "Starfinder",
  "Vampire: The Masquerade",
  "Cyberpunk RED",
];

const VERSIONS: Record<string, string[]> = {
  "Dungeons & Dragons": ["5e", "3.5e", "4e", "2e", "1e", "One D&D"],
  "Pathfinder": ["2e", "1e"],
  "Call of Cthulhu": ["7th Edition", "6th Edition"],
  "Shadowrun": ["6e", "5e", "4e"],
  "Warhammer Fantasy": ["4e", "3e", "2e"],
  "Starfinder": ["2e", "1e"],
  "Vampire: The Masquerade": ["V5", "V20", "V3"],
  "Cyberpunk RED": ["RED", "2020"],
};

export default function PersonalSanctum() {
  const { user, isAuthenticated, logout } = useAuth();
  const { data: profile, refetch } = trpc.profile.get.useQuery(undefined, { enabled: isAuthenticated });
  const upsertProfile = trpc.profile.upsert.useMutation({
    onSuccess: () => { toast.success("Sanctum updated."); refetch(); },
    onError: (e) => toast.error("Failed to save: " + e.message),
  });

  const [displayName, setDisplayName] = useState(profile?.displayName ?? "");
  const [preferredGame, setPreferredGame] = useState(profile?.preferredGame ?? "");
  const [preferredVersion, setPreferredVersion] = useState(profile?.preferredVersion ?? "");

  // Sync state when profile loads
  const profileLoaded = !!profile;
  if (profileLoaded && displayName === "" && profile.displayName) setDisplayName(profile.displayName);
  if (profileLoaded && preferredGame === "" && profile.preferredGame) setPreferredGame(profile.preferredGame);
  if (profileLoaded && preferredVersion === "" && profile.preferredVersion) setPreferredVersion(profile.preferredVersion);

  const handleSave = () => {
    upsertProfile.mutate({ displayName, preferredGame, preferredVersion });
  };

  const availableVersions = VERSIONS[preferredGame] ?? [];
  const savedEntries = (profile?.savedEntries as string[]) ?? [];
  const savedGroups = (profile?.savedGroups as { id: string; name: string; entries: string[] }[]) ?? [];

  if (!isAuthenticated) {
    return (
      <div className="flex flex-col items-center justify-center h-full text-center space-y-6 py-24">
        <div className="p-4 rounded-full bg-primary/10 border border-primary/30">
          <User className="w-12 h-12 text-primary" />
        </div>
        <div>
          <h1 className="text-3xl font-bold mb-2">The Outer Gates</h1>
          <p className="text-muted-foreground max-w-md">
            You must pass through the Outer Gates to access your Personal Sanctum. Identify yourself to the Kodex.
          </p>
        </div>
        <a href={getLoginUrl()}>
          <Button size="lg" className="gap-2">
            <Wand2 className="w-4 h-4" />
            Enter the Gates
          </Button>
        </a>
      </div>
    );
  }

  return (
    <div className="space-y-8 animate-in fade-in duration-500">
      {/* Header */}
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight mb-1 flex items-center gap-3">
            <User className="w-8 h-8 text-primary" />
            Personal Sanctum
          </h1>
          <p className="text-muted-foreground">
            Your private chamber within the Kodex. Manage your identity, preferences, and saved lore.
          </p>
        </div>
        <Button variant="outline" size="sm" className="gap-2 text-destructive border-destructive/40 hover:bg-destructive/10" onClick={logout}>
          <LogOut className="w-4 h-4" />
          Depart
        </Button>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Identity Card */}
        <div className="lg:col-span-1 space-y-4">
          <Card className="bg-card/50 border-border/50">
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-lg">
                <Shield className="w-5 h-5 text-primary" />
                Identity Seal
              </CardTitle>
              <CardDescription>Your authenticated identity within the Kodex.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="flex items-center gap-3 p-3 rounded-md bg-background/50 border border-border/50">
                <div className="w-10 h-10 rounded-full bg-primary/20 border border-primary/40 flex items-center justify-center text-primary font-bold text-lg">
                  {(user?.name ?? "?")[0].toUpperCase()}
                </div>
                <div>
                  <div className="font-medium text-sm">{user?.name ?? "Unknown Archivist"}</div>
                  <div className="text-xs text-muted-foreground">{user?.email ?? "No email bound"}</div>
                </div>
              </div>
              <div className="flex items-center justify-between text-sm">
                <span className="text-muted-foreground">Role</span>
                <Badge variant={user?.role === "admin" ? "default" : "secondary"} className="text-xs">
                  {user?.role === "admin" ? "Grand Archivist" : "Archivist"}
                </Badge>
              </div>
            </CardContent>
          </Card>

          {/* Saved Lore Stats */}
          <Card className="bg-card/50 border-border/50">
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-lg">
                <Star className="w-5 h-5 text-yellow-400" />
                Lore Vault
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="flex items-center justify-between text-sm">
                <span className="text-muted-foreground">Saved Records</span>
                <span className="font-mono font-bold text-primary">{savedEntries.length}</span>
              </div>
              <div className="flex items-center justify-between text-sm">
                <span className="text-muted-foreground">Grimoires</span>
                <span className="font-mono font-bold text-primary">{savedGroups.length}</span>
              </div>
              <Separator className="bg-border/40" />
              {savedGroups.length > 0 ? (
                <div className="space-y-1">
                  {savedGroups.map((g) => (
                    <div key={g.id} className="flex items-center justify-between text-xs">
                      <span className="flex items-center gap-1.5">
                        <Users className="w-3 h-3 text-muted-foreground" />
                        {g.name}
                      </span>
                      <span className="text-muted-foreground">{g.entries.length} entries</span>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-xs text-muted-foreground italic">No grimoires yet. Visit the Arkanum to create one.</p>
              )}
            </CardContent>
          </Card>
        </div>

        {/* Preferences */}
        <div className="lg:col-span-2 space-y-4">
          <Card className="bg-card/50 border-border/50">
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-lg">
                <BookOpen className="w-5 h-5 text-primary" />
                Archivist Preferences
              </CardTitle>
              <CardDescription>
                Your preferred game system and display name will be used to personalize your Kodex experience.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-5">
              <div className="space-y-2">
                <Label htmlFor="displayName">Display Name</Label>
                <Input
                  id="displayName"
                  value={displayName}
                  onChange={(e) => setDisplayName(e.target.value)}
                  placeholder="e.g., Evos the Archivist"
                  className="bg-background/50 border-border/60"
                />
                <p className="text-xs text-muted-foreground">How you will be addressed within the Kodex.</p>
              </div>

              <div className="space-y-2">
                <Label>Preferred Game System</Label>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                  {POPULAR_GAMES.map((game) => (
                    <button
                      key={game}
                      onClick={() => { setPreferredGame(game); setPreferredVersion(""); }}
                      className={`px-3 py-2 rounded-md text-xs font-medium border transition-all duration-200 ${
                        preferredGame === game
                          ? "bg-primary/20 border-primary text-primary"
                          : "bg-background/50 border-border/50 text-muted-foreground hover:border-primary/50 hover:text-foreground"
                      }`}
                    >
                      {game}
                    </button>
                  ))}
                </div>
                {preferredGame === "" && (
                  <Input
                    value={preferredGame}
                    onChange={(e) => setPreferredGame(e.target.value)}
                    placeholder="Or type a custom game system..."
                    className="bg-background/50 border-border/60 mt-2"
                  />
                )}
              </div>

              {(availableVersions.length > 0 || preferredGame) && (
                <div className="space-y-2">
                  <Label>Preferred Edition / Version</Label>
                  {availableVersions.length > 0 ? (
                    <div className="flex flex-wrap gap-2">
                      {availableVersions.map((v) => (
                        <button
                          key={v}
                          onClick={() => setPreferredVersion(v)}
                          className={`px-3 py-1.5 rounded-md text-xs font-medium border transition-all duration-200 ${
                            preferredVersion === v
                              ? "bg-primary/20 border-primary text-primary"
                              : "bg-background/50 border-border/50 text-muted-foreground hover:border-primary/50 hover:text-foreground"
                          }`}
                        >
                          {v}
                        </button>
                      ))}
                    </div>
                  ) : (
                    <Input
                      value={preferredVersion}
                      onChange={(e) => setPreferredVersion(e.target.value)}
                      placeholder="e.g., 5e, 2nd Edition..."
                      className="bg-background/50 border-border/60"
                    />
                  )}
                </div>
              )}

              <div className="pt-2">
                <Button
                  onClick={handleSave}
                  disabled={upsertProfile.isPending}
                  className="gap-2"
                >
                  <Wand2 className="w-4 h-4" />
                  {upsertProfile.isPending ? "Inscribing..." : "Inscribe Changes"}
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
