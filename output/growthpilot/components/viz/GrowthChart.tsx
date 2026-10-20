"use client";

import { useEffect, useRef, useState } from "react";
import { Area, CartesianGrid, ComposedChart, Line, ReferenceArea, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import type { VerticalCoordinatesGenerator } from "recharts/types/cartesian/CartesianGrid";
import type { ProjPoint } from "@/lib/projection";
import { money, compact } from "@/lib/format";
import { usePresence, useReducedMotion } from "@/lib/usePresence";
import { useFirstMountAnimation } from "./useFirstMount";
import { V, lightTick } from "./theme";
import "./growth.css";

/* ---------- small motion helpers shared by the Growth / Timeline screens ---------- */

/** cubic-bezier(0.23, 1, 0.32, 1) - the --ease-out token, solved for JS tweens. */
export function easeOutBezier(t: number): number {
  const x1 = 0.23, y1 = 1, x2 = 0.32, y2 = 1;
  const cx = 3 * x1, bx = 3 * (x2 - x1) - cx, ax = 1 - cx - bx;
  const cy = 3 * y1, by = 3 * (y2 - y1) - cy, ay = 1 - cy - by;
  const sx = (u: number) => ((ax * u + bx) * u + cx) * u;
  const sy = (u: number) => ((ay * u + by) * u + cy) * u;
  const dx = (u: number) => (3 * ax * u + 2 * bx) * u + cx;
  let u = t;
  for (let i = 0; i < 6; i++) {
    const x = sx(u) - t;
    if (Math.abs(x) < 1e-5) break;
    const d = dx(u);
    if (Math.abs(d) < 1e-6) break;
    u -= x / d;
  }
  return sy(Math.max(0, Math.min(1, u)));
}

/** Tweens a number toward `value` over `ms` with the ease-out token; jumps under reduced motion. */
export function useTween(value: number, ms = 600): number {
  const reduce = useReducedMotion();
  const [shown, setShown] = useState(value);
  const from = useRef(value);
  const raf = useRef<number | null>(null);
  useEffect(() => {
    if (reduce) { setShown(value); from.current = value; return; }
    const start = performance.now(), a = from.current, b = value;
    if (a === b) return;
    const tick = (now: number) => {
      const t = Math.min(1, (now - start) / ms);
      const v = a + (b - a) * easeOutBezier(t);
      setShown(v);
      if (t < 1) raf.current = requestAnimationFrame(tick); else from.current = b;
    };
    raf.current = requestAnimationFrame(tick);
    return () => { if (raf.current) cancelAnimationFrame(raf.current); from.current = shown; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value, ms, reduce]);
  return shown;
}

/** A number that ticks to its new value when it changes (indicator follows its control). */
export function TickNumber({ value, format, ms = 600, className }: { value: number; format?: (n: number) => string; ms?: number; className?: string }) {
  const v = useTween(value, ms);
  return <span className={`tnum ${className ?? ""}`}>{format ? format(v) : Math.round(v).toLocaleString()}</span>;
}

/* ---------- chart ---------- */

function Tip({ active, payload, label, isMoney, weekly, metricLabel, milestonesByLabel }: {
  active?: boolean; payload?: { dataKey?: string; value?: number; payload?: ProjPoint }[]; label?: string | number;
  isMoney: boolean; weekly?: boolean; metricLabel: string; milestonesByLabel?: Record<string, number>;
}) {
  if (!active || !payload?.length) return null;
  const f = (n: number) => (isMoney ? money(n) : compact(n));
  const by = (k: string) => payload.find((p) => p.dataKey === k)?.value;
  const plan = by("plan"), projected = by("projected"), goal = by("goal") ?? payload[0]?.payload?.goal;
  const title = weekly ? payload[0]?.payload?.label || "Start" : String(label ?? "");
  const n = !weekly && label != null ? milestonesByLabel?.[String(label)] : undefined;
  return (
    <div className="gx-tip rounded-[12px] border border-black/[0.08] bg-white px-4 py-3 text-[13px] shadow-[0_12px_40px_rgba(17,17,20,.14)]">
      <div className="mb-2 flex items-center justify-between gap-8 text-muted-strong"><span className="font-medium text-ink">{title}</span><span>{metricLabel}</span></div>
      {plan != null && <div className="flex justify-between gap-8"><span className="flex items-center gap-2"><i className="inline-block h-2.5 w-2.5 rounded-[3px]" style={{ background: V.accent }} />Plan</span><span className="tnum font-medium">{f(plan)}</span></div>}
      {projected != null && <div className="mt-1 flex justify-between gap-8"><span className="flex items-center gap-2"><i className="inline-block h-2.5 w-2.5 rounded-[3px]" style={{ border: `1.5px dashed ${V.accent2}` }} />Projected</span><span className="tnum font-medium">{f(projected)}</span></div>}
      {goal != null && <div className="mt-2 flex justify-between gap-8 border-t border-black/[0.06] pt-2 text-muted-strong"><span>Goal</span><span className="tnum">{f(goal)}/mo</span></div>}
      {n != null && <div className="mt-1 text-[12.5px] text-accent">{n === 0 ? "No milestones this month" : `${n} milestone${n === 1 ? "" : "s"} this month`}</div>}
    </div>
  );
}

export interface GrowthChartProps {
  series: ProjPoint[];
  showProjected?: boolean;
  /** category-axis "today" rule (monthly series) */
  todayLabel?: string;
  height?: number;
  isMoney?: boolean;
  compactAxis?: boolean;
  /** Weekly mode: numeric x 0..weeks so the vertical grid falls on the Gantt's column boundaries; x labels hidden. */
  weekly?: boolean;
  weeks?: number;
  /** numeric x of the "today" rule in weekly mode (column centre = week - 0.5) */
  todayX?: number;
  hideYAxis?: boolean;
  margin?: { top: number; right: number; bottom: number; left: number };
  minWidth?: number;
  /** name shown in the tooltip header (Revenue / Visitors / Leads) */
  metricLabel?: string;
  /** monthly mode: label -> number of milestones, for the tooltip */
  milestonesByLabel?: Record<string, number>;
  /** monthly mode: highlight this month's band (hover from the table) and report hovered months */
  hotLabel?: string | null;
  onHoverLabel?: (label: string | null) => void;
  /** weekly mode: highlight this week's column and report hovered weeks (1-based) */
  hotWeek?: number | null;
  onHoverWeek?: (week: number | null) => void;
  /** fixed Y range (weekly mode): [0, yMax] with these ticks; the goal line is drawn only when it falls inside */
  yMax?: number;
  yTicks?: number[];
}

/**
 * The reference's revenue chart: solid accent area ("Plan"), dashed accent2
 * line ("Projected"), a thin green goal line and a vertical "today" rule.
 * Hover shows a card and a crosshair; the projected line draws in when
 * enabled and fades when disabled; a hovered month/week gets a soft band.
 */
export function GrowthChart({
  series, showProjected = true, todayLabel, height = 360, isMoney = true, compactAxis = false,
  weekly = false, weeks = 13, todayX, hideYAxis = false, margin, minWidth = 520,
  metricLabel = "Revenue", milestonesByLabel, hotLabel, onHoverLabel, hotWeek, onHoverWeek, yMax, yTicks,
}: GrowthChartProps) {
  void compactAxis;
  const anim = useFirstMountAnimation();
  const reduce = useReducedMotion();
  const fmt = (n: number) => (isMoney ? money(n, 0) : compact(n));
  const m = margin ?? { top: 16, right: 24, bottom: 0, left: 8 };

  // projected line: stays mounted 200 ms while fading out; remounts (= draws in) on each enable
  const proj = usePresence(showProjected, 200);
  const [projKey, setProjKey] = useState(0);
  useEffect(() => { if (showProjected) setProjKey((k) => k + 1); }, [showProjected]);

  const hover = (state: { activeLabel?: string | number; isTooltipActive?: boolean } | null) => {
    if (!state || !state.isTooltipActive || state.activeLabel == null) { onHoverLabel?.(null); onHoverWeek?.(null); return; }
    if (weekly) onHoverWeek?.(Math.max(1, Math.min(weeks, Math.ceil(Number(state.activeLabel)))));
    else onHoverLabel?.(String(state.activeLabel));
  };

  return (
    <div style={{ height, minWidth: weekly ? 0 : minWidth }} className="w-full">
      <ResponsiveContainer width="100%" height="100%">
        <ComposedChart data={series} margin={m} onMouseMove={hover} onMouseLeave={() => { onHoverLabel?.(null); onHoverWeek?.(null); }}>
          <defs>
            <linearGradient id="planFill" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={V.accent} stopOpacity={0.22} />
              <stop offset="100%" stopColor={V.accent} stopOpacity={0.02} />
            </linearGradient>
          </defs>
          <CartesianGrid
            stroke={V.grid} vertical={true} horizontal={false}
            verticalCoordinatesGenerator={weekly ? (({ offset }: { offset: { left: number; width: number } }) => Array.from({ length: weeks + 1 }, (_, i) => offset.left + (offset.width * i) / weeks)) as unknown as VerticalCoordinatesGenerator : undefined}
          />
          {weekly ? (
            <XAxis dataKey="w" type="number" domain={[0, weeks]} ticks={Array.from({ length: weeks + 1 }, (_, i) => i)} interval={0} tick={false} axisLine={false} tickLine={false} height={2} />
          ) : (
            <XAxis dataKey="label" tick={lightTick} axisLine={false} tickLine={false} interval="preserveStartEnd" minTickGap={32} />
          )}
          <YAxis tick={lightTick} axisLine={false} tickLine={false} tickFormatter={fmt} width={hideYAxis ? 0 : 56} hide={hideYAxis}
            domain={yMax ? [0, yMax] : undefined} ticks={yTicks} allowDataOverflow={!!yMax} />
          <Tooltip content={<Tip isMoney={isMoney} weekly={weekly} metricLabel={metricLabel} milestonesByLabel={milestonesByLabel} />} cursor={{ stroke: V.accent2, strokeWidth: 1, strokeDasharray: "3 3" }} isAnimationActive={false} />
          {!weekly && hotLabel && <ReferenceArea x1={hotLabel} x2={hotLabel} className="gx-band" fill={V.accent} fillOpacity={0.07} stroke="none" ifOverflow="extendDomain" />}
          {weekly && hotWeek != null && <ReferenceArea x1={hotWeek - 1} x2={hotWeek} className="gx-band" fill={V.accent2} fillOpacity={0.07} stroke="none" />}
          {(!yMax || (series[0]?.goal ?? 0) <= yMax) && <ReferenceLine y={series[0]?.goal ?? 0} stroke={V.success} strokeWidth={1.5} ifOverflow={yMax ? "hidden" : "extendDomain"} />}
          {yMax && yTicks && <CartesianGrid stroke={V.grid} vertical={false} horizontal horizontalValues={yTicks} />}
          {weekly && todayX != null && <ReferenceLine x={todayX} stroke={V.accent2} strokeWidth={2} />}
          {!weekly && todayLabel && <ReferenceLine x={todayLabel} stroke={V.accent2} strokeWidth={1.5} />}
          {/* the data swap on a metric change morphs in place (300 ms ease-out); first mount draws in (500 ms) */}
          <Area type="monotone" dataKey="plan" stroke={V.accent} strokeWidth={2.5} fill="url(#planFill)" isAnimationActive={!reduce} animationDuration={anim ? 500 : 300} animationEasing="ease-out" dot={false} activeDot={{ r: 4, fill: V.accent, stroke: "#fff", strokeWidth: 2 }} />
          {proj.mounted && (
            <Line key={projKey} type="monotone" dataKey="projected" className={`gx-proj${proj.closing ? " is-off" : ""}`} stroke={V.accent2} strokeWidth={2} strokeDasharray="5 5" dot={false} isAnimationActive={false} activeDot={{ r: 4, fill: V.accent2, stroke: "#fff", strokeWidth: 2 }} />
          )}
        </ComposedChart>
      </ResponsiveContainer>
    </div>
  );
}

export function ChartLegend({ showProjected, note }: { showProjected: boolean; note?: string }) {
  const Sq = ({ color, dashed }: { color: string; dashed?: boolean }) => (
    <span className="inline-block h-3 w-3 rounded-[3px]" style={dashed ? { border: `1.5px dashed ${color}` } : { background: color }} aria-hidden />
  );
  return (
    <div className="flex flex-wrap items-center gap-4 text-[13px] text-muted-strong">
      <span className="flex items-center gap-2"><Sq color={V.accent} /> Plan</span>
      <span className={`flex items-center gap-2 transition-opacity duration-200 ${showProjected ? "opacity-100" : "opacity-40"}`}><Sq color={V.accent2} dashed /> Projected</span>
      <span className="flex items-center gap-2"><span className="inline-block h-[2px] w-3" style={{ background: V.success }} /> Goal</span>
      {note && <span className="text-[12px]">{note}</span>}
    </div>
  );
}
