"use client";

export type FollowUp = { label: string; send: string; primary?: boolean };

/** Derive the "say yes" chip from the agent's closing question, then the three standing shortcuts. */
export function followUpsFor(text: string): FollowUp[] {
  const sentences = text.replace(/\s+/g, " ").trim().split(/(?<=[.?!])\s+/);
  const question = [...sentences].reverse().find((s) => /\?$/.test(s.trim()))?.trim();
  const out: FollowUp[] = [];
  if (question && /(?:Want me to|Shall I|Should I|Re-run)[^?]*\?$/i.test(question)) {
    out.push({ label: "Yes, do it", send: /draft|ads|write|queue/i.test(question) ? "propose" : `Yes - ${question}`, primary: true });
  }
  out.push({ label: "Status", send: "Status" }, { label: "Risks", send: "Risks" }, { label: "Channels", send: "Channels" });
  return out;
}

export function FollowUpChips({ chips, disabled, onSend, className = "" }: { chips: FollowUp[]; disabled?: boolean; onSend: (text: string) => void; className?: string }) {
  if (!chips.length) return null;
  return (
    <div className={`chip-row flex flex-wrap gap-2 ${className}`} role="group" aria-label="Suggested replies">
      {chips.map((c) => (
        <button key={c.label + c.send} type="button" className={`chip chip-lg ${c.primary ? "is-primary" : ""}`} disabled={disabled} onClick={() => onSend(c.send)}>
          {c.label}
        </button>
      ))}
    </div>
  );
}
