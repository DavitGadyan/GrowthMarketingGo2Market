"use client";

import { useEffect, useId, useRef, useState, type KeyboardEvent, type MouseEvent } from "react";
import { V } from "./theme";
import { Pill } from "./Avatar";
import { useReducedMotion } from "@/lib/usePresence";
import type { Lens } from "@/lib/types";
import "./gauge.css";

export const LENS_ORDER = ["resource_alignment", "strategic_alignment", "metric_feasibility"] as const;
export const LENS_LABEL: Record<string, string> = { resource_alignment: "Resource alignment", strategic_alignment: "Strategic alignment", metric_feasibility: "Metric feasibility" };
export const LENS_SHORT: Record<string, string> = { resource_alignment: "Resource", strategic_alignment: "Strategy", metric_feasibility: "Metrics" };
export const VERDICT_COLOR: Record<Lens["verdict"], string> = { pass: V.success, concern: V.orange, fail: V.danger };
export const VERDICT_TONE: Record<Lens["verdict"], "success" | "warn" | "danger"> = { pass: "success", concern: "warn", fail: "danger" };
const MISSING = "rgba(0,0,0,0.08)";

/** Cubic-bezier solver so the centre number follows the needle's --ease-out curve exactly. */
function cubicBezier(p1x: number, p1y: number, p2x: number, p2y: number) {
  const cx = 3 * p1x, bx = 3 * (p2x - p1x) - cx, ax = 1 - cx - bx;
  const cy = 3 * p1y, by = 3 * (p2y - p1y) - cy, ay = 1 - cy - by;
  const sx = (t: number) => ((ax * t + bx) * t + cx) * t;
  const sy = (t: number) => ((ay * t + by) * t + cy) * t;
  const dx = (t: number) => (3 * ax * t + 2 * bx) * t + cx;
  return (x: number) => {
    let t = x;
    for (let i = 0; i < 8; i++) { const e = sx(t) - x; if (Math.abs(e) < 1e-5) break; const d = dx(t); if (Math.abs(d) < 1e-6) break; t -= e / d; }
    return sy(Math.max(0, Math.min(1, t)));
  };
}
const easeOut = cubicBezier(0.23, 1, 0.32, 1);

/** Point on the left→right semicircle; `u` in 0..1. */
const pt = (cx: number, cy: number, r: number, u: number) => { const a = Math.PI * (1 - u); return [cx + r * Math.cos(a), cy - r * Math.sin(a)] as const; };
function arcPath(cx: number, cy: number, r: number, from: number, to: number) {
  const [x0, y0] = pt(cx, cy, r, from), [x1, y1] = pt(cx, cy, r, to);
  return `M ${x0.toFixed(2)} ${y0.toFixed(2)} A ${r} ${r} 0 0 1 ${x1.toFixed(2)} ${y1.toFixed(2)}`;
}

export type GaugeProps = {
  value: number;
  max?: number;
  size?: number;
  lenses?: Lens[];
  /** Lens key currently selected elsewhere (keeps its segment thick). */
  activeLens?: string | null;
  onSelectLens?: (lens: string) => void;
  onOpen?: () => void;
  mini?: boolean;
};

/**
 * Three-lens readiness gauge: one arc segment per review lens coloured by its
 * verdict, a needle that sweeps to `value`, and a tooltip per segment.
 */
