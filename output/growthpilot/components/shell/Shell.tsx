"use client";

import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  AtSign, Bell, ChevronLeft, ChevronRight, LayoutGrid, Lightbulb, Menu, MessageSquare, Plug, Rows3, Settings, Target, TrendingUp, X,
} from "lucide-react";
import { api } from "@/lib/api";
import { useCompany, useRuns, useRunStream } from "@/lib/hooks";
import { usePresence } from "@/lib/usePresence";
import { timeHMS } from "@/lib/format";
import { IconButton } from "@/components/ui/Button";
import { STATUS_COLOR, STATUS_TONE, StatusDot } from "@/components/ui/Chip";
import { LogoSquare, Wordmark } from "@/components/ui/Logo";
import "./shell.css";

const NAV = [
  { href: "/growth", label: "Growth", icon: Target },
  { href: "/timeline", label: "Timeline", icon: Rows3 },
  { href: "/results", label: "Results", icon: TrendingUp },
  { href: "/ideas", label: "Ideas", icon: Lightbulb },
  { href: "/influencers", label: "Influencers", icon: AtSign },
  { href: "/templates", label: "Templates", icon: LayoutGrid },
  { href: "/chat", label: "Agents", icon: MessageSquare },
];
const SECONDARY = [
  { href: "/integrations", label: "Integrations", icon: Plug },
  { href: "/settings", label: "Settings", icon: Settings },
];
/** Routes that light up a rail item without sharing its prefix. */
const ALIASES: Record<string, string> = { "/deliverables": "/templates", "/agents": "/chat" };

function isActive(pathname: string, href: string) {
  const alias = Object.entries(ALIASES).find(([from]) => pathname === from || pathname.startsWith(`${from}/`));
  const current = alias ? alias[1] : pathname;
  return current === href || current.startsWith(`${href}/`);
}

function initials(name?: string | null) {
  if (!name) return "GP";
  const parts = name.trim().split(/\s+/).slice(0, 2);
  return parts.map((p) => p[0]?.toUpperCase() ?? "").join("") || "GP";
}

/**
 * Tooltip timing for the collapsed rail (tooltip recipe): 300 ms before the
 * first one opens, instant for neighbours while one was open recently.
 */
function useRailTips(enabled: boolean) {
  const [tip, setTipState] = useState<string | null>(null);
  const tipRef = useRef<string | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const warm = useRef<ReturnType<typeof setTimeout> | null>(null);
  const instant = useRef(false);
  const setTip = (v: string | null) => { tipRef.current = v; setTipState(v); };
  const clear = () => { if (timer.current) { clearTimeout(timer.current); timer.current = null; } };
  const show = useCallback((label: string, immediate = false) => {
    if (!enabled) return;
    clear();
    if (immediate || instant.current) { setTip(label); return; }
    timer.current = setTimeout(() => setTip(label), 300);
  }, [enabled]);
  const hide = useCallback(() => {
    clear();
    if (tipRef.current) {
      // One was open: neighbours open instantly for a short while (tooltip recipe).
      instant.current = true;
      if (warm.current) clearTimeout(warm.current);
      warm.current = setTimeout(() => { instant.current = false; }, 400);
    }
    setTip(null);
  }, []);
  useEffect(() => () => { clear(); if (warm.current) clearTimeout(warm.current); }, []);
  useEffect(() => { if (!enabled) setTip(null); }, [enabled]);
  return { tip, show, hide };
}

/**
 * Unread run events for the bell: a light 15 s poll while the drawer is closed.
 * The first fetch only marks where "seen" starts, so history never shows a dot.
 */
function useUnreadEvents(runId: number | undefined, drawerOpen: boolean) {
  const [unread, setUnread] = useState(0);
  const lastSeen = useRef<number | null>(null);
  useEffect(() => { lastSeen.current = null; setUnread(0); }, [runId]);
  useEffect(() => {
    if (drawerOpen) { setUnread(0); return; }
    if (!runId) return;
    let alive = true;
    const tick = async () => {
      try {
        const evs = await api.runs.events(runId, lastSeen.current ?? 0);
        if (!alive) return;
        const max = evs.reduce((m, e) => Math.max(m, e.id), lastSeen.current ?? 0);
        if (lastSeen.current === null) { lastSeen.current = max; return; }
        if (evs.length) { lastSeen.current = max; setUnread((n) => n + evs.length); }
      } catch { /* offline: try again next tick */ }
    };
    void tick();
    const id = setInterval(() => void tick(), 15000);
    return () => { alive = false; clearInterval(id); };
  }, [runId, drawerOpen]);
  return unread;
}

