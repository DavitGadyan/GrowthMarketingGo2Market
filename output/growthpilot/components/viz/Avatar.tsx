import { initials } from "@/lib/projection";

const TINTS = ["#E6F7F1", "#EFEBFF", "#E3F4FB", "#FFF1DC", "#FDE7F3"];
const INKS = ["#0B8A5F", "#6D3FE0", "#1C7FB0", "#B86A00", "#B0286D"];

/** Initials avatar on a tinted circle; the colour is stable per name. */
export function Avatar({ name, size = 28, className = "" }: { name: string; size?: number; className?: string }) {
  const h = [...name].reduce((a, c) => a + c.charCodeAt(0), 0) % TINTS.length;
  return (
    <span
      className={`inline-grid flex-none place-items-center rounded-full font-medium ${className}`}
      style={{ width: size, height: size, background: TINTS[h], color: INKS[h], fontSize: Math.round(size * 0.38) }}
      title={name}
      aria-label={name}
    >
      {initials(name)}
    </span>
  );
}

export function Pill({ tone = "muted", children, className = "" }: { tone?: "accent" | "accent2" | "warn" | "danger" | "success" | "muted" | "ink"; children: React.ReactNode; className?: string }) {
  const map = {
    accent: ["#E6F7F1", "#0B8A5F"], accent2: ["#EFEBFF", "#6D3FE0"], warn: ["#FFF1DC", "#B86A00"], danger: ["#FDE7E5", "#C2362B"],
    success: ["#E7F6EC", "#1F8B4C"], muted: ["#F1F1F4", "#5C5C63"], ink: ["#111114", "#FFFFFF"],
  } as const;
  const [bg, fg] = map[tone];
  return (
    <span className={`inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-[12px] font-medium ${className}`} style={{ background: bg, color: fg }}>
      {children}
    </span>
  );
}
