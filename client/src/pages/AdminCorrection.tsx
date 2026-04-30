import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ShieldAlert, Search, Database, RefreshCw, Save } from "lucide-react";
import { useState } from "react";

export default function AdminCorrection() {
  const [searchQuery, setSearchQuery] = useState("");
  const [isEditing, setIsEditing] = useState(false);

  return (
    <div className="space-y-8 animate-in fade-in duration-500">
      <div>
        <h1 className="text-4xl font-bold tracking-tight mb-2 flex items-center gap-3">
          <ShieldAlert className="w-10 h-10 text-primary" />
          Admin Correction & Feedback
        </h1>
        <p className="text-lg text-muted-foreground max-w-3xl">
          Live database editor for in-play corrections. Edits made here automatically generate feedback loops to improve future OCR runs.
        </p>
      </div>

      <div className="flex gap-4">
        <div className="relative flex-1 max-w-2xl">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-muted-foreground" />
          <Input 
            placeholder="Search database by entity name, spell, or ID..." 
            className="pl-10 h-12 text-lg bg-card/50 backdrop-blur-sm border-border/50"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
          />
        </div>
        <Button className="h-12 px-8 gap-2">
          <Database className="w-5 h-5" />
          Query Database
        </Button>
      </div>

      {/* Mock Search Results */}
      <div className="space-y-6">
        <Card className="bg-card/50 backdrop-blur-sm border-border/50 overflow-hidden">
          <CardHeader className="border-b border-border/50 bg-muted/10 flex flex-row items-center justify-between py-4">
            <div>
              <CardTitle className="text-xl flex items-center gap-2">
                Entity: Goblin
                <span className="text-xs font-mono px-2 py-1 rounded bg-secondary text-secondary-foreground ml-2">ID: ent_8f92a1</span>
              </CardTitle>
              <CardDescription>Source: Monster_Manual_v3.pdf (Page 142)</CardDescription>
            </div>
            <div className="flex gap-2">
              {isEditing ? (
                <>
                  <Button variant="outline" onClick={() => setIsEditing(false)}>Cancel</Button>
                  <Button className="gap-2 bg-green-600 hover:bg-green-700 text-white" onClick={() => setIsEditing(false)}>
                    <Save className="w-4 h-4" />
                    Save & Generate Feedback
                  </Button>
                </>
              ) : (
                <Button variant="outline" className="gap-2" onClick={() => setIsEditing(true)}>
                  <RefreshCw className="w-4 h-4" />
                  Edit Record
                </Button>
              )}
            </div>
          </CardHeader>
          <CardContent className="p-0">
            <div className="grid grid-cols-1 md:grid-cols-2 divide-y md:divide-y-0 md:divide-x divide-border/50">
              <div className="p-6 space-y-4">
                <h3 className="text-sm font-medium text-muted-foreground uppercase tracking-wider">Core Attributes</h3>
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-1.5">
                    <label className="text-xs text-muted-foreground">Type</label>
                    {isEditing ? <Input defaultValue="Humanoid" className="h-8" /> : <div className="font-medium">Humanoid</div>}
                  </div>
                  <div className="space-y-1.5">
                    <label className="text-xs text-muted-foreground">Alignment</label>
                    {isEditing ? <Input defaultValue="Neutral Evil" className="h-8" /> : <div className="font-medium">Neutral Evil</div>}
                  </div>
                  <div className="space-y-1.5">
                    <label className="text-xs text-muted-foreground">Armor Class</label>
                    {isEditing ? <Input defaultValue="15" className="h-8" /> : <div className="font-medium">15</div>}
                  </div>
                  <div className="space-y-1.5">
                    <label className="text-xs text-muted-foreground">Hit Points</label>
                    {isEditing ? <Input defaultValue="2d6" className="h-8 border-orange-500 focus-visible:ring-orange-500" /> : <div className="font-medium">2d6</div>}
                  </div>
                </div>
              </div>
              
              <div className="p-6 space-y-4">
                <h3 className="text-sm font-medium text-muted-foreground uppercase tracking-wider">Ability Scores</h3>
                <div className="grid grid-cols-3 gap-4">
                  <div className="space-y-1.5 text-center p-2 rounded bg-muted/20 border border-border/50">
                    <label className="text-xs text-muted-foreground font-bold">STR</label>
                    {isEditing ? <Input defaultValue="8" className="h-8 text-center" /> : <div className="font-mono text-lg">8</div>}
                  </div>
                  <div className="space-y-1.5 text-center p-2 rounded bg-muted/20 border border-border/50">
                    <label className="text-xs text-muted-foreground font-bold">DEX</label>
                    {isEditing ? <Input defaultValue="14" className="h-8 text-center" /> : <div className="font-mono text-lg">14</div>}
                  </div>
                  <div className="space-y-1.5 text-center p-2 rounded bg-muted/20 border border-border/50">
                    <label className="text-xs text-muted-foreground font-bold">CON</label>
                    {isEditing ? <Input defaultValue="10" className="h-8 text-center" /> : <div className="font-mono text-lg">10</div>}
                  </div>
                  <div className="space-y-1.5 text-center p-2 rounded bg-muted/20 border border-border/50">
                    <label className="text-xs text-muted-foreground font-bold">INT</label>
                    {isEditing ? <Input defaultValue="10" className="h-8 text-center" /> : <div className="font-mono text-lg">10</div>}
                  </div>
                  <div className="space-y-1.5 text-center p-2 rounded bg-muted/20 border border-border/50">
                    <label className="text-xs text-muted-foreground font-bold">WIS</label>
                    {isEditing ? <Input defaultValue="8" className="h-8 text-center" /> : <div className="font-mono text-lg">8</div>}
                  </div>
                  <div className="space-y-1.5 text-center p-2 rounded bg-muted/20 border border-border/50">
                    <label className="text-xs text-muted-foreground font-bold">CHA</label>
                    {isEditing ? <Input defaultValue="8" className="h-8 text-center" /> : <div className="font-mono text-lg">8</div>}
                  </div>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Feedback Loop Log */}
        <Card className="bg-card/50 backdrop-blur-sm border-border/50">
          <CardHeader>
            <CardTitle className="text-xl">Recent Feedback Loops Generated</CardTitle>
            <CardDescription>Auto-generated prompt improvements based on admin corrections.</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              <div className="p-4 rounded-md bg-muted/20 border border-border/50">
                <div className="flex justify-between items-start mb-2">
                  <span className="font-medium text-sm">Correction: "Fireball" damage from 8d6 to 8d6 fire</span>
                  <span className="text-xs text-muted-foreground">2 hours ago</span>
                </div>
                <p className="text-sm text-muted-foreground font-mono bg-background/50 p-2 rounded border border-border/30">
                  Prompt Update Suggestion: "When extracting spell damage, always include the damage type (e.g., 'fire', 'necrotic') if present in the source text, rather than just the dice roll."
                </p>
              </div>
              <div className="p-4 rounded-md bg-muted/20 border border-border/50">
                <div className="flex justify-between items-start mb-2">
                  <span className="font-medium text-sm">Correction: "Darkvision" range from 60 to 60 ft.</span>
                  <span className="text-xs text-muted-foreground">Yesterday</span>
                </div>
                <p className="text-sm text-muted-foreground font-mono bg-background/50 p-2 rounded border border-border/30">
                  Prompt Update Suggestion: "Ensure all distance measurements include their units (e.g., 'ft.', 'miles') as specified in the source document."
                </p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
