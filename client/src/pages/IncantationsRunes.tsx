import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { toast } from "sonner";
import { Terminal, Save, RefreshCw, Wand2, Database, Zap, Search, FileSearch, ScanLine, Table2, Gavel, History, RotateCcw } from "lucide-react";
import { useAuth } from "@/_core/hooks/useAuth";
import { getLoginUrl } from "@/const";

interface PromptTab {
  name: string;
  label: string;
  category: "pipeline" | "console_experience";
  icon: React.ElementType;
  description: string;
  variables: string[];
}

const PROMPT_TABS: PromptTab[] = [
  // ── Phase 1: Ingestion & Layout ──────────────────────────────────────────
  {
    name: "document_intelligence",
    label: "P1: Document Intelligence",
    category: "pipeline",
    icon: FileSearch,
    description: "Instructions for identifying the document's canonical title, publisher, document type (book/guide/supplement/adventure/periodical/magazine), and generating a 2–3 sentence summary from the first 10 pages. The document type output drives the layout parsing strategy for all subsequent pages.",
    variables: ["{{page_images}}", "{{filename}}", "{{game_system}}", "{{edition}}"],
  },
  {
    name: "layout_analysis",
    label: "P1: Layout Analysis",
    category: "pipeline",
    icon: Zap,
    description: "Instructions for the local VLM to identify bounding boxes, content regions, and element types on each page.",
    variables: ["{{image_url}}", "{{page_number}}", "{{game_system}}", "{{document_type}}"],
  },
  {
    name: "bbox_detection",
    label: "P1: BBox & Content Classification",
    category: "pipeline",
    icon: Zap,
    description: "Instructions for classifying detected bounding boxes into content types: text, table, illustration, map, graphic, advertisement.",
    variables: ["{{image_url}}", "{{layout_metadata}}", "{{page_number}}"],
  },
  {
    name: "content_type_classify",
    label: "P1: Mixed-Boundary Resolver",
    category: "pipeline",
    icon: ScanLine,
    description: "Instructions for resolving ambiguous or mixed-boundary regions identified during bounding-box detection. Receives a cropped region image and must output refined sub-region splits with corrected content type classifications and pixel-accurate bounding boxes.",
    variables: ["{{region_image_url}}", "{{original_region_sequence}}", "{{layout_type}}", "{{page_number}}"],
  },
  // ── Phase 2: OCR Extraction ──────────────────────────────────────────────
  {
    name: "ocr_extraction",
    label: "P2: OCR Content Extraction",
    category: "pipeline",
    icon: Database,
    description: "Instructions for extracting structured JSON from TTRPG page content regions, preserving reading order and content hierarchy.",
    variables: ["{{image_url}}", "{{json_schema}}", "{{layout_metadata}}", "{{lexicon_terms}}", "{{content_regions}}"],
  },
  {
    name: "content_break_detect",
    label: "P2: Content Break Detection",
    category: "pipeline",
    icon: Database,
    description: "Instructions for identifying chapter, section, and subsection breaks, and detecting cross-page sentence continuity.",
    variables: ["{{extracted_text}}", "{{previous_page_tail}}", "{{page_number}}", "{{document_id}}"],
  },
  {
    name: "summarisation",
    label: "P2: Hierarchical Summarisation",
    category: "pipeline",
    icon: Database,
    description: "Instructions for generating chapter, section, and subsection summaries for embedding and retrieval.",
    variables: ["{{section_text}}", "{{section_type}}", "{{game_system}}", "{{document_title}}"],
  },
  {
    name: "quality_validation",
    label: "P2: Quality Validation",
    category: "pipeline",
    icon: RefreshCw,
    description: "Instructions for the quality-assessment LLM that scores extraction results for completeness, layout accuracy, context decisions, and text continuity.",
    variables: ["{{source_image_url}}", "{{extracted_json}}", "{{layout_metadata}}", "{{confidence_threshold}}"],
  },
  {
    name: "pass_comparison",
    label: "P2: Multi-Pass Comparison",
    category: "pipeline",
    icon: RefreshCw,
    description: "Instructions for contrasting and scoring results from multiple extraction passes (Pass 1–4) to determine the best candidate or flag for HITL.",
    variables: ["{{pass1_result}}", "{{pass2_result}}", "{{pass3_result}}", "{{pass4_result}}", "{{source_image_url}}"],
  },
  {
    name: "tabular_extraction",
    label: "P2: Tabular Extraction",
    category: "pipeline",
    icon: Table2,
    description: "Specialised extraction prompt for table-dominant pages and complex table regions (stat blocks, spell lists, equipment tables, multi-row nested structures). Invoked when ocr_extraction produces a low-confidence table output or when layout_type is table_dominant.",
    variables: ["{{region_image_url}}", "{{table_type_hint}}", "{{game_system}}", "{{entity_name_hint}}"],
  },
  {
    name: "voice_of_arkanum",
    label: "Voice of the Arkanum",
    category: "console_experience",
    icon: Wand2,
    description: "Instructions for the AI that generates random lore ramblings and thematic knowledge snippets.",
    variables: ["{{random_seed}}", "{{database_schema_summary}}", "{{preferred_game}}"],
  },
  {
    name: "arkanum_search",
    label: "Arkanum Search Oracle",
    category: "console_experience",
    icon: Search,
    description: "Instructions for the AI that interprets natural language search queries against the lore database.",
    variables: ["{{user_query}}", "{{available_filters}}", "{{preferred_game}}"],
  },
  {
    name: "referee",
    label: "The Referee",
    category: "console_experience",
    icon: Gavel,
    description: "Instructions for the AI that acts as an authoritative rules referee — answering specific rules questions, resolving edge cases, and citing the relevant source material from the lore database.",
    variables: ["{{rules_question}}", "{{game_system}}", "{{edition}}", "{{retrieved_context}}"],
  },
];

