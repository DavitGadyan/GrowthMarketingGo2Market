"""Builds the text context agents see: the company profile as JSON, condensed
prior-stage outputs, and one-line stage summaries."""
from __future__ import annotations

import json
from typing import Any

from sqlmodel import select

from .db import session_scope
from .models import Company, StageResult
from .schemas import CompanyProfile

PRIOR_CAP_CHARS = 12_000

# Which earlier stages each stage reads in full (everything else arrives as a summary).
PRIOR_KEYS: dict[str, list[str]] = {
    "situation_analysis": [],
    "market_sizing": ["situation_analysis"],
    "target_market": ["situation_analysis", "market_sizing"],
    "feature_benefit": ["situation_analysis", "target_market"],
    "audience": ["target_market", "feature_benefit"],
    "positioning": ["feature_benefit", "audience"],
    "gtm_motion": ["positioning", "target_market"],
    "objectives": ["gtm_motion", "market_sizing", "positioning"],
    "demand_math": ["objectives", "gtm_motion", "market_sizing"],
    "buyer_journey": ["audience", "positioning", "gtm_motion"],
    "marketing_mix": ["positioning", "audience", "situation_analysis", "gtm_motion"],
    "comms_plan": ["positioning", "buyer_journey", "objectives", "marketing_mix"],
    "gtm_plan": ["objectives", "comms_plan", "demand_math", "audience", "positioning"],
    "review": ["gtm_plan", "demand_math", "comms_plan", "objectives", "gtm_motion", "market_sizing"],
    # execution tasks
    "task": ["positioning", "audience", "comms_plan", "review"],
}


def company_json(company: Company) -> str:
    profile = CompanyProfile.model_validate(company.profile).model_dump(mode="json")
    profile["name"] = company.name
    return json.dumps(profile, indent=1)


def stage_rows(run_id: int) -> list[StageResult]:
    with session_scope() as s:
        return list(s.exec(select(StageResult).where(StageResult.run_id == run_id).order_by(StageResult.number)).all())


def summaries_text(run_id: int) -> str:
    rows = stage_rows(run_id)
    if not rows:
        return "(no run yet)"
    return "\n".join(f"{r.number}. {r.title} [{r.status}]" + (f" - {r.summary}" if r.summary else "") for r in rows)


def prior_json(run_id: int, for_key: str) -> str:
    """Full JSON for the stages listed in PRIOR_KEYS[for_key], summaries for
    the rest, trimmed to PRIOR_CAP_CHARS by dropping full outputs from the
    end of the preference list first."""
    rows = {r.key: r for r in stage_rows(run_id) if r.output}
    wanted = [k for k in PRIOR_KEYS.get(for_key, []) if k in rows]
    while True:
        payload: dict[str, Any] = {
            "summaries": {k: r.summary for k, r in rows.items() if r.summary},
            "outputs": {k: rows[k].output for k in wanted},
        }
        text = json.dumps(payload, indent=1, default=str)
        if len(text) <= PRIOR_CAP_CHARS or not wanted:
            return text
        wanted = wanted[:-1]
