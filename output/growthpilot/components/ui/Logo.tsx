export function LogoMark({ size = 28 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 28 28" aria-hidden>
      <defs>
        <linearGradient id="gp-g" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#10B981" />
          <stop offset="1" stopColor="#8B5CF6" />
        </linearGradient>
      </defs>
      <rect x="1" y="1" width="26" height="26" rx="8" fill="url(#gp-g)" />
      <path d="M7 19.5 12.5 13l3.5 3.5L21 9" fill="none" stroke="#fff" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M16.5 9H21v4.5" fill="none" stroke="#fff" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

/** The reference's logo square: a solid accent tile with a two-letter mark. */
export function LogoSquare({ size = 40 }: { size?: number }) {
  return (
    <span
      className="grid flex-none place-items-center rounded-[10px] bg-accent font-display font-semibold text-white"
      style={{ width: size, height: size, fontSize: Math.round(size * 0.4) }}
      aria-hidden
    >
      GP
    </span>
  );
}

export function Wordmark({ compact = false }: { compact?: boolean }) {
  return (
    <span className="flex items-center gap-2.5">
      <LogoSquare size={32} />
      {!compact && <span className="font-display text-[16px] font-semibold tracking-tight">GrowthPilot</span>}
    </span>
  );
}
