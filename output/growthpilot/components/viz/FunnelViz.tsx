"use client";

import { useEffect, useRef, useState } from "react";
import type { FunnelStageViz } from "@/lib/projection";
import { compact, money } from "@/lib/format";
import { useReducedMotion } from "@/lib/usePresence";
import { easeOutBezier } from "./GrowthChart";
import { V } from "./theme";
import "./growth.css";

const W = 900, H = 170, MID = 120;
const baseHH = (n: number) => Array.from({ length: n }, (_, i) => Math.max(4, 52 * Math.pow(0.42, i)));

/** Band half-heights: the index-based taper, scaled by how far each stage moved from its baseline (clamped). */
function targetHH(stages: FunnelStageViz[], ghost?: FunnelStageViz[]): number[] {
  return baseHH(stages.length).map((h, i) => {
    const g = ghost?.[i]?.value, v = stages[i]?.value;
    if (!ghost || !g || !v) return h;
    return h * Math.max(0.6, Math.min(1.4, Math.sqrt(v / g)));
  });
}

/**
 * The strategy modal's funnel: a tint-cyan band that tapers monotonically from
 * Visitors to a hairline at Revenue (half-heights by stage index, not by value -
 * the values span five orders of magnitude), dashed stage rules, label + value
 * above the band, and the conversion chips on one shared baseline under it.
 * When `ghost` (the current plan) is given, the band reshapes toward the edited
 * values (250 ms ease-out tween) and the ghost outline stays as the comparison.
 */
export function FunnelViz({ stages, ghost, showGhost = false }: { stages: FunnelStageViz[]; ghost?: FunnelStageViz[]; showGhost?: boolean }) {
  const n = stages.length;
  const colW = W / n;
  const reduce = useReducedMotion();
  const target = targetHH(stages, ghost);
  const [hh, setHH] = useState<number[]>(target);
  const from = useRef<number[]>(target);
  const raf = useRef<number | null>(null);
  const key = target.map((x) => x.toFixed(2)).join(",");
  useEffect(() => {
    if (reduce) { setHH(target); from.current = target; return; }
    const a = from.current, b = target, start = performance.now();
    if (a.length !== b.length) { setHH(b); from.current = b; return; }
    const tick = (now: number) => {
      const t = Math.min(1, (now - start) / 250), e = easeOutBezier(t);
      const cur = b.map((v, i) => a[i] + (v - a[i]) * e);
      setHH(cur);
      if (t < 1) raf.current = requestAnimationFrame(tick); else from.current = b;
    };
    raf.current = requestAnimationFrame(tick);
    return () => { if (raf.current) cancelAnimationFrame(raf.current); from.current = hh; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, reduce]);

  const band = (h: number[]) => {
    const yTop = (i: number) => MID - h[i], yBot = (i: number) => MID + h[i];
    const top = stages.map((_, i) => `${i === 0 ? "M" : "L"} ${i * colW} ${yTop(i)}`).join(" ") + ` L ${W} ${yTop(n - 1)}`;
    const bot = ` L ${W} ${yBot(n - 1)} ` + stages.map((_, i) => `L ${(n - 1 - i) * colW} ${yBot(n - 1 - i)}`).join(" ") + " Z";
    return top + bot;
  };
  const top0 = Math.max(hh[0] ?? 52, baseHH(n)[0]);
  const chipY = MID + top0 + 14; // one baseline for every chip
  const fmt = (s: FunnelStageViz) => (s.key === "revenue" ? money(s.value) : compact(s.value));
  const ghostHH = ghost ? baseHH(n) : null;

  return (
    <div className="overflow-x-auto">
      <svg viewBox={`0 0 ${W} ${H + 60}`} className="h-auto w-full min-w-[640px]" role="img" aria-label="Funnel from visitors to revenue">
        <defs>
          <linearGradient id="funnelFill" x1="0" x2="1">
            <stop offset="0%" stopColor={V.cyan} stopOpacity={0.55} />
            <stop offset="100%" stopColor={V.cyan} stopOpacity={0.2} />
          </linearGradient>
        </defs>
        {showGhost && ghostHH && <path d={band(ghostHH)} fill={V.cyan} fillOpacity={0.08} stroke={V.cyan} strokeOpacity={0.7} strokeWidth={1.5} strokeDasharray="6 5" className="content-enter" />}
        <path d={band(hh)} fill="url(#funnelFill)" />
        {stages.map((s, i) => {
          const chipW = s.conv ? Math.max(84, s.conv.length * 9 + 28) : 0;
          const bx = (i + 1) * colW;
          const gv = showGhost && ghost?.[i] && ghost[i].value !== s.value ? ghost[i] : null;
          return (
            <g key={s.key}>
              {i > 0 && <line x1={i * colW} x2={i * colW} y1={8} y2={H + 8} stroke="rgba(0,0,0,.18)" strokeDasharray="4 4" />}
              <text x={i * colW + 16} y={MID - 52 - 34} fontSize={14} fill={V.muted}>{s.label}</text>
              <text x={i * colW + 16} y={MID - 52 - 10} fontSize={17} fontWeight={600} fill={V.ink}>{fmt(s)}<tspan fontSize={13} fontWeight={400} fill={V.muted}>{s.unit}</tspan></text>
              {gv && <text x={i * colW + 16} y={MID - 52 + 8} fontSize={12} fill={V.cyan}>now {fmt(gv)}</text>}
              {s.conv && i < n - 1 && (
                <g>
                  <rect x={bx - chipW / 2} y={chipY} rx={15} width={chipW} height={30} fill={V.cyan} />
                  <text x={bx} y={chipY + 20} textAnchor="middle" fontSize={13} fontWeight={600} fill="#fff">{s.conv}</text>
                </g>
              )}
            </g>
          );
        })}
      </svg>
    </div>
  );
}
