/**
 * API contract. Mirrors backend/app/schemas.py - change both or neither.
 */

export type BusinessType = "B2B" | "B2C" | "B2G" | "B2P" | "B2D" | "platform";
export type Ease = "easy" | "hard";
export type Scenario = "launch" | "expansion" | "campaign";
export type CompanyStage = "idea" | "startup" | "growth" | "mature";
export type ProductType = "software" | "service" | "physical" | "marketplace";

export interface Competitor { name: string; url: string; price: string; notes: string }

export interface KnownMetrics {
  visitor_to_lead: number | null; lead_to_mql: number | null; mql_to_sql: number | null;
  sql_to_opportunity: number | null; opportunity_to_won: number | null;
  average_sale_value: number | null; cac: number | null; ltv: number | null;
}

export interface CompanyProfile {
  name: string; website: string; description: string; stage: CompanyStage; business_type: BusinessType;
  product_name: string; product_description: string; product_type: ProductType;
  problem_solved: string; evidence_of_pain: string; differentiators: string;
  industry: string; geography: string; known_segments: string; best_customers: string;
  competitors: Competitor[]; next_best_alternative: string; current_price: string; cogs: string;
  pricing_objective: string; ease_of_seeing_value: Ease; ease_of_getting_started: Ease;
  has_sales_team: boolean; current_channels: string[];
  revenue_target: number | null; time_horizon_months: number; gtm_scenario: Scenario;
  monthly_budget: number | null; team_size: number; tech_stack: string[]; known_metrics: KnownMetrics; notes: string;
}

export const emptyProfile = (): CompanyProfile => ({
  name: "", website: "", description: "", stage: "startup", business_type: "B2B",
  product_name: "", product_description: "", product_type: "software",
  problem_solved: "", evidence_of_pain: "", differentiators: "",
  industry: "", geography: "", known_segments: "", best_customers: "",
  competitors: [], next_best_alternative: "", current_price: "", cogs: "",
  pricing_objective: "", ease_of_seeing_value: "easy", ease_of_getting_started: "easy",
  has_sales_team: false, current_channels: [],
  revenue_target: null, time_horizon_months: 12, gtm_scenario: "launch",
  monthly_budget: null, team_size: 1, tech_stack: [],
  known_metrics: { visitor_to_lead: null, lead_to_mql: null, mql_to_sql: null, sql_to_opportunity: null,
    opportunity_to_won: null, average_sale_value: null, cac: null, ltv: null },
  notes: "",
});

export type RunStatus = "queued" | "running" | "completed" | "failed" | "cancelled";
export type StageStatus = "pending" | "running" | "completed" | "failed" | "skipped";
export type TaskStatus = "proposed" | "approved" | "rejected" | "running" | "done" | "failed" | "blocked";
export type DeliverableKind = "market_research" | "personas_icp" | "positioning_brief" | "pricing_analysis"
  | "gtm_plan" | "content_pack" | "ad_creatives" | "outreach_drafts" | "influencer_list";
export type FunnelStage = "awareness" | "consideration" | "action" | "retain" | "refer";
export type Priority = "critical" | "high" | "medium" | "low";
export type AgentName = "research" | "content" | "outreach" | "creative" | "none";
export type IntegrationName = "anthropic" | "firecrawl" | "gmail" | "higgsfield";
export type Level = "info" | "success" | "warning" | "error";

export interface Company {
  id: number; name: string; profile: CompanyProfile; created_at: string; updated_at: string;
  missing_intake: { field: string; question: string }[];
}
export interface Run {
  id: number; company_id: number; status: RunStatus; current_stage: number; cost_usd: number;
  error: string | null; started_at: string | null; finished_at: string | null;
}
export interface StageResult {
  id: number; run_id: number; number: number; key: string; title: string; status: StageStatus;
  summary: string; output: Record<string, unknown> | null; cost_usd: number;
  started_at: string | null; finished_at: string | null;
}
export interface Task {
  id: number; run_id: number; company_id: number; agent: AgentName; action: string; title: string;
  description: string; inputs: Record<string, unknown>; estimated_cost: string; requires_approval: boolean;
  integration: IntegrationName | null; status: TaskStatus; result: Record<string, unknown> | null;
  error: string | null; created_at: string; updated_at: string;
}
export interface Deliverable {
  id: number; run_id: number; company_id: number; kind: DeliverableKind; title: string; content_md: string;
  meta: Record<string, unknown>; generated_by: string; created_at: string;
}
export interface Event {
  id: number; run_id: number; ts: string; agent: string; level: Level; stage: string | null; message: string;
}
export interface Insight {
  id: number; run_id: number; kind: "opportunity" | "risk" | "gap"; severity: "high" | "medium" | "low";
  title: string; detail: string; ts: string;
}
export interface Integration { name: IntegrationName; connected: boolean; detail: string; config: Record<string, unknown> }
export interface ChatMessage {
  id: number; company_id: number; role: "user" | "agent"; content: string; ts: string; meta: Record<string, unknown>;
}
export interface Dashboard {
  company: Company | null; latest_run: Run | null; active_agents: number; deliverables: number;
  tasks_done: number; tasks_pending: number; plan_readiness_pct: number; recent_events: Event[];
}

/* ---- Stage output shapes the screens read (subset; see schemas.py) ---- */

