"""In-process MCP servers the agents can call.

`calc`        - the course formulas (calculators.py), so numbers are reproducible.
`growthpilot` - what the chat orchestrator needs to read the plan and propose
                work. The company/run in scope comes from a contextvar set by
                the chat route before the agent runs.
"""
from __future__ import annotations

import contextvars
import json
from typing import Any

from claude_agent_sdk import create_sdk_mcp_server, tool
from sqlmodel import select

from . import calculators as calc
from .db import session_scope
from .models import Company, Insight, Run, StageResult, Task
from .schemas import ProposedTask

# ---------------------------------------------------------------- context --

class ChatContext:
    def __init__(self, company_id: int, run_id: int | None):
        self.company_id = company_id
        self.run_id = run_id
        self.proposed_task_ids: list[int] = []
        self.insight_ids: list[int] = []
        self.rerun_requests: list[str] = []


chat_context: contextvars.ContextVar[ChatContext | None] = contextvars.ContextVar("chat_context", default=None)


def _ctx() -> ChatContext:
    ctx = chat_context.get()
    if ctx is None:
        raise RuntimeError("growthpilot tools need a chat context")
    return ctx


def _text(payload: Any) -> dict[str, Any]:
    text = payload if isinstance(payload, str) else json.dumps(payload, default=str, indent=1)
    return {"content": [{"type": "text", "text": text}]}


# ------------------------------------------------------------------- calc --

@tool("market_sizing", "TAM -> SAM -> SOM. SAM = TAM x geo_pct x segment_pct; SOM = SAM x capture_rate (fractions 0-1).",
      {"type": "object", "properties": {"tam": {"type": "number"}, "geo_pct": {"type": "number"}, "segment_pct": {"type": "number"}, "capture_rate": {"type": "number"}},
       "required": ["tam", "geo_pct", "segment_pct", "capture_rate"]})
async def t_market_sizing(args: dict[str, Any]) -> dict[str, Any]:
    return _text(calc.market_sizing(args["tam"], args["geo_pct"], args["segment_pct"], args["capture_rate"]))


@tool("reverse_waterfall", "Sales waterfall worked backwards from a revenue goal. rates keys: visitor_to_lead, lead_to_mql, mql_to_sal, sal_to_sql, sql_to_opportunity, opportunity_to_won (0-1); missing ones use course defaults.",
      {"type": "object", "properties": {"revenue_goal": {"type": "number"}, "average_sale_value": {"type": "number"}, "rates": {"type": "object", "additionalProperties": {"type": "number"}}},
       "required": ["revenue_goal", "average_sale_value"]})
async def t_reverse_waterfall(args: dict[str, Any]) -> dict[str, Any]:
    return _text(calc.reverse_waterfall(args["revenue_goal"], args["average_sale_value"], args.get("rates")))


@tool("ecommerce_waterfall", "E-commerce / B2C funnel worked backwards from a revenue goal: Visitors -> Add to cart -> Orders. Use this for stores and consumer products instead of the B2B sales waterfall. Rates are fractions 0-1; visitor_to_order overrides the two-step rates.",
      {"type": "object", "properties": {"revenue_goal": {"type": "number"}, "average_order_value": {"type": "number"}, "visitor_to_order": {"type": "number"},
                                        "visitor_to_cart": {"type": "number"}, "cart_to_order": {"type": "number"}}, "required": ["revenue_goal", "average_order_value"]})
async def t_ecommerce_waterfall(args: dict[str, Any]) -> dict[str, Any]:
    return _text({"model": "ecommerce", "waterfall": calc.ecommerce_waterfall(args["revenue_goal"], args["average_order_value"], args.get("visitor_to_order"), args.get("visitor_to_cart"), args.get("cart_to_order"))})


@tool("plg_waterfall", "PLG waterfall: Visitors -> Signup/Trial -> PQL -> Customers. rates keys: visitor_to_signup, signup_to_pql, pql_to_customer.",
      {"type": "object", "properties": {"revenue_goal": {"type": "number"}, "average_sale_value": {"type": "number"}, "rates": {"type": "object", "additionalProperties": {"type": "number"}}},
       "required": ["revenue_goal", "average_sale_value"]})
