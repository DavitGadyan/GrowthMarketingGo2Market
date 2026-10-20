"use client";

import { useEffect, useRef, useState } from "react";

/**
 * Keeps an element mounted for `exitMs` after `open` turns false so its exit
 * transition can play. `closing` is true during that window; put it on a
 * `data-closing` attribute and style the exit state from it.
 */
export function usePresence(open: boolean, exitMs = 200): { mounted: boolean; closing: boolean } {
  const [mounted, setMounted] = useState(open);
  const [closing, setClosing] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => {
    if (timer.current) { clearTimeout(timer.current); timer.current = null; }
    if (open) { setMounted(true); setClosing(false); return; }
    if (!mounted) return;
    setClosing(true);
    timer.current = setTimeout(() => { setMounted(false); setClosing(false); timer.current = null; }, exitMs);
    return () => { if (timer.current) clearTimeout(timer.current); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, exitMs]);
  return { mounted, closing };
}

/** `prefers-reduced-motion: reduce`, live. */
export function useReducedMotion(): boolean {
  const [reduce, setReduce] = useState(false);
  useEffect(() => {
    const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
    const on = () => setReduce(mq.matches);
    on();
    mq.addEventListener("change", on);
    return () => mq.removeEventListener("change", on);
  }, []);
  return reduce;
}
