/**
 * Derived series for the Growth / Timeline / Ideas screens: a monthly revenue
 * projection to the goal, the 90-day plan folded into months, funnel
 * collapsing, priority scores and cost parsing. Pure functions, no fetching.
 */
import type { Company, DemandMath, Priority, Task, WaterfallStep } from "./types";

// Stage-13 output shape (mirrors backend/app/schemas.py GtmPlan); not in types.ts yet.
export type Phase = "pre_launch" | "launch" | "post_launch";
export interface Milestone { phase: Phase; week: number; milestone: string; owner: string; depends_on: string }
export interface GtmPlan {
  objectives: string[]; target_segments: string[]; value_proposition: string; channel_strategy: string;
  budget_summary: string; timeline: Milestone[]; scenario: string;
}
export const PHASE_LABEL: Record<Phase, string> = { pre_launch: "Pre-launch", launch: "Launch", post_launch: "Post-launch" };
export const PHASE_ORDER: Phase[] = ["pre_launch", "launch", "post_launch"];

export const DAY = 86400000;

export function addMonths(d: Date, n: number): Date {
  const x = new Date(d);
  x.setMonth(x.getMonth() + n);
  return x;
}
export const monthYear = (d: Date) => d.toLocaleDateString("en-US", { month: "long", year: "numeric" });
export const monthShort = (d: Date) => d.toLocaleDateString("en-US", { month: "short" });
export const shortDate = (d: Date) => d.toLocaleDateString("en-US", { month: "short", day: "numeric" });

export function startDate(company: Company): Date {
  return new Date(company.created_at);
}
export function horizonMonths(company: Company): number {
  return Math.max(3, company.profile.time_horizon_months || 12);
}
export function goalDate(company: Company): Date {
  return addMonths(startDate(company), horizonMonths(company));
}
/** Annual revenue target expressed per month. */
export function monthlyGoal(company: Company, demand?: DemandMath | null): number {
  const t = company.profile.revenue_target ?? demand?.revenue_goal_usd ?? 0;
  return t / 12;
}
/** Fractional months elapsed since the workspace was created. */
export function monthsElapsed(company: Company): number {
  return Math.max(0, (Date.now() - startDate(company).getTime()) / (DAY * 30.44));
}
export function weeksElapsed(company: Company): number {
  return Math.max(0, (Date.now() - startDate(company).getTime()) / (DAY * 7));
}

export type Metric = "revenue" | "visitors" | "leads";
export const METRIC_LABEL: Record<Metric, string> = { revenue: "Revenue", visitors: "Visitors", leads: "Leads" };

export interface ProjPoint { i: number; label: string; projected: number; plan: number; goal: number; past: boolean; w?: number }

function metricScale(demand: DemandMath | null | undefined, goalM: number, metric: Metric): number {
  if (metric === "revenue" || !demand || !goalM) return 1;
  const visitors = demand.monthly_visitors_needed || (demand.waterfall[0]?.count ?? 0) / 12;
  if (metric === "visitors") return visitors / goalM;
  const rate = demand.waterfall[0]?.conversion_to_next ?? 0.03;
  return (visitors * rate) / goalM;
}

/** Logistic S-curve (0..1) at fraction `t` of the horizon; k=10, midpoint 0.55. */
function ramp(t: number): number {
  const k = 10, mid = 0.55;
  const s0 = 1 / (1 + Math.exp(k * mid));
  const s1 = 1 / (1 + Math.exp(-k * (1 - mid)));
  const x = Math.max(0, Math.min(1, t));
  return (1 / (1 + Math.exp(-k * (x - mid))) - s0) / (s1 - s0);
}

/** Monthly run-rate of the projection at a fractional month offset from the start. */
export function pointAt(company: Company, demand: DemandMath | null | undefined, months: number, metric: Metric = "revenue"): { projected: number; plan: number; goal: number } {
  const horizon = horizonMonths(company);
  const goalM = monthlyGoal(company, demand);
  const budget = company.profile.monthly_budget ?? 0;
  const plannedRoi = Math.min(20, Math.max(1, budget ? (goalM * 12) / (budget * 12) : 1));
  const scale = metricScale(demand, goalM, metric);
  const t = Math.max(0, Math.min(1, months / horizon));
  return {
    projected: Math.round(goalM * ramp(t) * scale),
    plan: Math.round(Math.min(goalM, budget * plannedRoi * t) * scale),
    goal: Math.round(goalM * scale),
  };
}

