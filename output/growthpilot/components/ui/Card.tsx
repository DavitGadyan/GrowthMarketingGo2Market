import type { HTMLAttributes, ReactNode } from "react";

export function Card({ className = "", children, ...rest }: HTMLAttributes<HTMLDivElement> & { children: ReactNode }) {
  return (
    <div className={`card ${className}`} {...rest}>
      {children}
    </div>
  );
}

export function KpiCard({
  value,
  label,
  delta,
  deltaTone = "accent",
  note,
}: {
  value: ReactNode;
  label: string;
  delta?: string;
  deltaTone?: "accent" | "warn" | "muted";
  note?: string;
}) {
  const tone = { accent: "text-accent", warn: "text-warn", muted: "text-muted" }[deltaTone];
  return (
    <Card className="min-h-[96px] p-5">
      <div className="flex items-start justify-between gap-3">
        <div className="t-num text-[28px] leading-none">{value}</div>
        {delta && <div className={`shrink-0 text-[14px] font-medium ${tone}`}>{delta}</div>}
        {!delta && note && <div className="min-w-0 text-right text-[13px] leading-[16px] text-muted-strong">{note}</div>}
      </div>
      <div className="mt-2 text-[14px] text-muted-strong-strong">{label}</div>
    </Card>
  );
}

export function SectionTitle({ children, action, className = "" }: { children: ReactNode; action?: ReactNode; className?: string }) {
  return (
    <div className={`flex flex-wrap items-center justify-between gap-4 gap-y-3 ${className}`}>
      <h2 className="t-section">{children}</h2>
      {action}
    </div>
  );
}
