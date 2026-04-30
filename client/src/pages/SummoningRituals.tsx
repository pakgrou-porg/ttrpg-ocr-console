import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Database, Save, Plus, Trash2, UploadCloud } from "lucide-react";
import { useState } from "react";

export default function SummoningRituals() {
  const [lexicon, setLexicon] = useState([
    "Armor Class", "Hit Points", "Saving Throw", "Dexterity", "Constitution", "Intelligence", "Wisdom", "Charisma", "Initiative", "Proficiency Bonus"
  ]);
  const [newTerm, setNewTerm] = useState("");

  const addTerm = () => {
    if (newTerm && !lexicon.includes(newTerm)) {
      setLexicon([...lexicon, newTerm]);
      setNewTerm("");
    }
  };

  const removeTerm = (term: string) => {
    setLexicon(lexicon.filter(t => t !== term));
  };

  return (
    <div className="space-y-8 animate-in fade-in duration-500">
      <div>
        <h1 className="text-4xl font-bold tracking-tight mb-2 flex items-center gap-3">
          <Database className="w-10 h-10 text-primary" />
          Summoning Rituals
        </h1>
        <p className="text-lg text-muted-foreground max-w-3xl">
          Set up imports for new games, versions, or materials, and manage the domain-specific lexicon. Summon new knowledge into the Arkanum.
        </p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
        {/* New Import Job */}
        <Card className="bg-card/50 backdrop-blur-sm border-border/50">
          <CardHeader>
            <CardTitle className="text-2xl flex items-center gap-2">
              <UploadCloud className="w-5 h-5 text-primary" />
              New Summoning Ritual
            </CardTitle>
              <CardDescription>Configure a new PDF ingestion batch to summon knowledge.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            <div className="space-y-2">
              <Label htmlFor="game-system">Game System</Label>
              <select id="game-system" className="w-full h-10 px-3 rounded-md border border-input bg-background/50 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2">
                <option>Dungeons & Dragons 5e</option>
                <option>Pathfinder 2e</option>
                <option>Call of Cthulhu 7e</option>
                <option>Custom / Other</option>
              </select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="source-name">Source Material Name</Label>
              <Input id="source-name" placeholder="e.g., 'Monster Manual v3'" className="bg-background/50" />
            </div>
            <div className="space-y-2">
              <Label htmlFor="pdf-path">Local PDF Path</Label>
              <Input id="pdf-path" placeholder="/home/ubuntu/ttrpg-ocr/input/..." className="font-mono bg-background/50" />
            </div>
            <div className="space-y-2">
              <Label htmlFor="page-range">Page Range (Optional)</Label>
              <Input id="page-range" placeholder="e.g., '10-50, 75-100'" className="bg-background/50" />
            </div>
            <Button className="w-full gap-2 mt-4 bg-primary hover:bg-primary/90 text-primary-foreground">
              <Plus className="w-4 h-4" />
              Begin Summoning
            </Button>
          </CardContent>
        </Card>

        {/* TTRPG Lexicon Management */}
        <Card className="bg-card/50 backdrop-blur-sm border-border/50">
          <CardHeader>
            <CardTitle className="text-2xl">Words of Binding (Lexicon)</CardTitle>
            <CardDescription>Manage the domain-specific vocabulary used to validate OCR extractions.</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="flex gap-4 mb-6">
              <Input 
                placeholder="Add new term (e.g., 'Eldritch Blast')" 
                value={newTerm}
                onChange={(e) => setNewTerm(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && addTerm()}
                className="bg-background/50"
              />
              <Button onClick={addTerm} className="gap-2 whitespace-nowrap">
                <Plus className="w-4 h-4" />
                Add Term
              </Button>
            </div>
            
            <div className="flex flex-wrap gap-2 max-h-[300px] overflow-y-auto p-2 border border-border/50 rounded-md bg-muted/10">
              {lexicon.map((term) => (
                <div key={term} className="flex items-center gap-2 px-3 py-1.5 rounded-full bg-secondary text-secondary-foreground border border-border/50 text-sm">
                  {term}
                  <button onClick={() => removeTerm(term)} className="text-muted-foreground hover:text-destructive transition-colors">
                    <Trash2 className="w-3 h-3" />
                  </button>
                </div>
              ))}
            </div>
            <Button variant="outline" className="w-full gap-2 mt-6">
              <Save className="w-4 h-4" />
              Save Lexicon Changes
            </Button>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
