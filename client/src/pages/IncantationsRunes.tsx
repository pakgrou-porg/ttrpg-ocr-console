import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { toast } from "sonner";
import { Terminal, Save, RefreshCw, Wand2, Database, Zap, Search, FileSearch, ScanLine, Table2, Gavel, History, RotateCcw, GitCompare, Braces } from "lucide-react";
import { useAuth } from "@/_core/hooks/useAuth";
import { getLoginUrl } from "@/const";

// ── Diff utilities ─────────────────────────────────────────────────────────────

type DiffLine = { type: "equal" | "add" | "remove"; text: string };

function diffLines(before: string, after: string): DiffLine[] {
  const a = before.split("\n");
  const b = after.split("\n");
  // Guard against O(m·n) blow-up on very large prompts
  if (a.length * b.length > 400_000) {
    return [
      ...a.map(text => ({ type: "remove" as const, text })),
      ...b.map(text => ({ type: "add" as const, text })),
    ];
  }
  const m = a.length, n = b.length;
  const dp = Array.from({ length: m + 1 }, () => new Array<number>(n + 1).fill(0));
  for (let i = 1; i <= m; i++)
    for (let j = 1; j <= n; j++)
      dp[i][j] = a[i - 1] === b[j - 1]
        ? dp[i - 1][j - 1] + 1
        : Math.max(dp[i - 1][j], dp[i][j - 1]);
  const result: DiffLine[] = [];
  let i = m, j = n;
  while (i > 0 || j > 0) {
    if (i > 0 && j > 0 && a[i - 1] === b[j - 1]) {
      result.unshift({ type: "equal", text: a[i - 1] }); i--; j--;
    } else if (j > 0 && (i === 0 || dp[i][j - 1] >= dp[i - 1][j])) {
      result.unshift({ type: "add", text: b[j - 1] }); j--;
    } else {
      result.unshift({ type: "remove", text: a[i - 1] }); i--;
    }
  }
  return result;
}

const DIFF_CONTEXT = 3; // unchanged lines shown above/below each changed region

function DiffView({ before, after, label }: { before: string; after: string; label: string }) {
  const lines = diffLines(before, after);
  const addCount    = lines.filter(l => l.type === "add").length;
  const removeCount = lines.filter(l => l.type === "remove").length;

  if (addCount + removeCount === 0) {
    return (
      <p className="text-xs text-muted-foreground italic py-2 text-center">
        No differences — these versions are identical.
      </p>
    );
  }

  // Which line indices to display (changed ± context window)
  const show = new Set<number>();
  lines.forEach((l, i) => {
    if (l.type !== "equal") {
      for (let k = Math.max(0, i - DIFF_CONTEXT); k <= Math.min(lines.length - 1, i + DIFF_CONTEXT); k++)
        show.add(k);
    }
  });

  // Build run of visible lines interspersed with collapse markers
  type Item = { kind: "line"; line: DiffLine; idx: number } | { kind: "collapse"; count: number };
  const items: Item[] = [];
  let gap = 0;
  for (let i = 0; i < lines.length; i++) {
    if (show.has(i)) {
      if (gap > 0) { items.push({ kind: "collapse", count: gap }); gap = 0; }
      items.push({ kind: "line", line: lines[i], idx: i });
    } else { gap++; }
  }
  if (gap > 0) items.push({ kind: "collapse", count: gap });

  return (
    <div className="space-y-1.5">
      <div className="flex items-center gap-3 text-xs text-muted-foreground">
        <span className="font-mono">{label}</span>
        <span className="text-green-400 font-mono">+{addCount}</span>
        <span className="text-red-400 font-mono">−{removeCount}</span>
      </div>
      <div className="rounded border border-border/40 bg-background/50 overflow-auto max-h-80 font-mono text-xs">
        {items.map((item, itemIdx) =>
          item.kind === "collapse" ? (
            <div key={`c${itemIdx}`}
              className="px-3 py-1 text-muted-foreground/40 bg-muted/10 border-y border-border/20 text-center select-none">
              ···  {item.count} unchanged {item.count === 1 ? "line" : "lines"}  ···
            </div>
          ) : (
            <div key={`l${item.idx}`}
              className={`flex gap-2 px-3 py-px break-all leading-5 ${
                item.line.type === "add"    ? "bg-green-500/10 text-green-300" :
                item.line.type === "remove" ? "bg-red-500/10 text-red-300"    :
                                              "text-muted-foreground/70"
              }`}
            >
              <span className="select-none opacity-60 flex-shrink-0 w-3 text-center">
                {item.line.type === "add" ? "+" : item.line.type === "remove" ? "−" : " "}
              </span>
              <span className={`whitespace-pre-wrap ${item.line.type === "remove" ? "line-through opacity-60" : ""}`}>
                {item.line.text || " "}
              </span>
            </div>
          )
        )}
      </div>
    </div>
  );
}

