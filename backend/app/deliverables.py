"""Deterministic markdown renderers: stage outputs -> deliverables. No model
calls here, so a deliverable is always reproducible from its stage JSON."""
from __future__ import annotations

from typing import Any

import markdown as _md
from sqlmodel import select

from .db import session_scope
from .models import Company, Deliverable, StageResult, Task


# ------------------------------------------------------------ helpers ----

def money(x: Any) -> str:
    try:
        v = float(x)
    except (TypeError, ValueError):
        return str(x)
    if abs(v) >= 1e9:
        return f"${v / 1e9:,.1f}B"
    if abs(v) >= 1e6:
        return f"${v / 1e6:,.1f}M"
    if abs(v) >= 1e3:
        return f"${v / 1e3:,.0f}K"
    return f"${v:,.0f}"


def pct(x: Any) -> str:
    try:
        return f"{float(x) * 100:.0f}%"
    except (TypeError, ValueError):
        return str(x)


def table(headers: list[str], rows: list[list[Any]]) -> str:
    if not rows:
        return "_none_\n"
    out = ["| " + " | ".join(headers) + " |", "|" + "|".join(["---"] * len(headers)) + "|"]
    for r in rows:
        out.append("| " + " | ".join(str(c).replace("|", "/").replace("\n", " ") for c in r) + " |")
    return "\n".join(out) + "\n"


def bullets(items: list[Any]) -> str:
    return "\n".join(f"- {i}" for i in items) + "\n" if items else "_none_\n"


def kv(d: dict[str, Any]) -> str:
    return "\n".join(f"- **{k.replace('_', ' ')}**: {v}" for k, v in d.items()) + "\n" if d else "_none_\n"


def to_html(md_text: str) -> str:
    body = _md.markdown(md_text, extensions=["tables", "fenced_code"])
    return ("<!doctype html><html><head><meta charset='utf-8'><title>GrowthPilot deliverable</title>"
            "<style>body{font-family:Inter,system-ui,sans-serif;max-width:860px;margin:40px auto;padding:0 20px;line-height:1.55}"
            "table{border-collapse:collapse;width:100%}td,th{border:1px solid #ddd;padding:6px 8px;text-align:left;vertical-align:top}"
            "th{background:#f4f4f5}h1,h2,h3{font-family:'Space Grotesk',Inter,sans-serif}</style></head><body>"
            f"{body}</body></html>")


# ----------------------------------------------------------- renderers ----

def render_market_research(name: str, s: dict[str, dict]) -> tuple[str, dict]:
    sa, ms, tm = s.get("situation_analysis") or {}, s.get("market_sizing") or {}, s.get("target_market") or {}
    md = [f"# Market research - {name}\n"]
    if sa:
        md += ["## Situation analysis\n", f"**Environment.** {sa.get('environment', '')}\n", f"**Customers.** {sa.get('customers', '')}\n",
               "**Competitors**\n", bullets(sa.get("competitors", [])), "**Collaborators**\n", bullets(sa.get("collaborators", [])),
               "### Value gaps\n", table(["Gap", "Who has it", "Evidence", "Served today by", "Why underserved"],
                                        [[g.get("gap"), g.get("who_has_it"), g.get("evidence"), g.get("served_today_by"), g.get("why_underserved")] for g in sa.get("value_gaps", [])])]
    if ms:
        md += ["## Market sizing\n",
               table(["Layer", "Definition", "Value"], [["TAM", ms.get("tam_definition"), money(ms.get("tam_usd"))],
                                                        ["SAM", ms.get("sam_definition"), f"{money(ms.get('sam_usd'))} (TAM x {pct(ms.get('geo_pct'))} geo x {pct(ms.get('segment_pct'))} segment)"],
                                                        ["SOM", ms.get("som_definition"), f"{money(ms.get('som_usd'))} (SAM x {pct(ms.get('capture_rate'))} capture)"]]),
               "### Assumptions\n", table(["Assumption", "Value", "Basis"], [[a.get("name"), a.get("value"), a.get("basis")] for a in ms.get("assumptions", [])])]
    if tm:
        md += ["## Target market\n", f"**Market name:** {tm.get('market_name', '')}\n", f"**Chosen:** {', '.join(tm.get('chosen', []))}\n",
               table(["Market", "Problem", "Size 1-10", "Compelling", "Will pay", "Big enough", "Score"],
                     [[c.get("market"), c.get("problem"), c.get("problem_size_1_10"), c.get("offering_compelling"), c.get("evidence_will_pay"), c.get("big_enough"), c.get("score")] for c in tm.get("candidates", [])]),
               "**Sub-segments**\n", bullets(tm.get("sub_segments", [])), "**Descriptors**\n", kv(tm.get("descriptors", {})), f"\n{tm.get('rationale', '')}\n"]
    sources = (sa.get("sources", []) if sa else []) + (ms.get("sources", []) if ms else [])
    if sources:
        md += ["## Sources\n", bullets([f"[{x.get('title')}]({x.get('url')})" for x in sources])]
    meta = {"tam_usd": ms.get("tam_usd"), "sam_usd": ms.get("sam_usd"), "som_usd": ms.get("som_usd"), "value_gaps": len(sa.get("value_gaps", [])) if sa else 0}
    return "\n".join(md), meta


