import { useState, useMemo } from "react";
import { trpc } from "@/lib/trpc";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { toast } from "sonner";
import {
  ScrollText, ChevronRight, ChevronDown, Check, Edit, Loader2,
  BookOpen, Layers, RefreshCw,
} from "lucide-react";

// ── Types ─────────────────────────────────────────────────────────────────────

type SummaryRecord = {
  id: number;
  documentId: number;
  levelType: string;
  headingText: string | null;
  startPageId: number;
  endPageId: number | null;
  startPageNumber: number;
  endPageNumber: number | null;
  shortSummary: string | null;
  longSummary: string | null;
  keyTerms: string[] | null;
  keyEntities: string[] | null;
  parentId: number | null;
  summaryStatus: string;
  embeddingStatus: string;
  createdAt: Date;
  updatedAt: Date;
};

type TreeNode = SummaryRecord & { children: TreeNode[] };

// ── Tree builder ──────────────────────────────────────────────────────────────

function buildTree(records: SummaryRecord[]): TreeNode[] {
  const byId = new Map<number, TreeNode>(
    records.map(r => [r.id, { ...r, children: [] }]),
  );
  const roots: TreeNode[] = [];
  for (const node of Array.from(byId.values())) {
    if (node.parentId !== null && byId.has(node.parentId)) {
      byId.get(node.parentId)!.children.push(node);
    } else {
      roots.push(node);
    }
  }
  const sort = (nodes: TreeNode[]) => {
    nodes.sort((a, b) => a.startPageNumber - b.startPageNumber);
    for (const n of nodes) sort(n.children);
  };
  sort(roots);
  return roots;
}

// ── Status badge ──────────────────────────────────────────────────────────────

const STATUS_STYLES: Record<string, string> = {
  pending:    "bg-gray-500/20 text-gray-400 border-gray-500/30",
  generating: "bg-blue-500/20 text-blue-400 border-blue-500/30",
  generated:  "bg-amber-500/20 text-amber-400 border-amber-500/30",
  approved:   "bg-green-500/20 text-green-400 border-green-500/30",
  failed:     "bg-red-500/20 text-red-400 border-red-500/30",
};

function StatusBadge({ status }: { status: string }) {
  return (
    <span className={`text-[10px] font-mono px-1.5 py-0.5 rounded border ${STATUS_STYLES[status] ?? STATUS_STYLES.pending}`}>
      {status}
    </span>
  );
}

// ── Level badge ───────────────────────────────────────────────────────────────

const LEVEL_STYLES: Record<string, string> = {
  chapter:    "bg-purple-500/20 text-purple-300 border-purple-500/30",
  section:    "bg-indigo-500/20 text-indigo-300 border-indigo-500/30",
  subsection: "bg-sky-500/20 text-sky-300 border-sky-500/30",
  page:       "bg-slate-500/20 text-slate-300 border-slate-500/30",
};

function LevelBadge({ level }: { level: string }) {
  return (
    <span className={`text-[10px] font-mono px-1.5 py-0.5 rounded border ${LEVEL_STYLES[level] ?? "bg-gray-500/20 text-gray-400 border-gray-500/30"}`}>
      {level}
    </span>
  );
}

// ── Edit dialog ───────────────────────────────────────────────────────────────

const SUMMARY_STATUSES = ["pending", "generating", "generated", "approved", "failed"] as const;

