import { useState, useMemo } from "react";
import { trpc } from "@/lib/trpc";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import { AlertTriangle, BookOpen, FileText } from "lucide-react";

// ── Thresholds (must match runner.ts NATIVE_SIMILARITY_THRESHOLD) ─────────────
const SIM_HIGH = 0.90;
const SIM_OK   = 0.75;

// ── Types ─────────────────────────────────────────────────────────────────────

type QualityPage = {
  pageId:           number;
  pageNumber:       number;
  printedPageLabel: string | null;
  layoutType:       string | null;
  hasEmbeddedText:  boolean;
  nativeText:       string | null;
  contentRegions:   Array<{ type?: string }>;
  isFlagged:        boolean;
  ocrConfidence:    number | null;
  nativeSimilarity: number | null;
  rawText:          string | null;
  normalisedText:   string | null;
  markdownText:     string | null;
};

// ── Small indicator components ────────────────────────────────────────────────

function SimilarityBadge({ sim }: { sim: number | null }) {
  if (sim === null) {
    return <Badge variant="outline" className="text-xs text-muted-foreground">no baseline</Badge>;
  }
  const pct = Math.round(sim * 100);
  if (sim >= SIM_HIGH) return <Badge className="text-xs bg-green-700 hover:bg-green-700">{pct}%</Badge>;
  if (sim >= SIM_OK)   return <Badge className="text-xs bg-yellow-600 hover:bg-yellow-600">{pct}%</Badge>;
  if (sim >= 0.5)      return <Badge className="text-xs bg-orange-600 hover:bg-orange-600">{pct}%</Badge>;
  return                      <Badge className="text-xs bg-red-700 hover:bg-red-700">{pct}%</Badge>;
}

function ConfBadge({ confidence }: { confidence: number | null }) {
  if (confidence === null) {
    return <Badge variant="outline" className="text-xs text-muted-foreground">—</Badge>;
  }
  const cls = confidence >= 85 ? "text-green-500" : confidence >= 70 ? "text-yellow-500" : "text-red-500";
  return <Badge variant="outline" className={`text-xs ${cls}`}>{confidence}%</Badge>;
}

// ── Main page ─────────────────────────────────────────────────────────────────

