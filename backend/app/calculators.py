"""Deterministic marketing maths. Every formula is the one the courses teach;
agents call these through the `calc` MCP server so numbers are reproducible.

Sources: MST = Market Strategy & Targeting, PMF = Product Marketing
Foundations, MM2 = Marketing Management II.
"""

from __future__ import annotations

from contextlib import contextmanager
from contextvars import ContextVar

from typing import Optional

# Conservative course-style defaults, used when a company has no history.
# Each is labelled as an assumption in the output so a reviewer can see it.
DEFAULT_RATES: dict[str, float] = {
    "visitor_to_lead": 0.02,
    "lead_to_mql": 0.40,
    "mql_to_sal": 0.60,
    "sal_to_sql": 0.50,
    "sql_to_opportunity": 0.60,
    "opportunity_to_won": 0.25,
}

DEFAULT_PLG_RATES: dict[str, float] = {
    "visitor_to_signup": 0.03,
    "signup_to_pql": 0.25,
    "pql_to_customer": 0.20,
}

SALES_STAGES = ["Visitors", "Raw leads", "MQL", "SAL", "SQL", "Opportunities", "Closed-won"]
PLG_STAGES = ["Visitors", "Signup/Trial", "PQL", "Customers"]


def sam(tam: float, geo_pct: float, segment_pct: float) -> float:
    """SAM = TAM x geo% x segment% (MST). Fractions are 0-1."""
    return float(tam) * float(geo_pct) * float(segment_pct)


def som(sam_value: float, capture_rate: float) -> float:
    """SOM = SAM x capture rate (MST). New entrants: 0.02-0.03."""
    return float(sam_value) * float(capture_rate)


def market_sizing(tam: float, geo_pct: float, segment_pct: float, capture_rate: float) -> dict:
    """TAM -> SAM -> SOM in one call. Course example: 15e9 x .30 x .10 = 450e6 SAM; x .03 = 13.5e6 SOM."""
    s = sam(tam, geo_pct, segment_pct)
    return {
        "tam_usd": float(tam),
        "geo_pct": float(geo_pct),
        "segment_pct": float(segment_pct),
        "sam_usd": s,
        "capture_rate": float(capture_rate),
        "som_usd": som(s, capture_rate),
        "formula": "SAM = TAM x geo% x segment%; SOM = SAM x capture_rate",
    }


def _resolve_rates(rates: Optional[dict[str, float]], defaults: dict[str, float]) -> tuple[dict[str, float], list[str]]:
    resolved: dict[str, float] = {}
    assumed: list[str] = []
    for key, default in defaults.items():
        value = (rates or {}).get(key)
        if value is None or value <= 0:
            resolved[key] = default
            assumed.append(f"{key} = {default:.0%} (course default, no history supplied)")
        else:
            resolved[key] = float(value)
    return resolved, assumed


def reverse_waterfall(
    revenue_goal: float,
    average_sale_value: float,
    rates: Optional[dict[str, float]] = None,
) -> dict:
    """Sales & marketing waterfall worked backwards from revenue (PMF):
    Revenue -> Closed-won -> Opportunities -> SQL -> SAL -> MQL -> Raw leads -> Visitors.
    `rates` keys, top to bottom: visitor_to_lead, lead_to_mql, mql_to_sal, sal_to_sql,
    sql_to_opportunity, opportunity_to_won. Missing rates use DEFAULT_RATES."""
    resolved, assumed = _resolve_rates(rates, DEFAULT_RATES)
    if average_sale_value <= 0:
        raise ValueError("average_sale_value must be > 0")
    won = float(revenue_goal) / float(average_sale_value)
    ordered_keys = list(DEFAULT_RATES.keys())  # top -> bottom
    # Walk bottom-up: count[i] = count[i+1] / rate[i]
    counts = [0.0] * len(SALES_STAGES)
    counts[-1] = won
    for i in range(len(SALES_STAGES) - 2, -1, -1):
        counts[i] = counts[i + 1] / resolved[ordered_keys[i]]
    steps = []
    for i, stage in enumerate(SALES_STAGES):
        steps.append({
            "stage": stage,
            "count": round(counts[i], 2),
            "conversion_to_next": resolved[ordered_keys[i]] if i < len(ordered_keys) else None,
        })
    return {
        "model": "sales",
        "revenue_goal_usd": float(revenue_goal),
        "average_sale_value_usd": float(average_sale_value),
        "waterfall": steps,
        "assumptions": assumed,
        "formula": "count[stage] = count[next stage] / conversion_to_next; Closed-won = revenue / ASV",
    }


