import { V } from "./theme";
import "./growth.css";

/** 40px ring with a progress arc and the month (or week) label inside, as on the reference's timeline strip. */
export function MonthRing({ label, progress = 0, active = false, size = 40, tone = "muted", selected = false, hot = false, pulse = false }: {
  label: string; progress?: number; active?: boolean; size?: number; tone?: "accent" | "warn" | "muted"; selected?: boolean; hot?: boolean; pulse?: boolean;
}) {
  const r = (size - 4) / 2, c = 2 * Math.PI * r;
  const p = Math.max(0, Math.min(100, progress));
  const color = tone === "accent" || active ? V.success : tone === "warn" ? V.orange : "rgba(0,0,0,.14)";
  return (
    <span className={`gx-ring relative flex-none place-items-center ${pulse ? "gx-ring-pulse" : ""}`} data-hot={hot || undefined} style={{ width: size, height: size }} aria-label={`${label}, ${p}% complete`}>
      <svg width={size} height={size} className="absolute inset-0 -rotate-90">
        <circle cx={size / 2} cy={size / 2} r={r} fill={selected ? V.accent : "none"} stroke={selected ? V.accent : "rgba(0,0,0,.08)"} strokeWidth={2} style={{ transition: "fill 150ms ease, stroke 150ms ease" }} />
        {p > 0 && !selected && <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke={color} strokeWidth={2.5} strokeLinecap="round" strokeDasharray={c} strokeDashoffset={c * (1 - p / 100)} />}
      </svg>
      <span className={`relative text-[12px] ${selected ? "font-medium text-white" : active ? "font-medium text-ink" : "text-muted"}`}>{label}</span>
    </span>
  );
}
