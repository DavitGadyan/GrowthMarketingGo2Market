/**
 * The same tokens as globals.css, in TypeScript, for the places CSS cannot
 * reach - chart libraries, canvas, meta tags. Keep the two in sync.
 *
 * v2: re-skinned from the trueNorth "Growth Marketing Platform" reference
 * (light mode); GrowthPilot keeps emerald as primary, violet as secondary.
 */
export const tokens = {
  color: {
    ground: "#F5F5F7",
    surface: "#FFFFFF",
    ink: "#111114",
    muted: "#8A8A8F",
    accent: "#10B981",
    accent2: "#8B5CF6",
    tintAccent: "#E6F7F1",
    tintAccent2: "#EFEBFF",
    tintCyan: "#E3F4FB",
    tintOrange: "#FFF1DC",
    cyan: "#35B0E8",
    warn: "#F5A524",
    success: "#3DBF6B",
    danger: "#F0665C",
    stroke: "rgba(0,0,0,0.06)",
  },
  palette: ["#10B981", "#8B5CF6", "#35B0E8", "#F5A524", "#F0665C"],
  motion: {
    ease: [0.22, 1, 0.36, 1] as const,
    fast: 180,
    base: 320,
    slow: 600,
  },
  mode: "light" as const,
} as const;

export type Tokens = typeof tokens;
