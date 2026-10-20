"use client";

import { useState, type FormEvent } from "react";
import "@/components/viz/growth.css";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { ArrowRight, BarChart3, Compass, Lightbulb, Rows3, Sparkles, Target, TrendingUp, type LucideIcon } from "lucide-react";
import { useCompany } from "@/lib/hooks";
import { Button } from "@/components/ui/Button";
import { Field, Input } from "@/components/ui/Controls";
import { Wordmark } from "@/components/ui/Logo";

/* Satellite tiles around the central app tile, as percentages of the diagram box. */
const SATELLITES: { label: string; icon: LucideIcon; bg: string; fg: string; glow: string; href: string; left: string; top: string }[] = [
  { label: "Growth", icon: TrendingUp, bg: "#EFEBFF", fg: "#8B5CF6", glow: "rgba(139,92,246,.35)", href: "/growth", left: "8%", top: "6%" },
  { label: "Timeline", icon: Rows3, bg: "#E3F4FB", fg: "#35B0E8", glow: "rgba(53,176,232,.35)", href: "/timeline", left: "17%", top: "56%" },
  { label: "Ideas", icon: Lightbulb, bg: "#F3E8FF", fg: "#A855F7", glow: "rgba(168,85,247,.35)", href: "/ideas", left: "77%", top: "6%" },
  { label: "Results", icon: BarChart3, bg: "#FFF1DC", fg: "#F5A524", glow: "rgba(245,165,36,.35)", href: "/results", left: "68%", top: "56%" },
];

/** 24x24 marks, fill currentColor. Gmail, LinkedIn, Anthropic and Google Analytics follow the
 *  simple-icons shapes; Firecrawl (flame), HubSpot (sprocket) and Higgsfield (monogram) are simplified marks. */
const MARKS: Record<string, string> = {
  Anthropic: "M17.304 3.541h-3.672l6.696 16.918H24Zm-10.608 0L0 20.459h3.744l1.37-3.553h7.005l1.369 3.553h3.744L10.536 3.541Zm-.371 10.223 2.291-5.946 2.292 5.946Z",
  Firecrawl: "M12.6 1.5c.5 3.2-1.4 5.2-3.3 7.2-1.6 1.7-3.1 3.4-3.1 6.1A5.8 5.8 0 0 0 12 20.6a5.8 5.8 0 0 0 5.8-5.8c0-2.3-1-4-2.1-5.4.1 1.5-.4 2.8-1.6 3.6.2-3.8-1-8.3-1.5-11.5Zm-.6 22.5a8.6 8.6 0 0 1-8.6-8.6c0-3.8 2-6.1 3.7-8 1.9-2.1 3.3-3.6 2.9-6.6L9.8 0l1.6.6c4 1.6 6.1 5.2 6.4 8.6 1.4 1.6 2.8 3.8 2.8 6.2A8.6 8.6 0 0 1 12 24Z",
  Gmail: "M24 5.457v13.909c0 .904-.732 1.636-1.636 1.636h-3.819V11.73L12 16.64l-6.545-4.91v9.273H1.636A1.636 1.636 0 0 1 0 19.366V5.457c0-2.023 2.309-3.178 3.927-1.964L5.455 4.64 12 9.548l6.545-4.91 1.528-1.145C21.69 2.28 24 3.434 24 5.457z",
  Higgsfield: "M4 3h3.6v7.2h8.8V3H20v18h-3.6v-7.2H7.6V21H4z",
  HubSpot: "M17.5 8.2V5.6a1.9 1.9 0 1 0-1.6 0v2.6a5.4 5.4 0 0 0-2.5 1.1L6.7 4.1a2.2 2.2 0 1 0-1 1.3l6.6 5.1a5.4 5.4 0 0 0 .1 6l-2 2a1.7 1.7 0 1 0 1.1 1.1l2-2a5.4 5.4 0 1 0 4-9.4Zm-.8 8.1a2.7 2.7 0 1 1 0-5.4 2.7 2.7 0 0 1 0 5.4Z",
  "Google Analytics": "M22.84 3v18a2.97 2.97 0 0 1-3.34 2.98c-1.53-.23-2.65-1.56-2.61-3.1V3.12A2.98 2.98 0 0 1 22.84 3ZM4.13 18.05a2.97 2.97 0 1 0 0 5.95 2.97 2.97 0 0 0 0-5.95Zm7.87-9.01h-.05a3.03 3.03 0 0 0-2.89 3.13v7.98c0 2.17.95 3.49 2.35 3.77a2.97 2.97 0 0 0 3.57-2.93v-8.96A2.98 2.98 0 0 0 12 9.04Z",
  LinkedIn: "M20.447 20.452h-3.554v-5.569c0-1.328-.027-3.037-1.852-3.037-1.853 0-2.136 1.445-2.136 2.939v5.667H9.351V9h3.414v1.561h.046c.477-.9 1.637-1.85 3.37-1.85 3.601 0 4.267 2.37 4.267 5.455v6.286zM5.337 7.433a2.062 2.062 0 1 1 0-4.125 2.062 2.062 0 0 1 0 4.125zm1.782 13.019H3.555V9h3.564v11.452zM22.225 0H1.771C.792 0 0 .774 0 1.729v20.542C0 23.227.792 24 1.771 24h20.451C23.2 24 24 23.227 24 22.271V1.729C24 .774 23.2 0 22.222 0h.003z",
};

