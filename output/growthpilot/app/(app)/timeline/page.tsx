"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { ChevronDown, Flag, LayoutList, ListFilter, MoreHorizontal, Rocket, Search, TrendingUp } from "lucide-react";
import { TopBar } from "@/components/shell/TopBar";
import { Button, IconButton } from "@/components/ui/Button";
import { EmptyState, ErrorState, Skeleton } from "@/components/ui/States";
import { ChartLegend, GrowthChart, TickNumber } from "@/components/viz/GrowthChart";
import { GANTT_LEFT, Gantt, type GanttGroup, type GanttRow } from "@/components/viz/Gantt";
import { agentByKey } from "@/lib/agents";
import { money, relTime } from "@/lib/format";
import { PHASE_LABEL, PHASE_ORDER, goalDate, monthYear, monthlyGoal, shortDate, taskWeeks, weeklySeries, weeksElapsed } from "@/lib/projection";
import { usePlan } from "@/lib/usePlan";
import "@/components/viz/growth.css";

const WEEKS = 13;
const CHART_H = 280;
const PLOT_TOP = 12;   // chart margin.top
const PLOT_BOTTOM = 2; // the hidden numeric x-axis height

/** 1 / 2 / 2.5 / 5 x 10^n step so the 5 ticks land on round numbers */
function niceMax(v: number): number {
  if (v <= 0) return 1;
  const raw = (v * 1.2) / 4;
  const p = 10 ** Math.floor(Math.log10(raw));
  const step = [1, 2, 2.5, 5, 10].map((m) => m * p).find((x) => x >= raw) ?? raw;
  return step * 4;
}

function useIsLg(): boolean {
  const [lg, setLg] = useState(true);
  useEffect(() => {
    const mq = window.matchMedia("(min-width: 1024px)");
    const on = () => setLg(mq.matches);
    on(); mq.addEventListener("change", on);
    return () => mq.removeEventListener("change", on);
  }, []);
  return lg;
}

