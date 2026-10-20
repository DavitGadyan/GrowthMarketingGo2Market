"""ORM rows -> API models (and the JSON dicts the bus carries)."""
from __future__ import annotations

from typing import Any

from .models import ChatMessage, Company, Deliverable, Event, Insight, Run, StageResult, Task
from .schemas import (ChatMessageOut, CompanyOut, CompanyProfile, DeliverableOut, EventOut, InsightOut, RunOut,
                      StageResultOut, TaskOut, missing_intake_fields)


def company_out(c: Company) -> CompanyOut:
    profile = CompanyProfile.model_validate({**c.profile, "name": c.name})
    return CompanyOut(id=c.id, name=c.name, profile=profile, created_at=c.created_at, updated_at=c.updated_at,
                      missing_intake=missing_intake_fields(profile))


def run_out(r: Run) -> RunOut:
    return RunOut.model_validate(r, from_attributes=True)


def stage_out(s: StageResult) -> StageResultOut:
    return StageResultOut.model_validate(s, from_attributes=True)


def task_out(t: Task) -> TaskOut:
    return TaskOut.model_validate(t, from_attributes=True)


def deliverable_out(d: Deliverable) -> DeliverableOut:
    return DeliverableOut.model_validate(d, from_attributes=True)


def event_out(e: Event) -> EventOut:
    return EventOut.model_validate(e, from_attributes=True)


def insight_out(i: Insight) -> InsightOut:
    return InsightOut.model_validate(i, from_attributes=True)


def chat_out(m: ChatMessage) -> ChatMessageOut:
    return ChatMessageOut.model_validate(m, from_attributes=True)


def envelope(kind: str, model: Any) -> dict[str, Any]:
    data = model.model_dump(mode="json") if hasattr(model, "model_dump") else model
    return {"type": kind, "data": data}
