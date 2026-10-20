"""Creator profile pictures for the Influencers screen.

Instagram blocks third-party avatar proxies, but serves the profile picture in
the page's `og:image` to link-preview crawlers. We fetch it once per handle,
cache the bytes on disk, and serve them from our own origin. X avatars come
from the api.fxtwitter.com profile (400px) (same caching). Misses are cached briefly so a bad handle
does not re-hit the network on every page view.
"""
from __future__ import annotations

import hashlib
import html
import re
import time
from pathlib import Path

import httpx

CACHE_DIR = Path(__file__).resolve().parent.parent / "avatar_cache"
MISS_TTL = 6 * 3600
PREVIEW_UA = "facebookexternalhit/1.1 (+http://www.facebook.com/externalhit_uatext.php)"
API_UA = "GrowthPilot/1.0 (+https://github.com/DavitGadyan)"
BROWSER_UA = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/129.0 Safari/537.36"
_HANDLE = re.compile(r"^[A-Za-z0-9._]{1,40}$")
_OG = re.compile(r'property="og:image"\s+content="([^"]+)"|content="([^"]+)"\s+property="og:image"')


def _key(platform: str, handle: str) -> Path:
    h = hashlib.sha1(f"{platform}:{handle.lower()}".encode()).hexdigest()[:16]
    return CACHE_DIR / f"{platform}-{h}"


async def _instagram_url(client: httpx.AsyncClient, handle: str) -> str | None:
    r = await client.get(f"https://www.instagram.com/{handle}/", headers={"User-Agent": PREVIEW_UA})
    if r.status_code != 200:
        return None
    m = _OG.search(r.text)
    return html.unescape(m.group(1) or m.group(2)) if m else None


async def get_avatar(platform: str, handle: str) -> tuple[bytes, str] | None:
    platform = "instagram" if platform.lower() in ("instagram", "ig") else "x"
    handle = handle.lstrip("@").strip()
    if not _HANDLE.match(handle):
        return None
    CACHE_DIR.mkdir(exist_ok=True)
    base = _key(platform, handle)
    img, ctype, miss = base.with_suffix(".img"), base.with_suffix(".type"), base.with_suffix(".miss")
    if img.exists() and ctype.exists():
        return img.read_bytes(), ctype.read_text()
    if miss.exists() and time.time() - miss.stat().st_mtime < MISS_TTL:
        return None
    try:
        async with httpx.AsyncClient(timeout=12, follow_redirects=True) as client:
            if platform == "instagram":
                url = await _instagram_url(client, handle)
            else:
                url = None
                r0 = await client.get(f"https://api.fxtwitter.com/{handle}", headers={"User-Agent": API_UA})
                if r0.status_code == 200:
                    u = (r0.json().get("user") or {}).get("avatar_url") or ""
                    if u and "default_profile" not in u:
                        url = u.replace("_normal.", "_400x400.")
            if url:
                r = await client.get(url, headers={"User-Agent": BROWSER_UA})
                ct = r.headers.get("content-type", "")
                if r.status_code == 200 and ct.startswith("image/") and len(r.content) > 200:
                    img.write_bytes(r.content)
                    ctype.write_text(ct.split(";")[0])
                    return r.content, ct.split(";")[0]
    except httpx.HTTPError:
        pass
    miss.touch()
    return None
