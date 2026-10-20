"""Pydantic schemas: the company profile, every stage's structured output, and
the API request/response shapes.

Stage output models double as the Agent SDK `output_format` JSON schema, so
they stay flat: no recursion, enums as Literal strings, and a description on
every field - the description is what the model reads.
"""
from __future__ import annotations

from datetime import datetime
from typing import Any, Literal, Optional

from pydantic import BaseModel, Field

# ---------------------------------------------------------------------------
# Company profile (what the setup wizard collects)
# ---------------------------------------------------------------------------

BusinessType = Literal["B2B", "B2C", "B2G", "B2P", "B2D", "platform"]
Ease = Literal["easy", "hard"]
Scenario = Literal["launch", "expansion", "campaign"]
CompanyStage = Literal["idea", "startup", "growth", "mature"]
ProductType = Literal["software", "service", "physical", "marketplace"]


class Competitor(BaseModel):
    name: str
    url: str = ""
    price: str = ""
    notes: str = ""


class KnownMetrics(BaseModel):
    """Historical funnel data, all optional. Fractions are 0-1, money is USD."""

    visitor_to_lead: Optional[float] = None
    lead_to_mql: Optional[float] = None
    mql_to_sql: Optional[float] = None
    sql_to_opportunity: Optional[float] = None
    opportunity_to_won: Optional[float] = None
    average_sale_value: Optional[float] = None
    cac: Optional[float] = None
    ltv: Optional[float] = None


class CompanyProfile(BaseModel):
    # Step 1 - Company & product
    name: str
    website: str = ""
    description: str = ""
    stage: CompanyStage = "startup"
    business_type: BusinessType = "B2B"
    product_name: str = ""
    product_description: str = ""
    product_type: ProductType = "software"
    problem_solved: str = ""
    evidence_of_pain: str = ""
    differentiators: str = ""
    # Step 2 - Market & competitors
    industry: str = ""
    geography: str = ""
    known_segments: str = ""
    best_customers: str = ""
    competitors: list[Competitor] = Field(default_factory=list)
    next_best_alternative: str = ""
    current_price: str = ""
    cogs: str = ""
    pricing_objective: str = ""
    ease_of_seeing_value: Ease = "easy"
    ease_of_getting_started: Ease = "easy"
    has_sales_team: bool = False
    current_channels: list[str] = Field(default_factory=list)
    # Step 3 - Goals, budget & resources
    revenue_target: Optional[float] = Field(None, description="annual revenue goal, USD")
    time_horizon_months: int = 12
    gtm_scenario: Scenario = "launch"
    monthly_budget: Optional[float] = None
    team_size: int = 1
    tech_stack: list[str] = Field(default_factory=list)
    known_metrics: KnownMetrics = Field(default_factory=KnownMetrics)
    notes: str = ""


# Fields the intake step treats as required for a good run (interview pattern:
# the chat agent asks for whichever of these are still empty, one at a time).
INTAKE_REQUIRED: list[tuple[str, str]] = [
    ("description", "What does the company do?"),
    ("product_description", "What exactly is the product and what does it do?"),
    ("problem_solved", "What problem does it solve, and for whom?"),
    ("industry", "Which industry and category do you compete in?"),
    ("geography", "Which geographies do you sell into?"),
    ("revenue_target", "What is the revenue target for the horizon?"),
    ("monthly_budget", "What is the monthly marketing budget?"),
]


def missing_intake_fields(profile: CompanyProfile) -> list[dict[str, str]]:
    out = []
    for field, question in INTAKE_REQUIRED:
        value = getattr(profile, field)
        if value in (None, "", [], 0):
            out.append({"field": field, "question": question})
    return out


# ---------------------------------------------------------------------------
# Stage outputs (one model per stage, used as output_format schemas)
# ---------------------------------------------------------------------------

class Source(BaseModel):
    title: str
    url: str


class ValueGap(BaseModel):
    gap: str = Field(description="the need that is not met, or not met well")
    who_has_it: str
    evidence: str = Field(description="observed evidence, with a source where possible")
    served_today_by: str = Field(description="competitor, workaround, or 'nobody'")
    why_underserved: str


