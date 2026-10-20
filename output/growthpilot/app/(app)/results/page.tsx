"use client";

import { Suspense, useEffect, useMemo, useRef, useState, type FormEvent, type KeyboardEvent } from "react";
import { useSearchParams } from "next/navigation";
import { Calendar, Check, ChevronDown, FolderOpen, Loader2, MoreVertical, Rocket, Target, X } from "lucide-react";
import { TopBar } from "@/components/shell/TopBar";
import { Button, IconButton } from "@/components/ui/Button";
import { Select } from "@/components/ui/Controls";
import { EmptyState, ErrorState, Skeleton } from "@/components/ui/States";
import { Avatar, Pill } from "@/components/viz/Avatar";
import { Gauge } from "@/components/viz/Gauge";
import { LensPanel } from "@/components/viz/LensPanel";
import { AGENTS, agentByKey } from "@/lib/agents";
import { api } from "@/lib/api";
import { money, relTime, titleCase } from "@/lib/format";
import { useChat } from "@/lib/hooks";
import { firstParagraph, shortDate } from "@/lib/projection";
import { usePlan } from "@/lib/usePlan";
import { useReducedMotion } from "@/lib/usePresence";
import type { Deliverable, Event, Task } from "@/lib/types";

type Item = { id: string; kind: "task" | "deliverable"; title: string; group: string; status: string; task?: Task; deliverable?: Deliverable };

const norm = (a: string) => a.toLowerCase().replace(/\s*agent$/, "").trim();

export default function ResultsPage() {
  return <Suspense fallback={<div className="p-8"><Skeleton className="h-64 w-full" /></div>}><ResultsInner /></Suspense>;
}

