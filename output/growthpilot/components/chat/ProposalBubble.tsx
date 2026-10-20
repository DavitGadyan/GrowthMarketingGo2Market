"use client";

import { useState } from "react";
import { Check, Loader2, X } from "lucide-react";
import { api } from "@/lib/api";
import { agentByKey } from "@/lib/agents";
import type { Task } from "@/lib/types";
import { Avatar, Pill } from "@/components/viz/Avatar";
import { Bubble } from "./Bubble";

/**
 * Compact proposal rows inside an agent bubble: avatar, title, cost, approve /
 * reject. An approved row slides out and a one-line "Approved - running"
 * confirmation takes its place; nothing runs until that click.
 */
export function ProposalBubble({ tasks, onChange, grouped = false, animate = true }: { tasks: Task[]; onChange: (t: Task) => void; grouped?: boolean; animate?: boolean }) {
  const [busy, setBusy] = useState<number | null>(null);
  const [leaving, setLeaving] = useState<Record<number, boolean>>({});
  const [decided, setDecided] = useState<Record<number, "approved" | "rejected">>({});
  const [err, setErr] = useState<string | null>(null);
  if (!tasks.length) return null;

  const act = async (t: Task, kind: "approve" | "reject") => {
    setBusy(t.id);
    setErr(null);
    try {
      const updated = kind === "approve" ? await api.tasks.approve(t.id) : await api.tasks.reject(t.id);
      setLeaving((l) => ({ ...l, [t.id]: true }));
      window.setTimeout(() => {
        setDecided((d) => ({ ...d, [t.id]: kind === "approve" ? "approved" : "rejected" }));
        onChange(updated);
      }, 200);
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(null);
    }
  };

  const open = tasks.filter((t) => t.status === "proposed" || t.status === "blocked" || decided[t.id]);
  if (!open.length) return null;

  return (
    <Bubble role="agent" grouped={grouped} animate={animate} wide>
      <div className="-mx-1 text-[14px]">
        <div className="mb-1 px-1 text-[12.5px] text-muted-strong">Proposed - nothing runs until you approve it</div>
        <ul className="divide-y divide-black/[0.05]">
          {open.map((t) => {
            const a = agentByKey(t.agent);
            const done = decided[t.id];
            if (done) {
              return (
                <li key={t.id} className="toast-in flex items-center gap-2 px-1 py-2 text-[13px]">
                  <span className={`grid h-5 w-5 place-items-center rounded-full ${done === "approved" ? "bg-tint-accent text-accent" : "bg-ground text-muted-strong"}`}>
                    {done === "approved" ? <Check size={12} /> : <X size={12} />}
                  </span>
                  <span className="truncate">{t.title}</span>
                  <span className="ml-auto flex-none text-muted-strong">{done === "approved" ? "Approved - running" : "Rejected"}</span>
                </li>
              );
            }
            const isBusy = busy === t.id;
            return (
              <li key={t.id} className={`flex flex-wrap items-center gap-x-2.5 gap-y-1.5 px-1 py-2 ${leaving[t.id] ? "task-row-out" : ""}`}>
                <span className="flex min-w-0 basis-full items-center gap-2.5 sm:flex-1 sm:basis-auto">
                  <Avatar name={a?.name ?? t.agent} size={24} />
                  <span className="min-w-0 flex-1 truncate" title={t.description || t.title}>{t.title}</span>
                </span>
                {t.estimated_cost && <span className="hidden sm:inline-flex"><Pill tone="muted">{t.estimated_cost}</Pill></span>}
                {t.status === "blocked" ? (
                  <Pill tone="warn" className="ml-auto flex-none sm:ml-0">needs {t.integration ?? "integration"}</Pill>
                ) : (
                  <span className="ml-auto flex flex-none items-center gap-1.5 sm:ml-0">
                    <button type="button" title="Approve" aria-label={`Approve ${t.title}`} disabled={isBusy}
                      className="grid h-8 w-8 place-items-center rounded-full bg-accent text-white transition-colors hover:bg-[#0EA371] disabled:opacity-50"
                      onClick={() => act(t, "approve")}>
                      {isBusy ? <Loader2 size={14} className="animate-spin" /> : <Check size={14} />}
                    </button>
                    <button type="button" title="Reject" aria-label={`Reject ${t.title}`} disabled={isBusy}
                      className="grid h-8 w-8 place-items-center rounded-full text-muted-strong transition-colors hover:bg-ground hover:text-ink disabled:opacity-50"
                      onClick={() => act(t, "reject")}>
                      <X size={14} />
                    </button>
                  </span>
                )}
              </li>
            );
          })}
        </ul>
        {err && <div className="toast-in px-1 pt-2 text-[12.5px] text-danger" role="alert">{err}</div>}
      </div>
    </Bubble>
  );
}