/** Logistic ramp to the monthly goal ("Projected") and a budget-driven linear plan ("Plan"), one point per month. */
export function projectionSeries(company: Company, demand?: DemandMath | null, metric: Metric = "revenue"): ProjPoint[] {
  const horizon = horizonMonths(company);
  const start = startDate(company);
  const elapsed = monthsElapsed(company);
  return Array.from({ length: horizon + 1 }, (_, i) => {
    const d = addMonths(start, i);
    return { i, label: `${monthShort(d)} '${String(d.getFullYear()).slice(2)}`, ...pointAt(company, demand, i, metric), past: i <= elapsed };
  });
}

/**
 * The 90-day window as 14 points (w = 0..13): the same projection sampled per
 * week, so the timeline chart's vertical grid lands on the Gantt's column
 * boundaries. Labels are W1..W13; w = 0 is the unlabelled left edge.
 */
export function weeklySeries(company: Company, demand?: DemandMath | null, weeks = 13): ProjPoint[] {
  const elapsed = weeksElapsed(company);
  return Array.from({ length: weeks + 1 }, (_, w) => ({
    i: w, w, label: w === 0 ? "" : `W${w}`, ...pointAt(company, demand, (w * 7) / 30.44), past: w <= elapsed,
  }));
}

/** Current-month run-rates for the strategy table's "Starting point" column. */
export function startingPoint(company: Company, demand: DemandMath): { month: Date; visitors: number; leads: number; customers: number; revenue: number } {
  const idx = Math.min(horizonMonths(company), Math.max(1, Math.round(monthsElapsed(company))));
  const revenue = pointAt(company, demand, idx, "revenue").projected;
  const visitors = pointAt(company, demand, idx, "visitors").projected;
  const leads = pointAt(company, demand, idx, "leads").projected;
  const asv = demand.average_sale_value_usd || company.profile.known_metrics.average_sale_value || 0;
  const f = collapseFunnel(demand);
  const l2c = f[1].value ? f[2].value / f[1].value : 0;
  const customers = asv ? revenue / asv : leads * l2c;
  return { month: addMonths(startDate(company), idx), visitors, leads, customers, revenue };
}

export interface MilestoneRow {
  month: number; label: string; progress: number; milestones: string[]; planned: number; projected: number; spend: number; roi: number | null;
}
/** The 90-day plan folded into its three months, with the projection's numbers for each. */
export function milestoneRows(company: Company, plan: GtmPlan | null | undefined, series: ProjPoint[], monthlySpend: number): MilestoneRow[] {
  const elapsed = monthsElapsed(company);
  const byMonth = new Map<number, string[]>();
  for (const m of plan?.timeline ?? []) {
    const idx = Math.min(3, Math.max(1, Math.ceil(m.week / 4.34)));
    byMonth.set(idx, [...(byMonth.get(idx) ?? []), m.milestone]);
  }
  return [1, 2, 3].map((month) => {
    const p = series[month] ?? series[series.length - 1];
    const spend = monthlySpend;
    return {
      month,
      label: p?.label ?? `M${month}`,
      progress: Math.max(0, Math.min(100, Math.round((elapsed - (month - 1)) * 100))),
      milestones: byMonth.get(month) ?? [],
      planned: p?.plan ?? 0,
      projected: p?.projected ?? 0,
      spend,
      roi: spend ? ((p?.plan ?? 0) - spend) / spend : null,
    };
  });
}

