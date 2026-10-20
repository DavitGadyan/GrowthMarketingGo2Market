"""Runs the 14-stage pipeline for a company, persisting every stage and
publishing live updates. One asyncio task per run."""
from __future__ import annotations

import asyncio
import logging
from datetime import datetime, timezone
from typing import Any

from sqlmodel import select

from . import bus, deliverables, integrations
from .context import company_json, prior_json
from .db import session_scope
from .models import Company, Event, Insight, Run, StageResult, Task
from .prompts import load_prompt, methodology, render, stage_card
from .runner import RunnerError, get_runner
from .schemas import STAGE_SCHEMAS, STAGES, ProposedTask, Review
from .serialize import envelope, event_out, insight_out, run_out, stage_out, task_out
from .settings import settings

log = logging.getLogger("growthpilot.orchestrator")

_running: dict[int, asyncio.Task] = {}
_cancel: set[int] = set()
TERMINAL = {"completed", "failed", "cancelled"}


def _now() -> datetime:
    return datetime.now(timezone.utc)


# ----------------------------------------------------------- creation -----

def create_run(company_id: int) -> Run:
    with session_scope() as s:
        active = s.exec(select(Run).where(Run.company_id == company_id, Run.status.in_(["queued", "running"]))).first()
        if active:
            raise RuntimeError(f"run {active.id} is already {active.status}")
        run = Run(company_id=company_id, status="queued")
        s.add(run); s.commit(); s.refresh(run)
        for spec in STAGES:
            s.add(StageResult(run_id=run.id, number=spec.number, key=spec.key, title=spec.title, status="pending"))
        s.commit()
        s.refresh(run)
        return run


def start_run(run_id: int, from_number: int = 1) -> asyncio.Task:
    task = asyncio.create_task(run_pipeline(run_id, from_number))
    _running[run_id] = task
    task.add_done_callback(lambda _t: _running.pop(run_id, None))
    return task


def request_cancel(run_id: int) -> None:
    _cancel.add(run_id)


def is_running(run_id: int) -> bool:
    t = _running.get(run_id)
    return bool(t and not t.done())


# ------------------------------------------------------------ helpers -----

def emit(run_id: int, level: str, message: str, agent: str = "orchestrator", stage: str | None = None) -> None:
    with session_scope() as s:
        e = Event(run_id=run_id, level=level, message=message, agent=agent, stage=stage)
        s.add(e); s.commit(); s.refresh(e)
        bus.publish(f"run:{run_id}", envelope("event", event_out(e)))


def _publish_run(run_id: int) -> None:
    with session_scope() as s:
        r = s.get(Run, run_id)
        bus.publish(f"run:{run_id}", envelope("run", run_out(r)))


def _publish_stage(stage_id: int) -> None:
    with session_scope() as s:
        st = s.get(StageResult, stage_id)
        bus.publish(f"run:{st.run_id}", envelope("stage", stage_out(st)))


def _add_insight(run_id: int, kind: str, severity: str, title: str, detail: str) -> None:
    with session_scope() as s:
        i = Insight(run_id=run_id, kind=kind, severity=severity, title=title[:200], detail=detail)
        s.add(i); s.commit(); s.refresh(i)
        bus.publish(f"run:{run_id}", envelope("insight", insight_out(i)))


def _money(v: Any) -> str:
    try:
        v = float(v)
    except (TypeError, ValueError):
        return str(v)
    for unit, div in (("B", 1e9), ("M", 1e6), ("K", 1e3)):
        if abs(v) >= div:
            return f"${v / div:,.1f}{unit}"
    return f"${v:,.0f}"


