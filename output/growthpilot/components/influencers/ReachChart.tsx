"use client";

import { useMemo } from "react";
import { CartesianGrid, ReferenceArea, ResponsiveContainer, Scatter, ScatterChart, Tooltip, XAxis, YAxis } from "recharts";
import type { InfluencerCandidate, InfluencerThreshold, Platform } from "@/lib/types";
import { VERDICT_COLOR, VERDICT_LABEL, fmtCount, fmtEr } from "./parts";

type Point = { x: number; y: number; r: number; c: InfluencerCandidate; i: number };

/** Axis ticks: 1k / 10k / 100k / 1M. */
const fmtAxis = (n: number) => (n >= 1_000_000 ? `${+(n / 1_000_000).toFixed(1)}M` : n >= 1_000 ? `${+(n / 1_000).toFixed(0)}k` : String(Math.round(n)));

const BAND = { good: "rgba(61,191,107,0.10)", ok: "rgba(245,165,36,0.10)", poor: "rgba(240,102,92,0.08)" };

/**
 * Reach vs engagement: log followers on x, engagement rate % on y, one dot per
 * creator (size = audience fit, colour = verdict), tier bands shaded by the rule.
 */
export function ReachChart({ candidates, thresholds, platform, selected, onPick }: {
  candidates: InfluencerCandidate[]; thresholds: InfluencerThreshold[]; platform: Platform | "all"; selected: string | null; onPick: (handle: string) => void;
}) {
  const points: Point[] = useMemo(() => candidates.map((c, i) => ({ x: Math.max(100, c.followers), y: +(c.engagement_rate * 100).toFixed(3), r: 7 + (c.audience_fit / 100) * 9, c, i })), [candidates]);
  const xMin = Math.max(100, Math.min(...points.map((p) => p.x), 1000) / 2);
  const xMax = Math.max(...points.map((p) => p.x), 100_000) * 2;
  // Decade ticks (1k / 10k / 100k / 1M) inside the log domain - the scale alone emits a single tick.
  const xTicks = [1_000, 10_000, 100_000, 1_000_000, 10_000_000].filter((v) => v >= xMin && v <= xMax);
  // Cap the axis so a wide "good" band never drags the ticks into nonsense; explicit ticks keep them tidy.
  const maxEr = Math.max(...points.map((p) => p.y), 0);
  const yMax = +Math.max(6, maxEr * 1.25).toFixed(1);
  const yStep = yMax <= 8 ? 1 : yMax <= 16 ? 2 : yMax <= 40 ? 5 : 10;
  const yTicks = Array.from({ length: Math.floor(yMax / yStep) + 1 }, (_, i) => i * yStep);
  const bands = thresholds.filter((t) => platform === "all" ? t.platform === "instagram" || thresholds.every((u) => u.platform !== "instagram") : t.platform === platform);

  return (
    <div className="h-[336px] min-w-[640px]">
      <ResponsiveContainer width="100%" height="100%">
        <ScatterChart margin={{ top: 16, right: 24, bottom: 28, left: 0 }}>
          <CartesianGrid stroke="rgba(0,0,0,0.06)" vertical={false} />
          <XAxis dataKey="x" type="number" scale="log" domain={[xMin, xMax]} ticks={xTicks} tickFormatter={(v: number) => fmtAxis(v)} tick={{ fontSize: 12, fill: "#6F6F76" }} axisLine={false} tickLine={false} label={{ value: "Followers", position: "bottom", offset: 10, fontSize: 12, fill: "#6F6F76" }} />
          <YAxis dataKey="y" type="number" domain={[-0.4, yMax]} ticks={yTicks} allowDataOverflow tickFormatter={(v: number) => `${v}%`} tick={{ fontSize: 12, fill: "#6F6F76" }} axisLine={false} tickLine={false} width={44} />
          {bands.map((t, bi) => {
            const x1 = Math.max(xMin, t.followers_min || xMin), x2 = Math.min(xMax, t.followers_max ?? xMax);
            if (x1 >= x2) return null;
            return [
              <ReferenceArea key={`${bi}-g`} x1={x1} x2={x2} y1={Math.min(t.good_er * 100, yMax)} y2={yMax} ifOverflow="hidden" fill={BAND.good} stroke="none" />,
              <ReferenceArea key={`${bi}-o`} x1={x1} x2={x2} y1={Math.min(t.ok_er * 100, yMax)} y2={Math.min(t.good_er * 100, yMax)} ifOverflow="hidden" fill={BAND.ok} stroke="none" />,
              <ReferenceArea key={`${bi}-p`} x1={x1} x2={x2} y1={0} y2={Math.min(t.ok_er * 100, yMax)} ifOverflow="hidden" fill={BAND.poor} stroke="none" />,
            ];
          })}
          <Tooltip cursor={false} isAnimationActive={false} content={({ active, payload }) => {
            const p = active && payload && payload[0] ? (payload[0].payload as Point) : null;
            if (!p) return null;
            return (
              <div className="card px-3 py-2 text-[13px]" style={{ boxShadow: "var(--shadow-pop)" }}>
                <div className="font-medium">{p.c.handle}</div>
                <div className="text-muted-strong">{fmtCount(p.c.followers)} followers · ER {fmtEr(p.c.engagement_rate)}</div>
                <div className="mt-0.5" style={{ color: VERDICT_COLOR[p.c.verdict] }}>{VERDICT_LABEL[p.c.verdict]}{p.c.audit ? ` · AQS ${Math.round(p.c.audit.aqs)}` : ` · score ${Math.round(p.c.authenticity_score)}`}</div>
              </div>
            );
          }} />
          <Scatter data={points} isAnimationActive={false} shape={(props: unknown) => {
            const { cx, cy, payload } = props as { cx: number; cy: number; payload: Point };
            const sel = selected === payload.c.handle;
            return (
              <circle cx={cx} cy={cy} r={payload.r} fill={VERDICT_COLOR[payload.c.verdict]} fillOpacity={sel ? 0.9 : 0.6} stroke={sel ? "#111114" : VERDICT_COLOR[payload.c.verdict]} strokeWidth={sel ? 3 : 1.5}
                className="inf-dot" data-selected={sel ? "true" : "false"} style={{ ["--i" as string]: String(payload.i) }} onClick={() => onPick(payload.c.handle)} />
            );
          }} />
        </ScatterChart>
      </ResponsiveContainer>
    </div>
  );
}