/** Accent progress bar for client navigations: pending on internal link click, done when the pathname changes. */
function useRouteProgress(pathname: string) {
  const [state, setState] = useState<"idle" | "pending" | "done">("idle");
  const pending = useRef(false);
  useEffect(() => {
    const onClick = (e: MouseEvent) => {
      if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
      const a = (e.target as Element | null)?.closest?.("a[href]") as HTMLAnchorElement | null;
      if (!a || a.target === "_blank" || a.hasAttribute("download")) return;
      const href = a.getAttribute("href") ?? "";
      if (!href.startsWith("/") || href.startsWith("//")) return;
      const to = href.split(/[?#]/)[0];
      if (to === window.location.pathname) return;
      pending.current = true;
      setState("pending");
    };
    document.addEventListener("click", onClick, true);
    return () => document.removeEventListener("click", onClick, true);
  }, []);
  useEffect(() => {
    if (!pending.current) return;
    pending.current = false;
    setState("done");
    const t = setTimeout(() => setState("idle"), 320);
    return () => clearTimeout(t);
  }, [pathname]);
  useEffect(() => {
    if (state !== "pending") return;
    const t = setTimeout(() => { pending.current = false; setState("idle"); }, 8000);
    return () => clearTimeout(t);
  }, [state]);
  return state;
}

/** Right-side drawer listing the latest run's events; mounted only while open so it owns the SSE connection. */
function LiveLogDrawer({ onClose, closing }: { onClose: () => void; closing: boolean }) {
  const { company } = useCompany();
  const runs = useRuns(company?.id, !!company);
  const latest = runs.data?.[0] ?? null;
  const stream = useRunStream(latest?.id);
  const events = [...stream.events].slice(-60).reverse();

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  return (
    <div className="fixed inset-0 z-50">
      <button type="button" aria-label="Close live log" className="drawer-backdrop absolute inset-0 cursor-default bg-black/20" data-closing={closing || undefined} onClick={onClose} />
      <aside className="drawer-panel absolute inset-y-0 right-0 flex w-full max-w-[420px] flex-col bg-surface shadow-[var(--shadow-pop)]" data-side="right" data-closing={closing || undefined} role="dialog" aria-label="Live log">
        <div className="rule-b flex items-center justify-between px-5 py-4">
          <div>
            <div className="font-display text-[18px] font-medium">Live log</div>
            <div className="t-meta">
              {latest ? <>Run #{latest.id} · {latest.status} {stream.connected && <span className="ml-1 inline-flex items-center gap-1 text-accent"><StatusDot status="success" /> live</span>}</> : "No run yet"}
            </div>
          </div>
          <IconButton label="Close" onClick={onClose}><X size={18} /></IconButton>
        </div>
        <div className="scroll-thin flex-1 overflow-y-auto px-5 py-3">
          {events.length === 0 ? (
            <p className="py-6 text-[13px] text-muted-strong">{latest ? "Waiting for the first event…" : "Start a run from Growth or Agents and the agents' commands stream here."}</p>
          ) : (
            <ul className="space-y-2.5">
              {events.map((e) => (
                <li key={e.id} className="log-row flex gap-3 text-[13px]">
                  <span className="w-[64px] flex-none font-mono text-[12.5px] text-muted-strong-strong">{timeHMS(e.ts)}</span>
                  <span className="mt-[7px] h-1.5 w-1.5 flex-none rounded-full" style={{ background: STATUS_COLOR[STATUS_TONE[e.level] ?? "muted"] }} />
                  <span className="min-w-0 break-words">{e.message}</span>
                </li>
              ))}
            </ul>
          )}
        </div>
      </aside>
    </div>
  );
}

type Tips = { tip: string | null; show: (label: string, immediate?: boolean) => void; hide: () => void };

function RailItems({ pathname, wide, onNavigate, items, tips }: { pathname: string; wide: boolean; onNavigate?: () => void; items: typeof NAV; tips?: Tips }) {
  return (
    <>
      {items.map(({ href, label, icon: Icon }) => {
        const active = isActive(pathname, href);
        return (
          <span key={href} className="rail-tip-host flex justify-center">
            <Link
              href={href}
              aria-current={active ? "page" : undefined}
              aria-label={wide ? undefined : label}
              className={`rail-btn ${wide ? "is-wide" : ""}`}
              onClick={onNavigate}
              onMouseEnter={tips && !wide ? () => tips.show(label) : undefined}
              onMouseLeave={tips && !wide ? tips.hide : undefined}
              onFocus={tips && !wide ? () => tips.show(label, true) : undefined}
              onBlur={tips && !wide ? tips.hide : undefined}
            >
              <Icon size={22} strokeWidth={1.8} className="flex-none" />
              {wide && <span className="rail-label">{label}</span>}
            </Link>
            {tips && !wide && tips.tip === label && <span className="rail-tip" role="tooltip">{label}</span>}
          </span>
        );
      })}
    </>
  );
}

export function Shell({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const { company } = useCompany();
  const runs = useRuns(company?.id, !!company);
  const latestRunId = runs.data?.[0]?.id;
  const [wide, setWide] = useState(false);
  const [drawer, setDrawer] = useState(false);
  const [log, setLog] = useState(false);
  const [scrolled, setScrolled] = useState(false);
  const drawerP = usePresence(drawer, 320);
  const logP = usePresence(log, 320);
  const tips = useRailTips(!wide);
  const unread = useUnreadEvents(latestRunId, log);
  const progress = useRouteProgress(pathname);

  useEffect(() => {
    try {
      setWide(localStorage.getItem("gp.rail") === "wide");
    } catch {
      /* storage unavailable */
    }
  }, []);
  const toggleWide = () => {
    setWide((w) => {
      try {
        localStorage.setItem("gp.rail", w ? "narrow" : "wide");
      } catch {
        /* ignore */
      }
      return !w;
    });
  };
  useEffect(() => setDrawer(false), [pathname]);
  useEffect(() => {
    if (!drawer) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setDrawer(false);
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [drawer]);
  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 8);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  const railWidth = wide ? 220 : 80;
  const current = [...NAV, ...SECONDARY].find((n) => isActive(pathname, n.href))?.label ?? "GrowthPilot";
  const bellLabel = unread > 0 ? `Open live log (${unread} new)` : "Open live log";
  const bellTip = unread > 0 ? `Live log · ${unread} new` : "Live log";

  return (
    <div className="min-h-screen bg-ground" style={{ ["--rail" as string]: `${railWidth}px` }}>
      <div className="route-progress" data-state={progress} aria-hidden />

      {/* Desktop rail */}
      <aside
        className="shell-rail rule-r fixed inset-y-0 left-0 z-40 hidden flex-col bg-surface md:flex"
        style={{ width: railWidth }}
        aria-label="Primary"
      >
        <div className={`flex h-[88px] items-center ${wide ? "px-5" : "justify-center"}`}>
          <Link href="/growth" aria-label="GrowthPilot home" className="flex items-center gap-3">
            <LogoSquare />
            {wide && <span className="rail-label font-display text-[16px] font-semibold tracking-tight">GrowthPilot</span>}
          </Link>
        </div>
        <nav className={`flex flex-col gap-1 ${wide ? "px-3" : "items-center px-3"}`}>
          <RailItems pathname={pathname} wide={wide} items={NAV} tips={tips} />
        </nav>
        <div className={`rule-t mt-auto flex flex-col gap-1 pb-4 pt-3 ${wide ? "px-3" : "items-center px-3"}`}>
          <span className="rail-tip-host bell-host flex justify-center">
            <button
              type="button"
              className={`rail-btn ${wide ? "is-wide" : ""}`}
              title={bellTip}
              aria-label={bellLabel}
              onClick={() => setLog(true)}
              onMouseEnter={!wide ? () => tips.show(bellTip) : undefined}
              onMouseLeave={!wide ? tips.hide : undefined}
              onFocus={!wide ? () => tips.show(bellTip, true) : undefined}
              onBlur={!wide ? tips.hide : undefined}
            >
              <Bell size={22} strokeWidth={1.8} className="flex-none" />
              {wide && <span className="rail-label">Live log{unread > 0 ? ` · ${unread}` : ""}</span>}
              {unread > 0 && <span className="bell-dot" data-testid="bell-dot" aria-hidden />}
            </button>
            {!wide && tips.tip === bellTip && <span className="rail-tip" role="tooltip">{bellTip}</span>}
          </span>
          <span className="rail-tip-host flex justify-center">
            <Link
              href="/settings"
              className={`rail-btn ${wide ? "is-wide" : ""}`}
              aria-label={wide ? undefined : "Settings"}
              aria-current={isActive(pathname, "/settings") || isActive(pathname, "/integrations") ? "page" : undefined}
              onMouseEnter={!wide ? () => tips.show("Settings") : undefined}
              onMouseLeave={!wide ? tips.hide : undefined}
              onFocus={!wide ? () => tips.show("Settings", true) : undefined}
              onBlur={!wide ? tips.hide : undefined}
            >
              <span className="grid h-10 w-10 flex-none place-items-center rounded-full bg-tint-accent2 text-[13px] font-semibold text-accent2" aria-hidden>{initials(company?.name)}</span>
              {wide && <span className="rail-label truncate">{company?.name ?? "Workspace"}</span>}
            </Link>
            {!wide && tips.tip === "Settings" && <span className="rail-tip" role="tooltip">Settings</span>}
          </span>
          <span className="rail-tip-host flex justify-center">
            <button
              type="button"
              className={`rail-btn ${wide ? "is-wide" : ""}`}
              aria-label={wide ? "Collapse rail" : "Expand rail"}
              onClick={toggleWide}
              onMouseEnter={!wide ? () => tips.show("Expand") : undefined}
              onMouseLeave={!wide ? tips.hide : undefined}
              onFocus={!wide ? () => tips.show("Expand", true) : undefined}
              onBlur={!wide ? tips.hide : undefined}
            >
              {wide ? <ChevronLeft size={20} className="flex-none" /> : <ChevronRight size={20} className="flex-none" />}
              {wide && <span className="rail-label">Collapse</span>}
            </button>
            {!wide && tips.tip === "Expand" && <span className="rail-tip" role="tooltip">Expand</span>}
          </span>
        </div>
      </aside>

      {/* Mobile top bar (fixed; content is padded below it) */}
      <header className={`mobile-bar rule-b fixed inset-x-0 top-0 z-40 flex h-14 items-center justify-between bg-surface/95 px-4 backdrop-blur md:hidden ${scrolled ? "is-scrolled" : ""}`} data-scrolled={scrolled || undefined}>
        <Link href="/growth" aria-label="GrowthPilot home"><Wordmark /></Link>
        <div className="flex items-center gap-1">
          <span className="mr-1 hidden text-[13px] text-muted-strong-strong sm:block">{current}</span>
          <span className="bell-host inline-flex">
            <IconButton label={bellLabel} title={bellTip} onClick={() => setLog(true)}><Bell size={18} /></IconButton>
            {unread > 0 && <span className="bell-dot" style={{ top: 8, right: 8 }} aria-hidden />}
          </span>
          <IconButton label="Open menu" onClick={() => setDrawer(true)}><Menu size={18} /></IconButton>
        </div>
      </header>
      {drawerP.mounted && (
        <div className="fixed inset-0 z-50 md:hidden">
          <button type="button" aria-label="Close menu" className="drawer-backdrop absolute inset-0 bg-black/30" data-closing={drawerP.closing || undefined} onClick={() => setDrawer(false)} />
          <div className="drawer-panel rule-r absolute inset-y-0 left-0 flex w-[272px] flex-col bg-surface shadow-[var(--shadow-pop)]" data-side="left" data-closing={drawerP.closing || undefined}>
            <div className="rule-b flex h-14 items-center justify-between pl-4 pr-2">
              <Wordmark />
              <IconButton label="Close menu" onClick={() => setDrawer(false)}><X size={18} /></IconButton>
            </div>
            <nav className="flex flex-col gap-1 px-3 pt-3" aria-label="Primary">
              <RailItems pathname={pathname} wide items={NAV} onNavigate={() => setDrawer(false)} />
            </nav>
            <div className="mt-auto flex flex-col gap-1 px-3 pb-4">
              <RailItems pathname={pathname} wide items={SECONDARY} onNavigate={() => setDrawer(false)} />
            </div>
          </div>
        </div>
      )}

      {logP.mounted && <LiveLogDrawer onClose={() => setLog(false)} closing={logP.closing} />}

      {/* Content: pages own their TopBar and panes. */}
      <div className="pt-14 md:pl-[var(--rail)] md:pt-0">
        <main className="min-h-screen">{children}</main>
      </div>
    </div>
  );
}
