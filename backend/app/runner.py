"""Agent runners. `SdkRunner` drives the Claude Agent SDK; `FakeRunner` is a
deterministic, network-free stand-in for tests and no-key demos. Both return
dicts already validated against the stage schema."""
from __future__ import annotations

import json
import re
import tempfile
from collections.abc import AsyncIterator, Awaitable, Callable
from typing import Any, Protocol

from pydantic import BaseModel, ValidationError

from . import calculators as calc
from .settings import settings

OnEvent = Callable[[str, str], Awaitable[None]]  # (level, message)
DISALLOWED_BUILTINS = ["Bash", "Write", "Edit", "Read", "Glob", "Grep", "NotebookEdit", "Task", "Agent"]
WEB_TOOLS = ["WebSearch", "WebFetch"]


class RunnerError(RuntimeError):
    pass


class AgentRunner(Protocol):
    async def run_structured(self, *, system: str, prompt: str, schema: type[BaseModel], model: str,
                             use_web: bool = False, use_calc: bool = False, extra_mcp: dict[str, Any] | None = None,
                             allowed_extra_tools: list[str] | None = None, disallowed_extra_tools: list[str] | None = None,
                             max_budget_usd: float = 2.0, on_event: OnEvent | None = None) -> tuple[dict[str, Any], float]: ...

    def stream_chat(self, *, session_key: str, system: str, prompt: str, extra_mcp: dict[str, Any] | None = None,
                    allowed_extra_tools: list[str] | None = None, model: str) -> AsyncIterator[dict[str, Any]]: ...


async def _noop(level: str, message: str) -> None:
    return None


def _strip_fences(text: str) -> str:
    text = text.strip()
    m = re.search(r"```(?:json)?\s*(.*?)```", text, re.S)
    return m.group(1).strip() if m else text


def _validate(schema: type[BaseModel], data: Any) -> dict[str, Any]:
    try:
        return schema.model_validate(data).model_dump(mode="json")
    except ValidationError as e:
        raise RunnerError(f"{schema.__name__} output failed validation: {e.errors()[:3]}") from e


# ----------------------------------------------------------------- SDK ----

