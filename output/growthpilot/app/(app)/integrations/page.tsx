"use client";

import { useState } from "react";
import { Bot, Globe, Image, Mail, Plug, Loader2, RefreshCw, Check } from "lucide-react";
import { api, ApiError } from "@/lib/api";
import { useIntegrations } from "@/lib/hooks";
import type { Integration, IntegrationName } from "@/lib/types";
import { TopBar } from "@/components/shell/TopBar";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Field, Input } from "@/components/ui/Controls";
import { StatusDot } from "@/components/ui/Chip";
import { EmptyState, ErrorState, InlineError, Skeleton } from "@/components/ui/States";
import { NoteBox, StepperModal } from "@/components/ui/StepperModal";
import "@/components/viz/interact.css";

const META: Record<IntegrationName, { title: string; icon: typeof Bot; blurb: string; env: string[]; fields: { key: string; label: string; placeholder?: string }[] }> = {
  anthropic: { title: "Anthropic", icon: Bot, blurb: "Runs every agent through the Claude Agent SDK.", env: ["ANTHROPIC_API_KEY (or `claude` CLI login)"], fields: [{ key: "strategy_model", label: "Strategy model", placeholder: "claude-opus-5-5" }, { key: "content_model", label: "Content model", placeholder: "claude-sonnet-5-5" }] },
  firecrawl: { title: "Firecrawl", icon: Globe, blurb: "Deeper competitor and market scraping for the Research Agent.", env: ["FIRECRAWL_API_KEY"], fields: [{ key: "max_pages_per_run", label: "Max pages per run", placeholder: "40" }] },
  gmail: { title: "Gmail", icon: Mail, blurb: "Outreach sequences land as drafts in your mailbox. Nothing is sent automatically.", env: ["GOOGLE_OAUTH_CLIENT_ID", "GOOGLE_OAUTH_CLIENT_SECRET", "GOOGLE_OAUTH_REFRESH_TOKEN"], fields: [{ key: "from_name", label: "From name" }, { key: "signature", label: "Signature" }] },
  higgsfield: { title: "Higgsfield", icon: Image, blurb: "Image and video ad creatives. The Creative Agent quotes credits before generating.", env: ["HIGGSFIELD_API_KEY", "HIGGSFIELD_API_SECRET"], fields: [{ key: "default_aspect_ratio", label: "Default aspect ratio", placeholder: "1:1" }, { key: "max_credits_per_task", label: "Max credits per task", placeholder: "50" }] },
};
const ORDER: IntegrationName[] = ["anthropic", "firecrawl", "gmail", "higgsfield"];

