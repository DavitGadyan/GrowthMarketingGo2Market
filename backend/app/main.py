"""GrowthPilot API. Every route lives under /api; live updates are SSE."""
from __future__ import annotations

import asyncio
import json
import re
from contextlib import asynccontextmanager
from typing import Any, Optional

from fastapi import Depends, FastAPI, HTTPException, Query, Request, Response
from fastapi.middleware.cors import CORSMiddleware
from sqlmodel import Session, select
from sse_starlette.sse import EventSourceResponse

from . import bus, chat, deliverables, executors, integrations, orchestrator
from .db import get_session, init_db
from .models import ChatMessage, Company, Deliverable, Event, Insight, Run, StageResult, Task
from .runner import get_runner
from pydantic import ValidationError

from .schemas import (ChatIn, ChatMessageOut, CompanyOut, CompanyProfile, DashboardOut, DeliverableOut, EventOut,
                      InfluencerOutreachIn, InfluencerResearch, InfluencerResearchIn, InfluencerResearchOut, InsightOut,
                      IntegrationOut, RunOut, StageResultOut, TaskOut)
from .serialize import (chat_out, company_out, deliverable_out, envelope, event_out, insight_out, run_out, stage_out,
                        task_out)
from .settings import settings


@asynccontextmanager
async def lifespan(app: FastAPI):
    init_db()
    bus.bind_loop(asyncio.get_running_loop())
    yield
    runner = get_runner()
    close = getattr(runner, "close", None)
    if close:
        await close()


app = FastAPI(title="GrowthPilot API", version="0.1.0", lifespan=lifespan)
app.add_middleware(CORSMiddleware, allow_origins=[o.strip() for o in settings.cors_origins.split(",") if o.strip()],
                   allow_credentials=True, allow_methods=["*"], allow_headers=["*"])


def _sse(env: dict[str, Any]) -> dict[str, str]:
    return {"data": json.dumps(env, default=str)}


# ------------------------------------------------------------- health -----

@app.get("/api/health")
def health() -> dict[str, Any]:
    connected, detail = integrations.anthropic_connected()
    return {"ok": True, "fake_agents": settings.growthpilot_fake_agents, "anthropic_connected": connected, "anthropic_detail": detail}


# ---------------------------------------------------------- companies -----

@app.get("/api/companies", response_model=list[CompanyOut])
def list_companies(s: Session = Depends(get_session)):
    return [company_out(c) for c in s.exec(select(Company).order_by(Company.id.desc())).all()]


@app.post("/api/companies", response_model=CompanyOut, status_code=201)
def create_company(profile: CompanyProfile, s: Session = Depends(get_session)):
    if not profile.name.strip():
        raise HTTPException(422, "name is required")
    c = Company(name=profile.name.strip(), profile=profile.model_dump(mode="json"))
    s.add(c); s.commit(); s.refresh(c)
    return company_out(c)


@app.get("/api/companies/{company_id}", response_model=CompanyOut)
def get_company(company_id: int, s: Session = Depends(get_session)):
    c = s.get(Company, company_id)
    if not c:
        raise HTTPException(404, "company not found")
    return company_out(c)


@app.put("/api/companies/{company_id}", response_model=CompanyOut)
def update_company(company_id: int, profile: CompanyProfile, s: Session = Depends(get_session)):
    c = s.get(Company, company_id)
    if not c:
        raise HTTPException(404, "company not found")
    from .models import utcnow
    c.name, c.profile, c.updated_at = profile.name.strip() or c.name, profile.model_dump(mode="json"), utcnow()
    s.add(c); s.commit(); s.refresh(c)
    return company_out(c)


# --------------------------------------------------------------- runs -----

@app.post("/api/companies/{company_id}/runs", response_model=RunOut, status_code=201)
async def start_run(company_id: int, s: Session = Depends(get_session)):
    if not s.get(Company, company_id):
        raise HTTPException(404, "company not found")
    try:
        run = orchestrator.create_run(company_id)
    except RuntimeError as e:
        raise HTTPException(409, str(e))
    orchestrator.start_run(run.id)
    return run_out(run)