class SdkRunner:
    def __init__(self) -> None:
        self._workdir = tempfile.mkdtemp(prefix="growthpilot-agent-")
        self._clients: dict[str, Any] = {}

    def _options(self, *, system: str, model: str, use_web: bool, use_calc: bool, extra_mcp: dict | None,
                 allowed_extra: list[str] | None, disallowed_extra: list[str] | None, max_budget_usd: float,
                 schema: type[BaseModel] | None, include_partial: bool = False, max_turns: int = 25):
        from claude_agent_sdk import ClaudeAgentOptions
        from .mcp_tools import calc_server

        mcp: dict[str, Any] = {}
        allowed: list[str] = []
        if use_web:
            allowed += WEB_TOOLS
        if use_calc:
            mcp["calc"] = calc_server
            allowed += ["mcp__calc__*"]
        if extra_mcp:
            mcp.update(extra_mcp)
        allowed += allowed_extra or []
        kwargs: dict[str, Any] = dict(
            system_prompt=system,
            tools=WEB_TOOLS if use_web else [],
            allowed_tools=allowed,
            disallowed_tools=DISALLOWED_BUILTINS + (disallowed_extra or []),
            mcp_servers=mcp,
            strict_mcp_config=True,
            setting_sources=[],
            permission_mode="dontAsk",
            model=model,
            max_turns=max_turns,
            max_budget_usd=max_budget_usd,
            cwd=self._workdir,
            include_partial_messages=include_partial,
        )
        if settings.anthropic_api_key:
            kwargs["env"] = {"ANTHROPIC_API_KEY": settings.anthropic_api_key}
        if schema is not None:
            kwargs["output_format"] = {"type": "json_schema", "schema": schema.model_json_schema()}
        return ClaudeAgentOptions(**kwargs)

    async def run_structured(self, *, system, prompt, schema, model, use_web=False, use_calc=False, extra_mcp=None,
                             allowed_extra_tools=None, disallowed_extra_tools=None, max_budget_usd=2.0, on_event=None, max_turns=25):
        from claude_agent_sdk import AssistantMessage, ResultMessage, ToolUseBlock, query

        on_event = on_event or _noop
        options = self._options(system=system, model=model, use_web=use_web, use_calc=use_calc, extra_mcp=extra_mcp,
                                allowed_extra=allowed_extra_tools, disallowed_extra=disallowed_extra_tools,
                                max_budget_usd=max_budget_usd, schema=schema, max_turns=max_turns)
        result: ResultMessage | None = None
        async for message in query(prompt=prompt, options=options):
            if isinstance(message, AssistantMessage):
                for block in message.content:
                    if isinstance(block, ToolUseBlock):
                        await on_event("info", _describe_tool_call(block.name, block.input))
            elif isinstance(message, ResultMessage):
                result = message
        if result is None:
            raise RunnerError("agent finished without a result message")
        if result.is_error or result.subtype != "success":
            raise RunnerError(f"agent error ({result.subtype}): {result.errors or result.result or 'no detail'}")
        data = result.structured_output
        if data is None and result.result:
            try:
                data = json.loads(_strip_fences(result.result))
            except json.JSONDecodeError as e:
                raise RunnerError(f"agent returned no structured output and the text is not JSON: {e}") from e
        validated = _validate(schema, data)
        cost = float(result.total_cost_usd or 0.0)
        await on_event("success", f"{schema.__name__} ready (${cost:.3f}, {result.num_turns} turns)")
        return validated, cost

    async def stream_chat(self, *, session_key, system, prompt, extra_mcp=None, allowed_extra_tools=None, model):
        from claude_agent_sdk import AssistantMessage, ClaudeSDKClient, ResultMessage, StreamEvent, TextBlock, ToolUseBlock

        client = self._clients.get(session_key)
        if client is None:
            options = self._options(system=system, model=model, use_web=False, use_calc=False, extra_mcp=extra_mcp,
                                    allowed_extra=allowed_extra_tools, disallowed_extra=None,
                                    max_budget_usd=settings.max_budget_usd_per_task, schema=None, include_partial=True)
            client = ClaudeSDKClient(options=options)
            await client.connect()
            self._clients[session_key] = client
        await client.query(prompt)
        streamed: list[str] = []
        texts: list[str] = []
        tool_calls: list[dict[str, Any]] = []
        async for message in client.receive_response():
            if isinstance(message, StreamEvent):
                ev = message.event
                if ev.get("type") == "content_block_delta" and ev.get("delta", {}).get("type") == "text_delta":
                    piece = ev["delta"].get("text", "")
                    if piece:
                        streamed.append(piece)
                        yield {"type": "token", "text": piece}
            elif isinstance(message, AssistantMessage):
                for block in message.content:
                    if isinstance(block, TextBlock):
                        texts.append(block.text)
                    elif isinstance(block, ToolUseBlock):
                        tool_calls.append({"name": block.name, "input": block.input})
            elif isinstance(message, ResultMessage):
                cost = float(message.total_cost_usd or 0.0)
                final = "\n\n".join(t for t in texts if t.strip()) or "".join(streamed)
                yield {"type": "final", "text": final, "tool_calls": tool_calls, "cost_usd": cost,
                       "error": None if message.subtype == "success" else message.subtype}

    async def close(self) -> None:
        for client in self._clients.values():
            try:
                await client.disconnect()
            except Exception:  # noqa: BLE001 - best effort at shutdown
                pass
        self._clients.clear()


def _describe_tool_call(name: str, inp: dict[str, Any]) -> str:
    if name == "WebSearch":
        return f"WebSearch: {inp.get('query', '')}"
    if name == "WebFetch":
        return f"WebFetch: {inp.get('url', '')}"
    if name.startswith("mcp__"):
        parts = name.split("__", 2)
        short = f"{parts[1]}.{parts[2]}" if len(parts) == 3 else name
        args = ", ".join(f"{k}={v}" for k, v in list(inp.items())[:4])
        return f"{short}({args})"
    return f"{name}: {json.dumps(inp)[:120]}"


# ---------------------------------------------------------------- Fake ----

_COMPANY_RE = re.compile(r"# Company profile \(JSON\)\s*(\{.*?\})\s*(?:\n# |\Z)", re.S)


def _company_from_prompt(prompt: str) -> dict[str, Any]:
    m = _COMPANY_RE.search(prompt)
    if not m:
        return {}
    try:
        return json.loads(m.group(1))
    except json.JSONDecodeError:
        return {}