export default function IntegrationsPage() {
  const list = useIntegrations();
  const [editing, setEditing] = useState<Integration | null>(null);
  const [config, setConfig] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [err, setErr] = useState<ApiError | null>(null);
  const [testing, setTesting] = useState<IntegrationName | null>(null);
  const [tested, setTested] = useState<{ name: IntegrationName; ok: boolean } | null>(null);

  const open = (i: Integration) => {
    setEditing(i);
    setErr(null);
    setSaved(false);
    setConfig(Object.fromEntries(Object.entries(i.config).map(([k, v]) => [k, String(v ?? "")])));
  };
  const save = async () => {
    if (!editing) return;
    setSaving(true);
    setErr(null);
    try {
      const updated = await api.integrations.update(editing.name, config);
      list.setData((prev) => (prev ?? []).map((x) => (x.name === updated.name ? updated : x)));
      setSaved(true);
      setTimeout(() => { setEditing(null); setSaved(false); list.reload(); }, 900);
    } catch (e) {
      setErr(e instanceof ApiError ? e : new ApiError(0, String(e)));
    } finally {
      setSaving(false);
    }
  };
  const test = async (name: IntegrationName) => {
    setTesting(name);
    setTested(null);
    const started = Date.now();
    try {
      const fresh = await api.integrations.list();
      list.setData(fresh);
      const ok = !!fresh.find((i) => i.name === name)?.connected;
      await new Promise((r) => setTimeout(r, Math.max(0, 600 - (Date.now() - started))));
      setTested({ name, ok });
      setTimeout(() => setTested((t) => (t?.name === name ? null : t)), 2200);
    } catch {
      setTested({ name, ok: false });
    } finally {
      setTesting(null);
    }
  };

  const items = ORDER.map((name) => list.data?.find((i) => i.name === name) ?? { name, connected: false, detail: "Backend not reachable", config: {} });

  return (
    <>
      <TopBar title="Integrations" subtitle="Secrets stay in backend/.env; this page stores the non-secret settings and shows what is connected." />
      <div className="p-6 md:p-8">
      {list.error && <ErrorState error={list.error} retry={list.reload} className="mb-6" />}
      {list.loading ? (
        <div className="grid gap-4 md:grid-cols-2">{ORDER.map((k) => <Card key={k} className="p-5"><Skeleton className="h-5 w-32" /><Skeleton className="mt-3 h-10" /></Card>)}</div>
      ) : !list.data && !list.error ? (
        <EmptyState icon={<Plug size={20} />} title="No integrations reported" body="The backend did not return any integration status." />
      ) : (
        <div className="stagger grid gap-4 md:grid-cols-2">
          {items.map((i) => {
            const m = META[i.name];
            const Icon = m.icon;
            const isTesting = testing === i.name;
            const result = tested?.name === i.name ? tested : null;
            return (
              <Card key={i.name} className="interactive flex flex-col p-5">
                <div className="flex items-start justify-between gap-3">
                  <div className="flex items-center gap-3">
                    <span className="grid h-10 w-10 place-items-center rounded-full bg-tint-accent text-accent"><Icon size={18} /></span>
                    <div><div className="font-display text-[17px] font-medium">{m.title}</div><div className="text-[12.5px] text-muted-strong-strong">{m.blurb}</div></div>
                  </div>
                  <span className="flex flex-none items-center gap-1.5 text-[12.5px] text-muted-strong-strong" aria-live="polite">
                    {isTesting ? <span className="ix-pulse"><StatusDot status={i.connected ? "connected" : "idle"} className="ix-dot" /></span> : <StatusDot status={i.connected ? "connected" : "idle"} className="ix-dot" />}
                    {isTesting ? "Testing…" : i.connected ? "Connected" : "Not connected"}
                  </span>
                </div>
                <p className="mt-3 text-[14px] text-ink/85">{i.detail}</p>
                <div className="mt-3 text-[12.5px] text-muted-strong-strong">Env: {m.env.join(", ")}</div>
                <div className="mt-4 flex flex-wrap items-center gap-2">
                  <Button size="sm" variant={i.connected ? "secondary" : "primary"} onClick={() => open(i)} disabled={!list.data}>{i.connected ? "Configure" : "Connect"}</Button>
                  <Button size="sm" variant="ghost" onClick={() => test(i.name)} disabled={!list.data || isTesting}>{isTesting ? <Loader2 size={14} className="animate-spin" /> : <RefreshCw size={14} />} Test connection</Button>
                  {result && <span className={`toast-in flex items-center gap-1.5 text-[12.5px] ${result.ok ? "text-[#1F8B4C]" : "text-[#B86A00]"}`}>{result.ok ? <Check size={14} /> : null}{result.ok ? "Connected" : "Not connected - check backend/.env"}</span>}
                </div>
              </Card>
            );
          })}
        </div>
      )}
      </div>

      {editing && (
        <StepperModal title={`Connect ${META[editing.name].title}`} onClose={() => setEditing(null)} footer={<><Button variant="secondary" className="flex-1" onClick={() => setEditing(null)} disabled={saving}>Back</Button><Button className="flex-1" onClick={save} disabled={saving || saved}>{saving && <Loader2 size={16} className="animate-spin" />}{saved ? <><Check size={16} /> Saved</> : "Save"}</Button></>}>
          <div className="grid gap-4 md:grid-cols-2">
            {META[editing.name].fields.map((f) => (
              <Field key={f.key} label={f.label}><Input value={config[f.key] ?? ""} placeholder={f.placeholder} onChange={(e) => setConfig({ ...config, [f.key]: e.target.value })} /></Field>
            ))}
            <div className="md:col-span-2">
              <NoteBox title="Secrets are not stored here">Add {META[editing.name].env.join(", ")} to <code className="rounded bg-ground px-1">backend/.env</code> and restart the backend. The status above updates on the next load.</NoteBox>
            </div>
            {saved && <div className="toast-in text-[13px] text-[#1F8B4C] md:col-span-2" role="status">Saved - refreshing status…</div>}
            <div className="md:col-span-2"><InlineError error={err} /></div>
          </div>
        </StepperModal>
      )}
    </>
  );
}
