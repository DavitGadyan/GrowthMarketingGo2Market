from sqlmodel import select

from app import executors, orchestrator
from app.db import session_scope
from app.models import Company, Deliverable, Insight, Run, StageResult, Task


def _company(profile: dict) -> int:
    with session_scope() as s:
        c = Company(name=profile["name"], profile=profile)
        s.add(c); s.commit(); s.refresh(c)
        return c.id


async def test_pipeline_end_to_end(sample_profile):
    cid = _company(sample_profile)
    run = orchestrator.create_run(cid)
    with session_scope() as s:
        assert len(s.exec(select(StageResult).where(StageResult.run_id == run.id)).all()) == 14
    await orchestrator.run_pipeline(run.id)
    with session_scope() as s:
        r = s.get(Run, run.id)
        assert r.status == "completed" and r.current_stage == 14 and r.finished_at is not None
        stages = s.exec(select(StageResult).where(StageResult.run_id == run.id).order_by(StageResult.number)).all()
        assert [st.status for st in stages] == ["completed"] * 14
        assert all(st.output and st.summary for st in stages)
        assert "SAM $450.0M" in next(st.summary for st in stages if st.key == "market_sizing")
        tasks = s.exec(select(Task).where(Task.run_id == run.id)).all()
        assert len(tasks) == 5
        assert sum(1 for t in tasks if t.status == "blocked") == 3  # gmail, higgsfield, firecrawl not connected
        assert all(t.error.startswith("Connect ") for t in tasks if t.status == "blocked")
        assert sum(1 for t in tasks if t.status == "proposed") == 2
        kinds = {d.kind for d in s.exec(select(Deliverable).where(Deliverable.run_id == run.id)).all()}
        assert {"market_research", "personas_icp", "positioning_brief", "pricing_analysis", "gtm_plan"} <= kinds
        assert len(s.exec(select(Insight).where(Insight.run_id == run.id)).all()) > 0


async def test_execute_task_requires_approval(sample_profile):
    cid = _company(sample_profile)
    run = orchestrator.create_run(cid)
    await orchestrator.run_pipeline(run.id)
    with session_scope() as s:
        tid = s.exec(select(Task).where(Task.run_id == run.id, Task.status == "proposed")).first().id
    assert await executors.execute_task(tid) is False
    with session_scope() as s:
        assert s.get(Task, tid).status == "proposed"
    executors._set(tid, status="approved")
    assert await executors.execute_task(tid) is True
    with session_scope() as s:
        t = s.get(Task, tid)
        assert t.status == "done" and t.result["pieces"]
        d = s.exec(select(Deliverable).where(Deliverable.run_id == run.id, Deliverable.kind == "content_pack")).first()
        assert d is not None and "ADPLANE" in d.content_md


async def test_second_run_blocked_while_running(sample_profile):
    cid = _company(sample_profile)
    run = orchestrator.create_run(cid)
    import pytest
    with session_scope() as s:
        r = s.get(Run, run.id); r.status = "running"; s.add(r); s.commit()
    with pytest.raises(RuntimeError):
        orchestrator.create_run(cid)