class SchemaFiller:
    """Walks a JSON schema and produces plausible values. Deterministic."""

    def __init__(self, schema: dict[str, Any], company: str):
        self.defs = schema.get("$defs", {})
        self.company = company

    def fill(self, node: dict[str, Any], name: str = "value", depth: int = 0) -> Any:
        if "$ref" in node:
            ref = node["$ref"].split("/")[-1]
            return self.fill(self.defs[ref], name, depth)
        if "anyOf" in node:
            options = [o for o in node["anyOf"] if o.get("type") != "null"] or node["anyOf"]
            return self.fill(options[0], name, depth)
        if "allOf" in node:
            return self.fill(node["allOf"][0], name, depth)
        if "enum" in node:
            return node["enum"][0]
        if "const" in node:
            return node["const"]
        t = node.get("type")
        if isinstance(t, list):
            t = [x for x in t if x != "null"][0] if [x for x in t if x != "null"] else "string"
        if t == "object":
            props = node.get("properties")
            if props:
                return {k: self.fill(v, k, depth + 1) for k, v in props.items()}
            add = node.get("additionalProperties")
            sub = add if isinstance(add, dict) else {"type": "string"}
            return {f"{name}_a": self.fill(sub, name, depth + 1), f"{name}_b": self.fill(sub, name, depth + 1)}
        if t == "array":
            n = 2 if depth > 2 else 3
            return [self.fill(node.get("items", {"type": "string"}), name, depth + 1) for _ in range(n)]
        if t == "integer":
            return self._int(name)
        if t == "number":
            return self._num(name)
        if t == "boolean":
            return True
        return self._str(name)

    def _int(self, name: str) -> int:
        if "pct" in name:
            return 60
        if "week" in name:
            return 3
        if name in ("attention", "distinction", "positioning", "linkage", "amplification", "net_equity", "emotion"):
            return 5
        if name == "total":
            return 35
        if "score" in name or "1_10" in name:
            return 8
        return 3

    def _num(self, name: str) -> float:
        if name.endswith("_pct") or "rate" in name or "pct" in name:
            return 0.25
        if "usd" in name:
            return 120000.0
        if "count" in name:
            return 1200.0
        return 42.0

    def _str(self, name: str) -> str:
        pretty = name.replace("_", " ")
        if name == "url":
            return "https://example.com/source"
        if name in ("deadline",):
            return "end of Q4"
        return f"{self.company}: {pretty} (illustrative)"


class FakeRunner:
    """Deterministic outputs that are shaped like real ones, so the UI and the
    tests exercise every screen without a key or network."""

    async def run_structured(self, *, system, prompt, schema, model, use_web=False, use_calc=False, extra_mcp=None,
                             allowed_extra_tools=None, disallowed_extra_tools=None, max_budget_usd=2.0, on_event=None, max_turns=25):
        on_event = on_event or _noop
        company = _company_from_prompt(prompt)
        name = company.get("name") or "Company"
        filler = SchemaFiller(schema.model_json_schema(), name)
        data = filler.fill(schema.model_json_schema())
        override = _OVERRIDES.get(schema.__name__)
        if override:
            data = override(data, company, name)
        if use_web:
            await on_event("info", f"WebSearch: {name} competitors pricing")
        if use_calc:
            await on_event("info", "calc.market_sizing(...)" if schema.__name__ == "MarketSizing" else "calc.reverse_waterfall(...)")
        validated = _validate(schema, data)
        await on_event("success", f"{schema.__name__} ready")
        return validated, 0.0

    async def stream_chat(self, *, session_key, system, prompt, extra_mcp=None, allowed_extra_tools=None, model):
        """Short, conversational demo replies: one answer keyed to the question, one next step."""
        from .mcp_tools import chat_context, g_propose_task
        import json as _json

        m = re.search(r"Stage summaries.*?:\n(.*)$", system, re.S)
        lines = [l.strip() for l in (m.group(1) if m else "").splitlines() if l.strip()]

        def fact(*keys: str) -> str | None:
            for l in lines:
                if any(k in l.lower() for k in keys):
                    return l.split(" - ", 1)[-1].strip() if " - " in l else l
            return None

        q = prompt.lower()
        tool_calls: list[dict[str, Any]] = []
        if "propose" in q and chat_context.get() is not None:
            res = await g_propose_task.handler({"agent": "content", "action": "write_ad_copy", "title": "LinkedIn ad copy, A/B pair",
                                                "description": "Two LinkedIn ads in the positioning line's voice, scored with ADPLANE.",
                                                "inputs": {"channel": "LinkedIn"}, "estimated_cost": "~$0.20 API", "integration": None})
            tool_calls.append({"name": "mcp__growthpilot__propose_task", "input": {"action": "write_ad_copy"}})
            info = _json.loads(res["content"][0]["text"])
            reply = (f"Queued task #{info.get('task_id')}: two LinkedIn ads in the positioning line's voice, ADPLANE-scored, about $0.20. "
                     "It waits for your approval - say the word.")
        elif not lines:
            reply = "No run yet. Start one and I'll research the market, build the plan and propose what to execute."
        elif any(k in q for k in ("segment", "lead with", "icp", "persona", "who should")):
            reply = (f"Lead with the segment the ICP points at - {fact('personas, icp') or 'see stage 5'}. "
                     "It has the fastest buying cycle in your best-customer data. Want me to draft the LinkedIn ads for it?")
        elif any(k in q for k in ("som", "tam", "sam", "market size", "how big")):
            reply = f"{fact('market sizing') or 'Sizing is in stage 2'}. SOM is the 12-36 month target at a new-entrant capture rate. Re-run it with a different capture rate?"
        elif any(k in q for k in ("price", "pricing")):
            reply = f"Pricing call: {fact('marketing mix') or 'see stage 11'}. Want the full six-step reasoning?"
        elif any(k in q for k in ("channel", "budget", "spend")):
            reply = f"{fact('communications plan') or 'Channels are in stage 12'}. Want me to shift budget toward the channel with the best CAC?"
        elif any(k in q for k in ("status", "where are we", "progress", "stand")):
            done = sum(1 for l in lines if "[completed]" in l)
            reply = f"{done}/{len(lines)} stages done. {fact('review') or ''} Ask about any stage, or say 'propose' to queue work."
        elif any(k in q for k in ("risk", "concern", "feasib", "wrong")):
            reply = f"Biggest risk from the review: {fact('review') or 'none flagged'}. Want me to model the lower conversion rate?"
        else:
            reply = (f"Short version: {fact('go-to-market motion') or lines[0]}. "
                     "Ask me about segments, pricing, channels or risks - or say 'propose' and I'll queue work for your approval.")
        for word in reply.split(" "):
            yield {"type": "token", "text": word + " "}
        yield {"type": "final", "text": reply, "tool_calls": tool_calls, "cost_usd": 0.0, "error": None}

    async def close(self) -> None:
        return None