export default function TheScrivenersLens() {
  const [documentId, setDocumentId]     = useState<number | null>(null);
  const [selectedPageId, setSelectedId] = useState<number | null>(null);
  const [layoutFilter, setLayoutFilter] = useState("all");
  const [qualityFilter, setQFilter]     = useState("all");

  const { data: documents = [] } = trpc.library.listDocuments.useQuery({});
  const { data: pages = [], isLoading } = trpc.library.textQuality.useQuery(
    { documentId: documentId! },
    { enabled: documentId !== null },
  );

  // Distinct layout types present in this document
  const layoutTypes = useMemo(() => {
    const seen: Record<string, boolean> = {};
    const out: string[] = [];
    for (const p of pages) {
      if (p.layoutType && !seen[p.layoutType]) { seen[p.layoutType] = true; out.push(p.layoutType); }
    }
    return out.sort();
  }, [pages]);

  const filtered = useMemo((): QualityPage[] => {
    return (pages as QualityPage[])
      .filter(p => {
        if (layoutFilter !== "all" && p.layoutType !== layoutFilter) return false;
        if (qualityFilter === "low_sim"   && (p.nativeSimilarity === null || p.nativeSimilarity >= SIM_OK)) return false;
        if (qualityFilter === "no_native" && p.hasEmbeddedText) return false;
        if (qualityFilter === "flagged"   && !p.isFlagged) return false;
        return true;
      })
      .sort((a, b) => {
        // Float low-similarity pages to the top when that filter is active
        if (qualityFilter === "low_sim") {
          const sa = a.nativeSimilarity ?? 1;
          const sb = b.nativeSimilarity ?? 1;
          if (sa !== sb) return sa - sb;
        }
        return a.pageNumber - b.pageNumber;
      });
  }, [pages, layoutFilter, qualityFilter]);

  const selected = useMemo(
    () => (pages as QualityPage[]).find(p => p.pageId === selectedPageId) ?? null,
    [pages, selectedPageId],
  );

  // Summary stats across all pages in the document
  const stats = useMemo(() => {
    const withSim  = (pages as QualityPage[]).filter(p => p.nativeSimilarity !== null);
    const withConf = (pages as QualityPage[]).filter(p => p.ocrConfidence !== null);
    return {
      total:      pages.length,
      withNative: (pages as QualityPage[]).filter(p => p.hasEmbeddedText).length,
      lowSim:     (pages as QualityPage[]).filter(p => p.nativeSimilarity !== null && p.nativeSimilarity < SIM_OK).length,
      flagged:    (pages as QualityPage[]).filter(p => p.isFlagged).length,
      avgSim:     withSim.length  > 0 ? Math.round(withSim.reduce( (s, p) => s + (p.nativeSimilarity ?? 0), 0) / withSim.length  * 100) : null,
      avgConf:    withConf.length > 0 ? Math.round(withConf.reduce((s, p) => s + (p.ocrConfidence    ?? 0), 0) / withConf.length       ) : null,
    };
  }, [pages]);

  // ── Region type chips for the detail header ─────────────────────────────────
  function regionTypes(p: QualityPage): string[] {
    const seen: Record<string, boolean> = {};
    const out: string[] = [];
    for (const r of p.contentRegions) {
      const t = (r as any).type as string | undefined;
      if (t && !seen[t]) { seen[t] = true; out.push(t); }
    }
    return out;
  }

  // ── Render ──────────────────────────────────────────────────────────────────
  return (
    <div className="flex flex-col h-[calc(100vh-4rem)] gap-4 p-4 overflow-hidden">

      {/* ── Header row ─────────────────────────────────────────────────────── */}
      <div className="flex items-center justify-between flex-shrink-0">
        <div>
          <h1 className="text-2xl font-bold">The Scrivener's Lens</h1>
          <p className="text-sm text-muted-foreground">
            Inspect extracted text quality before chunking and embedding
          </p>
        </div>
        <Select
          value={documentId?.toString() ?? ""}
          onValueChange={v => { setDocumentId(Number(v)); setSelectedId(null); }}
        >
          <SelectTrigger className="w-80">
            <SelectValue placeholder="Select a document…" />
          </SelectTrigger>
          <SelectContent>
            {documents.map((d: any) => (
              <SelectItem key={d.id} value={String(d.id)}>
                {d.title ?? d.filename}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {/* ── Summary stats ──────────────────────────────────────────────────── */}
      {documentId !== null && !isLoading && pages.length > 0 && (
        <div className="grid grid-cols-4 gap-3 flex-shrink-0">
          <Card className="p-3">
            <p className="text-xs text-muted-foreground mb-1">Total pages</p>
            <p className="text-2xl font-bold">{stats.total}</p>
          </Card>
          <Card className="p-3">
            <p className="text-xs text-muted-foreground mb-1">With native text</p>
            <p className="text-2xl font-bold">
              {stats.withNative}
              <span className="text-sm text-muted-foreground ml-1">/ {stats.total}</span>
            </p>
          </Card>
          <Card className="p-3">
            <p className="text-xs text-muted-foreground mb-1">Avg similarity / confidence</p>
            <p className="text-2xl font-bold">
              {stats.avgSim !== null ? `${stats.avgSim}%` : "—"}
              <span className="text-sm text-muted-foreground mx-1">/</span>
              {stats.avgConf !== null ? `${stats.avgConf}%` : "—"}
            </p>
          </Card>
          <Card className="p-3">
            <p className="text-xs text-muted-foreground mb-1">Below threshold / Flagged</p>
            <p className="text-2xl font-bold">
              <span className={stats.lowSim > 0 ? "text-red-500" : ""}>{stats.lowSim}</span>
              <span className="text-sm text-muted-foreground mx-1">/</span>
              <span className={stats.flagged > 0 ? "text-yellow-500" : ""}>{stats.flagged}</span>
            </p>
          </Card>
        </div>
      )}

      {/* ── Main content: list + detail ─────────────────────────────────────── */}
      {documentId !== null ? (
        <div className="flex gap-4 flex-1 min-h-0">

          {/* ── Left: page list ──────────────────────────────────────────── */}
          <div className="w-72 flex-shrink-0 flex flex-col gap-2">
            {/* Filters */}
            <div className="flex gap-2">
              <Select value={layoutFilter} onValueChange={setLayoutFilter}>
                <SelectTrigger className="flex-1 h-8 text-xs">
                  <SelectValue placeholder="Layout" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All layouts</SelectItem>
                  {layoutTypes.map(t => (
                    <SelectItem key={t} value={t}>{t}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Select value={qualityFilter} onValueChange={v => { setQFilter(v); setSelectedId(null); }}>
                <SelectTrigger className="flex-1 h-8 text-xs">
                  <SelectValue placeholder="Show" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All pages</SelectItem>
                  <SelectItem value="low_sim">Low similarity</SelectItem>
                  <SelectItem value="no_native">No native text</SelectItem>
                  <SelectItem value="flagged">HITL flagged</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {/* Page rows */}
            <ScrollArea className="flex-1 border rounded-md">
              {isLoading ? (
                <div className="p-4 text-sm text-muted-foreground">Loading pages…</div>
              ) : filtered.length === 0 ? (
                <div className="p-4 text-sm text-muted-foreground">No pages match these filters.</div>
              ) : (
                <div className="divide-y">
                  {filtered.map(p => (
                    <button
                      key={p.pageId}
                      onClick={() => setSelectedId(p.pageId)}
                      className={`w-full text-left px-3 py-2 text-sm hover:bg-accent transition-colors ${
                        selectedPageId === p.pageId ? "bg-accent" : ""
                      }`}
                    >
                      <div className="flex items-center justify-between mb-0.5">
                        <span className="font-medium">
                          p.{p.printedPageLabel ?? p.pageNumber}
                          {p.printedPageLabel && (
                            <span className="text-muted-foreground ml-1 text-xs">#{p.pageNumber}</span>
                          )}
                        </span>
                        <div className="flex gap-1 items-center">
                          {p.isFlagged && <AlertTriangle className="h-3 w-3 text-yellow-500" />}
                          <SimilarityBadge sim={p.nativeSimilarity} />
                        </div>
                      </div>
                      <div className="flex items-center gap-1 text-xs text-muted-foreground">
                        <span className="truncate">{p.layoutType ?? "unknown"}</span>
                        <span>·</span>
                        <ConfBadge confidence={p.ocrConfidence} />
                      </div>
                    </button>
                  ))}
                </div>
              )}
            </ScrollArea>
          </div>

          {/* ── Right: detail panel ──────────────────────────────────────── */}
          {selected ? (
            <Card className="flex-1 flex flex-col min-h-0 min-w-0">
              <CardHeader className="pb-2 flex-shrink-0">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <CardTitle className="text-base">
                    Page {selected.printedPageLabel ?? selected.pageNumber}
                    {selected.printedPageLabel && (
                      <span className="text-sm text-muted-foreground font-normal ml-2">
                        (PDF page {selected.pageNumber})
                      </span>
                    )}
                  </CardTitle>
                  <div className="flex flex-wrap items-center gap-2 text-xs">
                    {selected.isFlagged && (
                      <Badge variant="destructive">HITL Flagged</Badge>
                    )}
                    <Badge variant="outline">{selected.layoutType ?? "unknown layout"}</Badge>
                    <span className="text-muted-foreground">Confidence:</span>
                    <ConfBadge confidence={selected.ocrConfidence} />
                    {selected.hasEmbeddedText && (
                      <>
                        <span className="text-muted-foreground">Similarity:</span>
                        <SimilarityBadge sim={selected.nativeSimilarity} />
                      </>
                    )}
                  </div>
                </div>
                {/* Region type chips */}
                {regionTypes(selected).length > 0 && (
                  <div className="flex flex-wrap gap-1 mt-1">
                    {regionTypes(selected).map(t => (
                      <Badge key={t} variant="secondary" className="text-xs">{t}</Badge>
                    ))}
                  </div>
                )}
              </CardHeader>
              <Separator />
              <CardContent className="flex-1 min-h-0 p-0">
                <Tabs defaultValue="normalised" className="flex flex-col h-full">
                  <TabsList className="mx-4 mt-3 flex-shrink-0 w-fit">
                    <TabsTrigger value="normalised">Normalised</TabsTrigger>
                    <TabsTrigger value="raw">Raw</TabsTrigger>
                    <TabsTrigger value="markdown">Markdown</TabsTrigger>
                    {selected.hasEmbeddedText && (
                      <TabsTrigger value="native">Native PDF</TabsTrigger>
                    )}
                  </TabsList>
                  <div className="flex-1 min-h-0 mx-4 mb-4 mt-2">
                    <TabsContent value="normalised" className="h-full m-0">
                      <ScrollArea className="h-full border rounded-md">
                        <pre className="text-xs font-mono whitespace-pre-wrap p-3 leading-relaxed">
                          {selected.normalisedText ?? "(no normalised text — page may not have been processed yet)"}
                        </pre>
                      </ScrollArea>
                    </TabsContent>
                    <TabsContent value="raw" className="h-full m-0">
                      <ScrollArea className="h-full border rounded-md">
                        <pre className="text-xs font-mono whitespace-pre-wrap p-3 leading-relaxed">
                          {selected.rawText ?? "(no raw text)"}
                        </pre>
                      </ScrollArea>
                    </TabsContent>
                    <TabsContent value="markdown" className="h-full m-0">
                      <ScrollArea className="h-full border rounded-md">
                        <pre className="text-xs font-mono whitespace-pre-wrap p-3 leading-relaxed">
                          {selected.markdownText ?? "(no markdown text)"}
                        </pre>
                      </ScrollArea>
                    </TabsContent>
                    {selected.hasEmbeddedText && (
                      <TabsContent value="native" className="h-full m-0">
                        <ScrollArea className="h-full border rounded-md">
                          <pre className="text-xs font-mono whitespace-pre-wrap p-3 leading-relaxed">
                            {selected.nativeText ?? "(native text not stored for this page)"}
                          </pre>
                        </ScrollArea>
                      </TabsContent>
                    )}
                  </div>
                </Tabs>
              </CardContent>
            </Card>
          ) : (
            <div className="flex-1 flex items-center justify-center text-muted-foreground border rounded-lg">
              <div className="text-center">
                <BookOpen className="h-12 w-12 mx-auto mb-3 opacity-30" />
                <p>Select a page from the list to inspect its extracted text</p>
              </div>
            </div>
          )}
        </div>
      ) : (
        /* No document selected yet */
        <div className="flex-1 flex items-center justify-center text-muted-foreground">
          <div className="text-center">
            <FileText className="h-16 w-16 mx-auto mb-4 opacity-30" />
            <p className="text-lg">Select a document to begin inspection</p>
            <p className="text-sm mt-1 text-muted-foreground">
              Compare raw OCR output, normalised text, and native PDF content side by side
            </p>
          </div>
        </div>
      )}
    </div>
  );
}