def render_personas_icp(name: str, s: dict[str, dict]) -> tuple[str, dict]:
    a = s.get("audience") or {}
    md = [f"# Personas, ICP & segments - {name}\n", "## Ideal customer profile\n", f"{a.get('icp', '')}\n", "**Shared traits**\n", bullets(a.get("icp_shared_traits", []))]
    for p in a.get("personas", []):
        md += [f"## {p.get('name')} - {p.get('title')} ({str(p.get('buying_role', '')).replace('_', ' ')})\n", f"{p.get('page1', '')}\n",
               "**Touchpoints**\n", bullets(p.get("touchpoints", [])), "**Motivations**\n", bullets(p.get("motivations", [])),
               "**Tidbits**\n", bullets(p.get("tidbits", [])), f"_Grounded in: {p.get('data_basis', '')}_\n"]
    md += ["## Segments\n", table(["Segment", "Demographic", "Firmographic", "Geographic", "Intent", "Share"],
                                  [[x.get("name"), x.get("demographic"), x.get("firmographic"), x.get("geographic"), x.get("behavioural_intent"), f"{x.get('share_pct')}%"] for x in a.get("segments", [])]),
           "## Message by buying role\n", kv(a.get("messaging_by_role", {}))]
    return "\n".join(md), {"personas": len(a.get("personas", [])), "segments": len(a.get("segments", []))}


def render_positioning_brief(name: str, s: dict[str, dict]) -> tuple[str, dict]:
    p, g = s.get("positioning") or {}, s.get("gtm_motion") or {}
    md = [f"# Positioning brief - {name}\n", f"> {p.get('positioning_line', '')}\n", "## Problem - Solution - Outcome\n", f"{p.get('problem_solution_outcome', '')}\n",
          f"**Frame of reference:** {p.get('frame_of_reference', '')}\n", f"**Point of difference:** {p.get('point_of_difference', '')}\n",
          "## Benefits\n", table(["Functional", "Emotional", "Economic", "Social"],
                                 [[", ".join(p.get("functional_benefits", [])), ", ".join(p.get("emotional_benefits", [])), ", ".join(p.get("economic_benefits", [])), ", ".join(p.get("social_benefits", []))]]),
          "## Message by platform\n", kv(p.get("message_by_platform", {}))]
    if g:
        md += ["## Go-to-market motion\n", kv({"business type": g.get("business_type"), "ease of seeing value": g.get("ease_of_seeing_value"), "ease of getting started": g.get("ease_of_getting_started"),
                                              "motion": str(g.get("motion", "")).replace("_", " "), "PLG applicable": g.get("plg_applicable"), "two-sided platform": g.get("platform_two_sided")}), f"\n{g.get('rationale', '')}\n"]
    return "\n".join(md), {"motion": g.get("motion"), "positioning_line": p.get("positioning_line")}