const INTEGRATIONS: { label: string; color: string }[] = [
  { label: "Anthropic", color: "#191919" },
  { label: "Firecrawl", color: "#F5602A" },
  { label: "Gmail", color: "#EA4335" },
  { label: "Higgsfield", color: "#8B5CF6" },
  { label: "HubSpot", color: "#FF7A59" },
  { label: "Google Analytics", color: "#E37400" },
  { label: "LinkedIn", color: "#0A66C2" },
];

function Diagram() {
  const [hot, setHot] = useState<number | null>(null);
  const CONN = [
    { d: "M 230 100 C 320 100, 360 200, 440 210", stroke: "url(#c-violet)" },
    { d: "M 320 320 C 380 320, 400 250, 440 236", stroke: "url(#c-cyan)" },
    { d: "M 770 100 C 680 100, 640 200, 560 210", stroke: "url(#c-purple)" },
    { d: "M 680 320 C 620 320, 600 250, 560 236", stroke: "url(#c-orange)" },
  ];
  return (
    <div className="relative mx-auto mt-8 hidden w-full max-w-[1000px] md:block" style={{ aspectRatio: "1000 / 440" }}>
      <svg className="absolute inset-0 h-full w-full" viewBox="0 0 1000 440" fill="none" aria-hidden>
        <defs>
          <linearGradient id="c-violet" x1="0" x2="1"><stop offset="0" stopColor="#8B5CF6" stopOpacity=".35" /><stop offset="1" stopColor="#8B5CF6" stopOpacity=".08" /></linearGradient>
          <linearGradient id="c-cyan" x1="0" x2="1"><stop offset="0" stopColor="#35B0E8" stopOpacity=".35" /><stop offset="1" stopColor="#35B0E8" stopOpacity=".08" /></linearGradient>
          <linearGradient id="c-purple" x1="1" x2="0"><stop offset="0" stopColor="#A855F7" stopOpacity=".35" /><stop offset="1" stopColor="#A855F7" stopOpacity=".08" /></linearGradient>
          <linearGradient id="c-orange" x1="1" x2="0"><stop offset="0" stopColor="#F5A524" stopOpacity=".4" /><stop offset="1" stopColor="#F5A524" stopOpacity=".08" /></linearGradient>
        </defs>
        {/* pathLength=1 normalises every curve so one dash value draws each one in */}
        {CONN.map((c, i) => (
          <path key={i} d={c.d} pathLength={1} className="gx-conn" data-hot={hot === i || undefined} style={{ ["--i" as string]: i }} stroke={c.stroke} strokeWidth={hot === i ? 10 : 8} strokeLinecap="round" />
        ))}
      </svg>
      {SATELLITES.map((s, i) => {
        const Icon = s.icon;
        return (
          <Link
            key={s.label} href={s.href} aria-label={`Open ${s.label}`}
            className="gx-sat absolute flex flex-col items-center gap-2 rounded-[32px] outline-none"
            style={{ left: s.left, top: s.top, ["--i" as string]: i, ["--glow" as string]: s.glow }}
            onMouseEnter={() => setHot(i)} onMouseLeave={() => setHot(null)} onFocus={() => setHot(i)} onBlur={() => setHot(null)}
          >
            <div className="gx-tile grid h-[140px] w-[140px] place-items-center rounded-[28px]" style={{ background: s.bg, color: s.fg }}>
              <Icon size={44} strokeWidth={1.6} />
            </div>
            <span className="text-[15px] font-medium" style={{ color: s.fg }}>{s.label}</span>
          </Link>
        );
      })}
      <div className="absolute left-1/2 top-1/2 flex -translate-x-1/2 -translate-y-1/2 flex-col items-center gap-4">
        <div className="gx-core grid h-[200px] w-[200px] place-items-center rounded-[44px] text-white shadow-[0_30px_80px_rgba(139,92,246,.35)]" style={{ background: "linear-gradient(135deg, #10B981 0%, #8B5CF6 55%, #35B0E8 100%)" }}>
          <Compass size={84} strokeWidth={1.4} />
        </div>
        <div className="font-display text-[20px] font-semibold">GrowthPilot <span className="bg-gradient-to-r from-accent via-accent2 to-[#F5A524] bg-clip-text text-transparent">Growth OS</span></div>
      </div>
    </div>
  );
}

