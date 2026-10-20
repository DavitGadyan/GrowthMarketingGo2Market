"use client";

import type { InputHTMLAttributes, ReactNode, SelectHTMLAttributes, TextareaHTMLAttributes } from "react";
import { X } from "lucide-react";
import "@/components/viz/interact.css";

export function SegmentedControl<T extends string>({ options, value, onChange, ariaLabel }: { options: { value: T; label: string }[]; value: T; onChange: (v: T) => void; ariaLabel: string }) {
  return (
    <div className="seg" role="group" aria-label={ariaLabel}>
      {options.map((o) => (
        <button key={o.value} type="button" aria-pressed={value === o.value} onClick={() => onChange(o.value)}>
          {o.label}
        </button>
      ))}
    </div>
  );
}

export function Toggle({ checked, onChange, label, description, disabled = false }: { checked: boolean; onChange: (v: boolean) => void; label: string; description?: string; disabled?: boolean }) {
  return (
    <label className={`flex items-center gap-3 ${disabled ? "cursor-not-allowed" : "cursor-pointer"}`}>
      <button type="button" role="switch" aria-checked={checked} className="toggle ix-toggle" onClick={() => !disabled && onChange(!checked)} onKeyDown={(e) => { if (e.key === " " || e.key === "Enter") { e.preventDefault(); if (!disabled) onChange(!checked); } }} aria-label={label} disabled={disabled} />
      <span>
        <span className="block text-[14px]">{label}</span>
        {description && <span className="block text-[12.5px] text-muted-strong-strong">{description}</span>}
      </span>
    </label>
  );
}

export function Field({ label, hint, children, className = "", full = false }: { label: string; hint?: string; children: ReactNode; className?: string; full?: boolean }) {
  return (
    <label className={`block ${full ? "md:col-span-2" : ""} ${className}`}>
      <span className="mb-1.5 block text-[13px] font-medium text-ink/85">{label}</span>
      {children}
      {hint && <span className="mt-1 block text-[12.5px] text-muted-strong-strong">{hint}</span>}
    </label>
  );
}

export function Input(props: InputHTMLAttributes<HTMLInputElement>) {
  return <input {...props} className={`input ${props.className ?? ""}`} />;
}

export function Textarea(props: TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return <textarea {...props} className={`input ${props.className ?? ""}`} />;
}

export function Select({ children, ...props }: SelectHTMLAttributes<HTMLSelectElement> & { children: ReactNode }) {
  return (
    <select {...props} className={`input ${props.className ?? ""}`}>
      {children}
    </select>
  );
}

/** Chip list editor: type + Enter to add, click × to remove. */
export function ChipInput({ values, onChange, placeholder, suggestions = [] }: { values: string[]; onChange: (v: string[]) => void; placeholder?: string; suggestions?: string[] }) {
  const add = (raw: string) => {
    const v = raw.trim();
    if (!v || values.includes(v)) return;
    onChange([...values, v]);
  };
  const remaining = suggestions.filter((s) => !values.includes(s));
  return (
    <div>
      <div className="flex min-h-[40px] flex-wrap items-center gap-2 rounded-[10px] border border-black/[0.12] bg-surface px-2 py-1.5 focus-within:border-accent focus-within:shadow-[0_0_0_3px_#E6F7F1]">
        {values.map((v) => (
          <span key={v} className="chip" style={{ background: "#E6F7F1", color: "#0B7A55" }}>
            {v}
            <button type="button" aria-label={`Remove ${v}`} className="ml-0.5 grid h-4 w-4 place-items-center rounded-full hover:bg-black/10" onClick={() => onChange(values.filter((x) => x !== v))}>
              <X size={10} />
            </button>
          </span>
        ))}
        <input
          className="min-w-[120px] flex-1 bg-transparent text-[14px] outline-none placeholder:text-muted/90"
          placeholder={placeholder}
          onKeyDown={(e) => {
            if (e.key === "Enter" || e.key === ",") {
              e.preventDefault();
              add((e.target as HTMLInputElement).value);
              (e.target as HTMLInputElement).value = "";
            }
          }}
          onBlur={(e) => {
            add(e.target.value);
            e.target.value = "";
          }}
        />
      </div>
      {remaining.length > 0 && (
        <div className="mt-2 flex flex-wrap gap-1.5">
          {remaining.map((s) => (
            <button key={s} type="button" className="chip border border-black/10 bg-surface text-muted hover:border-black/25 hover:text-ink" onClick={() => add(s)}>
              + {s}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
