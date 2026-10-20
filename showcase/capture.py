"""Record the GrowthPilot showcase: retina screenshots + interaction videos.

Usage (app on :3000, API on :8000):
    python3 showcase/capture.py            # everything
    python3 showcase/capture.py growth ideas   # selected scenes

Outputs land next to this file: shots/*.png (2880x1800) and videos/*.mp4 (1440x900, H.264).
A visible cursor is injected so mouse movement reads in the recordings.
"""
from __future__ import annotations

import shutil
import subprocess
import sys
import time
from pathlib import Path

from playwright.sync_api import Page, sync_playwright

BASE = "http://localhost:3000"
OUT = Path(__file__).resolve().parent
SHOTS, VIDS, RAW = OUT / "shots", OUT / "videos", OUT / ".raw"
W, H = 1440, 900

CURSOR_JS = """
(() => {
  if (window.__gpCursor) return; window.__gpCursor = true;
  const c = document.createElement('div'); c.id = 'gp-cursor';
  c.style.cssText = 'position:fixed;left:0;top:0;width:22px;height:22px;margin:-11px 0 0 -11px;border-radius:50%;' +
    'background:rgba(17,17,20,.18);border:2px solid rgba(17,17,20,.75);pointer-events:none;z-index:2147483647;' +
    'transition:transform .12s ease, background .12s ease;';
  const add = () => document.body && document.body.appendChild(c);
  document.readyState === 'loading' ? document.addEventListener('DOMContentLoaded', add) : add();
  addEventListener('mousemove', e => { c.style.left = e.clientX + 'px'; c.style.top = e.clientY + 'px'; }, true);
  addEventListener('mousedown', () => { c.style.transform = 'scale(.7)'; c.style.background = 'rgba(16,185,129,.45)'; }, true);
  addEventListener('mouseup', () => { c.style.transform = ''; c.style.background = 'rgba(17,17,20,.18)'; }, true);
})();
"""


# ---------------------------------------------------------------- helpers
_pos = {"x": W / 2, "y": H / 2}