interface PromptTab {
  name: string;
  label: string;
  category: "pipeline" | "console_experience" | "schema";
  icon: React.ElementType;
  description: string;
  variables: string[];
}

// ── Default schema content (shown as placeholder until the user saves to DB) ───

const DEFAULT_PIPELINE_SCHEMAS = JSON.stringify({
  $schema: "http://json-schema.org/draft-07/schema#",
  title: "TTRPG Pipeline Structured Output Schemas",
  description: "Standalone JSON Schema for each pipeline stage output. Copy the relevant $def value into response_format.json_schema.schema when configuring structured output on a model endpoint.",
  $defs: {
    document_intelligence: {
      type: "object",
      required: ["canonical_title", "publisher", "document_type", "document_summary", "game_system"],
      additionalProperties: false,
      properties: {
        canonical_title:  { type: "string" },
        publisher:        { type: ["string", "null"] },
        document_type:    { type: "string", enum: ["rulebook", "sourcebook", "adventure", "supplement", "setting", "magazine", "other"] },
        document_summary: { type: "string" },
        game_system:      { type: ["string", "null"] },
      },
    },
    layout_analysis: {
      type: "object",
      required: ["layout_type", "columns", "has_table", "has_image_or_art", "has_list"],
      additionalProperties: false,
      properties: {
        layout_type:      { type: "string", enum: ["cover", "title_page", "toc", "chapter_header", "body_text", "stat_block", "table", "illustration_full", "illustration_with_text", "index", "appendix", "mixed"] },
        columns:          { type: "integer", minimum: 1, maximum: 6 },
        has_table:        { type: "boolean" },
        has_image_or_art: { type: "boolean" },
        has_list:         { type: "boolean" },
      },
    },
    bbox_detection: {
      type: "object",
      required: ["regions"],
      additionalProperties: false,
      properties: {
        regions: {
          type: "array",
          items: {
            type: "object",
            required: ["type", "label", "bbox"],
            additionalProperties: false,
            properties: {
              type:  { type: "string", enum: ["heading", "subheading", "paragraph", "list", "sidebar", "callout", "caption", "table", "stat_block", "illustration", "map", "graphic", "advertisement", "header", "footer", "page_number", "unknown"] },
              label: { type: "string" },
              bbox: {
                type: "object",
                required: ["x", "y", "w", "h"],
                additionalProperties: false,
                properties: {
                  x: { type: "number", minimum: 0, maximum: 100 },
                  y: { type: "number", minimum: 0, maximum: 100 },
                  w: { type: "number", minimum: 0, maximum: 100 },
                  h: { type: "number", minimum: 0, maximum: 100 },
                },
              },
            },
          },
        },
      },
    },
    ocr_extraction: {
      type: "object",
      required: ["confidence", "region_sequence", "regionType", "content_blocks", "reading_order_verified"],
      additionalProperties: false,
      properties: {
        confidence:             { type: "integer", minimum: 0, maximum: 100 },
        region_sequence:        { type: "integer", minimum: 1 },
        regionType:             { type: "string" },
        content_blocks: {
          type: "array",
          items: {
            type: "object",
            required: ["block_type"],
            additionalProperties: false,
            properties: {
              block_type:  { type: "string", enum: ["heading", "paragraph", "stat_line", "rule_term"] },
              text:        { type: "string" },
              level:       { type: "integer", minimum: 1, maximum: 6 },
              term:        { type: "string" },
              definition:  { type: "string" },
              formatting:  { type: "array", items: { type: "string", enum: ["bold", "italic"] } },
            },
          },
        },
        reading_order_verified: { type: "boolean" },
      },
    },
    content_break_detect: {
      type: "object",
      required: ["page_number", "structural_breaks", "continuity", "confidence"],
      additionalProperties: false,
      properties: {
        page_number: { type: "integer", minimum: 1 },
        structural_breaks: {
          type: "array",
          items: {
            type: "object",
            required: ["break_type", "heading_text", "position"],
            additionalProperties: false,
            properties: {
              break_type:   { type: "string", enum: ["chapter", "section", "subsection", "appendix"] },
              heading_text: { type: "string" },
              position:     { type: "integer", minimum: 1 },
            },
          },
        },
        continuity: {
          type: "object",
          required: ["continues_from_previous_page", "continues_to_next_page", "mid_sentence_break_at_end", "section_continues_from_previous_page"],
          additionalProperties: false,
          properties: {
            continues_from_previous_page:        { type: "boolean" },
            continues_to_next_page:              { type: "boolean" },
            mid_sentence_break_at_end:           { type: "boolean" },
            section_continues_from_previous_page: { type: "boolean" },
          },
        },
        confidence: { type: "integer", minimum: 0, maximum: 100 },
      },
    },
    tabular_extraction: {
      type: "object",
      required: ["region_sequence", "table_type", "caption", "column_headers", "rows", "merged_cells", "footnotes", "confidence"],
      additionalProperties: false,
      properties: {
        region_sequence: { type: ["integer", "null"], minimum: 1 },
        table_type:      { type: "string", enum: ["stat_block", "spell_list", "equipment", "combat", "saving_throw", "ability_score", "class_features", "random_table", "other"] },
        caption:         { type: ["string", "null"] },
        column_headers:  { type: "array", items: { type: "string" } },
        rows:            { type: "array", items: { type: "object", additionalProperties: { type: "string" } } },
        merged_cells: {
          type: "array",
          items: {
            type: "object",
            required: ["header", "spans"],
            additionalProperties: false,
            properties: {
              header: { type: "string" },
              spans:  { type: "array", items: { type: "string" } },
            },
          },
        },
        footnotes:  { type: "array", items: { type: "string" } },
        confidence: { type: "integer", minimum: 0, maximum: 100 },
      },
    },
    section_summary: {
      type: "object",
      required: ["short_summary", "long_summary", "key_terms", "key_entities"],
      additionalProperties: false,
      properties: {
        short_summary: { type: "string" },
        long_summary:  { type: "string" },
        key_terms:     { type: "array", items: { type: "string" } },
        key_entities:  { type: "array", items: { type: "string" } },
      },
    },
  },
}, null, 2);