def plg_waterfall(
    revenue_goal: float,
    average_sale_value: float,
    rates: Optional[dict[str, float]] = None,
) -> dict:
    """PLG version of the waterfall (PMF): Visitors -> Signup/Trial -> PQL -> Customer."""
    resolved, assumed = _resolve_rates(rates, DEFAULT_PLG_RATES)
    if average_sale_value <= 0:
        raise ValueError("average_sale_value must be > 0")
    customers = float(revenue_goal) / float(average_sale_value)
    ordered_keys = list(DEFAULT_PLG_RATES.keys())
    counts = [0.0] * len(PLG_STAGES)
    counts[-1] = customers
    for i in range(len(PLG_STAGES) - 2, -1, -1):
        counts[i] = counts[i + 1] / resolved[ordered_keys[i]]
    steps = []
    for i, stage in enumerate(PLG_STAGES):
        steps.append({
            "stage": stage,
            "count": round(counts[i], 2),
            "conversion_to_next": resolved[ordered_keys[i]] if i < len(ordered_keys) else None,
        })
    return {
        "model": "plg",
        "revenue_goal_usd": float(revenue_goal),
        "average_sale_value_usd": float(average_sale_value),
        "waterfall": steps,
        "assumptions": assumed,
        "formula": "count[stage] = count[next stage] / conversion_to_next; Customers = revenue / ASV",
    }



def ecommerce_waterfall(revenue_goal: float, average_order_value: float, visitor_to_order: float | None = None,
                        visitor_to_cart: float | None = None, cart_to_order: float | None = None) -> list[dict]:
    """E-commerce / B2C funnel worked backwards: Visitors -> Add to cart -> Orders -> Revenue.

    Two conversion steps only (PMF: "work backwards from the revenue goal"); the B2B
    MQL/SAL/SQL chain does not apply to a store. Defaults (labelled assumptions): cart
    rate 6%, cart->order 30% (=> 1.8% visitor->order). If `visitor_to_order` is given it
    overrides the product of the two. $4M at a $310 AOV and 1.6% -> ~806k visitors/yr.
    """
    aov = max(float(average_order_value), 1.0)
    orders = float(revenue_goal) / aov
    if visitor_to_order:
        v2c = visitor_to_cart or min(0.95, visitor_to_order / (cart_to_order or 0.3))
        c2o = visitor_to_order / v2c
    else:
        v2c = visitor_to_cart or 0.06
        c2o = cart_to_order or 0.30
    carts = orders / max(c2o, 1e-6)
    visitors = carts / max(v2c, 1e-6)
    return [
        {"stage": "Visitors", "count": visitors, "conversion_to_next": v2c},
        {"stage": "Add to cart", "count": carts, "conversion_to_next": c2o},
        {"stage": "Orders", "count": orders, "conversion_to_next": None},
    ]

def lift(control: float, variant: float) -> float:
    """Lift % = (variant - control) / control x 100 (MST A/B testing)."""
    if control == 0:
        raise ValueError("control must be non-zero")
    return (float(variant) - float(control)) / float(control) * 100.0


def cpm(cost: float, impressions: float) -> float:
    """CPM = cost / (impressions / 1000) (MM2). $185k / 10M impressions = $18.50."""
    if impressions <= 0:
        raise ValueError("impressions must be > 0")
    return float(cost) / (float(impressions) / 1000.0)


def funnel_metrics(sent: float, opens: float, clicks: float, conversions: float, average_sale_value: float) -> dict:
    """Open rate = opens/sent; CTR = clicks/sent; conversion = conversions/clicks;
    revenue = conversions x average sale value (MST)."""
    return {
        "open_rate": (opens / sent) if sent else 0.0,
        "click_through_rate": (clicks / sent) if sent else 0.0,
        "conversion_rate": (conversions / clicks) if clicks else 0.0,
        "revenue": float(conversions) * float(average_sale_value),
        "formula": "open=opens/sent; CTR=clicks/sent; conversion=conversions/clicks; revenue=conversions x ASV",
    }