def glide(page: Page, x: float, y: float, ms: int = 600) -> None:
    steps = max(8, ms // 16)
    page.mouse.move(x, y, steps=steps)
    _pos.update(x=x, y=y)


def glide_to(page: Page, locator, ms: int = 650, dx: float = 0.5, dy: float = 0.5) -> bool:
    try:
        locator.scroll_into_view_if_needed(timeout=3000)
        b = locator.bounding_box(timeout=3000)
    except Exception:  # noqa: BLE001
        return False
    if not b:
        return False
    glide(page, b["x"] + b["width"] * dx, b["y"] + b["height"] * dy, ms)
    return True


def click(page: Page, locator, pause: float = 0.6) -> bool:
    if not glide_to(page, locator):
        return False
    page.mouse.down(); time.sleep(0.08); page.mouse.up()
    time.sleep(pause)
    return True


def settle(page: Page, s: float = 2.5) -> None:
    try:
        page.wait_for_load_state("networkidle", timeout=8000)
    except Exception:  # noqa: BLE001
        pass
    time.sleep(s)


def shot(page: Page, name: str, full: bool = False) -> None:
    page.evaluate("(() => { const c = document.getElementById('gp-cursor'); if (c) c.style.visibility = 'hidden'; })()")
    page.screenshot(path=str(SHOTS / f"{name}.png"), full_page=full)
    page.evaluate("(() => { const c = document.getElementById('gp-cursor'); if (c) c.style.visibility = 'visible'; })()")
    print("  shot", name)


def first(page: Page, *selectors: str):
    for sel in selectors:
        loc = page.locator(sel)
        try:
            if loc.count() > 0 and loc.first.is_visible():
                return loc.first
        except Exception:  # noqa: BLE001
            continue
    return None


# ---------------------------------------------------------------- scenes
def scene_landing(page: Page) -> None:
    page.goto(f"{BASE}/"); time.sleep(3.2)              # connectors draw, tiles rise
    shot(page, "01-landing")
    for label in ("Growth", "Timeline", "Ideas", "Results"):
        t = first(page, f"a:has-text('{label}') >> nth=0")
        if t: glide_to(page, t, 700); time.sleep(0.7)
    chips = page.locator("li svg, [class*='gx-chip']")
    for i in range(min(chips.count(), 7)):
        glide_to(page, chips.nth(i), 250); time.sleep(0.25)
    time.sleep(1)


def scene_setup(page: Page) -> None:
    page.goto(f"{BASE}/setup?company=2"); settle(page, 2)
    shot(page, "02-setup-wizard")
    nxt = first(page, "button:has-text('Next')")
    if nxt: click(page, nxt, 1.2)
    nxt = first(page, "button:has-text('Next')")
    if nxt: click(page, nxt, 1.2)
    time.sleep(1)


def scene_growth(page: Page) -> None:
    page.goto(f"{BASE}/growth"); settle(page, 3)
    surf = first(page, ".recharts-surface")
    if surf:
        b = surf.bounding_box()
        for f in (0.15, 0.35, 0.55, 0.75, 0.92):
            glide(page, b["x"] + b["width"] * f, b["y"] + b["height"] * 0.55, 500); time.sleep(0.45)
        shot(page, "03-growth-chart-hover")
    rows = page.locator("tbody tr")
    for i in range(min(rows.count(), 3)):
        glide_to(page, rows.nth(i), 450); time.sleep(0.5)
    ef = first(page, "button:has-text('Edit funnel')", "text=Edit funnel")
    if ef:
        click(page, ef, 1.4)
        inp = first(page, "[role='dialog'] input", ".modal-panel input")
        if inp:
            click(page, inp, 0.3)
            page.keyboard.press("Meta+A"); page.keyboard.type("1200000", delay=70); time.sleep(1.2)
            cmp_ = first(page, "button:has-text('Compare')")
            if cmp_: click(page, cmp_, 1.4)
        shot(page, "04-growth-strategy-funnel")
        page.keyboard.press("Escape"); time.sleep(0.8)


def scene_timeline(page: Page) -> None:
    page.goto(f"{BASE}/timeline"); settle(page, 3)
    shot(page, "05-timeline-gantt")
    bars = page.locator(".gx-bar")
    for i in range(min(bars.count(), 4)):
        glide_to(page, bars.nth(i), 550); time.sleep(0.8)
    if bars.count():
        glide_to(page, bars.nth(1), 400); time.sleep(0.6)
        shot(page, "06-timeline-bar-tooltip")
    ring = first(page, "button:has-text('W6')", "[aria-label*='Week 6']")
    if ring: click(page, ring, 1.5)
    ring = first(page, "button:has-text('W6')", "[aria-label*='Week 6']")
    if ring: click(page, ring, 1.2)


def scene_results(page: Page) -> None:
    page.goto(f"{BASE}/results"); settle(page, 3.5)
    segs = page.locator("path[role='button']")
    n = segs.count()
    for i in range(min(n, 3)):
        seg = segs.nth(i)
        glide_to(page, seg, 550)
        seg.hover(force=True); seg.focus(); time.sleep(1.1)       # tooltip opens on hover / focus
    if n >= 3:
        segs.nth(2).hover(force=True); segs.nth(2).focus(); time.sleep(0.8)
        shot(page, "07-results-gauge-tooltip")
        page.keyboard.press("Enter"); time.sleep(1.4)               # opens the lens panel
        panel = first(page, "text=Recommendations", "text=RECOMMENDATIONS")
        if panel:
            glide_to(page, panel, 600); time.sleep(0.6)
        shot(page, "08-results-lens-panel")
    time.sleep(0.8)


def scene_ideas(page: Page) -> None:
    page.goto(f"{BASE}/ideas"); settle(page, 3)
    bubbles = page.locator(".bubble")
    n = bubbles.count()
    for i in range(min(n, 5)):
        glide_to(page, bubbles.nth(i), 450); time.sleep(0.55)
    shot(page, "09-ideas-bubble-hover")
    for i in (0, 2, 4):
        if i < n: click(page, bubbles.nth(i), 0.5)
    time.sleep(0.8)
    calc = first(page, "button:has-text('Calculate spend')", "[aria-label*='Calculate spend']")
    if calc: click(page, calc, 1.2)
    shot(page, "10-ideas-bulk-actions")
    clear = first(page, "[aria-label='Close']", "[aria-label='Clear selection']")
    if clear: click(page, clear, 0.6)


def scene_influencers(page: Page) -> None:
    page.goto(f"{BASE}/influencers"); settle(page, 4)
    shot(page, "11-influencers-ranked")
    rows = page.locator(".inf-row")
    for i in range(min(rows.count(), 4)):
        glide_to(page, rows.nth(i), 400); time.sleep(0.35)
    if rows.count():
        click(page, rows.first, 1.6)
        shot(page, "12-influencers-audit")
        panel = first(page, "aside", "[class*='rail']")
        if panel:
            glide_to(page, panel, 400)
            for _ in range(6):
                page.mouse.wheel(0, 260); time.sleep(0.45)
            shot(page, "13-influencers-message")
            for _ in range(6):
                page.mouse.wheel(0, -260); time.sleep(0.2)
    xtab = first(page, "nav a:has-text('X')", "a:text-is('X')")
    if xtab: click(page, xtab, 1.5)
    allt = first(page, "nav a:has-text('All')")
    if allt: click(page, allt, 1.0)


def scene_templates(page: Page) -> None:
    page.goto(f"{BASE}/templates"); settle(page, 3)
    shot(page, "14-templates")
    cards = page.locator(".ix-card, a:has(h3)")
    for i in range(min(cards.count(), 6)):
        glide_to(page, cards.nth(i), 450); time.sleep(0.7)
    time.sleep(0.5)


def scene_chat(page: Page) -> None:
    page.goto(f"{BASE}/chat"); settle(page, 3)
    q = first(page, "text=Which segment should we lead with")
    if q is None:                                           # no exchange yet: ask once (real agent reply)
        box = first(page, "textarea", "input[aria-label='Message']")
        if box:
            click(page, box, 0.3)
            page.keyboard.type("Which segment should we lead with, and why?", delay=45)
            time.sleep(0.4); page.keyboard.press("Enter")
            for _ in range(40):
                time.sleep(1)
                if page.locator(".typing-dots").count() == 0 and first(page, "text=Lead with") is not None:
                    break
        q = first(page, "text=Which segment should we lead with")
    if q:
        q.scroll_into_view_if_needed(); page.evaluate("window.scrollBy(0, -40)")
        glide_to(page, q, 700); time.sleep(0.8)
        ans = first(page, "text=Lead with")
        if ans: glide_to(page, ans, 900); time.sleep(1.2)
    shot(page, "15-agents-chat")
    chips = page.locator(".chip-row button")
    for i in range(min(chips.count(), 4)):
        glide_to(page, chips.nth(i), 350); time.sleep(0.35)


def scene_mobile(pw) -> None:
    b = pw.chromium.launch()
    ctx = b.new_context(viewport={"width": 390, "height": 844}, device_scale_factor=3, is_mobile=True, has_touch=True)
    p = ctx.new_page()
    for name, path in (("16-mobile-influencers", "/influencers"), ("17-mobile-growth", "/growth")):
        p.goto(BASE + path); settle(p, 3); shot(p, name)
    ctx.close(); b.close()


SCENES = {
    "landing": scene_landing, "setup": scene_setup, "growth": scene_growth, "timeline": scene_timeline,
    "results": scene_results, "ideas": scene_ideas, "influencers": scene_influencers,
    "templates": scene_templates, "chat": scene_chat,
}


def to_mp4(src: Path, dst: Path) -> None:
    subprocess.run(["ffmpeg", "-y", "-loglevel", "error", "-i", str(src), "-vf", "fps=30,format=yuv420p",
                    "-c:v", "libx264", "-crf", "20", "-preset", "slow", "-movflags", "+faststart", str(dst)], check=True)


def main(selected: list[str]) -> None:
    for d in (SHOTS, VIDS, RAW):
        d.mkdir(parents=True, exist_ok=True)
    names = selected or list(SCENES) + ["mobile"]
    with sync_playwright() as pw:
        for i, name in enumerate(n for n in names if n in SCENES):
            print("scene", name)
            browser = pw.chromium.launch()
            ctx = browser.new_context(viewport={"width": W, "height": H}, device_scale_factor=2,
                                      record_video_dir=str(RAW), record_video_size={"width": W, "height": H})
            ctx.add_init_script(CURSOR_JS)
            page = ctx.new_page()
            try:
                SCENES[name](page)
            except Exception as e:  # noqa: BLE001
                print("  !", name, e)
            vid = page.video
            ctx.close(); browser.close()
            if vid:
                raw = Path(vid.path())
                to_mp4(raw, VIDS / f"{list(SCENES).index(name) + 1:02d}-{name}.mp4")
                raw.unlink(missing_ok=True)
        if "mobile" in names:
            print("scene mobile"); scene_mobile(pw)
    shutil.rmtree(RAW, ignore_errors=True)


if __name__ == "__main__":
    main(sys.argv[1:])
