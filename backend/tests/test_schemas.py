import json

import pytest

from app import schemas as S
from app.prompts import render, stage_card
from app.runner import FakeRunner

COMPANY = json.dumps({"name": "Loopwise", "geography": "North America", "revenue_target": 1_000_000, "monthly_budget": 12_000,
                      "competitors": [{"name": "Gong"}], "known_metrics": {"average_sale_value": 12_000}})


def test_every_stage_has_a_schema_and_prompt():
    for spec in S.STAGES:
        schema = S.STAGE_SCHEMAS[spec.key]
        js = schema.model_json_schema()
        assert js["type"] == "object" and js["properties"]
        assert "{company}" in render.__globals__["load_prompt"](spec.key)
        assert stage_card(spec.number).startswith(f"## Stage {spec.number}")


@pytest.mark.parametrize("spec", S.STAGES, ids=[s.key for s in S.STAGES])
async def test_fake_runner_validates_against_stage_schema(spec):
    prompt = render(spec.key, card=stage_card(spec.number), company=COMPANY, prior="{}")
    out, cost = await FakeRunner().run_structured(system="s", prompt=prompt, schema=S.STAGE_SCHEMAS[spec.key], model="m",
                                                  use_web=spec.uses_web, use_calc=spec.uses_calculators)
    S.STAGE_SCHEMAS[spec.key].model_validate(out)
    assert cost == 0.0
    if spec.key == "market_sizing":
        assert out["sam_usd"] == 450e6 and out["som_usd"] == 13.5e6
    if spec.key == "audience":
        assert sum(s["share_pct"] for s in out["segments"]) == 100
    if spec.key == "comms_plan":
        assert sum(c["budget_pct"] for c in out["channel_plan"]) == 100
    if spec.key == "review":
        assert {t["funnel_stage"] for t in out["tactics_matrix"]} == {"awareness", "consideration", "action", "retain", "refer"}
        assert len(out["proposed_tasks"]) == 5


@pytest.mark.parametrize("action", list(S.TASK_SCHEMAS), ids=list(S.TASK_SCHEMAS))
async def test_fake_runner_validates_against_task_schema(action):
    prompt = render("content", task=action, company=COMPANY, prior="{}")
    out, _ = await FakeRunner().run_structured(system="s", prompt=prompt, schema=S.TASK_SCHEMAS[action], model="m")
    S.TASK_SCHEMAS[action].model_validate(out)


def test_missing_intake_fields():
    p = S.CompanyProfile(name="X")
    missing = {m["field"] for m in S.missing_intake_fields(p)}
    assert "description" in missing and "revenue_target" in missing
    full = S.CompanyProfile(name="X", description="d", product_description="p", problem_solved="s", industry="i", geography="g",
                            revenue_target=1, monthly_budget=1)
    assert S.missing_intake_fields(full) == []