async def t_plg_waterfall(args: dict[str, Any]) -> dict[str, Any]:
    return _text(calc.plg_waterfall(args["revenue_goal"], args["average_sale_value"], args.get("rates")))


@tool("lift", "A/B lift % = (variant - control) / control x 100.",
      {"type": "object", "properties": {"control": {"type": "number"}, "variant": {"type": "number"}}, "required": ["control", "variant"]})
async def t_lift(args: dict[str, Any]) -> dict[str, Any]:
    return _text({"lift_pct": calc.lift(args["control"], args["variant"]), "formula": "(variant - control) / control x 100"})


@tool("cpm", "CPM = cost / (impressions / 1000).",
      {"type": "object", "properties": {"cost": {"type": "number"}, "impressions": {"type": "number"}}, "required": ["cost", "impressions"]})
async def t_cpm(args: dict[str, Any]) -> dict[str, Any]:
    return _text({"cpm": calc.cpm(args["cost"], args["impressions"]), "formula": "cost / (impressions / 1000)"})


@tool("funnel_metrics", "Open rate, CTR, conversion rate and revenue from sent/opens/clicks/conversions and average sale value.",
      {"type": "object", "properties": {"sent": {"type": "number"}, "opens": {"type": "number"}, "clicks": {"type": "number"}, "conversions": {"type": "number"}, "average_sale_value": {"type": "number"}},
       "required": ["sent", "opens", "clicks", "conversions", "average_sale_value"]})
async def t_funnel_metrics(args: dict[str, Any]) -> dict[str, Any]:
    return _text(calc.funnel_metrics(args["sent"], args["opens"], args["clicks"], args["conversions"], args["average_sale_value"]))


@tool("ltv_cac", "LTV / CAC ratio and whether LTV exceeds CAC.",
      {"type": "object", "properties": {"ltv": {"type": ["number", "null"]}, "cac": {"type": ["number", "null"]}}, "required": []})
async def t_ltv_cac(args: dict[str, Any]) -> dict[str, Any]:
    return _text(calc.ltv_cac(args.get("ltv"), args.get("cac")))


@tool("x_profile", "LIVE X (Twitter) data for a handle: followers, following, bio, and likes / replies / reposts / views averaged over its ~12 most recent original posts (replies and reposts excluded), plus the 5 latest posts with links. Use it for every X candidate; avg_comments = avg replies.",
      {"type": "object", "properties": {"handle": {"type": "string"}}, "required": ["handle"]})
async def t_x_profile(args: dict[str, Any]) -> dict[str, Any]:
    from . import social
    return _text(await social.x_profile(args["handle"]))


@tool("instagram_profile", "LIVE Instagram follower / following / post counts and bio for a handle (from the public link preview). Use it to verify every Instagram candidate's counts; per-post likes are not included.",
      {"type": "object", "properties": {"handle": {"type": "string"}}, "required": ["handle"]})
async def t_instagram_profile(args: dict[str, Any]) -> dict[str, Any]:
    from . import social
    return _text(await social.instagram_profile(args["handle"]))


@tool("engagement_rate", "Influencer engagement rate = (avg_likes + avg_comments) / followers, as a fraction 0-1.",
      {"type": "object", "properties": {"followers": {"type": "number"}, "avg_likes": {"type": "number"}, "avg_comments": {"type": "number"}},
       "required": ["followers", "avg_likes", "avg_comments"]})
async def t_engagement_rate(args: dict[str, Any]) -> dict[str, Any]:
    er = calc.engagement_rate(args["followers"], args["avg_likes"], args["avg_comments"])
    return _text({"engagement_rate": round(er, 5), "percent": round(er * 100, 3), "tier": calc.tier(args["followers"]), "formula": "(avg_likes + avg_comments) / followers"})


