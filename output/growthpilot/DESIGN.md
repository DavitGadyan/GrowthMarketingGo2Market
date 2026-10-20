# Build brief - GrowthPilot (v2: Growth Marketing Platform template)

**Request:** GrowthPilot AI growth marketing GTM agent app
**Platform:** web  |  **Company:** GrowthPilot
**Reference design:** trueNorth - Growth Marketing Platform (`growth-marketing-platform`,
library `/Users/dyada/Desktop/Github/designiceui/docs/designs/Growth Marketing Platform`)
**Look at these before writing code:** `design-reference/image_original1.png` (timeline
teaser), `3` (Campaigns / Timeline), `4` (Campaigns / Results), `5` (Ideas),
`6` (Choose a template), `7` (Growth + strategy modal), `8` (marketing hero).
Images 2, 9, 10 are case-study boards, not UI.

## Direction
- Style: **minimal, soft, light** - white surfaces on a #F5F5F7 ground, 1px black/6%
  strokes, soft shadows, lavender/cyan/orange tints for data, violet primary.
- Mode: **light**
- Motion: transform/opacity only, strong ease-out `cubic-bezier(.23,1,.32,1)`, UI ≤ 300 ms; route fade 160 ms, modal scale .96→1 240 ms, drawers 320 ms on the iOS drawer curve, one-time stagger entrances (40 ms), reduced-motion keeps opacity only.
- Layout: 80px icon rail + white top bar with underline tabs; content is edge-to-edge
  panes (not centred cards), tables with light row rules, Gantt and area charts.

## Tokens - template -> yours

| Role | Template (read off the images) | Yours |
|---|---|---|
| ground | `#F5F5F7` | `#F5F5F7` |
| surface | `#FFFFFF` | `#FFFFFF` |
| ink | `#1A1A1F` | `#111114` |
| muted | `#8A8A8F` | `#8A8A8F` |
| accent (primary, active nav, links) | `#6B4EFF` violet | `#10B981` emerald **<-** |
| accent2 (secondary, planned series, chips) | `#35B0E8` cyan | `#8B5CF6` violet **<-** |
| tint-accent (active nav bg, selected rows) | `#EEEBFF` | `#E6F7F1` **<-** |
| tint-accent2 | `#E3F4FB` | `#EFEBFF` **<-** |
| warn / success / danger | `#F5A524` / `#3DBF6B` / `#F0665C` | same |
| stroke | black 6% (`#E8E8EC`) | same |
| shadow | `0 2px 12px rgba(0,0,0,.06)` | same |
| radius | 14px cards, 999px pills, 10px inputs | same |
| display font | Inter (medium) | Plus Jakarta Sans 500/600/700 **<-** |
| body font | Inter | Geist 400/500/600 (tabular numerals), Geist Mono for timestamps **<-** |

Type: page title 24/32·600 −0.01em; goal sentence 20/28·500; section titles 17/24·600;
body 15/24; table 14/20; meta 12.5/16 muted (#6F6F76 ≤ 14px for 4.5:1); KPI numbers 28–32·600 −0.02em,
tabular; uppercase micro-labels 0.08em tracking.

## Screens -> routes
1. `/growth`    <- Growth (image 7): goal sentence + action links, area chart, milestone table, strategy modal
2. `/timeline`  <- Campaigns / Timeline (image 3): goal card, revenue chart + month rings, Gantt rows
3. `/results`   <- Campaigns / Results (image 4): three panes - list / detail + comments / goal gauge, tasks, results
4. `/ideas`     <- Ideas (image 5): bubble chart impact x spend, plan list, grouped rows + bulk bar
5. `/templates` <- Choose a template (image 6): categories, featured card with donut + quarter-circle CTA, card grid
6. `/chat`      <- agents chat (same comment-thread anatomy as Results detail), `/integrations`, `/settings`, `/setup` wizard -> restyled on the same tokens
7. `/`          <- marketing hero (image 8): gradient headline, central tile + four satellite tiles, integration chips

## Non-negotiables
- No emoji as icons (lucide). Real copy, no lorem.
- Body text never below 15px; ink never pure #000 on pure #FFF (#111114 on #FFFFFF).
- Buttons have hover, focus-visible and active states. Respect prefers-reduced-motion.
- Every pane differs from its neighbour in background, rhythm or column count.
- Charts: Recharts, tokens only, no default greys; tooltips white with 1px stroke + shadow.