class SituationAnalysis(BaseModel):
    """Stage 1 (MM2): environment, customers, competitors, collaborators -> value gaps."""

    environment: str = Field(description="market forces, trends, regulation that matter")
    customers: str = Field(description="who buys, what they value, what they give up")
    competitors: list[str] = Field(description="named competitors with one line each")
    collaborators: list[str] = Field(description="partners, channels, ecosystems")
    value_gaps: list[ValueGap]
    sources: list[Source]


class Assumption(BaseModel):
    name: str
    value: str
    basis: str = Field(description="where the number comes from")


class MarketSizing(BaseModel):
    """Stage 2 (MST): TAM -> SAM -> SOM with documented assumptions."""

    tam_usd: float = Field(description="total demand with no competition, USD per year")
    tam_definition: str
    geo_pct: float = Field(description="fraction 0-1 of TAM in the served geographies")
    segment_pct: float = Field(description="fraction 0-1 of TAM that fits the product")
    sam_usd: float = Field(description="TAM x geo_pct x segment_pct")
    sam_definition: str
    capture_rate: float = Field(description="fraction 0-1 capturable in 12-36 months; 0.02-0.03 for new entrants")
    som_usd: float = Field(description="SAM x capture_rate")
    som_definition: str
    assumptions: list[Assumption]
    sources: list[Source]


class MarketCandidate(BaseModel):
    market: str
    problem: str
    problem_size_1_10: int
    offering_compelling: bool
    evidence_will_pay: str
    big_enough: bool
    score: int = Field(description="overall attractiveness 1-10")


class TargetMarket(BaseModel):
    """Stage 3 (PMF): score candidate markets, pick one or two, sub-segment, name it."""

    candidates: list[MarketCandidate]
    chosen: list[str] = Field(description="one or two market names from candidates")
    sub_segments: list[str]
    descriptors: dict[str, str] = Field(description="B2B: industry, geography, size, structure, performance; B2C: demographic, behavioural, psychographic, geographic")
    market_name: str = Field(description="a memorable name for the target market")
    rationale: str


class FeatureBenefitRow(BaseModel):
    pain_point: str
    evidence: str
    feature: str
    benefit: str = Field(description="must pass the 'so what?' test")
    value: str = Field(description="quantified: time saved, cost reduced, revenue gained")


class FeatureBenefitMatrix(BaseModel):
    """Stage 4 (MST)."""

    rows: list[FeatureBenefitRow]
    fit_assessment: str
    gaps: list[str] = Field(description="pains with no feature, or features with no pain")


class Persona(BaseModel):
    name: str
    title: str
    page1: str = Field(description="prose: demographics, goals and challenges, values and fears, how they learn and buy")
    touchpoints: list[str]
    motivations: list[str]
    tidbits: list[str]
    buying_role: Literal["decision_maker", "approver", "recommender", "influencer", "sniper", "end_user"]
    data_basis: str = Field(description="what data this persona is grounded in")


class Segment(BaseModel):
    name: str
    demographic: str
    firmographic: str
    geographic: str
    behavioural_intent: str
    share_pct: float = Field(description="estimated share 0-100 of the target market")
    why_it_matters: str


class Audience(BaseModel):
    """Stage 5 (PMF, MST): personas, buying roles, ICP, layered segments."""

    personas: list[Persona]
    icp: str = Field(description="the company type with the fastest buying process and best retention")
    icp_shared_traits: list[str]
    segments: list[Segment]
    messaging_by_role: dict[str, str] = Field(description="end_user / influencer / decision_maker -> message")


class Positioning(BaseModel):
    """Stage 6 (MST, MM2)."""

    functional_benefits: list[str]
    emotional_benefits: list[str]
    economic_benefits: list[str]
    social_benefits: list[str]
    problem_solution_outcome: str = Field(description="25-50 words, customer language, quantified outcome, no jargon")
    frame_of_reference: str = Field(description="the category you compete in")
    point_of_difference: str
    positioning_line: str = Field(description="one sentence that stays fixed across every medium")
    message_by_platform: dict[str, str] = Field(description="platform -> adapted message")