function EditDialog({
  node,
  open,
  onClose,
}: {
  node: SummaryRecord;
  open: boolean;
  onClose: () => void;
}) {
  const [shortSummary, setShortSummary] = useState(node.shortSummary ?? "");
  const [longSummary, setLongSummary] = useState(node.longSummary ?? "");
  const [keyTerms, setKeyTerms] = useState((node.keyTerms ?? []).join(", "));
  const [keyEntities, setKeyEntities] = useState((node.keyEntities ?? []).join(", "));
  const [status, setStatus] = useState(node.summaryStatus);

  const utils = trpc.useUtils();
  const update = trpc.summaries.update.useMutation({
    onSuccess: () => {
      toast.success("Summary updated.");
      utils.summaries.listByDocument.invalidate({ documentId: node.documentId });
      onClose();
    },
    onError: (err) => toast.error(err.message),
  });

  const handleSave = () => {
    update.mutate({
      id: node.id,
      shortSummary: shortSummary || null,
      longSummary: longSummary || null,
      keyTerms: keyTerms.split(",").map(s => s.trim()).filter(Boolean),
      keyEntities: keyEntities.split(",").map(s => s.trim()).filter(Boolean),
      summaryStatus: status as (typeof SUMMARY_STATUSES)[number],
    });
  };

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <LevelBadge level={node.levelType} />
            {node.headingText ?? `Page ${node.startPageNumber}`}
          </DialogTitle>
          <DialogDescription>
            Pages {node.startPageNumber}–{node.endPageNumber ?? "?"}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-2">
          <div className="space-y-1.5">
            <Label>Short Summary</Label>
            <Textarea
              value={shortSummary}
              onChange={e => setShortSummary(e.target.value)}
              rows={3}
              placeholder="Brief 1–2 sentence summary used for embeddings…"
            />
          </div>
          <div className="space-y-1.5">
            <Label>Long Summary</Label>
            <Textarea
              value={longSummary}
              onChange={e => setLongSummary(e.target.value)}
              rows={6}
              placeholder="Detailed summary returned as context in search results…"
            />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <Label>
                Key Terms{" "}
                <span className="text-muted-foreground text-xs">(comma-separated)</span>
              </Label>
              <Input
                value={keyTerms}
                onChange={e => setKeyTerms(e.target.value)}
                placeholder="fireball, arcane, spell…"
              />
            </div>
            <div className="space-y-1.5">
              <Label>
                Key Entities{" "}
                <span className="text-muted-foreground text-xs">(comma-separated)</span>
              </Label>
              <Input
                value={keyEntities}
                onChange={e => setKeyEntities(e.target.value)}
                placeholder="Gandalf, Mordor, Mithril…"
              />
            </div>
          </div>
          <div className="space-y-1.5">
            <Label>Status</Label>
            <Select value={status} onValueChange={setStatus}>
              <SelectTrigger className="w-48">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {SUMMARY_STATUSES.map(s => (
                  <SelectItem key={s} value={s}>{s}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button onClick={handleSave} disabled={update.isPending}>
            {update.isPending && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
            Save Changes
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ── Tree node component ───────────────────────────────────────────────────────

const INDENT: Record<string, number> = { chapter: 0, section: 20, subsection: 40, page: 60 };

function SummaryNode({
  node,
  onEdit,
  onApprove,
  approving,
}: {
  node: TreeNode;
  onEdit: (r: SummaryRecord) => void;
  onApprove: (id: number) => void;
  approving: number | null;
}) {
  const [open, setOpen] = useState(node.levelType !== "page");
  const hasChildren = node.children.length > 0;
  const indent = INDENT[node.levelType] ?? 0;

  return (
    <div>
      <div
        className="flex items-start gap-2 py-2 px-3 rounded-md hover:bg-card/60 group"
        style={{ paddingLeft: `${indent + 12}px` }}
      >
        {/* Expand toggle */}
        <button
          className="mt-0.5 flex-shrink-0 w-4 h-4 text-muted-foreground"
          onClick={() => setOpen(o => !o)}
          disabled={!hasChildren}
          aria-label={open ? "Collapse" : "Expand"}
        >
          {hasChildren
            ? open
              ? <ChevronDown className="w-4 h-4" />
              : <ChevronRight className="w-4 h-4" />
            : <span className="block w-4" />}
        </button>

        {/* Content */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <LevelBadge level={node.levelType} />
            <span className="text-sm font-medium truncate">
              {node.headingText ?? (
                <span className="text-muted-foreground italic">Page {node.startPageNumber}</span>
              )}
            </span>
            <span className="text-xs text-muted-foreground">
              pp.{node.startPageNumber}–{node.endPageNumber ?? "?"}
            </span>
            <StatusBadge status={node.summaryStatus} />
          </div>
          {node.shortSummary && (
            <p className="text-xs text-muted-foreground mt-1 line-clamp-2">{node.shortSummary}</p>
          )}
          {node.keyTerms && node.keyTerms.length > 0 && (
            <div className="flex flex-wrap gap-1 mt-1">
              {node.keyTerms.slice(0, 6).map(t => (
                <span key={t} className="text-[10px] bg-primary/10 text-primary/70 px-1 rounded">
                  {t}
                </span>
              ))}
              {node.keyTerms.length > 6 && (
                <span className="text-[10px] text-muted-foreground">
                  +{node.keyTerms.length - 6} more
                </span>
              )}
            </div>
          )}
        </div>

        {/* Actions */}
        <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity flex-shrink-0">
          <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => onEdit(node)}>
            <Edit className="w-3.5 h-3.5" />
          </Button>
          {node.summaryStatus === "generated" && (
            <Button
              size="icon"
              variant="ghost"
              className="h-7 w-7 text-green-500 hover:text-green-400"
              onClick={() => onApprove(node.id)}
              disabled={approving === node.id}
              aria-label="Approve"
            >
              {approving === node.id
                ? <Loader2 className="w-3.5 h-3.5 animate-spin" />
                : <Check className="w-3.5 h-3.5" />}
            </Button>
          )}
        </div>
      </div>

      {open && hasChildren && (
        <div>
          {node.children.map(child => (
            <SummaryNode
              key={child.id}
              node={child}
              onEdit={onEdit}
              onApprove={onApprove}
              approving={approving}
            />
          ))}
        </div>
      )}
    </div>
  );
}

// ── Main page ─────────────────────────────────────────────────────────────────

export default function TheChronicles() {
  const [selectedDocId, setSelectedDocId] = useState<number | null>(null);
  const [editTarget, setEditTarget] = useState<SummaryRecord | null>(null);
  const [approving, setApproving] = useState<number | null>(null);

  const { data: docs = [] } = trpc.library.listDocuments.useQuery(undefined);
  const { data: rawSummaries = [], isLoading, refetch } = trpc.summaries.listByDocument.useQuery(
    { documentId: selectedDocId! },
    { enabled: selectedDocId !== null },
  );

  const utils = trpc.useUtils();

  const approveMutation = trpc.summaries.approve.useMutation({
    onSuccess: () => {
      toast.success("Summary approved.");
      utils.summaries.listByDocument.invalidate({ documentId: selectedDocId! });
      setApproving(null);
    },
    onError: (err) => {
      toast.error(err.message);
      setApproving(null);
    },
  });

  const approveAllMutation = trpc.summaries.approveAll.useMutation({
    onSuccess: ({ count }) => {
      toast.success(`${count} ${count === 1 ? "summary" : "summaries"} approved.`);
      utils.summaries.listByDocument.invalidate({ documentId: selectedDocId! });
    },
    onError: (err) => toast.error(err.message),
  });

  const tree = useMemo(() => buildTree(rawSummaries as SummaryRecord[]), [rawSummaries]);

  const stats = useMemo(() => {
    const counts: Record<string, number> = {};
    for (const s of rawSummaries) {
      counts[s.summaryStatus] = (counts[s.summaryStatus] ?? 0) + 1;
    }
    return counts;
  }, [rawSummaries]);

  const selectedDoc = docs.find(d => d.id === selectedDocId);
  const generatedCount = stats["generated"] ?? 0;

  const handleApprove = (id: number) => {
    setApproving(id);
    approveMutation.mutate({ id });
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <ScrollText className="w-6 h-6 text-primary" />
            The Chronicles
          </h1>
          <p className="text-muted-foreground text-sm mt-1">
            Review and correct AI-generated content summaries across the document hierarchy.
          </p>
        </div>
        {selectedDocId !== null && (
          <Button variant="outline" size="sm" onClick={() => refetch()} className="gap-2">
            <RefreshCw className="w-4 h-4" />
            Refresh
          </Button>
        )}
      </div>

      {/* Document selector */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2">
            <BookOpen className="w-4 h-4 text-primary" />
            Select a Document
          </CardTitle>
        </CardHeader>
        <CardContent>
          <Select
            value={selectedDocId !== null ? String(selectedDocId) : ""}
            onValueChange={v => setSelectedDocId(Number(v))}
          >
            <SelectTrigger className="w-full max-w-lg">
              <SelectValue placeholder="Choose a document to review…" />
            </SelectTrigger>
            <SelectContent>
              {docs.map(d => (
                <SelectItem key={d.id} value={String(d.id)}>
                  {d.title ?? d.filename ?? `Document #${d.id}`}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </CardContent>
      </Card>

      {/* Stats bar + approve-all */}
      {selectedDocId !== null && rawSummaries.length > 0 && (
        <div className="flex items-center gap-4 flex-wrap">
          {Object.entries(stats).map(([status, count]) => (
            <div key={status} className="flex items-center gap-1.5">
              <StatusBadge status={status} />
              <span className="text-sm text-muted-foreground">{count}</span>
            </div>
          ))}
          {generatedCount > 0 && (
            <div className="ml-auto">
              <Button
                size="sm"
                variant="outline"
                className="gap-2 text-green-400 border-green-500/30 hover:bg-green-500/10"
                onClick={() => approveAllMutation.mutate({ documentId: selectedDocId })}
                disabled={approveAllMutation.isPending}
              >
                {approveAllMutation.isPending
                  ? <Loader2 className="w-4 h-4 animate-spin" />
                  : <Check className="w-4 h-4" />}
                Approve All Generated ({generatedCount})
              </Button>
            </div>
          )}
        </div>
      )}

      {/* Tree view */}
      {selectedDocId !== null && (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base flex items-center gap-2">
              <Layers className="w-4 h-4 text-primary" />
              {selectedDoc?.title ?? selectedDoc?.filename ?? "Document"} — Hierarchy
            </CardTitle>
            {rawSummaries.length > 0 && (
              <CardDescription>{rawSummaries.length} summary records</CardDescription>
            )}
          </CardHeader>
          <CardContent className="p-0">
            {isLoading ? (
              <div className="flex items-center justify-center py-16 text-muted-foreground gap-2">
                <Loader2 className="w-5 h-5 animate-spin" />
                Loading summaries…
              </div>
            ) : tree.length === 0 ? (
              <div className="py-16 text-center text-muted-foreground">
                <ScrollText className="w-8 h-8 mx-auto mb-3 opacity-30" />
                <p className="text-sm">No summaries yet for this document.</p>
                <p className="text-xs mt-1">
                  Run the pipeline to generate content break detection and summaries.
                </p>
              </div>
            ) : (
              <div className="py-2">
                {tree.map(node => (
                  <SummaryNode
                    key={node.id}
                    node={node}
                    onEdit={setEditTarget}
                    onApprove={handleApprove}
                    approving={approving}
                  />
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* Edit dialog */}
      {editTarget !== null && (
        <EditDialog
          node={editTarget}
          open={true}
          onClose={() => setEditTarget(null)}
        />
      )}
    </div>
  );
}