@tool("authenticity_score", "Real-vs-fake score 0-100 for an Instagram or X account from followers, following, avg likes and avg comments per post; returns verdict real | suspicious | likely_fake with reasons. Always use this instead of estimating.",
      {"type": "object", "properties": {"platform": {"type": "string", "enum": ["instagram", "x"]}, "followers": {"type": "number"}, "following": {"type": "number"},
                                        "avg_likes": {"type": "number"}, "avg_comments": {"type": "number"},
                                        "thresholds": {"type": "array", "description": "optional: the rule rows you researched (platform, tier, good_er, ok_er, poor_er) - used instead of the defaults", "items": {"type": "object"}}},
       "required": ["platform", "followers", "following", "avg_likes", "avg_comments"]})
async def t_authenticity_score(args: dict[str, Any]) -> dict[str, Any]:
    with calc.using_thresholds(args.get("thresholds")):
        return _text(calc.authenticity_report(args["platform"], args["followers"], args["following"], args["avg_likes"], args["avg_comments"]))


@tool("thresholds", "Engagement-rate thresholds (good / ok / poor) per follower tier for a platform (instagram | x).",
      {"type": "object", "properties": {"platform": {"type": "string", "enum": ["instagram", "x"]}}, "required": ["platform"]})
async def t_thresholds(args: dict[str, Any]) -> dict[str, Any]:
    return _text(calc.thresholds(args["platform"]))


@tool("audience_type_estimate", "Estimated audience split in HypeAuditor vocabulary - real_people / influencers (>5k followers, <1.5k followings) / mass_followers (>1.5k followings) / suspicious (bots, bought) - from followers, following, engagement rate (0-1) and comment/like ratio. Fractions sum to 1.",
      {"type": "object", "properties": {"platform": {"type": "string", "enum": ["instagram", "x"]}, "followers": {"type": "number"}, "following": {"type": "number"},
                                        "engagement_rate": {"type": "number"}, "comment_like_ratio": {"type": "number"}},
       "required": ["platform", "followers", "following", "engagement_rate", "comment_like_ratio"]})
async def t_audience_type_estimate(args: dict[str, Any]) -> dict[str, Any]:
    types = calc.audience_type_estimate(args["followers"], args["following"], args["engagement_rate"], args["comment_like_ratio"], args["platform"])
    return _text({"audience_types": types, "quality_audience": calc.quality_audience(types), "audience_reachability": calc.audience_reachability(types), "data_quality": "estimated"})


@tool("aqs", "Audience Quality Score 1-100 (estimate) with band excellent/good/average/low/poor: 40 pts engagement-rate band position, 25 pts quality audience, 15 pts growth pattern (organic|unknown|spikes|follow_unfollow), 20 pts comments authenticity (0-1). Returns every audit number: audience types, reachability, authentic engagement, ER vs similar, likes/comment ratio, estimated reach, price and CPE. Always use this instead of estimating.",
      {"type": "object", "properties": {"platform": {"type": "string", "enum": ["instagram", "x"]}, "followers": {"type": "number"}, "following": {"type": "number"},
                                        "avg_likes": {"type": "number"}, "avg_comments": {"type": "number"},
                                        "comments_authenticity": {"type": "number"}, "growth": {"type": "string", "enum": ["organic", "spikes", "follow_unfollow", "unknown"]},
                                        "thresholds": {"type": "array", "description": "optional: the rule rows you researched (platform, tier, good_er, ok_er, poor_er) - used instead of the defaults", "items": {"type": "object"}}},
       "required": ["platform", "followers", "following", "avg_likes", "avg_comments"]})
async def t_aqs(args: dict[str, Any]) -> dict[str, Any]:
    with calc.using_thresholds(args.get("thresholds")):
        return _text(calc.creator_audit(args["platform"], args["followers"], args["following"], args["avg_likes"], args["avg_comments"],
                                        float(args.get("comments_authenticity", 0.7)), args.get("growth", "unknown")))


@tool("estimated_reach", "Estimated accounts reached per post = followers x reachability (0-1) x tier factor (nano .35, micro .25, mid .18, macro .12).",
      {"type": "object", "properties": {"followers": {"type": "number"}, "reachability": {"type": "number"}}, "required": ["followers", "reachability"]})
