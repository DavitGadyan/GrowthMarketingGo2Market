"use client";

import { Suspense, useState } from "react";
import { useSearchParams } from "next/navigation";
import { Bot, MessageSquare } from "lucide-react";
import { useCompany, useRuns, useRunStream } from "@/lib/hooks";
import { AGENTS, agentStatus, lastActivity } from "@/lib/agents";
import { STAGES } from "@/lib/stages";
import { relTime } from "@/lib/format";
import { TopBar } from "@/components/shell/TopBar";
import { Card } from "@/components/ui/Card";
import { Chip, STATUS_TONE, StatusDot } from "@/components/ui/Chip";
import { Button } from "@/components/ui/Button";
import { EmptyState, ErrorState, Skeleton } from "@/components/ui/States";
import { Table, Td } from "@/components/ui/Table";
import { Avatar } from "@/components/viz/Avatar";
import "@/components/viz/interact.css";

function AgentsScreen() {
  const params = useSearchParams();
  const tab = params.get("tab") === "stages" ? "stages" : "agents";
  const { company, loading: cLoading, error: cError } = useCompany();
  const runs = useRuns(company?.id, !!company);
  const latest = runs.data?.[0] ?? null;
  const stream = useRunStream(latest?.id);
  const error = cError ?? runs.error ?? stream.error;
  const [hotAgent, setHotAgent] = useState<string | null>(null);

  const stageRows = STAGES.map((s) => {
    const r = stream.stages.find((x) => x.key === s.key);
    return { ...s, status: r?.status ?? "pending", summary: r?.summary ?? "", cost: r?.cost_usd ?? 0 };
  });
  const done = stageRows.filter((s) => s.status === "completed").length;
  const running = stageRows.find((s) => s.status === "running");

  return (
    <>
      <TopBar
        title="Agents"
        tabs={[{ label: "Agents", href: "/agents", active: tab === "agents" }, { label: "Stages", href: "/agents?tab=stages", active: tab === "stages" }]}
        actions={<>
          <span className="hidden text-[13px] text-muted-strong md:inline">{latest ? `Run #${latest.id} · ${latest.status} · $${latest.cost_usd.toFixed(2)}` : "No run yet"}</span>
          <Button href="/chat"><MessageSquare size={16} /> Open chat</Button>
        </>}
      />
      {latest && (
        <div className="border-b border-black/[0.06] bg-surface px-6 py-3 md:px-8" aria-label="Run progress">
          <div className="mb-2 flex items-center justify-between text-[12.5px] text-muted-strong">
            <span className="tnum">{done}/{stageRows.length} stages{running ? ` · running: ${running.title}` : latest.status === "completed" ? " · completed" : ""}</span>
            <span className="hidden sm:inline">{hotAgent ? `${AGENTS.find((a) => a.key === hotAgent)?.name ?? hotAgent} stages highlighted` : "Hover an agent to see its stages"}</span>
          </div>
          <div className="ix-progress" role="progressbar" aria-valuemin={0} aria-valuemax={stageRows.length} aria-valuenow={done}>
            {stageRows.map((s) => <span key={s.key} className={`ix-seg${hotAgent && s.agent !== hotAgent ? " is-dim" : ""}`} data-status={s.status} title={`${s.number}. ${s.title} · ${s.status}`} />)}
          </div>
        </div>
      )}
      <div className="p-6 md:p-8">
        {error && <ErrorState error={error} retry={runs.reload} className="mb-6" />}

        {cLoading ? (
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">{Array.from({ length: 6 }).map((_, i) => <Card key={i} className="p-5"><Skeleton className="h-5 w-36" /><Skeleton className="mt-3 h-10 w-full" /></Card>)}</div>
        ) : !company && !error ? (
          <EmptyState icon={<Bot size={20} />} title="No workspace yet" body="Agents attach to a company profile. Create one and the Research Agent starts immediately." action={<Button href="/setup">Set up your company</Button>} />
        ) : tab === "agents" ? (
          <div className="stagger grid gap-4 md:grid-cols-2 xl:grid-cols-3" onMouseLeave={() => setHotAgent(null)}>
            {AGENTS.map((a) => {
              const status = agentStatus(a, stream.run ?? latest, stream.tasks);
              const last = lastActivity(a, stream.events);
              const Icon = a.icon;
              return (
                <Card key={a.key} className="interactive ix-ring relative p-5" data-hot={hotAgent === a.key || undefined} tabIndex={0}
                  onMouseEnter={() => setHotAgent(a.key)} onMouseLeave={() => setHotAgent(null)} onFocus={() => setHotAgent(a.key)} onBlur={() => setHotAgent(null)}>
                  <div className="flex items-start justify-between gap-3">
                    <div className="grid h-10 w-10 place-items-center rounded-full bg-tint-accent text-accent"><Icon size={18} /></div>
                    <span className="flex items-center gap-1.5 text-[12.5px] text-muted-strong-strong">
                      {status === "working" ? <span className="ix-pulse"><StatusDot status={status} /></span> : <StatusDot status={status} />}
                      {status === "working" ? "Working" : status === "connected" ? "Connected" : "Idle"}
                    </span>
                  </div>
                  <div className="mt-3 font-display text-[17px] font-medium">{a.name}</div>
                  <p className="mt-1 text-[14px] text-muted-strong">{a.blurb}</p>
                  <div className="mt-3 flex flex-wrap gap-1.5">
                    <Chip tone="accent2">{a.model}</Chip>
                    {a.tools.map((t) => <Chip key={t}>{t}</Chip>)}
                  </div>
                  <div className="rule-t mt-3 pt-3 text-[12.5px] text-muted-strong-strong">
                    {last ? <><span className="text-ink/80">{last.message}</span> · {relTime(last.ts)}</> : "No activity yet"}
                  </div>
                </Card>
              );
            })}
          </div>
        ) : (
          <>
            <div className="mb-4 flex flex-wrap items-center gap-3" onMouseLeave={() => setHotAgent(null)}>
              <span className="text-[12.5px] text-muted-strong">Owners</span>
              {AGENTS.filter((a) => STAGES.some((s) => s.agent === a.key)).map((a) => (
                <button key={a.key} type="button" className={`ix-ring flex items-center gap-2 rounded-full border border-black/[0.08] bg-surface py-1 pl-1 pr-3 text-[13px] ${hotAgent === a.key ? "bg-tint-accent" : ""}`}
                  data-hot={hotAgent === a.key || undefined} onMouseEnter={() => setHotAgent(a.key)} onFocus={() => setHotAgent(a.key)} onBlur={() => setHotAgent(null)} onClick={() => setHotAgent(hotAgent === a.key ? null : a.key)}>
                  <Avatar name={a.name} size={24} /> {a.name.replace(" Agent", "")}
                </button>
              ))}
            </div>
            <Card>
              <Table head={["#", "Stage", "Agent", "Status", "Summary", "Cost"]}>
                {stageRows.map((s) => (
                  <tr key={s.key} className={`ix-row rule-b last:border-0 ${hotAgent && s.agent !== hotAgent ? "opacity-50" : ""}`} data-hot={hotAgent === s.agent || undefined}
                    onMouseEnter={() => setHotAgent(s.agent)} onMouseLeave={() => setHotAgent(null)}>
                    <Td muted><span className="tnum">{s.number}</span></Td>
                    <Td>{s.title}</Td>
                    <Td muted className="capitalize">{s.agent}</Td>
                    <Td>{s.status === "running" ? <span className="inline-flex items-center gap-1.5"><span className="ix-pulse"><StatusDot status="running" /></span><Chip tone={STATUS_TONE[s.status] ?? "muted"}>{s.status}</Chip></span> : <Chip tone={STATUS_TONE[s.status] ?? "muted"}>{s.status}</Chip>}</Td>
                    <Td muted className="max-w-[460px]">{s.summary || "—"}</Td>
                    <Td muted><span className="tnum">{s.cost ? `$${s.cost.toFixed(2)}` : "—"}</span></Td>
                  </tr>
                ))}
              </Table>
            </Card>
          </>
        )}
      </div>
    </>
  );
}

export default function AgentsPage() {
  return (
    <Suspense fallback={<div className="p-8"><Skeleton className="h-96" /></div>}>
      <AgentsScreen />
    </Suspense>
  );
}
