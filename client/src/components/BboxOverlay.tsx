import { useState } from "react";
import { Layers, Eye, EyeOff } from "lucide-react";

// ── Colour palette ────────────────────────────────────────────────────────────
// Each region type maps to a hex colour used for both fill (at low opacity) and
// the stroke + label badge.

const TYPE_COLORS: Record<string, string> = {
  heading:     "#a855f7",
  subheading:  "#c084fc",
  paragraph:   "#3b82f6",
  list:        "#60a5fa",
  list_item:   "#60a5fa",
  table:       "#f97316",
  image:       "#22c55e",
  illustration:"#22c55e",
  map:         "#4ade80",
  graphic:     "#86efac",
  stat_block:  "#eab308",
  stat_line:   "#fbbf24",
  sidebar:     "#14b8a6",
  callout:     "#2dd4bf",
  header:      "#6b7280",
  footer:      "#6b7280",
  page_number: "#9ca3af",
  caption:     "#94a3b8",
};

const DEFAULT_COLOR = "#94a3b8";

export type BboxRegion = {
  type: string;
  label?: string;
  bbox?: { x: number; y: number; w: number; h: number };
};

// ── Component ─────────────────────────────────────────────────────────────────

export function BboxOverlay({
  imageUrl,
  regions,
  className,
}: {
  imageUrl: string;
  regions: BboxRegion[];
  className?: string;
}) {
  const withBbox = regions.filter(r => r.bbox && r.bbox.w > 0 && r.bbox.h > 0);

  return (
    <div className={`relative select-none ${className ?? ""}`}>
      <img
        src={imageUrl}
        alt="Page with region overlay"
        className="w-full h-auto block rounded"
        loading="lazy"
        draggable={false}
      />
      {withBbox.length > 0 && (
        <svg
          className="absolute inset-0 w-full h-full pointer-events-none"
          viewBox="0 0 100 100"
          preserveAspectRatio="none"
        >
          {withBbox.map((r, i) => {
            const { x, y, w, h } = r.bbox!;
            const color = TYPE_COLORS[r.type] ?? DEFAULT_COLOR;
            // Clamp label so it always stays within the SVG viewport
            const labelY = y < 3 ? y + h - 0.5 : y + 2;
            return (
              <g key={i}>
                <rect
                  x={x} y={y} width={w} height={h}
                  fill={color} fillOpacity={0.1}
                  stroke={color} strokeWidth={0.35} strokeOpacity={0.9}
                />
                <text
                  x={x + 0.5} y={labelY}
                  fontSize={1.8}
                  fontFamily="monospace"
                  fill={color}
                  fillOpacity={0.95}
                  style={{ textShadow: "0 0 2px rgba(0,0,0,0.8)" }}
                >
                  {r.type}
                </text>
              </g>
            );
          })}
        </svg>
      )}
      {withBbox.length === 0 && (
        <div className="absolute inset-0 flex items-end justify-center pb-2 pointer-events-none">
          <span className="text-xs bg-black/50 text-white/70 px-2 py-0.5 rounded">
            No bbox coordinates — re-run bbox_detection to populate
          </span>
        </div>
      )}
    </div>
  );
}

// ── Toggle wrapper ────────────────────────────────────────────────────────────
// Wraps an existing image with a toggle button to switch between plain view
// and the bbox overlay. Pass the same imageUrl and regions array.

export function BboxOverlayToggle({
  imageUrl,
  regions,
  imageClassName,
}: {
  imageUrl: string;
  regions: BboxRegion[];
  imageClassName?: string;
}) {
  const [showOverlay, setShowOverlay] = useState(false);
  const hasCoords = regions.some(r => r.bbox && r.bbox.w > 0);

  return (
    <div className="space-y-1.5">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
          <Layers className="h-3 w-3" />
          <span>{regions.length} region{regions.length !== 1 ? "s" : ""}{hasCoords ? "" : " (no coords)"}</span>
        </div>
        {regions.length > 0 && (
          <button
            onClick={() => setShowOverlay(v => !v)}
            className={`flex items-center gap-1 text-xs px-2 py-0.5 rounded border transition-colors ${
              showOverlay
                ? "border-primary/50 bg-primary/10 text-primary"
                : "border-border/40 text-muted-foreground hover:text-foreground"
            }`}
          >
            {showOverlay ? <EyeOff className="h-3 w-3" /> : <Eye className="h-3 w-3" />}
            {showOverlay ? "Hide overlay" : "Show overlay"}
          </button>
        )}
      </div>

      {showOverlay ? (
        <BboxOverlay imageUrl={imageUrl} regions={regions} />
      ) : (
        <img
          src={imageUrl}
          alt="Page"
          className={imageClassName ?? "w-full rounded border border-border/50 object-contain"}
          loading="lazy"
        />
      )}
    </div>
  );
}