async def t_estimated_reach(args: dict[str, Any]) -> dict[str, Any]:
    return _text({"estimated_reach": calc.estimated_reach(args["followers"], args["reachability"]), "data_quality": "estimated"})


@tool("estimated_price", "Estimated price per sponsored post (USD) from platform, followers, engagement rate (0-1) and AQS; also returns cost per engagement when avg_likes/avg_comments are given. A budgeting benchmark, not a rate card.",
      {"type": "object", "properties": {"platform": {"type": "string", "enum": ["instagram", "x"]}, "followers": {"type": "number"}, "engagement_rate": {"type": "number"},
                                        "aqs": {"type": "number"}, "avg_likes": {"type": "number"}, "avg_comments": {"type": "number"}},
       "required": ["platform", "followers", "engagement_rate", "aqs"]})
async def t_estimated_price(args: dict[str, Any]) -> dict[str, Any]:
    price = calc.estimated_price_usd(args["platform"], args["followers"], args["engagement_rate"], args["aqs"])
    out = {"estimated_price_usd": price, "data_quality": "estimated"}
    if "avg_likes" in args:
        out["cpe_usd"] = calc.cpe_usd(price, args["avg_likes"], float(args.get("avg_comments", 0)))
    return _text(out)


calc_server = create_sdk_mcp_server(name="calc", version="1.0.0",
                                    tools=[t_x_profile, t_instagram_profile, t_market_sizing, t_reverse_waterfall, t_plg_waterfall, t_ecommerce_waterfall, t_lift, t_cpm, t_funnel_metrics, t_ltv_cac,
                                           t_engagement_rate, t_authenticity_score, t_thresholds,
                                           t_audience_type_estimate, t_aqs, t_estimated_reach, t_estimated_price])
CALC_TOOL_NAMES = ["mcp__calc__market_sizing", "mcp__calc__reverse_waterfall", "mcp__calc__plg_waterfall",
                   "mcp__calc__lift", "mcp__calc__cpm", "mcp__calc__funnel_metrics", "mcp__calc__ltv_cac"]


# ------------------------------------------------------------ growthpilot --

@tool("get_company", "The company profile in scope.", {"type": "object", "properties": {}})
async def g_get_company(args: dict[str, Any]) -> dict[str, Any]:
    ctx = _ctx()
    with session_scope() as s:
        c = s.get(Company, ctx.company_id)
        return _text(c.profile if c else {"error": "no company"})


@tool("list_stage_summaries", "One-line summary and status of every stage of the latest run.", {"type": "object", "properties": {}})
async def g_list_stage_summaries(args: dict[str, Any]) -> dict[str, Any]:
    ctx = _ctx()
    if ctx.run_id is None:
        return _text("No run yet - start one from the dashboard.")
    with session_scope() as s:
        rows = s.exec(select(StageResult).where(StageResult.run_id == ctx.run_id).order_by(StageResult.number)).all()
        return _text([{"number": r.number, "key": r.key, "title": r.title, "status": r.status, "summary": r.summary} for r in rows])


@tool("get_stage_result", "Full JSON output of one stage by key (e.g. market_sizing, review).",
      {"type": "object", "properties": {"key": {"type": "string"}}, "required": ["key"]})
async def g_get_stage_result(args: dict[str, Any]) -> dict[str, Any]:
    ctx = _ctx()
    if ctx.run_id is None:
        return _text("No run yet.")
    with session_scope() as s:
        row = s.exec(select(StageResult).where(StageResult.run_id == ctx.run_id, StageResult.key == args["key"])).first()
        return _text(row.output if row and row.output else f"stage {args['key']} has no output yet")


@tool("list_tasks", "Execution tasks for this company with status.", {"type": "object", "properties": {}})
async def g_list_tasks(args: dict[str, Any]) -> dict[str, Any]:
    ctx = _ctx()
    with session_scope() as s:
        rows = s.exec(select(Task).where(Task.company_id == ctx.company_id).order_by(Task.id)).all()
        return _text([{"id": t.id, "agent": t.agent, "action": t.action, "title": t.title, "status": t.status, "integration": t.integration, "error": t.error} for t in rows])


