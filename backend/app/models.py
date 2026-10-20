"""SQLModel tables. JSON columns hold validated Pydantic payloads (see
schemas.py); the scalar columns are the ones we query or sort on."""
from __future__ import annotations

from datetime import datetime, timezone
from typing import Any, Optional

from sqlalchemy import JSON, Column, Text
from sqlmodel import Field, SQLModel


def utcnow() -> datetime:
    return datetime.now(timezone.utc)


class Company(SQLModel, table=True):
    id: Optional[int] = Field(default=None, primary_key=True)
    name: str = Field(index=True)
    profile: dict[str, Any] = Field(default_factory=dict, sa_column=Column(JSON))
    created_at: datetime = Field(default_factory=utcnow)
    updated_at: datetime = Field(default_factory=utcnow)


class Run(SQLModel, table=True):
    id: Optional[int] = Field(default=None, primary_key=True)
    company_id: int = Field(foreign_key="company.id", index=True)
    status: str = Field(default="queued", index=True)
    current_stage: int = 0
    cost_usd: float = 0.0
    error: Optional[str] = Field(default=None, sa_column=Column(Text))
    started_at: Optional[datetime] = None
    finished_at: Optional[datetime] = None
    created_at: datetime = Field(default_factory=utcnow)


class StageResult(SQLModel, table=True):
    id: Optional[int] = Field(default=None, primary_key=True)
    run_id: int = Field(foreign_key="run.id", index=True)
    number: int
    key: str = Field(index=True)
    title: str
    status: str = "pending"
    summary: str = Field(default="", sa_column=Column(Text))
    output: Optional[dict[str, Any]] = Field(default=None, sa_column=Column(JSON))
    cost_usd: float = 0.0
    started_at: Optional[datetime] = None
    finished_at: Optional[datetime] = None


class Task(SQLModel, table=True):
    id: Optional[int] = Field(default=None, primary_key=True)
    run_id: int = Field(foreign_key="run.id", index=True)
    company_id: int = Field(foreign_key="company.id", index=True)
    agent: str
    action: str
    title: str
    description: str = Field(default="", sa_column=Column(Text))
    inputs: dict[str, Any] = Field(default_factory=dict, sa_column=Column(JSON))
    estimated_cost: str = ""
    requires_approval: bool = True
    integration: Optional[str] = None
    status: str = Field(default="proposed", index=True)
    result: Optional[dict[str, Any]] = Field(default=None, sa_column=Column(JSON))
    error: Optional[str] = Field(default=None, sa_column=Column(Text))
    created_at: datetime = Field(default_factory=utcnow)
    updated_at: datetime = Field(default_factory=utcnow)


class Deliverable(SQLModel, table=True):
    id: Optional[int] = Field(default=None, primary_key=True)
    run_id: int = Field(foreign_key="run.id", index=True)
    company_id: int = Field(foreign_key="company.id", index=True)
    kind: str = Field(index=True)
    title: str
    content_md: str = Field(default="", sa_column=Column(Text))
    meta: dict[str, Any] = Field(default_factory=dict, sa_column=Column(JSON))
    generated_by: str = ""
    created_at: datetime = Field(default_factory=utcnow)


class Event(SQLModel, table=True):
    id: Optional[int] = Field(default=None, primary_key=True)
    run_id: int = Field(foreign_key="run.id", index=True)
    ts: datetime = Field(default_factory=utcnow)
    agent: str = "orchestrator"
    level: str = "info"
    stage: Optional[str] = None
    message: str = Field(default="", sa_column=Column(Text))


class Insight(SQLModel, table=True):
    id: Optional[int] = Field(default=None, primary_key=True)
    run_id: int = Field(foreign_key="run.id", index=True)
    kind: str
    severity: str
    title: str
    detail: str = Field(default="", sa_column=Column(Text))
    ts: datetime = Field(default_factory=utcnow)


class Integration(SQLModel, table=True):
    """Non-secret integration settings. Secrets live in env, never here."""

    id: Optional[int] = Field(default=None, primary_key=True)
    name: str = Field(index=True, unique=True)
    config: dict[str, Any] = Field(default_factory=dict, sa_column=Column(JSON))
    updated_at: datetime = Field(default_factory=utcnow)


class ChatMessage(SQLModel, table=True):
    id: Optional[int] = Field(default=None, primary_key=True)
    company_id: int = Field(foreign_key="company.id", index=True)
    role: str
    content: str = Field(default="", sa_column=Column(Text))
    meta: dict[str, Any] = Field(default_factory=dict, sa_column=Column(JSON))
    ts: datetime = Field(default_factory=utcnow)