class GtmMotion(BaseModel):
    """Stage 7 (PMF)."""

    business_type: BusinessType
    ease_of_seeing_value: Ease
    ease_of_getting_started: Ease
    motion: Literal["marketing_led", "sales_led", "sales_plus_customer_success", "marketing_led_plus_customer_success", "product_led_growth"]
    rationale: str
    plg_applicable: bool
    platform_two_sided: bool = Field(description="true if two demand plans (producers and consumers) are needed")


class OKR(BaseModel):
    level: Literal["corporate", "marketing", "campaign"]
    objective: str
    key_results: list[str]


class SmartGoal(BaseModel):
    goal: str
    metric: str
    target: str
    deadline: str


class AlignmentRow(BaseModel):
    corporate_kr: str
    campaign_initiative: str
    campaign_kpi: str
    alignment: Literal["Strong", "Partial", "Weak", "Conflicting"]
    recommendation: str


class Objectives(BaseModel):
    """Stage 8 (MST, PMF)."""

    okrs: list[OKR]
    smart_goals: list[SmartGoal]
    kpis: list[str]
    alignment_audit: list[AlignmentRow]


class WaterfallStep(BaseModel):
    stage: str = Field(description="Visitors, Raw leads, MQL, SAL, SQL, Opportunities, Closed-won  (or the PLG steps)")
    count: float
    conversion_to_next: Optional[float] = Field(None, description="fraction 0-1 to the next step")


class DemandMath(BaseModel):
    """Stage 9 (PMF): reverse waterfall from the revenue goal; LTV > CAC."""

    model: Literal["sales", "plg", "ecommerce"]
    revenue_goal_usd: float
    average_sale_value_usd: float
    waterfall: list[WaterfallStep] = Field(description="ordered top of funnel -> revenue")
    ltv_usd: Optional[float]
    cac_usd: Optional[float]
    ltv_cac_ratio: Optional[float]
    ltv_exceeds_cac: Optional[bool]
    assumptions: list[Assumption]
    monthly_visitors_needed: float


class JourneyStage(BaseModel):
    stage: Literal["awareness", "consideration", "action", "activate", "retain", "refer"]
    persona: str
    needs_and_questions: list[str]
    messages: list[str]
    content: list[str]
    vehicles: list[str]


class BuyerJourney(BaseModel):
    """Stage 10 (PMF)."""

    stages: list[JourneyStage]
    hierarchy_of_effects_note: str


class ProductMix(BaseModel):
    core_benefit: str
    basic: str
    expected: str
    augmented: str = Field(description="where differentiation happens")
    potential: str
    classification: Literal["convenience", "shopping", "specialty", "unsought"]
    life_cycle_stage: Literal["introduction", "growth", "maturity", "decline"]
    service_extras: str = Field(description="people, process, physical environment - or 'n/a'")


class PlaceMix(BaseModel):
    push_or_pull: Literal["push", "pull", "both"]
    direct_or_indirect: Literal["direct", "indirect", "hybrid"]
    channel_length: str
    channel_breadth: Literal["intensive", "selective", "exclusive"]
    channels: list[str]
    rationale: str


class PriceMix(BaseModel):
    price_objective: str
    demand_and_elasticity: str
    cost_floor: str
    competitor_prices: list[str]
    method: Literal["cost_plus", "value_based", "sealed_bid"]
    strategy: Literal["skimming", "penetration", "neutral"]
    true_economic_value: str = Field(description="cost of next-best alternative + value of relative advantage")
    recommended_price: str
    psychology_notes: list[str]


class PromotionMix(BaseModel):
    advertising: str
    sales_promotion: str
    public_relations: str
    personal_selling: str
    direct_marketing: str
    tool_by_decision_stage: dict[str, str] = Field(description="recognition/search/evaluation/close -> tool")


class MarketingMix(BaseModel):
    """Stage 11 (MM2): the 4 Ps."""

    product: ProductMix
    place: PlaceMix
    price: PriceMix
    promotion: PromotionMix


class ChannelPlan(BaseModel):
    channel: str
    role: str = Field(description="what this channel does in the plan")
    budget_pct: float = Field(description="0-100 share of budget")
    monthly_budget_usd: float
    kpi: str


