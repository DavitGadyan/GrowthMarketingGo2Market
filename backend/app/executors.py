"""Executes approved tasks through the execution agents. The only entry point
is execute_task(); it refuses anything that is not status == "approved"."""
from __future__ import annotations

import logging
import shlex
from datetime import datetime, timezone
from typing import Any

from pydantic import BaseModel

from . import bus, deliverables, integrations
from .context import company_json, prior_json
from .db import session_scope
from .models import Company, Event, Task
from .prompts import load_prompt, methodology, methodology_section, render
from .runner import get_runner
from .schemas import TASK_SCHEMAS, ContentPack, CreativeBrief
from .serialize import envelope, event_out, task_out
from .settings import settings

log = logging.getLogger("growthpilot.executors")

CONTENT_ACTIONS = {"write_ad_copy", "write_landing_page", "write_email_sequence", "write_social_posts", "design_ab_test"}

GMAIL_DRAFT_TOOLS = ["mcp__gmail__draft_email", "mcp__gmail__create_draft", "mcp__gmail__gmail_create_draft",
                     "mcp__gmail__search_emails", "mcp__gmail__list_email_labels", "mcp__gmail__read_email"]
GMAIL_SEND_TOOLS = ["mcp__gmail__send_email", "mcp__gmail__send_draft", "mcp__gmail__send_message", "mcp__gmail__gmail_send_email",
                    "mcp__gmail__reply", "mcp__gmail__forward", "mcp__gmail__delete_email", "mcp__gmail__batch_delete_emails"]
HIGGSFIELD_QUOTE_TOOLS = ["mcp__higgsfield__ads_studio_quote", "mcp__higgsfield__balance", "mcp__higgsfield__models_explore",
                          "mcp__higgsfield__get_presets", "mcp__higgsfield__show_plans_and_credits", "mcp__higgsfield__ads_studio_list_brands"]
HIGGSFIELD_RENDER_TOOLS = HIGGSFIELD_QUOTE_TOOLS + ["mcp__higgsfield__generate_image", "mcp__higgsfield__generate_image_batch",
                                                    "mcp__higgsfield__generate_video", "mcp__higgsfield__ads_studio_generate",
                                                    "mcp__higgsfield__ads_studio_get_run", "mcp__higgsfield__jobs_wait",
                                                    "mcp__higgsfield__show_result", "mcp__higgsfield__show_generation_by_ids"]


OUTREACH_FALLBACK = """Research the person first; reference one specific recent post. Lead with their problem in their words, not your product.
One sentence of value in terms their audience cares about. Soft call to action (a question they can answer with one word).
At most 80 words, no hype, no links in the first touch. Plan three touches: day 0 DM, day 3 reply-to-self with one proof point, day 10 close the loop."""


class GmailDraftResult(BaseModel):
    draft_ids: list[str]
    note: str


def _now() -> datetime:
    return datetime.now(timezone.utc)


def _emit(run_id: int, level: str, message: str, agent: str) -> None:
    with session_scope() as s:
        e = Event(run_id=run_id, level=level, message=message, agent=agent)
        s.add(e); s.commit(); s.refresh(e)
        bus.publish(f"run:{run_id}", envelope("event", event_out(e)))


def _publish_task(task_id: int) -> None:
    with session_scope() as s:
        t = s.get(Task, task_id)
        bus.publish(f"run:{t.run_id}", envelope("task", task_out(t)))
        bus.publish(f"chat:{t.company_id}", envelope("task", task_out(t)))


def _set(task_id: int, **fields: Any) -> Task:
    with session_scope() as s:
        t = s.get(Task, task_id)
        for k, v in fields.items():
            setattr(t, k, v)
        t.updated_at = _now()
        s.add(t); s.commit(); s.refresh(t)
        return t


def _system() -> str:
    return load_prompt("base_system").replace("{methodology}", methodology())


def _task_text(t: Task, extra: str = "") -> str:
    import json
    return f"{t.title}\n{t.description}\nAction: {t.action}\nInputs: {json.dumps(t.inputs)}\n{extra}".strip()