export default function TimelinePage() {
  const p = usePlan();
  const router = useRouter();
  const [byChannel, setByChannel] = useState(false);
  const [zoom, setZoom] = useState(1);
  const [hotWeek, setHotWeek] = useState<number | null>(null);        // chart <-> rings <-> bars crosshair
  const [selectedWeek, setSelectedWeek] = useState<number | null>(null);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [progressOpen, setProgressOpen] = useState(false);
  const [readinessLocal, setReadinessLocal] = useState<number | null>(null); // slider value, not persisted
  const popRef = useRef<HTMLDivElement>(null);

  const series = useMemo(() => (p.company ? weeklySeries(p.company, p.demand, WEEKS) : []), [p.company, p.demand]);
  const elapsed = p.company ? weeksElapsed(p.company) : 0;
  const todayWeek = Math.floor(elapsed) + 1;
  const todayProgress = Math.round((elapsed % 1) * 100);
  const reviewReadiness = p.review?.plan_readiness_pct ?? 0;
  const readiness = readinessLocal ?? reviewReadiness;
  const concern = p.review?.lenses.find((l) => l.verdict !== "pass");
  const budget = p.company?.profile.monthly_budget ?? 0;
  const isLg = useIsLg();
  const ganttLeft = isLg ? GANTT_LEFT : 260;
  // readable Y range for the 13-week window: the series' own max (x1.2), not the annual goal
  const yMax = useMemo(() => niceMax(Math.max(0, ...series.map((pt) => Math.max(pt.plan ?? 0, pt.projected ?? 0)))), [series]);
  const yTicks = useMemo(() => [0, 1, 2, 3, 4].map((i) => (yMax * i) / 4), [yMax]);
  const goalM = series[0]?.goal ?? 0;

  useEffect(() => {
    if (!progressOpen) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setProgressOpen(false);
    const onDown = (e: MouseEvent) => { if (popRef.current && !popRef.current.contains(e.target as Node)) setProgressOpen(false); };
    window.addEventListener("keydown", onKey); window.addEventListener("mousedown", onDown);
    return () => { window.removeEventListener("keydown", onKey); window.removeEventListener("mousedown", onDown); };
  }, [progressOpen]);

  const selectWeek = (w: number) => {
    // selecting highlights the week everywhere; it no longer zooms, so the chart above stays on the Gantt's grid
    setSelectedWeek((cur) => (cur === w ? null : w));
  };

  const groups: GanttGroup[] = useMemo(() => {
    if (!p.company) return [];
    const out: GanttGroup[] = [];
    const icons = { pre_launch: Flag, launch: Rocket, post_launch: TrendingUp } as const;
    if (!byChannel) {
      for (const ph of PHASE_ORDER) {
        const ms = (p.plan?.timeline ?? []).filter((m) => m.phase === ph);
        if (!ms.length) continue;
        out.push({
          title: PHASE_LABEL[ph], spend: budget ? `${money(budget)}/mo` : undefined,
          rows: ms.map((m, i): GanttRow => ({ id: `${ph}-${i}`, title: m.milestone, status: m.week < todayWeek ? "past" : "planned", icon: icons[ph], meta: m.depends_on ? "1" : undefined, owner: m.owner || "Founder", start: m.week, end: m.week, kind: "milestone", phase: PHASE_LABEL[ph], dependsOn: m.depends_on })),
          addLabel: `Add ${PHASE_LABEL[ph].toLowerCase()} milestone…`, addHref: `/chat?ask=Add a ${PHASE_LABEL[ph].toLowerCase()} milestone to the 90-day plan`,
        });
      }
    } else {
      for (const ch of p.comms?.channel_plan ?? []) {
        const ms = (p.plan?.timeline ?? []).filter((m) => m.milestone.toLowerCase().includes(ch.channel.toLowerCase().split(" ")[0]));
        out.push({ title: ch.channel, spend: money(ch.monthly_budget_usd), rows: ms.map((m, i): GanttRow => ({ id: `${ch.channel}-${i}`, title: m.milestone, status: m.week < todayWeek ? "past" : "planned", icon: Flag, owner: m.owner || "Founder", start: m.week, end: m.week, kind: "milestone", phase: PHASE_LABEL[m.phase], dependsOn: m.depends_on })), addLabel: `Add ${ch.channel} campaign…`, addHref: `/chat?ask=Propose a ${ch.channel} campaign` });
      }
    }
    if (p.tasks.length) {
      out.push({
        title: "Execution tasks", spend: undefined,
        rows: p.tasks.map((t): GanttRow => {
          const w = taskWeeks(t, p.company!);
          const a = agentByKey(t.agent);
          const status: GanttRow["status"] = t.status === "done" ? "done" : t.status === "running" || t.status === "approved" ? "running" : t.status === "blocked" ? "blocked" : "proposed";
          return { id: `task-${t.id}`, title: t.title, status, icon: a?.icon ?? Flag, meta: t.integration ? `needs ${t.integration}` : undefined, spend: t.estimated_cost || undefined, owner: a?.name ?? t.agent, start: w.start, end: w.end, kind: "task", taskId: t.id };
        }),
        addLabel: "Add execution task…", addHref: "/chat?ask=Propose a new execution task",
      });
    }
    return out;
  }, [p.company, p.plan, p.comms, p.tasks, byChannel, budget, todayWeek]);

  const actions = (
    <>
      <a href={p.company ? `/setup?company=${p.company.id}` : "/setup"} className="text-[14px] text-accent hover:underline">Import campaigns</a>
      <Button href="/chat?ask=Propose a new campaign for the plan">Add campaign <ChevronDown size={16} /></Button>
    </>
  );

  const toolbar = (
    <>
      <IconButton label="Layout"><LayoutList size={18} /></IconButton>
      <button type="button" className="whitespace-nowrap text-[15px]" onClick={() => setByChannel((v) => !v)}>Campaigns <span className="text-muted underline decoration-dotted underline-offset-4">by {byChannel ? "Channel" : "Phase"}</span></button>
      {isLg && <>
        <IconButton label="Filter"><ListFilter size={18} /></IconButton>
        <IconButton label="Search"><Search size={18} /></IconButton>
        <span className="ml-2 whitespace-nowrap text-[14px]">↓ Spend</span>
        <IconButton label="More"><MoreHorizontal size={18} /></IconButton>
      </>}
    </>
  );

  const deltaLine = readinessLocal != null && readinessLocal !== reviewReadiness
    ? <span className="text-muted-strong">{readinessLocal > reviewReadiness ? "▲" : "▼"} set manually · review says {reviewReadiness}% · not saved</span>
    : concern ? <span className="text-[#B86A00]">▲ {concern.lens.replace(/_/g, " ")}: {concern.verdict}</span> : <span className="text-[#1F8B4C]">▲ all three review lenses pass</span>;

  return (
    <div className="flex min-h-full flex-col">
      <TopBar title="Campaigns" tabs={[{ label: "Timeline", href: "/timeline", active: true }, { label: "Results", href: "/results" }]} actions={actions} />
      {p.error && <div className="p-6"><ErrorState error={p.error} retry={p.reload} /></div>}
      {p.loading && !p.error && <div className="p-8"><Skeleton className="h-[320px] w-full" /><Skeleton className="mt-6 h-14 w-full" /><Skeleton className="mt-6 h-64 w-full" /></div>}
      {!p.loading && !p.error && !p.company && <div className="p-8"><EmptyState icon={<Rocket size={20} />} title="No workspace yet" body="Set up your company; the 90-day plan lands here as a timeline you can act on." action={<Button href="/setup">Set up your company</Button>} /></div>}
      {!p.loading && !p.error && p.company && !p.run && <div className="p-8"><EmptyState icon={<Flag size={20} />} title="No plan yet" body="Start a run; stage 13 produces the 90-day timeline shown here." action={<Button href="/chat?ask=Start the growth run">Start a run</Button>} /></div>}
      {!p.loading && !p.error && p.company && p.run && (
        <>
          {/* goal card = the Gantt's left column; the chart = the Gantt's grid, so one axis runs through both */}
          <div className="grid grid-cols-[minmax(0,1fr)] border-b border-black/[0.06] bg-surface lg:grid-cols-[520px_minmax(0,1fr)]">
            <div className="relative min-w-0 border-b border-black/[0.06] px-8 py-8 lg:border-b-0 lg:border-r">
              <div className="flex items-center gap-2 text-[14px] text-muted-strong">Goal <MoreHorizontal size={16} /></div>
              <h2 className="t-title mt-3 text-[24px] leading-8">Reach {money(monthlyGoal(p.company, p.demand))}/mo revenue<br />by {monthYear(goalDate(p.company))}</h2>
              <div className="mt-6 flex items-center gap-3 text-[14px] text-muted-strong">
                {shortDate(new Date())}
                <button type="button" className="flex items-center gap-1 text-accent" aria-expanded={progressOpen} onClick={() => setProgressOpen((o) => !o)}><TrendingUp size={16} /> Update progress</button>
              </div>
              {progressOpen && (
                <div ref={popRef} className="toast-in absolute left-8 top-[140px] z-20 w-[300px] rounded-[12px] border border-black/[0.08] bg-white p-4 shadow-[0_12px_40px_rgba(17,17,20,.14)]">
                  <div className="flex items-center justify-between text-[13px]"><span className="font-medium">Plan readiness</span><span className="tnum text-accent">{readiness}%</span></div>
                  <input
                    type="range" min={0} max={100} value={readiness} aria-label="Plan readiness"
                    className="gx-range mt-3" style={{ ["--v" as string]: `${readiness}%` }}
                    onChange={(e) => setReadinessLocal(Number(e.target.value))}
                  />
                  <div className="mt-3 flex items-center justify-between text-[12.5px] text-muted-strong">
                    <span>Review estimate: {reviewReadiness}%</span>
                    <button type="button" className="text-accent" onClick={() => setReadinessLocal(null)}>Reset</button>
                  </div>
                  <div className="mt-1 text-[12px] text-muted-strong-strong">Local only — ask the agents to re-run the review to persist.</div>
                </div>
              )}
              <div className="t-num mt-4 text-[28px]"><TickNumber value={readiness} format={(n) => `${Math.round(n)}%`} ms={400} /> plan ready</div>
              <div className="mt-1 text-[14px]">{deltaLine}</div>
            </div>
            <div className="relative min-w-0 pt-5">
              <div className="flex flex-wrap items-center justify-end gap-4 px-6 pb-3"><ChartLegend showProjected note="No actuals yet — connect analytics" /></div>
              <div className="relative">
                {/* Y labels sit at the right edge of the goal-card cell (lg) so the plot itself keeps the Gantt's grid */}
                <div className="pointer-events-none absolute right-full mr-3 hidden w-16 lg:block" style={{ top: PLOT_TOP, bottom: PLOT_BOTTOM }} aria-hidden>
                  {yTicks.map((t) => (
                    <span key={t} className={`tnum absolute right-0 text-[12.5px] text-muted-strong ${t === 0 ? "-translate-y-full" : "-translate-y-1/2"}`} style={{ top: `${(1 - t / yMax) * 100}%` }}>{money(t, 0)}</span>
                  ))}
                </div>
                {goalM > yMax && (
                  <div className="pointer-events-none absolute right-4 z-[1] flex items-center gap-2 rounded-full border border-success/30 bg-white/90 px-3 py-1 text-[12.5px] text-[#1F8B4C]" style={{ top: PLOT_TOP + 4 }}>
                    <span className="inline-block h-[2px] w-3 bg-success" /> Goal {money(goalM, 0)}/mo ↑ above this range
                  </div>
                )}
                <GrowthChart series={series} weekly weeks={WEEKS} todayX={todayWeek - 0.5} hideYAxis margin={{ top: PLOT_TOP, right: 0, bottom: 0, left: 0 }} height={CHART_H} hotWeek={hotWeek} onHoverWeek={setHotWeek} yMax={yMax} yTicks={yTicks} />
              </div>
            </div>
          </div>

          <div className="relative flex-1 bg-surface">
            {groups.length
              ? <Gantt
                  groups={groups} weeks={WEEKS} todayWeek={todayWeek} todayProgress={todayProgress} zoom={zoom} toolbar={toolbar} left={ganttLeft}
                  hotWeek={hotWeek} onHotWeek={setHotWeek} selectedWeek={selectedWeek} onSelectWeek={selectWeek}
                  expandedId={expandedId} onToggleRow={(r) => setExpandedId((id) => (id === r.id ? null : r.id))}
                  onOpenTask={(r) => router.push(`/results?task=${r.taskId}`)}
                />
              : <div className="p-8 text-[14px] text-muted-strong">The 90-day timeline is empty for this run.</div>}
            <div className="sticky bottom-4 ml-6 inline-flex items-center gap-3 rounded-full border border-black/[0.08] bg-white px-4 py-2 text-[13px] shadow-[0_4px_16px_rgba(0,0,0,.08)]">
              <button type="button" className="hover:text-accent" onClick={() => selectWeek(todayWeek)}>Today</button>
              <button type="button" aria-label="Zoom out" className="px-1 text-muted hover:text-ink" onClick={() => setZoom((z) => Math.max(0.7, +(z - 0.15).toFixed(2)))}>−</button>
              <span className="tnum w-10 text-center text-muted-strong">{Math.round(zoom * 100)}%</span>
              <button type="button" aria-label="Zoom in" className="px-1 text-muted hover:text-ink" onClick={() => setZoom((z) => Math.min(1.9, +(z + 0.15).toFixed(2)))}>+</button>
            </div>
          </div>
          <div className="px-6 py-2 text-[12.5px] text-muted-strong-strong">Updated {relTime(p.run.finished_at ?? p.run.started_at)}</div>
        </>
      )}
    </div>
  );
}
