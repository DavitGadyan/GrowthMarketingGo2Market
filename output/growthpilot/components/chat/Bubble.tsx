import type { ReactNode } from "react";
import { LogoSquare } from "@/components/ui/Logo";

/**
 * One chat bubble. User bubbles sit right on a tinted ground; agent bubbles sit
 * left behind a 32px "GP" avatar on white with a hairline and a soft shadow.
 * `grouped` tightens the gap to the previous bubble from the same side;
 * `time` renders only on the last bubble of a run.
 */
export function Bubble({
  role,
  children,
  time,
  grouped = false,
  animate = true,
  wide = false,
  className = "",
}: {
  role: "user" | "agent";
  children: ReactNode;
  time?: string;
  grouped?: boolean;
  animate?: boolean;
  wide?: boolean;
  className?: string;
}) {
  const isUser = role === "user";
  return (
    <div className={`flex ${isUser ? "justify-end" : "justify-start"} ${grouped ? "mt-2" : "mt-5"} first:mt-0 ${animate ? "bubble-in" : ""} ${className}`}>
      {!isUser && <span className={`mr-3 flex-none self-start ${grouped ? "invisible" : ""}`}><LogoSquare size={32} /></span>}
      <div className={`min-w-0 ${wide ? "max-w-[85%]" : "max-w-[85%] lg:max-w-[70%]"}`}>
        <div
          className={
            isUser
              ? "rounded-[18px] rounded-br-[4px] bg-ground px-4 py-2.5 text-[15px] leading-6 text-ink"
              : "rounded-[18px] rounded-tl-[4px] border border-black/[0.06] bg-surface px-4 py-2.5 text-[15px] leading-6 text-ink shadow-[var(--shadow-card)]"
          }
        >
          {children}
        </div>
        {time && <div className={`mt-1 font-mono text-[12.5px] text-muted-strong ${isUser ? "text-right" : ""}`}>{time}</div>}
      </div>
    </div>
  );
}