class CommsPlan(BaseModel):
    """Stage 12 (MM2): the 6 M's + Integrated Marketing Communications."""

    market: str
    mission: str
    message: str
    media: list[str]
    money: str
    measurement: list[str]
    imc_positioning_line: str
    channel_plan: list[ChannelPlan]


class Milestone(BaseModel):
    phase: Literal["pre_launch", "launch", "post_launch"]
    week: int = Field(description="week number 1-13")
    milestone: str
    owner: str
    depends_on: str


class GtmPlan(BaseModel):
    """Stage 13 (MST): six pillars + 90-day timeline."""

    objectives: list[str]
    target_segments: list[str]
    value_proposition: str
    channel_strategy: str
    budget_summary: str
    timeline: list[Milestone]
    scenario: Scenario


FunnelStage = Literal["awareness", "consideration", "action", "retain", "refer"]
Priority = Literal["critical", "high", "medium", "low"]
AgentName = Literal["research", "content", "outreach", "creative", "none"]
TaskAction = Literal[
    "write_ad_copy", "write_landing_page", "write_email_sequence", "write_social_posts",
    "design_ab_test", "draft_outreach_emails", "generate_ad_images", "generate_ad_video",
    "render_ad_images", "competitor_deep_dive", "influencer_research",
]
IntegrationName = Literal["anthropic", "firecrawl", "gmail", "higgsfield"]


class TacticTile(BaseModel):
    funnel_stage: FunnelStage
    tactic: str
    channel: str
    priority: Priority
    rationale: str
    agent: AgentName
    estimated_cost: str


class ProposedTask(BaseModel):
    agent: AgentName
    action: TaskAction
    title: str
    description: str
    inputs: dict[str, Any] = Field(description="free-form inputs the executing agent needs")
    estimated_cost: str
    requires_approval: bool = True
    integration: Optional[IntegrationName] = None


class Lens(BaseModel):
    lens: Literal["resource_alignment", "strategic_alignment", "metric_feasibility"]
    verdict: Literal["pass", "concern", "fail"]
    finding: str
    fix: str


class Recommendation(BaseModel):
    title: str
    detail: str
    priority: Priority
    horizon: Literal["short", "medium", "long"]


class Review(BaseModel):
    """Stage 14 (MST, GAI): three lenses, recommendations, tactics matrix, execution plan."""

    lenses: list[Lens]
    alternatives_considered: list[str] = Field(description="tree-of-thought: three branches explored")
    recommendations: list[Recommendation]
    tactics_matrix: list[TacticTile]
    proposed_tasks: list[ProposedTask]
    plan_readiness_pct: int = Field(description="0-100 confidence the plan is executable as written")


# ---- Execution outputs (stage 15, one per task) ----

class AdplaneScore(BaseModel):
    attention: int
    distinction: int
    positioning: int
    linkage: int
    amplification: int
    net_equity: int
    emotion: int
    total: int = Field(description="sum, max 49")


class ContentPiece(BaseModel):
    kind: Literal["ad", "landing_page", "email", "social_post", "video_script"]
    channel: str
    variant: Literal["A", "B"]
    headline: str
    body: str
    cta: str
    adplane: AdplaneScore


class AbTest(BaseModel):
    hypothesis: str
    variable: str = Field(description="exactly one variable")
    funnel_stage: Literal["awareness", "consideration", "decision"]
    metric: Literal["open_rate", "click_through_rate", "conversion_rate"]
    control: str
    variant: str
    confidence_level: Literal[90, 95, 99]
    sample_size_note: str


class ContentPack(BaseModel):
    pieces: list[ContentPiece]
    ab_tests: list[AbTest]


class OutreachEmail(BaseModel):
    to_role: str
    subject: str
    body: str
    persona: str


class OutreachDrafts(BaseModel):
    emails: list[OutreachEmail]
    sequence_note: str


class CreativeBrief(BaseModel):
    prompts: list[str] = Field(description="image/video prompts with style modifiers, quality boosters, negative prompts")
    aspect_ratios: list[str]
    quote_credits: Optional[float] = None
    assets: list[str] = Field(default_factory=list, description="URLs of generated assets")


