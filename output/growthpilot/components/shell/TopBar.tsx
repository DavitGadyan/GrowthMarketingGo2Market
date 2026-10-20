"use client";

import Link from "next/link";
import { useLayoutEffect, useRef, useState, type ReactNode } from "react";

/** Last underline position per tab set, so a sibling page mounting its TopBar slides from it. */
const lastBar = new Map<string, { x: number; w: number }>();

/**
 * The white top bar from the reference: page title, underline tabs next to it,
 * and right-side actions (text links + one primary pill). Pages render it as
 * the first child of their content; the shell renders only the icon rail.
 */
export type TopBarTab = { label: string; href: string; active?: boolean };

export function TopBar({
  title,
  tabs = [],
  actions,
  subtitle,
}: {
  title: string;
  tabs?: TopBarTab[];
  actions?: ReactNode;
  subtitle?: string;
}) {
  const navRef = useRef<HTMLElement>(null);
  const key = tabs.map((t) => t.href).join("|");
  const [bar, setBar] = useState<{ x: number; w: number } | null>(() => lastBar.get(key) ?? null);
  useLayoutEffect(() => {
    const nav = navRef.current;
    if (!nav) return;
    const measure = () => {
      const el = nav.querySelector<HTMLElement>('[aria-current="page"]');
      if (!el) { setBar(null); return; }
      const next = { x: el.offsetLeft, w: el.offsetWidth };
      lastBar.set(key, next);
      setBar(next);
    };
    // Paint the remembered position first, then move - that is the slide.
    const raf = requestAnimationFrame(measure);
    const ro = new ResizeObserver(measure);
    ro.observe(nav);
    return () => { cancelAnimationFrame(raf); ro.disconnect(); };
  }, [key, tabs]);
  return (
    <header className="pane rule-b flex min-h-[72px] flex-wrap items-center gap-x-8 gap-y-2 px-5 py-3 md:min-h-[88px] md:px-8 md:py-0">
      <div className="min-w-0">
        <h1 className="t-title text-[22px] leading-7 md:text-[24px] md:leading-8">{title}</h1>
        {subtitle && <p className="t-meta">{subtitle}</p>}
      </div>
      {tabs.length > 0 && (
        <nav ref={navRef} data-js={bar ? "" : undefined} className="relative -mb-px flex h-12 items-stretch gap-6 md:h-[88px]" aria-label="Page sections">
          {tabs.map((t) => (
            <Link key={t.href} href={t.href} aria-current={t.active ? "page" : undefined} className="tab-underline">
              {t.label}
            </Link>
          ))}
          {bar && <span aria-hidden className="tab-bar" style={{ width: bar.w, transform: `translateX(${bar.x}px)` }} />}
        </nav>
      )}
      {actions && <div className="ml-auto flex flex-wrap items-center gap-3 md:gap-4">{actions}</div>}
    </header>
  );
}
