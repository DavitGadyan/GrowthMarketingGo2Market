"""Which external services are reachable. Secrets stay in env; the
Integration table only keeps non-secret config such as a sender name."""
from __future__ import annotations

import shutil
from typing import Any

from sqlmodel import select

from .db import session_scope
from .models import Integration
from .schemas import IntegrationOut
from .settings import settings

NAMES = ["anthropic", "firecrawl", "gmail", "higgsfield"]


def _config(name: str) -> dict[str, Any]:
    with session_scope() as s:
        row = s.exec(select(Integration).where(Integration.name == name)).first()
        return dict(row.config) if row else {}


def anthropic_connected() -> tuple[bool, str]:
    if settings.anthropic_api_key:
        return True, "ANTHROPIC_API_KEY is set"
    if shutil.which("claude"):
        return True, "Claude Code CLI found on PATH (uses its login)"
    return False, "Set ANTHROPIC_API_KEY or run `claude login`"


def firecrawl_connected() -> tuple[bool, str]:
    if settings.firecrawl_api_key:
        return True, "FIRECRAWL_API_KEY is set; research agents use the Firecrawl MCP"
    return False, "Set FIRECRAWL_API_KEY to add deep crawling to research"


def gmail_connected() -> tuple[bool, str]:
    if settings.gmail_mcp_command:
        return True, "GMAIL_MCP_COMMAND is set; outreach agent creates drafts only"
    if settings.google_oauth_client_id and settings.google_oauth_client_secret and settings.google_oauth_refresh_token:
        return True, "Google OAuth credentials set; outreach agent creates drafts only"
    return False, "Set GMAIL_MCP_COMMAND (a stdio Gmail MCP server) or the GOOGLE_OAUTH_* triple"


def higgsfield_connected() -> tuple[bool, str]:
    if settings.higgsfield_mcp_url and settings.higgsfield_mcp_token:
        return True, "Higgsfield MCP endpoint configured; renders wait for approval"
    return False, "Set HIGGSFIELD_MCP_URL and HIGGSFIELD_MCP_TOKEN"


_CHECKS = {
    "anthropic": anthropic_connected,
    "firecrawl": firecrawl_connected,
    "gmail": gmail_connected,
    "higgsfield": higgsfield_connected,
}


def is_connected(name: str) -> bool:
    check = _CHECKS.get(name)
    return bool(check and check()[0])


def status() -> list[IntegrationOut]:
    out = []
    for name in NAMES:
        connected, detail = _CHECKS[name]()
        out.append(IntegrationOut(name=name, connected=connected, detail=detail, config=_config(name)))
    return out


def set_config(name: str, config: dict[str, Any]) -> IntegrationOut:
    if name not in NAMES:
        raise KeyError(name)
    with session_scope() as s:
        row = s.exec(select(Integration).where(Integration.name == name)).first()
        if row is None:
            row = Integration(name=name, config=config)
        else:
            row.config = config
        s.add(row)
        s.commit()
    connected, detail = _CHECKS[name]()
    return IntegrationOut(name=name, connected=connected, detail=detail, config=config)
