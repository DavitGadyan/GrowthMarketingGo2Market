"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import { Check, X } from "lucide-react";
import { IconButton } from "./Button";

function Stepper({ steps, step }: { steps: string[]; step: number }) {
  return (
    <ol className="mx-6 mt-5 flex items-start" aria-label="Progress">
      {steps.map((label, i) => {
        const state = i < step ? "done" : i === step ? "active" : "todo";
        return (
          <li key={label} className={`flex items-start ${i < steps.length - 1 ? "flex-1" : ""}`}>
            <div className="flex flex-col items-center">
              <span
                className={`grid h-6 w-6 place-items-center rounded-full border text-[12.5px] ${
                  state === "done" ? "border-accent bg-accent text-white" : state === "active" ? "border-accent text-accent" : "border-black/15 text-muted"
                }`}
                aria-current={state === "active" ? "step" : undefined}
              >
                {state === "done" ? <Check size={12} /> : state === "active" ? <span className="h-2 w-2 rounded-full bg-accent" /> : <span className="h-1.5 w-1.5 rounded-full bg-black/20" />}
              </span>
              <span className={`mt-1.5 text-[12.5px] ${state === "active" ? "text-accent" : "text-muted"}`}>Step {i + 1}</span>
            </div>
            {i < steps.length - 1 && <span className={`mx-2 mt-3 h-px flex-1 ${i < step ? "bg-accent" : "bg-black/10"}`} />}
          </li>
        );
      })}
    </ol>
  );
}

export function StepperModal({
  title,
  steps = [],
  step = 0,
  stepTitle,
  onClose,
  children,
  footer,
  width = 560,
}: {
  title: string;
  steps?: string[];
  step?: number;
  stepTitle?: string;
  onClose: () => void;
  children: ReactNode;
  footer: ReactNode;
  width?: number;
}) {
  // The step heading lives outside the scroll body, so a scroll position left
  // over from the previous step would hide the next step's first labels.
  const bodyRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    bodyRef.current?.scrollTo({ top: 0 });
  }, [step]);

  // Exit mirrors the entrance: hold the panel 180ms in its closing state, then unmount.
  const [closing, setClosing] = useState(false);
  const requestClose = () => {
    if (closing) return;
    setClosing(true);
    setTimeout(onClose, 180);
  };
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && requestClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [onClose, closing]);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 md:pl-[calc(var(--rail)+16px)]" role="dialog" aria-modal="true" aria-labelledby="modal-title">
      <button type="button" aria-label="Close dialog" className="modal-backdrop absolute inset-0 cursor-default bg-ink/25 backdrop-blur-[2px]" data-closing={closing || undefined} onClick={requestClose} />
      <div className="modal-panel relative w-full overflow-hidden rounded-[16px] bg-surface shadow-[var(--shadow-pop)]" data-closing={closing || undefined} style={{ maxWidth: width }}>
        <div className="flex items-center justify-between px-6 pt-5">
          <h2 id="modal-title" className="font-display text-[22px] font-medium">{title}</h2>
          <IconButton label="Close" onClick={requestClose}><X size={18} /></IconButton>
        </div>
        {steps.length > 1 && <Stepper steps={steps} step={step} />}
        {stepTitle && <h3 className="mx-6 mt-5 font-display text-[18px] font-medium">{stepTitle}</h3>}
        <div
          ref={bodyRef}
          className="scroll-thin modal-body max-h-[calc(100vh-300px)] px-6 pb-6 pt-4"
          style={{ maskImage: "linear-gradient(to bottom, #000 calc(100% - 28px), transparent)", WebkitMaskImage: "linear-gradient(to bottom, #000 calc(100% - 28px), transparent)" }}
        >
          {children}
        </div>
        <div className="rule-t flex gap-3 px-6 pb-6 pt-4">{footer}</div>
      </div>
    </div>
  );
}

export function NoteBox({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className="mt-4 rounded-[10px] bg-tint-accent px-4 py-3 text-[13px]">
      <div className="font-medium text-[#0B7A55]">{title}</div>
      <div className="mt-0.5 text-ink/80">{children}</div>
    </div>
  );
}
