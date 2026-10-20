"use client";

import { useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { Check, ChevronDown, Copy, Home, Lightbulb, ListFilter, Plus, Rocket, Search, Signal, Sparkles, Trash2, X } from "lucide-react";
import { TopBar } from "@/components/shell/TopBar";
import { Button, IconButton } from "@/components/ui/Button";
import { EmptyState, ErrorState, Skeleton } from "@/components/ui/States";
import { TaskCard } from "@/components/chat/TaskCard";
import { Avatar } from "@/components/viz/Avatar";
import { BubbleChart, BubbleLegend, type Bubble } from "@/components/viz/BubbleChart";
import { usePresenceList } from "@/components/viz/usePresenceList";
import { agentByKey } from "@/lib/agents";
import { money } from "@/lib/format";
import { useChat } from "@/lib/hooks";
import { usePresence } from "@/lib/usePresence";
import { PRIORITY_IMPACT, parseCost, priorityScore } from "@/lib/projection";
import { usePlan } from "@/lib/usePlan";
import type { FunnelStage, TacticTile } from "@/lib/types";
import "@/components/viz/interact.css";

const STAGES: { key: FunnelStage; label: string; dot: string }[] = [
  { key: "awareness", label: "Awareness", dot: "#35B0E8" }, { key: "consideration", label: "Consideration", dot: "#8B5CF6" },
  { key: "action", label: "Action", dot: "#F5A524" }, { key: "retain", label: "Retain", dot: "#10B981" }, { key: "refer", label: "Refer", dot: "#F0665C" },
];
type Idea = TacticTile & { id: string; score: number; cost: ReturnType<typeof parseCost> };
type Group = { key: FunnelStage; label: string; dot: string; ideas: Idea[] };

export default function IdeasPage() {
  const p = usePlan();
  const chat = useChat(p.company?.id);
  const [plan, setPlan] = useState<FunnelStage | "all">("all");
  const [sel, setSel] = useState<Set<string>>(new Set());
  const [spend, setSpend] = useState<number | null>(null);
  const [spendKey, setSpendKey] = useState(0);
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());
  const [hot, setHot] = useState<string | null>(null);
  const [pop, setPop] = useState<string | null>(null);
  const [popKey, setPopKey] = useState(0);
  const [copied, setCopied] = useState(false);
  const [added, setAdded] = useState<"idle" | "pending" | "done">("idle");

  const ideas: Idea[] = useMemo(() => (p.review?.tactics_matrix ?? []).map((t, i) => ({ ...t, id: `${t.funnel_stage}-${i}`, score: priorityScore(t.priority, i), cost: parseCost(t.estimated_cost) })), [p.review]);
  const visible = ideas.filter((i) => plan === "all" || i.funnel_stage === plan);
  const bubbles: Bubble[] = visible.map((i) => ({
    id: i.id, label: i.tactic, spend: i.cost.bucket, usd: i.cost.usd, impact: PRIORITY_IMPACT[i.priority], score: i.score,
    roi: i.priority === "critical" || i.priority === "high" ? "high" : i.priority === "medium" ? "mid" : "low", selected: sel.has(i.id),
    channel: i.channel, agent: agentByKey(i.agent)?.name ?? i.agent, costLabel: i.estimated_cost,
  }));
  const groups: Group[] = useMemo(
    () => STAGES.filter((s) => plan === "all" || s.key === plan).map((s) => ({ ...s, ideas: visible.filter((i) => i.funnel_stage === s.key).sort((a, b) => b.score - a.score) })).filter((g) => g.ideas.length),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [plan, ideas],
  );
  const shownGroups = usePresenceList(groups, (g) => g.key, 180);
  const toggle = (id: string) => setSel((s) => { const n = new Set(s); if (n.has(id)) n.delete(id); else n.add(id); return n; });
  const pick = (id: string) => { toggle(id); setPop(id); setPopKey((k) => k + 1); };
  const allSelected = visible.length > 0 && visible.every((i) => sel.has(i.id));
  const selectedIdeas = ideas.filter((i) => sel.has(i.id));
  const bulk = usePresence(sel.size > 0, 200);
  const addToTimeline = () => { setAdded("pending"); void chat.send(`Propose execution tasks for these tactics: ${selectedIdeas.map((i) => `${i.tactic} (${i.channel}, ${i.funnel_stage})`).join("; ")}`); };
  useEffect(() => {
    if (added === "pending" && !chat.streaming && chat.pending === null) {
      setAdded("done");
      const t = setTimeout(() => setAdded("idle"), 2000);
      return () => clearTimeout(t);
    }
  }, [chat.streaming, chat.pending, added]);
  const copy = () => { void navigator.clipboard?.writeText(selectedIdeas.map((i) => i.tactic).join("\n")); setCopied(true); setTimeout(() => setCopied(false), 1600); };
  const clear = () => { setSel(new Set()); setSpend(null); };

  const actions = (
    <>
      <a href="/chat?ask=Propose a new tactic for the plan" className="text-[14px] text-accent hover:underline">Add idea</a>
      <a href="/templates" className="text-[14px] text-accent hover:underline">Templates</a>
      <Button href="/chat?ask=Run an ideation session on the plan">Create ideation session</Button>
    </>
  );

  return (
    <div className="flex min-h-full flex-col">
      <TopBar title="Ideas" actions={actions} />
      {p.error && <div className="p-6"><ErrorState error={p.error} retry={p.reload} /></div>}
      {p.loading && !p.error && <div className="grid gap-6 p-8 lg:grid-cols-[320px_1fr]"><Skeleton className="h-64" /><Skeleton className="h-96" /></div>}
      {!p.loading && !p.error && !p.company && <div className="p-8"><EmptyState icon={<Rocket size={20} />} title="No workspace yet" body="Ideas are the tactics the Review Agent ranks by funnel stage and priority." action={<Button href="/setup">Set up your company</Button>} /></div>}
      {!p.loading && !p.error && p.company && !ideas.length && <div className="p-8"><EmptyState icon={<Lightbulb size={20} />} title="No tactics yet" body="Start a run; stage 14 produces the tactics matrix shown here as ideas." action={<Button href="/chat?ask=Start the growth run">Start a run</Button>} /></div>}
      {!p.loading && !p.error && p.company && ideas.length > 0 && (
        <div className="grid flex-1 grid-cols-[minmax(0,1fr)] bg-surface lg:grid-cols-[320px_minmax(0,1fr)]">
          <aside className="min-w-0 border-b border-black/[0.06] py-4 lg:border-b-0 lg:border-r">
            <nav className="flex gap-1 overflow-x-auto px-4 lg:flex-col lg:px-0">
              <button type="button" onClick={() => setPlan("all")} className={`ix-row flex items-center gap-3 rounded-[10px] px-4 py-2.5 text-left text-[15px] lg:rounded-none lg:px-8 ${plan === "all" ? "!bg-[#E6F7F1] text-accent" : ""}`}><Home size={18} /> All ideas</button>
              {STAGES.map((s) => (
                <button key={s.key} type="button" onClick={() => setPlan(s.key)} className={`ix-row flex items-center gap-3 whitespace-nowrap rounded-[10px] px-4 py-2.5 text-left text-[15px] lg:rounded-none lg:px-8 ${plan === s.key ? "!bg-[#E6F7F1] text-accent" : ""}`}><span className="h-2 w-2 rounded-full" style={{ background: s.dot }} /> {s.label}</button>
              ))}
              <a href="/chat?ask=Add a new plan of tactics" className="flex items-center gap-3 whitespace-nowrap px-4 py-2.5 text-[15px] text-muted hover:text-ink lg:px-8"><Plus size={18} /> Add new plan</a>
            </nav>
          </aside>
          <div className="min-w-0">
            <div className="border-b border-black/[0.06] px-6 pt-4">
              <div className="flex justify-end"><BubbleLegend /></div>
              <div className="overflow-x-auto scroll-thin"><BubbleChart bubbles={bubbles} onPick={pick} hotId={hot} onHover={setHot} popId={pop} popKey={popKey} /></div>
            </div>
            <div className="flex items-center gap-4 border-b border-black/[0.06] px-6 py-3 text-[15px]">
              <input type="checkbox" aria-label="Select all" checked={allSelected} onChange={() => setSel(allSelected ? new Set() : new Set(visible.map((i) => i.id)))} className="h-4 w-4 accent-[#10B981]" />
              <span>Ideas <span className="text-muted underline decoration-dotted underline-offset-4">by Stage</span></span>
              <IconButton label="Filter"><ListFilter size={18} /></IconButton>
              <IconButton label="Search"><Search size={18} /></IconButton>
              <span className="ml-auto hidden w-32 text-[14px] md:block">Priority ↓</span>
              <span className="hidden w-40 text-[14px] md:block">Owner</span>
            </div>
            {shownGroups.map(({ item: g, key, closing }) => {
              const open = !collapsed.has(g.key);
              return (
                <div key={key} className="ix-presence" data-closing={closing || undefined} aria-hidden={closing || undefined}>
                  <button type="button" aria-expanded={open} onClick={() => setCollapsed((c) => { const n = new Set(c); if (n.has(g.key)) n.delete(g.key); else n.add(g.key); return n; })} className="flex w-full items-center gap-3 px-6 py-4 text-left text-[16px] font-medium">
                    <ChevronDown size={16} className="ix-caret text-muted" data-open={open} /> {g.label} <span className="tnum text-[13px] font-normal text-muted">{g.ideas.length}</span>
                  </button>
                  {open && (
                    <div className="content-enter" key={`${g.key}-open`}>
                      {g.ideas.map((i) => {
                        const a = agentByKey(i.agent);
                        return (
                          <label key={i.id} data-hot={hot === i.id || undefined} onMouseEnter={() => setHot(i.id)} onMouseLeave={() => setHot(null)}
                            className={`ix-row flex cursor-pointer items-center gap-4 border-t border-black/[0.05] px-6 py-3 text-[15px] ${sel.has(i.id) ? "!bg-[#F3FBF7]" : ""}`}>
                            <input type="checkbox" checked={sel.has(i.id)} onChange={() => toggle(i.id)} onFocus={() => setHot(i.id)} onBlur={() => setHot(null)} className="h-4 w-4 accent-[#10B981]" aria-label={`Select ${i.tactic}`} />
                            <span className="min-w-0 flex-1 truncate" title={i.rationale}>{i.tactic} <span className="text-muted">· {i.channel}</span></span>
                            <span className="tnum hidden w-32 items-center gap-2 md:flex"><Signal size={16} className={i.score >= 74 ? "text-[#3DBF6B]" : i.score >= 54 ? "text-[#F5A524]" : "text-muted"} /> {i.score}</span>
                            <span className="hidden w-40 items-center gap-2 md:flex"><Avatar name={a?.name ?? i.agent} size={24} /> <span className="truncate">{a?.name.replace(" Agent", "") ?? i.agent}</span></span>
                          </label>
                        );
                      })}
                      <a href={`/chat?ask=Propose a new ${g.label.toLowerCase()} tactic`} className="block border-t border-black/[0.05] px-6 py-3 pl-14 text-[15px] text-muted hover:text-ink">Add idea…</a>
                    </div>
                  )}
                </div>
              );
            })}
            {chat.sideEffects.tasks.length > 0 && <div className="content-enter p-6"><TaskCard tasks={chat.sideEffects.tasks} onChange={() => p.reloadTasks()} title="Added to the timeline - approve to run" /></div>}
            {chat.pending !== null && added !== "pending" && <div className="px-6 pb-6 text-[14px] text-muted-strong">{chat.pending ? "Agents: " + chat.pending.slice(-160) : "Asking the agents…"}</div>}
          </div>
          {/* Portaled: the route-transition wrapper carries a transform, which would otherwise turn `fixed` into page-relative positioning. */}
          {bulk.mounted && typeof document !== "undefined" && createPortal(
            <div className="bulk-bar bulk-enter fixed inset-x-4 bottom-4 z-40 !flex justify-between text-[13px] md:inset-x-auto md:left-1/2 md:-translate-x-1/2 md:justify-start md:text-[14px]" data-closing={bulk.closing || undefined}>
              <span className="tnum whitespace-nowrap px-1 font-medium sm:px-3">{sel.size} selected</span>
              <button type="button" aria-label="Calculate spend" onClick={() => { setSpend(selectedIdeas.reduce((s, i) => s + i.cost.usd, 0)); setSpendKey((k) => k + 1); }} className="flex items-center gap-2 whitespace-nowrap rounded-full bg-white/15 px-3 py-2 hover:bg-white/25 sm:px-4">
                <Sparkles size={16} /><span className="hidden sm:inline">Calculate spend</span>
                {spend != null && <span key={spendKey} className="toast-in tnum text-[#A7F3D0]">≈ {money(spend)}<span className="hidden sm:inline"> / 90 days</span></span>}
              </button>
              <button type="button" aria-label={added === "done" ? "Added to timeline" : "Add to timeline"} onClick={addToTimeline} disabled={added === "pending" || chat.streaming} className="flex items-center gap-2 whitespace-nowrap rounded-full px-3 py-2 hover:bg-white/15 disabled:opacity-70 sm:px-4" aria-live="polite">
                {added === "pending" ? <span className="ix-dots" aria-label="Asking the agents"><i /><i /><i /></span> : added === "done" ? <Check size={16} className="toast-in text-[#A7F3D0]" /> : <ListFilter size={16} />}
                <span className="hidden sm:inline">{added === "done" ? "Added" : "Add to Timeline"}</span>
              </button>
              <span className="relative hidden md:inline-flex">
                <IconButton label="Copy" className="!border-white/20 !text-white" onClick={copy}><Copy size={16} /></IconButton>
                {copied && <span className="toast-in absolute -top-9 left-1/2 -translate-x-1/2 whitespace-nowrap rounded-full bg-white px-2.5 py-1 text-[12px] text-ink shadow-[0_8px_24px_rgba(0,0,0,.14)]">Copied</span>}
              </span>
              <IconButton label="Clear selection" className="!border-white/20 !text-white" onClick={clear}><Trash2 size={16} /></IconButton>
              <IconButton label="Close" className="!border-white/20 !text-white" onClick={clear}><X size={16} /></IconButton>
            </div>,
            document.body,
          )}
        </div>
      )}
    </div>
  );
}
