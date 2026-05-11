import { Badge } from "@/components/ui/badge";

export function ConfidenceBadge({ confidence }: { confidence: number | null | undefined }) {
  if (confidence === null || confidence === undefined) {
    return <Badge variant="outline" className="text-xs text-muted-foreground">N/A</Badge>;
  }
  const cls = confidence >= 85
    ? "text-green-500 border-green-500/30 bg-green-500/10"
    : confidence >= 60
    ? "text-amber-500 border-amber-500/30 bg-amber-500/10"
    : "text-red-500 border-red-500/30 bg-red-500/10";
  return <Badge variant="outline" className={`text-xs ${cls}`}>{confidence}%</Badge>;
}
