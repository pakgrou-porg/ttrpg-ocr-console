import { useState } from "react";
import { Layers, Eye, EyeOff } from "lucide-react";

// ── Colour palette ────────────────────────────────────────────────────────────
const TYPE_COLORS: Record<string, string> = {
  heading:       "#a855f7",
  subheading:    "#c084fc",
  paragraph:     "#3b82f6",
  list:          "#60a5fa",
  sidebar:       "#14b8a6",
  callout:       "#2dd4bf",
  caption:       "#94a3b8",
  table:         "#f97316",
  stat_block:    "#eab308",
  illustration:  "#22c55e",
  map:           "#4ade80",
  graphic:       "#86efac",
  advertisement: "#fb7185",
  header:        "#6b7280",
  footer:        "#6b7280",
  page_number:   "#9ca3af",
};

const DEFAULT_COLOR = "#94a3b8";

export type BboxRegion = {
  type?: string;
  regionType?: string;
  label?: string;
  reviewId?: string;
  sequence?: number;
  // nested bbox object (various shapes)
  bbox?:
    | { x: number; y: number; w: number; h: number }
    | { x: number; y: number; width: number; height: number }
    | { x1: number; y1: number; x2: number; y2: number }
    | { left: number; top: number; right: number; bottom: number }
    | number[];
  // flat top-level coordinates (some models skip the bbox wrapper)
  x?: number; y?: number; w?: number; h?: number;
  width?: number; height?: number;
  x1?: number; y1?: number; x2?: number; y2?: number;
};

// ── Normalise raw coords → {x, y, w, h} in 0-100 percent space ───────────────

type Box = { x: number; y: number; w: number; h: number };

function extractRawBox(r: BboxRegion): Box | null {
  const b = r.bbox;

  // Array form: [x, y, w, h]
  if (Array.isArray(b) && b.length >= 4) {
    return { x: b[0], y: b[1], w: b[2], h: b[3] };
  }

  // Object form — try several key conventions
  if (b && typeof b === "object" && !Array.isArray(b)) {
    const o = b as Record<string, number>;
    // {x, y, w, h}
    if (o.w !== undefined && o.h !== undefined)
      return { x: o.x ?? 0, y: o.y ?? 0, w: o.w, h: o.h };
    // {x, y, width, height}
    if (o.width !== undefined && o.height !== undefined)
      return { x: o.x ?? 0, y: o.y ?? 0, w: o.width, h: o.height };
    // {x1, y1, x2, y2}
    if (o.x1 !== undefined && o.y1 !== undefined && o.x2 !== undefined && o.y2 !== undefined)
      return { x: o.x1, y: o.y1, w: o.x2 - o.x1, h: o.y2 - o.y1 };
    // {left, top, right, bottom}
    if (o.left !== undefined && o.top !== undefined && o.right !== undefined && o.bottom !== undefined)
      return { x: o.left, y: o.top, w: o.right - o.left, h: o.bottom - o.top };
  }

  // Flat top-level coords: {type, x, y, w, h} or {type, x, y, width, height}
  if (r.x !== undefined && r.y !== undefined) {
    const rr = r as Record<string, number>;
    if (rr.w !== undefined && rr.h !== undefined)
      return { x: r.x, y: r.y, w: rr.w, h: rr.h };
    if (rr.width !== undefined && rr.height !== undefined)
      return { x: r.x, y: r.y, w: rr.width, h: rr.height };
  }
  if (r.x1 !== undefined && r.y1 !== undefined && r.x2 !== undefined && r.y2 !== undefined)
    return { x: r.x1, y: r.y1, w: r.x2 - r.x1, h: r.y2 - r.y1 };

  return null;
}

/**
 * Convert raw boxes to 0-100 percentage space.
 * If any coordinate exceeds 101, treat the whole set as pixel-based and scale
 * down using the observed page extent (max x+w, max y+h).
 */
function toPercentBoxes(raw: Array<{ region: BboxRegion; box: Box }>): Array<{ region: BboxRegion; box: Box }> {
  const maxX = Math.max(...raw.map(({ box: b }) => b.x + b.w));
  const maxY = Math.max(...raw.map(({ box: b }) => b.y + b.h));

  // Already in 0-100 percent space
  if (maxX <= 101 && maxY <= 101) return raw;

  // Pixel coordinates — normalise to 0-100 using observed page extent
  const scaleX = maxX > 0 ? 100 / maxX : 1;
  const scaleY = maxY > 0 ? 100 / maxY : 1;

  return raw.map(({ region, box }) => ({
    region,
    box: {
      x: box.x * scaleX,
      y: box.y * scaleY,
      w: box.w * scaleX,
      h: box.h * scaleY,
    },
  }));
}

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
  // Normalise all region shapes into {x,y,w,h} percentage boxes
  const rawPairs = regions
    .map(r => ({ region: r, box: extractRawBox(r) }))
    .filter((p): p is { region: BboxRegion; box: Box } => p.box !== null && p.box.w > 0 && p.box.h > 0);

  const normalised = toPercentBoxes(rawPairs);

  return (
    <div className={`relative select-none ${className ?? ""}`}>
      <img
        src={imageUrl}
        alt="Page with region overlay"
        className="w-full h-auto block rounded"
        loading="lazy"
        draggable={false}
      />
      {normalised.length > 0 && (
        <svg
          className="absolute inset-0 w-full h-full pointer-events-none"
          viewBox="0 0 100 100"
          preserveAspectRatio="none"
        >
          {normalised.map(({ region: r, box: { x, y, w, h } }, i) => {
            const type = r.type ?? r.regionType ?? "unknown";
            const color = TYPE_COLORS[type] ?? DEFAULT_COLOR;
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
                  {type}
                </text>
              </g>
            );
          })}
        </svg>
      )}
      {normalised.length === 0 && (
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
  const hasCoords = regions.some(r => extractRawBox(r) !== null);

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
