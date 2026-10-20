"use client";

import { Info, Pencil, Settings } from "lucide-react";
import { useCompany, useHealth } from "@/lib/hooks";
import { API_BASE } from "@/lib/api";
import { money } from "@/lib/format";
import { TopBar } from "@/components/shell/TopBar";
import { Card, SectionTitle } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Chip, StatusDot } from "@/components/ui/Chip";
import { EmptyState, ErrorState, Skeleton } from "@/components/ui/States";
import "@/components/viz/interact.css";

function Row({ k, v }: { k: string; v: React.ReactNode }) {
  return <div className="ix-row -mx-3 grid grid-cols-[112px_minmax(0,1fr)] gap-3 rounded-[8px] px-3 py-2.5 text-[14px] sm:grid-cols-[160px_minmax(0,1fr)] rule-b last:border-0"><span className="text-muted">{k}</span><span className="min-w-0 break-words">{v || "—"}</span></div>;
}

function ModeBadge({ fake }: { fake: boolean }) {
  return (
    <span className="ix-tipwrap">
      <button type="button" className="flex items-center gap-1.5 rounded-full focus:outline-none" aria-describedby="agent-mode-tip">
        {fake ? <Chip tone="warn">Deterministic demo</Chip> : <Chip tone="accent">Live agents</Chip>}
        <Info size={14} className="text-muted" />
      </button>
      <span id="agent-mode-tip" role="tooltip" className="ix-tip">
        {fake
          ? "Demo mode: GROWTHPILOT_FAKE_AGENTS=1. Stages, tasks and chat replies come from a deterministic runner - no API calls, no cost. Unset it (and log in with the claude CLI or set ANTHROPIC_API_KEY) for live agents."
          : "Live mode: every stage and task runs through the Claude Agent SDK with web research and your integrations. Costs accrue per run; the per-stage budget caps are in backend/.env."}
      </span>
    </span>
  );
}

export default function SettingsPage() {
  const { company, loading, error } = useCompany();
  const health = useHealth();
  const p = company?.profile;

  return (
    <>
      <TopBar title="Settings" subtitle="Workspace, models and budgets" actions={company && <Button href={`/setup?company=${company.id}`}><Pencil size={15} /> Edit profile</Button>} />
      <div className="p-6 md:p-8">
      {error && <ErrorState error={error} className="mb-6" />}
      <div className="stagger grid gap-6 lg:grid-cols-[1fr_1fr]">
        <div>
          <SectionTitle className="mb-3">Company profile</SectionTitle>
          {loading ? <Card className="p-5 space-y-3">{Array.from({ length: 6 }).map((_, i) => <Skeleton key={i} className="h-4 w-3/4" />)}</Card>
            : !company ? <EmptyState icon={<Settings size={20} />} title="No company profile" body="Create a workspace to configure it here." action={<Button href="/setup">Set up your company</Button>} />
            : (
              <Card className="px-5 py-2">
                <Row k="Name" v={p!.name} /><Row k="Website" v={p!.website} /><Row k="Description" v={p!.description} />
                <Row k="Type" v={<Chip>{p!.business_type}</Chip>} /><Row k="Stage" v={p!.stage} /><Row k="Industry" v={p!.industry} /><Row k="Geography" v={p!.geography} />
                <Row k="Scenario" v={p!.gtm_scenario} /><Row k="Revenue target" v={<span className="tnum">{money(p!.revenue_target, 0)}</span>} /><Row k="Monthly budget" v={<span className="tnum">{money(p!.monthly_budget, 0)}</span>} />
                <Row k="Channels" v={p!.current_channels.join(", ")} /><Row k="Competitors" v={p!.competitors.map((c) => c.name).filter(Boolean).join(", ")} />
                {company.missing_intake.length > 0 && <Row k="Missing" v={<span className="text-[#9A5B00]">{company.missing_intake.map((m) => m.field).join(", ")} — the agents will ask for these in chat</span>} />}
              </Card>
            )}
        </div>
        <div className="space-y-6">
          <div>
            <SectionTitle className="mb-3">Models & budgets</SectionTitle>
            <Card className="px-5 py-2">
              <Row k="API" v={<span className="flex min-w-0 flex-wrap items-center gap-2"><StatusDot status={health.data?.ok ? "connected" : "error"} className="ix-dot" /> {health.data?.ok ? "Reachable" : health.error ? "Unreachable" : "Checking…"} <span className="break-all text-muted">{API_BASE}</span></span>} />
              <Row k="Anthropic" v={health.data ? (health.data.anthropic_connected ? "Connected" : "Not configured") : "—"} />
              <Row k="Agent mode" v={health.data ? <ModeBadge fake={!!health.data.fake_agents} /> : "—"} />
              {health.data && Object.entries(health.data).filter(([k]) => !["ok", "fake_agents", "anthropic_connected"].includes(k)).map(([k, v]) => <Row key={k} k={k.replace(/_/g, " ")} v={String(v)} />)}
            </Card>
            <p className="mt-2 text-[12.5px] text-muted-strong-strong">Change models, per-stage budgets and keys in <code className="rounded bg-ground px-1">backend/.env</code>.</p>
          </div>
          <div>
            <SectionTitle className="mb-3">Danger zone</SectionTitle>
            <Card className="!border-danger/40 p-5">
              <p className="text-[13px] text-muted-strong">Deleting a workspace removes its runs, tasks and deliverables. Not available from the UI yet — delete <code className="rounded bg-ground px-1">backend/growthpilot.db</code> to start over.</p>
              <Button variant="secondary" size="sm" className="mt-3" disabled>Delete workspace</Button>
            </Card>
          </div>
        </div>
      </div>
      </div>
    </>
  );
}
