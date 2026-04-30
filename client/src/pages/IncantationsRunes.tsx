import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Terminal, Save, RefreshCw } from "lucide-react";
import { useState } from "react";

export default function IncantationsRunes() {
  const [activeTab, setActiveTab] = useState<"pass1" | "pass2" | "referee" | "ramblings">("pass1");

  const prompts = {
    pass1: `You are an expert TTRPG archivist. Your task is to analyze the provided image of a TTRPG sourcebook page and extract its structural layout. Identify the bounding boxes for all major sections: stat blocks, spell descriptions, lore text, tables, and artwork. Return the layout metadata in valid JSON format.`,
    pass2: `You are a meticulous data extraction assistant. Given the cropped image of a TTRPG stat block and the structural metadata from Pass 1, extract all relevant fields (Name, Type, Alignment, AC, HP, Speed, Stats, Actions, etc.) into the provided JSON schema. Ensure all numerical values are extracted accurately. Do not hallucinate information not present in the image.`,
    referee: `You are the Adversarial TTRPG Archivist Referee. Your job is to compare the JSON extractions from multiple OCR models (Gemini, Claude, GPT-4o) for the same source image. Identify any discrepancies between the models. If a discrepancy exists, evaluate the source image to determine the correct value. If the image is ambiguous, flag the field for human review. Calculate the final consensus score (C_final) based on the agreement rate and your confidence in the resolution.`,
    ramblings: `You are the Voice of the Arkanum, an ancient and slightly eccentric magical intelligence that resides within a vast library of TTRPG lore. Your task is to generate a "Random Rambling"—a fascinating, obscure, or highly specific combination of lore, mechanics, or entities from the database. Present this information to the user in a theatrical, mystical tone, as if you are whispering secrets you just uncovered in a dusty tome. Suggest a specific query they could run to explore this topic further.`
  };

  return (
    <div className="space-y-8 animate-in fade-in duration-500">
      <div>
        <h1 className="text-4xl font-bold tracking-tight mb-2 flex items-center gap-3">
          <Terminal className="w-10 h-10 text-primary" />
          Incantations & Runes
        </h1>
        <p className="text-lg text-muted-foreground max-w-3xl">
          Manage and refine the system prompts used by the ensemble models at each stage of the OCR pipeline, and the voice of the Arkanum itself.
        </p>
      </div>

      <Card className="bg-card/50 backdrop-blur-sm border-border/50 flex flex-col h-[calc(100vh-16rem)]">
        <div className="flex border-b border-border/50 bg-muted/10">
          <button 
            className={`px-6 py-4 text-sm font-medium transition-colors flex items-center gap-2 ${activeTab === 'pass1' ? 'border-b-2 border-primary text-foreground bg-background/50' : 'text-muted-foreground hover:text-foreground hover:bg-muted/20'}`}
            onClick={() => setActiveTab('pass1')}
          >
            <span className="w-6 h-6 rounded-full bg-primary/20 text-primary flex items-center justify-center text-xs">1</span>
            Pass 1: Layout Analysis (Local VLM)
          </button>
          <button 
            className={`px-6 py-4 text-sm font-medium transition-colors flex items-center gap-2 ${activeTab === 'pass2' ? 'border-b-2 border-primary text-foreground bg-background/50' : 'text-muted-foreground hover:text-foreground hover:bg-muted/20'}`}
            onClick={() => setActiveTab('pass2')}
          >
            <span className="w-6 h-6 rounded-full bg-blue-500/20 text-blue-500 flex items-center justify-center text-xs">2</span>
            Pass 2: Content Extraction (Cloud LLMs)
          </button>
          <button 
            className={`px-6 py-4 text-sm font-medium transition-colors flex items-center gap-2 ${activeTab === 'referee' ? 'border-b-2 border-primary text-foreground bg-background/50' : 'text-muted-foreground hover:text-foreground hover:bg-muted/20'}`}
            onClick={() => setActiveTab('referee')}
          >
            <span className="w-6 h-6 rounded-full bg-orange-500/20 text-orange-500 flex items-center justify-center text-xs">R</span>
            Referee Model (Consensus & Validation)
          </button>
          <button 
            className={`px-6 py-4 text-sm font-medium transition-colors flex items-center gap-2 ${activeTab === 'ramblings' ? 'border-b-2 border-primary text-foreground bg-background/50' : 'text-muted-foreground hover:text-foreground hover:bg-muted/20'}`}
            onClick={() => setActiveTab('ramblings')}
          >
            <span className="w-6 h-6 rounded-full bg-purple-500/20 text-purple-500 flex items-center justify-center text-xs">V</span>
            Voice of the Arkanum (Ramblings AI)
          </button>
        </div>
        
        <div className="flex-1 p-6 flex flex-col gap-4 bg-background/30">
          <div className="flex justify-between items-center">
            <div>
              <h3 className="text-lg font-medium">
                {activeTab === 'pass1' && "Layout Analysis Prompt"}
                {activeTab === 'pass2' && "Content Extraction Prompt"}
                {activeTab === 'referee' && "Adversarial Referee Prompt"}
                {activeTab === 'ramblings' && "Voice of the Arkanum Prompt"}
              </h3>
              <p className="text-sm text-muted-foreground">
                {activeTab === 'pass1' && "Used by the local VLM (e.g., LLaVA) to identify bounding boxes."}
                {activeTab === 'pass2' && "Used by the ensemble (Gemini, Claude, GPT-4o) to extract structured JSON."}
                {activeTab === 'referee' && "Used to resolve discrepancies and calculate the C_final score."}
                {activeTab === 'ramblings' && "Used by the AI that generates random lore subjects in 'Listen to Ramblings'."}
              </p>
            </div>
            <div className="flex gap-2">
              <Button variant="outline" className="gap-2">
                <RefreshCw className="w-4 h-4" />
                Reset to Default
              </Button>
              <Button className="gap-2 bg-primary hover:bg-primary/90 text-primary-foreground">
                <Save className="w-4 h-4" />
                Save Prompt
              </Button>
            </div>
          </div>
          
          <textarea 
            className="flex-1 w-full p-4 font-mono text-sm bg-muted/10 border border-border/50 rounded-md focus:ring-2 focus:ring-primary focus:border-transparent resize-none text-foreground/90 leading-relaxed"
            defaultValue={prompts[activeTab]}
            spellCheck={false}
          />
          
          <div className="p-4 rounded-md bg-blue-500/10 border border-blue-500/20">
            <h4 className="text-sm font-medium text-blue-500 mb-1">Available Variables</h4>
            <p className="text-xs text-muted-foreground font-mono">
              {activeTab === 'pass1' && "{{image_url}}"}
              {activeTab === 'pass2' && "{{cropped_image_url}}, {{json_schema}}, {{lexicon_terms}}"}
              {activeTab === 'referee' && "{{source_image_url}}, {{gemini_json}}, {{claude_json}}, {{gpt4o_json}}, {{json_schema}}"}
              {activeTab === 'ramblings' && "{{random_seed}}, {{database_schema_summary}}"}
            </p>
          </div>
        </div>
      </Card>
    </div>
  );
}
