"""Influencer research: the follower-to-engagement rule, the demo output, and the API flow."""
import asyncio
import time

import pytest
from fastapi.testclient import TestClient

from app import calculators as calc
from app.main import app
from app.runner import FakeRunner
from app.schemas import TASK_SCHEMAS, InfluencerResearch


# ------------------------------------------------------------ calculators --

def test_engagement_rate_and_tiers():
    assert calc.engagement_rate(35_000, 25, 1) == pytest.approx(26 / 35_000)
    assert calc.engagement_rate(0, 10, 1) == 0.0
    assert [calc.tier(n) for n in (0, 9_999, 10_000, 99_999, 100_000, 499_999, 500_000, 5_000_000)] == \
        ["nano", "nano", "micro", "micro", "mid", "mid", "macro", "macro"]


def test_user_examples_drive_the_verdict():
    # 35k followers but 20-30 likes a post: bought reach, whatever the other ratios say
    score, verdict, reasons = calc.authenticity_score("instagram", 35_000, 1_200, 25, 1)
    assert verdict == "likely_fake" and score < 40
    assert any("far below" in r for r in reasons)
    # 30k followers with 500-1k interactions: a real audience
    score, verdict, _ = calc.authenticity_score("instagram", 30_000, 800, 750, 40)
    assert verdict == "real" and score >= 65
    # follow-for-follow + likes without comments lands in the middle at best
    score, verdict, reasons = calc.authenticity_score("x", 118_000, 112_000, 95, 3)
    assert verdict in ("likely_fake", "suspicious")
    assert any("follow-for-follow" in r for r in reasons)


def test_thresholds_shape():
    ig, x = calc.thresholds("instagram"), calc.thresholds("x")
    assert [t["tier"] for t in ig] == ["nano", "micro", "mid", "macro"]
    assert all(a["good_er"] > b["good_er"] and a["poor_er"] > b["poor_er"] for a, b in zip(ig, x))  # X runs far below Instagram
    assert all(t["good_er"] > t["ok_er"] > t["poor_er"] for t in ig + x)


# ------------------------------------------------------------ fake runner --

def _fake_research():
    prompt = '# Company profile (JSON)\n{"name": "Loopwise", "industry": "Sales software", "product_description": "Records calls, writes CRM notes"}\n'
    out, _cost = asyncio.run(FakeRunner().run_structured(system="", prompt=prompt, schema=TASK_SCHEMAS["influencer_research"], model="x"))
    return out


def test_fake_runner_output_validates():
    prompt = '# Company profile (JSON)\n{"name": "Loopwise", "industry": "Sales software", "product_description": "Records calls, writes CRM notes"}\n'
    out, cost = asyncio.run(FakeRunner().run_structured(system="", prompt=prompt, schema=TASK_SCHEMAS["influencer_research"], model="x"))
    research = InfluencerResearch.model_validate(out)
    assert len(research.candidates) == 10 and cost == 0.0
    verdicts = {c.verdict for c in research.candidates}
    assert {"real", "likely_fake"} <= verdicts
    assert [c.rank for c in research.candidates] == list(range(1, 11))
    for c in research.candidates:
        assert len(c.outreach_message.split()) <= 80
        s, v, _ = calc.authenticity_score(c.platform, c.followers, c.following, c.avg_likes, c.avg_comments)
        assert (s, v) == (c.authenticity_score, c.verdict)


# ------------------------------------------------------------------- API --

@pytest.fixture(scope="module")
def client():
    with TestClient(app) as c:
        yield c


def _wait_research(client, company_id, timeout=30):
    deadline = time.time() + timeout
    while time.time() < deadline:
        r = client.get("/api/influencers", params={"company_id": company_id}).json()
        if r["status"] in ("done", "failed"):
            return r
        time.sleep(0.1)
    raise AssertionError("research did not finish")


def test_influencer_api_flow(client, sample_profile):
    cid = client.post("/api/companies", json={**sample_profile, "name": "Loopwise Influencers"}).json()["id"]
    assert client.get("/api/influencers", params={"company_id": cid}).status_code == 404

    r = client.post("/api/influencers/research", json={"company_id": cid, "platforms": ["instagram", "x"], "niche": "sales ops creators"})
    assert r.status_code == 202, r.text
    assert r.json()["status"] in ("approved", "running")

    res = _wait_research(client, cid)
    assert res["status"] == "done", res
    assert res["niche"] == "sales ops creators" and res["platforms"] == ["instagram", "x"]
    cands = res["result"]["candidates"]
    assert len(cands) == 10 and cands[0]["rank"] == 1
    assert {c["verdict"] for c in cands} >= {"real", "likely_fake"}
    assert res["result"]["rule"]["thresholds"]

    kinds = [d["kind"] for d in client.get("/api/deliverables", params={"company_id": cid}).json()]
    assert "influencer_list" in kinds

    task_id = res["task_id"]
    picked = [c["handle"] for c in cands if c["verdict"] == "real"][:2]
    o = client.post(f"/api/influencers/{task_id}/outreach", json={"handles": picked})
    assert o.status_code == 201, o.text
    task = o.json()
    assert task["action"] == "draft_outreach_emails" and task["integration"] == "gmail" and task["requires_approval"]
    assert task["status"] == "blocked" and "gmail" in (task["error"] or "")  # no Gmail in the test env
    assert len(task["inputs"]["recipients"]) == len(picked)
    assert client.post(f"/api/influencers/{task_id}/outreach", json={"handles": ["@nobody"]}).status_code == 422