class CompetitorDeepDive(BaseModel):
    competitors: list[dict[str, str]]
    positioning_map_note: str
    sources: list[Source]


# ---- Influencer research (IG / X creators: real vs fake, ranked, with a first message) ----

InfluencerPlatform = Literal["instagram", "x"]
InfluencerTier = Literal["nano", "micro", "mid", "macro"]
InfluencerVerdict = Literal["real", "suspicious", "likely_fake"]


class InfluencerThreshold(BaseModel):
    platform: InfluencerPlatform
    tier: InfluencerTier
    followers_min: int
    followers_max: Optional[int] = Field(None, description="None for the top tier")
    good_er: float = Field(description="engagement rate (0-1) at or above which the account is healthy")
    ok_er: float = Field(description="engagement rate (0-1) that is acceptable")
    poor_er: float = Field(description="engagement rate (0-1) below which followers look bought")
    basis: str = Field(description="where the numbers come from")


class InfluencerRule(BaseModel):
    summary: str = Field(description="the rule in two or three plain sentences, with the user's example")
    thresholds: list[InfluencerThreshold]
    red_flags: list[str] = Field(description="signals of bought followers or pods")
    sources: list[Source]


AqsBand = Literal["excellent", "good", "average", "low", "poor"]
GrowthPattern = Literal["organic", "spikes", "follow_unfollow", "unknown"]


class AudienceTypes(BaseModel):
    """Audience split, HypeAuditor vocabulary: influencers = >5,000 followers and <1,500
    followings; mass followers = >1,500 followings (follow/unfollow tools); suspicious =
    bots, bought or stolen accounts; real people = the rest. Fractions sum to 1."""

    real_people: float
    influencers: float
    mass_followers: float
    suspicious: float


class AudienceProfile(BaseModel):
    top_countries: list[str] = Field(default_factory=list)
    age_gender: str = ""
    languages: list[str] = Field(default_factory=list)
    interests: list[str] = Field(default_factory=list)


class CreatorAudit(BaseModel):
    """HypeAuditor-style audit, estimated by GrowthPilot from public signals (see data_quality)."""

    aqs: int = Field(description="Audience Quality Score 1-100 from the calc tool")
    aqs_band: AqsBand
    audience_types: AudienceTypes
    quality_audience: float = Field(description="real_people + influencers, 0-1")
    audience_reachability: float = Field(description="share of followers following < 1,500 accounts, 0-1")
    authentic_engagement: float = Field(description="engagement_rate x quality_audience, 0-1")
    er_vs_similar: Literal["above", "average", "below"]
    likes_comment_ratio: float = Field(description="avg_likes / max(avg_comments, 1)")
    likes_spread: Literal["organic", "even", "unknown"] = Field(description="even = likes identical across posts, typical of bought likes")
    comments_authenticity: float = Field(description="share of recent comments that are not emoji-only, generic praise, mention-only or pod-like, 0-1")
    comments_samples: list[str] = Field(default_factory=list, description="up to 3 short quoted comments")
    followers_growth: GrowthPattern
    growth_note: str = ""
    yearly_growth_rate: Optional[float] = None
    posts_per_week: Optional[float] = None
    sponsored_share: Optional[float] = Field(None, description="share of recent posts that are #ad / #sponsored, 0-1")
    brand_mentions: list[str] = Field(default_factory=list)
    estimated_reach: Optional[int] = Field(None, description="estimated accounts reached per post")
    estimated_price_usd: Optional[float] = Field(None, description="estimated price per sponsored post, USD")
    cpe_usd: Optional[float] = Field(None, description="price / (avg_likes + avg_comments)")
    audience: AudienceProfile = Field(default_factory=AudienceProfile)
    signals: list[str] = Field(default_factory=list, description="concrete evidence lines behind the verdict")