def ltv_cac(ltv: Optional[float], cac: Optional[float]) -> dict:
    """Rule: LTV must exceed CAC (PMF). Returns ratio and the verdict."""
    if ltv is None or cac is None or cac <= 0:
        return {"ltv_usd": ltv, "cac_usd": cac, "ratio": None, "ltv_exceeds_cac": None,
                "note": "LTV or CAC unknown - supply both to check the LTV > CAC rule"}
    ratio = float(ltv) / float(cac)
    return {"ltv_usd": float(ltv), "cac_usd": float(cac), "ratio": ratio, "ltv_exceeds_cac": ratio > 1.0,
            "note": "LTV must exceed CAC"}


# ---------------------------------------------------------------------------
# Influencer authenticity: follower-to-engagement rule
# ---------------------------------------------------------------------------
# The user's rule, made explicit: an account with 35k followers whose posts get
# 20-30 likes is not worth approaching (engagement ~0.07%), while a 30k account
# with 500-1,000 interactions per post (1.7-3.3%) is healthy. Benchmarks per
# tier are industry figures; the research agent refines them with sources.

INFLUENCER_TIERS: list[tuple[str, int, Optional[int]]] = [
    ("nano", 0, 10_000), ("micro", 10_000, 100_000), ("mid", 100_000, 500_000), ("macro", 500_000, None),
]
_IG_BANDS: dict[str, tuple[float, float, float]] = {  # tier -> (good, ok, poor)
    "nano": (0.04, 0.02, 0.01), "micro": (0.02, 0.01, 0.005), "mid": (0.012, 0.006, 0.003), "macro": (0.008, 0.004, 0.002),
}
# X bands: nano / micro / mid / macro (good, ok, poor) as fractions - roughly 10x below Instagram.
_X_BANDS = {"nano": (0.004, 0.0015, 0.0005), "micro": (0.002, 0.0008, 0.0003), "mid": (0.0008, 0.0003, 0.0001), "macro": (0.0005, 0.0002, 0.00008)}

DEFAULT_THRESHOLDS: dict[str, list[dict]] = {
    "instagram": [{"platform": "instagram", "tier": t, "followers_min": lo, "followers_max": hi,
                   "good_er": g, "ok_er": o, "poor_er": pr, "basis": "industry benchmark; refined by the agent's research"}
                  for (t, lo, hi), (g, o, pr) in zip(INFLUENCER_TIERS, (_IG_BANDS[t] for t, _, _ in INFLUENCER_TIERS))],
    "x": [{"platform": "x", "tier": t, "followers_min": lo, "followers_max": hi,
           "good_er": g, "ok_er": o, "poor_er": pr,
           "basis": "X engagement (likes + replies per post / followers) runs about an order of magnitude below Instagram: ~0.1% average, ~0.03% median; refined by the agent's research"}
          for (t, lo, hi), (g, o, pr) in zip(INFLUENCER_TIERS, (_X_BANDS[t] for t, _, _ in INFLUENCER_TIERS))],
}
VERDICT_REAL, VERDICT_SUSPICIOUS = 65, 40


def tier(followers: float) -> str:
    """nano < 10k, micro 10k-100k, mid 100k-500k, macro 500k+."""
    for name, lo, hi in INFLUENCER_TIERS:
        if hi is None or followers < hi:
            return name
    return "macro"


def engagement_rate(followers: float, avg_likes: float, avg_comments: float) -> float:
    """(likes + comments per post) / followers. 35k followers, 25 likes, 1 comment -> 0.0007."""
    if followers <= 0:
        return 0.0
    return (max(avg_likes, 0.0) + max(avg_comments, 0.0)) / followers


RULE_OVERRIDE: ContextVar[list[dict] | None] = ContextVar("influencer_rule_override", default=None)


@contextmanager
def using_thresholds(rows: list[dict] | None):
    """Score with the thresholds the agent researched (same shape as `thresholds()` rows) instead of the defaults."""
    token = RULE_OVERRIDE.set(rows or None)
    try:
        yield
    finally:
        RULE_OVERRIDE.reset(token)