def test_influencer_research_without_a_run(client, sample_profile):
    cid = client.post("/api/companies", json={**sample_profile, "name": "No-run Co"}).json()["id"]
    r = client.post("/api/influencers/research", json={"company_id": cid, "max_candidates": 5})
    assert r.status_code == 202, r.text
    res = _wait_research(client, cid)
    assert res["status"] == "done" and len(res["result"]["candidates"]) == 10  # demo runner always returns its 10


def test_double_start_is_refused(client, sample_profile):
    from app.db import session_scope
    from app.models import Run, Task
    cid = client.post("/api/companies", json={**sample_profile, "name": "Busy Co"}).json()["id"]
    with session_scope() as s:
        run = Run(company_id=cid, status="completed"); s.add(run); s.commit(); s.refresh(run)
        s.add(Task(run_id=run.id, company_id=cid, agent="research", action="influencer_research", title="running one",
                   inputs={"platforms": ["instagram"], "niche": "x", "max_candidates": 5}, requires_approval=False, status="running"))
        s.commit()
    r = client.post("/api/influencers/research", json={"company_id": cid})
    assert r.status_code == 409 and "already running" in r.text


# ---- HypeAuditor-style audit ----

def test_audit_worked_examples():
    fake = calc.creator_audit("instagram", 35_000, 1_000, 25, 1, comments_authenticity=0.2, growth="spikes")
    assert fake["audience_types"]["suspicious"] >= 0.4
    assert fake["aqs"] < 30 and fake["aqs_band"] == "poor"
    real = calc.creator_audit("instagram", 30_000, 900, 750, 40, comments_authenticity=0.8, growth="organic")
    assert real["aqs"] >= 65 and real["aqs_band"] in ("good", "excellent")
    assert abs(sum(real["audience_types"].values()) - 1.0) < 0.01
    assert real["estimated_reach"] > 0 and real["estimated_price_usd"] > 0 and real["cpe_usd"] > 0
    assert real["er_vs_similar"] == "above"


def test_aqs_bands_and_mass_followers():
    assert calc.aqs_band(80) == "excellent" and calc.aqs_band(79) == "good" and calc.aqs_band(50) == "average"
    assert calc.aqs_band(49) == "low" and calc.aqs_band(29) == "poor"
    # 118k followers following 112k accounts -> mass-follower weight rises
    t = calc.audience_type_estimate(118_000, 112_000, 0.0008, 0.03, "x")
    assert t["mass_followers"] >= 0.25
    # X prices at 0.6x of Instagram for the same numbers
    assert calc.estimated_price_usd("x", 30_000, 0.02, 80) < calc.estimated_price_usd("instagram", 30_000, 0.02, 80)


def test_fake_candidates_carry_a_valid_audit():
    out = _fake_research()
    r = InfluencerResearch.model_validate(out)
    assert all(c.audit is not None for c in r.candidates)
    for c in r.candidates:
        a = c.audit
        assert 1 <= a.aqs <= 100 and abs(sum(a.audience_types.model_dump().values()) - 1) < 0.02
        assert 0 <= a.comments_authenticity <= 1 and a.estimated_price_usd and a.estimated_reach
        recomputed = calc.creator_audit(c.platform, c.followers, c.following, c.avg_likes, c.avg_comments, a.comments_authenticity, a.followers_growth)
        assert recomputed["aqs"] == a.aqs
    fakes = [c for c in r.candidates if c.verdict == "likely_fake"]
    assert fakes and all(c.audit.followers_growth == "spikes" and c.audit.likes_spread == "even" for c in fakes)
    reals = [c for c in r.candidates if c.verdict == "real"]
    assert reals and all(c.audit.comments_authenticity >= 0.75 for c in reals)


def test_deliverable_contains_audit(client, sample_profile):
    cid = client.post("/api/companies", json=sample_profile).json()["id"]
    client.post("/api/companies/%d/runs" % cid)
    r = client.post("/api/influencers/research", json={"company_id": cid, "platforms": ["instagram"], "niche": "sales", "max_candidates": 10})
    assert r.status_code in (200, 202)
    for _ in range(100):
        g = client.get("/api/influencers", params={"company_id": cid}).json()
        if g["status"] in ("done", "failed"):
            break
        time.sleep(0.1)
    assert g["status"] == "done"
    ds = [d for d in client.get("/api/deliverables", params={"company_id": cid}).json() if d["kind"] == "influencer_list"]
    assert ds and "AQS" in ds[-1]["content_md"] and "Audit (estimated)" in ds[-1]["content_md"]


def test_x_calibration_and_override():
    from app import calculators as calc
    # real X creators: 0.5% on a nano account and ~0.08% on a micro account are normal, not bought
    s1, v1, _ = calc.authenticity_score("x", 1336, 390, 5.33, 1.5)
    assert v1 == "real", (s1, v1)
    s2, v2, _ = calc.authenticity_score("x", 29375, 1452, 16.17, 6.33)
    assert v2 in ("real", "suspicious") and v2 != "likely_fake", (s2, v2)
    # the agent's researched rule overrides the defaults for the duration of the call
    strict = [{"platform": "x", "tier": "micro", "good_er": 0.05, "ok_er": 0.02, "poor_er": 0.01}]
    with calc.using_thresholds(strict):
        s3, v3, _ = calc.authenticity_score("x", 29375, 1452, 16.17, 6.33)
    assert v3 == "likely_fake", (s3, v3)
    s4, v4, _ = calc.authenticity_score("x", 29375, 1452, 16.17, 6.33)
    assert v4 == v2  # override did not leak