function ResultsInner() {
  const p = usePlan();
  const params = useSearchParams();
  const chat = useChat(p.company?.id);
  const reduce = useReducedMotion();
  const [selected, setSelected] = useState<string | null>(params.get("item") ?? (params.get("task") ? `task:${params.get("task")}` : null));
  const [cursor, setCursor] = useState<string | null>(null);
  const [rail, setRail] = useState(true);
  const [hideDone, setHideDone] = useState(false);
  const [draft, setDraft] = useState("");
  const [busy, setBusy] = useState<number | null>(null);
  const [panel, setPanel] = useState(false);
  const [lens, setLens] = useState<string | null>(null);
  const [flash, setFlash] = useState(0);
  const listRef = useRef<HTMLElement>(null);

  const items: Item[] = useMemo(() => {
    const out: Item[] = [];
    for (const a of AGENTS) for (const t of p.tasks.filter((t) => t.agent === a.key)) out.push({ id: `task:${t.id}`, kind: "task", title: t.title, group: a.name.replace(" Agent", ""), status: t.status, task: t });
    for (const d of p.deliverables) out.push({ id: `deliverable:${d.id}`, kind: "deliverable", title: d.title, group: "Deliverables", status: "done", deliverable: d });
    return out;
  }, [p.tasks, p.deliverables]);
  const groups = useMemo(() => [...new Set(items.map((i) => i.group))].map((g) => ({ name: g, items: items.filter((i) => i.group === g) })), [items]);
  useEffect(() => { if (!selected && items.length) setSelected((items.find((i) => i.status === "proposed") ?? items[0]).id); }, [items, selected]);
  const item = items.find((i) => i.id === selected) ?? null;

  const comments: Event[] = useMemo(() => {
    if (!item) return [];
    if (item.task) return p.events.filter((e) => e.message.includes(`#${item.task!.id}`) || norm(e.agent) === item.task!.agent);
    return p.events.filter((e) => e.message.includes(`deliverable #${item.deliverable!.id}`) || /deliverables? ready/i.test(e.message));
  }, [item, p.events]);

  // While a task runs, keep tasks + events fresh so the status pill and the comment thread move on their own.
  const anyRunning = p.tasks.some((t) => t.status === "approved" || t.status === "running");
  const { reloadTasks, reloadEvents } = p;
  useEffect(() => {
    if (!anyRunning) return;
    const id = setInterval(() => { reloadTasks(); reloadEvents(); }, 3000);
    return () => clearInterval(id);
  }, [anyRunning, reloadTasks, reloadEvents]);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    const text = draft.trim();
    if (!text || !item) return;
    setDraft("");
    await chat.send(`About "${item.title}": ${text}`);
    p.reloadEvents();
  };
  const approve = async (t: Task) => {
    if (t.status !== "proposed" || !window.confirm(`Approve "${t.title}"? The ${agentByKey(t.agent)?.name ?? t.agent} will run it now.`)) return;
    setBusy(t.id);
    try { await api.tasks.approve(t.id); p.reloadTasks(); setTimeout(() => p.reloadEvents(), 800); } finally { setBusy(null); }
  };

  // Keyboard navigation in the left list: arrows move the cursor, Enter/Space opens.
  const onListKey = (e: KeyboardEvent<HTMLButtonElement>, id: string) => {
    if (!["ArrowDown", "ArrowUp", "Enter", " ", "Home", "End"].includes(e.key)) return;
    e.preventDefault();
    if (e.key === "Enter" || e.key === " ") { setSelected(id); return; }
    const btns = [...(listRef.current?.querySelectorAll<HTMLButtonElement>("button[data-item]") ?? [])];
    const i = btns.findIndex((b) => b.dataset.item === id);
    const j = e.key === "Home" ? 0 : e.key === "End" ? btns.length - 1 : (i + (e.key === "ArrowDown" ? 1 : -1) + btns.length) % btns.length;
    const n = btns[j];
    if (n) { n.focus(); setCursor(n.dataset.item ?? null); }
  };
  const jumpToDeliverables = () => {
    const el = listRef.current?.querySelector<HTMLElement>('[data-group="Deliverables"]');
    el?.scrollIntoView({ behavior: reduce ? "auto" : "smooth", block: "nearest" });
    setFlash((f) => f + 1);
  };

  const done = p.tasks.filter((t) => t.status === "done").length;
  const readiness = p.review?.plan_readiness_pct ?? 0;
  const words = p.deliverables.reduce((s, d) => s + d.content_md.split(/\s+/).length, 0);
  const adplane = (() => { const m = p.deliverables.flatMap((d) => [...d.content_md.matchAll(/ADPLANE (\d+)\/49/g)].map((x) => Number(x[1]))); return m.length ? Math.round(m.reduce((a, b) => a + b, 0) / m.length) : null; })();
  const coverage = p.stages.length ? Math.round((p.stages.filter((s) => s.status === "completed").length / p.stages.length) * 100) : 0;

  const actions = (
    <>
      <a href={p.company ? `/setup?company=${p.company.id}` : "/setup"} className="text-[14px] text-accent hover:underline">Import campaigns</a>
      <Button href="/chat?ask=Propose a new campaign for the plan">Add campaign <ChevronDown size={16} /></Button>
    </>
  );

  const resultRows: [string, string, string, number, boolean][] = [
    ["Deliverables", String(p.deliverables.length), "—", 1, true],
    ["Words written", words.toLocaleString(), "—", 2, true],
    ["ADPLANE avg", adplane != null ? `${adplane}/49` : "—", adplane != null ? `${Math.round((adplane / 49) * 100)}%` : "—", 3, true],
    ["Stage coverage", `${p.stages.filter((s) => s.status === "completed").length}/${p.stages.length}`, `${coverage}%`, 4, false],
  ];

  return (
    <div className="flex min-h-full flex-col">
      <TopBar title="Campaigns" tabs={[{ label: "Timeline", href: "/timeline" }, { label: "Results", href: "/results", active: true }]} actions={actions} />
      {p.error && <div className="p-6"><ErrorState error={p.error} retry={p.reload} /></div>}
      {p.loading && !p.error && <div className="grid gap-6 p-8 lg:grid-cols-[300px_1.3fr_1fr]"><Skeleton className="h-96" /><Skeleton className="h-96" /><Skeleton className="h-96" /></div>}
      {!p.loading && !p.error && !p.company && <div className="p-8"><EmptyState icon={<Rocket size={20} />} title="No workspace yet" body="Results show each agent's tasks and deliverables once a run exists." action={<Button href="/setup">Set up your company</Button>} /></div>}
      {!p.loading && !p.error && p.company && !items.length && <div className="p-8"><EmptyState icon={<FolderOpen size={20} />} title="Nothing to review yet" body="Start a run; tasks and deliverables land here as the agents work." action={<Button href="/chat?ask=Start the growth run">Start a run</Button>} /></div>}
      {!p.loading && !p.error && p.company && items.length > 0 && (
        <div className={`grid flex-1 grid-cols-[minmax(0,1fr)] bg-surface ${rail ? "lg:grid-cols-[300px_minmax(0,1.3fr)_minmax(380px,1fr)]" : "lg:grid-cols-[300px_minmax(0,1fr)]"}`}>
          <div className="border-b border-black/[0.06] px-4 py-4 lg:hidden">
            <Select value={selected ?? ""} onChange={(e) => setSelected(e.target.value)} aria-label="Select item">
              {groups.map((g) => <optgroup key={g.name} label={g.name}>{g.items.map((i) => <option key={i.id} value={i.id}>{i.title}</option>)}</optgroup>)}
            </Select>
          </div>
          <aside ref={listRef} className="hidden border-r border-black/[0.06] py-4 lg:block" aria-label="Tasks and deliverables">
            {groups.map((g) => (
              <div key={g.name === "Deliverables" ? `deliverables-${flash}` : g.name} data-group={g.name} className={`stagger mb-6 ${g.name === "Deliverables" && flash ? "content-enter rounded-[10px] bg-tint-accent/40" : ""}`}>
                <div className="px-8 pb-2 text-[16px] font-medium">{g.name}</div>
                {g.items.map((i) => {
                  const current = (cursor ?? selected) === i.id;
                  return (
                    <button key={i.id} type="button" data-item={i.id} tabIndex={current ? 0 : -1}
                      onClick={() => { setSelected(i.id); setCursor(i.id); }} onKeyDown={(e) => onListKey(e, i.id)} onFocus={() => setCursor(i.id)}
                      aria-current={i.id === selected ? "true" : undefined}
                      className={`row-hover flex w-full items-center gap-3 px-8 py-2.5 text-left text-[15px] ${i.id === selected ? "bg-[#E6F7F1] hover:!bg-[#DDF3E9]" : ""}`}>
                      {i.status === "done" ? <Check size={14} className="flex-none text-muted" /> : <span className={`h-2 w-2 flex-none rounded-full ${i.status === "blocked" ? "bg-[#F5A524]" : i.status === "proposed" ? "bg-[#3DBF6B]" : "bg-accent"}`} />}
                      <span className="min-w-0 truncate">{i.title}</span>
                    </button>
                  );
                })}
              </div>
            ))}
          </aside>

          <main className="min-w-0 px-8 py-8 lg:px-12">
            {item && (
              <>
                <h2 className="font-display text-[28px] font-medium leading-9">{item.title}</h2>
                <div className="mt-3 flex flex-wrap items-center gap-5 text-[15px]">
                  <span className="flex items-center gap-2"><Avatar name={item.task ? agentByKey(item.task.agent)?.name ?? item.task.agent : item.deliverable?.generated_by || "GrowthPilot"} size={24} /> {item.task ? agentByKey(item.task.agent)?.name : item.deliverable?.generated_by || "GrowthPilot"}</span>
                  <span className="flex items-center gap-2 text-muted"><Calendar size={16} /> {shortDate(new Date(item.task?.created_at ?? item.deliverable!.created_at))} – {shortDate(new Date(item.task?.updated_at ?? item.deliverable!.created_at))}</span>
                  {item.task && (
                    <span key={item.task.status} className="pill-swap">
                      <Pill tone={item.task.status === "done" ? "success" : item.task.status === "blocked" ? "warn" : item.task.status === "proposed" ? "accent2" : item.task.status === "running" || item.task.status === "approved" ? "accent" : "muted"}>
                        {item.task.status === "approved" ? "Running" : titleCase(item.task.status)}
                      </Pill>
                    </span>
                  )}
                </div>
                <p className="mt-6 max-w-[680px] text-[15px] leading-7">{item.task ? item.task.description || "No description." : firstParagraph(item.deliverable!.content_md, 600)}</p>
                {item.task?.error && <p className="mt-3 text-[14px] text-[#B86A00]">{item.task.error}</p>}
                {item.deliverable && <a href={`/deliverables/${item.deliverable.id}`} className="mt-3 inline-block text-[14px] text-accent">Open the full deliverable →</a>}
                {item.task?.status === "proposed" && <div className="mt-5"><Button onClick={() => approve(item.task!)} disabled={busy === item.task.id}>{busy === item.task.id ? <Loader2 size={16} className="animate-spin" /> : <Check size={16} />} Approve and run</Button></div>}

                <div className="mt-10 space-y-6">
                  {comments.slice(-8).map((e) => (
                    <div key={e.id} className="log-row flex gap-3">
                      <Avatar name={e.agent} size={36} />
                      <div className="min-w-0">
                        <div className="text-[15px]"><span className="font-medium">{titleCase(e.agent)}</span> <span className="ml-2 text-[13px] text-muted-strong">{relTime(e.ts)}</span></div>
                        <div className="mt-0.5 text-[15px]">{e.message}</div>
                      </div>
                    </div>
                  ))}
                  {chat.pending !== null && (
                    <div className="flex gap-3"><Avatar name="GrowthPilot" size={36} /><div className="text-[15px]"><span className="font-medium">GrowthPilot</span><div className="mt-0.5 whitespace-pre-wrap">{chat.pending || "Thinking…"}</div></div></div>
                  )}
                  {!comments.length && chat.pending === null && <div className="text-[14px] text-muted-strong">No activity yet for this item.</div>}
                </div>
                <form onSubmit={submit} className="mt-8 flex items-center gap-3">
                  <Avatar name={p.company.name} size={36} />
                  <input className="input flex-1 !h-12" placeholder="Leave a comment or ask the agents…" value={draft} onChange={(e) => setDraft(e.target.value)} disabled={chat.streaming} aria-label="Comment" />
                </form>
              </>
            )}
          </main>

          {rail && (
            <aside className="border-t border-black/[0.06] lg:border-l lg:border-t-0">
              <div className="flex items-center justify-end gap-2 border-b border-black/[0.06] px-6 py-4 text-[14px] text-muted-strong">
                <span className="flex items-center gap-2"><FolderOpen size={16} /> Group with</span>
                <IconButton label="More"><MoreVertical size={16} /></IconButton>
                <IconButton label="Hide panel" onClick={() => setRail(false)}><X size={16} /></IconButton>
              </div>
              <section className="border-b border-black/[0.06] px-8 py-6">
                <div className="text-[14px] text-muted-strong">▾ Goal</div>
                <div className="mt-4 flex flex-wrap items-start justify-between gap-x-6 gap-y-4">
                  <div className="min-w-[150px]">
                    <div className="flex items-center gap-2 text-[16px]"><Target size={18} className="text-accent" /> <span className="tnum">{readiness}%</span> plan readiness</div>
                    <button type="button" aria-expanded={panel} onClick={() => setPanel((v) => !v)} className="btn-link mt-3 !h-8 !px-2 -ml-2 flex items-center gap-3 text-[14px]">
                      Three-lens review <Pill tone="muted">Review</Pill>
                    </button>
                  </div>
                  <Gauge value={readiness} max={100} lenses={p.review?.lenses ?? []} activeLens={panel ? lens : null}
                    onSelectLens={(k) => { setLens(k); setPanel(true); }} onOpen={() => setPanel((v) => !v)} />
                </div>
                {panel && p.review && <LensPanel review={p.review} selected={lens} onSelect={setLens} companyId={p.company.id} />}
              </section>
              <section className="border-b border-black/[0.06] px-8 py-6">
                <div className="flex items-center justify-between text-[14px] text-muted-strong"><span>▾ Tasks <span className="ml-1 tnum">{done}/{p.tasks.length}</span></span><button type="button" className="hover:text-ink" onClick={() => setHideDone((v) => !v)}>{hideDone ? "Show completed" : "Hide completed"}</button></div>
                <ul className="stagger mt-4 space-y-1">
                  {p.tasks.filter((t) => !hideDone || t.status !== "done").map((t) => (
                    <li key={t.id} title={t.description || t.title} className={`row-hover -mx-2 flex items-center gap-3 rounded-[8px] px-2 py-1.5 text-[15px] ${t.status === "done" ? "opacity-60" : ""}`}>
                      <button type="button" aria-label={t.status === "done" ? "Completed" : `Approve ${t.title}`} disabled={t.status !== "proposed" || busy === t.id} onClick={() => approve(t)} className={`grid h-5 w-5 flex-none place-items-center rounded-full border transition-colors duration-[120ms] ${t.status === "done" ? "border-transparent bg-[#DADAE0] text-white" : t.status === "approved" || t.status === "running" ? "border-accent" : "border-black/20 hover:border-accent"}`}>
                        {busy === t.id || t.status === "approved" || t.status === "running" ? <Loader2 size={12} className="animate-spin text-accent" /> : t.status === "done" ? <Check size={12} /> : null}
                      </button>
                      <button type="button" onClick={() => setSelected(`task:${t.id}`)} className={`min-w-0 flex-1 truncate text-left ${t.status === "done" ? "text-muted line-through" : ""}`}>{t.title}</button>
                      <span className={`flex-none text-[13px] tnum ${t.status === "done" ? "text-muted" : "text-accent"}`}>{shortDate(new Date(t.created_at))}</span>
                      <Avatar name={agentByKey(t.agent)?.name ?? t.agent} size={24} />
                    </li>
                  ))}
                </ul>
              </section>
              <section className="px-8 py-6">
                <div className="flex items-center justify-between text-[14px] text-muted-strong"><span>▾ Results</span><span>Source: GrowthPilot run #{p.run?.id} · {relTime(p.run?.finished_at)}</span></div>
                <table className="mt-4 w-full text-[15px]">
                  <thead><tr className="text-left text-[13px] text-muted-strong"><th className="py-1 font-normal" /><th className="py-1 font-normal">Result</th><th className="py-1 font-normal">CR%</th></tr></thead>
                  <tbody>
                    {resultRows.map(([k, v, cr, , jump]) => {
                      return (
                        <tr key={k} className={`row-hover h-12 ${jump ? "cursor-pointer" : ""}`} onClick={jump ? jumpToDeliverables : undefined} title={jump ? "Show the deliverables" : undefined}
                          tabIndex={jump ? 0 : undefined} onKeyDown={jump ? (e) => { if (e.key === "Enter") jumpToDeliverables(); } : undefined}>
                          <td className="rounded-l-[8px] pl-2">{k}</td><td className="font-medium tnum">{v}</td><td className="rounded-r-[8px] pr-2 text-muted tnum">{cr}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
                <div className="mt-4 rounded-[12px] border border-black/[0.08] p-4">
                  <div className="flex items-center justify-between text-[15px]"><span>Spend</span><span className="font-medium tnum">{money(p.run?.cost_usd ?? 0, 2)}</span></div>
                  <div className="mt-2 flex items-center justify-between text-[15px]"><span>ROI</span><a href="/integrations" className="text-accent hover:underline">Set up tracking →</a></div>
                </div>
              </section>
            </aside>
          )}
        </div>
      )}
    </div>
  );
}
