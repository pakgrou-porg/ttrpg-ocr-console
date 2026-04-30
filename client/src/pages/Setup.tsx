import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Settings, Save, Plus, Trash2 } from "lucide-react";
import { useState } from "react";

export default function Setup() {
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
          <Settings className="w-10 h-10 text-primary" />
          Setup & Configuration
        </h1>
        <p className="text-lg text-muted-foreground max-w-3xl">
          Configure pipeline settings, adjust ensemble model weights, and manage the TTRPG lexicon for improved OCR accuracy.
        </p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
        {/* Pipeline Configuration */}
        <Card className="bg-card/50 backdrop-blur-sm border-border/50">
          <CardHeader>
            <CardTitle className="text-2xl">Pipeline Configuration</CardTitle>
            <CardDescription>Manage connections and API keys.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            <div className="space-y-2">
              <Label htmlFor="supabase-url">Supabase URL</Label>
              <Input id="supabase-url" defaultValue="http://localhost:8000" className="font-mono bg-background/50" />
            </div>
            <div className="space-y-2">
              <Label htmlFor="lm-studio-url">LM Studio Endpoint (Local VLM)</Label>
              <Input id="lm-studio-url" defaultValue="http://localhost:1234/v1" className="font-mono bg-background/50" />
            </div>
            <div className="space-y-2">
              <Label htmlFor="openrouter-key">OpenRouter API Key</Label>
              <Input id="openrouter-key" type="password" defaultValue="sk-or-v1-..." className="font-mono bg-background/50" />
            </div>
            <Button className="w-full gap-2 mt-4">
              <Save className="w-4 h-4" />
              Save Configuration
            </Button>
          </CardContent>
        </Card>

        {/* Ensemble Model Weights */}
        <Card className="bg-card/50 backdrop-blur-sm border-border/50">
          <CardHeader>
            <CardTitle className="text-2xl">Ensemble Model Weights</CardTitle>
            <CardDescription>Adjust the influence of each model in the consensus scoring.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            <div className="space-y-4">
              <div className="flex justify-between items-center">
                <Label className="text-base">Gemini 2.5 Pro (Primary)</Label>
                <span className="font-mono text-primary">0.45</span>
              </div>
              <input type="range" min="0" max="1" step="0.05" defaultValue="0.45" className="w-full accent-primary" />
            </div>
            <div className="space-y-4">
              <div className="flex justify-between items-center">
                <Label className="text-base">Claude 3.5 Sonnet (Secondary)</Label>
                <span className="font-mono text-primary">0.35</span>
              </div>
              <input type="range" min="0" max="1" step="0.05" defaultValue="0.35" className="w-full accent-primary" />
            </div>
            <div className="space-y-4">
              <div className="flex justify-between items-center">
                <Label className="text-base">GPT-4o (Tertiary)</Label>
                <span className="font-mono text-primary">0.20</span>
              </div>
              <input type="range" min="0" max="1" step="0.05" defaultValue="0.20" className="w-full accent-primary" />
            </div>
            <div className="p-4 rounded-md bg-primary/10 border border-primary/20 text-sm text-primary-foreground/80">
              Total weight must equal 1.0. Current total: <span className="font-bold text-primary">1.00</span>
            </div>
          </CardContent>
        </Card>

        {/* TTRPG Lexicon Management */}
        <Card className="lg:col-span-2 bg-card/50 backdrop-blur-sm border-border/50">
          <CardHeader>
            <CardTitle className="text-2xl">TTRPG Lexicon Management</CardTitle>
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
            
            <div className="flex flex-wrap gap-2">
              {lexicon.map((term) => (
                <div key={term} className="flex items-center gap-2 px-3 py-1.5 rounded-full bg-secondary text-secondary-foreground border border-border/50 text-sm">
                  {term}
                  <button onClick={() => removeTerm(term)} className="text-muted-foreground hover:text-destructive transition-colors">
                    <Trash2 className="w-3 h-3" />
                  </button>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