@tool("propose_task", "Propose an execution task; it waits for the user's approval. action is one of write_ad_copy, write_landing_page, write_email_sequence, write_social_posts, design_ab_test, draft_outreach_emails, generate_ad_images, generate_ad_video, competitor_deep_dive, influencer_research. integration: gmail | higgsfield | firecrawl | null.",
      {"type": "object", "properties": {"agent": {"type": "string"}, "action": {"type": "string"}, "title": {"type": "string"}, "description": {"type": "string"},
                                        "inputs": {"type": "object"}, "estimated_cost": {"type": "string"}, "integration": {"type": ["string", "null"]}},
       "required": ["agent", "action", "title", "description"]})
async def g_propose_task(args: dict[str, Any]) -> dict[str, Any]:
    from . import integrations  # local import: avoids a cycle at import time
    ctx = _ctx()
    if ctx.run_id is None:
        return _text("Cannot propose a task before a run exists.")
    pt = ProposedTask(agent=args["agent"], action=args["action"], title=args["title"], description=args["description"],
                      inputs=args.get("inputs") or {}, estimated_cost=args.get("estimated_cost") or "unknown",
                      requires_approval=True, integration=args.get("integration") or None)
    status, error = "proposed", None
    if pt.integration and not integrations.is_connected(pt.integration):
        status, error = "blocked", f"Connect {pt.integration} to run"
    with session_scope() as s:
        t = Task(run_id=ctx.run_id, company_id=ctx.company_id, agent=pt.agent, action=pt.action, title=pt.title,
                 description=pt.description, inputs=pt.inputs, estimated_cost=pt.estimated_cost,
                 requires_approval=True, integration=pt.integration, status=status, error=error)
        s.add(t); s.commit(); s.refresh(t)
        ctx.proposed_task_ids.append(t.id)
        return _text({"task_id": t.id, "status": status, "note": error or "waiting for approval"})


@tool("add_insight", "Record an opportunity, risk or gap (severity high|medium|low).",
      {"type": "object", "properties": {"kind": {"type": "string"}, "severity": {"type": "string"}, "title": {"type": "string"}, "detail": {"type": "string"}},
       "required": ["kind", "severity", "title", "detail"]})
async def g_add_insight(args: dict[str, Any]) -> dict[str, Any]:
    ctx = _ctx()
    if ctx.run_id is None:
        return _text("Cannot record an insight before a run exists.")
    with session_scope() as s:
        i = Insight(run_id=ctx.run_id, kind=args["kind"], severity=args["severity"], title=args["title"], detail=args["detail"])
        s.add(i); s.commit(); s.refresh(i)
        ctx.insight_ids.append(i.id)
        return _text({"insight_id": i.id})


@tool("request_stage_rerun", "Ask the orchestrator to redo one stage (and everything after it) because an input changed.",
      {"type": "object", "properties": {"key": {"type": "string"}}, "required": ["key"]})
async def g_request_stage_rerun(args: dict[str, Any]) -> dict[str, Any]:
    ctx = _ctx()
    ctx.rerun_requests.append(args["key"])
    return _text({"queued": args["key"], "note": "the stage will be re-run from the dashboard after this reply"})


growthpilot_server = create_sdk_mcp_server(name="growthpilot", version="1.0.0",
                                           tools=[g_get_company, g_list_stage_summaries, g_get_stage_result, g_list_tasks,
                                                  g_propose_task, g_add_insight, g_request_stage_rerun])
GROWTHPILOT_TOOL_NAMES = ["mcp__growthpilot__get_company", "mcp__growthpilot__list_stage_summaries", "mcp__growthpilot__get_stage_result",
                          "mcp__growthpilot__list_tasks", "mcp__growthpilot__propose_task", "mcp__growthpilot__add_insight",
                          "mcp__growthpilot__request_stage_rerun"]
