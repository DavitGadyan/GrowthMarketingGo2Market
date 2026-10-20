"use client";

import { useCallback, useEffect, useMemo, useRef, useState, type FormEvent, type KeyboardEvent, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { AtSign, Check, ChevronDown, Copy, Download, ExternalLink, Info, Mail, Search, Sparkles, Trash2, X } from "lucide-react";
import { TopBar } from "@/components/shell/TopBar";
import { Button, IconButton } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { Field, Input, Select, Textarea } from "@/components/ui/Controls";
import { StepperModal } from "@/components/ui/StepperModal";
import { EmptyState, ErrorState, InlineError, Skeleton } from "@/components/ui/States";
import { Pill } from "@/components/viz/Avatar";
import { ReachChart } from "@/components/influencers/ReachChart";
import { AqsArc, AudienceMicroBar, CreatorAvatar, ErBar, PLATFORM_LABEL, ScoreArc, VerdictChip, fmtCount, fmtEr, thresholdFor } from "@/components/influencers/parts";
import { AuditMetricsHelp, AuditPanel } from "@/components/influencers/AuditPanel";
import { api, ApiError } from "@/lib/api";
import { relTime, timeHMS } from "@/lib/format";
import { useCompany, useDeliverables, useInfluencers, useRunStream, useRuns } from "@/lib/hooks";
import { usePresence } from "@/lib/usePresence";
import type { InfluencerCandidate, InfluencerResearchIn, InfluencerThreshold, Platform } from "@/lib/types";
import "@/components/influencers/influencers.css";

type Tab = "all" | Platform;
const TABS: { value: Tab; label: string }[] = [{ value: "all", label: "All" }, { value: "instagram", label: "Instagram" }, { value: "x", label: "X" }];
const BRIEF_KEY = "gp.influencers.brief";
const EXAMPLES = [
  { followers: 35_000, likes: 25, verdict: "likely fake" as const },
  { followers: 30_000, likes: 750, verdict: "real" as const },
];

type Brief = { summary: string; niche: string; platforms: Platform[]; max: number };

function useMedia(query: string) {
  const [m, setM] = useState(false);
  useEffect(() => {
    const mq = window.matchMedia(query);
    const on = () => setM(mq.matches);
    on(); mq.addEventListener("change", on);
    return () => mq.removeEventListener("change", on);
  }, [query]);
  return m;
}

/** Overlays must escape the route wrapper, whose transform would turn `fixed` into `absolute`. */
function BodyPortal({ children }: { children: ReactNode }) {
  const [el, setEl] = useState<HTMLElement | null>(null);
  useEffect(() => setEl(document.body), []);
  return el ? createPortal(children, el) : null;
}

function loadBrief(): Partial<Brief> | null {
  try { const raw = localStorage.getItem(BRIEF_KEY); return raw ? (JSON.parse(raw) as Partial<Brief>) : null; } catch { return null; }
}

/* ---------- brief form (empty state + modal) ---------- */
function BriefForm({ brief, onChange, onSubmit, busy, error, compact = false }: { brief: Brief; onChange: (b: Brief) => void; onSubmit: () => void; busy: boolean; error: ApiError | null; compact?: boolean }) {
  const togglePlatform = (p: Platform) => onChange({ ...brief, platforms: brief.platforms.includes(p) ? brief.platforms.filter((x) => x !== p) : [...brief.platforms, p] });
  return (
    <form onSubmit={(e: FormEvent) => { e.preventDefault(); onSubmit(); }} className="grid gap-4">
      <Field label="Your product or service" hint="What you sell, to whom, and the outcome. The agent matches creators to this.">
        <Textarea rows={compact ? 3 : 5} value={brief.summary} onChange={(e) => onChange({ ...brief, summary: e.target.value })} placeholder="e.g. Loopwise turns sales calls into CRM-ready notes for 5-50 rep B2B teams." required />
      </Field>
      <div className="grid gap-4 md:grid-cols-2">
        <Field label="Niche / topics">
          <Input value={brief.niche} onChange={(e) => onChange({ ...brief, niche: e.target.value })} placeholder="B2B sales, RevOps, founder-led sales" required />
        </Field>
        <Field label="How many creators">
          <Select value={brief.max} onChange={(e) => onChange({ ...brief, max: Number(e.target.value) })}>
            <option value={10}>10</option><option value={15}>15</option><option value={20}>20</option>
          </Select>
        </Field>
      </div>
      <div>
        <span className="mb-1.5 block text-[13px] font-medium text-ink/85">Platforms</span>
        <div className="flex gap-3">
          {(["instagram", "x"] as Platform[]).map((p) => (
            <label key={p} className={`flex cursor-pointer items-center gap-2 rounded-full border px-4 py-2 text-[14px] ${brief.platforms.includes(p) ? "border-accent bg-tint-accent text-accent" : "border-black/[0.12] hover:bg-ground"}`}>
              <input type="checkbox" className="sr-only" checked={brief.platforms.includes(p)} onChange={() => togglePlatform(p)} />
              {brief.platforms.includes(p) && <Check size={14} />} {PLATFORM_LABEL[p]}
            </label>
          ))}
        </div>
      </div>
      {error && <InlineError error={error} />}
      <div className="flex items-center gap-3">
        <Button type="submit" disabled={busy || !brief.summary.trim() || !brief.niche.trim() || brief.platforms.length === 0}><Search size={16} /> {busy ? "Starting…" : "Find influencers"}</Button>
        <span className="text-[12.5px] text-muted-strong">Research runs through the Research Agent; nothing is sent to anyone.</span>
      </div>
    </form>
  );
}

/* ---------- rule card ---------- */
function RuleCard({ thresholds, redFlags, summary, sources, tab }: { thresholds: InfluencerThreshold[]; redFlags: string[]; summary: string; sources: { title: string; url: string }[]; tab: Tab }) {
  const platforms: Platform[] = tab === "all" ? ["instagram", "x"] : [tab];
  return (
    <div className="grid gap-4">
      <p className="text-[14px] leading-[22px] text-muted-strong">{summary}</p>
      {platforms.map((p) => {
        const rows = thresholds.filter((t) => t.platform === p);
        if (!rows.length) return null;
        return (
          <div key={p}>
            <div className="t-caps mb-1.5 text-muted-strong">{PLATFORM_LABEL[p]}</div>
            <table className="w-full text-[12.5px]">
              <thead><tr className="text-left text-muted-strong"><th className="py-1 font-normal">Tier</th><th className="py-1 font-normal">Followers</th><th className="py-1 text-right font-normal">Good ER</th><th className="py-1 text-right font-normal">Poor ER</th></tr></thead>
              <tbody>
                {rows.map((t, i) => (
                  <tr key={`${t.tier}-${i}`} className="rule-t">
                    <td className="py-1.5 capitalize">{t.tier}</td>
                    <td className="py-1.5 tnum text-muted-strong">{fmtCount(t.followers_min)}{t.followers_max ? `–${fmtCount(t.followers_max)}` : "+"}</td>
                    <td className="py-1.5 tnum text-right text-[#1F8B4C]">≥ {fmtEr(t.good_er)}</td>
                    <td className="py-1.5 tnum text-right text-[#C2362B]">&lt; {fmtEr(t.ok_er)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        );
      })}
      <div>
        <div className="t-caps mb-1.5 text-muted-strong">Your examples</div>
        <ul className="grid gap-1.5 text-[13px]">
          {EXAMPLES.map((e) => {
            const er = e.likes / e.followers;
            return (
              <li key={e.followers} className="flex items-center gap-2">
                <span className="h-2 w-2 flex-none rounded-full" style={{ background: e.verdict === "real" ? "#3DBF6B" : "#F0665C" }} />
                <span className="tnum">{fmtCount(e.followers)} followers · {e.likes} likes → {fmtEr(er)} → <b className="font-medium">{e.verdict}</b></span>
              </li>
            );
          })}
        </ul>
      </div>
      {redFlags.length > 0 && (
        <div>
          <div className="t-caps mb-1.5 text-muted-strong">Red flags</div>
          <ul className="grid gap-1 text-[13px] text-muted-strong">{redFlags.map((f, i) => <li key={`${i}-${f}`} className="flex gap-2"><span className="text-danger">•</span><span>{f}</span></li>)}</ul>
        </div>
      )}
      {sources.length > 0 && (
        <div>
          <div className="t-caps mb-1.5 text-muted-strong">Sources</div>
          <ul className="grid gap-1 text-[12.5px]">{sources.slice(0, 5).map((s, i) => <li key={`${i}-${s.url}`}><a href={s.url} target="_blank" rel="noreferrer" className="text-accent hover:underline">{s.title}</a></li>)}</ul>
        </div>
      )}
    </div>
  );
}

/* ---------- progress header while the agent works ---------- */
function Progress({ startedAt, logs }: { startedAt: number; logs: { ts: string; message: string }[] }) {
  const [now, setNow] = useState(Date.now());
  useEffect(() => { const id = setInterval(() => setNow(Date.now()), 1000); return () => clearInterval(id); }, []);
  const text = logs.map((l) => l.message.toLowerCase()).join(" ");
  const step = /message|outreach|dm/.test(text) ? 2 : /candidate|profile|creator|found|handle/.test(text) ? 1 : 0;
  const secs = Math.max(0, Math.round((now - startedAt) / 1000));
  const steps = ["Benchmarks", "Candidates", "Messages"];
  return (
    <div className="rule-b bg-surface px-6 py-4 md:px-8">
      <div className="flex flex-wrap items-center gap-x-6 gap-y-2">
        {steps.map((s, i) => <span key={s} className="inf-step" data-state={i < step ? "done" : i === step ? "active" : "todo"}><i />{s}</span>)}
        <span className="ml-auto tnum text-[13px] text-muted-strong">{Math.floor(secs / 60)}:{String(secs % 60).padStart(2, "0")} elapsed</span>
      </div>
      {logs.length > 0 && (
        <ul className="mt-3 grid gap-1">
          {logs.slice(-4).map((l, i) => <li key={`${l.ts}-${i}`} className="log-row flex gap-3 text-[13px]"><span className="font-mono text-muted-strong">{timeHMS(l.ts)}</span><span className="truncate">{l.message}</span></li>)}
        </ul>
      )}
    </div>
  );
}

/* ---------- selected creator panel ---------- */
function CreatorPanel({ c, threshold, onClose, onDraft, drafting }: { c: InfluencerCandidate; threshold?: InfluencerThreshold; onClose?: () => void; onDraft: (handles: string[]) => void; drafting: boolean }) {
  const [copied, setCopied] = useState(false);
  const copy = () => { navigator.clipboard?.writeText(c.outreach_message); setCopied(true); setTimeout(() => setCopied(false), 1600); };
  const metric = (label: string, value: string, hint?: string) => (
    <div className="rounded-[10px] bg-ground px-3 py-2"><div className="t-meta text-muted-strong">{label}</div><div className="tnum text-[15px] font-medium" title={hint}>{value}</div></div>
  );
  return (
    <div className="content-enter flex h-full flex-col">
      <div className="rule-b flex items-start gap-3 px-5 py-4">
        <CreatorAvatar c={c} size={40} />
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2"><span className="truncate text-[16px] font-medium">{c.handle}</span><VerdictChip verdict={c.verdict} /></div>
          <div className="truncate text-[13px] text-muted-strong">{c.name} · {PLATFORM_LABEL[c.platform]} · #{c.rank}</div>
        </div>
        {onClose && <IconButton label="Close" onClick={onClose}><X size={16} /></IconButton>}
      </div>
      <div className="scroll-thin flex-1 overflow-y-auto px-5 py-4">
        <div className="stagger grid gap-5">
          <div>
            <div className="mb-2 flex items-center justify-between"><span className="t-caps text-muted-strong">Metrics</span><a href={c.url} target="_blank" rel="noreferrer" className="btn-link text-[13px]">Open profile <ExternalLink size={13} /></a></div>
            <div className="grid grid-cols-2 gap-2">
              {metric("Followers", fmtCount(c.followers))}
              {metric("Following", fmtCount(c.following))}
              {metric("Follower / following", `${c.follower_following_ratio.toFixed(1)}×`)}
              {metric("Posts sampled", String(c.posts_sampled))}
              {metric("Avg likes", fmtCount(c.avg_likes))}
              {metric("Avg comments", fmtCount(c.avg_comments))}
              {metric("Engagement rate", fmtEr(c.engagement_rate), threshold ? `judged against ${threshold.tier}: good ≥ ${fmtEr(threshold.good_er)}` : undefined)}
              {metric("Comments / likes", `${(c.comment_like_ratio * 100).toFixed(1)}%`)}
            </div>
            {threshold && <p className="mt-2 text-[12.5px] text-muted-strong">Judged against the {threshold.tier} tier ({fmtCount(threshold.followers_min)}{threshold.followers_max ? `–${fmtCount(threshold.followers_max)}` : "+"}): good ≥ {fmtEr(threshold.good_er)}, poor &lt; {fmtEr(threshold.ok_er)}.</p>}
            <div className="mt-2 flex items-center gap-2"><Pill tone={c.data_quality === "measured" ? "accent" : "muted"}>{c.data_quality === "measured" ? "measured" : "estimated from public snippets"}</Pill></div>
          </div>
          <AuditPanel audit={c.audit ?? null} candidate={c} />
          <div>
            <div className="t-caps mb-2 text-muted-strong">Why this verdict</div>
            <ul className="grid gap-1.5 text-[13.5px]">{c.reasons.map((r, i) => <li key={`${i}-${r}`} className="flex gap-2"><span className="mt-[7px] h-1.5 w-1.5 flex-none rounded-full" style={{ background: c.verdict === "real" ? "#3DBF6B" : c.verdict === "suspicious" ? "#F5A524" : "#F0665C" }} /><span>{r}</span></li>)}</ul>
          </div>
          <div>
            <div className="mb-2 flex items-center justify-between"><span className="t-caps text-muted-strong">Audience fit</span><span className="tnum text-[13px] font-medium">{Math.round(c.audience_fit)}%</span></div>
            <div className="inf-fit"><i style={{ width: `${c.audience_fit}%` }} /></div>
            <p className="mt-2 text-[13.5px] text-muted-strong">{c.why_fit}</p>
            {c.niche_tags.length > 0 && <div className="mt-2 flex flex-wrap gap-1.5">{c.niche_tags.map((t, i) => <Pill key={`${i}-${t}`}>{t}</Pill>)}</div>}
          </div>
          <div>
            <div className="t-caps mb-2 text-muted-strong">Message</div>
            {c.recent_post_hook && <p className="mb-2 text-[12.5px] text-muted-strong">Hook: {c.recent_post_hook}</p>}
            <div className="inf-bubble">{c.outreach_message}</div>
            <div className="mt-2 text-[12.5px] text-muted-strong">Email subject: <span className="text-ink">{c.outreach_subject}</span></div>
            <div className="mt-3 flex flex-wrap gap-2">
              <Button variant="secondary" size="sm" onClick={copy}>{copied ? <Check size={14} /> : <Copy size={14} />} {copied ? "Copied" : "Copy"}</Button>
              <Button size="sm" onClick={() => onDraft([c.handle])} disabled={drafting}><Mail size={14} /> Draft in Gmail</Button>
            </div>
          </div>
          {c.sources.length > 0 && (
            <div>
              <div className="t-caps mb-1.5 text-muted-strong">Sources</div>
              <ul className="grid gap-1 text-[12.5px]">{c.sources.slice(0, 4).map((s, i) => <li key={`${i}-${s.url}`}><a href={s.url} target="_blank" rel="noreferrer" className="text-accent hover:underline">{s.title}</a></li>)}</ul>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

/* ---------- page ---------- */
export default function InfluencersPage() {
  const { company, loading: cLoading, error: cError } = useCompany();
  const inf = useInfluencers(company?.id);
  const runs = useRuns(company?.id, !!company);
  const latestRunId = runs.data?.[0]?.id;
  const stream = useRunStream(inf.running ? latestRunId : undefined);
  const deliverables = useDeliverables(company?.id, !!company);
  const isDesktop = useMedia("(min-width: 1024px)");

  const [tab, setTab] = useState<Tab>("all");
  const [selected, setSelected] = useState<string | null>(null);
  const [sel, setSel] = useState<Set<string>>(new Set());
  const [modal, setModal] = useState(false);
  const [ruleOpen, setRuleOpen] = useState(false);
  const [ruleTab, setRuleTab] = useState<"rule" | "audit">("rule");
  const [briefOpen, setBriefOpen] = useState(true);
  const [starting, setStarting] = useState(false);
  const [startError, setStartError] = useState<ApiError | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const [drafting, setDrafting] = useState(false);
  const [startedAt, setStartedAt] = useState<number>(() => Date.now());
  const listRef = useRef<HTMLDivElement>(null);

  const profile = company?.profile;
  const [brief, setBrief] = useState<Brief>({ summary: "", niche: "", platforms: ["instagram", "x"], max: 10 });
  useEffect(() => {
    if (!profile) return;
    const saved = loadBrief();
    setBrief((b) => ({
      summary: saved?.summary ?? b.summary ?? "",
      niche: saved?.niche ?? b.niche ?? "",
      platforms: saved?.platforms?.length ? saved.platforms : b.platforms,
      max: saved?.max ?? b.max,
    }));
    setBrief((b) => ({
      ...b,
      summary: b.summary || [profile.description, profile.product_description].filter(Boolean).join(" "),
      niche: b.niche || profile.industry || "",
    }));
  }, [profile]);
  const updateBrief = (b: Brief) => { setBrief(b); try { localStorage.setItem(BRIEF_KEY, JSON.stringify(b)); } catch { /* ignore */ } };

  useEffect(() => { if (inf.running) setStartedAt((t) => t || Date.now()); }, [inf.running]);

  const result = inf.data?.result ?? null;
  const thresholds = result?.rule.thresholds ?? [];
  const all = useMemo(() => [...(result?.candidates ?? [])].sort((a, b) => a.rank - b.rank), [result]);
  const visible = useMemo(() => all.filter((c) => tab === "all" || c.platform === tab), [all, tab]);
  const current = useMemo(() => all.find((c) => c.handle === selected) ?? null, [all, selected]);
  useEffect(() => { if (selected && !visible.some((c) => c.handle === selected)) setSelected(null); }, [visible, selected]);

  const start = async () => {
    if (!company) return;
    setStarting(true); setStartError(null);
    try {
      const body: InfluencerResearchIn = { company_id: company.id, platforms: brief.platforms, niche: brief.niche, max_candidates: brief.max, product_summary: brief.summary };
      await inf.start(body);
      setStartedAt(Date.now()); setModal(false); setSelected(null); setSel(new Set());
    } catch (e) {
      setStartError(e instanceof ApiError ? e : new ApiError(0, String(e)));
    } finally { setStarting(false); }
  };

  const showToast = useCallback((t: string) => { setToast(t); setTimeout(() => setToast(null), 3200); }, []);
  const draft = async (handles: string[]) => {
    if (!inf.data) return;
    setDrafting(true);
    try { await api.influencers.outreach(inf.data.task_id, handles); showToast("Outreach task proposed — approve it in Results"); }
    catch (e) { showToast(e instanceof ApiError ? e.message : "Could not create the outreach task"); }
    finally { setDrafting(false); }
  };
  const copyMessages = () => {
    const txt = all.filter((c) => sel.has(c.handle)).map((c) => `${c.handle} (${PLATFORM_LABEL[c.platform]})\n${c.outreach_message}`).join("\n\n");
    navigator.clipboard?.writeText(txt); showToast(`Copied ${sel.size} message${sel.size === 1 ? "" : "s"}`);
  };
  const exportList = () => {
    const d = deliverables.data?.find((x) => x.kind === "influencer_list");
    if (d) { window.open(api.deliverables.exportUrl(d.id, "md"), "_blank"); return; }
    const md = ["# Influencer shortlist", "", `Niche: ${result?.niche ?? ""}`, "", "| # | Handle | Platform | Followers | ER | Score | Verdict |", "|---|---|---|---|---|---|---|",
      ...all.map((c) => `| ${c.rank} | ${c.handle} | ${PLATFORM_LABEL[c.platform]} | ${c.followers} | ${fmtEr(c.engagement_rate)} | ${Math.round(c.authenticity_score)} | ${c.verdict} |`),
      "", ...all.map((c) => `## ${c.handle}\n\n${c.outreach_message}\n`)].join("\n");
    navigator.clipboard?.writeText(md); showToast("Markdown copied to the clipboard");
  };

  const toggle = (h: string) => setSel((s) => { const n = new Set(s); if (n.has(h)) n.delete(h); else n.add(h); return n; });
  const onKey = (e: KeyboardEvent<HTMLDivElement>) => {
    if (e.key !== "ArrowDown" && e.key !== "ArrowUp") return;
    e.preventDefault();
    const i = visible.findIndex((c) => c.handle === selected);
    const next = visible[Math.max(0, Math.min(visible.length - 1, i + (e.key === "ArrowDown" ? 1 : -1)))];
    if (next) { setSelected(next.handle); listRef.current?.querySelector<HTMLElement>(`[data-handle="${CSS.escape(next.handle)}"]`)?.focus(); }
  };
  const bulk = usePresence(sel.size > 0, 200);
  const drawer = usePresence(!isDesktop && !!current, 320);
  const researchLogs = useMemo(() => stream.events.filter((e) => /research|influencer|creator|benchmark/i.test(`${e.agent} ${e.message}`)).map((e) => ({ ts: e.ts, message: e.message })), [stream.events]);

  const actions = (
    <>
      <button type="button" onClick={() => setRuleOpen((v) => !v)} className="hidden items-center gap-1 text-[14px] text-accent hover:underline md:inline-flex"><Info size={14} /> How we score</button>
      {result && <Button variant="secondary" size="sm" onClick={exportList} className="hidden md:inline-flex"><Download size={14} /> Export</Button>}
      <Button onClick={() => { setStartError(null); setModal(true); }} disabled={inf.running}><Search size={16} /> {inf.running ? "Researching…" : "Find influencers"}</Button>
    </>
  );
  const subtitle = company ? `Instagram and X creators for ${company.name}` : "Instagram and X creators";

  return (
    <div className="flex min-h-full flex-col">
      <TopBar title="Influencers" subtitle={subtitle} tabs={result ? TABS.map((t) => ({ label: t.label, href: `#${t.value}`, active: tab === t.value })) : []} actions={actions} />
      {result && <TabSync tab={tab} onTab={setTab} />}

      {cError && <div className="p-6"><ErrorState error={cError} /></div>}
      {(cLoading || (inf.loading && !inf.data)) && !cError && <div className="grid gap-6 p-8 lg:grid-cols-[320px_1fr]"><Skeleton className="h-72" /><Skeleton className="h-96" /></div>}
      {!cLoading && !cError && !company && <div className="p-8"><EmptyState icon={<AtSign size={20} />} title="No workspace yet" body="Describe your product first; the Research Agent then finds Instagram and X creators and scores how real their audiences are." action={<Button href="/setup">Set up your company</Button>} /></div>}

      {company && inf.error && <div className="p-6"><ErrorState error={inf.error} retry={inf.reload} /></div>}

      {company && !inf.loading && !inf.error && (inf.notRun || (!inf.data?.result && !inf.running && inf.data?.status !== "failed")) && (
        <div className="mx-auto w-full max-w-[760px] p-6 md:p-10">
          <Card className="content-enter p-6 md:p-8">
            <div className="mb-5 flex items-start gap-4">
              <div className="grid h-12 w-12 flex-none place-items-center rounded-full bg-tint-accent text-accent"><AtSign size={20} /></div>
              <div><h2 className="t-section">Find creators for your product</h2><p className="mt-1 text-[14px] text-muted-strong">Describe your product, pick platforms, find creators. The agent benchmarks engagement thresholds, scores every account real vs. fake from its follower-to-interaction ratio, ranks them and writes a personal first message for each.</p></div>
            </div>
            <BriefForm brief={brief} onChange={updateBrief} onSubmit={start} busy={starting} error={startError} />
          </Card>
        </div>
      )}

      {company && inf.data?.status === "failed" && !inf.running && (
        <div className="p-6"><ErrorState error={new ApiError(0, inf.data.error || "The research task failed.")} retry={() => setModal(true)} /></div>
      )}

      {company && inf.running && <Progress startedAt={startedAt} logs={researchLogs} />}

      {company && (result || inf.running) && (
        <div className="grid flex-1 grid-cols-[minmax(0,1fr)] bg-surface lg:grid-cols-[320px_minmax(0,1fr)]">
          {/* left pane */}
          <aside className="min-w-0 rule-b lg:rule-r lg:rule-b-0">
            <button type="button" onClick={() => setBriefOpen((v) => !v)} className="flex w-full items-center justify-between px-6 py-4 text-left lg:cursor-default" aria-expanded={briefOpen}>
              <span className="t-section">Brief & rule</span><ChevronDown size={16} className={`text-muted-strong transition-transform lg:hidden ${briefOpen ? "" : "-rotate-90"}`} />
            </button>
            <div className={`${briefOpen ? "block" : "hidden"} lg:block`}>
              <div className="px-6 pb-5">
                <div className="t-caps mb-2 text-muted-strong">Product brief</div>
                <Textarea rows={5} value={brief.summary} onChange={(e) => updateBrief({ ...brief, summary: e.target.value })} className="!text-[13.5px]" aria-label="Product brief" />
                <div className="mt-2 flex items-start justify-between text-[12.5px] text-muted-strong"><span className="min-w-0">Niche: {result?.niche ?? brief.niche}</span><span className="ml-3 flex-none whitespace-nowrap">{(result?.platforms ?? brief.platforms).map((p) => PLATFORM_LABEL[p]).join(" · ")}</span></div>
                {inf.data?.generated_at && <div className="mt-1 text-[12.5px] text-muted-strong">Researched {relTime(inf.data.generated_at)}</div>}
              </div>
              <div className="rule-t px-6 py-5" id="rule">
                <div className="mb-3 flex items-center justify-between"><span className="t-caps text-muted-strong">Rule</span><Pill tone="muted">{thresholds.length} tiers</Pill></div>
                {result ? <RuleCard thresholds={thresholds} redFlags={result.rule.red_flags} summary={result.rule.summary} sources={result.rule.sources} tab={tab} /> : <div className="grid gap-2"><Skeleton className="h-4 w-5/6" /><Skeleton className="h-24" /><Skeleton className="h-4 w-2/3" /></div>}
              </div>
            </div>
          </aside>

          {/* main */}
          <div className="grid min-w-0 lg:grid-cols-[minmax(0,1fr)_400px]">
            <div className={`min-w-0 ${isDesktop ? "inf-compact" : ""}`}>
              <div className="rule-b px-6 pt-4">
                <div className="mb-1 flex flex-wrap items-center justify-between gap-2">
                  <span className="t-section">Reach vs engagement</span>
                  <span className="flex items-center gap-3 text-[12.5px] text-muted-strong"><span className="flex items-center gap-1"><i className="h-2.5 w-2.5 rounded-full" style={{ background: "#3DBF6B" }} />Real</span><span className="flex items-center gap-1"><i className="h-2.5 w-2.5 rounded-full" style={{ background: "#F5A524" }} />Suspicious</span><span className="flex items-center gap-1"><i className="h-2.5 w-2.5 rounded-full" style={{ background: "#F0665C" }} />Likely fake</span><span className="hidden sm:inline">· size = audience fit · bands = good / ok / poor ER</span></span>
                </div>
                <div className="scroll-thin overflow-x-auto">
                  {result ? <ReachChart candidates={visible} thresholds={thresholds} platform={tab} selected={selected} onPick={(h) => setSelected((s) => (s === h ? null : h))} /> : <Skeleton className="h-[320px] min-w-[640px]" />}
                </div>
              </div>
              <div className="inf-head rule-b">
                <span className="flex items-center"><input type="checkbox" aria-label="Select all creators" checked={visible.length > 0 && visible.every((c) => sel.has(c.handle))} ref={(el) => { if (el) el.indeterminate = sel.size > 0 && !visible.every((c) => sel.has(c.handle)); }} onChange={(e) => setSel(e.target.checked ? new Set(visible.map((c) => c.handle)) : new Set())} className="h-4 w-4 accent-[#10B981]" /></span><span /><span>Creator</span><span className="text-right">Followers</span><span className="inf-hide-sm inf-hide-md inf-hide-rail">Avg interactions</span><span className="inf-hide-sm">Engagement</span><span className="inf-hide-sm inf-hide-md">AQS</span><span className="inf-hide-sm inf-hide-md inf-hide-rail">Verdict</span><span className="inf-hide-sm inf-hide-md inf-hide-rail text-right">Fit</span>
              </div>
              <div ref={listRef} className="stagger" role="listbox" aria-label="Ranked creators" onKeyDown={onKey}>
                {!result && Array.from({ length: 6 }).map((_, i) => <div key={i} className="px-6 py-3"><Skeleton className="h-9" /></div>)}
                {result && visible.length === 0 && <div className="p-8 text-center text-[14px] text-muted-strong">No {tab === "all" ? "" : PLATFORM_LABEL[tab] + " "}creators in this result.</div>}
                {visible.map((c, idx) => {
                  const th = thresholdFor(c, thresholds);
                  const isSel = selected === c.handle;
                  return (
                    <div key={`${idx}-${c.handle}`} role="option" aria-selected={isSel} data-handle={c.handle} tabIndex={0} className="inf-row rule-t focus-visible:outline-2" onClick={() => setSelected(isSel ? null : c.handle)} onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); setSelected(isSel ? null : c.handle); } }}>
                      <span className="flex items-center gap-2"><input type="checkbox" aria-label={`Select ${c.handle}`} checked={sel.has(c.handle)} onChange={() => toggle(c.handle)} onClick={(e) => e.stopPropagation()} className="h-4 w-4 accent-[#10B981]" /></span>
                      <CreatorAvatar c={c} />
                      <span className="min-w-0"><span className="block truncate text-[15px] font-medium"><span className="tnum mr-2 text-muted-strong">{c.rank}</span>{c.handle}</span><span className="flex items-center gap-2 text-[12.5px] text-muted-strong"><span className="truncate">{c.name}</span>{c.audit && <AudienceMicroBar types={c.audit.audience_types} />}</span></span>
                      <span className="tnum text-right text-[14px] font-medium">{fmtCount(c.followers)}</span>
                      <span className="inf-hide-sm inf-hide-md inf-hide-rail tnum text-[13px] text-muted-strong">{fmtCount(c.avg_likes)} likes · {fmtCount(c.avg_comments)} comments</span>
                      <span className="inf-hide-sm"><ErBar er={c.engagement_rate} threshold={th} /></span>
                      <span className="inf-hide-sm inf-hide-md">{c.audit ? <AqsArc aqs={c.audit.aqs} band={c.audit.aqs_band} /> : <ScoreArc score={c.authenticity_score} verdict={c.verdict} />}</span>
                      <span className="inf-hide-sm inf-hide-md inf-hide-rail"><VerdictChip verdict={c.verdict} /></span>
                      <span className="inf-hide-sm inf-hide-md inf-hide-rail tnum text-right text-[13px]">{Math.round(c.audience_fit)}%</span>
                    </div>
                  );
                })}
              </div>
              {result?.method_note && <p className="px-6 py-4 text-[12.5px] text-muted-strong">{result.method_note}</p>}
            </div>

            {/* right rail (desktop) */}
            <aside className="relative z-10 hidden min-w-0 rule-l bg-surface lg:block">
              {current ? <CreatorPanel c={current} threshold={thresholdFor(current, thresholds)} onClose={() => setSelected(null)} onDraft={draft} drafting={drafting} /> : (
                <div className="flex h-full min-h-[320px] flex-col items-center justify-center gap-3 px-8 text-center">
                  <div className="grid h-12 w-12 place-items-center rounded-full bg-tint-accent text-accent"><Sparkles size={20} /></div>
                  <div className="text-[15px] font-medium">Pick a creator</div>
                  <p className="text-[13.5px] text-muted-strong">See why they were scored real or fake, the threshold used, and the message written for them.</p>
                </div>
              )}
            </aside>
          </div>
        </div>
      )}

      {/* mobile drawer for the selected creator */}
      {drawer.mounted && current && (
        <BodyPortal><div className="fixed inset-0 z-50 lg:hidden">
          <button type="button" aria-label="Close" className="drawer-backdrop absolute inset-0 bg-black/30" data-closing={drawer.closing || undefined} onClick={() => setSelected(null)} />
          <div className="drawer-panel absolute inset-y-0 right-0 w-[min(92vw,420px)] bg-surface shadow-[var(--shadow-pop)]" data-side="right" data-closing={drawer.closing || undefined}>
            <CreatorPanel c={current} threshold={thresholdFor(current, thresholds)} onClose={() => setSelected(null)} onDraft={draft} drafting={drafting} />
          </div>
        </div></BodyPortal>
      )}

      {/* rule panel (from "How we score") */}
      {ruleOpen && result && (
        <StepperModal title="How we score creators" onClose={() => setRuleOpen(false)} width={640} footer={<Button variant="secondary" onClick={() => setRuleOpen(false)}>Close</Button>}>
          <div className="seg mb-4" aria-label="Scoring help">
            <button type="button" aria-pressed={ruleTab === "rule"} onClick={() => setRuleTab("rule")}>Real vs fake rule</button>
            <button type="button" aria-pressed={ruleTab === "audit"} onClick={() => setRuleTab("audit")}>Audit metrics</button>
          </div>
          {ruleTab === "rule" ? (
            <>
              <RuleCard thresholds={thresholds} redFlags={result.rule.red_flags} summary={result.rule.summary} sources={result.rule.sources} tab={tab} />
              {result.method_note && <p className="mt-4 text-[12.5px] text-muted-strong">{result.method_note}</p>}
            </>
          ) : <AuditMetricsHelp />}
        </StepperModal>
      )}

      {/* find modal */}
      {modal && (
        <StepperModal title="Find influencers" onClose={() => setModal(false)} width={620} footer={<><Button variant="secondary" onClick={() => setModal(false)}>Cancel</Button><Button onClick={start} disabled={starting || !brief.summary.trim() || !brief.niche.trim() || brief.platforms.length === 0}>{starting ? "Starting…" : "Research"}</Button></>}>
          <BriefForm brief={brief} onChange={updateBrief} onSubmit={start} busy={starting} error={startError} compact />
        </StepperModal>
      )}

      {/* bulk bar */}
      {bulk.mounted && (
        <BodyPortal><div className="bulk-bar bulk-enter fixed inset-x-4 bottom-4 z-40 !flex justify-between text-[13px] md:inset-x-auto md:left-1/2 md:-translate-x-1/2 md:justify-start md:text-[14px]" data-closing={bulk.closing || undefined}>
          <span className="whitespace-nowrap px-1 font-medium sm:px-3">{sel.size} selected</span>
          <button type="button" onClick={copyMessages} className="flex items-center gap-2 whitespace-nowrap rounded-full bg-white/15 px-3 py-2 hover:bg-white/25 sm:px-4"><Copy size={16} /><span className="hidden sm:inline">Copy messages</span></button>
          <button type="button" onClick={() => draft([...sel])} disabled={drafting} className="flex items-center gap-2 whitespace-nowrap rounded-full px-3 py-2 hover:bg-white/15 disabled:opacity-50 sm:px-4"><Mail size={16} /><span className="hidden sm:inline">Draft outreach (Gmail)</span></button>
          <IconButton label="Clear selection" className="!border-white/20 !text-white" onClick={() => setSel(new Set())}><Trash2 size={16} /></IconButton>
          <IconButton label="Close" className="!border-white/20 !text-white" onClick={() => setSel(new Set())}><X size={16} /></IconButton>
        </div></BodyPortal>
      )}

      {toast && <BodyPortal><div className="toast-in fixed bottom-24 left-1/2 z-50 -translate-x-1/2 rounded-full bg-ink px-4 py-2 text-[13px] text-white shadow-[var(--shadow-pop)] md:bottom-6" role="status">{toast}</div></BodyPortal>}
    </div>
  );
}

/** The TopBar tabs are links; this keeps them clickable for an in-page filter without routing. */
function TabSync({ tab, onTab }: { tab: Tab; onTab: (t: Tab) => void }) {
  useEffect(() => {
    const onClick = (e: MouseEvent) => {
      const a = (e.target as HTMLElement).closest('nav[aria-label="Page sections"] a') as HTMLAnchorElement | null;
      if (!a) return;
      e.preventDefault();
      const label = a.textContent?.trim();
      const t = TABS.find((x) => x.label === label);
      if (t) onTab(t.value);
    };
    document.addEventListener("click", onClick);
    return () => document.removeEventListener("click", onClick);
  }, [onTab]);
  void tab;
  return null;
}
