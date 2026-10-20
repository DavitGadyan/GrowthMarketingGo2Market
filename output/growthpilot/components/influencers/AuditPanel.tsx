"use client";

import { useState, type ReactNode } from "react";
import { ChevronDown } from "lucide-react";
import { Pill } from "@/components/viz/Avatar";
import type { CreatorAudit, InfluencerCandidate } from "@/lib/types";
import { AQS_BANDS, AUD_COLOR, AUD_DEF, AUD_KEYS, AUD_LABEL, BAND_COLOR, BAND_LABEL, BAND_TONE, GROWTH_LABEL, GROWTH_TONE, SPREAD_LABEL, fmtCount, fmtEr, fmtPct, fmtUsd } from "./parts";

/** Collapsible block: caps header + chevron; body enters with .content-enter. */
function Section({ title, right, open: initial = true, children }: { title: string; right?: ReactNode; open?: boolean; children: ReactNode }) {
  const [open, setOpen] = useState(initial);
  return (
    <section className="inf-sec">
      <button type="button" className="inf-sec-h" aria-expanded={open} onClick={() => setOpen((v) => !v)}>
        <span className="t-caps text-muted-strong">{title}</span>
        <span className="ml-auto flex items-center gap-2">{right}<ChevronDown size={14} className="inf-sec-caret text-muted-strong" data-open={open ? "true" : "false"} /></span>
      </button>
      {open && <div className="content-enter inf-sec-b">{children}</div>}
    </section>
  );
}

const SIMILAR_TONE = { above: "success", average: "warn", below: "danger" } as const;

/** Illustrative follower-growth shape per pattern (not real data). */
function GrowthShape({ pattern }: { pattern: CreatorAudit["followers_growth"] }) {
  const d = pattern === "organic" ? "M2 28 C 40 26, 80 16, 118 4"
    : pattern === "spikes" ? "M2 28 L40 26 L48 6 L56 22 L88 20 L96 4 L118 18"
    : pattern === "follow_unfollow" ? "M2 24 L16 8 L30 24 L44 8 L58 24 L72 8 L86 24 L100 8 L118 24"
    : "M2 18 L118 18";
  const color = pattern === "organic" ? "#3DBF6B" : pattern === "spikes" ? "#F0665C" : pattern === "follow_unfollow" ? "#F5A524" : "#8A8A8F";
  return (
    <svg className="inf-spark" width={120} height={32} viewBox="0 0 120 32" aria-hidden="true">
      <path d={d} fill="none" stroke={color} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" strokeDasharray={pattern === "unknown" ? "4 4" : undefined} />
    </svg>
  );
}

function MiniRing({ value, color, size = 28 }: { value: number; color: string; size?: number }) {
  const r = size / 2 - 3, c = 2 * Math.PI * r;
  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} role="img" aria-label={`${Math.round(value * 100)}%`}>
      <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="rgba(0,0,0,.08)" strokeWidth={4} />
      <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke={color} strokeWidth={4} strokeLinecap="round" className="inf-ring"
        strokeDasharray={c} strokeDashoffset={c * (1 - Math.max(0, Math.min(1, value)))} transform={`rotate(-90 ${size / 2} ${size / 2})`} style={{ ["--len" as string]: String(c) }} />
    </svg>
  );
}

const tile = (label: string, value: string, hint?: string) => (
  <div className="rounded-[10px] bg-ground px-3 py-2"><div className="t-meta text-muted-strong">{label}</div><div className="tnum text-[15px] font-medium" title={hint}>{value}</div></div>
);

