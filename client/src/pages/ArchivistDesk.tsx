import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Edit3, Check, X, AlertTriangle, ChevronRight, ChevronLeft, Search, BookOpen } from "lucide-react";
import { Panel, PanelGroup, PanelResizeHandle } from "react-resizable-panels";
import { useState } from "react";

export default function ArchivistDesk() {
  const [activeTab, setActiveTab] = useState<"json" | "provenance">("json");

  const mockJson = `{
  "entity_name": "Goblin",
  "type": "Humanoid",
  "alignment": "Neutral Evil",
  "armor_class": 15,
  "hit_points": "2d6",
  "speed": "30 ft.",
  "stats": {
    "STR": 8,
    "DEX": 14,
    "CON": 10,
    "INT": 10,
    "WIS": 8,
    "CHA": 8
  },
  "actions": [
    {
      "name": "Scimitar",
      "type": "Melee Weapon Attack",
      "hit": "+4 to hit",
      "reach": "5 ft.",
      "target": "one target",
      "damage": "1d6 + 2 slashing damage"
    }
  ]
}`;

  return (
    <div className="h-[calc(100vh-8rem)] flex flex-col animate-in fade-in duration-500">
      <div className="flex justify-between items-end mb-6">
        <div>
          <h1 className="text-4xl font-bold tracking-tight mb-2 flex items-center gap-3">
            <Edit3 className="w-10 h-10 text-primary" />
            Archivist's Desk
          </h1>
          <p className="text-lg text-muted-foreground">
            Human-in-the-loop review for low-confidence OCR results.
          </p>
        </div>
        <div className="flex items-center gap-4">
          <div className="text-sm text-muted-foreground">
            Queue: <span className="font-bold text-orange-500">14 Pending</span>
          </div>
          <div className="flex gap-2">
            <Button variant="outline" size="icon" className="border-border/50 bg-card/50">
              <ChevronLeft className="w-4 h-4" />
            </Button>
            <Button variant="outline" size="icon" className="border-border/50 bg-card/50">
              <ChevronRight className="w-4 h-4" />
            </Button>
          </div>
        </div>
      </div>

      <Card className="flex-1 bg-card/50 backdrop-blur-sm border-border/50 overflow-hidden flex flex-col">
        <div className="p-4 border-b border-border/50 flex justify-between items-center bg-muted/20">
          <div className="flex items-center gap-4">
            <span className="font-mono text-sm text-muted-foreground">Batch: B-7842</span>
            <span className="font-mono text-sm text-muted-foreground">Page: 142</span>
            <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-medium bg-orange-500/10 text-orange-500 border border-orange-500/20">
              <AlertTriangle className="w-3 h-3" />
              C_final: 0.82 (Below Threshold)
            </span>
          </div>
          <div className="flex gap-2">
            <Button variant="destructive" size="sm" className="gap-2">
              <X className="w-4 h-4" />
              Reject & Re-OCR
            </Button>
            <Button variant="default" size="sm" className="gap-2 bg-green-600 hover:bg-green-700 text-white">
              <Check className="w-4 h-4" />
              Approve & Resolve
            </Button>
          </div>
        </div>

        <PanelGroup direction="horizontal" className="flex-1">
          {/* Source Image Panel */}
          <Panel defaultSize={50} minSize={30}>
            <div className="h-full flex flex-col">
              <div className="p-2 border-b border-border/50 bg-muted/10 flex justify-between items-center">
                <span className="text-sm font-medium text-muted-foreground">Source Image (High-Res)</span>
                <Button variant="ghost" size="icon" className="h-6 w-6">
                  <Search className="w-4 h-4" />
                </Button>
              </div>
              <div className="flex-1 p-4 bg-black/5 flex items-center justify-center overflow-auto relative">
                {/* Placeholder for actual image */}
                <div className="w-full max-w-md aspect-[3/4] bg-secondary/50 border border-border/50 rounded-md flex items-center justify-center shadow-lg relative overflow-hidden">
                  <div className="absolute inset-0 opacity-10 bg-[url('data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHdpZHRoPSI4IiBoZWlnaHQ9IjgiPgo8cmVjdCB3aWR0aD0iOCIgaGVpZ2h0PSI4IiBmaWxsPSIjZmZmIiBmaWxsLW9wYWNpdHk9IjAuMSIvPgo8cGF0aCBkPSJNMCAwTDggOFpNOCAwTDAgOFoiIHN0cm9rZT0iIzAwMCIgc3Ryb2tlLW9wYWNpdHk9IjAuMSIvPgo8L3N2Zz4=')]"></div>
                  <div className="text-center space-y-2 z-10">
                    <BookOpen className="w-12 h-12 text-muted-foreground mx-auto opacity-50" />
                    <p className="text-sm text-muted-foreground font-mono">Monster_Manual_v3_p142.png</p>
                    
                    {/* Highlight Box showing the flagged area */}
                    <div className="absolute top-[40%] left-[20%] right-[20%] h-16 border-2 border-orange-500 bg-orange-500/10 rounded animate-pulse">
                      <div className="absolute -top-6 left-0 bg-orange-500 text-white text-[10px] px-1.5 py-0.5 rounded font-mono">
                        Disagreement: "Hit Points"
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </Panel>

          <PanelResizeHandle className="w-1 bg-border/50 hover:bg-primary/50 transition-colors cursor-col-resize" />

          {/* Extraction Panel */}
          <Panel defaultSize={50} minSize={30}>
            <div className="h-full flex flex-col">
              <div className="flex border-b border-border/50 bg-muted/10">
                <button 
                  className={`px-4 py-2 text-sm font-medium transition-colors ${activeTab === 'json' ? 'border-b-2 border-primary text-foreground' : 'text-muted-foreground hover:text-foreground'}`}
                  onClick={() => setActiveTab('json')}
                >
                  Extracted JSON
                </button>
                <button 
                  className={`px-4 py-2 text-sm font-medium transition-colors ${activeTab === 'provenance' ? 'border-b-2 border-primary text-foreground' : 'text-muted-foreground hover:text-foreground'}`}
                  onClick={() => setActiveTab('provenance')}
                >
                  Provenance & Scoring
                </button>
              </div>
              
              <div className="flex-1 p-4 overflow-auto bg-background/50">
                {activeTab === 'json' ? (
                  <div className="relative">
                    <textarea 
                      className="w-full h-[500px] font-mono text-sm bg-transparent border-none focus:ring-0 resize-none text-foreground/90"
                      defaultValue={mockJson}
                      spellCheck={false}
                    />
                    {/* Highlight overlay for the error */}
                    <div className="absolute top-[84px] left-0 right-0 h-6 bg-orange-500/20 border-l-2 border-orange-500 pointer-events-none"></div>
                  </div>
                ) : (
                  <div className="space-y-6">
                    <div>
                      <h3 className="text-sm font-medium text-muted-foreground mb-3">Consensus Breakdown</h3>
                      <div className="space-y-3">
                        <div className="flex justify-between items-center p-2 rounded bg-muted/30 border border-border/50">
                          <span className="font-medium">Gemini 2.5 Pro</span>
                          <span className="font-mono text-green-500">0.92</span>
                        </div>
                        <div className="flex justify-between items-center p-2 rounded bg-muted/30 border border-border/50">
                          <span className="font-medium">Claude 3.5 Sonnet</span>
                          <span className="font-mono text-orange-500">0.78</span>
                        </div>
                        <div className="flex justify-between items-center p-2 rounded bg-muted/30 border border-border/50">
                          <span className="font-medium">GPT-4o</span>
                          <span className="font-mono text-orange-500">0.81</span>
                        </div>
                      </div>
                    </div>
                    
                    <div>
                      <h3 className="text-sm font-medium text-muted-foreground mb-3">Disagreement Flags</h3>
                      <div className="p-3 rounded-md bg-orange-500/10 border border-orange-500/20 space-y-2">
                        <div className="flex items-start gap-2">
                          <AlertTriangle className="w-4 h-4 text-orange-500 mt-0.5" />
                          <div>
                            <p className="text-sm font-medium text-orange-500">Field: hit_points</p>
                            <p className="text-xs text-muted-foreground mt-1">
                              Gemini extracted "2d6", Claude extracted "2d8", GPT-4o extracted "2d6". Referee model flagged for human review due to low confidence in the source image blur.
                            </p>
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            </div>
          </Panel>
        </PanelGroup>
      </Card>
    </div>
  );
}
