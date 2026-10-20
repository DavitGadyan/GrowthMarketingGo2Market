"""The orchestrator chat: streams tokens, persists messages, and surfaces any
tasks or insights the agent created through the growthpilot MCP tools."""
from __future__ import annotations

import json
from collections.abc import AsyncIterator
from typing import Any

from sqlmodel import select

from . import orchestrator
from .context import summaries_text
from .db import session_scope
from .mcp_tools import GROWTHPILOT_TOOL_NAMES, ChatContext, chat_context, growthpilot_server
from .models import ChatMessage, Company, Insight, Run, Task
from .prompts import render
from .runner import get_runner
from .schemas import CompanyProfile, missing_intake_fields
from .serialize import chat_out, envelope, insight_out, task_out
from .settings import settings

_contexts: dict[int, ChatContext] = {}


def history(company_id: int) -> list[ChatMessage]:
    with session_scope() as s:
        return list(s.exec(select(ChatMessage).where(ChatMessage.company_id == company_id).order_by(ChatMessage.id)).all())


def _latest_run_id(company_id: int) -> int | None:
    with session_scope() as s:
        r = s.exec(select(Run).where(Run.company_id == company_id).order_by(Run.id.desc())).first()
        return r.id if r else None


def _store(company_id: int, role: str, content: str, meta: dict[str, Any] | None = None) -> ChatMessage:
    with session_scope() as s:
        m = ChatMessage(company_id=company_id, role=role, content=content, meta=meta or {})
        s.add(m); s.commit(); s.refresh(m)
        return m


async def chat_stream(company_id: int, message: str) -> AsyncIterator[dict[str, Any]]:
    with session_scope() as s:
        company = s.get(Company, company_id)
        if company is None:
            yield {"type": "done", "data": {"error": "no such company"}}
            return
        profile = CompanyProfile.model_validate({**company.profile, "name": company.name})
        name = company.name
    run_id = _latest_run_id(company_id)
    missing = missing_intake_fields(profile)
    user_msg = _store(company_id, "user", message)
    yield envelope("message", chat_out(user_msg))

    ctx = _contexts.get(company_id)
    if ctx is None:
        ctx = _contexts[company_id] = ChatContext(company_id, run_id)
    ctx.run_id = run_id
    ctx.proposed_task_ids, ctx.insight_ids, ctx.rerun_requests = [], [], []
    chat_context.set(ctx)

    summaries = summaries_text(run_id) if run_id else "(no run yet)"
    missing_text = "; ".join(f"{m['field']}: {m['question']}" for m in missing) or "nothing - the profile is complete"
    system = render("chat_system", company_name=name, missing=missing_text, summaries=summaries)
    prompt = (f"(Current state - missing inputs: {missing_text}. Stages:\n{summaries})\n\nUser: {message}"
              if not settings.growthpilot_fake_agents else message)

    runner = get_runner()
    final: dict[str, Any] | None = None
    async for chunk in runner.stream_chat(session_key=f"company:{company_id}", system=system, prompt=prompt,
                                          extra_mcp={"growthpilot": growthpilot_server}, allowed_extra_tools=GROWTHPILOT_TOOL_NAMES,
                                          model=settings.strategy_model):
        if chunk["type"] == "token":
            yield {"type": "token", "data": {"text": chunk["text"]}}
        elif chunk["type"] == "final":
            final = chunk
    text = (final or {}).get("text") or "(no reply)"
    meta = {"tool_calls": (final or {}).get("tool_calls", []), "cost_usd": (final or {}).get("cost_usd", 0.0),
            "error": (final or {}).get("error")}
    agent_msg = _store(company_id, "agent", text, meta)
    yield envelope("message", chat_out(agent_msg))

    with session_scope() as s:
        for tid in ctx.proposed_task_ids:
            t = s.get(Task, tid)
            if t:
                yield envelope("task", task_out(t))
        for iid in ctx.insight_ids:
            i = s.get(Insight, iid)
            if i:
                yield envelope("insight", insight_out(i))
    for key in ctx.rerun_requests:
        if run_id is not None:
            await orchestrator.rerun_from_stage(run_id, key)
    yield {"type": "done", "data": {}}
