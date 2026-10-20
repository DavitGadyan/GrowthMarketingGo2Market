/** Light chart tokens for the v2 screens (Recharts needs literal colours). */
export const V = {
  accent: "#10B981", accent2: "#8B5CF6", cyan: "#35B0E8", orange: "#F5A524", success: "#3DBF6B", danger: "#F0665C",
  muted: "#8A8A8F", ink: "#111114", grid: "rgba(0,0,0,0.06)", stroke: "rgba(0,0,0,0.08)",
  tintAccent: "#E6F7F1", tintAccent2: "#EFEBFF", tintCyan: "#E3F4FB", tintOrange: "#FFF1DC",
} as const;

export const lightTooltip = {
  contentStyle: { background: "#FFFFFF", border: "1px solid rgba(0,0,0,.08)", borderRadius: 12, fontSize: 13, color: "#111114", boxShadow: "0 8px 24px rgba(0,0,0,.08)", padding: "10px 12px" },
  itemStyle: { color: "#111114" },
  labelStyle: { color: "#8A8A8F", marginBottom: 4 },
  cursor: { stroke: "rgba(0,0,0,.12)", fill: "rgba(0,0,0,.03)" },
} as const;

export const lightTick = { fill: "#8A8A8F", fontSize: 12 } as const;

export const ROI_COLOR: Record<"low" | "mid" | "high", string> = { low: V.danger, mid: V.orange, high: V.success };