def render_pricing_analysis(name: str, s: dict[str, dict]) -> tuple[str, dict]:
    mm = s.get("marketing_mix") or {}
    pr = mm.get("price") or {}
    md = [f"# Pricing analysis - {name}\n", "## The six steps\n",
          kv({"1. price objective": pr.get("price_objective"), "2. demand and elasticity": pr.get("demand_and_elasticity"), "3. cost floor": pr.get("cost_floor"),
              "4. competitor prices": ", ".join(pr.get("competitor_prices", [])), "5. method": pr.get("method"), "6. recommended price": pr.get("recommended_price")}),
          f"\n**Strategy:** {pr.get('strategy', '')}\n", "## True economic value\n", f"{pr.get('true_economic_value', '')}\n", "## Psychology notes\n", bullets(pr.get("psychology_notes", []))]
    prod = mm.get("product") or {}
    if prod:
        md += ["## Product levels (Levitt)\n", kv({k: prod.get(k) for k in ("core_benefit", "basic", "expected", "augmented", "potential")}),
               f"\n**Classification:** {prod.get('classification')} - **life-cycle stage:** {prod.get('life_cycle_stage')}\n"]
    return "\n".join(md), {"recommended_price": pr.get("recommended_price"), "strategy": pr.get("strategy")}


def render_gtm_plan(name: str, s: dict[str, dict]) -> tuple[str, dict]:
    ob, dm, bj, cp, gp, rv = (s.get(k) or {} for k in ("objectives", "demand_math", "buyer_journey", "comms_plan", "gtm_plan", "review"))
    md = [f"# Go-to-market plan - {name}\n"]
    if gp:
        md += ["## Six pillars\n", "**Objectives**\n", bullets(gp.get("objectives", [])), "**Target segments**\n", bullets(gp.get("target_segments", [])),
               f"**Value proposition.** {gp.get('value_proposition', '')}\n", f"**Channel strategy.** {gp.get('channel_strategy', '')}\n", f"**Budget.** {gp.get('budget_summary', '')}\n",
               "## 90-day timeline\n", table(["Phase", "Week", "Milestone", "Owner", "Depends on"], [[str(m.get("phase", "")).replace("_", "-"), m.get("week"), m.get("milestone"), m.get("owner"), m.get("depends_on")] for m in gp.get("timeline", [])])]
    if ob:
        md += ["## OKRs\n"] + [f"**{o.get('level')}** - {o.get('objective')}\n" + bullets(o.get("key_results", [])) for o in ob.get("okrs", [])]
        md += ["### SMART goals\n", table(["Goal", "Metric", "Target", "Deadline"], [[g.get("goal"), g.get("metric"), g.get("target"), g.get("deadline")] for g in ob.get("smart_goals", [])]),
               "### Alignment audit\n", table(["Corporate KR", "Initiative", "KPI", "Alignment", "Recommendation"], [[r.get("corporate_kr"), r.get("campaign_initiative"), r.get("campaign_kpi"), r.get("alignment"), r.get("recommendation")] for r in ob.get("alignment_audit", [])])]
    if dm:
        md += ["## Demand math\n", f"Revenue goal {money(dm.get('revenue_goal_usd'))} at an average sale of {money(dm.get('average_sale_value_usd'))} ({dm.get('model')} model).\n",
               table(["Stage", "Count", "Conversion to next"], [[w.get("stage"), f"{float(w.get('count') or 0):,.0f}", pct(w.get("conversion_to_next")) if w.get("conversion_to_next") is not None else "-"] for w in dm.get("waterfall", [])]),
               f"Monthly visitors needed: **{float(dm.get('monthly_visitors_needed') or 0):,.0f}**. LTV {money(dm.get('ltv_usd')) if dm.get('ltv_usd') else 'unknown'} / CAC {money(dm.get('cac_usd')) if dm.get('cac_usd') else 'unknown'}"
               + (f" = {dm.get('ltv_cac_ratio'):.1f}x ({'LTV exceeds CAC' if dm.get('ltv_exceeds_cac') else 'LTV does NOT exceed CAC'})" if dm.get("ltv_cac_ratio") else "") + "\n",
               "**Assumptions**\n", bullets([f"{a.get('name')} = {a.get('value')} ({a.get('basis')})" for a in dm.get("assumptions", [])])]
    if bj:
        md += ["## Buyer's journey\n", table(["Stage", "Persona", "Needs", "Messages", "Content", "Vehicles"],
                                           [[j.get("stage"), j.get("persona"), "; ".join(j.get("needs_and_questions", [])), "; ".join(j.get("messages", [])), "; ".join(j.get("content", [])), "; ".join(j.get("vehicles", []))] for j in bj.get("stages", [])])]
    if cp:
        md += ["## Communications plan (6 M's)\n", kv({"market": cp.get("market"), "mission": cp.get("mission"), "message": cp.get("message"), "media": ", ".join(cp.get("media", [])), "money": cp.get("money"), "measurement": ", ".join(cp.get("measurement", []))}),
               f"\n> IMC line: {cp.get('imc_positioning_line', '')}\n", "### Channel plan\n", table(["Channel", "Role", "Budget %", "Monthly $", "KPI"], [[c.get("channel"), c.get("role"), c.get("budget_pct"), money(c.get("monthly_budget_usd")), c.get("kpi")] for c in cp.get("channel_plan", [])])]
    if rv:
        md += ["## Review\n", table(["Lens", "Verdict", "Finding", "Fix"], [[str(l.get("lens", "")).replace("_", " "), l.get("verdict"), l.get("finding"), l.get("fix")] for l in rv.get("lenses", [])]),
               "### Recommendations\n", table(["Priority", "Horizon", "Recommendation", "Detail"], [[r.get("priority"), r.get("horizon"), r.get("title"), r.get("detail")] for r in rv.get("recommendations", [])]),
               "### Tactics matrix\n", table(["Funnel stage", "Tactic", "Channel", "Priority", "Agent", "Cost"], [[t.get("funnel_stage"), t.get("tactic"), t.get("channel"), t.get("priority"), t.get("agent"), t.get("estimated_cost")] for t in rv.get("tactics_matrix", [])]),
               f"\nPlan readiness: **{rv.get('plan_readiness_pct')}%**\n"]
    return "\n".join(md), {"plan_readiness_pct": rv.get("plan_readiness_pct"), "milestones": len(gp.get("timeline", [])), "monthly_visitors_needed": dm.get("monthly_visitors_needed")}


