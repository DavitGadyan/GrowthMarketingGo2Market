"use client";

import { useEffect, useMemo, useState } from "react";
import { Sparkles, X } from "lucide-react";
import type { Company, DemandMath } from "@/lib/types";
import { api, ApiError } from "@/lib/api";
import { compact, money } from "@/lib/format";
import { collapseFunnel, goalDate, monthYear, monthlyGoal, startingPoint, type FunnelStageViz } from "@/lib/projection";
import { Button } from "@/components/ui/Button";
import { FunnelViz } from "./FunnelViz";
import "./growth.css";

type Row = { key: string; label: string; start: string; target: string; unit: string; editable: boolean };
type Targets = Record<"visitors" | "v2l" | "customers" | "rpc" | "revenue", string>;

const num = (s: string) => { const n = parseFloat(String(s).replace(/[^0-9.]/g, "")); return Number.isFinite(n) ? n : 0; };
/** display form of a target: thousands separators, `$` on money rows, 2 decimals on the rate */
function fmtTarget(key: string, raw: string): string {
  if (raw.trim() === "") return "";
  const n = num(raw);
  if (key === "v2l") return n.toFixed(2);
  const s = Math.round(n).toLocaleString();
  return key === "rpc" || key === "revenue" ? `$${s}` : s;
}
const pctOf = (a: number, b: number) => (b ? `${((a / b) * 100).toFixed(a / b < 0.1 ? 1 : 0)}%` : "—");

/** The funnel implied by the editable targets: leads = visitors × rate, revenue = customers × revenue-per-customer. */
function stagesFrom(t: Targets): FunnelStageViz[] {
  const v = num(t.visitors), r = num(t.v2l) / 100, c = num(t.customers), rpc = num(t.rpc);
  const l = v * r, rev = c * rpc;
  return [
    { key: "visitors", label: "Visitors", value: v, unit: "/yr", conv: pctOf(l, v) },
    { key: "leads", label: "Leads", value: l, unit: "/yr", conv: pctOf(c, l) },
    { key: "customers", label: "New customers", value: c, unit: "/yr", conv: c ? `$${Math.round(rpc).toLocaleString()}/customer` : undefined },
    { key: "revenue", label: "Revenue", value: rev, unit: "/yr" },
  ];
}

