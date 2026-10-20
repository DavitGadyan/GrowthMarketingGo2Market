"""Prompt loader. Prompts are markdown files next to this module; placeholders
are `{company}`, `{prior}`, `{task}` and `{methodology}` replaced verbatim with
str.replace so JSON braces inside the prompt text never raise KeyError."""
from __future__ import annotations

from functools import lru_cache
from pathlib import Path

_DIR = Path(__file__).parent
_KNOWLEDGE = _DIR.parent.parent / "knowledge" / "methodology.md"


@lru_cache(maxsize=None)
def load_prompt(name: str) -> str:
    path = _DIR / f"{name}.md"
    if not path.exists():
        raise FileNotFoundError(f"prompt '{name}' not found at {path}")
    return path.read_text(encoding="utf-8")


@lru_cache(maxsize=1)
def methodology() -> str:
    return _KNOWLEDGE.read_text(encoding="utf-8") if _KNOWLEDGE.exists() else ""


def stage_card(number: int) -> str:
    """The '## Stage N - ...' section of methodology.md, or '' if absent."""
    text = methodology()
    marker = f"## Stage {number} - "
    start = text.find(marker)
    if start < 0:
        return ""
    end = text.find("\n## ", start + len(marker))
    return text[start: end if end > 0 else None].strip()


def render(name: str, **ctx: str) -> str:
    text = load_prompt(name)
    for key, value in ctx.items():
        text = text.replace("{" + key + "}", value if isinstance(value, str) else str(value))
    return text


def methodology_section(heading: str) -> str:
    """A '## ...' section of methodology.md by its exact heading, read fresh
    (the file may be appended to while the server runs), or '' if absent."""
    text = _KNOWLEDGE.read_text(encoding="utf-8") if _KNOWLEDGE.exists() else ""
    start = text.find(heading)
    if start < 0:
        return ""
    end = text.find("\n## ", start + len(heading))
    return text[start: end if end > 0 else None].strip()