# ---- overrides that make the demo data meaningful ----

def _ov_market_sizing(d, company, name):
    ms = calc.market_sizing(15e9, 0.30, 0.10, 0.03)
    d.update({k: ms[k] for k in ("tam_usd", "geo_pct", "segment_pct", "sam_usd", "capture_rate", "som_usd")})
    d["tam_definition"] = f"Global annual spend on the category {name} competes in, with no competition."
    d["sam_definition"] = "TAM after the geography and product-fit filters."
    d["som_definition"] = "Share of SAM capturable in 12-36 months at a new-entrant capture rate."
    d["assumptions"] = [
        {"name": "geo_pct", "value": "0.30", "basis": f"{company.get('geography') or 'served geographies'} share of global spend"},
        {"name": "segment_pct", "value": "0.10", "basis": "share of buyers whose use case fits the product"},
        {"name": "capture_rate", "value": "0.03", "basis": "course guidance: 2-3% for a new entrant"},
    ]
    d["sources"] = [{"title": "Industry analyst market report", "url": "https://example.com/market-report"},
                    {"title": "Competitor pricing page", "url": "https://example.com/pricing"}]
    return d


def _ov_demand_math(d, company, name):
    revenue = float(company.get("revenue_target") or 1_000_000)
    asv = float((company.get("known_metrics") or {}).get("average_sale_value") or 10_000)
    w = calc.reverse_waterfall(revenue, asv, company.get("known_metrics") or {})
    horizon = int(company.get("time_horizon_months") or 12)
    d.update({"model": "sales", "revenue_goal_usd": revenue, "average_sale_value_usd": asv, "waterfall": w["waterfall"],
              "assumptions": [{"name": a.split(" = ")[0], "value": a.split(" = ")[1].split(" (")[0], "basis": "course default"} for a in w["assumptions"]],
              "monthly_visitors_needed": round(w["waterfall"][0]["count"] / horizon, 1)})
    km = company.get("known_metrics") or {}
    lc = calc.ltv_cac(km.get("ltv"), km.get("cac"))
    d.update({"ltv_usd": lc["ltv_usd"], "cac_usd": lc["cac_usd"], "ltv_cac_ratio": lc["ratio"], "ltv_exceeds_cac": lc["ltv_exceeds_cac"]})
    return d


def _ov_audience(d, company, name):
    d["segments"] = [
        {"name": "Mid-market ops leaders", "demographic": "35-50, director level", "firmographic": "200-2000 staff, uses a CRM", "geographic": company.get("geography") or "North America",
         "behavioural_intent": "visited pricing in last 30 days", "share_pct": 45, "why_it_matters": "fastest buying cycle"},
        {"name": "Startup founders", "demographic": "28-40, founder/CEO", "firmographic": "<50 staff, seed-Series A", "geographic": "global, English-speaking",
         "behavioural_intent": "signed up for a trial", "share_pct": 35, "why_it_matters": "high volume, low ASV"},
        {"name": "Enterprise champions", "demographic": "40-55, VP", "firmographic": "2000+ staff, procurement-led", "geographic": "US and EU",
         "behavioural_intent": "requested a demo", "share_pct": 20, "why_it_matters": "largest ASV, slowest cycle"},
    ]
    d["personas"] = d["personas"][:2]
    d["personas"][0].update({"name": "Dana", "title": "Director of Revenue Operations", "buying_role": "decision_maker"})
    d["personas"][1].update({"name": "Sam", "title": "Sales Development Rep", "buying_role": "end_user"})
    d["messaging_by_role"] = {"end_user": f"{name} gives you the hours back.", "influencer": "Your team adopts it in a week.",
                              "decision_maker": "Pays for itself in one quarter."}
    return d


