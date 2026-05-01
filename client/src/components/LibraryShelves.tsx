import { useState, useMemo, useRef, useCallback } from "react";
import { trpc } from "@/lib/trpc";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Separator } from "@/components/ui/separator";
import { ScrollArea } from "@/components/ui/scroll-area";
import { toast } from "sonner";
import {
  ChevronLeft, ChevronRight, ChevronsLeft, ChevronsRight,
  ZoomIn, ZoomOut, RotateCw, Maximize2, Minimize2,
  BookOpen, FileText, AlertTriangle, CheckCircle2, Flag,
  Search, X, Loader2, ImageOff, Eye, Edit3, Upload, Plus, CheckCircle,
} from "lucide-react";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

// ─── Types ──────────────────────────────────────────────────────────────────

interface LibraryShelvesProps {
  /** "view" for Enter the Arkanum (read-only), "edit" for HITL Review */
  mode: "view" | "edit";
  /** Pre-selected document ID (optional) */
  initialDocumentId?: number;
  /** Pre-selected page ID (optional, for HITL deep-links) */
  initialPageId?: number;
  /** Callback when a HITL correction is submitted */
  onCorrectionSubmitted?: () => void;
}

// ─── Confidence Badge ───────────────────────────────────────────────────────

function ConfidenceBadge({ confidence }: { confidence: number | null | undefined }) {
  if (confidence === null || confidence === undefined) {
    return <Badge variant="outline" className="text-muted-foreground">N/A</Badge>;
  }
  const color = confidence >= 85 ? "text-green-500 border-green-500/30 bg-green-500/10"
    : confidence >= 60 ? "text-amber-500 border-amber-500/30 bg-amber-500/10"
    : "text-red-500 border-red-500/30 bg-red-500/10";
  return (
    <Badge variant="outline" className={color}>
      {confidence}% confidence
    </Badge>
  );
}

// ─── Status Badge ───────────────────────────────────────────────────────────

function StatusBadge({ status }: { status: string }) {
  const styles: Record<string, string> = {
    pending: "bg-muted text-muted-foreground",
    pass1_complete: "bg-blue-500/10 text-blue-500 border-blue-500/30",
    pass2_complete: "bg-indigo-500/10 text-indigo-500 border-indigo-500/30",
    validated: "bg-green-500/10 text-green-500 border-green-500/30",
    corrected: "bg-amber-500/10 text-amber-500 border-amber-500/30",
    failed: "bg-red-500/10 text-red-500 border-red-500/30",
    completed: "bg-green-500/10 text-green-500 border-green-500/30",
    converting: "bg-blue-500/10 text-blue-500 border-blue-500/30",
    review: "bg-amber-500/10 text-amber-500 border-amber-500/30",
  };
  return (
    <Badge variant="outline" className={styles[status] ?? "bg-muted text-muted-foreground"}>
      {status.replace(/_/g, " ")}
    </Badge>
  );
}

// ─── Upload Document Card ─────────────────────────────────────────────────