function DiagramMobile() {
  return (
    <div className="mt-10 md:hidden">
      <div className="mx-auto flex flex-col items-center gap-3">
        <div className="grid h-[150px] w-[150px] place-items-center rounded-[36px] text-white" style={{ background: "linear-gradient(135deg, #10B981 0%, #8B5CF6 55%, #35B0E8 100%)" }}>
          <Compass size={64} strokeWidth={1.4} />
        </div>
        <div className="font-display text-[18px] font-semibold">GrowthPilot Growth OS</div>
      </div>
      <div className="mt-6 grid grid-cols-2 gap-3">
        {SATELLITES.map((s) => {
          const Icon = s.icon;
          return (
            <Link key={s.label} href={s.href} className="flex items-center gap-3 rounded-[18px] px-4 py-3" style={{ background: s.bg, color: s.fg }}>
              <Icon size={24} strokeWidth={1.7} /><span className="text-[15px] font-medium">{s.label}</span>
            </Link>
          );
        })}
      </div>
    </div>
  );
}

export default function Landing() {
  const router = useRouter();
  const { company, loading } = useCompany();
  const [form, setForm] = useState({ name: "", website: "", description: "" });

  const submit = (e: FormEvent) => {
    e.preventDefault();
    const q = new URLSearchParams();
    for (const [k, v] of Object.entries(form)) if (v.trim()) q.set(k, v.trim());
    router.push(`/setup?${q.toString()}`);
  };

  return (
    <div className="min-h-screen bg-surface">
      <header className="mx-auto flex h-[72px] max-w-[1180px] items-center justify-between px-5 md:px-8">
        <Link href="/" aria-label="GrowthPilot home"><Wordmark /></Link>
        <div className="flex items-center gap-2">
          {!loading && company && <Button href="/growth" variant="secondary" size="sm">Open app <ArrowRight size={14} /></Button>}
          <Button href="#workspace" size="sm" className="hidden sm:inline-flex">Create workspace</Button>
        </div>
      </header>

      <section className="relative overflow-hidden px-5 pb-12 pt-10 md:px-8 md:pt-10">
        <div className="pointer-events-none absolute inset-0" aria-hidden>
          <div className="absolute left-1/2 top-[30%] h-[520px] w-[520px] -translate-x-1/2 rounded-full opacity-70 blur-3xl" style={{ background: "radial-gradient(circle, rgba(139,92,246,.18), transparent 60%)" }} />
          <div className="absolute left-[20%] top-[20%] h-[380px] w-[380px] rounded-full opacity-70 blur-3xl" style={{ background: "radial-gradient(circle, rgba(16,185,129,.18), transparent 60%)" }} />
          <div className="absolute right-[12%] top-[40%] h-[360px] w-[360px] rounded-full opacity-70 blur-3xl" style={{ background: "radial-gradient(circle, rgba(245,165,36,.16), transparent 60%)" }} />
        </div>
        <div className="relative mx-auto max-w-[1000px] text-center">
          <h1 className="font-display text-[44px] font-semibold leading-[1.05] tracking-tight md:text-[64px]">
            <span className="gx-shimmer bg-gradient-to-r from-accent via-accent2 to-[#F5A524] bg-clip-text text-transparent">Research, Plan &amp; Execute</span>
          </h1>
          <p className="mx-auto mt-5 max-w-[640px] text-[18px] text-ink/80 md:text-[24px] md:leading-[1.35]">
            Plan and run go-to-market in one place, with every agent focused on your goal.
          </p>
          <Diagram />
          <DiagramMobile />
          <ul className="mt-8 flex flex-wrap items-center justify-center -space-x-2" aria-label="Integrations">
            {INTEGRATIONS.map((i) => (
                <li key={i.label} data-tip={i.label} tabIndex={0} className="gx-chip gx-tt grid h-16 w-16 place-items-center rounded-full bg-surface shadow-[0_6px_18px_rgba(17,17,20,.1)] ring-4 ring-surface outline-none" style={{ color: i.color }}>
                  <svg width={20} height={20} viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d={MARKS[i.label]} /></svg>
                  <span className="sr-only">{i.label}</span>
                </li>
            ))}
          </ul>
        </div>
      </section>

      <section id="workspace" className="px-5 py-16 md:px-8">
        <div className="card mx-auto max-w-[560px] p-6 md:p-8">
          <div className="flex items-center gap-2 text-[12px] font-medium text-accent"><Sparkles size={14} /> No credit card · runs locally</div>
          <h2 className="mt-2 font-display text-[28px] font-medium">Create your workspace</h2>
          <p className="mt-1 text-[14px] text-muted-strong">From company profile to an executed plan in one run. Seven agents, fourteen stages, approval gates on every action.</p>
          {!loading && company ? (
            <div className="mt-6 space-y-3">
              <div className="rounded-[10px] bg-ground px-4 py-3 text-[14px]">
                Workspace <span className="font-medium">{company.name}</span> is already set up.
              </div>
              <Button href="/growth" className="w-full">Open Growth <ArrowRight size={16} /></Button>
              <Button href="/setup" variant="secondary" className="w-full">Create another company</Button>
            </div>
          ) : (
            <form onSubmit={submit} className="mt-6 grid gap-4">
              <Field label="Company name"><Input required value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="Acme Analytics" /></Field>
              <Field label="Website"><Input value={form.website} onChange={(e) => setForm({ ...form, website: e.target.value })} placeholder="https://acme.example" inputMode="url" /></Field>
              <Field label="One-line description"><Input value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} placeholder="Usage analytics for B2B SaaS teams" /></Field>
              <Button type="submit" className="mt-2 w-full">Continue to setup <ArrowRight size={16} /></Button>
              <p className="text-center text-[12.5px] text-muted-strong-strong">Three short steps, then the agents start researching.</p>
            </form>
          )}
        </div>
      </section>

      <footer className="rule-t px-5 py-8 text-center text-[12.5px] text-muted-strong-strong md:px-8">
        <span className="inline-flex items-center gap-1.5"><Target size={12} /> GrowthPilot · Markdown / HTML exports · local SQLite</span>
      </footer>
    </div>
  );
}