export function AuditPanel({ audit, candidate }: { audit: CreatorAudit | null; candidate: InfluencerCandidate }) {
  if (!audit) return <p className="text-[13px] text-muted-strong">Audit not available for this creator.</p>;
  const a = audit;
  const bandIdx = AQS_BANDS.findIndex((b) => b.band === a.aqs_band);
  const authColor = a.comments_authenticity >= 0.7 ? "#3DBF6B" : a.comments_authenticity >= 0.4 ? "#F5A524" : "#F0665C";
  return (
    <div className="inf-audit stagger grid gap-4">
      <div className="flex items-center justify-between">
        <span className="t-caps text-muted-strong">Audit</span>
        <Pill tone={candidate.data_quality === "measured" ? "accent" : "muted"}>{candidate.data_quality === "measured" ? "measured" : "estimated"}</Pill>
      </div>

      <Section title="Audience Quality Score">
        <div className="flex items-center gap-4">
          <span className="tnum text-[32px] font-semibold leading-none" style={{ color: BAND_COLOR[a.aqs_band] }}>{Math.round(a.aqs)}</span>
          <div className="grid gap-2">
            <Pill tone={BAND_TONE[a.aqs_band]}>{BAND_LABEL[a.aqs_band]}</Pill>
            <div className="inf-bandbar-wrap" title={`AQS ${Math.round(a.aqs)} / 100`}>
              <div className="inf-bandbar">{AQS_BANDS.map((b, i) => <i key={b.band} style={{ width: `${b.to - b.from}%`, background: BAND_COLOR[b.band], opacity: i === bandIdx ? 1 : 0.35 }} title={`${BAND_LABEL[b.band]} ${b.from}-${b.to}`} />)}</div>
              <i className="inf-bandbar-marker" style={{ transform: `translateX(${Math.round(1.6 * Math.max(0, Math.min(100, a.aqs)))}px)` }} />
            </div>
          </div>
        </div>
        <p className="mt-2 text-[12.5px] text-muted-strong">Combines engagement, audience quality, growth pattern and comments authenticity (GrowthPilot estimate).</p>
      </Section>

      <Section title="Audience type">
        <div className="inf-stack" role="img" aria-label={AUD_KEYS.map((k) => `${AUD_LABEL[k]} ${fmtPct(a.audience_types[k])}`).join(", ")}>
          {AUD_KEYS.map((k) => {
            const v = a.audience_types[k];
            return <span key={k} className="inf-stack-seg" style={{ width: `${v * 100}%`, background: AUD_COLOR[k] }} title={`${AUD_LABEL[k]} ${fmtPct(v)} - ${AUD_DEF[k]}`}>{v >= 0.12 ? <b>{fmtPct(v)}</b> : null}</span>;
          })}
        </div>
        <ul className="mt-2 grid grid-cols-2 gap-x-3 gap-y-1 text-[12.5px]">
          {AUD_KEYS.map((k) => <li key={k} className="flex items-center gap-1.5" title={AUD_DEF[k]}><i className="h-2 w-2 flex-none rounded-full" style={{ background: AUD_COLOR[k] }} /><span className="truncate text-muted-strong">{AUD_LABEL[k]}</span><span className="tnum ml-auto font-medium">{fmtPct(a.audience_types[k])}</span></li>)}
        </ul>
        <p className="mt-2 text-[12.5px] text-muted-strong">Quality audience <span className="tnum text-ink">{fmtPct(a.quality_audience)}</span> · Reachability <span className="tnum text-ink">{fmtPct(a.audience_reachability)}</span></p>
      </Section>

      <Section title="Engagement">
        <div className="grid gap-2 text-[13.5px]">
          <div className="flex flex-wrap items-center gap-2"><span>ER <span className="tnum font-medium">{fmtEr(candidate.engagement_rate)}</span></span><Pill tone={SIMILAR_TONE[a.er_vs_similar]}>vs similar accounts: {a.er_vs_similar}</Pill></div>
          <div>Authentic engagement <span className="tnum font-medium">{fmtEr(a.authentic_engagement)}</span> <span className="text-muted-strong">(ER × quality audience)</span></div>
          <div className="flex flex-wrap items-center gap-2">Likes–comment ratio <span className="tnum font-medium">{a.likes_comment_ratio.toFixed(1)}×</span><Pill tone={a.likes_spread === "organic" ? "success" : a.likes_spread === "even" ? "danger" : "muted"}>likes spread: {SPREAD_LABEL[a.likes_spread]}</Pill></div>
          <div className="flex items-center gap-2"><MiniRing value={a.comments_authenticity} color={authColor} /><span>Comments authenticity <span className="tnum font-medium">{fmtPct(a.comments_authenticity)}</span></span></div>
          {a.comments_samples.length > 0 && <ul className="grid gap-1">{a.comments_samples.slice(0, 2).map((s, i) => <li key={`${i}-${s}`} className="text-[12.5px] italic text-muted-strong">“{s}”</li>)}</ul>}
        </div>
      </Section>

      <Section title="Growth">
        <div className="flex items-start gap-3">
          <div className="grid gap-1.5 text-[13.5px]">
            <div className="flex flex-wrap items-center gap-2"><Pill tone={GROWTH_TONE[a.followers_growth]}>{GROWTH_LABEL[a.followers_growth]}</Pill>{a.yearly_growth_rate != null && <span className="tnum text-muted-strong">{a.yearly_growth_rate >= 0 ? "+" : ""}{fmtPct(a.yearly_growth_rate)} / yr</span>}</div>
            {a.growth_note && <p className="text-[12.5px] text-muted-strong">{a.growth_note}</p>}
          </div>
          <div className="ml-auto flex flex-col items-end"><GrowthShape pattern={a.followers_growth} /><span className="text-[11px] text-muted-strong">pattern illustration</span></div>
        </div>
      </Section>

      <Section title="Activity & brand" open={false}>
        <div className="grid grid-cols-2 gap-2">
          {tile("Posts / week", a.posts_per_week != null ? a.posts_per_week.toFixed(1) : "—")}
          {tile("Sponsored share", a.sponsored_share != null ? fmtPct(a.sponsored_share) : "—")}
        </div>
        {a.brand_mentions.length > 0 && <div className="mt-2 flex flex-wrap gap-1.5">{a.brand_mentions.map((b, i) => <Pill key={`${i}-${b}`}>{b}</Pill>)}</div>}
      </Section>

      <Section title="Value">
        <div className="grid grid-cols-3 gap-2">
          {tile("Est. reach / post", a.estimated_reach != null ? fmtCount(a.estimated_reach) : "—", "followers × reachability × tier reach")}
          {tile("Est. price / post", a.estimated_price_usd != null ? fmtUsd(a.estimated_price_usd) : "—", "from followers, ER, AQS and tier")}
          {tile("CPE", a.cpe_usd != null ? fmtUsd(a.cpe_usd) : "—", "price ÷ (avg likes + comments)")}
        </div>
      </Section>

      <Section title="Audience" open={false}>
        <div className="grid gap-2 text-[13px]">
          {a.audience.top_countries.length > 0 && <div className="flex flex-wrap items-center gap-1.5"><span className="text-muted-strong">Countries</span>{a.audience.top_countries.map((c, i) => <Pill key={`${i}-${c}`}>{c}</Pill>)}</div>}
          {a.audience.age_gender && <div><span className="text-muted-strong">Age / gender</span> {a.audience.age_gender}</div>}
          {a.audience.languages.length > 0 && <div><span className="text-muted-strong">Languages</span> {a.audience.languages.join(", ")}</div>}
          {a.audience.interests.length > 0 && <div className="flex flex-wrap items-center gap-1.5"><span className="text-muted-strong">Interests</span>{a.audience.interests.map((c, i) => <Pill key={`${i}-${c}`} tone="accent">{c}</Pill>)}</div>}
        </div>
      </Section>

      <Section title="Signals">
        <ul className="grid gap-1.5 text-[13px]">{a.signals.map((s, i) => <li key={`${i}-${s}`} className="flex gap-2"><span className="mt-[7px] h-1.5 w-1.5 flex-none rounded-full bg-accent" /><span>{s}</span></li>)}</ul>
      </Section>
    </div>
  );
}

