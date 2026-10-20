"""Test env: fake agents, a temp SQLite file, no integrations. Set before any
app import because settings are read at import time."""
import os
import tempfile

_tmp = tempfile.mkdtemp(prefix="growthpilot-test-")
os.environ["GROWTHPILOT_FAKE_AGENTS"] = "1"
os.environ["DATABASE_URL"] = f"sqlite:///{_tmp}/test.db"
for var in ("FIRECRAWL_API_KEY", "GMAIL_MCP_COMMAND", "GOOGLE_OAUTH_CLIENT_ID", "GOOGLE_OAUTH_CLIENT_SECRET",
            "GOOGLE_OAUTH_REFRESH_TOKEN", "HIGGSFIELD_MCP_URL", "HIGGSFIELD_MCP_TOKEN"):
    os.environ.pop(var, None)
os.environ["_GP_NO_DOTENV"] = "1"

import pytest  # noqa: E402

from app import db  # noqa: E402


@pytest.fixture(scope="session", autouse=True)
def _init_db():
    db.init_db()
    yield


@pytest.fixture
def sample_profile() -> dict:
    return {
        "name": "Loopwise", "website": "https://loopwise.example", "description": "Meeting-notes automation for sales teams",
        "stage": "startup", "business_type": "B2B", "product_name": "Loopwise", "product_description": "Records calls, writes CRM notes",
        "product_type": "software", "problem_solved": "Reps lose a day a week to CRM admin", "evidence_of_pain": "12 interviews",
        "differentiators": "CRM-native, no new tab", "industry": "Sales software", "geography": "North America",
        "known_segments": "mid-market RevOps", "best_customers": "200-2000 staff SaaS", "competitors": [{"name": "Gong"}, {"name": "Fireflies"}],
        "next_best_alternative": "manual notes", "current_price": "$40/seat", "cogs": "$6/seat", "pricing_objective": "penetration",
        "ease_of_seeing_value": "easy", "ease_of_getting_started": "easy", "has_sales_team": False, "current_channels": ["LinkedIn"],
        "revenue_target": 1000000, "time_horizon_months": 12, "gtm_scenario": "launch", "monthly_budget": 12000, "team_size": 4,
        "tech_stack": ["HubSpot"], "known_metrics": {"average_sale_value": 12000, "ltv": 36000, "cac": 9000}, "notes": "",
    }