def _gmail_mcp() -> dict[str, Any]:
    parts = shlex.split(settings.gmail_mcp_command)
    return {"gmail": {"type": "stdio", "command": parts[0], "args": parts[1:]}}


def _higgsfield_mcp() -> dict[str, Any]:
    return {"higgsfield": {"type": "http", "url": settings.higgsfield_mcp_url,
                           "headers": {"Authorization": f"Bearer {settings.higgsfield_mcp_token}"}}}


def _firecrawl_mcp() -> dict[str, Any]:
    return {"firecrawl": {"type": "stdio", "command": "npx", "args": ["-y", "firecrawl-mcp"],
                          "env": {"FIRECRAWL_API_KEY": settings.firecrawl_api_key}}}


async def _dispatch(t: Task, cjson: str, prior: str, on_event) -> dict[str, Any]:
    runner = get_runner()
    system = _system()
    budget = settings.max_budget_usd_per_task

    if t.action in CONTENT_ACTIONS:
        prompt = render("content", task=_task_text(t), company=cjson, prior=prior)
        out, cost = await runner.run_structured(system=system, prompt=prompt, schema=ContentPack, model=settings.content_model,
                                                max_budget_usd=budget, on_event=on_event)
        return {**out, "cost_usd": cost}

    if t.action == "draft_outreach_emails":
        prompt = render("outreach", task=_task_text(t), company=cjson, prior=prior)
        out, cost = await runner.run_structured(system=system, prompt=prompt, schema=TASK_SCHEMAS[t.action], model=settings.content_model,
                                                max_budget_usd=budget, on_event=on_event)
        result: dict[str, Any] = {**out, "cost_usd": cost, "draft_ids": []}
        if integrations.is_connected("gmail") and settings.gmail_mcp_command:
            await on_event("info", "Creating Gmail drafts (drafts only - nothing is sent)")
            import json
            draft_prompt = ("Create one Gmail DRAFT per email below using the gmail draft tool. Do not send anything. "
                            "Return the draft ids.\n\n" + json.dumps(out["emails"], indent=1))
            drafts, cost2 = await runner.run_structured(system=system, prompt=draft_prompt, schema=GmailDraftResult, model=settings.content_model,
                                                        extra_mcp=_gmail_mcp(), allowed_extra_tools=GMAIL_DRAFT_TOOLS,
                                                        disallowed_extra_tools=GMAIL_SEND_TOOLS, max_budget_usd=budget, on_event=on_event)
            result["draft_ids"] = drafts["draft_ids"]
            result["sequence_note"] = f"{out.get('sequence_note', '')} Drafts: {drafts['note']}".strip()
            result["cost_usd"] = cost + cost2
        return result

    if t.action in ("generate_ad_images", "generate_ad_video"):
        connected = integrations.is_connected("higgsfield")
        prompt = render("creative", task=_task_text(t, "QUOTE PASS: write the prompts and fetch a credit quote; do not render."), company=cjson, prior=prior)
        kwargs: dict[str, Any] = {}
        if connected:
            kwargs = {"extra_mcp": _higgsfield_mcp(), "allowed_extra_tools": HIGGSFIELD_QUOTE_TOOLS}
        out, cost = await runner.run_structured(system=system, prompt=prompt, schema=CreativeBrief, model=settings.content_model,
                                                max_budget_usd=budget, on_event=on_event, **kwargs)
        out["assets"] = []
        result = {**out, "cost_usd": cost}
        if connected:
            credits = out.get("quote_credits")
            with session_scope() as s:
                follow = Task(run_id=t.run_id, company_id=t.company_id, agent="creative", action="render_ad_images",
                              title=f"Render: {t.title}", description=f"Will spend ~{credits if credits is not None else 'unknown'} Higgsfield credits",
                              inputs={"prompts": out.get("prompts", []), "aspect_ratios": out.get("aspect_ratios", []), "source_task_id": t.id},
                              estimated_cost=f"~{credits} credits" if credits is not None else "unknown", requires_approval=True,
                              integration="higgsfield", status="proposed")
                s.add(follow); s.commit(); s.refresh(follow)
                follow_id = follow.id
            _publish_task(follow_id)
            await on_event("info", f"Render task #{follow_id} proposed - approve it to spend credits")
        return result

    if t.action == "render_ad_images":
        prompt = render("creative", task=_task_text(t, "RENDER PASS: the user approved the spend. Generate the assets with the prompts in Inputs and return their URLs in `assets`."), company=cjson, prior=prior)
        out, cost = await runner.run_structured(system=system, prompt=prompt, schema=CreativeBrief, model=settings.content_model,
                                                extra_mcp=_higgsfield_mcp(), allowed_extra_tools=HIGGSFIELD_RENDER_TOOLS,
                                                max_budget_usd=budget, on_event=on_event)
        return {**out, "cost_usd": cost}

    if t.action == "competitor_deep_dive":
        prompt = render("research_task", task=_task_text(t), company=cjson, prior=prior)
        kwargs = {}
        if integrations.is_connected("firecrawl"):
            kwargs = {"extra_mcp": _firecrawl_mcp(), "allowed_extra_tools": ["mcp__firecrawl__*"]}
        out, cost = await runner.run_structured(system=system, prompt=prompt, schema=TASK_SCHEMAS[t.action], model=settings.strategy_model,
                                                use_web=True, max_budget_usd=budget, on_event=on_event, **kwargs)
        return {**out, "cost_usd": cost}

    if t.action == "influencer_research":
        import json
        inputs = t.inputs or {}
        try:
            cdict = json.loads(cjson)
        except Exception:  # noqa: BLE001
            cdict = {}
        niche = inputs.get("niche") or cdict.get("industry") or cdict.get("name") or "the product's niche"
        card = methodology_section("## Influencer outreach (B2B sales)") or OUTREACH_FALLBACK
        prompt = render("influencer", company=cjson, platforms=", ".join(inputs.get("platforms") or ["instagram", "x"]),
                        niche=niche, max_candidates=str(inputs.get("max_candidates", 10)), outreach_card=card)
        kwargs = {}
        if integrations.is_connected("firecrawl"):
            kwargs = {"extra_mcp": _firecrawl_mcp(), "allowed_extra_tools": ["mcp__firecrawl__*"]}
        await on_event("info", f"Researching {', '.join(inputs.get('platforms') or ['instagram', 'x'])} creators in '{niche}'")
        out, cost = await runner.run_structured(max_turns=60, system=system, prompt=prompt, schema=TASK_SCHEMAS[t.action], model=settings.strategy_model,
                                                use_web=True, use_calc=True, max_budget_usd=budget, on_event=on_event, **kwargs)
        n_real = sum(1 for c in out.get("candidates", []) if c.get("verdict") == "real")
        await on_event("success", f"{len(out.get('candidates', []))} creators ranked - {n_real} look real")
        return {**out, "cost_usd": cost}

    raise ValueError(f"unknown task action {t.action}")