const SCHEMA_DEFAULTS: Partial<Record<string, string>> = {
  pipeline_schemas: DEFAULT_PIPELINE_SCHEMAS,
};

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
  // ── Schemas ───────────────────────────────────────────────────────────────
  {
    name: "pipeline_schemas",
    label: "Pipeline Output Schemas",
    category: "schema",
    icon: Braces,
    description: "JSON Schema definitions for all pipeline stage structured outputs. Each $def is a self-contained schema — copy the relevant one into response_format.json_schema.schema when enabling strict structured output on a model endpoint.",
    variables: [],
  },
];

export default function IncantationsRunes() {
  const { isAuthenticated } = useAuth();
  const [activeTab, setActiveTab] = useState(PROMPT_TABS[0].name);
  const [editedText, setEditedText] = useState<Record<string, string>>({});
  const [isDirty, setIsDirty] = useState<Record<string, boolean>>({});
  const [diffVersionId, setDiffVersionId] = useState<number | null>(null);

  const switchTab = (name: string) => {
    setActiveTab(name);
    setDiffVersionId(null);
  };

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
  const currentText = editedText[activeTab] ?? promptMap[activeTab] ?? SCHEMA_DEFAULTS[activeTab] ?? "";

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
                onClick={() => switchTab(tab.name)}
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
                onClick={() => switchTab(tab.name)}
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

          <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">Schemas</p>
          {PROMPT_TABS.filter((t) => t.category === "schema").map((tab) => {
            const Icon = tab.icon;
            const isActive = activeTab === tab.name;
            const dirty = isDirty[tab.name];
            return (
              <button
                key={tab.name}
                onClick={() => switchTab(tab.name)}
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
                  <Badge
                    variant={activeTabDef.category === "pipeline" ? "default" : activeTabDef.category === "schema" ? "outline" : "secondary"}
                    className="text-xs"
                  >
                    {activeTabDef.category === "pipeline" ? "Pipeline" : activeTabDef.category === "schema" ? "Schema" : "Console AI"}
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
                      <div className="flex items-center gap-1.5 flex-shrink-0">
                        <Button
                          variant="outline"
                          size="sm"
                          className={`gap-1.5 text-xs ${diffVersionId === v.id ? "border-primary/60 text-primary bg-primary/5" : ""}`}
                          onClick={() => setDiffVersionId(prev => prev === v.id ? null : v.id)}
                        >
                          <GitCompare className="w-3 h-3" />
                          {diffVersionId === v.id ? "Hide Diff" : "Diff"}
                        </Button>
                        <Button
                          variant="outline"
                          size="sm"
                          className="gap-1.5 text-xs"
                          onClick={() => {
                            handleTextChange(v.promptText);
                            toast.info(`v${v.version} loaded into editor — click Save to apply.`);
                          }}
                        >
                          <RotateCcw className="w-3 h-3" />
                          Restore
                        </Button>
                      </div>
                    )}
                  </div>
                ))}
              </div>

              {/* Diff panel — compares selected old version against current editor content */}
              {diffVersionId !== null && (() => {
                const oldVer = versionHistory.find(v => v.id === diffVersionId);
                if (!oldVer) return null;
                const latestVer = versionHistory[0];
                const label = `v${oldVer.version} → v${latestVer.version}${isDirty[activeTab] ? " (unsaved edits)" : ""}`;
                return (
                  <div className="mt-4 pt-4 border-t border-border/30">
                    <DiffView before={oldVer.promptText} after={currentText} label={label} />
                  </div>
                );
              })()}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