@app.get("/api/runs", response_model=list[RunOut])
def list_runs(company_id: Optional[int] = None, s: Session = Depends(get_session)):
    q = select(Run).order_by(Run.id.desc())
    if company_id is not None:
        q = q.where(Run.company_id == company_id)
    return [run_out(r) for r in s.exec(q).all()]


def _run_or_404(run_id: int, s: Session) -> Run:
    r = s.get(Run, run_id)
    if not r:
        raise HTTPException(404, "run not found")
    return r


@app.get("/api/runs/{run_id}", response_model=RunOut)
def get_run(run_id: int, s: Session = Depends(get_session)):
    return run_out(_run_or_404(run_id, s))


@app.get("/api/runs/{run_id}/stages", response_model=list[StageResultOut])
def run_stages(run_id: int, s: Session = Depends(get_session)):
    _run_or_404(run_id, s)
    return [stage_out(x) for x in s.exec(select(StageResult).where(StageResult.run_id == run_id).order_by(StageResult.number)).all()]


@app.get("/api/runs/{run_id}/events", response_model=list[EventOut])
def run_events(run_id: int, after_id: int = 0, s: Session = Depends(get_session)):
    _run_or_404(run_id, s)
    return [event_out(e) for e in s.exec(select(Event).where(Event.run_id == run_id, Event.id > after_id).order_by(Event.id)).all()]


@app.get("/api/runs/{run_id}/insights", response_model=list[InsightOut])
def run_insights(run_id: int, s: Session = Depends(get_session)):
    _run_or_404(run_id, s)
    return [insight_out(i) for i in s.exec(select(Insight).where(Insight.run_id == run_id).order_by(Insight.id)).all()]


@app.post("/api/runs/{run_id}/rerun", response_model=RunOut)
async def rerun_run(run_id: int, from_stage: int = 1, s: Session = Depends(get_session)):
    """Redo stages `from_stage`..14 of a finished run (e.g. after a methodology fix); 409 while it is running."""
    run = s.get(Run, run_id)
    if run is None:
        raise HTTPException(404, "run not found")
    if orchestrator.is_running(run_id):
        raise HTTPException(409, "run is in progress")
    from .schemas import STAGES
    spec = next((x for x in STAGES if x.number == max(1, min(14, from_stage))), STAGES[0])
    asyncio.create_task(orchestrator.rerun_from_stage(run_id, spec.key))
    s.refresh(run)
    return run_out(run)


@app.post("/api/runs/{run_id}/cancel", response_model=RunOut)
def cancel_run(run_id: int, s: Session = Depends(get_session)):
    r = _run_or_404(run_id, s)
    if r.status in orchestrator.TERMINAL:
        raise HTTPException(409, f"run is already {r.status}")
    orchestrator.request_cancel(run_id)
    return run_out(r)


@app.get("/api/runs/{run_id}/events/stream")
async def run_stream(run_id: int, request: Request):
    from .db import session_scope

    async def gen():
        sub = bus.Subscription(f"run:{run_id}")
        try:
            with session_scope() as s:
                r = s.get(Run, run_id)
                if r is None:
                    yield _sse({"type": "done", "data": {"error": "run not found"}})
                    return
                yield _sse(envelope("run", run_out(r)))
                for st in s.exec(select(StageResult).where(StageResult.run_id == run_id).order_by(StageResult.number)).all():
                    yield _sse(envelope("stage", stage_out(st)))
                recent = s.exec(select(Event).where(Event.run_id == run_id).order_by(Event.id.desc()).limit(50)).all()
                for e in reversed(recent):
                    yield _sse(envelope("event", event_out(e)))
                for i in s.exec(select(Insight).where(Insight.run_id == run_id).order_by(Insight.id)).all():
                    yield _sse(envelope("insight", insight_out(i)))
                for t in s.exec(select(Task).where(Task.run_id == run_id).order_by(Task.id)).all():
                    yield _sse(envelope("task", task_out(t)))
                terminal = r.status in orchestrator.TERMINAL
            if terminal:
                yield _sse({"type": "done", "data": {}})
                return
            while True:
                if await request.is_disconnected():
                    return
                try:
                    env = await asyncio.wait_for(sub.get(), timeout=15)
                except asyncio.TimeoutError:
                    yield {"comment": "keep-alive"}
                    continue
                yield _sse(env)
                if env.get("type") == "done":
                    return
        finally:
            sub.close()

    return EventSourceResponse(gen())


