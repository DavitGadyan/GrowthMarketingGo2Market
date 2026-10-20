"use client";

import { useEffect, useReducer, useRef } from "react";

/**
 * Presence for lists: an item that leaves `items` keeps rendering, in place,
 * with `closing: true` for `exitMs` so its exit transition can play.
 *
 * "Leaving" is derived synchronously from the previous item set during render
 * (no effect round-trip, so there is never a frame where the item is gone),
 * and the effect only owns the removal timers.
 */
export function usePresenceList<T>(items: T[], keyOf: (t: T) => string, exitMs = 180): { item: T; key: string; closing: boolean }[] {
  const [, force] = useReducer((x: number) => x + 1, 0);
  const known = useRef<Map<string, { item: T; leaving: boolean }>>(new Map());
  const order = useRef<string[]>([]);
  const timers = useRef<Map<string, ReturnType<typeof setTimeout>>>(new Map());

  const current = new Map(items.map((t) => [keyOf(t), t] as const));
  for (const [k, t] of current) {
    known.current.set(k, { item: t, leaving: false });
    if (!order.current.includes(k)) order.current.push(k);
  }
  for (const [k, v] of known.current) if (!current.has(k)) v.leaving = true;

  useEffect(() => {
    for (const [k, v] of known.current) {
      if (v.leaving && !timers.current.has(k)) {
        timers.current.set(k, setTimeout(() => {
          timers.current.delete(k);
          const entry = known.current.get(k);
          if (entry?.leaving) {
            known.current.delete(k);
            order.current = order.current.filter((x) => x !== k);
            force();
          }
        }, exitMs));
      }
      if (!v.leaving && timers.current.has(k)) { clearTimeout(timers.current.get(k)); timers.current.delete(k); }
    }
  });
  useEffect(() => () => { for (const t of timers.current.values()) clearTimeout(t); }, []);

  return order.current.filter((k) => known.current.has(k)).map((k) => {
    const v = known.current.get(k) as { item: T; leaving: boolean };
    return { item: v.item, key: k, closing: v.leaving };
  });
}