export function Gauge({ value, max = 100, size = 220, lenses = [], activeLens = null, onSelectLens, onOpen, mini = false }: GaugeProps) {
  const reduce = useReducedMotion();
  const id = useId();
  const t = Math.max(0, Math.min(1, value / max));
  const byKey = new Map(lenses.map((l) => [l.lens, l]));

  // Needle: drawn pointing right, rotated -180° (=0%) at mount, then to its value so it sweeps once; re-sweeps on change.
  const [armed, setArmed] = useState(false);
  useEffect(() => { const raf = requestAnimationFrame(() => setArmed(true)); return () => cancelAnimationFrame(raf); }, []);
  const angle = armed || reduce ? -180 + t * 180 : -180;

  // The centre number follows the needle on the same curve and duration.
  const shownRef = useRef(reduce ? value : 0);
  const [shown, setShown] = useState(shownRef.current);
  useEffect(() => {
    if (reduce) { shownRef.current = value; setShown(value); return; }
    const from = shownRef.current, to = value, start = performance.now(), dur = 900;
    let raf = 0;
    const step = (now: number) => {
      const x = Math.min(1, (now - start) / dur);
      const v = from + (to - from) * easeOut(x);
      shownRef.current = v; setShown(v);
      if (x < 1) raf = requestAnimationFrame(step);
    };
    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
  }, [value, reduce]);

  const [hover, setHover] = useState<string | null>(null);
  const [pinned, setPinned] = useState<string | null>(null);
  const [focused, setFocused] = useState<string | null>(null);
  const active = pinned ?? hover ?? focused;
  const select = (key: string) => { setPinned((p) => (p === key ? null : key)); onSelectLens?.(key); };
  const onKey = (e: KeyboardEvent<SVGElement>, key: string) => {
    if (e.key === "Enter" || e.key === " ") { e.preventDefault(); select(key); }
    if (e.key === "Escape") { setPinned(null); setHover(null); setFocused(null); (e.currentTarget as SVGElement).blur(); }
  };

  if (mini) {
    const W = 72, H = 40, cx = 36, cy = 34, r = 26;
    return (
      <svg width={W} height={H} viewBox={`0 0 ${W} ${H}`} role="img" aria-label={`${Math.round(value)}% plan readiness`} className="gauge-mini">
        <g className="gauge-segs">
          {LENS_ORDER.map((key, i) => { const l = byKey.get(key); const g = 5 / r / Math.PI; return <path key={key} d={arcPath(cx, cy, r, i / 3 + (i ? g / 2 : 0), (i + 1) / 3 - (i < 2 ? g / 2 : 0))} fill="none" stroke={l ? VERDICT_COLOR[l.verdict] : MISSING} strokeWidth={6} strokeLinecap="round" />; })}
        </g>
        <g className="gauge-needle-g" style={{ transform: `rotate(${angle}deg)`, transformOrigin: `${cx}px ${cy}px` }}>
          <line x1={cx} y1={cy} x2={cx + r - 4} y2={cy} stroke={V.ink} strokeWidth={2} strokeLinecap="round" />
        </g>
        <circle cx={cx} cy={cy} r={3} fill={V.ink} />
      </svg>
    );
  }

  const W = 220, H = 146, cx = 110, cy = 108, r = 78, sw = 14;
  const gap = (2 + 16) / r / Math.PI; // 2px visual gap after the round caps, as a fraction of the semicircle
  const ticks = [0, 25, 50, 75, 100];
  const tip = active ? byKey.get(active) : undefined;

  return (
    <div className="gauge" style={{ width: size }} onMouseLeave={() => setHover(null)}>
      {tip && (
        <div className="gauge-tip toast-in" role="tooltip" id={`${id}-tip`}>
          <div className="flex items-center justify-between gap-2">
            <span className="text-[13px] font-medium">{LENS_LABEL[tip.lens] ?? tip.lens}</span>
            <Pill tone={VERDICT_TONE[tip.verdict]}>{tip.verdict}</Pill>
          </div>
          <p className="mt-1.5 text-[13px] leading-5 text-ink/90">{tip.finding}</p>
          {tip.fix && tip.fix.toLowerCase() !== "none" && <p className="mt-1.5 text-[12.5px] leading-[18px] text-muted-strong"><span className="font-medium text-ink">Fix:</span> {tip.fix}</p>}
        </div>
      )}
      <svg viewBox={`0 0 ${W} ${H}`} width={W} height={H} role="group" aria-label={`${Math.round(value)}% plan readiness, three review lenses`}>
        {/* ticks */}
        {ticks.map((v) => {
          const u = v / 100; const [x, y] = pt(cx, cy, r + 17, u);
          const [lx1, ly1] = pt(cx, cy, r + 10, u), [lx2, ly2] = pt(cx, cy, r + 13, u);
          return (
            <g key={v}>
              <line x1={lx1} y1={ly1} x2={lx2} y2={ly2} stroke="rgba(0,0,0,.18)" strokeWidth={1} />
              <text x={x} y={y + (v === 0 || v === 100 ? 4 : v === 50 ? 0 : 2)} textAnchor={v === 0 ? "end" : v === 100 ? "start" : "middle"} fontSize={11} fill="#8A8A8F" className="font-mono">{v}</text>
            </g>
          );
        })}
        {/* three lens segments */}
        <g className="gauge-segs">
          {LENS_ORDER.map((key, i) => {
            const l = byKey.get(key);
            const from = i / 3 + (i ? gap / 2 : 0), to = (i + 1) / 3 - (i < 2 ? gap / 2 : 0);
            const label = l ? `${LENS_LABEL[key]}: ${l.verdict}. ${l.finding}` : `${LENS_LABEL[key]}: not reviewed`;
            return (
              <path
                key={key}
                className="gauge-seg"
                d={arcPath(cx, cy, r, from, to)}
                fill="none"
                stroke={l ? VERDICT_COLOR[l.verdict] : MISSING}
                strokeWidth={sw}
                strokeLinecap="round"
                role="button"
                tabIndex={0}
                aria-label={label}
                aria-pressed={pinned === key || activeLens === key}
                aria-describedby={active === key ? `${id}-tip` : undefined}
                data-active={active === key || activeLens === key ? "true" : undefined}
                onMouseEnter={() => setHover(key)}
                onMouseLeave={() => setHover(null)}
                onFocus={() => setFocused(key)}
                onBlur={() => setFocused((f) => (f === key ? null : f))}
                onClick={() => select(key)}
                onKeyDown={(e) => onKey(e, key)}
              />
            );
          })}
        </g>
        {/* keyboard focus ring: a thin outer arc over the focused segment */}
        {focused && (() => { const i = LENS_ORDER.indexOf(focused as (typeof LENS_ORDER)[number]); if (i < 0) return null; return <path className="gauge-ring" d={arcPath(cx, cy, r + 12, i / 3 + (i ? gap / 2 : 0), (i + 1) / 3 - (i < 2 ? gap / 2 : 0))} fill="none" stroke={V.accent} strokeWidth={2} strokeLinecap="round" />; })()}
        {/* needle */}
        <g className="gauge-needle-g" style={{ transform: `rotate(${angle}deg)`, transformOrigin: `${cx}px ${cy}px` }}>
          <line x1={cx} y1={cy} x2={cx + r - 6} y2={cy} stroke={V.ink} strokeWidth={3} strokeLinecap="round" />
        </g>
        <circle cx={cx} cy={cy} r={5} fill={V.ink} />
        <text
          x={cx} y={H - 8} textAnchor="middle" fontSize={18} fontWeight={600} fill={V.ink}
          className="gauge-value tnum font-display" role="button" tabIndex={0} aria-label="Open the review details"
          onClick={(e: MouseEvent<SVGTextElement>) => { e.stopPropagation(); onOpen?.(); }}
          onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); onOpen?.(); } }}
        >
          {Math.round(shown)}%
        </text>
      </svg>
      <div className="gauge-legend" aria-label="Review lenses">
        {LENS_ORDER.map((key) => {
          const l = byKey.get(key);
          return (
            <button key={key} type="button" data-active={active === key || activeLens === key ? "true" : undefined} aria-label={`${LENS_LABEL[key]}${l ? `: ${l.verdict}` : ""}`}
              onMouseEnter={() => setHover(key)} onMouseLeave={() => setHover(null)} onFocus={() => setFocused(key)} onBlur={() => setFocused((f) => (f === key ? null : f))} onClick={() => select(key)}>
              <span className="dot" style={{ background: l ? VERDICT_COLOR[l.verdict] : MISSING }} />
              {LENS_SHORT[key]}
            </button>
          );
        })}
      </div>
    </div>
  );
}
