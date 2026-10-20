"""Environment-driven settings. Copy .env.example to .env."""
from __future__ import annotations

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", env_prefix="", extra="ignore")

    database_url: str = "sqlite:///./growthpilot.db"
    cors_origins: str = "http://localhost:3000"

    # Agents
    anthropic_api_key: str = ""
    growthpilot_fake_agents: bool = False  # deterministic runner for tests / no-key demos
    strategy_model: str = "claude-opus-5-5"
    content_model: str = "claude-sonnet-5-5"
    max_budget_usd_per_stage: float = 2.0
    max_budget_usd_per_task: float = 2.0

    # Integrations (all optional; the Integrations page reports what is set)
    firecrawl_api_key: str = ""
    higgsfield_api_key: str = ""
    higgsfield_api_secret: str = ""
    higgsfield_mcp_url: str = ""  # remote MCP endpoint for Higgsfield (http)
    higgsfield_mcp_token: str = ""  # bearer token for that endpoint
    google_oauth_client_id: str = ""
    google_oauth_client_secret: str = ""
    google_oauth_refresh_token: str = ""
    gmail_mcp_command: str = ""  # optional stdio MCP server for Gmail, e.g. "npx -y @gongrzhe/server-gmail-autoauth-mcp"


settings = Settings()