def _ov_comms_plan(d, company, name):
    budget = float(company.get("monthly_budget") or 10_000)
    plan = [("LinkedIn ads", "awareness + consideration", 40, "CPL"), ("Search", "capture intent", 25, "conversion rate"),
            ("Email nurture", "consideration + action", 20, "CTR"), ("Partner webinars", "credibility", 15, "SQLs")]
    d["channel_plan"] = [{"channel": c, "role": r, "budget_pct": p, "monthly_budget_usd": round(budget * p / 100, 2), "kpi": k} for c, r, p, k in plan]
    d["money"] = f"${budget:,.0f}/month across four channels"
    d["imc_positioning_line"] = f"{name}: the fastest path from pain to outcome."
    return d


def _ov_gtm_plan(d, company, name):
    rows = [("pre_launch", 1, "Finalise positioning and messaging", "Marketing lead", "positioning brief"),
            ("pre_launch", 2, "Build landing page and tracking", "Growth", "messaging"),
            ("pre_launch", 3, "Draft outreach sequences", "SDR lead", "personas"),
            ("pre_launch", 4, "Soft launch to 20 design partners", "Founder", "landing page"),
            ("launch", 5, "Public launch: LinkedIn + search campaigns live", "Growth", "soft-launch feedback"),
            ("launch", 6, "Partner webinar #1", "Partnerships", "launch"),
            ("launch", 8, "First A/B test readout", "Growth", "two weeks of traffic"),
            ("post_launch", 10, "Reallocate budget to top channel", "Marketing lead", "A/B readout"),
            ("post_launch", 13, "90-day review against OKRs", "Founder", "all KPIs")]
    d["timeline"] = [{"phase": p, "week": w, "milestone": m, "owner": o, "depends_on": dep} for p, w, m, o, dep in rows]
    d["scenario"] = company.get("gtm_scenario") or "launch"
    return d


def _ov_review(d, company, name):
    d["lenses"] = [
        {"lens": "resource_alignment", "verdict": "pass", "finding": "Team of this size can run four channels.", "fix": "none"},
        {"lens": "strategic_alignment", "verdict": "pass", "finding": "Motion matches ease of value and ease of start.", "fix": "none"},
        {"lens": "metric_feasibility", "verdict": "concern", "finding": "Visitor-to-lead assumed at 2%; LinkedIn cold traffic often converts at 1%.", "fix": "Model at 1-1.5% and budget for the gap."},
    ]
    d["alternatives_considered"] = ["Big-bang launch across all channels", "Phased PLG pilot with design partners", "Partner-led distribution first"]
    d["recommendations"] = [
        {"title": "Start with a phased PLG pilot", "detail": "20 design partners before the public launch de-risks the metric assumptions.", "priority": "critical", "horizon": "short"},
        {"title": "Cut the visitor-to-lead assumption", "detail": "Re-run the waterfall at 1.5% and raise top-of-funnel budget.", "priority": "high", "horizon": "short"},
        {"title": "Lock the positioning line everywhere", "detail": "IMC: one line across ads, email, site.", "priority": "medium", "horizon": "medium"},
        {"title": "Build a referral loop after week 8", "detail": "Retain and refer stages have no tactic yet.", "priority": "low", "horizon": "long"},
    ]
    tiles = [("awareness", "Thought-leadership posts", "LinkedIn", "high", "content"), ("awareness", "Sponsored posts to ICP", "LinkedIn ads", "critical", "creative"),
             ("consideration", "Comparison landing page", "Website", "high", "content"), ("consideration", "Partner webinar", "Webinar", "medium", "none"),
             ("action", "Outbound to design partners", "Email", "critical", "outreach"), ("action", "Search ads on category terms", "Google", "high", "content"),
             ("retain", "Onboarding email sequence", "Email", "medium", "content"), ("retain", "Quarterly value review", "Customer success", "low", "none"),
             ("refer", "Referral incentive", "In-product", "low", "content"), ("refer", "Case-study programme", "Website", "medium", "research")]
    d["tactics_matrix"] = [{"funnel_stage": f, "tactic": t, "channel": c, "priority": p, "rationale": f"Serves the {f} stage for {name}.", "agent": a, "estimated_cost": "~$200/mo"} for f, t, c, p, a in tiles]
    d["proposed_tasks"] = [
        {"agent": "content", "action": "write_ad_copy", "title": "LinkedIn ad copy, A/B pair", "description": "Two sponsored-post variants in the positioning line's voice, ADPLANE-scored.", "inputs": {"channel": "LinkedIn"}, "estimated_cost": "~$0.20 API", "requires_approval": True, "integration": None},
        {"agent": "content", "action": "write_email_sequence", "title": "Onboarding email sequence", "description": "Three emails for the retain stage.", "inputs": {"emails": 3}, "estimated_cost": "~$0.20 API", "requires_approval": True, "integration": None},
        {"agent": "outreach", "action": "draft_outreach_emails", "title": "Design-partner outreach drafts", "description": "Gmail drafts to 20 design partners; nothing is sent.", "inputs": {"count": 5}, "estimated_cost": "~$0.30 API", "requires_approval": True, "integration": "gmail"},
        {"agent": "creative", "action": "generate_ad_images", "title": "Sponsored-post creatives", "description": "Quote first, render only after approval.", "inputs": {"formats": ["1:1", "9:16"]}, "estimated_cost": "~12 credits", "requires_approval": True, "integration": "higgsfield"},
        {"agent": "research", "action": "competitor_deep_dive", "title": "Competitor pricing deep-dive", "description": "Crawl the top three competitors' pricing and positioning.", "inputs": {"competitors": [c.get("name") for c in (company.get("competitors") or [])][:3]}, "estimated_cost": "~$0.50 API", "requires_approval": True, "integration": "firecrawl"},
    ]
    d["plan_readiness_pct"] = 72
    return d


