import json
import time

import pytest
from fastapi.testclient import TestClient

from app.main import app


@pytest.fixture(scope="module")
def client():
    with TestClient(app) as c:
        yield c


def _wait_run(client, run_id, timeout=30):
    deadline = time.time() + timeout
    while time.time() < deadline:
        r = client.get(f"/api/runs/{run_id}").json()
        if r["status"] in ("completed", "failed", "cancelled"):
            return r
        time.sleep(0.1)
    raise AssertionError("run did not finish")


def _wait_task(client, task_id, timeout=30):
    deadline = time.time() + timeout
    while time.time() < deadline:
        t = [x for x in client.get("/api/tasks").json() if x["id"] == task_id][0]
        if t["status"] in ("done", "failed"):
            return t
        time.sleep(0.1)
    raise AssertionError("task did not finish")


def test_health(client):
    h = client.get("/api/health").json()
    assert h["ok"] and h["fake_agents"] is True


def test_full_flow(client, sample_profile):
    c = client.post("/api/companies", json=sample_profile)
    assert c.status_code == 201, c.text
    company = c.json()
    assert company["missing_intake"] == []
    cid = company["id"]

    r = client.post(f"/api/companies/{cid}/runs")
    assert r.status_code == 201, r.text
    run_id = r.json()["id"]
    assert len(client.get(f"/api/runs/{run_id}/stages").json()) == 14

    run = _wait_run(client, run_id)
    assert run["status"] == "completed", run
    stages = client.get(f"/api/runs/{run_id}/stages").json()
    assert all(s["status"] == "completed" for s in stages)
    assert client.get(f"/api/runs/{run_id}/events").json()
    assert client.get(f"/api/runs/{run_id}/insights").json()

    tasks = client.get("/api/tasks", params={"run_id": run_id}).json()
    proposed = [t for t in tasks if t["status"] == "proposed"]
    blocked = [t for t in tasks if t["status"] == "blocked"]
    assert len(proposed) == 2 and len(blocked) == 3

    # blocked tasks cannot be approved
    assert client.post(f"/api/tasks/{blocked[0]['id']}/approve").status_code == 409

    a = client.post(f"/api/tasks/{proposed[0]['id']}/approve")
    assert a.status_code == 200 and a.json()["status"] in ("approved", "running", "done")
    assert client.post(f"/api/tasks/{proposed[0]['id']}/approve").status_code == 409
    t = _wait_task(client, proposed[0]["id"])
    assert t["status"] == "done" and t["result"]["pieces"]

    ds = client.get("/api/deliverables", params={"company_id": cid}).json()
    assert {d["kind"] for d in ds} >= {"market_research", "personas_icp", "positioning_brief", "pricing_analysis", "gtm_plan", "content_pack"}
    html = client.get(f"/api/deliverables/{ds[0]['id']}/export", params={"fmt": "html"})
    assert html.status_code == 200 and "attachment" in html.headers["content-disposition"] and "<table" in html.text
    md = client.get(f"/api/deliverables/{ds[0]['id']}/export")
    assert md.headers["content-type"].startswith("text/markdown")

    dash = client.get("/api/dashboard", params={"company_id": cid}).json()
    assert dash["plan_readiness_pct"] == 72 and dash["deliverables"] >= 6 and dash["tasks_done"] == 1

    # SSE replay on a finished run ends with done
    with client.stream("GET", f"/api/runs/{run_id}/events/stream") as resp:
        types = []
        for line in resp.iter_lines():
            if line.startswith("data:"):
                types.append(json.loads(line[5:])["type"])
                if types[-1] == "done":
                    break
        assert "run" in types and "stage" in types and "event" in types and types[-1] == "done"

    # reject a blocked task
    assert client.post(f"/api/tasks/{blocked[1]['id']}/reject").json()["status"] == "rejected"


def test_second_run_conflicts_while_first_is_active(client, sample_profile, monkeypatch):
    from app import main as m
    monkeypatch.setattr(m.orchestrator, "start_run", lambda run_id, from_number=1: None)  # stays queued
    cid = client.post("/api/companies", json=sample_profile).json()["id"]
    assert client.post(f"/api/companies/{cid}/runs").status_code == 201
    second = client.post(f"/api/companies/{cid}/runs")
    assert second.status_code == 409 and "already queued" in second.json()["detail"]


def test_chat_stream_and_propose(client, sample_profile):
    cid = client.post("/api/companies", json=sample_profile).json()["id"]
    run_id = client.post(f"/api/companies/{cid}/runs").json()["id"]
    _wait_run(client, run_id)
    with client.stream("POST", "/api/chat", json={"company_id": cid, "message": "Please propose the first ad"}) as resp:
        envs = [json.loads(l[5:]) for l in resp.iter_lines() if l.startswith("data:")]
    types = [e["type"] for e in envs]
    assert types[0] == "message" and "token" in types and "task" in types and types[-1] == "done"
    assert any(e["type"] == "message" and e["data"]["role"] == "agent" for e in envs)
    hist = client.get("/api/chat", params={"company_id": cid}).json()
    assert [m["role"] for m in hist] == ["user", "agent"]
    assert any(t["status"] == "proposed" and t["action"] == "write_ad_copy" for t in client.get("/api/tasks", params={"company_id": cid}).json())


def test_integrations_and_company_update(client, sample_profile):
    ints = client.get("/api/integrations").json()
    assert {i["name"] for i in ints} == {"anthropic", "firecrawl", "gmail", "higgsfield"}
    assert not any(i["connected"] for i in ints if i["name"] in ("firecrawl", "gmail", "higgsfield"))
    put = client.put("/api/integrations/gmail", json={"config": {"sender_name": "Dana"}})
    assert put.status_code == 200 and put.json()["config"] == {"sender_name": "Dana"}
    assert client.put("/api/integrations/nope", json={"config": {}}).status_code == 404

    cid = client.post("/api/companies", json={**sample_profile, "description": ""}).json()["id"]
    assert client.get(f"/api/companies/{cid}").json()["missing_intake"][0]["field"] == "description"
    upd = client.put(f"/api/companies/{cid}", json=sample_profile)
    assert upd.status_code == 200 and upd.json()["missing_intake"] == []
