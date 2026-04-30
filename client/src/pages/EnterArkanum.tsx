import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Edit3, Search, Save, FolderPlus, PlayCircle } from "lucide-react";
import { useState } from "react";

export default function EnterArkanum() {
  const [searchQuery, setSearchQuery] = useState("");

  return (
    <div className="space-y-8 animate-in fade-in duration-500">
      <div>
        <h1 className="text-4xl font-bold tracking-tight mb-2 flex items-center gap-3">
          <Edit3 className="w-10 h-10 text-primary" />
          Enter the Arkanum
        </h1>
        <p className="text-lg text-muted-foreground max-w-3xl">
          Access extracted records for active gameplay, save frequently used entities, and organize them into custom groups for quick reference. The Arkanum holds the knowledge you need right now.
        </p>
      </div>

      <div className="flex gap-4">
        <div className="relative flex-1 max-w-2xl">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-muted-foreground" />
          <Input 
            placeholder="Quick search for active play (e.g., 'Goblin stats', 'Fireball spell')..." 
            className="pl-10 h-12 text-lg bg-card/50 backdrop-blur-sm border-border/50"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
          />
        </div>
        <Button className="h-12 px-8 gap-2">
          <PlayCircle className="w-5 h-5" />
          Search
        </Button>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        {/* Saved Records */}
        <Card className="lg:col-span-2 bg-card/50 backdrop-blur-sm border-border/50">
          <CardHeader className="flex flex-row items-center justify-between">
            <div>
              <CardTitle className="text-2xl">Universal Memory</CardTitle>
              <CardDescription>Your pinned entities and spells for fast access.</CardDescription>
            </div>
            <Button variant="outline" className="gap-2">
              <Save className="w-4 h-4" />
              Save Current View
            </Button>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {/* Mock Saved Record 1 */}
              <div className="p-4 rounded-md bg-muted/20 border border-border/50 hover:border-primary/50 transition-colors cursor-pointer">
                <div className="flex justify-between items-start mb-2">
                  <h3 className="font-bold text-lg text-primary">Ancient Red Dragon</h3>
                  <span className="text-xs font-mono px-2 py-1 rounded bg-secondary text-secondary-foreground">CR 24</span>
                </div>
                <p className="text-sm text-muted-foreground mb-3">Gargantuan dragon, chaotic evil</p>
                <div className="flex gap-2">
                  <span className="text-xs px-2 py-1 rounded-full bg-background border border-border/50">AC: 22</span>
                  <span className="text-xs px-2 py-1 rounded-full bg-background border border-border/50">HP: 546</span>
                </div>
              </div>

              {/* Mock Saved Record 2 */}
              <div className="p-4 rounded-md bg-muted/20 border border-border/50 hover:border-primary/50 transition-colors cursor-pointer">
                <div className="flex justify-between items-start mb-2">
                  <h3 className="font-bold text-lg text-primary">Meteor Swarm</h3>
                  <span className="text-xs font-mono px-2 py-1 rounded bg-secondary text-secondary-foreground">9th-level</span>
                </div>
                <p className="text-sm text-muted-foreground mb-3">Evocation spell</p>
                <div className="flex gap-2">
                  <span className="text-xs px-2 py-1 rounded-full bg-background border border-border/50">Range: 1 mile</span>
                  <span className="text-xs px-2 py-1 rounded-full bg-background border border-border/50">Dmg: 20d6 fire + 20d6 bludgeoning</span>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Custom Groups */}
        <Card className="bg-card/50 backdrop-blur-sm border-border/50">
          <CardHeader className="flex flex-row items-center justify-between">
            <div>
              <CardTitle className="text-2xl">Grimoires</CardTitle>
              <CardDescription>Organize records by encounter or session.</CardDescription>
            </div>
            <Button variant="ghost" size="icon">
              <FolderPlus className="w-5 h-5" />
            </Button>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              <div className="flex items-center justify-between p-3 rounded-md bg-muted/20 border border-border/50 hover:bg-muted/30 cursor-pointer transition-colors">
                <div className="flex items-center gap-3">
                  <div className="w-8 h-8 rounded bg-primary/20 flex items-center justify-center text-primary font-bold">
                    E1
                  </div>
                  <div>
                    <p className="font-medium text-sm">Goblin Ambush</p>
                    <p className="text-xs text-muted-foreground">4 records</p>
                  </div>
                </div>
              </div>
              <div className="flex items-center justify-between p-3 rounded-md bg-muted/20 border border-border/50 hover:bg-muted/30 cursor-pointer transition-colors">
                <div className="flex items-center gap-3">
                  <div className="w-8 h-8 rounded bg-orange-500/20 flex items-center justify-center text-orange-500 font-bold">
                    B1
                  </div>
                  <div>
                    <p className="font-medium text-sm">Lair of the Dragon</p>
                    <p className="text-xs text-muted-foreground">12 records</p>
                  </div>
                </div>
              </div>
              <div className="flex items-center justify-between p-3 rounded-md bg-muted/20 border border-border/50 hover:bg-muted/30 cursor-pointer transition-colors">
                <div className="flex items-center gap-3">
                  <div className="w-8 h-8 rounded bg-purple-500/20 flex items-center justify-center text-purple-500 font-bold">
                    S1
                  </div>
                  <div>
                    <p className="font-medium text-sm">Session 5 Spells</p>
                    <p className="text-xs text-muted-foreground">8 records</p>
                  </div>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