/** "How we plan to achieve $X/mo by <month>": live funnel + editable strategy table + scenario comparison. */
export function StrategyModal({ company, demand, onClose, onSaved }: { company: Company; demand: DemandMath; onClose: () => void; onSaved?: (c: Company) => void }) {
  const baseline = useMemo(() => collapseFunnel(demand), [demand]);
  const km = company.profile.known_metrics;
  const sp = startingPoint(company, demand);
  const visitors = baseline[0].value, leads = baseline[1].value, customers = baseline[2].value;
  const initial: Targets = useMemo(() => ({
    visitors: String(Math.round(visitors)),
    v2l: visitors ? ((leads / visitors) * 100).toFixed(2) : "",
    customers: String(Math.round(customers)),
    rpc: String(Math.round(demand.average_sale_value_usd || 0)),
    revenue: String(Math.round(demand.revenue_goal_usd)),
  }), [visitors, leads, customers, demand.average_sale_value_usd, demand.revenue_goal_usd]);
  const [targets, setTargets] = useState<Targets>(initial);
  const [live, setLive] = useState<FunnelStageViz[]>(baseline);
  const [compare, setCompare] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [focused, setFocused] = useState<string | null>(null);

  // the funnel follows the inputs, debounced 120 ms; the revenue row is derived
  useEffect(() => {
    const id = setTimeout(() => {
      const s = stagesFrom(targets);
      setLive(s);
      const rev = String(Math.round(s[3].value));
      if (rev !== targets.revenue) setTargets((t) => ({ ...t, revenue: rev }));
    }, 120);
    return () => clearTimeout(id);
  }, [targets]);
  const dirty = (["visitors", "v2l", "customers", "rpc"] as const).some((k) => targets[k] !== initial[k]);

  const [closing, setClosing] = useState(false);
  const requestClose = () => {
    if (closing) return;
    setClosing(true);
    setTimeout(onClose, 180);
  };
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && requestClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [onClose, closing]);

  const v2lStart = km.visitor_to_lead != null ? km.visitor_to_lead * 100 : visitors ? (leads / visitors) * 100 : null;
  const rpcStart = km.average_sale_value ?? demand.average_sale_value_usd ?? null;
  const rows: Row[] = [
    { key: "visitors", label: "Visitors", start: `${compact(sp.visitors)}/mo`, target: targets.visitors, unit: "/yr", editable: true },
    { key: "v2l", label: "Visit-to-lead conv. rate", start: v2lStart != null ? `${v2lStart.toFixed(2)}%` : "—", target: targets.v2l, unit: "%", editable: true },
    { key: "customers", label: "New customers", start: `${sp.customers < 1 ? "<1" : compact(sp.customers)}/mo`, target: targets.customers, unit: "/yr", editable: true },
    { key: "rpc", label: "Revenue per new customer", start: rpcStart != null ? `$${Math.round(rpcStart).toLocaleString()}/customer` : "—", target: targets.rpc, unit: "/customer", editable: true },
    { key: "revenue", label: "Revenue", start: `${money(sp.revenue)}/mo`, target: targets.revenue, unit: "/yr", editable: false },
  ];

  const save = async () => {
    setSaving(true); setErr(null);
    try {
      const v2l = parseFloat(targets.v2l), rpc = parseFloat(targets.rpc);
      const profile = { ...company.profile, known_metrics: { ...km, visitor_to_lead: Number.isFinite(v2l) ? v2l / 100 : km.visitor_to_lead, average_sale_value: Number.isFinite(rpc) ? rpc : km.average_sale_value } };
      const c = await api.companies.update(company.id, profile);
      setSaved(true); onSaved?.(c);
    } catch (e) {
      setErr(e instanceof ApiError ? e.message : String(e));
    } finally {
      setSaving(false);
    }
  };

  return (
    <div
      className="modal-backdrop fixed inset-0 z-50 overflow-y-auto bg-black/20 p-2 md:p-8"
      data-closing={closing || undefined}
      role="dialog" aria-modal="true" aria-labelledby="strategy-title"
      onClick={(e) => { if (e.target === e.currentTarget) requestClose(); }}
    >
      <div className="modal-panel scroll-thin relative ml-auto mt-2 w-full max-w-[1000px] overflow-y-auto rounded-[16px] bg-white shadow-[0_24px_64px_rgba(0,0,0,.18)] md:mt-[6vh]" data-closing={closing || undefined} style={{ maxHeight: "calc(100dvh - 16px)" }}>
        <div className="flex items-start justify-between gap-6 px-5 pt-6 md:px-8 md:pt-7">
          <h2 id="strategy-title" className="t-title text-[20px] leading-7 md:text-[24px] md:leading-8">
            How we plan to achieve {money(monthlyGoal(company, demand))}/mo revenue by {monthYear(goalDate(company))}
          </h2>
          <button type="button" aria-label="Close" className="icon-btn flex-none" onClick={requestClose}><X size={18} /></button>
        </div>
        <div className="px-5 pt-5 md:px-8 md:pt-6">
          <FunnelViz stages={live} ghost={baseline} showGhost={compare && dirty} />
          {compare && dirty && <div className="content-enter -mt-1 flex items-center gap-2 text-[12.5px] text-muted-strong"><span className="inline-block h-0 w-5 border-t border-dashed" style={{ borderColor: "#35B0E8" }} /> dashed = current plan · solid = edited targets</div>}
        </div>
        <div className="mx-5 mt-4 border-t border-black/[0.06] md:mx-8" />
        <div className="overflow-x-auto px-5 py-4 md:px-8">
          <table className="w-full min-w-[560px] text-[15px]">
            <thead>
              <tr className="text-left text-[13px] text-muted-strong-strong">
                <th className="py-2 font-normal">Strategy</th>
                <th className="whitespace-nowrap py-2 font-normal">Starting point ({monthYear(sp.month)})</th>
                <th className="hidden py-2 font-normal md:table-cell" />
                <th className="whitespace-nowrap py-2 font-normal">{monthYear(goalDate(company))}</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.key} className="h-[52px]">
                  <td className="whitespace-nowrap pr-4">{r.key === "revenue" && <span className="mr-2 inline-block h-2 w-2 rounded-full bg-accent align-middle" />}{r.label}</td>
                  <td className="whitespace-nowrap pr-4 text-muted">{r.start}</td>
                  <td className="hidden w-10 text-muted md:table-cell">→</td>
                  <td>
                    <span className={`flex items-baseline gap-2 border-b pb-1 transition-colors duration-150 ${r.editable && targets[r.key as keyof Targets] !== initial[r.key as keyof Targets] ? "border-accent" : "border-black/[0.12]"}`}>
                      <input
                        className="w-28 min-w-0 bg-transparent text-[15px] outline-none disabled:text-ink md:w-32"
                        inputMode="decimal"
                        value={focused === r.key ? r.target : fmtTarget(r.key, r.target)}
                        disabled={!r.editable}
                        onFocus={() => setFocused(r.key)}
                        onBlur={() => setFocused(null)}
                        onChange={(e) => setTargets((t) => ({ ...t, [r.key]: e.target.value.replace(/[^0-9.]/g, "") }))}
                        aria-label={`${r.label} target`}
                      />
                      <span className="ml-auto whitespace-nowrap text-muted">{r.unit}</span>
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="flex flex-wrap items-center gap-3 border-t border-black/[0.06] px-5 py-4 md:px-8 md:py-5">
          {dirty
            ? <Button variant="ghost" className="bg-tint-accent" onClick={() => setCompare((c) => !c)} aria-pressed={compare}><Sparkles size={16} /> {compare ? "Hide comparison" : "Compare scenarios"}</Button>
            : <Button variant="ghost" className="bg-tint-accent" href="/chat?ask=Compare growth scenarios for the current plan"><Sparkles size={16} /> Compare scenarios</Button>}
          <span className="ml-auto text-[13px]">{saved ? <span className="toast-in inline-block rounded-full bg-tint-accent px-3 py-1 font-medium text-accent">Strategy saved</span> : err ? <span className="toast-in inline-block text-[#C2362B]">{err}</span> : dirty ? <span className="content-enter text-muted-strong">Unsaved changes</span> : null}</span>
          <Button variant="link" onClick={requestClose}>Cancel</Button>
          <Button onClick={save} disabled={saving}>{saving ? "Saving…" : "Save strategy"}</Button>
        </div>
      </div>
    </div>
  );
}