def thresholds(platform: str) -> list[dict]:
    key = "x" if platform.lower() in ("x", "twitter") else "instagram"
    override = RULE_OVERRIDE.get()
    if override:
        rows = [dict(t) for t in override if str(t.get("platform", "")).lower() in ((key,) if key == "instagram" else ("x", "twitter"))
                and all(k in t for k in ("tier", "good_er", "poor_er"))]
        if rows:
            # fill ok_er / bounds from the defaults when the agent's rule omits them
            by_tier = {d["tier"]: d for d in DEFAULT_THRESHOLDS[key]}
            out = []
            for r in rows:
                base = dict(by_tier.get(r["tier"], {}))
                base.update({k: v for k, v in r.items() if v is not None})
                base.setdefault("ok_er", (base["good_er"] + base["poor_er"]) / 2)
                out.append(base)
            tiers_present = {r["tier"] for r in out}
            out += [dict(d) for d in DEFAULT_THRESHOLDS[key] if d["tier"] not in tiers_present]
            return sorted(out, key=lambda d: d["followers_min"])
    return [dict(t) for t in DEFAULT_THRESHOLDS[key]]


def _band(platform: str, followers: float) -> dict:
    t = tier(followers)
    return next(b for b in thresholds(platform) if b["tier"] == t)


def authenticity_score(platform: str, followers: float, following: float, avg_likes: float, avg_comments: float) -> tuple[int, str, list[str]]:
    """0-100 score, verdict and reasons.

    60 pts: engagement rate inside the tier band (0 at/below `poor`, 60 at/above `good`, linear between).
    20 pts: follower/following ratio (>= 3 -> 20; 1.2-3 -> 10; < 1.2 with > 10k followers -> 0, red flag).
    20 pts: comment/like ratio (>= 2% -> 20; 0.5-2% -> 10; < 0.5% -> 0, "likes without comments" flag).
    Engagement below half the tier's `poor` floor caps the score at 30 - that is the
    "35k followers, 25 likes" case, which must read as likely_fake whatever the ratios say.
    Verdict: real >= 65, suspicious 40-64, likely_fake < 40.
    """
    reasons: list[str] = []
    band = _band(platform, followers)
    er = engagement_rate(followers, avg_likes, avg_comments)
    good, poor = band["good_er"], band["poor_er"]
    if er >= good:
        er_pts = 60.0
    elif er <= poor:
        er_pts = 0.0
    else:
        er_pts = 60.0 * (er - poor) / (good - poor)
    reasons.append(f"engagement {er * 100:.2f}% vs {band['tier']} band good >= {good * 100:.1f}% / poor < {poor * 100:.2f}% ({platform})")

    ratio = followers / following if following and following > 0 else float(followers)
    if ratio >= 3:
        ratio_pts = 20.0
    elif ratio >= 1.2:
        ratio_pts = 10.0
    elif followers > 10_000:
        ratio_pts = 0.0
        reasons.append("follows almost as many accounts as follow it - follow-for-follow pattern")
    else:
        ratio_pts = 5.0
    cl = avg_comments / avg_likes if avg_likes and avg_likes > 0 else 0.0
    if cl >= 0.02:
        cl_pts = 20.0
    elif cl >= 0.005:
        cl_pts = 10.0
    else:
        cl_pts = 0.0
        reasons.append("likes without comments - typical of bought likes or pods")

    score = er_pts + ratio_pts + cl_pts
    if er < poor / 2:
        score = min(score, 30.0)
        reasons.append("engagement far below the tier floor - followers look bought")
    score_i = int(round(score))
    if any('follow-for-follow' in r for r in reasons):
        # reciprocal-follow audiences are mostly not real reach (HypeAuditor: follow/unfollow growth, mass followers)
        score = min(score, VERDICT_REAL - 1)
        score_i = min(score_i, VERDICT_REAL - 1)

    verdict = "real" if score_i >= VERDICT_REAL else "suspicious" if score_i >= VERDICT_SUSPICIOUS else "likely_fake"
    if verdict == "real":
        reasons.insert(0, "engagement and ratios consistent with a real audience")
    return score_i, verdict, reasons


def authenticity_report(platform: str, followers: float, following: float, avg_likes: float, avg_comments: float) -> dict:
    """authenticity_score plus every intermediate number, for the calc tool."""
    score, verdict, reasons = authenticity_score(platform, followers, following, avg_likes, avg_comments)
    return {
        "platform": platform, "tier": tier(followers), "followers": followers, "following": following,
        "engagement_rate": round(engagement_rate(followers, avg_likes, avg_comments), 5),
        "follower_following_ratio": round(followers / following, 2) if following else None,
        "comment_like_ratio": round(avg_comments / avg_likes, 4) if avg_likes else 0.0,
        "authenticity_score": score, "verdict": verdict, "reasons": reasons, "band": _band(platform, followers),
    }