def _ov_content_pack(d, company, name):
    def piece(kind, channel, variant, headline, body, cta, scores):
        a = dict(zip(("attention", "distinction", "positioning", "linkage", "amplification", "net_equity", "emotion"), scores))
        a["total"] = sum(scores)
        return {"kind": kind, "channel": channel, "variant": variant, "headline": headline, "body": body, "cta": cta, "adplane": a}
    d["pieces"] = [
        piece("ad", "LinkedIn", "A", f"Give your team the week back", f"{name} removes the busywork that eats a day a week. One setup, results by Friday.", "Start free", (5, 4, 6, 5, 4, 5, 4)),
        piece("ad", "LinkedIn", "B", f"A day a week, back", f"Teams using {name} report a day a week saved. See the numbers behind it.", "See the numbers", (6, 5, 6, 5, 4, 5, 5)),
        piece("email", "Email", "A", "Quick question about your week", f"Most teams lose a day a week to busywork. {name} gives it back. Worth 15 minutes?", "Book 15 minutes", (4, 4, 5, 5, 3, 4, 4)),
        piece("email", "Email", "B", "A day a week, back", f"Teams like yours report a day a week saved with {name}. Happy to show you how.", "Reply 'show me'", (5, 4, 5, 5, 3, 4, 5)),
    ]
    d["ab_tests"] = [
        {"hypothesis": "A number in the headline lifts CTR", "variable": "headline", "funnel_stage": "consideration", "metric": "click_through_rate", "control": "A", "variant": "B", "confidence_level": 95, "sample_size_note": "~2,000 impressions per arm at a 1% base CTR"},
        {"hypothesis": "A softer CTA lifts replies", "variable": "cta", "funnel_stage": "decision", "metric": "conversion_rate", "control": "A", "variant": "B", "confidence_level": 90, "sample_size_note": "low stakes; 200 sends per arm"},
    ]
    return d


def _ov_buyer_journey(d, company, name):
    stages = ["awareness", "consideration", "action", "activate", "retain", "refer"]
    base = d["stages"][0]
    d["stages"] = [{**base, "stage": st, "persona": "Dana (decision maker)" if i % 2 == 0 else "Sam (end user)"} for i, st in enumerate(stages)]
    return d


def _ov_target_market(d, company, name):
    names = ["Mid-market revenue teams", "Seed-stage startups", "Enterprise sales orgs"]
    for c, n, sc in zip(d["candidates"], names, (9, 7, 6)):
        c["market"], c["score"], c["problem_size_1_10"] = n, sc, sc
    d["chosen"], d["market_name"] = names[:1], f"The underserved mid-market for {name}"
    d["sub_segments"] = ["RevOps-led teams", "Founder-led sales", "Partner-sourced pipelines"]
    return d