class InfluencerCandidate(BaseModel):
    rank: int
    platform: InfluencerPlatform
    handle: str = Field(description="@handle")
    name: str
    url: str
    followers: int
    following: int
    posts_sampled: int
    avg_likes: float
    avg_comments: float
    engagement_rate: float = Field(description="(avg_likes + avg_comments) / followers, 0-1")
    follower_following_ratio: float
    comment_like_ratio: float = Field(description="avg_comments / avg_likes")
    authenticity_score: int = Field(description="0-100 from the calc tool")
    verdict: InfluencerVerdict
    reasons: list[str]
    niche_tags: list[str]
    audience_fit: int = Field(description="0-100 how well their audience matches the product's buyers")
    why_fit: str
    recent_post_hook: str = Field(description="the specific recent post the message references")
    outreach_message: str = Field(description="first-contact DM, at most 80 words, no links")
    outreach_subject: str = Field(description="subject line if sent as email")
    sources: list[Source]
    data_quality: Literal["measured", "estimated"]
    audit: Optional[CreatorAudit] = None


class InfluencerResearch(BaseModel):
    product_summary: str
    platforms: list[InfluencerPlatform]
    niche: str
    rule: InfluencerRule
    candidates: list[InfluencerCandidate]
    method_note: str = Field(description="how counts were obtained and what is estimated")


# ---------------------------------------------------------------------------
# Stage registry
# ---------------------------------------------------------------------------

class StageSpec(BaseModel):
    number: int
    key: str
    title: str
    agent: Literal["research", "strategy", "planning", "review"]
    schema_name: str
    uses_web: bool = False
    uses_calculators: bool = False
    model: str = "claude-opus-5-5"


STAGE_SCHEMAS: dict[str, type[BaseModel]] = {
    "situation_analysis": SituationAnalysis,
    "market_sizing": MarketSizing,
    "target_market": TargetMarket,
    "feature_benefit": FeatureBenefitMatrix,
    "audience": Audience,
    "positioning": Positioning,
    "gtm_motion": GtmMotion,
    "objectives": Objectives,
    "demand_math": DemandMath,
    "buyer_journey": BuyerJourney,
    "marketing_mix": MarketingMix,
    "comms_plan": CommsPlan,
    "gtm_plan": GtmPlan,
    "review": Review,
}

STAGES: list[StageSpec] = [
    StageSpec(number=1, key="situation_analysis", title="Situation analysis", agent="research", schema_name="SituationAnalysis", uses_web=True),
    StageSpec(number=2, key="market_sizing", title="Market sizing (TAM / SAM / SOM)", agent="research", schema_name="MarketSizing", uses_web=True, uses_calculators=True),
    StageSpec(number=3, key="target_market", title="Target market selection", agent="research", schema_name="TargetMarket", uses_web=True),
    StageSpec(number=4, key="feature_benefit", title="Feature-Benefit Matrix", agent="strategy", schema_name="FeatureBenefitMatrix"),
    StageSpec(number=5, key="audience", title="Personas, ICP & segments", agent="strategy", schema_name="Audience"),
    StageSpec(number=6, key="positioning", title="Value proposition & positioning", agent="strategy", schema_name="Positioning"),
    StageSpec(number=7, key="gtm_motion", title="Go-to-market motion", agent="strategy", schema_name="GtmMotion"),
    StageSpec(number=8, key="objectives", title="OKRs, SMART goals & KPIs", agent="planning", schema_name="Objectives"),
    StageSpec(number=9, key="demand_math", title="Demand math (waterfall, LTV > CAC)", agent="planning", schema_name="DemandMath", uses_calculators=True),
    StageSpec(number=10, key="buyer_journey", title="Buyer's journey", agent="planning", schema_name="BuyerJourney"),
    StageSpec(number=11, key="marketing_mix", title="Marketing mix (4 Ps)", agent="planning", schema_name="MarketingMix", uses_calculators=True),
    StageSpec(number=12, key="comms_plan", title="Communications plan (6 M's)", agent="planning", schema_name="CommsPlan", uses_calculators=True),
    StageSpec(number=13, key="gtm_plan", title="GTM plan & 90-day timeline", agent="planning", schema_name="GtmPlan", uses_calculators=True),
    StageSpec(number=14, key="review", title="Review, recommendations & execution plan", agent="review", schema_name="Review"),
]

