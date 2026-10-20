"use client";

import { useEffect, useMemo, useState } from "react";
import { ChevronRight, Crosshair, Filter, LineChart, Rocket, SlidersHorizontal, TrendingUp } from "lucide-react";
import { TopBar } from "@/components/shell/TopBar";
import { Button } from "@/components/ui/Button";
import { Select, Toggle } from "@/components/ui/Controls";
import { EmptyState, ErrorState, Skeleton } from "@/components/ui/States";
import { ChartLegend, GrowthChart, TickNumber } from "@/components/viz/GrowthChart";
import { MonthRing } from "@/components/viz/MonthRing";
import { StrategyModal } from "@/components/viz/StrategyModal";
import { money } from "@/lib/format";
import { METRIC_LABEL, type Metric, goalDate, milestoneRows, monthYear, monthsElapsed, projectionSeries } from "@/lib/projection";
import { usePlan } from "@/lib/usePlan";
import "@/components/viz/growth.css";

const METRICS: Metric[] = ["revenue", "visitors", "leads"];

export default function GrowthPage() {
  const p = usePlan();
  const [metric, setMetric] = useState<Metric>("revenue");
  const [forecast, setForecast] = useState(true);
  const [modal, setModal] = useState(false);
  const [hot, setHot] = useState<string | null>(null);          // hovered month label (chart <-> table)
  const [open, setOpen] = useState<Set<number>>(new Set());     // expanded milestone rows
  const [savedFlash, setSavedFlash] = useState(false);

  const series = useMemo(() => (p.company ? projectionSeries(p.company, p.demand, metric) : []), [p.company, p.demand, metric]);
  const monthlySpend = (p.comms?.channel_plan ?? []).reduce((s, c) => s + (c.monthly_budget_usd || 0), 0) || p.company?.profile.monthly_budget || 0;
  const rows = useMemo(() => (p.company ? milestoneRows(p.company, p.plan, series, monthlySpend) : []), [p.company, p.plan, series, monthlySpend]);
  const todayLabel = p.company ? series[Math.min(series.length - 1, Math.round(monthsElapsed(p.company)))]?.label : undefined;
  const milestonesByLabel = useMemo(() => Object.fromEntries(rows.map((r) => [r.label, r.milestones.length])), [rows]);
  const roiTint = (roi: number | null) => (roi == null ? "" : roi >= 1 ? "bg-[#E6F7F1]" : roi >= 0 ? "bg-[#EFEBFF]" : "bg-[#FFF1DC]");
  const goalValue = p.company?.profile.revenue_target ?? p.demand?.revenue_goal_usd ?? 0;

  useEffect(() => {
    if (!savedFlash) return;
    const id = setTimeout(() => setSavedFlash(false), 2600);
    return () => clearTimeout(id);
  }, [savedFlash]);

  const toggleRow = (month: number) => setOpen((s) => { const n = new Set(s); if (n.has(month)) n.delete(month); else n.add(month); return n; });

  const link = (Icon: typeof Crosshair, label: string, onClick?: () => void, href?: string, accent = false) => {
    const cls = `tap-44 flex items-center gap-1.5 text-[14px] transition-colors duration-150 ${accent ? "text-accent" : "text-ink/80 hover:text-ink"}`;
    return href ? <a key={label} href={href} className={cls}><Icon size={16} /> {label}</a> : <button key={label} type="button" className={cls} onClick={onClick}><Icon size={16} /> {label}</button>;
  };

  return (
    <div className="flex min-h-full flex-col">
      <TopBar title="Growth" />
      {p.error && <div className="p-6"><ErrorState error={p.error} retry={p.reload} /></div>}
      {p.loading && !p.error && (
        <div className="p-8"><Skeleton className="h-7 w-2/3" /><Skeleton className="mt-8 h-[360px] w-full" /><Skeleton className="mt-8 h-40 w-full" /></div>
      )}
      {!p.loading && !p.error && !p.company && (
        <div className="p-8"><EmptyState icon={<Rocket size={20} />} title="No workspace yet" body="Set up your company and the agents will size the market, build the plan and project the growth curve." action={<Button href="/setup">Set up your company</Button>} /></div>
      )}
      {!p.loading && !p.error && p.company && !p.run && (
        <div className="p-8"><EmptyState icon={<TrendingUp size={20} />} title="No run yet" body="Start a run and the Growth screen fills in with the goal, the projection and the 90-day milestones." action={<Button href="/chat?ask=Start the growth run">Start a run</Button>} /></div>
      )}
      {!p.loading && !p.error && p.company && p.run && (
        <>
          <div className="flex flex-wrap items-center gap-x-8 gap-y-3 border-b border-black/[0.06] bg-surface px-8 py-5">
            <h2 className="t-goal flex flex-wrap items-center gap-x-2">
              <span>Our goal is to reach <TickNumber value={goalValue} format={(n) => money(n)} /> ARR by {monthYear(goalDate(p.company))}</span>
              {savedFlash && <span className="toast-in inline-flex rounded-full bg-tint-accent px-3 py-0.5 text-[13px] font-medium text-accent">Strategy saved</span>}
            </h2>
            <div className="ml-auto flex flex-wrap items-center gap-6">
              {link(Filter, "Edit funnel", () => setModal(true))}
              {link(Crosshair, "Edit goal", undefined, `/setup?company=${p.company.id}`)}
              {link(SlidersHorizontal, "Edit strategy", () => setModal(true))}
              {link(LineChart, "Track growth", undefined, "/chat?ask=Track growth against the plan", true)}
            </div>
          </div>

          <section className="relative bg-surface px-8 pt-5">
            <div className="flex flex-wrap items-center justify-end gap-6 pb-3">
              <label className="flex items-center gap-2 text-[13px] text-muted-strong">Showing
                <Select value={metric} onChange={(e) => setMetric(e.target.value as Metric)} className="!h-8 !w-auto !py-0 !text-[13px]" aria-label="Metric">
                  {METRICS.map((m) => <option key={m} value={m}>{METRIC_LABEL[m]}</option>)}
                </Select>
              </label>
              <ChartLegend showProjected={forecast} />
              <Toggle checked={forecast} onChange={setForecast} label="Forecast trajectory" />
            </div>
            <div className="overflow-x-auto scroll-thin">
              <GrowthChart
                series={series} showProjected={forecast} todayLabel={todayLabel} isMoney={metric === "revenue"} height={380}
                metricLabel={METRIC_LABEL[metric]} milestonesByLabel={milestonesByLabel} hotLabel={hot} onHoverLabel={setHot}
              />
            </div>
          </section>

          <section className="border-t border-black/[0.06] bg-surface">
            <div className="overflow-x-auto scroll-thin">
              <table className="w-full min-w-[720px] text-[15px]">
                <thead>
                  <tr className="text-left text-[13px] text-muted-strong">
                    <th className="w-[46%] px-8 py-4 font-normal">Milestone</th>
                    <th className="px-4 py-4 font-normal">Revenue</th>
                    <th className="px-4 py-4 font-normal">Spend <span className="gx-tt cursor-help" data-tip="Monthly budget from the communications plan" tabIndex={0}>ⓘ</span></th>
                    <th className="px-4 py-4 font-normal">ROI <span className="gx-tt cursor-help" data-tip="(planned revenue − spend) ÷ spend" tabIndex={0}>ⓘ</span></th>
                  </tr>
                </thead>
                <tbody className="stagger">
                  {rows.map((r) => {
                    const isOpen = open.has(r.month);
                    const expandable = r.milestones.length > 1;
                    return (
                      <tr
                        key={r.month}
                        className={`gx-row border-t border-black/[0.05] ${expandable ? "cursor-pointer" : ""}`}
                        data-hot={hot === r.label || undefined}
                        onMouseEnter={() => setHot(r.label)} onMouseLeave={() => setHot(null)}
                        onClick={() => expandable && toggleRow(r.month)}
                      >
                        <td className="max-w-0 px-8 py-1.5">
                          <div className="flex items-center gap-4">
                            <MonthRing label={r.label.split(" ")[0]} progress={r.progress} active={r.progress > 0 && r.progress < 100} tone={r.progress >= 100 ? "accent" : r.progress > 0 ? "warn" : "muted"} />
                            <div className="min-w-0 flex-1">
                              <div className="font-medium leading-6">{r.label}</div>
                              {r.milestones.length ? (
                                <div className="text-[14px] leading-5 text-muted-strong">
                                  <div className="flex min-w-0 items-center">
                                    <span className="truncate" title={r.milestones[0]}>{r.milestones[0]}</span>
                                    {expandable && (
                                      <button type="button" className="ml-1 inline-flex flex-none items-center gap-0.5 whitespace-nowrap text-accent" aria-expanded={isOpen} onClick={(e) => { e.stopPropagation(); toggleRow(r.month); }}>
                                        · +{r.milestones.length - 1} more <span className="gx-caret" data-open={isOpen || undefined}><ChevronRight size={14} /></span>
                                      </button>
                                    )}
                                  </div>
                                  {isOpen && (
                                    <ul className="content-enter mt-2 space-y-1 border-l-2 border-tint-accent pl-3">
                                      {r.milestones.slice(1).map((m) => <li key={m} className="text-[14px] text-ink/80">{m}</li>)}
                                    </ul>
                                  )}
                                </div>
                              ) : <div className="mt-0.5 text-[14px] text-muted-strong">No milestones this month</div>}
                            </div>
                          </div>
                        </td>
                        <td className="px-4 py-3 align-middle"><span className="text-muted">{money(r.planned)}</span> <span className="text-muted">/</span> {money(r.projected)}</td>
                        <td className={`px-4 py-3 align-middle transition-colors duration-150 ${roiTint(r.roi)}`}>{money(r.spend)}</td>
                        <td className={`px-4 py-3 align-middle font-medium transition-colors duration-150 ${roiTint(r.roi)}`}>
                          <span className="gx-tt cursor-help" data-tip={`planned revenue ${money(r.planned)} ÷ spend ${money(r.spend)}`} tabIndex={0}>{r.roi == null ? "—" : `${Math.round(r.roi * 100)}%`}</span>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            <div className="px-8 py-4 text-[12.5px] text-muted-strong-strong">Revenue shows plan / projected per month; actuals appear once an analytics integration is connected.</div>
          </section>

          {modal && p.demand && <StrategyModal company={p.company} demand={p.demand} onClose={() => setModal(false)} onSaved={(c) => { p.setCompany([c]); setSavedFlash(true); }} />}
          {modal && !p.demand && <div className="toast-in fixed inset-x-0 bottom-6 z-50 mx-auto w-fit rounded-full bg-ink px-5 py-2 text-[13px] text-white">The demand-math stage has not completed yet.</div>}
        </>
      )}
    </div>
  );
}