function UploadDocumentCard({ onUploaded }: { onUploaded: (id: number) => void }) {
  const [isDragOver, setIsDragOver] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [showForm, setShowForm] = useState(false);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [title, setTitle] = useState("");
  const [gameSystem, setGameSystem] = useState("");
  const [edition, setEdition] = useState("");
  const [publisher, setPublisher] = useState("");
  const fileInputRef = useRef<HTMLInputElement>(null);
  const utils = trpc.useUtils();

  const handleFile = useCallback((file: File) => {
    if (file.type !== "application/pdf") {
      toast.error("Only PDF files are accepted.");
      return;
    }
    if (file.size > 200 * 1024 * 1024) {
      toast.error("File is too large. Maximum size is 200 MB.");
      return;
    }
    // Auto-fill title from filename
    const nameWithoutExt = file.name.replace(/\.pdf$/i, "").replace(/[_-]/g, " ");
    setTitle(nameWithoutExt);
    setSelectedFile(file);
    setShowForm(true);
  }, []);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOver(false);
    const file = e.dataTransfer.files[0];
    if (file) handleFile(file);
  }, [handleFile]);

  const handleUpload = async () => {
    if (!selectedFile) return;
    setIsUploading(true);
    try {
      const formData = new FormData();
      formData.append("file", selectedFile);
      if (title.trim()) formData.append("title", title.trim());
      if (gameSystem.trim()) formData.append("gameSystem", gameSystem.trim());
      if (edition.trim()) formData.append("edition", edition.trim());
      if (publisher.trim()) formData.append("publisher", publisher.trim());

      const res = await fetch("/api/upload/document", {
        method: "POST",
        body: formData,
        credentials: "include",
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Upload failed.");

      toast.success(`"${data.filename}" registered in the library.`);
      await utils.library.listDocuments.invalidate();
      onUploaded(data.id);
      // Reset form
      setSelectedFile(null);
      setShowForm(false);
      setTitle(""); setGameSystem(""); setEdition(""); setPublisher("");
    } catch (err: any) {
      toast.error(err.message ?? "Upload failed.");
    } finally {
      setIsUploading(false);
    }
  };

  if (showForm && selectedFile) {
    return (
      <div className="p-3 rounded-lg border border-primary/30 bg-primary/5 space-y-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2 text-sm font-medium">
            <FileText className="w-4 h-4 text-primary" />
            <span className="truncate max-w-[160px]">{selectedFile.name}</span>
          </div>
          <button onClick={() => { setShowForm(false); setSelectedFile(null); }}>
            <X className="w-4 h-4 text-muted-foreground hover:text-foreground" />
          </button>
        </div>
        <div className="space-y-2">
          <Input
            placeholder="Title (optional)"
            className="h-8 text-xs bg-background/50"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
          />
          <Input
            placeholder="Game System (e.g. D&D 5e)"
            className="h-8 text-xs bg-background/50"
            value={gameSystem}
            onChange={(e) => setGameSystem(e.target.value)}
          />
          <div className="flex gap-2">
            <Input
              placeholder="Edition"
              className="h-8 text-xs bg-background/50 flex-1"
              value={edition}
              onChange={(e) => setEdition(e.target.value)}
            />
            <Input
              placeholder="Publisher"
              className="h-8 text-xs bg-background/50 flex-1"
              value={publisher}
              onChange={(e) => setPublisher(e.target.value)}
            />
          </div>
        </div>
        <Button
          size="sm"
          className="w-full h-8 gap-1.5"
          onClick={handleUpload}
          disabled={isUploading}
        >
          {isUploading ? (
            <><Loader2 className="w-3.5 h-3.5 animate-spin" /> Uploading...</>
          ) : (
            <><CheckCircle className="w-3.5 h-3.5" /> Register Document</>
          )}
        </Button>
      </div>
    );
  }

  return (
    <div
      onDragOver={(e) => { e.preventDefault(); setIsDragOver(true); }}
      onDragLeave={() => setIsDragOver(false)}
      onDrop={handleDrop}
      onClick={() => fileInputRef.current?.click()}
      className={`flex flex-col items-center justify-center gap-2 p-4 rounded-lg border-2 border-dashed cursor-pointer transition-all duration-200 ${
        isDragOver
          ? "border-primary bg-primary/10 scale-[1.01]"
          : "border-border/50 hover:border-primary/40 hover:bg-muted/20"
      }`}
    >
      <input
        ref={fileInputRef}
        type="file"
        accept=".pdf,application/pdf"
        className="hidden"
        onChange={(e) => { const f = e.target.files?.[0]; if (f) handleFile(f); }}
      />
      <Upload className={`w-6 h-6 transition-colors ${isDragOver ? "text-primary" : "text-muted-foreground/50"}`} />
      <div className="text-center">
        <p className="text-xs font-medium text-muted-foreground">Drop PDF here or click to browse</p>
        <p className="text-[10px] text-muted-foreground/60 mt-0.5">Max 200 MB</p>
      </div>
    </div>
  );
}

// ─── Document Selector ──────────────────────────────────────────────────────

function DocumentSelector({
  selectedDocId,
  onSelect,
}: {
  selectedDocId: number | null;
  onSelect: (id: number) => void;
}) {
  const [searchQuery, setSearchQuery] = useState("");
  const { data: documents, isLoading } = trpc.library.listDocuments.useQuery();

  const filtered = useMemo(() => {
    if (!documents) return [];
    if (!searchQuery.trim()) return documents;
    const q = searchQuery.toLowerCase();
    return documents.filter(
      (d) =>
        (d.title ?? "").toLowerCase().includes(q) ||
        d.filename.toLowerCase().includes(q) ||
        (d.gameSystem ?? "").toLowerCase().includes(q)
    );
  }, [documents, searchQuery]);

  return (
    <div className="space-y-3">
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
        <Input
          placeholder="Search documents..."
          className="pl-9 h-9 bg-muted/30"
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
        />
        {searchQuery && (
          <button
            className="absolute right-3 top-1/2 -translate-y-1/2"
            onClick={() => setSearchQuery("")}
          >
            <X className="w-3.5 h-3.5 text-muted-foreground hover:text-foreground" />
          </button>
        )}
      </div>

      <ScrollArea className="h-[calc(100vh-380px)]">
        {isLoading ? (
          <div className="flex items-center justify-center py-8 text-muted-foreground">
            <Loader2 className="w-5 h-5 animate-spin mr-2" />
            Loading library...
          </div>
        ) : filtered.length === 0 ? (
          <div className="text-center py-8 text-muted-foreground">
            <BookOpen className="w-8 h-8 mx-auto mb-2 opacity-40" />
            <p className="text-sm">
              {documents?.length === 0
                ? "The library shelves are empty. Documents will appear here once the ingestion pipeline processes PDFs."
                : "No documents match your search."}
            </p>
          </div>
        ) : (
          <div className="space-y-1.5">
            {filtered.map((doc) => (
              <button
                key={doc.id}
                onClick={() => onSelect(doc.id)}
                className={`w-full text-left p-3 rounded-lg border transition-all duration-200 ${
                  selectedDocId === doc.id
                    ? "bg-primary/10 border-primary/40 shadow-[0_0_8px_rgba(139,92,246,0.15)]"
                    : "bg-card/50 border-border/50 hover:bg-card/80 hover:border-border"
                }`}
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="flex-1 min-w-0">
                    <p className="font-medium text-sm truncate">
                      {doc.title ?? doc.filename}
                    </p>
                    {doc.title && (
                      <p className="text-xs text-muted-foreground truncate mt-0.5">
                        {doc.filename}
                      </p>
                    )}
                    <div className="flex items-center gap-2 mt-1.5">
                      {doc.gameSystem && (
                        <span className="text-xs px-1.5 py-0.5 rounded bg-secondary/50 text-secondary-foreground">
                          {doc.gameSystem}
                          {doc.edition ? ` ${doc.edition}` : ""}
                        </span>
                      )}
                      <span className="text-xs text-muted-foreground">
                        {doc.totalPages} pg
                      </span>
                    </div>
                  </div>
                  <div className="flex flex-col items-end gap-1">
                    <StatusBadge status={doc.status} />
                    {doc.flaggedPages > 0 && (
                      <span className="text-xs text-amber-500 flex items-center gap-1">
                        <AlertTriangle className="w-3 h-3" />
                        {doc.flaggedPages}
                      </span>
                    )}
                  </div>
                </div>
              </button>
            ))}
          </div>
        )}
      </ScrollArea>
    </div>
  );
}

// ─── Page Thumbnail Strip ───────────────────────────────────────────────────

function PageThumbnailStrip({
  pages,
  currentPageId,
  onSelectPage,
}: {
  pages: any[];
  currentPageId: number | null;
  onSelectPage: (pageId: number) => void;
}) {
  return (
    <ScrollArea className="w-full">
      <div className="flex gap-2 pb-2">
        {pages.map((page) => (
          <button
            key={page.id}
            onClick={() => onSelectPage(page.id)}
            className={`relative flex-shrink-0 w-16 h-20 rounded border-2 overflow-hidden transition-all ${
              currentPageId === page.id
                ? "border-primary shadow-[0_0_6px_rgba(139,92,246,0.3)]"
                : "border-border/50 hover:border-border opacity-70 hover:opacity-100"
            }`}
            title={`Page ${page.pageNumber}`}
          >
            {page.thumbnailUrl ? (
              <img
                src={page.thumbnailUrl}
                alt={`Page ${page.pageNumber}`}
                className="w-full h-full object-cover"
              />
            ) : (
              <div className="w-full h-full flex items-center justify-center bg-muted/30">
                <FileText className="w-5 h-5 text-muted-foreground/50" />
              </div>
            )}
            <span className="absolute bottom-0 left-0 right-0 bg-black/60 text-white text-[10px] text-center py-0.5">
              {page.pageNumber}
            </span>
            {page.isFlagged && (
              <span className="absolute top-0.5 right-0.5">
                <Flag className="w-3 h-3 text-amber-500" />
              </span>
            )}
          </button>
        ))}
      </div>
    </ScrollArea>
  );
}

// ─── Image Viewer ───────────────────────────────────────────────────────────

function ImageViewer({ imageUrl, pageNumber }: { imageUrl: string | null | undefined; pageNumber: number }) {
  const [zoom, setZoom] = useState(1);
  const [rotation, setRotation] = useState(0);
  const [isFullscreen, setIsFullscreen] = useState(false);

  const handleZoomIn = () => setZoom((z) => Math.min(z + 0.25, 4));
  const handleZoomOut = () => setZoom((z) => Math.max(z - 0.25, 0.25));
  const handleRotate = () => setRotation((r) => (r + 90) % 360);
  const handleReset = () => { setZoom(1); setRotation(0); };

  if (!imageUrl) {
    return (
      <div className="flex flex-col items-center justify-center h-full bg-muted/10 rounded-lg border border-dashed border-border/50">
        <ImageOff className="w-12 h-12 text-muted-foreground/30 mb-3" />
        <p className="text-sm text-muted-foreground">No image available for page {pageNumber}</p>
        <p className="text-xs text-muted-foreground/60 mt-1">
          The page image will appear here once the ingestion pipeline processes it.
        </p>
      </div>
    );
  }

  const containerClass = isFullscreen
    ? "fixed inset-0 z-50 bg-background/95 backdrop-blur-sm flex flex-col"
    : "flex flex-col h-full";

  return (
    <div className={containerClass}>
      {/* Toolbar */}
      <div className="flex items-center justify-between px-3 py-2 border-b border-border/50 bg-card/50 flex-shrink-0">
        <span className="text-xs font-mono text-muted-foreground">
          Page {pageNumber} &middot; {Math.round(zoom * 100)}%
        </span>
        <div className="flex items-center gap-1">
          <Button variant="ghost" size="icon" className="h-7 w-7" onClick={handleZoomOut} title="Zoom out">
            <ZoomOut className="w-3.5 h-3.5" />
          </Button>
          <Button variant="ghost" size="icon" className="h-7 w-7" onClick={handleZoomIn} title="Zoom in">
            <ZoomIn className="w-3.5 h-3.5" />
          </Button>
          <Button variant="ghost" size="icon" className="h-7 w-7" onClick={handleRotate} title="Rotate">
            <RotateCw className="w-3.5 h-3.5" />
          </Button>
          <Separator orientation="vertical" className="h-4 mx-1" />
          <Button
            variant="ghost"
            size="icon"
            className="h-7 w-7"
            onClick={() => setIsFullscreen((f) => !f)}
            title={isFullscreen ? "Exit fullscreen" : "Fullscreen"}
          >
            {isFullscreen ? <Minimize2 className="w-3.5 h-3.5" /> : <Maximize2 className="w-3.5 h-3.5" />}
          </Button>
          {(zoom !== 1 || rotation !== 0) && (
            <Button variant="ghost" size="sm" className="h-7 text-xs" onClick={handleReset}>
              Reset
            </Button>
          )}
        </div>
      </div>

      {/* Image */}
      <div className="flex-1 overflow-auto bg-muted/5 flex items-center justify-center p-4">
        <img
          src={imageUrl}
          alt={`Page ${pageNumber}`}
          className="max-w-full transition-transform duration-200 shadow-lg rounded"
          style={{
            transform: `scale(${zoom}) rotate(${rotation}deg)`,
            transformOrigin: "center center",
          }}
          draggable={false}
        />
      </div>
    </div>
  );
}

// ─── OCR Data Panel ─────────────────────────────────────────────────────────

function OcrDataPanel({
  ocrResult,
  mode,
  onSubmitCorrection,
  isSubmitting,
}: {
  ocrResult: any | null;
  mode: "view" | "edit";
  onSubmitCorrection?: (data: { correctedText: string; correctedStructuredData?: Record<string, unknown> }) => void;
  isSubmitting?: boolean;
}) {
  const [editedText, setEditedText] = useState("");
  const [isEditing, setIsEditing] = useState(false);

  const displayText = ocrResult?.correctedText ?? ocrResult?.rawText ?? "";
  const structuredData = ocrResult?.correctedStructuredData ?? ocrResult?.structuredData;

  const handleStartEditing = () => {
    setEditedText(displayText);
    setIsEditing(true);
  };

  const handleSubmit = () => {
    if (onSubmitCorrection) {
      onSubmitCorrection({ correctedText: editedText });
    }
    setIsEditing(false);
  };

  if (!ocrResult) {
    return (
      <div className="flex flex-col items-center justify-center h-full text-muted-foreground">
        <FileText className="w-10 h-10 opacity-30 mb-3" />
        <p className="text-sm">No OCR data available for this page.</p>
        <p className="text-xs opacity-60 mt-1">
          OCR results will appear here after the pipeline processes this page.
        </p>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="flex items-center justify-between px-3 py-2 border-b border-border/50 bg-card/50 flex-shrink-0">
        <div className="flex items-center gap-2">
          <StatusBadge status={ocrResult.status} />
          <ConfidenceBadge confidence={ocrResult.confidence} />
        </div>
        {mode === "edit" && !isEditing && (
          <Button variant="outline" size="sm" className="h-7 gap-1.5 text-xs" onClick={handleStartEditing}>
            <Edit3 className="w-3 h-3" />
            Edit Text
          </Button>
        )}
      </div>

      {/* Content */}
      <ScrollArea className="flex-1">
        <div className="p-4 space-y-4">
          {/* Model info */}
          {(ocrResult.pass1Model || ocrResult.pass2Model) && (
            <div className="flex flex-wrap gap-2 text-xs">
              {ocrResult.pass1Model && (
                <span className="px-2 py-1 rounded bg-muted/30 border border-border/50">
                  Pass 1: {ocrResult.pass1Model}
                </span>
              )}
              {ocrResult.pass2Model && (
                <span className="px-2 py-1 rounded bg-muted/30 border border-border/50">
                  Pass 2: {ocrResult.pass2Model}
                </span>
              )}
            </div>
          )}

          {/* Raw / Corrected Text */}
          <div>
            <h4 className="text-sm font-semibold mb-2 flex items-center gap-2">
              {ocrResult.correctedText ? (
                <>
                  <CheckCircle2 className="w-4 h-4 text-green-500" />
                  Corrected Text
                </>
              ) : (
                <>
                  <FileText className="w-4 h-4 text-muted-foreground" />
                  Extracted Text
                </>
              )}
            </h4>
            {isEditing ? (
              <div className="space-y-2">
                <Textarea
                  value={editedText}
                  onChange={(e) => setEditedText(e.target.value)}
                  className="min-h-[300px] font-mono text-sm bg-muted/20"
                  placeholder="Edit the extracted text..."
                />
                <div className="flex gap-2">
                  <Button
                    size="sm"
                    onClick={handleSubmit}
                    disabled={isSubmitting}
                    className="gap-1.5"
                  >
                    {isSubmitting ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <CheckCircle2 className="w-3.5 h-3.5" />}
                    Save Correction
                  </Button>
                  <Button variant="outline" size="sm" onClick={() => setIsEditing(false)}>
                    Cancel
                  </Button>
                </div>
              </div>
            ) : (
              <div className="p-3 rounded-lg bg-muted/10 border border-border/50 whitespace-pre-wrap font-mono text-sm leading-relaxed max-h-[400px] overflow-y-auto">
                {displayText || <span className="text-muted-foreground italic">No text extracted</span>}
              </div>
            )}
          </div>

          {/* Structured Data */}
          {structuredData && Object.keys(structuredData).length > 0 && (
            <div>
              <h4 className="text-sm font-semibold mb-2 flex items-center gap-2">
                <Eye className="w-4 h-4 text-muted-foreground" />
                Structured Data
              </h4>
              <div className="p-3 rounded-lg bg-muted/10 border border-border/50 overflow-x-auto">
                <pre className="text-xs font-mono whitespace-pre-wrap">
                  {JSON.stringify(structuredData, null, 2)}
                </pre>
              </div>
            </div>
          )}

          {/* Layout Metadata */}
          {ocrResult.layoutMetadata && Object.keys(ocrResult.layoutMetadata).length > 0 && (
            <div>
              <h4 className="text-sm font-semibold mb-2 text-muted-foreground">Layout Metadata</h4>
              <div className="p-3 rounded-lg bg-muted/10 border border-border/50 overflow-x-auto">
                <pre className="text-xs font-mono whitespace-pre-wrap text-muted-foreground">
                  {JSON.stringify(ocrResult.layoutMetadata, null, 2)}
                </pre>
              </div>
            </div>
          )}

          {/* Audit Log */}
          {ocrResult.auditLog && ocrResult.auditLog.length > 0 && (
            <div>
              <h4 className="text-sm font-semibold mb-2 text-muted-foreground">Audit Log</h4>
              <div className="space-y-1">
                {ocrResult.auditLog.map((entry: any, i: number) => (
                  <div key={i} className="text-xs flex items-start gap-2 p-2 rounded bg-muted/10 border border-border/30">
                    <span className="text-muted-foreground font-mono flex-shrink-0">{entry.timestamp}</span>
                    <span className="font-medium">{entry.action}</span>
                    {entry.model && <span className="text-muted-foreground">({entry.model})</span>}
                    {entry.detail && <span className="text-muted-foreground">{entry.detail}</span>}
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </ScrollArea>
    </div>
  );
}

// ─── Main Component ─────────────────────────────────────────────────────────

export default function LibraryShelves({
  mode,
  initialDocumentId,
  initialPageId,
  onCorrectionSubmitted,
}: LibraryShelvesProps) {
  const [selectedDocId, setSelectedDocId] = useState<number | null>(initialDocumentId ?? null);
  const [selectedPageId, setSelectedPageId] = useState<number | null>(initialPageId ?? null);
  const [showDocList, setShowDocList] = useState(!initialDocumentId);

  // Fetch pages for selected document
  const { data: pages } = trpc.library.getPages.useQuery(
    { documentId: selectedDocId! },
    { enabled: !!selectedDocId }
  );

  // Fetch page + OCR data for selected page
  const { data: pageData, isLoading: pageLoading } = trpc.library.getPageWithOcr.useQuery(
    { pageId: selectedPageId! },
    { enabled: !!selectedPageId }
  );

  // Fetch document info
  const { data: document } = trpc.library.getDocument.useQuery(
    { id: selectedDocId! },
    { enabled: !!selectedDocId }
  );

  const utils = trpc.useUtils();

  // HITL correction mutation
  const resolveMutation = trpc.hitl.resolve.useMutation({
    onSuccess: () => {
      utils.library.getPageWithOcr.invalidate();
      onCorrectionSubmitted?.();
    },
  });

  // Handle document selection
  const handleSelectDocument = (docId: number) => {
    setSelectedDocId(docId);
    setSelectedPageId(null);
    setShowDocList(false);
  };

  // Handle page navigation
  const currentPageIndex = pages?.findIndex((p) => p.id === selectedPageId) ?? -1;
  const totalPages = pages?.length ?? 0;

  const goToPage = (index: number) => {
    if (pages && index >= 0 && index < pages.length) {
      setSelectedPageId(pages[index].id);
    }
  };

  // Auto-select first page when pages load
  if (pages && pages.length > 0 && !selectedPageId) {
    setSelectedPageId(pages[0].id);
  }

  return (
    <div className="flex flex-col h-[calc(100vh-200px)] gap-3">
      {/* Top Bar: Document info + navigation */}
      <div className="flex items-center justify-between gap-4 flex-shrink-0">
        <div className="flex items-center gap-3 min-w-0">
          <Button
            variant="outline"
            size="sm"
            className="gap-1.5 flex-shrink-0"
            onClick={() => setShowDocList((s) => !s)}
          >
            <BookOpen className="w-4 h-4" />
            {showDocList ? "Hide Library" : "Browse Library"}
          </Button>
          {document && (
            <div className="min-w-0">
              <p className="font-semibold text-sm truncate">{document.title ?? document.filename}</p>
              <div className="flex items-center gap-2 text-xs text-muted-foreground">
                {document.gameSystem && <span>{document.gameSystem} {document.edition ?? ""}</span>}
                <span>{document.totalPages} pages</span>
                <StatusBadge status={document.status} />
              </div>
            </div>
          )}
        </div>

        {/* Page Navigation */}
        {pages && pages.length > 0 && (
          <div className="flex items-center gap-1.5 flex-shrink-0">
            <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => goToPage(0)} disabled={currentPageIndex <= 0}>
              <ChevronsLeft className="w-4 h-4" />
            </Button>
            <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => goToPage(currentPageIndex - 1)} disabled={currentPageIndex <= 0}>
              <ChevronLeft className="w-4 h-4" />
            </Button>
            <div className="flex items-center gap-1.5">
              <Select
                value={selectedPageId?.toString() ?? ""}
                onValueChange={(v) => setSelectedPageId(Number(v))}
              >
                <SelectTrigger className="h-8 w-24 text-xs">
                  <SelectValue placeholder="Page" />
                </SelectTrigger>
                <SelectContent>
                  {pages.map((p) => (
                    <SelectItem key={p.id} value={p.id.toString()}>
                      Page {p.pageNumber}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <span className="text-xs text-muted-foreground">of {totalPages}</span>
            </div>
            <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => goToPage(currentPageIndex + 1)} disabled={currentPageIndex >= totalPages - 1}>
              <ChevronRight className="w-4 h-4" />
            </Button>
            <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => goToPage(totalPages - 1)} disabled={currentPageIndex >= totalPages - 1}>
              <ChevronsRight className="w-4 h-4" />
            </Button>
          </div>
        )}
      </div>

      {/* Thumbnail Strip */}
      {pages && pages.length > 0 && (
        <PageThumbnailStrip
          pages={pages}
          currentPageId={selectedPageId}
          onSelectPage={setSelectedPageId}
        />
      )}

      {/* Main Content: Split Pane */}
      <div className="flex-1 flex gap-3 overflow-hidden">
        {/* Document List (collapsible) */}
        {showDocList && (
          <Card className="w-72 flex-shrink-0 bg-card/50 backdrop-blur-sm border-border/50">
            <CardHeader className="pb-2 pt-3 px-3">
              <CardTitle className="text-sm flex items-center gap-2">
                <BookOpen className="w-4 h-4 text-primary" />
                Library Shelves
              </CardTitle>
            </CardHeader>
            <CardContent className="px-3 pb-3 space-y-3">
              <UploadDocumentCard onUploaded={handleSelectDocument} />
              <Separator className="opacity-30" />
              <DocumentSelector
                selectedDocId={selectedDocId}
                onSelect={handleSelectDocument}
              />
            </CardContent>
          </Card>
        )}

        {/* Image Viewer (left pane) */}
        <div className="flex-1 rounded-lg border border-border/50 overflow-hidden bg-card/30">
          {selectedPageId && pageData ? (
            <ImageViewer
              imageUrl={pageData.page.imageUrl}
              pageNumber={pageData.page.pageNumber}
            />
          ) : selectedDocId ? (
            <div className="flex flex-col items-center justify-center h-full text-muted-foreground">
              <FileText className="w-10 h-10 opacity-30 mb-3" />
              <p className="text-sm">Select a page to view</p>
            </div>
          ) : (
            <div className="flex flex-col items-center justify-center h-full text-muted-foreground">
              <BookOpen className="w-12 h-12 opacity-20 mb-3" />
              <p className="text-sm">Select a document from the library to begin browsing</p>
              {!showDocList && (
                <Button variant="outline" size="sm" className="mt-3 gap-1.5" onClick={() => setShowDocList(true)}>
                  <BookOpen className="w-4 h-4" />
                  Open Library
                </Button>
              )}
            </div>
          )}
        </div>

        {/* OCR Data Panel (right pane) */}
        <div className="w-[420px] flex-shrink-0 rounded-lg border border-border/50 overflow-hidden bg-card/30">
          {pageLoading ? (
            <div className="flex items-center justify-center h-full">
              <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
            </div>
          ) : (
            <OcrDataPanel
              ocrResult={pageData?.ocrResult ?? null}
              mode={mode}
              isSubmitting={resolveMutation.isPending}
              onSubmitCorrection={
                mode === "edit"
                  ? (data) => {
                      // For HITL mode, we need the hitl item ID — this is handled by the parent
                      // For now, just update the OCR result directly
                      if (pageData?.ocrResult) {
                        resolveMutation.mutate({
                          id: 0, // Will be overridden by parent
                          correctedText: data.correctedText,
                          correctedStructuredData: data.correctedStructuredData,
                        });
                      }
                    }
                  : undefined
              }
            />
          )}
        </div>
      </div>
    </div>
  );
}