/** One-line definitions for the "How we score → Audit metrics" tab. */
export function AuditMetricsHelp() {
  const rows: [string, string][] = [
    ["Audience Quality Score (AQS)", "1-100 composite of engagement, quality audience, growth pattern and comments authenticity."],
    ["Audience type", "Real people · Influencers (>5k followers, <1,500 followings) · Mass followers (>1,500 followings) · Suspicious (bots, bought)."],
    ["Quality audience", "Share of followers that are real people or influencers."],
    ["Reachability", "Share of followers following fewer than 1,500 accounts - the ones likely to see a post."],
    ["Engagement rate", "(avg likes + avg comments) ÷ followers over the sampled recent posts, judged against the tier band."],
    ["Authentic engagement", "Engagement rate × quality audience."],
    ["Likes–comment ratio", "Avg likes ÷ avg comments; an unnaturally even spread suggests bought engagement."],
    ["Comments authenticity", "Share of recent comments that are not emoji-only, generic praise, mention-only or pod-like."],
    ["Followers growth", "Organic ramp vs. spikes (bought bursts) vs. follow/unfollow sawtooth."],
    ["Est. reach / price / CPE", "Reach = followers × reachability × tier factor; price from followers, ER, AQS and tier; CPE = price ÷ engagement."],
  ];
  return (
    <div className="grid gap-3">
      <p className="text-[13px] text-muted-strong">Modelled on the metric vocabulary of influencer-audit tools such as HypeAuditor; every value here is a GrowthPilot estimate from public signals.</p>
      <dl className="grid gap-1.5 text-[13px]">{rows.map(([k, v]) => <div key={k} className="grid grid-cols-[180px_1fr] gap-3"><dt className="font-medium">{k}</dt><dd className="text-muted-strong">{v}</dd></div>)}</dl>
      <div>
        <div className="t-caps mb-1.5 text-muted-strong">AQS bands</div>
        <table className="w-full text-[13px]"><tbody>{AQS_BANDS.slice().reverse().map((b) => <tr key={b.band} className="rule-t"><td className="py-1"><span className="inline-flex items-center gap-2"><i className="h-2.5 w-2.5 rounded-full" style={{ background: BAND_COLOR[b.band] }} />{BAND_LABEL[b.band]}</span></td><td className="tnum py-1 text-right text-muted-strong">{b.from}{b.to === 100 ? "-100" : `-${b.to - 1}`}</td></tr>)}</tbody></table>
      </div>
    </div>
  );
}