def summarize(key: str, out: dict[str, Any]) -> str:
    try:
        if key == "situation_analysis":
            return f"{len(out.get('value_gaps', []))} value gaps; {len(out.get('competitors', []))} competitors named"
        if key == "market_sizing":
            return f"TAM {_money(out.get('tam_usd'))} → SAM {_money(out.get('sam_usd'))} → SOM {_money(out.get('som_usd'))}"
        if key == "target_market":
            return f"{out.get('market_name', '')}: {', '.join(out.get('chosen', []))}"
        if key == "feature_benefit":
            return f"{len(out.get('rows', []))} pain→feature→benefit→value rows; {len(out.get('gaps', []))} gaps"
        if key == "audience":
            return f"{len(out.get('personas', []))} personas, {len(out.get('segments', []))} segments; ICP: {str(out.get('icp', ''))[:80]}"
        if key == "positioning":
            return str(out.get("positioning_line", ""))[:140]
        if key == "gtm_motion":
            return f"{out.get('business_type')} · {str(out.get('motion', '')).replace('_', ' ')}"
        if key == "objectives":
            return f"{len(out.get('okrs', []))} OKRs, {len(out.get('smart_goals', []))} SMART goals, {len(out.get('kpis', []))} KPIs"
        if key == "demand_math":
            top = out.get("waterfall", [{}])[0]
            return f"{out.get('model')} waterfall: {float(top.get('count') or 0):,.0f} visitors → {_money(out.get('revenue_goal_usd'))}; LTV/CAC {(f"{float(out['ltv_cac_ratio']):.1f}" if out.get('ltv_cac_ratio') else 'n/a')}"
        if key == "buyer_journey":
            return f"{len(out.get('stages', []))} journey stages mapped"
        if key == "marketing_mix":
            return f"price: {out.get('price', {}).get('recommended_price', '')} ({out.get('price', {}).get('strategy', '')}); place: {out.get('place', {}).get('channel_breadth', '')}"
        if key == "comms_plan":
            return f"{len(out.get('channel_plan', []))} channels; {out.get('money', '')}"
        if key == "gtm_plan":
            return f"{len(out.get('timeline', []))} milestones over 90 days ({out.get('scenario')})"
        if key == "review":
            concerns = sum(1 for l in out.get("lenses", []) if l.get("verdict") != "pass")
            return f"readiness {out.get('plan_readiness_pct')}%; {concerns} lens concerns; {len(out.get('recommendations', []))} recommendations; {len(out.get('proposed_tasks', []))} tasks proposed"
    except Exception:  # noqa: BLE001 - a summary must never break a run
        pass
    return "done"


def derive_insights(run_id: int, key: str, out: dict[str, Any]) -> None:
    if key == "situation_analysis":
        for g in out.get("value_gaps", [])[:6]:
            _add_insight(run_id, "gap", "medium", g.get("gap", "value gap"), f"{g.get('who_has_it', '')} - {g.get('why_underserved', '')}")
    elif key == "review":
        for l in out.get("lenses", []):
            if l.get("verdict") == "fail":
                _add_insight(run_id, "risk", "high", f"{str(l.get('lens', '')).replace('_', ' ')} fails", f"{l.get('finding', '')} Fix: {l.get('fix', '')}")
            elif l.get("verdict") == "concern":
                _add_insight(run_id, "risk", "medium", f"{str(l.get('lens', '')).replace('_', ' ')} concern", f"{l.get('finding', '')} Fix: {l.get('fix', '')}")
        for r in out.get("recommendations", []):
            if r.get("priority") in ("critical", "high"):
                _add_insight(run_id, "opportunity", "high" if r.get("priority") == "critical" else "medium", r.get("title", ""), r.get("detail", ""))


def _create_tasks_from_review(run_id: int, company_id: int, review: dict[str, Any]) -> list[int]:
    ids: list[int] = []
    for raw in Review.model_validate(review).proposed_tasks:
        pt: ProposedTask = raw
        status, error = "proposed", None
        if pt.integration and not integrations.is_connected(pt.integration):
            status, error = "blocked", f"Connect {pt.integration} to run"
        with session_scope() as s:
            t = Task(run_id=run_id, company_id=company_id, agent=pt.agent, action=pt.action, title=pt.title,
                     description=pt.description, inputs=pt.inputs, estimated_cost=pt.estimated_cost,
                     requires_approval=True, integration=pt.integration, status=status, error=error)
            s.add(t); s.commit(); s.refresh(t)
            ids.append(t.id)
            bus.publish(f"run:{run_id}", envelope("task", task_out(t)))
    return ids


def _system_prompt() -> str:
    return load_prompt("base_system").replace("{methodology}", methodology())


# ------------------------------------------------------------ pipeline ----


def _run_total_cost(s, run_id: int) -> float:
    """A run's cost is the sum of its stages - stable across re-runs of a subset of stages."""
    from sqlmodel import select
    return float(sum((st.cost_usd or 0.0) for st in s.exec(select(StageResult).where(StageResult.run_id == run_id)).all()))

