"use client";

import { useLayoutEffect, useMemo, useRef, useState } from "react";
import type { SpendBucket } from "@/lib/projection";
import { ROI_COLOR, V } from "./theme";
import "./interact.css";

export interface Bubble {
  id: string; label: string; spend: SpendBucket; usd?: number; impact: 1 | 2 | 3; score: number; roi: "low" | "mid" | "high"; selected?: boolean;
  channel?: string; agent?: string; costLabel?: string;
}

const H = 340;
const M = { top: 24, right: 24, bottom: 12, left: 24 };
const AXIS_W = 40; // rotated impact labels
const LABEL_FS = 12;
const CHAR_W = 6.8; // fallback glyph width at 12px when canvas measurement is unavailable
let measureCtx: CanvasRenderingContext2D | null = null;
function textWidth(t: string): number {
  if (typeof document === "undefined") return t.length * CHAR_W;
  if (!measureCtx) {
    measureCtx = document.createElement("canvas").getContext("2d");
    if (measureCtx) measureCtx.font = `${LABEL_FS}px ${getComputedStyle(document.body).fontFamily}`;
  }
  return measureCtx ? measureCtx.measureText(t).width : t.length * CHAR_W;
}
const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));
const short = (t: string) => (t.length > 24 ? t.slice(0, 23) + "…" : t);

type Rect = { x: number; y: number; w: number; h: number };
const hit = (a: Rect, b: Rect) => a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;
const hitCircle = (r: Rect, cx: number, cy: number, rad: number) => {
  const nx = clamp(cx, r.x, r.x + r.w), ny = clamp(cy, r.y, r.y + r.h);
  return (nx - cx) ** 2 + (ny - cy) ** 2 < rad * rad;
};

type Laid = Bubble & { cx: number; cy: number; r: number; lx: number; ly: number; label2: string };

/** Data -> pixel layout: bands for spend (high spend on the left, as in the reference) and impact,
 *  radius scaled with plot width, overlapping bubbles pushed apart inside their bands, and each
 *  label placed in the first free slot (below, above, then lower rows) against every bubble and label. */
