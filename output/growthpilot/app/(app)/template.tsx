"use client";

import type { ReactNode } from "react";

/**
 * Re-mounts on every navigation, so the content gets one short entrance
 * (opacity + 4px rise, 160ms) instead of teleporting. Route changes happen
 * tens of times a day, so this stays near-imperceptible.
 */
export default function Template({ children }: { children: ReactNode }) {
  return <div className="route-enter">{children}</div>;
}
