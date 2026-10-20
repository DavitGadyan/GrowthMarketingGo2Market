"use client";

import { useState } from "react";
import type { InfluencerCandidate, InfluencerThreshold, InfluencerVerdict, Platform } from "@/lib/types";
import { Pill } from "@/components/viz/Avatar";

export const VERDICT_LABEL: Record<InfluencerVerdict, string> = { real: "Real", suspicious: "Suspicious", likely_fake: "Likely fake" };
export const VERDICT_COLOR: Record<InfluencerVerdict, string> = { real: "#3DBF6B", suspicious: "#F5A524", likely_fake: "#F0665C" };
export const VERDICT_TONE: Record<InfluencerVerdict, "success" | "warn" | "danger"> = { real: "success", suspicious: "warn", likely_fake: "danger" };
export const PLATFORM_LABEL: Record<Platform, string> = { instagram: "Instagram", x: "X" };

export function fmtCount(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(n >= 10_000_000 ? 0 : 1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(n >= 100_000 ? 0 : 1)}k`;
  return String(Math.round(n));
}
export const fmtEr = (fraction: number) => `${(fraction * 100).toFixed(fraction < 0.01 ? 2 : 1)}%`;

/** The threshold row that judged this creator (by platform + follower tier). */
export function thresholdFor(c: Pick<InfluencerCandidate, "platform" | "followers">, thresholds: InfluencerThreshold[]): InfluencerThreshold | undefined {
  return thresholds.find((t) => t.platform === c.platform && c.followers >= t.followers_min && (t.followers_max == null || c.followers < t.followers_max))
    ?? thresholds.find((t) => t.platform === c.platform);
}

export function VerdictChip({ verdict }: { verdict: InfluencerVerdict }) {
  return <Pill tone={VERDICT_TONE[verdict]}>{VERDICT_LABEL[verdict]}</Pill>;
}

/** Initials avatar with a small platform badge. */
/** Real profile picture, served and cached by the backend (Instagram og:image / X via unavatar); initials when it is missing. */
export function avatarUrl(c: InfluencerCandidate): string {
  const api = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000/api";
  const handle = c.handle.replace(/^@/, "").trim();
  return `${api}/avatar/${c.platform === "instagram" ? "instagram" : "x"}/${encodeURIComponent(handle)}`;
}

export function CreatorAvatar({ c, size = 36 }: { c: InfluencerCandidate; size?: number }) {
  const [failed, setFailed] = useState(false);
  const ini = (c.name || c.handle).replace(/^@/, "").split(/\s+/).map((w) => w[0]).join("").slice(0, 2).toUpperCase();
  const tint = c.platform === "instagram" ? ["#FDE7F3", "#B0286D"] : ["#E3F4FB", "#1C7FB0"];
  return (
    <span className="relative inline-grid flex-none place-items-center overflow-visible rounded-full font-medium" style={{ width: size, height: size, background: tint[0], color: tint[1], fontSize: Math.round(size * 0.36) }} title={PLATFORM_LABEL[c.platform]}>
      {ini}
      {!failed && (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={avatarUrl(c)} alt="" width={size} height={size} loading="lazy" decoding="async" referrerPolicy="no-referrer"
          className="absolute inset-0 h-full w-full rounded-full object-cover inf-avatar-img" onError={() => setFailed(true)} />
      )}
      <span className="inf-platform" aria-label={PLATFORM_LABEL[c.platform]}>{c.platform === "instagram" ? "IG" : "X"}</span>
    </span>
  );
}

/** Engagement-rate bar against the tier's "good" threshold (the tick). */
export function ErBar({ er, threshold }: { er: number; threshold?: InfluencerThreshold }) {
  const good = threshold?.good_er ?? 0.03;
  const max = Math.max(good * 1.6, er * 1.1, 0.001);
  const w = Math.min(100, (er / max) * 100);
  const color = threshold ? (er >= threshold.good_er ? "#3DBF6B" : er >= threshold.ok_er ? "#F5A524" : "#F0665C") : "#8A8A8F";
  return (
    <span className="flex items-center gap-2">
      <span className="tnum w-14 text-right text-[14px] font-medium">{fmtEr(er)}</span>
      <span className="inf-erbar w-16" title={threshold ? `good ≥ ${fmtEr(threshold.good_er)} · poor < ${fmtEr(threshold.ok_er)}` : "no benchmark"}>
        <i style={{ width: `${w}%`, background: color }} />
        <b style={{ left: `${Math.min(99, (good / max) * 100)}%` }} />
      </span>
    </span>
  );
}

/** 72x40 authenticity arc: grey track + coloured value arc, draws in on mount. */
export function ScoreArc({ score, verdict, size = 72 }: { score: number; verdict: InfluencerVerdict; size?: number }) {
  const W = size, H = Math.round(size * 0.56), cx = W / 2, cy = H - 4, r = W / 2 - 6;
  const len = Math.PI * r;
  const v = Math.max(0, Math.min(1, score / 100));
  const d = `M ${cx - r} ${cy} A ${r} ${r} 0 0 1 ${cx + r} ${cy}`;
  return (
    <svg width={W} height={H} viewBox={`0 0 ${W} ${H}`} role="img" aria-label={`Authenticity ${Math.round(score)} of 100`}>
      <path d={d} fill="none" stroke="rgba(0,0,0,.08)" strokeWidth={6} strokeLinecap="round" />
      <path d={d} fill="none" stroke={VERDICT_COLOR[verdict]} strokeWidth={6} strokeLinecap="round" className="inf-arc"
        strokeDasharray={len} strokeDashoffset={len * (1 - v)} style={{ ["--len" as string]: String(len) }} />
      <text x={cx} y={cy - 2} textAnchor="middle" fontSize={Math.round(size * 0.18)} fontWeight={600} fill="#111114" className="tnum">{Math.round(score)}</text>
    </svg>
  );
}

/* ---------- HypeAuditor-style audit bits ---------- */
import type { AqsBand, AudienceTypes, GrowthPattern, LikesSpread } from "@/lib/types";

export const BAND_LABEL: Record<AqsBand, string> = { excellent: "Excellent", good: "Good", average: "Average", low: "Low", poor: "Poor" };
export const BAND_COLOR: Record<AqsBand, string> = { excellent: "#3DBF6B", good: "#3DBF6B", average: "#F5A524", low: "#F0665C", poor: "#F0665C" };
export const BAND_TONE: Record<AqsBand, "success" | "warn" | "danger"> = { excellent: "success", good: "success", average: "warn", low: "danger", poor: "danger" };
/** Our bands: ≥80 excellent, 65-79 good, 50-64 average, 30-49 low, <30 poor. */
export const AQS_BANDS: { band: AqsBand; from: number; to: number }[] = [
  { band: "poor", from: 0, to: 30 }, { band: "low", from: 30, to: 50 }, { band: "average", from: 50, to: 65 }, { band: "good", from: 65, to: 80 }, { band: "excellent", from: 80, to: 100 },
];
export const bandOf = (aqs: number): AqsBand => (aqs >= 80 ? "excellent" : aqs >= 65 ? "good" : aqs >= 50 ? "average" : aqs >= 30 ? "low" : "poor");

export const AUD_KEYS: (keyof AudienceTypes)[] = ["real_people", "influencers", "mass_followers", "suspicious"];
export const AUD_LABEL: Record<keyof AudienceTypes, string> = { real_people: "Real people", influencers: "Influencers", mass_followers: "Mass followers", suspicious: "Suspicious" };
export const AUD_COLOR: Record<keyof AudienceTypes, string> = { real_people: "#3DBF6B", influencers: "#8B5CF6", mass_followers: "#F5A524", suspicious: "#F0665C" };
export const AUD_DEF: Record<keyof AudienceTypes, string> = {
  real_people: "Accounts that behave like a regular, live person.",
  influencers: "More than 5,000 followers and fewer than 1,500 followings.",
  mass_followers: "More than 1,500 followings - usually follow/unfollow tools.",
  suspicious: "Bots, fake or stolen accounts, and buyers of likes, comments or followers.",
};
export const GROWTH_LABEL: Record<GrowthPattern, string> = { organic: "Organic", spikes: "Spikes", follow_unfollow: "Follow / unfollow", unknown: "Unknown" };
export const GROWTH_TONE: Record<GrowthPattern, "success" | "warn" | "danger" | "muted"> = { organic: "success", spikes: "danger", follow_unfollow: "warn", unknown: "muted" };
export const SPREAD_LABEL: Record<LikesSpread, string> = { organic: "organic", even: "even - looks bought", unknown: "unknown" };
export const fmtUsd = (n: number) => (n >= 100 ? `$${Math.round(n).toLocaleString()}` : `$${n.toFixed(2)}`);
export const fmtPct = (fraction: number, digits = 0) => `${(fraction * 100).toFixed(digits)}%`;

/** 72x40 AQS arc (draws in) with the band label under it. */
export function AqsArc({ aqs, band, size = 72 }: { aqs: number; band?: AqsBand; size?: number }) {
  const b = band ?? bandOf(aqs);
  const W = size, H = Math.round(size * 0.56), cx = W / 2, cy = H - 4, r = W / 2 - 6;
  const len = Math.PI * r;
  const v = Math.max(0, Math.min(1, aqs / 100));
  const d = `M ${cx - r} ${cy} A ${r} ${r} 0 0 1 ${cx + r} ${cy}`;
  return (
    <span className="inf-aqs" title={`Audience Quality Score ${Math.round(aqs)} - ${BAND_LABEL[b]}`}>
      <svg width={W} height={H} viewBox={`0 0 ${W} ${H}`} role="img" aria-label={`AQS ${Math.round(aqs)} of 100, ${BAND_LABEL[b]}`}>
        <path d={d} fill="none" stroke="rgba(0,0,0,.08)" strokeWidth={6} strokeLinecap="round" />
        <path d={d} fill="none" stroke={BAND_COLOR[b]} strokeWidth={6} strokeLinecap="round" className="inf-arc"
          strokeDasharray={len} strokeDashoffset={len * (1 - v)} style={{ ["--len" as string]: String(len) }} />
        <text x={cx} y={cy - 2} textAnchor="middle" fontSize={Math.round(size * 0.18)} fontWeight={600} fill="#111114" className="tnum">{Math.round(aqs)}</text>
      </svg>
      <span className="inf-aqs-band" style={{ color: BAND_COLOR[b] }}>{BAND_LABEL[b]}</span>
    </span>
  );
}

/** 60x6 audience-type micro bar: real / influencers / mass followers / suspicious. */
export function AudienceMicroBar({ types, width = 60 }: { types: AudienceTypes; width?: number }) {
  const title = AUD_KEYS.map((k) => `${AUD_LABEL[k]} ${Math.round(types[k] * 100)}%`).join(" · ");
  return (
    <span className="inf-micro" style={{ width }} title={title} aria-label={`Audience: ${title}`}>
      {AUD_KEYS.map((k) => <i key={k} style={{ width: `${Math.max(0, types[k] * 100)}%`, background: AUD_COLOR[k] }} />)}
    </span>
  );
}