RUN_RENDERERS: list[tuple[str, str, list[str], Any]] = [
    ("market_research", "Market research", ["situation_analysis", "market_sizing", "target_market"], render_market_research),
    ("personas_icp", "Personas & ICP", ["audience"], render_personas_icp),
    ("positioning_brief", "Positioning brief", ["positioning", "gtm_motion"], render_positioning_brief),
    ("pricing_analysis", "Pricing analysis", ["marketing_mix"], render_pricing_analysis),
    ("gtm_plan", "GTM plan & 90-day timeline", ["objectives", "demand_math", "buyer_journey", "comms_plan", "gtm_plan", "review"], render_gtm_plan),
]


def build_run_deliverables(run_id: int) -> list[int]:
    """Create one deliverable per renderer whose stages have output. Returns ids."""
    with session_scope() as s:
        stages = s.exec(select(StageResult).where(StageResult.run_id == run_id)).all()
        outputs = {st.key: st.output for st in stages if st.output}
        agents = {st.key: st for st in stages}
        from .models import Run
        run = s.get(Run, run_id)
        company = s.get(Company, run.company_id)
        name = company.name if company else "Company"
        ids: list[int] = []
        for kind, title, keys, fn in RUN_RENDERERS:
            if not any(k in outputs for k in keys):
                continue
            md, meta = fn(name, outputs)
            generated_by = ", ".join(sorted({_agent_for(k) for k in keys if k in outputs}))
            existing = s.exec(select(Deliverable).where(Deliverable.run_id == run_id, Deliverable.kind == kind)).first()
            if existing:
                existing.content_md, existing.meta, existing.generated_by = md, meta, generated_by
                s.add(existing); s.commit(); ids.append(existing.id)
            else:
                d = Deliverable(run_id=run_id, company_id=run.company_id, kind=kind, title=title, content_md=md, meta=meta, generated_by=generated_by)
                s.add(d); s.commit(); s.refresh(d); ids.append(d.id)
        return ids


def _agent_for(key: str) -> str:
    from .schemas import STAGES
    for spec in STAGES:
        if spec.key == key:
            return f"{spec.agent} agent"
    return "agent"


# ----------------------------------------------------- task deliverables --