# ---------------------------------------------------------------------------
# Creator audit (HypeAuditor-style vocabulary, GrowthPilot heuristics)
# ---------------------------------------------------------------------------
# HypeAuditor documents: AQS is a 1-100 score combining engagement rate, the share of
# real people among followers, follower/following growth patterns and comments
# authenticity; audience types are real people / influencers (>5,000 followers and
# <1,500 followings) / mass followers (>1,500 followings) / suspicious accounts; reachable
# followers follow fewer than 1,500 accounts; the price estimate uses country, followers,
# engagement rate and AQS. The helpers below are deterministic estimates in that
# vocabulary - they are NOT HypeAuditor's models and are labelled "estimated".

AQS_BANDS: list[tuple[int, str]] = [(80, "excellent"), (65, "good"), (50, "average"), (30, "low"), (0, "poor")]
GROWTH_POINTS: dict[str, float] = {"organic": 15.0, "unknown": 10.0, "spikes": 5.0, "follow_unfollow": 0.0}
_REACH_FACTOR: dict[str, float] = {"nano": 0.35, "micro": 0.25, "mid": 0.18, "macro": 0.12}
_IG_RATE_PER_1K: dict[str, float] = {"nano": 12.0, "micro": 10.0, "mid": 8.0, "macro": 6.0}


def _clamp(x: float, lo: float, hi: float) -> float:
    return max(lo, min(hi, x))


def _er_position(platform: str, followers: float, er: float) -> float:
    """0 at/below the tier's poor floor, 1 at/above its good line, linear between."""
    band = _band(platform, followers)
    good, poor = band["good_er"], band["poor_er"]
    if er >= good:
        return 1.0
    if er <= poor:
        return 0.0
    return (er - poor) / (good - poor)


def aqs_band(score: float) -> str:
    """>= 80 excellent, 65-79 good, 50-64 average, 30-49 low, < 30 poor."""
    for floor, label in AQS_BANDS:
        if score >= floor:
            return label
    return "poor"


def audience_type_estimate(followers: float, following: float, engagement_rate_value: float, comment_like_ratio: float,
                           platform: str = "instagram") -> dict[str, float]:
    """Estimated audience split (fractions sum to 1).

    Start from a typical healthy split (real 0.72 / influencers 0.08 / mass followers 0.12 /
    suspicious 0.08). Engagement below the tier's poor floor and a collapsed comment/like
    ratio shift weight to `suspicious` (bought followers do not interact); more than 1,500
    followings or a follower/following ratio under 1.2 shift weight to `mass_followers`
    (follow/unfollow growth attracts accounts that follow thousands).
    35k followers / 25 likes / 1 comment -> suspicious >= 0.4.
    """
    real, inf, mass, susp = 0.72, 0.08, 0.12, 0.08
    pos = _er_position(platform, followers, engagement_rate_value)
    band = _band(platform, followers)
    if engagement_rate_value < band["poor_er"]:
        deficit = 1.0 - _clamp(engagement_rate_value / band["poor_er"], 0.0, 1.0)  # 0 at the floor, 1 at zero engagement
        shift = 0.25 + 0.25 * deficit
        real -= shift; susp += shift
    elif pos < 0.5:
        shift = 0.12 * (1 - pos / 0.5)
        real -= shift; susp += shift
    if comment_like_ratio < 0.005:
        real -= 0.08; susp += 0.08
    ratio = followers / following if following and following > 0 else float("inf")
    if following > 1_500 and ratio < 1.2:
        real -= 0.18; mass += 0.18
    elif following > 1_500:
        real -= 0.08; mass += 0.08
    elif ratio < 1.2 and followers > 10_000:
        real -= 0.12; mass += 0.12
    vals = {"real_people": max(real, 0.05), "influencers": inf, "mass_followers": mass, "suspicious": susp}
    total = sum(vals.values())
    return {k: round(v / total, 3) for k, v in vals.items()}


def quality_audience(types: dict[str, float]) -> float:
    """Real people + influencers, the share HypeAuditor calls Quality Audience."""
    return round(types.get("real_people", 0.0) + types.get("influencers", 0.0), 3)


def audience_reachability(types: dict[str, float]) -> float:
    """Share following < 1,500 accounts = everyone except mass followers (estimate)."""
    return round(1.0 - types.get("mass_followers", 0.0), 3)