function layout(bubbles: Bubble[], width: number): Laid[] {
  const pw = Math.max(200, width - AXIS_W - M.left - M.right);
  const ph = H - M.top - M.bottom;
  const px = (x: number) => AXIS_W + M.left + (x / 3) * pw;
  const py = (y: number) => M.top + ((3.6 - y) / 3.2) * ph;
  const usdOf = (b: Bubble) => b.usd ?? { low: 250, medium: 1200, high: 6000 }[b.spend];
  const bandStart: Record<SpendBucket, number> = { high: 0, medium: 1, low: 2 };
  const xOf = new Map<string, number>();
  const oneBucket = bubbles.length > 1 && new Set(bubbles.map((b) => b.spend)).size === 1;
  if (oneBucket) {
    const ranked = [...bubbles].sort((a, b) => usdOf(b) - usdOf(a) || b.score - a.score);
    ranked.forEach((b, i) => xOf.set(b.id, 3 * (0.08 + 0.84 * (i / Math.max(1, ranked.length - 1)))));
  } else {
    const groups = new Map<SpendBucket, Bubble[]>();
    for (const b of bubbles) groups.set(b.spend, [...(groups.get(b.spend) ?? []), b]);
    for (const [k, list] of groups) {
      const sorted = [...list].sort((a, b) => usdOf(b) - usdOf(a) || b.score - a.score);
      sorted.forEach((b, i) => xOf.set(b.id, bandStart[k] + (sorted.length === 1 ? 0.5 : 0.12 + 0.76 * (i / (sorted.length - 1)))));
    }
  }
  const pts = bubbles.map((b) => ({
    b, cx: px(xOf.get(b.id) ?? 1.5), cy: py(b.impact),
    r: clamp(pw / 60 + (b.score / 100) * 18, 10, 32),
    yMin: py(b.impact + 0.42), yMax: py(b.impact - 0.42),
  }));
  // push apart: relax pairwise overlaps (labels need a gap too), keeping each bubble in its impact band
  for (let it = 0; it < 60; it++) {
    let moved = false;
    for (let i = 0; i < pts.length; i++) for (let j = i + 1; j < pts.length; j++) {
      const a = pts[i], c = pts[j];
      const dx = c.cx - a.cx, dy = c.cy - a.cy;
      const d = Math.hypot(dx, dy) || 0.01, need = a.r + c.r + 6;
      if (d < need) {
        const push = (need - d) / 2, ux = dx / d || 1, uy = dy / d;
        a.cx -= ux * push; c.cx += ux * push; a.cy -= uy * push * 0.6; c.cy += uy * push * 0.6;
        moved = true;
      }
    }
    for (const p of pts) {
      p.cx = clamp(p.cx, AXIS_W + M.left + p.r, AXIS_W + M.left + pw - p.r);
      p.cy = clamp(p.cy, Math.max(p.yMin, M.top + p.r), Math.min(p.yMax, M.top + ph - p.r));
    }
    if (!moved) break;
  }
  // labels: biggest bubbles choose first
  const placed: Rect[] = [];
  const order = [...pts].sort((a, b) => b.b.score - a.b.score);
  const out = new Map<string, Laid>();
  for (const p of order) {
    const text = short(p.b.label);
    const w = textWidth(text) + 10, h = LABEL_FS + 4;
    const cand = [p.cy + p.r + 4, p.cy - p.r - 4 - h, p.cy + p.r + 4 + h, p.cy - p.r - 4 - 2 * h, p.cy + p.r + 4 + 2 * h, p.cy - p.r - 4 - 3 * h, p.cy + p.r + 4 + 3 * h, p.cy - h / 2];
    const shifts = [0, -w / 3, w / 3, -w / 2 - 6, w / 2 + 6, -w, w];
    let best: Rect | null = null;
    for (const top of cand) {
      for (const sh of shifts) {
        const r: Rect = { x: clamp(p.cx - w / 2 + sh, AXIS_W, AXIS_W + M.left + pw + M.right - w), y: top, w, h };
        if (r.y < 0 || r.y + r.h > H) continue;
        if (placed.some((q) => hit(q, r))) continue;
        if (pts.some((o) => hitCircle(r, o.cx, o.cy, o.r + 1))) continue;
        best = r; break;
      }
      if (best) break;
    }
    best ??= { x: p.cx - w / 2, y: p.cy + p.r + 4, w, h };
    placed.push(best);
    out.set(p.b.id, { ...p.b, cx: p.cx, cy: p.cy, r: p.r, lx: best.x + best.w / 2, ly: best.y + LABEL_FS, label2: text });
  }
  return bubbles.map((b) => out.get(b.id)!);
}