def render_content_pack(name: str, task: Task, r: dict) -> tuple[str, dict]:
    md = [f"# Content pack - {task.title}\n", f"_{task.description}_\n"]
    for p in r.get("pieces", []):
        a = p.get("adplane", {})
        md += [f"## {p.get('kind')} / {p.get('channel')} - variant {p.get('variant')}\n", f"**{p.get('headline')}**\n", f"{p.get('body')}\n", f"CTA: _{p.get('cta')}_\n",
               f"ADPLANE {a.get('total')}/49 - A{a.get('attention')} D{a.get('distinction')} P{a.get('positioning')} L{a.get('linkage')} A{a.get('amplification')} N{a.get('net_equity')} E{a.get('emotion')}\n"]
    md += ["## A/B tests\n", table(["Hypothesis", "Variable", "Stage", "Metric", "Control", "Variant", "Confidence", "Sample"],
                                   [[t.get("hypothesis"), t.get("variable"), t.get("funnel_stage"), t.get("metric"), t.get("control"), t.get("variant"), f"{t.get('confidence_level')}%", t.get("sample_size_note")] for t in r.get("ab_tests", [])])]
    return "\n".join(md), {"pieces": len(r.get("pieces", [])), "ab_tests": len(r.get("ab_tests", []))}


def render_outreach(name: str, task: Task, r: dict) -> tuple[str, dict]:
    md = [f"# Outreach drafts - {task.title}\n", f"_{r.get('sequence_note', '')}_\n"]
    for e in r.get("emails", []):
        md += [f"## To: {str(e.get('to_role', '')).replace('_', ' ')} ({e.get('persona')})\n", f"**Subject:** {e.get('subject')}\n", f"{e.get('body')}\n"]
    if r.get("draft_ids"):
        md += ["## Gmail drafts created\n", bullets(r["draft_ids"])]
    return "\n".join(md), {"emails": len(r.get("emails", [])), "draft_ids": r.get("draft_ids", [])}


def render_creatives(name: str, task: Task, r: dict) -> tuple[str, dict]:
    md = [f"# Ad creatives - {task.title}\n", "## Prompts\n", bullets(r.get("prompts", [])), f"**Aspect ratios:** {', '.join(r.get('aspect_ratios', []))}\n"]
    if r.get("quote_credits") is not None:
        md.append(f"**Quoted cost:** ~{r.get('quote_credits')} credits (render waits for approval)\n")
    if r.get("assets"):
        md += ["## Rendered assets\n", bullets([f"[{u}]({u})" for u in r["assets"]])]
    return "\n".join(md), {"prompts": len(r.get("prompts", [])), "assets": r.get("assets", []), "quote_credits": r.get("quote_credits")}


def render_research_task(name: str, task: Task, r: dict) -> tuple[str, dict]:
    rows = r.get("competitors", [])
    headers = sorted({k for row in rows for k in row.keys()}) if rows else ["name"]
    md = [f"# Competitor deep-dive - {task.title}\n", table(headers, [[row.get(h, "") for h in headers] for row in rows]), f"\n{r.get('positioning_map_note', '')}\n",
          "## Sources\n", bullets([f"[{x.get('title')}]({x.get('url')})" for x in r.get("sources", [])])]
    return "\n".join(md), {"competitors": len(rows)}


def _audit_block(a: dict | None) -> str:
    """HypeAuditor-style audit lines for one creator (GrowthPilot estimates)."""
    if not a:
        return ""
    t = a.get("audience_types") or {}
    pct = lambda v: f"{(v or 0) * 100:.0f}%"  # noqa: E731
    lines = [
        "**Audit (estimated)**",
        f"- AQS {a.get('aqs')}/100 ({a.get('aqs_band')}) - authentic engagement {(a.get('authentic_engagement') or 0) * 100:.2f}%, ER {a.get('er_vs_similar')} similar accounts",
        f"- Audience: real people {pct(t.get('real_people'))}, influencers {pct(t.get('influencers'))}, mass followers {pct(t.get('mass_followers'))}, suspicious {pct(t.get('suspicious'))} - quality audience {pct(a.get('quality_audience'))}, reachability {pct(a.get('audience_reachability'))}",
        f"- Comments authenticity {pct(a.get('comments_authenticity'))}, likes/comment ratio {a.get('likes_comment_ratio')}, likes spread {a.get('likes_spread')}",
        f"- Growth: {a.get('followers_growth')} - {a.get('growth_note', '')}" + (f" (yearly {pct(a.get('yearly_growth_rate'))})" if a.get("yearly_growth_rate") is not None else ""),
        f"- Est. reach {a.get('estimated_reach') or 0:,} / post, est. price ${a.get('estimated_price_usd') or 0:,.0f}, CPE ${a.get('cpe_usd') or 0:.2f}",
    ]
    if a.get("brand_mentions"):
        lines.append(f"- Brand mentions: {', '.join(a['brand_mentions'])}" + (f" - sponsored share {pct(a.get('sponsored_share'))}" if a.get("sponsored_share") is not None else ""))
    if a.get("signals"):
        lines.append("- Signals: " + "; ".join(a["signals"]))
    return "\n".join(lines) + "\n"


