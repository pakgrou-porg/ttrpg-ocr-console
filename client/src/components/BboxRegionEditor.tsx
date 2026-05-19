import { useMemo, useRef, useState, type PointerEvent } from "react";
import { Move, Plus, Trash2 } from "lucide-react";
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
  "text",
  "heading",
  "subheading",
  "table",
  "stat_block",
  "illustration",
  "map",
  "graphic",
  "advertisement",
  "header",
  "footer",
  "page_number",
  "caption",
  "sidebar",
  "callout",
  "unknown",
] as const;

type Box = { x: number; y: number; w: number; h: number };
type DraftRegion = BboxRegion & {
  id: string;
  sequence: number;
  type: string;
  regionType: string;
  bbox: Box;
};

const TYPE_COLORS: Record<string, string> = {
  heading: "#a855f7",
  subheading: "#c084fc",
  text: "#3b82f6",
  table: "#f97316",
  stat_block: "#eab308",
  illustration: "#22c55e",
  map: "#4ade80",
  graphic: "#86efac",
  advertisement: "#fb7185",
  header: "#6b7280",
  footer: "#6b7280",
  page_number: "#9ca3af",
  caption: "#94a3b8",
  sidebar: "#14b8a6",
  callout: "#2dd4bf",
  unknown: "#94a3b8",
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
    const type = String(region.type ?? region.regionType ?? "unknown");
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
  const [drawType, setDrawType] = useState<string>("text");
  const [interaction, setInteraction] = useState<null | {
    mode: "draw" | "move" | "resize";
    id?: string;
    start: { x: number; y: number };
    original?: Box;
  }>(null);
  const surfaceRef = useRef<HTMLDivElement>(null);

  const selected = baseDrafts.find(r => r.id === selectedId) ?? baseDrafts[0] ?? null;

  // Sort by reading order (top-to-bottom, left-to-right) FIRST, then assign
  // sequential numbers so the sequence field matches physical page order.
  // The pipeline uses sequence order when constructing OCR context.
  const emit = (drafts: DraftRegion[]) => onChange(serialiseDrafts(
    drafts
      .sort((a, b) => (a.bbox.y - b.bbox.y) || (a.bbox.x - b.bbox.x))
      .map((r, index) => ({ ...r, sequence: index + 1 })),
  ));

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

  const setSelectedBoxNumber = (key: keyof Box, value: string) => {
    if (!selected) return;
    const numeric = Number(value);
    if (!Number.isFinite(numeric)) return;
    const bbox = { [key]: clamp(numeric, 0, key === "w" || key === "h" ? 100 : 99) } as Partial<Box>;
    updateRegion(selected.id, { bbox });
  };

  return (
    <div className="space-y-2">
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
      </div>

      <div
        ref={surfaceRef}
        className="relative overflow-hidden rounded border border-border/50 bg-muted/10 touch-none"
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
              <span className="absolute left-1 top-1 rounded bg-background/80 px-1 py-0.5 text-[10px] font-mono text-foreground">
                {region.type}
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
    </div>
  );
}