/** Impact x spend bubble chart, sized by priority and coloured by ROI bucket. */
export function BubbleChart({ bubbles, onPick, hotId = null, onHover, popId = null, popKey = 0 }: { bubbles: Bubble[]; onPick?: (id: string) => void; hotId?: string | null; onHover?: (id: string | null) => void; popId?: string | null; popKey?: number }) {
  const ref = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(900);
  useLayoutEffect(() => {
    const el = ref.current; if (!el) return;
    const ro = new ResizeObserver(([e]) => setWidth(Math.round(e.contentRect.width)));
    ro.observe(el); setWidth(el.clientWidth);
    return () => ro.disconnect();
  }, []);
  const laid = useMemo(() => layout(bubbles, width), [bubbles, width]);
  const hot = laid.find((b) => b.id === hotId) ?? null;
  const pw = Math.max(200, width - AXIS_W - M.left - M.right);
  const ph = H - M.top - M.bottom;
  const gx = (x: number) => AXIS_W + M.left + (x / 3) * pw;
  const gy = (y: number) => M.top + ((3.6 - y) / 3.2) * ph;
  return (
    <div className="relative w-full min-w-[640px]" onMouseLeave={() => onHover?.(null)}>
      <div ref={ref} className="relative h-[340px] w-full">
        <div className="pointer-events-none absolute left-0 top-0 flex h-full w-10 flex-col justify-around pb-3 text-[12.5px] text-muted-strong">
          {["High impact", "Medium impact", "Low impact"].map((t) => <span key={t} className="-rotate-90 whitespace-nowrap">{t}</span>)}
        </div>
        <svg width={width} height={H} className="block overflow-visible" role="group" aria-label="Ideas by impact and spend">
          {[1, 2].map((x) => <line key={`x${x}`} x1={gx(x)} x2={gx(x)} y1={M.top} y2={M.top + ph} stroke={V.grid} />)}
          {[1.5, 2.5].map((y) => <line key={`y${y}`} x1={AXIS_W + M.left} x2={AXIS_W + M.left + pw} y1={gy(y)} y2={gy(y)} stroke={V.grid} />)}
          {laid.map((b, index) => {
            const color = ROI_COLOR[b.roi];
            const isHot = hotId === b.id, dim = !!hotId && !isHot;
            const stroke = isHot ? V.ink : b.selected ? V.accent : color;
            return (
              <g key={b.id} className={`bubble${dim ? " ix-dim" : ""}${isHot ? " ix-hot" : ""}`} style={{ ["--i" as string]: index, cursor: "pointer", outline: "none" }}
                tabIndex={0} role="button" aria-pressed={!!b.selected} aria-label={`${b.label}, priority ${b.score}`} data-bubble={b.id}
                onMouseEnter={() => onHover?.(b.id)} onMouseLeave={() => onHover?.(null)} onFocus={() => onHover?.(b.id)} onBlur={() => onHover?.(null)}
                onClick={() => onPick?.(b.id)}
                onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); onPick?.(b.id); } }}>
                <circle key={popId === b.id ? `pop-${popKey}` : "still"} className={popId === b.id ? "ix-pop" : undefined} cx={b.cx} cy={b.cy} r={b.r} fill={color} fillOpacity={b.selected ? 0.95 : 0.55} stroke={stroke} strokeWidth={isHot ? 2 : b.selected ? 3 : 1.5} data-bubble-circle="" />
                <text x={b.lx} y={b.ly} textAnchor="middle" fontSize={LABEL_FS} fontWeight={isHot ? 600 : 400} fill={isHot ? V.ink : V.muted} data-bubble-label="">{b.label2}</text>
              </g>
            );
          })}
        </svg>
        {hot && (
          <div className="toast-in pointer-events-none absolute z-10 w-[240px] rounded-[12px] border border-black/[0.08] bg-white px-4 py-3 text-[13px] shadow-[0_12px_40px_rgba(17,17,20,.14)]"
            style={{ left: clamp(hot.cx + hot.r + 12, 0, width - 252), top: clamp(hot.cy - 40, 0, H - 120) }}>
            <div className="font-medium">{hot.label}</div>
            {hot.channel && <div className="text-muted-strong">{hot.channel}</div>}
            <div className="mt-1.5 grid grid-cols-[auto_1fr] gap-x-4 gap-y-0.5 text-[12.5px] text-muted-strong">
              <span>Priority</span><span className="tnum text-ink">{hot.score}</span>
              <span>Impact</span><span className="text-ink">{["Low", "Medium", "High"][hot.impact - 1]}</span>
              <span>Est. cost</span><span className="text-ink">{hot.costLabel ?? `${hot.spend} spend`}</span>
              {hot.agent && <><span>Agent</span><span className="text-ink">{hot.agent}</span></>}
            </div>
          </div>
        )}
      </div>
      <div className="grid grid-cols-3 text-center text-[13px] text-muted-strong" style={{ marginLeft: AXIS_W + M.left, marginRight: M.right }}>
        <span>High spend</span><span>Medium spend</span><span>Low spend</span>
      </div>
    </div>
  );
}

export function BubbleLegend() {
  return (
    <div className="flex flex-wrap items-center gap-4 text-[13px] text-muted-strong">
      <span>Bubble size represents priority</span>
      <span className="flex items-center gap-3">ROI estimate:
        {(["low", "mid", "high"] as const).map((k, i) => (
          <span key={k} className="flex items-center gap-1.5"><span className="h-3 w-3 rounded-full" style={{ background: ROI_COLOR[k] }} />{["< 30%", "30-74%", "75% +"][i]}</span>
        ))}
      </span>
    </div>
  );
}