def _ov_influencer_research(d, company, name):
    """Ten plausible creators (6 Instagram, 4 X) with numbers that spread the
    verdicts; every score comes from calculators so the rule is consistent."""
    import random
    rng = random.Random(name)
    industry = company.get("industry") or "B2B SaaS"
    product = company.get("product_description") or company.get("description") or f"{name}"
    seeds = [  # (platform, handle, name, followers, following, avg_likes, avg_comments, fit, hook)
        ("instagram", "@ops.playbook", "Mara Lindqvist", 31_200, 880, 740, 41, 84, "your carousel on the 'CRM hygiene hour' nobody has"),
        ("instagram", "@revops.daily", "Theo Adeyemi", 48_500, 1_210, 1_060, 63, 78, "your reel ranking the five fields reps never fill in"),
        ("instagram", "@founderled.sales", "Priya Nair", 12_700, 640, 410, 29, 81, "your post on doing 40 demos a month as a founder"),
        ("instagram", "@growthgrind.io", "Lucas Ferreira", 35_400, 33_900, 26, 1, 62, "your 'pipeline on autopilot' post"),
        ("instagram", "@saas.scalers", "Hanna Berg", 92_000, 4_300, 790, 12, 70, "your thread-style post on PLG onboarding"),
        ("instagram", "@sdr.unfiltered", "Diego Molina", 21_800, 2_100, 220, 2, 73, "your story series on cold-call openers"),
        ("x", "@pipelinepete", "Pete Chandra", 27_600, 1_900, 310, 22, 80, "your post that CRM notes die in Slack threads"),
        ("x", "@revopsrachel", "Rachel Okafor", 64_300, 2_400, 520, 34, 76, "your take on HubSpot vs Salesforce for 20-rep teams"),
        ("x", "@b2bhustle", "Jordan Blake", 118_000, 112_000, 95, 3, 55, "your '10x your outbound' thread"),
        ("x", "@closecalls", "Noor Haddad", 8_900, 700, 160, 14, 69, "your post on follow-up timing after a demo"),
    ]
    rule = {
        "summary": (f"Judge reach by interactions, not followers. Around 35k followers with 20-30 likes a post is bought reach (~0.07%); "
                    f"30k followers with 500-1,000 interactions (1.7-3.3%) is a real audience. Good micro-tier engagement starts near 2% on Instagram "
                    f"and 1% on X; below 0.5% / 0.25% the followers look bought."),
        "thresholds": calc.thresholds("instagram") + calc.thresholds("x"),
        "red_flags": ["likes without comments", "follows almost as many accounts as follow it", "sudden follower jumps with flat likes",
                      "generic one-word comments", "engagement far below the tier floor"],
        "sources": [{"title": "Influencer engagement benchmarks by follower tier (demo source)", "url": "https://example.com/engagement-benchmarks"},
                    {"title": "How to spot fake followers (demo source)", "url": "https://example.com/fake-followers"}],
    }
    cands = []
    for platform, handle, person, followers, following, likes, comments, fit, hook in seeds:
        likes = likes * (1 + rng.uniform(-0.08, 0.08)); comments = max(1, comments * (1 + rng.uniform(-0.1, 0.1)))
        score, verdict, reasons = calc.authenticity_score(platform, followers, following, likes, comments)
        er = calc.engagement_rate(followers, likes, comments)
        base = "https://www.instagram.com/" if platform == "instagram" else "https://x.com/"
        msg = (f"Hey {person.split()[0]} - {hook} nailed something our users say every week. "
               f"{name} does the boring half of that job ({product[:70].rstrip('.')}), so the audience you have is exactly who it is for. "
               f"If a short walkthrough is interesting, I can send one, no strings.")
        cands.append({
            "rank": 0, "platform": platform, "handle": handle, "name": person, "url": base + handle.lstrip("@"),
            "followers": followers, "following": following, "posts_sampled": 5, "avg_likes": round(likes, 1), "avg_comments": round(comments, 1),
            "engagement_rate": round(er, 5), "follower_following_ratio": round(followers / following, 2), "comment_like_ratio": round(comments / likes, 4),
            "authenticity_score": score, "verdict": verdict, "reasons": reasons[:3],
            "niche_tags": [industry.split("/")[0].strip(), "sales ops", "founder-led growth"][:3], "audience_fit": fit,
            "why_fit": f"Posts to the people who buy {name}: operators who run pipeline and CRM for small teams.",
            "recent_post_hook": hook, "outreach_message": msg, "outreach_subject": f"Re: {hook[:48]}",
            "sources": [{"title": f"{handle} on {platform}", "url": base + handle.lstrip("@")}],
            "data_quality": "estimated" if platform == "x" else "measured",
            "audit": _fake_audit(platform, handle, followers, following, likes, comments, verdict, rng),
        })
    cands.sort(key=lambda c: (c["authenticity_score"] * c["audience_fit"], c["followers"]), reverse=True)
    for i, c in enumerate(cands, 1):
        c["rank"] = i
    d.update({
        "product_summary": f"{name}: {product[:160]}",
        "platforms": ["instagram", "x"], "niche": industry, "rule": rule, "candidates": cands,
        "method_note": "Demo data: follower and interaction counts are illustrative; scores come from the calculators. Real runs read public profiles and label estimated counts.",
    })
    return d


