import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { CheckCircle2, XCircle, ArrowUpCircle, ChevronDown, ChevronRight, Loader2, ClipboardList } from "lucide-react";
import { trpc } from "@/lib/trpc";
import { useToast } from "@/hooks/use-toast";

type HitlAction = "resolved" | "skipped" | "escalated";

function StatusBadge({ status }: { status: string }) {
  const variants: Record<string, string> = {
    queued: "bg-yellow-500/20 text-yellow-400 border-yellow-500/30",
    in_progress: "bg-blue-500/20 text-blue-400 border-blue-500/30",
    resolved: "bg-green-500/20 text-green-400 border-green-500/30",
    skipped: "bg-muted text-muted-foreground",
    escalated: "bg-red-500/20 text-red-400 border-red-500/30",
  };
  return (
    <span className={`text-xs px-2 py-0.5 rounded-full border font-medium ${variants[status] ?? "bg-muted text-muted-foreground"}`}>
      {status}
    </span>
  );
}

function HitlCard({ item, onResolved }: { item: any; onResolved: () => void }) {
  const { toast } = useToast();
  const [expanded, setExpanded] = useState(false);
  const [notes, setNotes] = useState("");
  const [correctedText, setCorrectedText] = useState("");

  const resolve = trpc.hitl.resolve.useMutation({
    onSuccess: () => { toast({ title: "Review submitted" }); onResolved(); },
    onError: (e) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  const submit = (action: HitlAction) => {
    resolve.mutate({ id: item.id, action, resolutionNotes: notes || undefined, correctedText: correctedText || undefined });
  };

  const rawText = item.ocr?.rawText ?? item.ocr?.structuredData ? JSON.stringify(item.ocr?.structuredData, null, 2) : null;
  const pageImagePath = item.page?.rawPngUrl
    ? `/api/pipeline/pages/${item.page.rawPngUrl.replace(/.*\/workspace\//, "")}`
    : null;

  return (
    <Card className="bg-card/50 backdrop-blur-sm border-border/50">
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <button onClick={() => setExpanded(!expanded)} className="text-muted-foreground hover:text-foreground">
              {expanded ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
            </button>
            <CardTitle className="text-base">
              Page {item.page?.pageNumber ?? "?"} — {item.reason}
            </CardTitle>
          </div>
          <div className="flex items-center gap-2">
            <StatusBadge status={item.status} />
            {item.ocr?.confidence != null && (
              <span className="text-xs text-muted-foreground">conf: {item.ocr.confidence}%</span>
            )}
          </div>
        </div>
      </CardHeader>

      {expanded && (
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {/* Page image */}
            <div>
              <p className="text-xs text-muted-foreground mb-2 uppercase tracking-wide">Page Image</p>
              {pageImagePath ? (
                <img src={pageImagePath} alt={`Page ${item.page?.pageNumber}`} className="w-full rounded border border-border/50 object-contain max-h-[500px]" />
              ) : (
                <div className="h-40 flex items-center justify-center rounded border border-border/50 bg-muted/20 text-muted-foreground text-sm">
                  Image not available
                </div>
              )}
            </div>

            {/* OCR output */}
            <div>
              <p className="text-xs text-muted-foreground mb-2 uppercase tracking-wide">OCR Output</p>
              <pre className="text-xs bg-muted/20 border border-border/50 rounded p-3 overflow-auto max-h-[300px] whitespace-pre-wrap">
                {rawText ?? "No OCR data"}
              </pre>
              <div className="mt-3 space-y-1">
                <p className="text-xs text-muted-foreground">Corrected text (optional — leave blank to accept as-is)</p>
                <Textarea
                  value={correctedText}
                  onChange={e => setCorrectedText(e.target.value)}
                  placeholder="Paste corrected text here if needed…"
                  className="text-xs font-mono h-28 bg-background/50"
                />
              </div>
            </div>
          </div>

          <div className="space-y-1">
            <p className="text-xs text-muted-foreground">Review notes (optional)</p>
            <Textarea
              value={notes}
              onChange={e => setNotes(e.target.value)}
              placeholder="Add notes about this page…"
              className="text-xs h-16 bg-background/50"
            />
          </div>

          <div className="flex gap-2 justify-end">
            <Button variant="outline" size="sm" className="gap-1.5 text-yellow-500 border-yellow-500/30 hover:bg-yellow-500/10"
              onClick={() => submit("escalated")} disabled={resolve.isPending}>
              <ArrowUpCircle className="w-4 h-4" /> Escalate
            </Button>
            <Button variant="outline" size="sm" className="gap-1.5"
              onClick={() => submit("skipped")} disabled={resolve.isPending}>
              <XCircle className="w-4 h-4" /> Skip
            </Button>
            <Button size="sm" className="gap-1.5 bg-green-600 hover:bg-green-700 text-white"
              onClick={() => submit("resolved")} disabled={resolve.isPending}>
              {resolve.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <CheckCircle2 className="w-4 h-4" />}
              Approve
            </Button>
          </div>
        </CardContent>
      )}
    </Card>
  );
}

export default function TrialsOfTruth() {
  const [statusFilter, setStatusFilter] = useState<"queued" | "resolved" | "escalated" | "skipped">("queued");
  const { data: items, isLoading, refetch } = trpc.hitl.list.useQuery({ status: statusFilter, limit: 50 });
  const { data: stats } = trpc.hitl.stats.useQuery();

  return (
    <div className="space-y-8 animate-in fade-in duration-500">
      <div>
        <h1 className="text-4xl font-bold tracking-tight mb-2 flex items-center gap-3">
          <ClipboardList className="w-10 h-10 text-primary" />
          Trials of Truth
        </h1>
        <p className="text-lg text-muted-foreground max-w-3xl">
          Review each processed page for accuracy. Approve, correct, skip, or escalate before knowledge enters the Arkanum.
        </p>
      </div>

      {/* Stats */}
      {stats && (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
          {[
            { label: "Awaiting Review", value: stats.queued, color: "text-yellow-400" },
            { label: "Resolved", value: stats.resolved, color: "text-green-400" },
            { label: "Escalated", value: stats.escalated, color: "text-red-400" },
            { label: "Skipped", value: stats.skipped, color: "text-muted-foreground" },
          ].map(({ label, value, color }) => (
            <Card key={label} className="bg-card/50 backdrop-blur-sm border-border/50">
              <CardContent className="pt-4 pb-3">
                <p className={`text-3xl font-bold ${color}`}>{value}</p>
                <p className="text-xs text-muted-foreground mt-1">{label}</p>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* Filter tabs */}
      <div className="flex gap-2">
        {(["queued", "resolved", "escalated", "skipped"] as const).map(s => (
          <button key={s} onClick={() => setStatusFilter(s)}
            className={`px-3 py-1.5 rounded-md text-sm font-medium transition-colors ${
              statusFilter === s ? "bg-primary text-primary-foreground" : "bg-muted/30 text-muted-foreground hover:text-foreground"
            }`}>
            {s.charAt(0).toUpperCase() + s.slice(1)}
          </button>
        ))}
      </div>

      {/* Items */}
      {isLoading ? (
        <div className="flex items-center gap-2 text-muted-foreground"><Loader2 className="w-4 h-4 animate-spin" /> Loading…</div>
      ) : items?.length === 0 ? (
        <div className="text-center py-16 text-muted-foreground">
          <CheckCircle2 className="w-12 h-12 mx-auto mb-3 opacity-30" />
          <p>No {statusFilter} items in the queue.</p>
        </div>
      ) : (
        <div className="space-y-3">
          {items?.map(item => (
            <HitlCard key={item.id} item={item} onResolved={() => refetch()} />
          ))}
        </div>
      )}
    </div>
  );
}
