"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import { AlertTriangle, ChevronDown, Lightbulb, PanelRightClose, ShieldAlert } from "lucide-react";
import { AGENTS, agentStatus, type AgentStatus } from "@/lib/agents";
import { timeHMS } from "@/lib/format";
import type { Event, Insight, Run, Task } from "@/lib/types";
import { Avatar, Pill } from "@/components/viz/Avatar";
import { STATUS_COLOR, STATUS_TONE } from "@/components/ui/Chip";

const INSIGHT_ICON = { opportunity: Lightbulb, risk: ShieldAlert, gap: AlertTriangle } as const;
const SEVERITY_RANK = { high: 0, medium: 1, low: 2 } as const;
const SEVERITY_TONE = { high: "danger", medium: "warn", low: "accent2" } as const;
const SEVERITY_DOT = { high: "#F0665C", medium: "#F5A524", low: "#8B5CF6" } as const;
const AGENT_DOT: Record<AgentStatus, string> = { working: "#10B981", connected: "#3DBF6B", idle: "#C4C4CA" };

function Section({ title, meta, children }: { title: string; meta?: ReactNode; children: ReactNode }) {
  return (
    <section className="rule-b px-5 py-4 last:border-0">
      <div className="flex items-center justify-between gap-3">
        <h3 className="t-caps">{title}</h3>
        {meta && <span className="t-meta">{meta}</span>}
      </div>
      <div className="mt-3">{children}</div>
    </section>
  );
}

/**
 * The lighter right rail: an agent avatar strip, the last six log lines and the
 * top three discoveries. Everything else is one click away, not on screen.
 */
export function ChatRail({
  run,
  tasks,
  events,
  insights,
  connected,
  onHide,
  className = "",
}: {
  run: Run | null;
  tasks: Task[];
  events: Event[];
  insights: Insight[];
  connected: boolean;
  onHide?: () => void;
  className?: string;
}) {
  const agents = AGENTS.map((a) => ({ a, status: agentStatus(a, run, tasks) }));
  const working = agents.filter((x) => x.status === "working").length;
  const connectedN = agents.filter((x) => x.status !== "idle").length;

  const [showAll, setShowAll] = useState(false);
  const newest = events.length ? events[events.length - 1].id : 0;
  const lastSeen = useRef(newest);
  const [blink, setBlink] = useState(false);
  useEffect(() => {
    if (newest !== lastSeen.current) {
      lastSeen.current = newest;
      setBlink(true);
      const t = window.setTimeout(() => setBlink(false), 650);
      return () => window.clearTimeout(t);
    }
  }, [newest]);
  const log = [...events].reverse().slice(0, showAll ? 30 : 6);

  const [more, setMore] = useState(false);
  const [openInsight, setOpenInsight] = useState<number | null>(null);
  const sorted = [...insights].sort((a, b) => SEVERITY_RANK[a.severity] - SEVERITY_RANK[b.severity]);
  const shown = more ? sorted : sorted.slice(0, 3);

  return (
    <div className={`stagger flex min-h-0 flex-col ${className}`}>
      <div className="rule-b flex items-center justify-between px-5 py-3">
        <span className="t-caps">Panel</span>
        {onHide && (
          <button type="button" className="icon-btn !h-8 !w-8" title="Hide panel" aria-label="Hide panel" onClick={onHide}>
            <PanelRightClose size={16} />
          </button>
        )}
      </div>

      <Section title="Agents" meta={`${working} working · ${connectedN} connected`}>
        <div className="flex items-center">
          <div className="flex -space-x-1">
            {agents.map(({ a, status }) => (
              <span key={a.key} className={`relative inline-block rounded-full ring-2 ring-surface ${status === "working" ? "pulse-ring" : ""}`} title={`${a.name} · ${status}`}>
                <Avatar name={a.name} size={28} />
                <span className="absolute -bottom-0.5 -right-0.5 h-2.5 w-2.5 rounded-full ring-2 ring-surface" style={{ background: AGENT_DOT[status] }} aria-hidden />
              </span>
            ))}
          </div>
        </div>
      </Section>

      <Section
        title="Live log"
        meta={
          <span className="inline-flex items-center gap-1.5">
            <span className={`inline-block h-2 w-2 rounded-full ${blink ? "blink-once" : ""}`} style={{ background: connected ? "#10B981" : "#C4C4CA" }} aria-hidden />
            {connected ? "live" : run ? `run #${run.id}` : "idle"}
          </span>
        }
      >
        {log.length === 0 ? (
          <p className="t-meta">{run ? "Waiting for the first event…" : "Start a run to see the agents work."}</p>
        ) : (
          <>
            <ul className="space-y-1.5">
              {log.map((e) => (
                <li key={e.id} className="log-row flex items-center gap-2.5 text-[13px] leading-5">
                  <span className="w-[62px] flex-none font-mono text-[12.5px] text-muted-strong">{timeHMS(e.ts)}</span>
                  <span className="h-1.5 w-1.5 flex-none rounded-full" style={{ background: STATUS_COLOR[STATUS_TONE[e.level] ?? "muted"] }} aria-hidden />
                  <span className="min-w-0 truncate" title={e.message}>{e.message}</span>
                </li>
              ))}
            </ul>
            {events.length > 6 && (
              <button type="button" className="mt-2 text-[13px] text-accent hover:underline" onClick={() => setShowAll((s) => !s)}>
                {showAll ? "Show less" : "Show all"}
              </button>
            )}
          </>
        )}
      </Section>

      <Section title="Discoveries" meta={insights.length ? String(insights.length) : undefined}>
        {sorted.length === 0 ? (
          <p className="t-meta">Opportunities, risks and gaps land here.</p>
        ) : (
          <>
            <ul className="space-y-1">
              {shown.map((i) => {
                const Icon = INSIGHT_ICON[i.kind] ?? Lightbulb;
                const open = openInsight === i.id;
                return (
                  <li key={i.id}>
                    <button type="button" className="flex w-full items-center gap-2.5 rounded-[10px] px-2 py-1.5 text-left text-[13px] hover:bg-ground" aria-expanded={open} onClick={() => setOpenInsight(open ? null : i.id)}>
                      <span className="h-2 w-2 flex-none rounded-full" style={{ background: SEVERITY_DOT[i.severity] }} aria-hidden />
                      <Icon size={13} className="flex-none text-muted-strong" />
                      <span className="min-w-0 flex-1 truncate" title={i.title.length > 48 ? i.title : undefined}>{i.title}</span>
                      <Pill tone={SEVERITY_TONE[i.severity]}>{i.severity}</Pill>
                      <ChevronDown size={13} className={`flex-none text-muted-strong transition-transform ${open ? "rotate-180" : ""}`} />
                    </button>
                    {open && <p className="content-enter px-2 pb-2 pl-[38px] text-[13px] leading-5 text-muted-strong">{i.detail}</p>}
                  </li>
                );
              })}
            </ul>
            {sorted.length > 3 && (
              <button type="button" className="mt-2 text-[13px] text-accent hover:underline" onClick={() => setMore((m) => !m)}>
                {more ? "Show less" : `+${sorted.length - 3} more`}
              </button>
            )}
          </>
        )}
      </Section>
    </div>
  );
}
