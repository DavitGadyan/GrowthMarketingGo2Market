"use client";

import { useState } from "react";
import { Cell, Pie, PieChart, ResponsiveContainer, Tooltip } from "recharts";
import { V, lightTooltip } from "./theme";
import { useFirstMountAnimation } from "./useFirstMount";
import "./interact.css";

const COLORS = [V.cyan, V.accent2, V.orange, V.accent, V.danger, V.muted];

/** Light donut with a legend of rows + percentages, as on the reference's template card.
 *  Hovering a slice highlights its legend row and vice-versa. */
export function Donut({ data, title, size = 180 }: { data: { name: string; value: number }[]; title?: string; size?: number }) {
  const total = data.reduce((s, d) => s + d.value, 0) || 1;
  const anim = useFirstMountAnimation();
  const [active, setActive] = useState<number | null>(null);
  return (
    <div className="flex items-center gap-6" onMouseLeave={() => setActive(null)}>
      <div style={{ width: size, height: size }} className="flex-none">
        <ResponsiveContainer width="100%" height="100%">
          <PieChart>
            <Pie data={data} dataKey="value" nameKey="name" innerRadius="60%" outerRadius="100%" paddingAngle={1} stroke="none" isAnimationActive={anim} animationDuration={500} animationEasing="ease-out"
              onMouseEnter={(_, i) => setActive(i)} onMouseLeave={() => setActive(null)}>
              {data.map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} className={`ix-slice${active === i ? " is-hot" : active != null ? " is-dim" : ""}`} />)}
            </Pie>
            <Tooltip {...lightTooltip} formatter={(v, n) => [`${Math.round((Number(v) / total) * 100)}%`, String(n)]} />
          </PieChart>
        </ResponsiveContainer>
      </div>
      <div className="min-w-0">
        {title && <div className="mb-3 text-[18px] font-medium">{title}</div>}
        <ul className="space-y-1 text-[15px]">
          {data.map((d, i) => (
            <li key={d.name} className="ix-row -mx-2 flex items-center gap-3 rounded-[8px] px-2 py-0.5" data-hot={active === i || undefined}
              onMouseEnter={() => setActive(i)} onMouseLeave={() => setActive(null)} onFocus={() => setActive(i)} onBlur={() => setActive(null)} tabIndex={0}>
              <span className="h-2 w-2 flex-none rounded-full" style={{ background: COLORS[i % COLORS.length] }} />
              <span className="min-w-0 flex-1 truncate" title={d.name}>{d.name}</span>
              <span className="tnum ml-6 flex-none font-medium">{Math.round((d.value / total) * 100)}%</span>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
