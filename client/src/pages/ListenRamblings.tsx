import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Search, Filter, Database, ChevronRight, Sparkles } from "lucide-react";
import { useState } from "react";

export default function ListenRamblings() {
  const [searchQuery, setSearchQuery] = useState("");

  return (
    <div className="space-y-8 animate-in fade-in duration-500">
      <div>
        <h1 className="text-4xl font-bold tracking-tight mb-2 flex items-center gap-3">
          <Search className="w-10 h-10 text-primary" />
          Listen to Ramblings
        </h1>
        <p className="text-lg text-muted-foreground max-w-3xl">
          Explore the entire structured dataset. Use natural language queries, advanced filters, or simply listen to the random ramblings of the Arkanum to discover forgotten lore.
        </p>
      </div>

      <div className="flex gap-4">
        <div className="relative flex-1 max-w-3xl">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-muted-foreground" />
          <Input 
            placeholder="Ask the database (e.g., 'List all undead with CR > 10', 'Show me oriental dragons')..." 
            className="pl-10 h-12 text-lg bg-card/50 backdrop-blur-sm border-border/50"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
          />
        </div>
        <Button className="h-12 px-8 gap-2">
          <Database className="w-5 h-5" />
          Query Database
        </Button>
        <Button variant="secondary" className="h-12 px-4 gap-2 bg-purple-500/20 text-purple-500 hover:bg-purple-500/30 border border-purple-500/30">
          <Sparkles className="w-5 h-5" />
          Random Rambling
        </Button>
        <Button variant="outline" className="h-12 px-4 gap-2">
          <Filter className="w-5 h-5" />
          Filters
        </Button>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-4 gap-8">
        {/* Filters Sidebar */}
        <Card className="bg-card/50 backdrop-blur-sm border-border/50 h-fit">
          <CardHeader>
            <CardTitle className="text-xl">Filters</CardTitle>
          </CardHeader>
          <CardContent className="space-y-6">
            <div className="space-y-2">
              <h3 className="text-sm font-medium text-muted-foreground uppercase tracking-wider">Category</h3>
              <div className="space-y-1">
                <label className="flex items-center gap-2 text-sm">
                  <input type="checkbox" className="rounded border-border/50 bg-background/50 text-primary focus:ring-primary" defaultChecked />
                  Monsters & NPCs
                </label>
                <label className="flex items-center gap-2 text-sm">
                  <input type="checkbox" className="rounded border-border/50 bg-background/50 text-primary focus:ring-primary" defaultChecked />
                  Spells & Magic
                </label>
                <label className="flex items-center gap-2 text-sm">
                  <input type="checkbox" className="rounded border-border/50 bg-background/50 text-primary focus:ring-primary" />
                  Items & Equipment
                </label>
                <label className="flex items-center gap-2 text-sm">
                  <input type="checkbox" className="rounded border-border/50 bg-background/50 text-primary focus:ring-primary" />
                  Rules & Mechanics
                </label>
              </div>
            </div>

            <div className="space-y-2">
              <h3 className="text-sm font-medium text-muted-foreground uppercase tracking-wider">Source Material</h3>
              <div className="space-y-1">
                <label className="flex items-center gap-2 text-sm">
                  <input type="checkbox" className="rounded border-border/50 bg-background/50 text-primary focus:ring-primary" />
                  Monster Manual v3
                </label>
                <label className="flex items-center gap-2 text-sm">
                  <input type="checkbox" className="rounded border-border/50 bg-background/50 text-primary focus:ring-primary" />
                  Arcane Compendium
                </label>
                <label className="flex items-center gap-2 text-sm">
                  <input type="checkbox" className="rounded border-border/50 bg-background/50 text-primary focus:ring-primary" />
                  DM Guide Revised
                </label>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Search Results */}
        <Card className="lg:col-span-3 bg-card/50 backdrop-blur-sm border-border/50">
          <CardHeader>
            <CardTitle className="text-2xl">Results</CardTitle>
            <CardDescription>Showing 3 results for "oriental dragons"</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              {/* Result 1 */}
              <div className="p-4 rounded-md bg-muted/20 border border-border/50 hover:border-primary/50 transition-colors cursor-pointer flex justify-between items-center group">
                <div>
                  <div className="flex items-center gap-3 mb-1">
                    <h3 className="font-bold text-lg text-primary">Lung Wang (Sea Dragon)</h3>
                    <span className="text-xs font-mono px-2 py-0.5 rounded bg-secondary text-secondary-foreground">CR 15</span>
                  </div>
                  <p className="text-sm text-muted-foreground">Huge dragon (water), lawful neutral</p>
                  <div className="flex gap-2 mt-2">
                    <span className="text-xs px-2 py-1 rounded-full bg-background border border-border/50">Source: Oriental Adventures p.142</span>
                  </div>
                </div>
                <ChevronRight className="w-5 h-5 text-muted-foreground group-hover:text-primary transition-colors" />
              </div>

              {/* Result 2 */}
              <div className="p-4 rounded-md bg-muted/20 border border-border/50 hover:border-primary/50 transition-colors cursor-pointer flex justify-between items-center group">
                <div>
                  <div className="flex items-center gap-3 mb-1">
                    <h3 className="font-bold text-lg text-primary">Pan Lung (Coiled Dragon)</h3>
                    <span className="text-xs font-mono px-2 py-0.5 rounded bg-secondary text-secondary-foreground">CR 13</span>
                  </div>
                  <p className="text-sm text-muted-foreground">Large dragon (earth), lawful neutral</p>
                  <div className="flex gap-2 mt-2">
                    <span className="text-xs px-2 py-1 rounded-full bg-background border border-border/50">Source: Oriental Adventures p.144</span>
                  </div>
                </div>
                <ChevronRight className="w-5 h-5 text-muted-foreground group-hover:text-primary transition-colors" />
              </div>

              {/* Result 3 */}
              <div className="p-4 rounded-md bg-muted/20 border border-border/50 hover:border-primary/50 transition-colors cursor-pointer flex justify-between items-center group">
                <div>
                  <div className="flex items-center gap-3 mb-1">
                    <h3 className="font-bold text-lg text-primary">Shen Lung (Spirit Dragon)</h3>
                    <span className="text-xs font-mono px-2 py-0.5 rounded bg-secondary text-secondary-foreground">CR 14</span>
                  </div>
                  <p className="text-sm text-muted-foreground">Huge dragon (air), lawful neutral</p>
                  <div className="flex gap-2 mt-2">
                    <span className="text-xs px-2 py-1 rounded-full bg-background border border-border/50">Source: Oriental Adventures p.145</span>
                  </div>
                </div>
                <ChevronRight className="w-5 h-5 text-muted-foreground group-hover:text-primary transition-colors" />
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
