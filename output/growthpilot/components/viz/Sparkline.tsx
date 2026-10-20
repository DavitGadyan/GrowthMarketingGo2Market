import { V } from "./theme";

export function Sparkline({ values, width = 80, height = 24, color = V.accent2, title }: { values: number[]; width?: number; height?: number; color?: string; title?: string }) {
  if (values.length < 2) return <svg width={width} height={height} aria-hidden />;
  const min = Math.min(...values), max = Math.max(...values), span = max - min || 1;
  const pts = values.map((v, i) => `${(i / (values.length - 1)) * (width - 2) + 1},${height - 2 - ((v - min) / span) * (height - 4)}`);
  return (
    <svg width={width} height={height} aria-hidden={title ? undefined : true} role={title ? "img" : undefined} aria-label={title}>
      {title && <title>{title}</title>}
      <polyline className="spark-line" pathLength={1} strokeDasharray={1} points={pts.join(" ")} fill="none" stroke={color} strokeWidth={1.5} strokeLinejoin="round" strokeLinecap="round" />
    </svg>
  );
}
