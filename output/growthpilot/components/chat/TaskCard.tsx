"use client";

import { useState } from "react";
import { Check, Loader2, Play, X } from "lucide-react";
import { api } from "@/lib/api";
import { agentByKey } from "@/lib/agents";
import type { Task } from "@/lib/types";
import { Button } from "@/components/ui/Button";
import { Chip, STATUS_TONE } from "@/components/ui/Chip";
import { titleCase } from "@/lib/format";

export function TaskCard({ tasks, onChange, title = "Proposed execution tasks" }: { tasks: Task[]; onChange: (t: Task) => void; title?: string }) {
  const [busy, setBusy] = useState<number | null>(null);
  const [err, setErr] = useState<string | null>(null);
  if (!tasks.length) return null;

  const act = async (t: Task, kind: "approve" | "reject") => {
    setBusy(t.id);
    setErr(null);
    try {
      const updated = kind === "approve" ? await api.tasks.approve(t.id) : await api.tasks.reject(t.id);
      onChange(updated);
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(null);
    }
  };

  return (
    <div className="card overflow-hidden">
      <div className="rule-b flex items-center justify-between gap-3 bg-tint-accent2/60 px-4 py-3">
        <div className="text-[13px] font-medium">{title}</div>
        <span className="text-[12.5px] text-muted-strong-strong">{tasks.length} {tasks.length === 1 ? "task" : "tasks"} · nothing runs until you approve it</span>
      </div>
      <ul>
        {tasks.map((t) => {
          const a = agentByKey(t.agent);
          const Icon = a?.icon ?? Play;
          const isBusy = busy === t.id;
          return (
            <li key={t.id} className="rule-b flex flex-col gap-3 px-4 py-3 last:border-0 md:flex-row md:items-start">
              <div className="grid h-8 w-8 flex-none place-items-center rounded-full bg-tint-accent text-accent">
                <Icon size={15} />
              </div>
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-[14px] font-medium">{t.title}</span>
                  <Chip tone={STATUS_TONE[t.status] ?? "muted"}>{titleCase(t.status)}</Chip>
                  {t.integration && <Chip tone="accent2">{t.integration}</Chip>}
                </div>
                <div className="mt-1 text-[13px] text-muted-strong">{t.description}</div>
                <div className="mt-1.5 flex flex-wrap gap-x-4 text-[12.5px] text-muted-strong-strong">
                  <span>Agent: <span className="text-ink/80">{a?.name ?? t.agent}</span></span>
                  <span>Action: <span className="text-ink/80">{titleCase(t.action)}</span></span>
                  {t.estimated_cost && <span>Est. cost: <span className="text-ink/80">{t.estimated_cost}</span></span>}
                </div>
                {t.status === "blocked" && <div className="mt-1.5 text-[12px] text-[#9A5B00]">Connect {t.integration ?? "the integration"} on the Integrations page to run this.</div>}
                {t.error && <div className="mt-1.5 text-[12px] text-danger">{t.error}</div>}
              </div>
              {t.status === "proposed" && (
                <div className="flex flex-none gap-2">
                  <Button size="sm" variant="primary" disabled={isBusy} onClick={() => act(t, "approve")}>
                    {isBusy ? <Loader2 size={14} className="animate-spin" /> : <Check size={14} />} Approve
                  </Button>
                  <Button size="sm" variant="secondary" disabled={isBusy} onClick={() => act(t, "reject")}>
                    <X size={14} /> Reject
                  </Button>
                </div>
              )}
            </li>
          );
        })}
      </ul>
      {err && <div className="toast-in rule-t px-4 py-2 text-[12.5px] text-danger" role="alert">{err}</div>}
    </div>
  );
}