async def execute_task(task_id: int) -> bool:
    """Run one task. Returns False (and does nothing) unless status == 'approved'."""
    with session_scope() as s:
        t = s.get(Task, task_id)
        if t is None or t.status != "approved":
            return False
        company = s.get(Company, t.company_id)
        cjson = company_json(company)
        run_id, agent = t.run_id, t.agent
    _set(task_id, status="running", error=None)
    _publish_task(task_id)
    _emit(run_id, "info", f"Task #{task_id} started", f"{agent} agent")

    async def on_event(level: str, message: str) -> None:
        _emit(run_id, level, message, f"{agent} agent")

    try:
        with session_scope() as s:
            t = s.get(Task, task_id)
        result = await _dispatch(t, cjson, prior_json(run_id, "task"), on_event)
        _set(task_id, status="done", result=result)
        d_id = deliverables.build_task_deliverable(task_id)
        _publish_task(task_id)
        _emit(run_id, "success", f"Task #{task_id} done" + (f" - deliverable #{d_id} ready" if d_id else ""), f"{agent} agent")
        return True
    except Exception as e:  # noqa: BLE001 - every failure lands on the task row
        log.exception("task %s failed", task_id)
        _set(task_id, status="failed", error=str(e)[:1000])
        _publish_task(task_id)
        _emit(run_id, "error", f"Task #{task_id} failed: {str(e)[:300]}", f"{agent} agent")
        return False