export interface FunnelStageViz { key: string; label: string; value: number; unit: string; conv?: string }
/** Collapse the waterfall to Visitors -> Leads -> Customers -> Revenue (annual totals). */
export function collapseFunnel(demand: DemandMath): FunnelStageViz[] {
  const w = demand.waterfall;
  const find = (re: RegExp, fallback: WaterfallStep | undefined) => w.find((s) => re.test(s.stage)) ?? fallback;
  const visitors = w[0];
  const leads = find(/lead|signup|trial|mql/i, w[1]);
  const customers = find(/won|customer|paid/i, w[w.length - 1]);
  const revenue = demand.revenue_goal_usd;
  const v = visitors?.count ?? 0, l = leads?.count ?? 0, c = customers?.count ?? 0;
  const pctOf = (a: number, b: number) => (b ? `${((a / b) * 100).toFixed(a / b < 0.1 ? 1 : 0)}%` : "—");
  return [
    { key: "visitors", label: "Visitors", value: v, unit: "/yr", conv: pctOf(l, v) },
    { key: "leads", label: "Leads", value: l, unit: "/yr", conv: pctOf(c, l) },
    { key: "customers", label: "New customers", value: c, unit: "/yr", conv: c ? `$${Math.round(revenue / c).toLocaleString()}/customer` : undefined },
    { key: "revenue", label: "Revenue", value: revenue, unit: "/yr" },
  ];
}

export const PRIORITY_BASE: Record<Priority, number> = { critical: 90, high: 74, medium: 54, low: 34 };
export const PRIORITY_IMPACT: Record<Priority, 1 | 2 | 3> = { critical: 3, high: 3, medium: 2, low: 1 };
export function priorityScore(p: Priority, i = 0): number {
  return PRIORITY_BASE[p] + ((i * 7) % 9);
}

export type SpendBucket = "low" | "medium" | "high";
/** "$1,400 / user / year", "~$0.20 API", "$2k", "low", "high" -> dollars + bucket. */
export function parseCost(s: string | null | undefined): { usd: number; bucket: SpendBucket; known: boolean } {
  const text = (s ?? "").trim();
  const m = text.match(/\$\s?([\d,.]+)\s*([kKmM])?/);
  let usd: number | null = null;
  if (m) {
    usd = parseFloat(m[1].replace(/,/g, ""));
    if (/k/i.test(m[2] ?? "")) usd *= 1e3;
    if (/m/i.test(m[2] ?? "")) usd *= 1e6;
    if (/\/\s*(mo|month)/i.test(text)) usd *= 3; // a 90-day window
    if (/\/\s*(yr|year)/i.test(text)) usd /= 4;
  } else if (/high/i.test(text)) usd = 8000;
  else if (/med/i.test(text)) usd = 2500;
  else if (/low|free|none|\bapi\b/i.test(text)) usd = 300;
  const known = usd !== null;
  const value = usd ?? 1000;
  return { usd: value, bucket: value < 500 ? "low" : value < 3000 ? "medium" : "high", known };
}

export const initials = (name: string) =>
  name.split(/[\s_-]+/).filter(Boolean).slice(0, 2).map((w) => w[0]!.toUpperCase()).join("") || "GP";

/** Place a task on the 13-week grid: done tasks span created->updated, open ones sit at "now". */
export function taskWeeks(task: Task, company: Company): { start: number; end: number } {
  const w0 = startDate(company).getTime();
  const wk = (iso: string) => Math.max(1, Math.min(13, Math.floor((new Date(iso).getTime() - w0) / (DAY * 7)) + 1));
  const now = Math.max(1, Math.min(13, Math.floor(weeksElapsed(company)) + 1));
  if (task.status === "done" || task.status === "failed" || task.status === "rejected") return { start: wk(task.created_at), end: Math.max(wk(task.created_at), wk(task.updated_at)) };
  return { start: now, end: Math.min(13, now + 1) };
}

export function firstParagraph(md: string, max = 280): string {
  const lines = md.split("\n").map((l) => l.trim());
  const para: string[] = [];
  for (const l of lines) {
    if (!l) { if (para.length) break; continue; }
    if (/^(#|\||[-*] |\d+\. |_)/.test(l)) { if (para.length) break; continue; }
    // a bold-only line is a heading in disguise; a short line is a label, not prose
    if (!para.length && (/^\*\*.*\*\*:?$/.test(l) || l.length < 40)) continue;
    para.push(l);
  }
  const text = para.join(" ").replace(/\*\*/g, "");
  return text.length > max ? text.slice(0, max).replace(/\s+\S*$/, "") + "…" : text;
}
