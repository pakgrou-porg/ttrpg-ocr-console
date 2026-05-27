import { useMemo, useRef, useState, type KeyboardEvent, type PointerEvent } from "react";
import { Move, Plus, Trash2, ArrowUp, ArrowDown, RotateCcw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import type { BboxRegion } from "@/components/BboxOverlay";

export const REGION_TYPES = [
  // Priority types — most common in TTRPG material, shown first
  "heading",
  "subheading",
  "paragraph",
  "table",
  "graphic",
  "header",
  "footer",
  "page_number",
  // Remaining types — alphabetical
  "advertisement",
  "callout",
  "caption",
  "illustration",
  "list",
  "map",
  "sidebar",
  "stat_block",
  "unknown",
] as const;

/** Map legacy/model-output aliases to canonical types. Mirrors server-side REGION_TYPE_ALIASES. */
const REGION_TYPE_ALIASES: Record<string, string> = {
  text:      "paragraph",
  image:     "illustration",
  list_item: "list",
  stat_line: "stat_block",
};

const REGION_TYPES_SET = new Set<string>(REGION_TYPES);

/** Normalise a raw type string: resolve aliases, fall back to "unknown". */
function normaliseType(raw: string): string {
  return REGION_TYPE_ALIASES[raw] ?? (REGION_TYPES_SET.has(raw) ? raw : "unknown");
}

type Box = { x: number; y: number; w: number; h: number };
type DraftRegion = BboxRegion & {
  id: string;
  sequence: number;
  type: string;
  regionType: string;
  bbox: Box;
};

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
  unknown:       "#94a3b8",
};

function clamp(n: number, min: number, max: number) {
  return Math.max(min, Math.min(max, n));
}

function rawBox(region: BboxRegion): Box | null {
  if (Array.isArray(region.bbox) && region.bbox.length >= 4) {
    const [x, y, w, h] = region.bbox.map(Number);
    return [x, y, w, h].every(Number.isFinite) && w > 0 && h > 0 ? { x, y, w, h } : null;
  }

  const source = region.bbox && typeof region.bbox === "object" && !Array.isArray(region.bbox)
    ? region.bbox as Record<string, number>
    : region as Record<string, number>;

  const x = Number(source.x ?? source.left ?? source.x1);
  const y = Number(source.y ?? source.top ?? source.y1);
  const w = Number(source.w ?? source.width ?? (source.x2 != null ? source.x2 - x : undefined));
  const h = Number(source.h ?? source.height ?? (source.y2 != null ? source.y2 - y : undefined));
  return [x, y, w, h].every(Number.isFinite) && w > 0 && h > 0 ? { x, y, w, h } : null;
}

function toPercentBoxes(regions: BboxRegion[]): Array<{ region: BboxRegion; box: Box }> {
  const pairs = regions
    .map(region => ({ region, box: rawBox(region) }))
    .filter((p): p is { region: BboxRegion; box: Box } => p.box !== null);

  if (pairs.length === 0) return [];
  const maxX = Math.max(...pairs.map(({ box }) => box.x + box.w));
  const maxY = Math.max(...pairs.map(({ box }) => box.y + box.h));
  if (maxX <= 101 && maxY <= 101) return pairs;

  const scaleX = maxX > 0 ? 100 / maxX : 1;
  const scaleY = maxY > 0 ? 100 / maxY : 1;
  return pairs.map(({ region, box }) => ({
    region,
    box: {
      x: box.x * scaleX,
      y: box.y * scaleY,
      w: box.w * scaleX,
      h: box.h * scaleY,
    },
  }));
}

function prepareDrafts(regions: BboxRegion[]): DraftRegion[] {
  return toPercentBoxes(regions).map(({ region, box }, index) => {
    const type = normaliseType(String(region.type ?? region.regionType ?? "unknown"));
    return {
      ...region,
      id: String((region as any).reviewId ?? `${index}-${type}-${box.x}-${box.y}`),
      sequence: Number((region as any).sequence ?? index + 1),
      type,
      regionType: type,
      bbox: {
        x: clamp(box.x, 0, 100),
        y: clamp(box.y, 0, 100),
        w: clamp(box.w, 0.1, 100),
        h: clamp(box.h, 0.1, 100),
      },
    };
  });
}