# -------------------------------------------------------------- tasks -----

@app.get("/api/tasks", response_model=list[TaskOut])
def list_tasks(company_id: Optional[int] = None, run_id: Optional[int] = None, status: Optional[str] = None, s: Session = Depends(get_session)):
    q = select(Task).order_by(Task.id)
    if company_id is not None:
        q = q.where(Task.company_id == company_id)
    if run_id is not None:
        q = q.where(Task.run_id == run_id)
    if status:
        q = q.where(Task.status == status)
    return [task_out(t) for t in s.exec(q).all()]


@app.post("/api/tasks/{task_id}/approve", response_model=TaskOut)
async def approve_task(task_id: int, s: Session = Depends(get_session)):
    t = s.get(Task, task_id)
    if not t:
        raise HTTPException(404, "task not found")
    if t.status != "proposed":
        raise HTTPException(409, f"task is {t.status}; only proposed tasks can be approved" + (f" ({t.error})" if t.error else ""))
    t = executors._set(task_id, status="approved")
    executors._publish_task(task_id)
    asyncio.create_task(executors.execute_task(task_id))
    return task_out(t)


@app.post("/api/tasks/{task_id}/reject", response_model=TaskOut)
def reject_task(task_id: int, s: Session = Depends(get_session)):
    t = s.get(Task, task_id)
    if not t:
        raise HTTPException(404, "task not found")
    if t.status not in ("proposed", "blocked", "approved"):
        raise HTTPException(409, f"task is {t.status}")
    t = executors._set(task_id, status="rejected")
    executors._publish_task(task_id)
    return task_out(t)


# ------------------------------------------------------- deliverables -----

@app.get("/api/deliverables", response_model=list[DeliverableOut])
def list_deliverables(company_id: Optional[int] = None, run_id: Optional[int] = None, s: Session = Depends(get_session)):
    q = select(Deliverable).order_by(Deliverable.id.desc())
    if company_id is not None:
        q = q.where(Deliverable.company_id == company_id)
    if run_id is not None:
        q = q.where(Deliverable.run_id == run_id)
    return [deliverable_out(d) for d in s.exec(q).all()]


@app.get("/api/deliverables/{deliverable_id}", response_model=DeliverableOut)
def get_deliverable(deliverable_id: int, s: Session = Depends(get_session)):
    d = s.get(Deliverable, deliverable_id)
    if not d:
        raise HTTPException(404, "deliverable not found")
    return deliverable_out(d)


@app.get("/api/deliverables/{deliverable_id}/export")
def export_deliverable(deliverable_id: int, fmt: str = Query("md", pattern="^(md|html)$"), s: Session = Depends(get_session)):
    d = s.get(Deliverable, deliverable_id)
    if not d:
        raise HTTPException(404, "deliverable not found")
    slug = re.sub(r"[^a-z0-9]+", "-", d.title.lower()).strip("-") or d.kind
    if fmt == "html":
        return Response(deliverables.to_html(d.content_md), media_type="text/html",
                        headers={"Content-Disposition": f'attachment; filename="{slug}.html"'})
    return Response(d.content_md, media_type="text/markdown",
                    headers={"Content-Disposition": f'attachment; filename="{slug}.md"'})