def render_influencer_list(name: str, task: Task, r: dict) -> tuple[str, dict]:
    rule = r.get("rule", {})
    cands = r.get("candidates", [])
    md = [f"# Influencer shortlist - {task.title}\n", f"{r.get('product_summary', '')}\n", "## The rule\n", f"{rule.get('summary', '')}\n",
          table(["Platform", "Tier", "Followers", "Good ER", "OK ER", "Poor ER"],
                [[t.get("platform"), t.get("tier"), f"{t.get('followers_min'):,}-{t.get('followers_max') or '+'}", f"{t.get('good_er', 0) * 100:.2f}%",
                  f"{t.get('ok_er', 0) * 100:.2f}%", f"{t.get('poor_er', 0) * 100:.2f}%"] for t in rule.get("thresholds", [])]),
          "\n**Red flags:** " + "; ".join(rule.get("red_flags", [])) + "\n",
          "## Ranked creators\n",
          table(["#", "Handle", "Platform", "Followers", "Avg interactions", "ER", "Score", "Verdict", "Fit"],
                [[c.get("rank"), c.get("handle"), c.get("platform"), f"{c.get('followers', 0):,}", f"{(c.get('avg_likes', 0) + c.get('avg_comments', 0)):,.0f}",
                  f"{c.get('engagement_rate', 0) * 100:.2f}%", c.get("authenticity_score"), c.get("verdict"), c.get("audience_fit")] for c in cands])]
    for c in cands:
        md += [f"\n### {c.get('rank')}. {c.get('name')} ({c.get('handle')}, {c.get('platform')}) - {c.get('verdict')} {c.get('authenticity_score')}/100\n",
               bullets(c.get("reasons", [])), f"**Why they fit:** {c.get('why_fit', '')}\n", f"**Hook:** {c.get('recent_post_hook', '')}\n",
               f"**Subject:** {c.get('outreach_subject', '')}\n", f"> {c.get('outreach_message', '')}\n",
               _audit_block(c.get("audit")),
               f"_Data: {c.get('data_quality')} - {', '.join(s.get('url', '') for s in c.get('sources', []))}_\n"]
    md += ["\n## Method\n", f"{r.get('method_note', '')}\n", "## Sources\n", bullets([f"[{x.get('title')}]({x.get('url')})" for x in rule.get("sources", [])])]
    counts = {v: sum(1 for c in cands if c.get("verdict") == v) for v in ("real", "suspicious", "likely_fake")}
    return "\n".join(md), {"candidates": len(cands), **counts}


TASK_KIND: dict[str, tuple[str, Any]] = {
    "write_ad_copy": ("content_pack", render_content_pack), "write_landing_page": ("content_pack", render_content_pack),
    "write_email_sequence": ("content_pack", render_content_pack), "write_social_posts": ("content_pack", render_content_pack),
    "design_ab_test": ("content_pack", render_content_pack), "draft_outreach_emails": ("outreach_drafts", render_outreach),
    "generate_ad_images": ("ad_creatives", render_creatives), "generate_ad_video": ("ad_creatives", render_creatives),
    "render_ad_images": ("ad_creatives", render_creatives), "competitor_deep_dive": ("market_research", render_research_task),
    "influencer_research": ("influencer_list", render_influencer_list),
}


def build_task_deliverable(task_id: int) -> int | None:
    with session_scope() as s:
        task = s.get(Task, task_id)
        if task is None or not task.result or task.action not in TASK_KIND:
            return None
        kind, fn = TASK_KIND[task.action]
        company = s.get(Company, task.company_id)
        md, meta = fn(company.name if company else "Company", task, task.result)
        d = Deliverable(run_id=task.run_id, company_id=task.company_id, kind=kind, title=task.title, content_md=md,
                        meta={**meta, "task_id": task.id}, generated_by=f"{task.agent} agent")
        s.add(d); s.commit(); s.refresh(d)
        return d.id