function serialiseDrafts(regions: DraftRegion[]): BboxRegion[] {
  return regions.map(({ id: _id, bbox, type, regionType, sequence, ...rest }, index) => ({
    ...rest,
    reviewId: _id,
    sequence: Number.isFinite(sequence) ? sequence : index + 1,
    type,
    regionType,
    bbox: {
      x: Number(bbox.x.toFixed(2)),
      y: Number(bbox.y.toFixed(2)),
      w: Number(bbox.w.toFixed(2)),
      h: Number(bbox.h.toFixed(2)),
    },
  }));
}

function pointerPercent(e: PointerEvent<HTMLElement>, el: HTMLElement) {
  const rect = el.getBoundingClientRect();
  return {
    x: clamp(((e.clientX - rect.left) / rect.width) * 100, 0, 100),
    y: clamp(((e.clientY - rect.top) / rect.height) * 100, 0, 100),
  };
}

export function parseRegionJson(value: string, fallback: BboxRegion[]): BboxRegion[] {
  if (!value.trim()) return fallback;
  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed) ? parsed : fallback;
  } catch {
    return fallback;
  }
}

export function BboxRegionEditor({
  imageUrl,
  regions,
  onChange,
}: {
  imageUrl: string;
  regions: BboxRegion[];
  onChange: (regions: BboxRegion[]) => void;
}) {
  const baseDrafts = useMemo(() => prepareDrafts(regions), [regions]);
  const [selectedId, setSelectedId] = useState<string | null>(baseDrafts[0]?.id ?? null);
  const [drawType, setDrawType] = useState<string>("paragraph");
  const [interaction, setInteraction] = useState<null | {
    mode: "draw" | "move" | "resize";
    id?: string;
    start: { x: number; y: number };
    original?: Box;
  }>(null);
  const surfaceRef = useRef<HTMLDivElement>(null);
  const [kbMode, setKbMode] = useState<"none" | "move" | "resize">("none");
  // When false, emit auto-sorts by position (default). When true, the reviewer
  // has manually reordered regions and the explicit sequence is preserved.
  const [manualOrder, setManualOrder] = useState(false);

  const selected = baseDrafts.find(r => r.id === selectedId) ?? baseDrafts[0] ?? null;

  // In auto-sort mode: group into columns left-to-right (a new column starts when a
  // region's left edge is >10 percentage-points further right than the current column's
  // leftmost x), then sort each column top-to-bottom.  Single-column pages degenerate
  // to a simple top-to-bottom sort.
  // In manual mode: preserve the explicit sequence the reviewer set.
  const emit = (drafts: DraftRegion[]) => {
    let ordered: DraftRegion[];
    if (manualOrder) {
      ordered = drafts.slice().sort((a, b) => a.sequence - b.sequence);
    } else {
      const byX = drafts.slice().sort((a, b) => a.bbox.x - b.bbox.x);
      const columns: DraftRegion[][] = [];
      let col: DraftRegion[] = [];
      let colMinX = byX[0]?.bbox.x ?? 0;
      for (const r of byX) {
        if (r.bbox.x > colMinX + 10) {
          columns.push(col);
          col = [r];
          colMinX = r.bbox.x;
        } else {
          col.push(r);
        }
      }
      if (col.length > 0) columns.push(col);
      ordered = columns.flatMap(c => c.slice().sort((a, b) => a.bbox.y - b.bbox.y));
    }
    onChange(serialiseDrafts(ordered.map((r, i) => ({ ...r, sequence: i + 1 }))));
  };

  // Reorder the reading sequence: move item at position idx up or down by one step.
  const reorderSequence = (idx: number, direction: "up" | "down") => {
    const ordered = baseDrafts.slice().sort((a, b) => a.sequence - b.sequence);
    const swapWith = direction === "up" ? idx - 1 : idx + 1;
    if (swapWith < 0 || swapWith >= ordered.length) return;
    [ordered[idx], ordered[swapWith]] = [ordered[swapWith], ordered[idx]];
    setManualOrder(true);
    onChange(serialiseDrafts(ordered.map((r, i) => ({ ...r, sequence: i + 1 }))));
  };

  const resetToAutoOrder = () => {
    setManualOrder(false);
    emit(baseDrafts);
  };

  const updateRegion = (id: string, patch: Partial<DraftRegion> & { bbox?: Partial<Box> }) => {
    emit(baseDrafts.map(region => {
      if (region.id !== id) return region;
      return {
        ...region,
        ...patch,
        bbox: {
          ...region.bbox,
          ...(patch.bbox ?? {}),
        },
      };
    }));
  };

  const beginDraw = (e: PointerEvent<HTMLDivElement>) => {
    if (e.button !== 0 || !surfaceRef.current) return;
    // Grab keyboard focus so shortcuts (S/M/T/P/N/arrows) work immediately
    // after any pointer interaction without requiring an extra click.
    surfaceRef.current.focus();
    const start = pointerPercent(e, surfaceRef.current);
    const id = `new-${Date.now()}`;
    const next: DraftRegion = {
      id,
      sequence: baseDrafts.length + 1,
      type: drawType,
      regionType: drawType,
      bbox: { x: start.x, y: start.y, w: 0.5, h: 0.5 },
    };
    setSelectedId(id);
    setInteraction({ mode: "draw", id, start });
    emit([...baseDrafts, next]);
    e.currentTarget.setPointerCapture(e.pointerId);
  };

  const beginMove = (e: PointerEvent<HTMLElement>, region: DraftRegion, mode: "move" | "resize") => {
    if (!surfaceRef.current) return;
    e.preventDefault();
    e.stopPropagation();
    setSelectedId(region.id);
    setInteraction({
      mode,
      id: region.id,
      start: pointerPercent(e, surfaceRef.current),
      original: { ...region.bbox },
    });
    e.currentTarget.setPointerCapture(e.pointerId);
  };

  const handleMove = (e: PointerEvent<HTMLDivElement>) => {
    if (!interaction || !surfaceRef.current || !interaction.id || !interaction.original) {
      if (interaction?.mode === "draw" && interaction.id && surfaceRef.current) {
        const current = pointerPercent(e, surfaceRef.current);
        const x = Math.min(interaction.start.x, current.x);
        const y = Math.min(interaction.start.y, current.y);
        const w = Math.abs(current.x - interaction.start.x);
        const h = Math.abs(current.y - interaction.start.y);
        updateRegion(interaction.id, { bbox: { x, y, w: Math.max(w, 0.5), h: Math.max(h, 0.5) } });
      }
      return;
    }

    const current = pointerPercent(e, surfaceRef.current);
    const dx = current.x - interaction.start.x;
    const dy = current.y - interaction.start.y;
    const original = interaction.original;

    if (interaction.mode === "move") {
      updateRegion(interaction.id, {
        bbox: {
          x: clamp(original.x + dx, 0, 100 - original.w),
          y: clamp(original.y + dy, 0, 100 - original.h),
        },
      });
    } else {
      updateRegion(interaction.id, {
        bbox: {
          w: clamp(original.w + dx, 0.5, 100 - original.x),
          h: clamp(original.h + dy, 0.5, 100 - original.y),
        },
      });
    }
  };

  const clearInteraction = () => setInteraction(null);

  const deleteSelected = () => {
    if (!selected) return;
    const next = baseDrafts.filter(region => region.id !== selected.id);
    setSelectedId(next[0]?.id ?? null);
    emit(next);
  };

  const deleteAll = () => {
    setSelectedId(null);
    emit([]);
  };

  const addFullPage = () => {
    const id = `full-${Date.now()}`;
    setSelectedId(id);
    emit([...baseDrafts, {
      id,
      sequence: baseDrafts.length + 1,
      type: drawType,
      regionType: drawType,
      bbox: { x: 0, y: 0, w: 100, h: 100 },
    }]);
  };

  const handleKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    const target = e.target as HTMLElement;
    // Don't intercept when focus is inside a form control
    if (target.tagName === "INPUT" || target.tagName === "TEXTAREA" || target.isContentEditable) return;
    if (e.metaKey || e.ctrlKey || e.altKey) return;

    const key = e.key.toLowerCase();

    switch (key) {
      case "s": {
        e.preventDefault();
        e.nativeEvent.stopPropagation();
        setKbMode(m => m === "resize" ? "none" : "resize");
        break;
      }
      case "m": {
        e.preventDefault();
        e.nativeEvent.stopPropagation();
        setKbMode(m => m === "move" ? "none" : "move");
        break;
      }
      case "p": {
        e.preventDefault();
        e.nativeEvent.stopPropagation();
        deleteSelected();
        break;
      }
      case "t": {
        if (!selected) break;
        e.preventDefault();
        e.nativeEvent.stopPropagation();
        const idx = (REGION_TYPES as readonly string[]).indexOf(selected.type);
        const next = REGION_TYPES[(idx < 0 ? 0 : idx + 1) % REGION_TYPES.length];
        updateRegion(selected.id, { type: next, regionType: next });
        break;
      }
      case "n": {
        e.preventDefault();
        e.nativeEvent.stopPropagation();
        const newId = `new-${Date.now()}`;
        setSelectedId(newId);
        emit([...baseDrafts, {
          id: newId,
          sequence: baseDrafts.length + 1,
          type: drawType,
          regionType: drawType,
          bbox: { x: 40, y: 40, w: 20, h: 10 },
        }]);
        break;
      }
      case "c": {
        if (baseDrafts.length === 0) break;
        e.preventDefault();
        e.nativeEvent.stopPropagation();
        const ci = baseDrafts.findIndex(r => r.id === selectedId);
        setSelectedId(baseDrafts[(ci + 1) % baseDrafts.length].id);
        break;
      }
      case "b": {
        if (baseDrafts.length === 0) break;
        e.preventDefault();
        e.nativeEvent.stopPropagation();
        const bi = baseDrafts.findIndex(r => r.id === selectedId);
        setSelectedId(baseDrafts[(bi - 1 + baseDrafts.length) % baseDrafts.length].id);
        break;
      }
      case "escape": {
        e.preventDefault();
        setKbMode("none");
        break;
      }
      case "arrowup":
      case "arrowdown":
      case "arrowleft":
      case "arrowright": {
        if (kbMode === "none" || !selected || e.defaultPrevented) break;
        e.preventDefault();
        e.nativeEvent.stopPropagation();
        const step = e.shiftKey ? 5 : 1;
        if (kbMode === "move") {
          const dx = key === "arrowleft" ? -step : key === "arrowright" ? step : 0;
          const dy = key === "arrowup"   ? -step : key === "arrowdown"  ? step : 0;
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          updateRegion(selected.id, { bbox: { x: clamp(selected.bbox.x + dx, 0, 100 - selected.bbox.w), y: clamp(selected.bbox.y + dy, 0, 100 - selected.bbox.h) } as any });
        } else {
          const dw = key === "arrowleft" ? -step : key === "arrowright" ? step : 0;
          const dh = key === "arrowup"   ? -step : key === "arrowdown"  ? step : 0;
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          updateRegion(selected.id, { bbox: { w: clamp(selected.bbox.w + dw, 0.5, 100 - selected.bbox.x), h: clamp(selected.bbox.h + dh, 0.5, 100 - selected.bbox.y) } as any });
        }
        break;
      }
    }
  };

  const setSelectedBoxNumber = (key: keyof Box, value: string) => {
    if (!selected) return;
    const numeric = Number(value);
    if (!Number.isFinite(numeric)) return;
    const bbox = { [key]: clamp(numeric, 0, key === "w" || key === "h" ? 100 : 99) } as Partial<Box>;
    updateRegion(selected.id, { bbox });
  };

  return (
    // eslint-disable-next-line jsx-a11y/no-static-element-interactions
    <div className="space-y-2" onKeyDown={handleKeyDown}>
      <div className="flex items-center gap-2 flex-wrap">
        <Select value={drawType} onValueChange={setDrawType}>
          <SelectTrigger size="sm" className="w-[150px]">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {REGION_TYPES.map(type => <SelectItem key={type} value={type}>{type}</SelectItem>)}
          </SelectContent>
        </Select>
        <Button type="button" size="sm" variant="outline" className="h-8 gap-1.5" onClick={addFullPage}>
          <Plus className="h-3.5 w-3.5" />
          Add
        </Button>
        <Button type="button" size="sm" variant="outline" className="h-8 gap-1.5" onClick={deleteSelected} disabled={!selected}>
          <Trash2 className="h-3.5 w-3.5" />
          Delete
        </Button>
        <Button type="button" size="sm" variant="outline" className="h-8 gap-1.5" onClick={deleteAll} disabled={baseDrafts.length === 0}>
          <Trash2 className="h-3.5 w-3.5" />
          Clear
        </Button>
        {kbMode !== "none" ? (
          <span className="text-xs px-2.5 py-0.5 rounded-full bg-primary/15 text-primary border border-primary/30 font-medium">
            {kbMode === "move" ? "Move" : "Resize"} · arrows adjust · Shift+arrow×5 · Esc exit
          </span>
        ) : (
          <span className="text-[11px] text-muted-foreground/40 ml-auto hidden md:block select-none">
            S resize · M move · T type · P delete · N new · C next · B prev
          </span>
        )}
      </div>

      <div
        ref={surfaceRef}
        tabIndex={0}
        className="relative overflow-hidden rounded border border-border/50 bg-muted/10 touch-none outline-none focus-visible:ring-1 focus-visible:ring-primary/40"
        onPointerDown={beginDraw}
        onPointerMove={handleMove}
        onPointerUp={clearInteraction}
        onPointerCancel={clearInteraction}
      >
        <img src={imageUrl} alt="Page region editor" className="w-full h-auto block select-none" draggable={false} />
        {baseDrafts.map(region => {
          const color = TYPE_COLORS[region.type] ?? TYPE_COLORS.unknown;
          const active = selected?.id === region.id;
          const { x, y, w, h } = region.bbox;
          return (
            <button
              key={region.id}
              type="button"
              onPointerDown={e => beginMove(e, region, "move")}
              onClick={e => { e.stopPropagation(); setSelectedId(region.id); }}
              className={`absolute text-left group ${active ? "z-20" : "z-10"}`}
              style={{
                left: `${x}%`,
                top: `${y}%`,
                width: `${w}%`,
                height: `${h}%`,
                background: `${color}22`,
                border: `2px solid ${color}`,
              }}
              title={region.type}
            >
              <span className="absolute left-1 top-1 rounded bg-background/80 px-1 py-0.5 text-[10px] font-mono text-foreground leading-none">
                #{region.sequence} {region.type}
              </span>
              {active && (
                <span
                  role="presentation"
                  onPointerDown={e => beginMove(e, region, "resize")}
                  className="absolute bottom-0 right-0 h-4 w-4 translate-x-1/2 translate-y-1/2 rounded-full border border-background"
                  style={{ background: color }}
                />
              )}
            </button>
          );
        })}
      </div>

      {selected && (
        <div className="rounded border border-border/40 bg-muted/10 p-2 space-y-2">
          <div className="flex items-center gap-2">
            <Move className="h-3.5 w-3.5 text-muted-foreground" />
            <Select
              value={selected.type}
              onValueChange={value => updateRegion(selected.id, { type: value, regionType: value })}
            >
              <SelectTrigger size="sm" className="w-[170px]">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {REGION_TYPES.map(type => <SelectItem key={type} value={type}>{type}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div className="grid grid-cols-4 gap-2">
            {(["x", "y", "w", "h"] as const).map(key => (
              <Input
                key={key}
                type="number"
                step="0.1"
                min="0"
                max="100"
                value={Number(selected.bbox[key].toFixed(1))}
                onChange={e => setSelectedBoxNumber(key, e.target.value)}
                className="h-8 text-xs"
                aria-label={key}
              />
            ))}
          </div>
        </div>
      )}

      {/* Reading order panel — shown when there are 2+ regions */}
      {baseDrafts.length >= 2 && (
        <div className="rounded border border-border/40 bg-muted/10 p-2 space-y-1.5">
          <div className="flex items-center justify-between gap-2">
            <p className="text-[11px] font-medium text-muted-foreground uppercase tracking-wide">
              Reading Order
              {manualOrder && (
                <span className="ml-2 text-[10px] text-primary/70 normal-case tracking-normal font-normal">manual</span>
              )}
            </p>
            {manualOrder && (
              <button
                type="button"
                onClick={resetToAutoOrder}
                className="flex items-center gap-1 text-[10px] px-1.5 py-0.5 rounded border border-border/40 text-muted-foreground hover:text-foreground transition-colors"
                title="Reset to position-based auto-sort (top→bottom, left→right)"
              >
                <RotateCcw className="w-2.5 h-2.5" />
                Auto-sort
              </button>
            )}
          </div>
          <div className="space-y-0.5 max-h-48 overflow-y-auto">
            {baseDrafts
              .slice()
              .sort((a, b) => a.sequence - b.sequence)
              .map((region, idx, arr) => {
                const color = TYPE_COLORS[region.type] ?? TYPE_COLORS.unknown;
                const isSelected = region.id === selectedId;
                return (
                  <div
                    key={region.id}
                    className={`flex items-center gap-2 px-2 py-1 rounded text-xs cursor-pointer transition-colors ${
                      isSelected ? "bg-primary/10 text-foreground" : "hover:bg-muted/30 text-muted-foreground"
                    }`}
                    onClick={() => setSelectedId(region.id)}
                  >
                    <span className="font-mono w-5 text-center flex-shrink-0 text-muted-foreground/60">
                      {idx + 1}
                    </span>
                    <span
                      className="w-2 h-2 rounded-sm flex-shrink-0"
                      style={{ background: color }}
                    />
                    <span className="flex-1 truncate">{region.type}</span>
                    <span className="text-[10px] text-muted-foreground/40 flex-shrink-0 font-mono">
                      {region.bbox.x.toFixed(0)},{region.bbox.y.toFixed(0)}
                    </span>
                    <div className="flex gap-0.5 flex-shrink-0">
                      <button
                        type="button"
                        onClick={e => { e.stopPropagation(); reorderSequence(idx, "up"); }}
                        disabled={idx === 0}
                        className="p-0.5 rounded hover:bg-muted/50 disabled:opacity-20 transition-colors"
                        title="Move earlier in reading order"
                      >
                        <ArrowUp className="w-3 h-3" />
                      </button>
                      <button
                        type="button"
                        onClick={e => { e.stopPropagation(); reorderSequence(idx, "down"); }}
                        disabled={idx === arr.length - 1}
                        className="p-0.5 rounded hover:bg-muted/50 disabled:opacity-20 transition-colors"
                        title="Move later in reading order"
                      >
                        <ArrowDown className="w-3 h-3" />
                      </button>
                    </div>
                  </div>
                );
              })}
          </div>
        </div>
      )}
    </div>
  );
}