def authentic_engagement(engagement_rate_value: float, quality_share: float) -> float:
    """Engagement rate scaled by the quality-audience share."""
    return round(engagement_rate_value * quality_share, 5)


def er_vs_similar(platform: str, followers: float, engagement_rate_value: float) -> str:
    band = _band(platform, followers)
    if engagement_rate_value >= band["good_er"]:
        return "above"
    if engagement_rate_value >= band["ok_er"]:
        return "average"
    return "below"


def aqs(platform: str, followers: float, following: float, avg_likes: float, avg_comments: float,
        comments_authenticity: float = 0.7, growth: str = "unknown") -> tuple[int, str, dict]:
    """Audience Quality Score 1-100 (estimate) and its band.

    40 pts engagement-rate position in the tier band, 25 pts quality audience share,
    15 pts growth pattern (organic 15 / unknown 10 / spikes 5 / follow-unfollow 0),
    20 pts comments authenticity. 35k / 25 likes / 1 comment -> < 30 "poor";
    30k / 750 / 40, organic growth -> >= 65.
    """
    er = engagement_rate(followers, avg_likes, avg_comments)
    cl = avg_comments / avg_likes if avg_likes and avg_likes > 0 else 0.0
    types = audience_type_estimate(followers, following, er, cl, platform)
    quality = quality_audience(types)
    pts_er = 40.0 * _er_position(platform, followers, er)
    pts_quality = 25.0 * quality
    pts_growth = GROWTH_POINTS.get(growth, 10.0)
    pts_comments = 20.0 * _clamp(comments_authenticity, 0.0, 1.0)
    score = int(round(_clamp(pts_er + pts_quality + pts_growth + pts_comments, 1.0, 100.0)))
    detail = {"engagement_rate": round(er, 5), "audience_types": types, "quality_audience": quality,
              "points": {"engagement": round(pts_er, 1), "quality_audience": round(pts_quality, 1), "growth": pts_growth, "comments": round(pts_comments, 1)}}
    return score, aqs_band(score), detail


def estimated_reach(followers: float, reachability: float) -> int:
    """followers x reachability x tier factor (nano .35, micro .25, mid .18, macro .12)."""
    return int(round(followers * _clamp(reachability, 0.0, 1.0) * _REACH_FACTOR[tier(followers)]))


def estimated_price_usd(platform: str, followers: float, engagement_rate_value: float, aqs_score: float) -> float:
    """followers/1000 x tier rate (IG nano 12 / micro 10 / mid 8 / macro 6 USD per 1k)
    x clamp(ER / good_er, 0.5, 1.5) x AQS/80; X at 0.6x. A budgeting benchmark, not a rate card."""
    t = tier(followers)
    band = _band(platform, followers)
    mult = _clamp(engagement_rate_value / band["good_er"], 0.5, 1.5) if band["good_er"] else 1.0
    price = followers / 1000.0 * _IG_RATE_PER_1K[t] * mult * (aqs_score / 80.0)
    if platform.lower() in ("x", "twitter"):
        price *= 0.6
    return round(max(price, 5.0), 2)


def cpe_usd(price: float, avg_likes: float, avg_comments: float) -> float:
    """Cost per engagement = price / (avg likes + avg comments)."""
    interactions = max(avg_likes + avg_comments, 1.0)
    return round(price / interactions, 3)


def creator_audit(platform: str, followers: float, following: float, avg_likes: float, avg_comments: float,
                  comments_authenticity: float = 0.7, growth: str = "unknown") -> dict:
    """Every audit number at once, for the calc tool and the demo runner."""
    er = engagement_rate(followers, avg_likes, avg_comments)
    score, band, detail = aqs(platform, followers, following, avg_likes, avg_comments, comments_authenticity, growth)
    types = detail["audience_types"]
    quality = detail["quality_audience"]
    reach_share = audience_reachability(types)
    price = estimated_price_usd(platform, followers, er, score)
    return {
        "aqs": score, "aqs_band": band, "audience_types": types, "quality_audience": quality,
        "audience_reachability": reach_share, "authentic_engagement": authentic_engagement(er, quality),
        "er_vs_similar": er_vs_similar(platform, followers, er),
        "likes_comment_ratio": round(avg_likes / max(avg_comments, 1.0), 2),
        "estimated_reach": estimated_reach(followers, reach_share), "estimated_price_usd": price,
        "cpe_usd": cpe_usd(price, avg_likes, avg_comments), "points": detail["points"],
    }