export default function IncantationsRunes() {
  const { isAuthenticated } = useAuth();
  const [activeTab, setActiveTab] = useState(PROMPT_TABS[0].name);
  const [editedText, setEditedText] = useState<Record<string, string>>({});
  const [isDirty, setIsDirty] = useState<Record<string, boolean>>({});

  const { data: prompts, isLoading, refetch } = trpc.prompts.list.useQuery(undefined, {
    enabled: isAuthenticated,
  });

  const { data: versionHistory, refetch: refetchHistory } = trpc.prompts.history.useQuery(
    { name: activeTab },
    { enabled: isAuthenticated },
  );

  const seedDefaults = trpc.prompts.seedDefaults.useMutation({
    onSuccess: () => { toast.success("Default incantations inscribed into the Arkanum."); refetch(); },
    onError: (e) => toast.error("Failed to seed: " + e.message),
  });

  const upsertPrompt = trpc.prompts.upsert.useMutation({
    onSuccess: () => {
      toast.success("Incantation saved to the Arkanum.");
      setIsDirty((d) => ({ ...d, [activeTab]: false }));
      refetch();
      refetchHistory();
    },
    onError: (e) => toast.error("Failed to save: " + e.message),
  });

  const promptMap = (prompts ?? []).reduce<Record<string, string>>((acc, p) => {
    acc[p.name] = p.promptText;
    return acc;
  }, {});

  const activeTabDef = PROMPT_TABS.find((t) => t.name === activeTab)!;
  const currentText = editedText[activeTab] ?? promptMap[activeTab] ?? "";

  const handleTextChange = (text: string) => {
    setEditedText((e) => ({ ...e, [activeTab]: text }));
    setIsDirty((d) => ({ ...d, [activeTab]: text !== (promptMap[activeTab] ?? "") }));
  };

  const handleSave = () => {
    upsertPrompt.mutate({
      name: activeTabDef.name,
      category: activeTabDef.category,
      description: activeTabDef.description,
      promptText: currentText,
    });
  };

  const handleRevert = () => {
    setEditedText((e) => ({ ...e, [activeTab]: promptMap[activeTab] ?? "" }));
    setIsDirty((d) => ({ ...d, [activeTab]: false }));
  };

  if (!isAuthenticated) {
    return (
      <div className="flex flex-col items-center justify-center h-full text-center space-y-4 py-24">
        <Terminal className="w-12 h-12 text-primary/50" />
        <h2 className="text-2xl font-bold">Authentication Required</h2>
        <p className="text-muted-foreground">You must be authenticated to manage incantations.</p>
        <a href={getLoginUrl()}><Button>Enter the Gates</Button></a>
      </div>
    );
  }

  return (
    <div className="space-y-6 animate-in fade-in duration-500">
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight mb-1 flex items-center gap-3">
            <Terminal className="w-8 h-8 text-primary" />
            Incantations & Runes
          </h1>
          <p className="text-muted-foreground">
            Craft and refine the arcane instructions that guide all AI operations within the Kodex.
            All prompts are stored in the Arkanum's memory and fetched at runtime.
          </p>
        </div>
        {(!prompts || prompts.length === 0) && !isLoading && (
          <Button
            variant="outline"
            size="sm"
            className="gap-2 border-primary/40"
            onClick={() => seedDefaults.mutate()}
            disabled={seedDefaults.isPending}
          >
            <Database className="w-4 h-4" />
            {seedDefaults.isPending ? "Inscribing..." : "Inscribe Defaults"}
          </Button>
        )}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
        {/* Tab List */}
        <div className="lg:col-span-1 space-y-1">
          <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">Pipeline</p>
          {PROMPT_TABS.filter((t) => t.category === "pipeline").map((tab) => {
            const Icon = tab.icon;
            const isActive = activeTab === tab.name;
            const dirty = isDirty[tab.name];
            return (
              <button
                key={tab.name}
                onClick={() => setActiveTab(tab.name)}
                className={`w-full flex items-center gap-2.5 px-3 py-2.5 rounded-md text-sm text-left transition-colors duration-200 ${
                  isActive
                    ? "bg-primary/15 border border-primary/40 text-foreground"
                    : "text-muted-foreground hover:bg-muted/50 hover:text-foreground"
                }`}
              >
                <Icon className={`w-4 h-4 flex-shrink-0 ${isActive ? "text-primary" : ""}`} />
                <span className="truncate flex-1">{tab.label}</span>
                {dirty && <div className="w-1.5 h-1.5 rounded-full bg-orange-400 flex-shrink-0" />}
              </button>
            );
          })}

          <Separator className="bg-border/40 my-3" />

          <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">Console AI</p>
          {PROMPT_TABS.filter((t) => t.category === "console_experience").map((tab) => {
            const Icon = tab.icon;
            const isActive = activeTab === tab.name;
            const dirty = isDirty[tab.name];
            return (
              <button
                key={tab.name}
                onClick={() => setActiveTab(tab.name)}
                className={`w-full flex items-center gap-2.5 px-3 py-2.5 rounded-md text-sm text-left transition-colors duration-200 ${
                  isActive
                    ? "bg-primary/15 border border-primary/40 text-foreground"
                    : "text-muted-foreground hover:bg-muted/50 hover:text-foreground"
                }`}
              >
                <Icon className={`w-4 h-4 flex-shrink-0 ${isActive ? "text-primary" : ""}`} />
                <span className="truncate flex-1">{tab.label}</span>
                {dirty && <div className="w-1.5 h-1.5 rounded-full bg-orange-400 flex-shrink-0" />}
              </button>
            );
          })}
        </div>

        {/* Editor */}
        <div className="lg:col-span-3 space-y-4">
          <div className="p-4 rounded-lg border border-border/50 bg-card/50">
            <div className="flex items-start justify-between mb-3">
              <div>
                <div className="flex items-center gap-2 mb-1">
                  <h2 className="text-lg font-bold">{activeTabDef.label}</h2>
                  <Badge variant={activeTabDef.category === "pipeline" ? "default" : "secondary"} className="text-xs">
                    {activeTabDef.category === "pipeline" ? "Pipeline" : "Console AI"}
                  </Badge>
                  {isDirty[activeTab] && (
                    <Badge variant="outline" className="text-xs text-orange-400 border-orange-400/40">
                      Unsaved
                    </Badge>
                  )}
                </div>
                <p className="text-sm text-muted-foreground">{activeTabDef.description}</p>
              </div>
            </div>

            {isLoading ? (
              <div className="h-64 flex items-center justify-center text-muted-foreground">
                <RefreshCw className="w-5 h-5 animate-spin mr-2" />
                Consulting the Arkanum...
              </div>
            ) : (
              <Textarea
                value={currentText}
                onChange={(e) => handleTextChange(e.target.value)}
                className="min-h-[360px] font-mono text-sm bg-background/60 border-border/60 resize-y"
                placeholder={`No incantation inscribed yet for "${activeTabDef.label}". Click "Inscribe Defaults" to load the default prompts, or type your own.`}
              />
            )}

            <div className="flex items-center justify-between mt-4">
              <div className="text-xs text-muted-foreground font-mono">
                {currentText.length} characters · {currentText.split("\n").length} lines
              </div>
              <div className="flex gap-2">
                {isDirty[activeTab] && (
                  <Button variant="outline" size="sm" className="gap-2" onClick={handleRevert}>
                    <RefreshCw className="w-3.5 h-3.5" />
                    Revert
                  </Button>
                )}
                <Button
                  size="sm"
                  className="gap-2"
                  onClick={handleSave}
                  disabled={upsertPrompt.isPending || !currentText}
                >
                  <Save className="w-3.5 h-3.5" />
                  {upsertPrompt.isPending ? "Inscribing..." : "Save Incantation"}
                </Button>
              </div>
            </div>
          </div>

          {/* Available Variables */}
          <div className="p-4 rounded-lg border border-border/40 bg-card/30">
            <h3 className="text-sm font-semibold mb-2 flex items-center gap-2">
              <Terminal className="w-4 h-4 text-primary" />
              Available Rune Variables
            </h3>
            <div className="flex flex-wrap gap-2">
              {activeTabDef.variables.map((v) => (
                <code key={v} className="text-xs px-2 py-1 rounded bg-background/60 border border-border/50 text-primary font-mono">
                  {v}
                </code>
              ))}
            </div>
          </div>

          {/* Version History */}
          {versionHistory && versionHistory.length > 0 && (
            <div className="p-4 rounded-lg border border-border/40 bg-card/30">
              <h3 className="text-sm font-semibold mb-3 flex items-center gap-2">
                <History className="w-4 h-4 text-primary" />
                Version History
                <span className="text-xs text-muted-foreground font-normal">(last {versionHistory.length} saves)</span>
              </h3>
              <div className="space-y-2">
                {versionHistory.map((v, idx) => (
                  <div key={v.id} className="flex items-center justify-between p-2.5 rounded-md border border-border/30 bg-background/40 gap-3">
                    <div className="flex items-center gap-2.5 min-w-0">
                      <Badge variant="outline" className="text-xs font-mono flex-shrink-0">
                        v{v.version}
                      </Badge>
                      {idx === 0 && (
                        <Badge variant="default" className="text-xs flex-shrink-0">Current</Badge>
                      )}
                      <span className="text-xs text-muted-foreground truncate">
                        {new Date(v.createdAt).toLocaleString()}
                      </span>
                      <span className="text-xs text-muted-foreground/60 truncate hidden sm:block">
                        {v.promptText.length} chars
                      </span>
                    </div>
                    {idx > 0 && (
                      <Button
                        variant="outline"
                        size="sm"
                        className="gap-1.5 text-xs flex-shrink-0"
                        onClick={() => {
                          handleTextChange(v.promptText);
                          toast.info(`v${v.version} loaded into editor — click Save to apply.`);
                        }}
                      >
                        <RotateCcw className="w-3 h-3" />
                        Restore
                      </Button>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
