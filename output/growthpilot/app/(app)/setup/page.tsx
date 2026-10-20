"use client";

import { Suspense, useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Loader2, Plus, Trash2 } from "lucide-react";
import { api, ApiError } from "@/lib/api";
import { emptyProfile, type CompanyProfile, type Competitor } from "@/lib/types";
import { TopBar } from "@/components/shell/TopBar";
import { Card } from "@/components/ui/Card";
import { Button, IconButton } from "@/components/ui/Button";
import { ChipInput, Field, Input, Select, Textarea, Toggle } from "@/components/ui/Controls";
import { NoteBox, StepperModal } from "@/components/ui/StepperModal";
import { InlineError, Skeleton } from "@/components/ui/States";

const STEPS = ["Company & product", "Market & competitors", "Goals, budget & resources"];
const CHANNEL_SUGGESTIONS = ["Organic search", "Paid search", "LinkedIn", "Content", "Email", "Partnerships", "Events", "Product-led", "Outbound sales"];
const STACK_SUGGESTIONS = ["HubSpot", "Salesforce", "Google Analytics", "Segment", "Webflow", "Mailchimp", "Notion"];

function SettingsBackdrop() {
  return (
    <div aria-hidden className="pointer-events-none select-none opacity-70">
      <TopBar title="Settings" subtitle="Workspace, models and budgets" />
      <div className="grid gap-4 p-6 md:grid-cols-[1fr_2fr] md:p-8">
        <Card className="space-y-3 p-5">{Array.from({ length: 7 }).map((_, i) => <Skeleton key={i} className="h-4 w-[70%]" />)}</Card>
        <Card className="space-y-4 p-5">
          <Skeleton className="h-5 w-48" />
          <div className="grid gap-3 md:grid-cols-2">{Array.from({ length: 6 }).map((_, i) => <Skeleton key={i} className="h-10 w-full" />)}</div>
          <div className="flex gap-3"><Skeleton className="h-10 w-32" /><Skeleton className="h-10 w-32" /></div>
        </Card>
      </div>
    </div>
  );
}