TASK_SCHEMAS: dict[str, type[BaseModel]] = {
    "write_ad_copy": ContentPack,
    "write_landing_page": ContentPack,
    "write_email_sequence": ContentPack,
    "write_social_posts": ContentPack,
    "design_ab_test": ContentPack,
    "draft_outreach_emails": OutreachDrafts,
    "generate_ad_images": CreativeBrief,
    "generate_ad_video": CreativeBrief,
    "render_ad_images": CreativeBrief,
    "competitor_deep_dive": CompetitorDeepDive,
    "influencer_research": InfluencerResearch,
}

# ---------------------------------------------------------------------------
# API shapes
# ---------------------------------------------------------------------------

RunStatus = Literal["queued", "running", "completed", "failed", "cancelled"]
StageStatus = Literal["pending", "running", "completed", "failed", "skipped"]
TaskStatus = Literal["proposed", "approved", "rejected", "running", "done", "failed", "blocked"]
DeliverableKind = Literal[
    "market_research", "personas_icp", "positioning_brief", "pricing_analysis",
    "gtm_plan", "content_pack", "ad_creatives", "outreach_drafts", "influencer_list",
]


class CompanyOut(BaseModel):
    id: int
    name: str
    profile: CompanyProfile
    created_at: datetime
    updated_at: datetime
    missing_intake: list[dict[str, str]]


class RunOut(BaseModel):
    id: int
    company_id: int
    status: RunStatus
    current_stage: int
    cost_usd: float
    error: Optional[str]
    started_at: Optional[datetime]
    finished_at: Optional[datetime]


class StageResultOut(BaseModel):
    id: int
    run_id: int
    number: int
    key: str
    title: str
    status: StageStatus
    summary: str
    output: Optional[dict[str, Any]]
    cost_usd: float
    started_at: Optional[datetime]
    finished_at: Optional[datetime]


class TaskOut(BaseModel):
    id: int
    run_id: int
    company_id: int
    agent: str
    action: str
    title: str
    description: str
    inputs: dict[str, Any]
    estimated_cost: str
    requires_approval: bool
    integration: Optional[str]
    status: TaskStatus
    result: Optional[dict[str, Any]]
    error: Optional[str]
    created_at: datetime
    updated_at: datetime


class DeliverableOut(BaseModel):
    id: int
    run_id: int
    company_id: int
    kind: DeliverableKind
    title: str
    content_md: str
    meta: dict[str, Any]
    generated_by: str
    created_at: datetime


class EventOut(BaseModel):
    id: int
    run_id: int
    ts: datetime
    agent: str
    level: Literal["info", "success", "warning", "error"]
    stage: Optional[str]
    message: str


class InsightOut(BaseModel):
    id: int
    run_id: int
    kind: Literal["opportunity", "risk", "gap"]
    severity: Literal["high", "medium", "low"]
    title: str
    detail: str
    ts: datetime


class IntegrationOut(BaseModel):
    name: IntegrationName
    connected: bool
    detail: str
    config: dict[str, Any]


class ChatMessageOut(BaseModel):
    id: int
    company_id: int
    role: Literal["user", "agent"]
    content: str
    ts: datetime
    meta: dict[str, Any]


class DashboardOut(BaseModel):
    company: Optional[CompanyOut]
    latest_run: Optional[RunOut]
    active_agents: int
    deliverables: int
    tasks_done: int
    tasks_pending: int
    plan_readiness_pct: int
    recent_events: list[EventOut]


class ChatIn(BaseModel):
    company_id: int
    message: str


class InfluencerResearchIn(BaseModel):
    company_id: int
    platforms: list[InfluencerPlatform] = Field(default_factory=lambda: ["instagram", "x"])
    niche: str = ""
    max_candidates: int = Field(10, ge=3, le=25)


class InfluencerResearchOut(BaseModel):
    task_id: int
    status: TaskStatus
    platforms: list[str]
    niche: str
    generated_at: Optional[datetime]
    error: Optional[str]
    result: Optional[InfluencerResearch]


class InfluencerOutreachIn(BaseModel):
    handles: list[str] = Field(description="candidate handles to write to")
