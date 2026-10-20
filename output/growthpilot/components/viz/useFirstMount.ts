"use client";

import { useEffect, useRef } from "react";
import { useReducedMotion } from "@/lib/usePresence";

/**
 * True for the first render only, and never under prefers-reduced-motion, so
 * a Recharts series draws in once and then updates in place when data changes.
 */
export function useFirstMountAnimation(): boolean {
  const first = useRef(true);
  const reduce = useReducedMotion();
  useEffect(() => { first.current = false; }, []);
  return first.current && !reduce;
}