export interface MarketSizing {
  tam_usd: number; tam_definition: string; geo_pct: number; segment_pct: number; sam_usd: number;
  sam_definition: string; capture_rate: number; som_usd: number; som_definition: string;
  assumptions: { name: string; value: string; basis: string }[]; sources: { title: string; url: string }[];
}
export interface Segment {
  name: string; demographic: string; firmographic: string; geographic: string; behavioural_intent: string;
  share_pct: number; why_it_matters: string;
}
export interface Persona {
  name: string; title: string; page1: string; touchpoints: string[]; motivations: string[]; tidbits: string[];
  buying_role: string; data_basis: string;
}
export interface Audience { personas: Persona[]; icp: string; icp_shared_traits: string[]; segments: Segment[]; messaging_by_role: Record<string, string> }
export interface WaterfallStep { stage: string; count: number; conversion_to_next: number | null }
export interface DemandMath {
  model: "sales" | "plg"; revenue_goal_usd: number; average_sale_value_usd: number; waterfall: WaterfallStep[];
  ltv_usd: number | null; cac_usd: number | null; ltv_cac_ratio: number | null; ltv_exceeds_cac: boolean | null;
  assumptions: { name: string; value: string; basis: string }[]; monthly_visitors_needed: number;
}
export interface ChannelPlan { channel: string; role: string; budget_pct: number; monthly_budget_usd: number; kpi: string }
export interface CommsPlan {
  market: string; mission: string; message: string; media: string[]; money: string; measurement: string[];
  imc_positioning_line: string; channel_plan: ChannelPlan[];
}
export interface TacticTile {
  funnel_stage: FunnelStage; tactic: string; channel: string; priority: Priority; rationale: string;
  agent: AgentName; estimated_cost: string;
}
export interface Recommendation { title: string; detail: string; priority: Priority; horizon: "short" | "medium" | "long" }
export interface Lens { lens: string; verdict: "pass" | "concern" | "fail"; finding: string; fix: string }
export interface Review {
  lenses: Lens[]; alternatives_considered: string[]; recommendations: Recommendation[];
  tactics_matrix: TacticTile[]; proposed_tasks: unknown[]; plan_readiness_pct: number;
}
export interface SituationAnalysis {
  environment: string; customers: string; competitors: string[]; collaborators: string[];
  value_gaps: { gap: string; who_has_it: string; evidence: string; served_today_by: string; why_underserved: string }[];
  sources: { title: string; url: string }[];
}

/* ---- SSE event envelope on /api/runs/{id}/events/stream and /api/chat ---- */
export type StreamEnvelope =
  | { type: "event"; data: Event }
  | { type: "insight"; data: Insight }
  | { type: "stage"; data: StageResult }
  | { type: "run"; data: Run }
  | { type: "task"; data: Task }
  | { type: "token"; data: { text: string } }
  | { type: "message"; data: ChatMessage }
  | { type: "done"; data: Record<string, never> };

/* HypeAuditor-style audit (GrowthPilot estimates; see backend CreatorAudit) */
export type AqsBand = "excellent" | "good" | "average" | "low" | "poor";
export type GrowthPattern = "organic" | "spikes" | "follow_unfollow" | "unknown";
export type LikesSpread = "organic" | "even" | "unknown";
export interface AudienceTypes { real_people: number; influencers: number; mass_followers: number; suspicious: number }
export interface AudienceProfile { top_countries: string[]; age_gender: string; languages: string[]; interests: string[] }
export interface CreatorAudit {
  aqs: number; aqs_band: AqsBand; audience_types: AudienceTypes; quality_audience: number; audience_reachability: number;
  authentic_engagement: number; er_vs_similar: "above" | "average" | "below"; likes_comment_ratio: number;
  likes_spread: LikesSpread; comments_authenticity: number; comments_samples: string[];
  followers_growth: GrowthPattern; growth_note: string; yearly_growth_rate: number | null;
  posts_per_week: number | null; sponsored_share: number | null; brand_mentions: string[];
  estimated_reach: number | null; estimated_price_usd: number | null; cpe_usd: number | null;
  audience: AudienceProfile; signals: string[];
}

/* ---- Influencer research (see backend InfluencerResearch) ---- */
export type Platform = "instagram" | "x";
export type InfluencerVerdict = "real" | "suspicious" | "likely_fake";
export type InfluencerTier = "nano" | "micro" | "mid" | "macro";
export interface InfluencerThreshold {
  platform: Platform; tier: InfluencerTier; followers_min: number; followers_max: number | null;
  good_er: number; ok_er: number; poor_er: number; basis: string;
}
export interface InfluencerRule { summary: string; thresholds: InfluencerThreshold[]; red_flags: string[]; sources: { title: string; url: string }[] }
export interface InfluencerCandidate {
  rank: number; platform: Platform; handle: string; name: string; url: string;
  followers: number; following: number; posts_sampled: number; avg_likes: number; avg_comments: number;
  engagement_rate: number; follower_following_ratio: number; comment_like_ratio: number;
  authenticity_score: number; verdict: InfluencerVerdict; reasons: string[]; niche_tags: string[];
  audience_fit: number; why_fit: string; recent_post_hook: string; outreach_message: string; outreach_subject: string;
  sources: { title: string; url: string }[]; data_quality: "measured" | "estimated";
  audit?: CreatorAudit | null;
}
export interface InfluencerResearch {
  product_summary: string; platforms: Platform[]; niche: string; rule: InfluencerRule; candidates: InfluencerCandidate[]; method_note: string;
}
export interface InfluencerResearchOut {
  task_id: number; status: TaskStatus; platforms: Platform[]; niche: string; generated_at: string | null; error: string | null;
  result: InfluencerResearch | null;
}
export interface InfluencerResearchIn { company_id: number; platforms: Platform[]; niche: string; max_candidates: number; product_summary?: string }
