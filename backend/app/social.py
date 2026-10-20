"""Live public-profile readers for the influencer research agent.

X: api.fxtwitter.com (public, no login) gives the profile and ~20 recent posts
with likes / replies / reposts / views. Instagram: the profile page's link
preview (served to link-preview crawlers) carries "N Followers, N Following,
N Posts" and the bio. Per-post Instagram likes are not available this way.
"""
from __future__ import annotations

import asyncio
import html
import re

import httpx

API_UA = "GrowthPilot/1.0 (+https://github.com/DavitGadyan)"  # api.fxtwitter.com sits behind Cloudflare, which challenges the default python-httpx UA
PREVIEW_UA = "facebookexternalhit/1.1 (+http://www.facebook.com/externalhit_uatext.php)"
_HANDLE = re.compile(r"^[A-Za-z0-9._]{1,40}$")


def _num(s: str) -> int:
    s = s.replace(",", "").strip().upper()
    mult = 1_000_000 if s.endswith("M") else 1_000 if s.endswith("K") else 1
    try:
        return int(float(s.rstrip("MK")) * mult)
    except ValueError:
        return 0


async def _get_json(client: httpx.AsyncClient, url: str, tries: int = 3) -> dict:
    for i in range(tries):
        try:
            r = await client.get(url)
            if r.status_code == 200:
                d = r.json()
                if d.get("user") or d.get("results"):
                    return d
        except (httpx.HTTPError, ValueError):
            pass
        await asyncio.sleep(1.5 * (i + 1))
    return {}


async def x_profile(handle: str, posts: int = 12) -> dict:
    handle = handle.lstrip("@").strip()
    if not _HANDLE.match(handle):
        return {"error": "invalid handle"}
    async with httpx.AsyncClient(timeout=15, headers={"User-Agent": API_UA}) as client:
        prof = await _get_json(client, f"https://api.fxtwitter.com/{handle}")
        u = prof.get("user") or {}
        if not u:
            return {"handle": handle, "found": False}
        tl = await _get_json(client, f"https://api.fxtwitter.com/2/profile/{handle}/statuses")
    own = [t for t in (tl.get("results") or [])
           if (t.get("author") or {}).get("screen_name", "").lower() == handle.lower() and not t.get("reposted_by") and not t.get("replying_to")][:posts]
    def avg(k: str) -> float:
        return round(sum(t.get(k) or 0 for t in own) / len(own), 1) if own else 0.0
    return {
        "handle": u.get("screen_name") or handle, "found": True, "platform": "x", "name": u.get("name"),
        "bio": (u.get("description") or "")[:300], "url": f"https://x.com/{handle}",
        "followers": u.get("followers") or 0, "following": u.get("following") or 0, "posts_total": u.get("tweets") or 0,
        "posts_sampled": len(own), "avg_likes": avg("likes"), "avg_comments": avg("replies"),
        "avg_reposts": avg("reposts"), "avg_views": avg("views"),
        "recent_posts": [{"url": t.get("url"), "date": (t.get("created_at") or "")[:16], "text": (t.get("text") or "")[:160],
                          "likes": t.get("likes"), "replies": t.get("replies"), "reposts": t.get("reposts")} for t in own[:5]],
        "data_quality": "measured" if own else "estimated", "source": "api.fxtwitter.com (public X data)",
    }


async def instagram_profile(handle: str) -> dict:
    handle = handle.lstrip("@").strip()
    if not _HANDLE.match(handle):
        return {"error": "invalid handle"}
    try:
        async with httpx.AsyncClient(timeout=15, follow_redirects=True) as client:
            r = await client.get(f"https://www.instagram.com/{handle}/", headers={"User-Agent": PREVIEW_UA})
    except httpx.HTTPError:
        return {"handle": handle, "found": False}
    m = re.search(r'property="og:description"\s+content="([^"]+)"', r.text) or re.search(r'content="([^"]+)"\s+property="og:description"', r.text)
    if r.status_code != 200 or not m:
        return {"handle": handle, "found": False}
    desc = html.unescape(m.group(1))
    f = re.search(r"([\d.,]+[KM]?)\s+Followers", desc, re.I)
    g = re.search(r"([\d.,]+[KM]?)\s+Following", desc, re.I)
    p = re.search(r"([\d.,]+[KM]?)\s+Posts", desc, re.I)
    t = re.search(r'property="og:title"\s+content="([^"]+)"', r.text)
    bio = desc.split(" - ", 1)[1] if " - " in desc else ""
    return {
        "handle": handle, "found": True, "platform": "instagram", "url": f"https://www.instagram.com/{handle}/",
        "name": html.unescape(t.group(1)).split(" (@")[0] if t else None,
        "followers": _num(f.group(1)) if f else None, "following": _num(g.group(1)) if g else None,
        "posts_total": _num(p.group(1)) if p else None, "bio": bio[:300],
        "note": "follower/following counts are live; per-post likes/comments are not exposed - take them from post pages or creator directories and mark data_quality estimated",
        "source": "instagram.com link preview",
    }
