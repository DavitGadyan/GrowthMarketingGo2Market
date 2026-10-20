import type { ReactNode } from "react";

export type ChipTone = "accent" | "accent2" | "info" | "warn" | "error" | "muted";

/* Tinted chips on white: pale fill, darker ink of the same hue (all >= 4.5:1). */
const TONES: Record<ChipTone, { bg: string; fg: string }> = {
  accent: { bg: "#E6F7F1", fg: "#0B7A55" },
  accent2: { bg: "#EFEBFF", fg: "#6230D6" },
  info: { bg: "#E3F4FB", fg: "#176F9C" },
  warn: { bg: "#FFF1DC", fg: "#9A5B00" },
  error: { bg: "#FDE8E6", fg: "#B5281D" },
  muted: { bg: "#F0F0F3", fg: "#5F5F66" },
};

export function Chip({ tone = "muted", children, className = "" }: { tone?: ChipTone; children: ReactNode; className?: string }) {
  const t = TONES[tone];
  return (
    <span className={`chip ${className}`} style={{ background: t.bg, color: t.fg }}>
      {children}
    </span>
  );
}

export const STATUS_TONE: Record<string, ChipTone> = {
  completed: "accent", done: "accent", success: "accent", connected: "accent", approved: "accent",
  running: "info", info: "info", working: "info", queued: "info",
  pending: "muted", idle: "muted", proposed: "warn", warning: "warn", blocked: "warn",
  failed: "error", error: "error", rejected: "error", cancelled: "muted", skipped: "muted",
};

/* Solid status colours for dots, text and chart marks. */
export const STATUS_COLOR: Record<ChipTone, string> = {
  accent: "#10B981", accent2: "#8B5CF6", info: "#35B0E8", warn: "#F5A524", error: "#F0665C", muted: "#8A8A8F",
};

export function StatusText({ status, className = "" }: { status: string; className?: string }) {
  const tone = STATUS_TONE[status] ?? "muted";
  const fg = TONES[tone].fg;
  return (
    <span className={`text-[13px] font-medium capitalize ${className}`} style={{ color: fg }}>
      {status.replace(/_/g, " ")}
    </span>
  );
}

export function StatusDot({ status, className = "" }: { status: string; className?: string }) {
  const tone = STATUS_TONE[status] ?? "muted";
  return <span className={`inline-block h-2 w-2 rounded-full ${className}`} style={{ background: STATUS_COLOR[tone] }} aria-hidden />;
}