_FAKE_BRANDS = ["HubSpot", "Gong", "Apollo", "Notion", "Lavender", "Clay", "Loom", "Calendly"]
_FAKE_COMMENTS_REAL = ["This is exactly the field-hygiene problem our RevOps lead keeps raising.", "Saving this for our Monday pipeline review.",
                       "We tried the Friday CRM hour - lasted two weeks. Curious how you keep it going.", "The 'next step' field is the one everyone skips. Agreed."]
_FAKE_COMMENTS_FAKE = ["🔥🔥🔥", "Nice!", "wow", "💯", "cool post"]


def _fake_audit(platform, handle, followers, following, likes, comments, verdict, rng):
    """Consistent audit numbers from the calculators, with the qualitative fields
    (growth, comments, spread, audience) shaped by the verdict."""
    if verdict == "likely_fake":
        growth, auth, spread = "spikes", round(rng.uniform(0.15, 0.25), 2), "even"
        samples = rng.sample(_FAKE_COMMENTS_FAKE, 2)
        note = "Two jumps of 6-9k followers inside a week with flat likes - typical of bought followers."
        growth_rate, sponsored = round(rng.uniform(0.9, 2.4), 2), round(rng.uniform(0.3, 0.5), 2)
    elif verdict == "suspicious":
        growth, auth, spread = "follow_unfollow" if following > 1_500 else "unknown", round(rng.uniform(0.45, 0.6), 2), "unknown"
        samples = [rng.choice(_FAKE_COMMENTS_REAL), rng.choice(_FAKE_COMMENTS_FAKE)]
        note = "Followings rise and fall in steps of a few hundred - follow/unfollow growth." if following > 1_500 else "No public growth history found."
        growth_rate, sponsored = round(rng.uniform(0.1, 0.4), 2), round(rng.uniform(0.15, 0.3), 2)
    else:
        growth, auth, spread = "organic", round(rng.uniform(0.75, 0.9), 2), "organic"
        samples = rng.sample(_FAKE_COMMENTS_REAL, 2)
        note = "Steady month-on-month growth with likes rising in step."
        growth_rate, sponsored = round(rng.uniform(0.12, 0.35), 2), round(rng.uniform(0.05, 0.18), 2)
    a = calc.creator_audit(platform, followers, following, likes, comments, auth, growth)
    brands = rng.sample(_FAKE_BRANDS, 2 if verdict == "real" else 3)
    countries = ["US", "UK", "CA"] if platform == "instagram" else ["US", "UK", "IN"]
    interests = ["B2B sales", "SaaS", "startups", "productivity"]
    signals = [f"engagement {a['authentic_engagement'] * 100:.2f}% authentic vs tier band ({a['er_vs_similar']} similar accounts)",
               f"{int(round(auth * 10))} of 10 sampled comments read as real ({'pod-like / emoji-only' if auth < 0.4 else 'specific to the post'})",
               note]
    if following > 1_500:
        signals.append(f"follows {following:,} accounts - mass-follower behaviour")
    return {
        "aqs": a["aqs"], "aqs_band": a["aqs_band"], "audience_types": a["audience_types"], "quality_audience": a["quality_audience"],
        "audience_reachability": a["audience_reachability"], "authentic_engagement": a["authentic_engagement"], "er_vs_similar": a["er_vs_similar"],
        "likes_comment_ratio": a["likes_comment_ratio"], "likes_spread": spread, "comments_authenticity": auth, "comments_samples": samples,
        "followers_growth": growth, "growth_note": note, "yearly_growth_rate": growth_rate,
        "posts_per_week": round(rng.uniform(2, 6), 1), "sponsored_share": sponsored, "brand_mentions": brands,
        "estimated_reach": a["estimated_reach"], "estimated_price_usd": a["estimated_price_usd"], "cpe_usd": a["cpe_usd"],
        "audience": {"top_countries": countries, "age_gender": "25-44, mostly male" if rng.random() < 0.6 else "25-44, balanced",
                     "languages": ["en"], "interests": interests[:3]},
        "signals": signals,
    }


_OVERRIDES: dict[str, Callable[[dict, dict, str], dict]] = {
    "BuyerJourney": _ov_buyer_journey,
    "TargetMarket": _ov_target_market,
    "MarketSizing": _ov_market_sizing,
    "DemandMath": _ov_demand_math,
    "Audience": _ov_audience,
    "CommsPlan": _ov_comms_plan,
    "GtmPlan": _ov_gtm_plan,
    "Review": _ov_review,
    "ContentPack": _ov_content_pack,
    "InfluencerResearch": _ov_influencer_research,
}

_runner: AgentRunner | None = None


def get_runner() -> AgentRunner:
    global _runner
    if _runner is None:
        _runner = FakeRunner() if settings.growthpilot_fake_agents else SdkRunner()
    return _runner


def reset_runner() -> None:
    global _runner
    _runner = None
