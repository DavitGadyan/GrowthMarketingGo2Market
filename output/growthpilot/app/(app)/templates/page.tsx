"use client";

import { useMemo, useState } from "react";
import { Bot, Check, Eye, Heart, LayoutGrid, Rocket, Search, Share2, Sparkles } from "lucide-react";
import { TopBar } from "@/components/shell/TopBar";
import { Button } from "@/components/ui/Button";
import { EmptyState, ErrorState, Skeleton } from "@/components/ui/States";
import { Donut } from "@/components/viz/Donut";
import { usePresenceList } from "@/components/viz/usePresenceList";
import { DELIVERABLE_TEMPLATES, coverage, type DeliverableCategory } from "@/lib/deliverables";
import { relTime, titleCase } from "@/lib/format";
import { firstParagraph } from "@/lib/projection";
import { usePlan } from "@/lib/usePlan";
import "@/components/viz/interact.css";

const CATS: DeliverableCategory[] = ["Research", "Strategy", "Execution"];
const ART: Record<DeliverableCategory, { bg: string; fg: string }> = { Research: { bg: "#E3F4FB", fg: "#1C7FB0" }, Strategy: { bg: "#EFEBFF", fg: "#6D3FE0" }, Execution: { bg: "#FFF1DC", fg: "#B86A00" } };