async def run_pipeline(run_id: int, from_number: int = 1) -> None:
    runner = get_runner()
    with session_scope() as s:
        run = s.get(Run, run_id)
        if run is None:
            return
        company = s.get(Company, run.company_id)
        run.status, run.started_at = "running", run.started_at or _now()
        s.add(run); s.commit()
        cjson = company_json(company)
        company_id, company_name = company.id, company.name
    _publish_run(run_id)
    emit(run_id, "info", f"Run started for {company_name}: {len(STAGES)} stages" + (f", resuming at stage {from_number}" if from_number > 1 else ""))
    total_cost = 0.0
    system = _system_prompt()

    for spec in STAGES:
        if spec.number < from_number:
            continue
        if run_id in _cancel:
            _cancel.discard(run_id)
            _finish(run_id, "cancelled", total_cost, None)
            emit(run_id, "warning", "Run cancelled before stage %d" % spec.number)
            return
        with session_scope() as s:
            st = s.exec(select(StageResult).where(StageResult.run_id == run_id, StageResult.key == spec.key)).first()
            st.status, st.started_at, st.output, st.summary = "running", _now(), None, ""
            s.add(st); s.commit(); stage_id = st.id
            run = s.get(Run, run_id); run.current_stage = spec.number; s.add(run); s.commit()
        _publish_stage(stage_id); _publish_run(run_id)
        agent_label = f"{spec.agent} agent"
        emit(run_id, "info", f"Stage {spec.number}: {spec.title}", agent_label, spec.key)

        async def on_event(level: str, message: str, _agent=agent_label, _key=spec.key) -> None:
            emit(run_id, level, message, _agent, _key)

        prompt = render(spec.key, card=stage_card(spec.number), company=cjson, prior=prior_json(run_id, spec.key))
        try:
            output, cost = await runner.run_structured(
                system=system, prompt=prompt, schema=STAGE_SCHEMAS[spec.key], model=settings.strategy_model,
                use_web=spec.uses_web, use_calc=spec.uses_calculators, max_budget_usd=settings.max_budget_usd_per_stage,
                on_event=on_event,
            )
        except (RunnerError, Exception) as e:  # noqa: BLE001 - surface every failure on the run
            log.exception("stage %s failed", spec.key)
            with session_scope() as s:
                st = s.get(StageResult, stage_id); st.status, st.finished_at, st.summary = "failed", _now(), str(e)[:500]; s.add(st); s.commit()
            _publish_stage(stage_id)
            emit(run_id, "error", f"Stage {spec.number} failed: {str(e)[:300]}", agent_label, spec.key)
            _finish(run_id, "failed", total_cost, str(e)[:1000])
            return

        total_cost += cost
        summary = summarize(spec.key, output)
        with session_scope() as s:
            st = s.get(StageResult, stage_id)
            st.status, st.finished_at, st.output, st.summary, st.cost_usd = "completed", _now(), output, summary, cost
            s.add(st); s.commit()
            run = s.get(Run, run_id); run.cost_usd = _run_total_cost(s, run_id); s.add(run); s.commit()
        _publish_stage(stage_id)
        emit(run_id, "success", f"{spec.title}: {summary}", agent_label, spec.key)
        derive_insights(run_id, spec.key, output)
        if spec.key == "review":
            ids = _create_tasks_from_review(run_id, company_id, output)
            emit(run_id, "info", f"{len(ids)} execution tasks proposed - approve them from Chat or the Dashboard", "review agent", spec.key)

    deliverable_ids = deliverables.build_run_deliverables(run_id)
    emit(run_id, "success", f"{len(deliverable_ids)} deliverables ready")
    _finish(run_id, "completed", total_cost, None)


def _finish(run_id: int, status: str, cost: float, error: str | None) -> None:
    with session_scope() as s:
        run = s.get(Run, run_id)
        run.status, run.finished_at, run.cost_usd, run.error = status, _now(), _run_total_cost(s, run_id), error
        s.add(run); s.commit()
    _publish_run(run_id)
    emit(run_id, "success" if status == "completed" else "warning", f"Run {status} (${cost:.2f})")
    bus.publish(f"run:{run_id}", {"type": "done", "data": {}})


async def rerun_from_stage(run_id: int, key: str) -> None:
    """Reset `key` and every later stage to pending, then run from there."""
    number = next((s.number for s in STAGES if s.key == key), None)
    if number is None or is_running(run_id):
        return
    with session_scope() as s:
        for st in s.exec(select(StageResult).where(StageResult.run_id == run_id, StageResult.number >= number)).all():
            st.status, st.output, st.summary, st.started_at, st.finished_at = "pending", None, "", None, None
            s.add(st)
        run = s.get(Run, run_id); run.status = "queued"; s.add(run); s.commit()
    start_run(run_id, from_number=number)