# ------------------------------------------------------- integrations -----

@app.get("/api/integrations", response_model=list[IntegrationOut])
def list_integrations():
    return integrations.status()


@app.put("/api/integrations/{name}", response_model=IntegrationOut)
def put_integration(name: str, body: dict[str, Any]):
    try:
        return integrations.set_config(name, body.get("config", {}))
    except KeyError:
        raise HTTPException(404, "unknown integration")


# -------------------------------------------------------- influencers -----

def _latest_research_task(s: Session, company_id: int):
    """Finished (or active) research wins over a later proposed/blocked one, then the newest."""
    rank = {"done": 0, "running": 1, "approved": 2}
    rows = s.exec(select(Task).where(Task.company_id == company_id, Task.action == "influencer_research")).all()
    if not rows:
        return None
    return sorted(rows, key=lambda t: (rank.get(t.status, 3), -(t.id or 0)))[0]


def _research_out(t: Task) -> InfluencerResearchOut:
    result = None
    if t.status == "done" and t.result:
        try:
            result = InfluencerResearch.model_validate({k: v for k, v in t.result.items() if k != "cost_usd"})
        except ValidationError:
            result = None
    inputs = t.inputs or {}
    return InfluencerResearchOut(task_id=t.id, status=t.status, platforms=inputs.get("platforms", []), niche=inputs.get("niche", ""),
                                 generated_at=t.updated_at if t.status == "done" else None, error=t.error, result=result)


def _run_for_company(s: Session, company_id: int) -> int:
    """Tasks and events hang off a run. Without a plan run yet, create one
    ad-hoc completed run row so the influencer task has a home."""
    run = s.exec(select(Run).where(Run.company_id == company_id).order_by(Run.id.desc())).first()
    if run:
        return run.id
    run = Run(company_id=company_id, status="completed", current_stage=0)
    s.add(run); s.commit(); s.refresh(run)
    return run.id


@app.post("/api/influencers/research", response_model=InfluencerResearchOut, status_code=202)
async def start_influencer_research(body: InfluencerResearchIn, s: Session = Depends(get_session)):
    c = s.get(Company, body.company_id)
    if not c:
        raise HTTPException(404, "company not found")
    latest = _latest_research_task(s, c.id)
    if latest and latest.status in ("approved", "running"):
        raise HTTPException(409, f"influencer research #{latest.id} is already {latest.status}")
    niche = body.niche.strip() or (c.profile or {}).get("industry") or c.name
    platforms = list(dict.fromkeys(body.platforms)) or ["instagram", "x"]
    run_id = _run_for_company(s, c.id)
    t = Task(run_id=run_id, company_id=c.id, agent="research", action="influencer_research", title=f"Influencer research: {niche}",
             description=f"Find and rank {' and '.join(platforms)} creators in '{niche}', score real vs fake from follower-to-engagement ratios, and write a personalised first message to each.",
             inputs={"platforms": platforms, "niche": niche, "max_candidates": body.max_candidates}, estimated_cost="~$0.80 API",
             requires_approval=False, status="approved")
    s.add(t); s.commit(); s.refresh(t)
    executors._publish_task(t.id)
    asyncio.create_task(executors.execute_task(t.id))
    return _research_out(t)


@app.get("/api/avatar/{platform}/{handle}")
async def creator_avatar(platform: str, handle: str):
    """Cached profile picture for an Instagram / X handle; 404 when none can be fetched."""
    from fastapi.responses import Response
    from . import avatars
    got = await avatars.get_avatar(platform, handle)
    if not got:
        raise HTTPException(404, "no avatar")
    data, ctype = got
    return Response(content=data, media_type=ctype, headers={"Cache-Control": "public, max-age=86400"})


@app.get("/api/influencers", response_model=InfluencerResearchOut)
def get_influencers(company_id: int, s: Session = Depends(get_session)):
    t = _latest_research_task(s, company_id)
    if not t:
        raise HTTPException(404, "no influencer research for this company yet")
    return _research_out(t)


