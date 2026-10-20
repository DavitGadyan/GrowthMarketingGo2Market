import type { ReactNode } from "react";

export function Table({ head, children, className = "" }: { head: string[]; children: ReactNode; className?: string }) {
  return (
    <div className={`scroll-thin overflow-x-auto ${className}`}>
      <table className="w-full min-w-[640px] table-fixed text-[14px]">
        <thead>
          <tr className="rule-b">
            {head.map((h) => (
              <th key={h} className="thead px-4 py-3 text-left">{h}</th>
            ))}
          </tr>
        </thead>
        <tbody>{children}</tbody>
      </table>
    </div>
  );
}

export function Tr({ children, onClick, selected = false }: { children: ReactNode; onClick?: () => void; selected?: boolean }) {
  return (
    <tr className={`rule-b transition-colors last:border-0 hover:bg-ground ${selected ? "bg-tint-accent" : ""} ${onClick ? "cursor-pointer" : ""}`} onClick={onClick}>
      {children}
    </tr>
  );
}

export function Td({ children, className = "", muted = false }: { children: ReactNode; className?: string; muted?: boolean }) {
  return <td className={`px-4 py-3.5 align-top ${muted ? "text-muted" : ""} ${className}`}>{children}</td>;
}