function num(v: string): number | null {
  if (v.trim() === "") return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

function SetupForm() {
  const router = useRouter();
  const params = useSearchParams();
  const companyId = Number(params.get("company")) || null;
  const [step, setStep] = useState(0);
  const [p, setP] = useState<CompanyProfile>(() => ({
    ...emptyProfile(),
    name: params.get("name") ?? "",
    website: params.get("website") ?? "",
    description: params.get("description") ?? "",
  }));
  const [loading, setLoading] = useState(!!companyId);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<ApiError | null>(null);
  const set = <K extends keyof CompanyProfile>(k: K, v: CompanyProfile[K]) => setP((prev) => ({ ...prev, [k]: v }));
  const setMetric = (k: keyof CompanyProfile["known_metrics"], v: string) => setP((prev) => ({ ...prev, known_metrics: { ...prev.known_metrics, [k]: num(v) } }));

  useEffect(() => {
    if (!companyId) return;
    let alive = true;
    api.companies.get(companyId)
      .then((c) => alive && setP({ ...emptyProfile(), ...c.profile }))
      .catch((e) => alive && setError(e instanceof ApiError ? e : new ApiError(0, String(e))))
      .finally(() => alive && setLoading(false));
    return () => { alive = false; };
  }, [companyId]);

  const stepValid = useMemo(() => {
    if (step === 0) return p.name.trim().length > 1 && p.description.trim().length > 3;
    return true;
  }, [step, p]);

  const close = () => router.push(companyId ? "/settings" : "/");

  const submit = async () => {
    setSaving(true);
    setError(null);
    try {
      const company = companyId ? await api.companies.update(companyId, p) : await api.companies.create(p);
      if (companyId) {
        router.push("/settings");
        return;
      }
      const run = await api.runs.create(company.id);
      router.push(`/chat?run=${run.id}`);
    } catch (e) {
      setError(e instanceof ApiError ? e : new ApiError(0, String(e)));
      setSaving(false);
    }
  };

  const competitors = p.competitors;
  const setComp = (i: number, patch: Partial<Competitor>) => set("competitors", competitors.map((c, j) => (j === i ? { ...c, ...patch } : c)));

  const footer = (
    <>
      <Button variant="secondary" className="flex-1" onClick={() => (step === 0 ? close() : setStep(step - 1))} disabled={saving}>
        {step === 0 ? "Cancel" : "Back"}
      </Button>
      {step < STEPS.length - 1 ? (
        <Button className="flex-1" onClick={() => setStep(step + 1)} disabled={!stepValid || loading}>Next</Button>
      ) : (
        <Button className="flex-1" onClick={submit} disabled={saving || loading}>
          {saving && <Loader2 size={16} className="animate-spin" />}
          {companyId ? "Save changes" : "Create workspace & start run"}
        </Button>
      )}
    </>
  );

  return (
    <>
      <SettingsBackdrop />
      <StepperModal title={companyId ? "Edit company profile" : "Set up your company"} steps={STEPS} step={step} stepTitle={`Step ${step + 1}: ${STEPS[step]}`} onClose={close} footer={footer}>
        {loading ? (
          <div className="grid gap-3 md:grid-cols-2">{Array.from({ length: 6 }).map((_, i) => <Skeleton key={i} className="h-10" />)}</div>
        ) : (
          <div className="grid gap-4 md:grid-cols-2">
            {step === 0 && (
              <>
                <Field label="Company name"><Input value={p.name} onChange={(e) => set("name", e.target.value)} placeholder="Acme Analytics" autoFocus /></Field>
                <Field label="Website"><Input value={p.website} onChange={(e) => set("website", e.target.value)} placeholder="https://acme.example" /></Field>
                <Field label="What does the company do?" full><Textarea value={p.description} onChange={(e) => set("description", e.target.value)} placeholder="Two or three sentences in plain language." /></Field>
                <Field label="Stage">
                  <Select value={p.stage} onChange={(e) => set("stage", e.target.value as CompanyProfile["stage"])}>
                    <option value="idea">Idea</option><option value="startup">Startup</option><option value="growth">Growth</option><option value="mature">Mature</option>
                  </Select>
                </Field>
                <Field label="Business type">
                  <Select value={p.business_type} onChange={(e) => set("business_type", e.target.value as CompanyProfile["business_type"])}>
                    {["B2B", "B2C", "B2G", "B2P", "B2D", "platform"].map((v) => <option key={v} value={v}>{v}</option>)}
                  </Select>
                </Field>
                <Field label="Product name"><Input value={p.product_name} onChange={(e) => set("product_name", e.target.value)} /></Field>
                <Field label="Product type">
                  <Select value={p.product_type} onChange={(e) => set("product_type", e.target.value as CompanyProfile["product_type"])}>
                    <option value="software">Software</option><option value="service">Service</option><option value="physical">Physical product</option><option value="marketplace">Marketplace</option>
                  </Select>
                </Field>
                <Field label="What does the product do?" full><Textarea value={p.product_description} onChange={(e) => set("product_description", e.target.value)} /></Field>
                <Field label="Problem solved, and for whom" full><Textarea value={p.problem_solved} onChange={(e) => set("problem_solved", e.target.value)} placeholder="Sell the problem you solve, not the product you make." /></Field>
                <Field label="Evidence of the pain" hint="Interviews, support tickets, churn reasons, search volume."><Input value={p.evidence_of_pain} onChange={(e) => set("evidence_of_pain", e.target.value)} /></Field>
                <Field label="Differentiators"><Input value={p.differentiators} onChange={(e) => set("differentiators", e.target.value)} /></Field>
              </>
            )}
            {step === 1 && (
              <>
                <Field label="Industry / category"><Input value={p.industry} onChange={(e) => set("industry", e.target.value)} placeholder="Product analytics" /></Field>
                <Field label="Geographies"><Input value={p.geography} onChange={(e) => set("geography", e.target.value)} placeholder="US, UK, DACH" /></Field>
                <Field label="Known segments" full><Input value={p.known_segments} onChange={(e) => set("known_segments", e.target.value)} placeholder="Series A-C SaaS, 20-200 employees" /></Field>
                <Field label="Best existing customers" hint="Used to derive the ICP." full><Input value={p.best_customers} onChange={(e) => set("best_customers", e.target.value)} /></Field>
                <div className="md:col-span-2">
                  <div className="mb-1.5 flex items-center justify-between">
                    <span className="text-[13px] font-medium text-ink/85">Competitors</span>
                    <Button size="sm" variant="ghost" onClick={() => set("competitors", [...competitors, { name: "", url: "", price: "", notes: "" }])}><Plus size={14} /> Add</Button>
                  </div>
                  {competitors.length === 0 && <p className="text-[12.5px] text-muted-strong-strong">None added. The Research Agent will find them, but naming two or three improves the situation analysis.</p>}
                  <div className="space-y-2">
                    {competitors.map((c, i) => (
                      <div key={i} className="grid grid-cols-[1fr_1fr_auto] gap-2 md:grid-cols-[1.2fr_1.2fr_.8fr_1fr_auto]">
                        <Input placeholder="Name" value={c.name} onChange={(e) => setComp(i, { name: e.target.value })} />
                        <Input placeholder="URL" value={c.url} onChange={(e) => setComp(i, { url: e.target.value })} />
                        <Input placeholder="Price" className="hidden md:block" value={c.price} onChange={(e) => setComp(i, { price: e.target.value })} />
                        <Input placeholder="Notes" className="hidden md:block" value={c.notes} onChange={(e) => setComp(i, { notes: e.target.value })} />
                        <IconButton label="Remove competitor" onClick={() => set("competitors", competitors.filter((_, j) => j !== i))}><Trash2 size={14} /></IconButton>
                      </div>
                    ))}
                  </div>
                </div>
                <Field label="Next-best alternative" hint="What customers use today if not you."><Input value={p.next_best_alternative} onChange={(e) => set("next_best_alternative", e.target.value)} /></Field>
                <Field label="Current price"><Input value={p.current_price} onChange={(e) => set("current_price", e.target.value)} placeholder="$99 / seat / month" /></Field>
                <Field label="Cost of goods (COGS)"><Input value={p.cogs} onChange={(e) => set("cogs", e.target.value)} placeholder="$18 / seat / month" /></Field>
                <Field label="Pricing objective"><Input value={p.pricing_objective} onChange={(e) => set("pricing_objective", e.target.value)} placeholder="Share growth, margin, survival…" /></Field>
                <Field label="Ease of seeing value for the price">
                  <Select value={p.ease_of_seeing_value} onChange={(e) => set("ease_of_seeing_value", e.target.value as CompanyProfile["ease_of_seeing_value"])}><option value="easy">Easy</option><option value="hard">Hard</option></Select>
                </Field>
                <Field label="Ease of buying and getting started">
                  <Select value={p.ease_of_getting_started} onChange={(e) => set("ease_of_getting_started", e.target.value as CompanyProfile["ease_of_getting_started"])}><option value="easy">Easy</option><option value="hard">Hard</option></Select>
                </Field>
                <div className="md:col-span-2"><Toggle checked={p.has_sales_team} onChange={(v) => set("has_sales_team", v)} label="We have a sales team" description="Shapes the go-to-market motion the Strategy Agent recommends." /></div>
                <div className="md:col-span-2">
                  <span className="mb-1.5 block text-[13px] font-medium text-ink/85">Current channels</span>
                  <ChipInput values={p.current_channels} onChange={(v) => set("current_channels", v)} placeholder="Type a channel and press Enter" suggestions={CHANNEL_SUGGESTIONS} />
                </div>
              </>
            )}
            {step === 2 && (
              <>
                <Field label="Revenue target (annual, USD)"><Input type="number" min={0} value={p.revenue_target ?? ""} onChange={(e) => set("revenue_target", num(e.target.value))} placeholder="1000000" /></Field>
                <Field label="Time horizon (months)"><Input type="number" min={1} max={60} value={p.time_horizon_months} onChange={(e) => set("time_horizon_months", Number(e.target.value) || 12)} /></Field>
                <Field label="GTM scenario">
                  <Select value={p.gtm_scenario} onChange={(e) => set("gtm_scenario", e.target.value as CompanyProfile["gtm_scenario"])}>
                    <option value="launch">Product launch / MVP</option><option value="expansion">Market expansion</option><option value="campaign">Campaign initiative</option>
                  </Select>
                </Field>
                <Field label="Monthly marketing budget (USD)"><Input type="number" min={0} value={p.monthly_budget ?? ""} onChange={(e) => set("monthly_budget", num(e.target.value))} placeholder="15000" /></Field>
                <Field label="Team size"><Input type="number" min={1} value={p.team_size} onChange={(e) => set("team_size", Number(e.target.value) || 1)} /></Field>
                <div>
                  <span className="mb-1.5 block text-[13px] font-medium text-ink/85">Marketing tech stack</span>
                  <ChipInput values={p.tech_stack} onChange={(v) => set("tech_stack", v)} placeholder="Add a tool" suggestions={STACK_SUGGESTIONS} />
                </div>
                <Field label="Average sale value (USD)"><Input type="number" min={0} value={p.known_metrics.average_sale_value ?? ""} onChange={(e) => setMetric("average_sale_value", e.target.value)} /></Field>
                <Field label="CAC (USD)"><Input type="number" min={0} value={p.known_metrics.cac ?? ""} onChange={(e) => setMetric("cac", e.target.value)} /></Field>
                <Field label="LTV (USD)"><Input type="number" min={0} value={p.known_metrics.ltv ?? ""} onChange={(e) => setMetric("ltv", e.target.value)} /></Field>
                <Field label="Visitor → lead rate" hint="0-1, if known"><Input type="number" min={0} max={1} step="0.001" value={p.known_metrics.visitor_to_lead ?? ""} onChange={(e) => setMetric("visitor_to_lead", e.target.value)} /></Field>
                <Field label="Anything else the agents should know" full><Textarea value={p.notes} onChange={(e) => set("notes", e.target.value)} /></Field>
                <div className="md:col-span-2">
                  <NoteBox title="Data note">Your profile is stored locally in SQLite and only sent to the model provider you configured.</NoteBox>
                </div>
              </>
            )}
            <div className="md:col-span-2"><InlineError error={error} /></div>
          </div>
        )}
      </StepperModal>
    </>
  );
}

export default function SetupPage() {
  return (
    <Suspense fallback={<SettingsBackdrop />}>
      <SetupForm />
    </Suspense>
  );
}