@app.post("/api/influencers/{task_id}/outreach", response_model=TaskOut, status_code=201)
def influencer_outreach(task_id: int, body: InfluencerOutreachIn, s: Session = Depends(get_session)):
    t = s.get(Task, task_id)
    if not t or t.action != "influencer_research":
        raise HTTPException(404, "influencer research not found")
    if t.status != "done" or not t.result:
        raise HTTPException(409, f"research is {t.status}")
    wanted = {h.strip().lower() for h in body.handles if h.strip()}
    picked = [c for c in t.result.get("candidates", []) if c.get("handle", "").lower() in wanted]
    if not picked:
        raise HTTPException(422, "no matching handles")
    recipients = [{"handle": c["handle"], "name": c["name"], "platform": c["platform"], "url": c["url"],
                   "subject": c["outreach_subject"], "message": c["outreach_message"], "verdict": c["verdict"]} for c in picked]
    status, error = "proposed", None
    if not integrations.is_connected("gmail"):
        status, error = "blocked", "Connect gmail to run"
    out = Task(run_id=t.run_id, company_id=t.company_id, agent="outreach", action="draft_outreach_emails",
               title=f"Influencer outreach: {len(picked)} creator{'s' if len(picked) != 1 else ''}",
               description="Gmail drafts (never sent) with the personalised first message for each selected creator.",
               inputs={"recipients": recipients, "source_task_id": t.id, "count": len(recipients)}, estimated_cost="~$0.30 API",
               requires_approval=True, integration="gmail", status=status, error=error)
    s.add(out); s.commit(); s.refresh(out)
    executors._publish_task(out.id)
    return task_out(out)


# --------------------------------------------------------------- chat -----

@app.get("/api/chat", response_model=list[ChatMessageOut])
def chat_history(company_id: int):
    return [chat_out(m) for m in chat.history(company_id)]


@app.post("/api/chat")
async def chat_post(body: ChatIn):
    async def gen():
        async for env in chat.chat_stream(body.company_id, body.message):
            yield _sse(env)

    return EventSourceResponse(gen())


# ---------------------------------------------------------- dashboard -----

@app.get("/api/dashboard", response_model=DashboardOut)
def dashboard(company_id: Optional[int] = None, s: Session = Depends(get_session)):
    c = s.get(Company, company_id) if company_id is not None else s.exec(select(Company).order_by(Company.id.desc())).first()
    if c is None:
        return DashboardOut(company=None, latest_run=None, active_agents=0, deliverables=0, tasks_done=0, tasks_pending=0,
                            plan_readiness_pct=0, recent_events=[])
    run = s.exec(select(Run).where(Run.company_id == c.id).order_by(Run.id.desc())).first()
    tasks = s.exec(select(Task).where(Task.company_id == c.id)).all()
    busy = sum(1 for t in tasks if t.status == "running") + (1 if run and run.status == "running" else 0)
    readiness = 0
    events: list[EventOut] = []
    if run:
        review = s.exec(select(StageResult).where(StageResult.run_id == run.id, StageResult.key == "review")).first()
        if review and review.output:
            readiness = int(review.output.get("plan_readiness_pct") or 0)
        events = [event_out(e) for e in reversed(s.exec(select(Event).where(Event.run_id == run.id).order_by(Event.id.desc()).limit(8)).all())]
    return DashboardOut(
        company=company_out(c), latest_run=run_out(run) if run else None, active_agents=busy,
        deliverables=len(s.exec(select(Deliverable).where(Deliverable.company_id == c.id)).all()),
        tasks_done=sum(1 for t in tasks if t.status == "done"),
        tasks_pending=sum(1 for t in tasks if t.status in ("proposed", "approved", "running")),
        plan_readiness_pct=readiness, recent_events=events,
    )
