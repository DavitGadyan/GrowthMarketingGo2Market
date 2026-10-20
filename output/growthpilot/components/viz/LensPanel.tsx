"use client";

import { useState } from "react";
import { RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { api } from "@/lib/api";
import type { Review } from "@/lib/types";
import { Pill } from "./Avatar";
import { LENS_LABEL, LENS_ORDER, VERDICT_COLOR, VERDICT_TONE } from "./Gauge";

const PRIO: Record<string, number> = { critical: 0, high: 1, medium: 2, low: 3 };
const PRIO_TONE: Record<string, "danger" | "warn" | "accent2" | "muted"> = { critical: "danger", high: "warn", medium: "accent2", low: "muted" };

/** The three review lenses with the selected one expanded, the top recommendations, and a re-run action. */
export function LensPanel({ review, selected, onSelect, companyId }: { review: Review; selected: string | null; onSelect: (lens: string | null) => void; companyId: number }) {
  const [more, setMore] = useState(false);
  const [asked, setAsked] = useState<"idle" | "sent" | "error">("idle");
  const recs = [...review.recommendations].sort((a, b) => (PRIO[a.priority] ?? 9) - (PRIO[b.priority] ?? 9));
  const shown = more ? recs : recs.slice(0, 3);

  const rerun = async () => {
    try {
      const res = await api.chat.send(companyId, "Re-run the review stage");
      // Drain the stream in the background so the server finishes; the chat page shows the reply.
      void res.body?.pipeTo(new WritableStream()).catch(() => undefined);
      setAsked("sent");
    } catch {
      setAsked("error");
    }
  };

  return (
    <div className="content-enter mt-5 rounded-[12px] border border-black/[0.08] bg-ground/60 p-4" role="region" aria-label="Three-lens review">
      <ul className="stagger space-y-1.5">
        {LENS_ORDER.map((key) => {
          const l = review.lenses.find((x) => x.lens === key);
          const open = selected === key;
          return (
            <li key={key}>
              <button type="button" aria-expanded={open} onClick={() => onSelect(open ? null : key)}
                className="row-hover flex w-full items-center gap-3 rounded-[8px] px-2 py-2 text-left text-[14px]">
                <span className="h-2.5 w-2.5 flex-none rounded-full" style={{ background: l ? VERDICT_COLOR[l.verdict] : "rgba(0,0,0,.12)" }} />
                <span className="min-w-0 flex-1 truncate">{LENS_LABEL[key]}</span>
                {l ? <Pill tone={VERDICT_TONE[l.verdict]}>{l.verdict}</Pill> : <Pill tone="muted">n/a</Pill>}
              </button>
              {open && l && (
                <div className="content-enter px-2 pb-2 pl-[26px] text-[13px] leading-5">
                  <p className="text-ink/90">{l.finding}</p>
                  {l.fix && l.fix.toLowerCase() !== "none" && <p className="mt-1 text-muted-strong"><span className="font-medium text-ink">Fix:</span> {l.fix}</p>}
                </div>
              )}
            </li>
          );
        })}
      </ul>
      <div className="t-caps mt-4 px-2">Recommendations</div>
      <ul className="stagger mt-2 space-y-1">
        {shown.map((r) => (
          <li key={r.title} className="row-hover flex items-center gap-2 rounded-[8px] px-2 py-1.5 text-[14px]" title={r.detail}>
            <Pill tone={PRIO_TONE[r.priority] ?? "muted"}>{r.priority}</Pill>
            <span className="min-w-0 flex-1 truncate">{r.title}</span>
            <Pill tone="muted">{r.horizon}</Pill>
          </li>
        ))}
      </ul>
      {recs.length > 3 && (
        <button type="button" className="btn-link mt-1 !h-8 !px-2 text-[13px]" onClick={() => setMore((v) => !v)} aria-expanded={more}>
          {more ? "Show fewer" : `+${recs.length - 3} more`}
        </button>
      )}
      <div className="mt-3 flex items-center gap-3">
        <Button variant="ghost" size="sm" onClick={rerun} disabled={asked === "sent"}><RefreshCw size={14} /> Re-run review</Button>
        {asked === "sent" && <span className="toast-in text-[13px] text-accent">Asked the Review Agent</span>}
        {asked === "error" && <span className="toast-in text-[13px] text-[#C2362B]">Could not reach the agents</span>}
      </div>
    </div>
  );
}