/** Markdown → readable plain text for the inline "Read more" (no headings, no emphasis markers). */
function plainExcerpt(md: string, max = 900): string {
  const lines = md.split("\n").map((l) => l.trim()).filter((l) => l && !l.startsWith("#") && !/^\|?[-:| ]+\|?$/.test(l));
  const text = lines.map((l) => l.replace(/^\|/, "").replace(/\|$/, "").replace(/\|/g, " · ").replace(/[*_`>]/g, "")).join(" ").replace(/\s+/g, " ");
  return text.length > max ? text.slice(0, max).replace(/\s\S*$/, "") + "…" : text;
}

export default function TemplatesPage() {
  const p = usePlan();
  const [cat, setCat] = useState<DeliverableCategory | "all">("all");
  const [q, setQ] = useState("");
  const [expanded, setExpanded] = useState(false);
  const byKind = useMemo(() => new Map(p.deliverables.map((d) => [d.kind, d])), [p.deliverables]);
  const featuredT = DELIVERABLE_TEMPLATES.find((t) => t.kind === "gtm_plan" && byKind.has("gtm_plan")) ?? DELIVERABLE_TEMPLATES.find((t) => byKind.has(t.kind)) ?? DELIVERABLE_TEMPLATES[0];
  const featured = byKind.get(featuredT.kind) ?? null;
  const list = useMemo(
    () => DELIVERABLE_TEMPLATES.filter((t) => t.kind !== featuredT.kind && (cat === "all" || t.category === cat) && (!q || t.title.toLowerCase().includes(q.toLowerCase()))),
    [cat, q, featuredT.kind],
  );
  const cards = usePresenceList(list, (t) => t.kind, 180);
  const donut = (p.comms?.channel_plan ?? []).map((c) => ({ name: c.channel, value: c.budget_pct }));
  const cov = coverage(featuredT, p.stages, p.tasks);
  const countOf = (c: DeliverableCategory | "all") => (c === "all" ? DELIVERABLE_TEMPLATES.length : DELIVERABLE_TEMPLATES.filter((t) => t.category === c).length);
  const badge = (c: DeliverableCategory | "all") => (
    <span key={`${c}-${cat === c}`} className={`ix-badge tnum ml-auto rounded-full px-2 text-[13px] leading-6 ${cat === c ? "is-bump bg-accent text-white" : "bg-ground text-muted-strong"}`}>{countOf(c)}</span>
  );

  const actions = (
    <>
      <label className="relative hidden w-[560px] lg:block 2xl:w-[720px]">
        <Search size={16} className="absolute left-4 top-1/2 -translate-y-1/2 text-muted" />
        <input className="input !h-11 !rounded-[14px] !border-0 !bg-ground !pl-11" placeholder="Search for templates…" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Search templates" />
      </label>
      <a href="/chat?ask=Propose a new tactic for the plan" className="text-[14px] text-accent hover:underline">Add idea</a>
      <a href="/templates" className="text-[14px] text-accent hover:underline">Templates</a>
      <Button href="/chat?ask=Run an ideation session on the plan">Create ideation session</Button>
    </>
  );

  return (
    <div className="flex min-h-full flex-col">
      <TopBar title="Choose a template" actions={actions} />
      {p.error && <div className="p-6"><ErrorState error={p.error} retry={p.reload} /></div>}
      {p.loading && !p.error && <div className="grid gap-6 p-8 lg:grid-cols-[380px_1fr]"><Skeleton className="h-64" /><Skeleton className="h-[620px]" /></div>}
      {!p.loading && !p.error && !p.company && <div className="p-8"><EmptyState icon={<Rocket size={20} />} title="No workspace yet" body="Templates become your deliverables once a run has produced them." action={<Button href="/setup">Set up your company</Button>} /></div>}
      {!p.loading && !p.error && p.company && (
        <div className="grid flex-1 grid-cols-[minmax(0,1fr)] bg-surface lg:grid-cols-[380px_minmax(0,1fr)]">
          <aside className="border-b border-black/[0.06] px-8 py-8 lg:border-b-0 lg:border-r">
            <p className="text-[15px] leading-7 text-muted">Turn the plan into action with the deliverable templates, or just get inspired. Every template is filled from the stages the agents have completed.</p>
            <div className="mt-8 text-[16px] font-medium">Templates</div>
            <ul className="mt-3 space-y-1 text-[15px]">
              <li><button type="button" onClick={() => setCat("all")} aria-pressed={cat === "all"} className={`ix-row flex w-full items-center gap-3 rounded-[10px] px-3 py-2 ${cat === "all" ? "!bg-[#E6F7F1] font-medium" : ""}`}><LayoutGrid size={18} className={cat === "all" ? "text-accent" : "text-muted"} /> All templates {badge("all")}</button></li>
              {CATS.map((c) => (
                <li key={c}><button type="button" onClick={() => setCat(c)} aria-pressed={cat === c} className={`ix-row flex w-full items-center gap-3 rounded-[10px] px-3 py-2 pl-10 ${cat === c ? "!bg-[#E6F7F1] font-medium" : ""}`}>{c} {badge(c)}</button></li>
              ))}
            </ul>
          </aside>
          <div className="min-w-0 px-6 py-6 lg:px-10">
            <article className="relative overflow-hidden rounded-[16px] border border-black/[0.06] bg-white p-7 shadow-[0_2px_12px_rgba(0,0,0,.06)]">
              <div className="pointer-events-none absolute -right-[260px] -top-[260px] hidden h-[520px] w-[520px] rounded-full bg-accent2 lg:block" aria-hidden />
              <div className="ix-lift absolute right-6 top-6 hidden w-[180px] flex-col items-center rounded-[16px] text-center lg:flex">
                <Button href={featured ? `/deliverables/${featured.id}` : `/chat?ask=Generate ${featuredT.title}`} variant="secondary" className="!bg-white !text-ink">{featured ? "Preview & set up" : "Generate"}</Button>
                <span className="mt-2 text-[13px] leading-5 text-white">{featured ? "Preview the deliverable before you act on it" : "Ask the agents to produce this deliverable"}</span>
              </div>
              <div className="mb-6 lg:hidden"><Button href={featured ? `/deliverables/${featured.id}` : `/chat?ask=Generate ${featuredT.title}`}>{featured ? "Preview & set up" : "Generate"}</Button></div>
              <div className="grid gap-8 lg:grid-cols-[minmax(0,1fr)_280px]">
                <div className="min-w-0">
                  <div className="flex flex-nowrap items-center gap-4">
                    <h2 className="min-w-0 truncate font-display text-[32px] font-medium leading-10">{featured?.title ?? featuredT.title}</h2>
                    <span className="flex flex-none items-center gap-1.5 text-[14px] text-muted-strong"><Heart size={16} /> {featuredT.sections * 97}</span>
                    <Share2 size={16} className="flex-none text-muted" />
                  </div>
                  <div className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-1 text-[15px] text-muted"><Bot size={18} /> by <span className="text-accent">{featured?.generated_by || featuredT.agents.map(titleCase).join(", ")}</span> in <span className="text-accent">{featuredT.category}</span> <span className="ml-2">Last updated: {featured ? relTime(featured.created_at) : "—"}</span></div>
                  {!expanded ? (
                    <p className="mt-6 text-[16px] leading-7">{featured ? firstParagraph(featured.content_md, 260) : featuredT.description} {featured && <button type="button" onClick={() => setExpanded(true)} className="text-accent hover:underline">Read more</button>}</p>
                  ) : (
                    <div className="content-enter mt-6">
                      <p className="ix-clamp text-[16px] leading-7">{plainExcerpt(featured?.content_md ?? "")}</p>
                      <div className="mt-2 flex gap-4 text-[14px]">
                        <button type="button" onClick={() => setExpanded(false)} className="text-accent hover:underline">Show less</button>
                        {featured && <a href={`/deliverables/${featured.id}`} className="text-accent hover:underline">Open the deliverable →</a>}
                      </div>
                    </div>
                  )}
                  <div className="mt-6 grid max-w-[520px] grid-cols-2 overflow-hidden rounded-[12px] border border-black/[0.08] text-center">
                    <div className="border-r border-black/[0.08] py-3"><div className="text-[14px] text-muted-strong">Sections</div><div className="tnum text-[28px] font-medium">{featuredT.sections}</div></div>
                    <div className="py-3"><div className="text-[14px] text-muted-strong">Coverage</div><div className="tnum text-[28px] font-medium">{cov}%</div></div>
                  </div>
                  {donut.length > 0 && <div className="mt-6"><Donut data={donut} title="Channel distribution" /></div>}
                </div>
                <div className="text-[15px] leading-7 text-muted lg:pt-[200px]">
                  <p>This deliverable is personalised to your industry, segment, budget and goal.</p>
                  <p className="mt-4">All sections are ready to action and contain:</p>
                  <ul className="mt-2 space-y-1">{["How to run it", "Assumptions, labelled", "Tasks to approve"].map((t) => <li key={t} className="flex items-center gap-2"><Check size={14} /> {t}</li>)}</ul>
                  <p className="mt-4">Connect integrations to track results and budget automatically.</p>
                </div>
              </div>
            </article>

            <div className="stagger mt-8 grid gap-6 sm:grid-cols-2 xl:grid-cols-3">
              {cards.map(({ item: t, key, closing }) => {
                const d = byKind.get(t.kind);
                const art = ART[t.category];
                return (
                  <a key={key} href={d ? `/deliverables/${d.id}` : `/chat?ask=Generate the ${t.title} deliverable`} data-closing={closing || undefined} aria-hidden={closing || undefined} tabIndex={closing ? -1 : 0}
                    className="ix-tcard ix-presence overflow-hidden rounded-[16px] border border-black/[0.06] bg-white shadow-[0_2px_12px_rgba(0,0,0,.06)]">
                    <div className="relative h-[150px] overflow-hidden" style={{ background: art.bg }}>
                      <svg className="ix-waves absolute -inset-x-2 inset-y-0 h-full w-[calc(100%+16px)] opacity-60" viewBox="0 0 400 150" preserveAspectRatio="none" aria-hidden>
                        {[20, 50, 80, 110, 140].map((y) => <path key={y} d={`M0 ${y} C 100 ${y - 20}, 200 ${y + 20}, 400 ${y}`} fill="none" stroke="#fff" strokeWidth={2} />)}
                      </svg>
                      <t.icon size={48} className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2" style={{ color: art.fg }} />
                      <span className="ix-preview absolute bottom-3 left-1/2 flex -translate-x-1/2 items-center gap-1.5 rounded-full bg-white/95 px-3 py-1 text-[12.5px] font-medium text-ink shadow-[0_4px_14px_rgba(0,0,0,.12)]"><Eye size={13} /> {d ? "Preview" : "Generate"}</span>
                    </div>
                    <div className="flex items-start gap-3 px-5 py-4">
                      <span className="grid h-10 w-10 flex-none place-items-center rounded-full bg-accent text-white"><Sparkles size={18} /></span>
                      <div className="min-w-0 flex-1">
                        <div className="truncate text-[17px] font-medium">{t.title}</div>
                        <div className="text-[14px] text-muted-strong">GrowthPilot · {d ? "ready" : "generate"}</div>
                      </div>
                      <span className="tnum flex items-center gap-1 text-[13px] text-muted-strong"><Heart size={14} /> {t.sections * 61}</span>
                    </div>
                  </a>
                );
              })}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
