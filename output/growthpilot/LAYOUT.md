# Layout inventory - trueNorth Growth Marketing Platform -> GrowthPilot (v2)

Rows here become components. A component with no row here is an invention.

## Template tokens (read off the images)
| | Template | Yours |
|---|---|---|
| mode | light | light |
| ground / surface | #F5F5F7 / #FFFFFF | same |
| ink / muted | #1A1A1F / #8A8A8F | #111114 / #8A8A8F |
| accent / accent2 | #6B4EFF / #35B0E8 | #10B981 / #8B5CF6 |
| corner radius | 14 cards, 999 pills, 10 inputs | same |
| nav pattern | 80px icon rail, active = tinted square + accent icon | same |
| card style | white, 1px black/6%, soft shadow; panes separated by 1px rules | same |

## Shell (every screen)
| # | Region | Component | Contents | Layout | States |
|---|---|---|---|---|---|
| 1 | Icon rail, left, 80px, white, 1px right rule | `Rail` | logo square 40px (accent fill, "GP"), then 5-6 icon buttons 56x56 (Growth=target, Timeline=rows, Ideas=bulb, Results=trend, Templates=grid, Agents=chat), bottom: bell, avatar 40px, expand chevron | vertical, icons centred, 8px gaps | active = tint-accent square + accent icon; hover = ground; expanded (chevron) shows labels at 220px |
| 2 | Top bar, 88px, white, 1px bottom rule | `TopBar` | page title 24px left; underline tabs (accent 2px underline, 15px) next to it; right: text links (accent, 14px) + primary pill (accent fill, white text, 40px, optional caret segment) | flex, title + tabs left, actions right | tab active/hover; primary hover darker + shadow |
| 3 | Content | page | white panes edge-to-edge, no outer padding except 24px in panes | | |

## Screen: Growth (image 7) -> /growth
| # | Region | Component | Contents | Layout |
|---|---|---|---|---|
| 1 | Goal row, 72px, 1px bottom rule | `GoalLine` | "Our goal is to reach $1M ARR by Oct 2027" 20px; right: 4 text links with icons: Edit funnel, Edit goal, Edit strategy, Track growth (accent) | flex between |
| 2 | Chart area, ~470px | `GrowthChart` | top-right controls: "Showing Revenue v", legend squares Actual (accent), Projected (accent2 outline), Forecast trajectory toggle; Y axis labels left; area line actual (accent, solid, thick) + projected (dashed) + goal line (green thin); vertical "today" rule; tooltip white card | Recharts ComposedChart |
| 3 | Milestone table | `MilestoneTable` | columns Milestone (month ring 40px + month name) / Revenue "$3k / $8k" (actual / planned) / Spend / ROI % (tinted cells by ROI) | table, 56px rows, light rules |
| 4 | Strategy modal (over chart, right side 1000px, white, radius 16, shadow) | `StrategyModal` | title "How we plan to achieve $121.1k/mo Revenue by November 2023" 24px + close; funnel visualisation: four stages Visits -> Leads -> New Clients -> Revenue drawn as a tapering cyan band with dashed stage rules, stage label + value above the band, conversion chips (accent2 pill, white text) between stages; strategy table: Strategy / Starting point / Target columns with editable inputs and units; footer: ghost "Compare scenarios" (sparkle), Cancel, primary "Save strategy" | |

## Screen: Timeline (image 3) -> /timeline
| # | Region | Component | Contents | Layout |
|---|---|---|---|---|
| 1 | Top bar tabs | | Timeline (active) / Results; right: "Import campaigns" link + primary "Add campaign" with caret | |
| 2 | Goal card, left 700px, 320px tall | `GoalCard` | "Goal ..." muted label, headline "Reach $30.0k/mo Revenue by March 2023" 24px, date + "Update progress" link, big value "$31.4/mo", delta "4.5% above goal" green | |
| 3 | Revenue chart, right of goal card | `RevenueChart` | legend Actual / Planned / Projected, area + dashed lines, today rule, tooltip card with Planned / Projected (Milestone) rows + "5 campaigns are planned to contribute 137.4%" | |
| 4 | Toolbar row, 72px, rules top/bottom | `TimelineToolbar` | left: layout icon button, "Campaigns by Channel" (dotted underline), filter + search icons, "Spend" sort, "..." | right: month rings row (Dec..Oct, 40px rings, current month green ring, progress arc) | |
| 5 | Rows | `GanttRows` | group header (channel name bold + total spend); rows: status dot, source icon, campaign name, comment count, spend, owner avatar 28px; right: Gantt bars (tint-accent / tint-accent2, 14px tall, rounded) on a month grid, milestone diamonds, today rule; "Add <channel> campaign..." muted row; bottom-left "Today - +" zoom pill | 56px rows |

## Screen: Results (image 4) -> /results
| # | Region | Component | Contents | Layout |
|---|---|---|---|---|
| 1 | Left pane 320px, 1px right rule | `CampaignList` | groups (Content Marketing / PPC / CRO) with rows: status dot or check, name truncated, count; selected row tint-accent | |
| 2 | Middle pane, flex | `CampaignDetail` | title 28px, owner avatar + name, date range; description 15px; comment thread: avatar, name + time, text, reaction chips; composer "Leave a comment or @mention someone..." with avatar | |
| 3 | Right pane 600px, 1px left rule, header with "Group with", "...", close | `ResultsRail` | collapsible sections: Goal (target icon + "Get 1,000 Leads/mo for $10k", type + chip, gauge 125% semicircle red-orange-green with needle); Tasks 1/3 + "Hide completed" (checkbox rows, due date accent, avatar, completed struck through); Results (source "Google Analytics" + refreshed date; table Visits / Leads / Sales / Revenue with Result, CR%, sparkline; Spend + ROI highlighted box) | |

## Screen: Ideas (image 5) -> /ideas
| # | Region | Component | Contents | Layout |
|---|---|---|---|---|
| 1 | Top bar | | title Ideas; right: "Add idea", "Templates" links, primary "Create ideation session" | |
| 2 | Left pane 320px | `PlanList` | "All ideas" (home icon, selected tint), coloured-dot plans (Paid Ads Roll Out, Shopify Marketing Plan, Backlog), "+ Add new plan" | |
| 3 | Bubble chart, 460px tall | `IdeasBubbleChart` | Y: Low / Medium / High impact; X: High / Medium / Low spend; bubbles sized by impact, coloured by ROI (red <30%, orange 30-74%, green 75%+), labels under bubbles; legend top-right "Bubble size represents impact - ROI: o <30% o 30-74% o 75%+" | Recharts ScatterChart |
| 4 | Toolbar | | select-all checkbox, "Ideas by Channel", filter + search; right: Priority (sort) / Owner columns | |
| 5 | Grouped rows | `IdeaRows` | group header with caret (Ungrouped / Paid Ads / Custom Channel); rows: checkbox, name, signal icon + priority score, owner avatar + name; selected rows tinted; "Add idea..." muted row | 50px rows |
| 6 | Floating bulk bar, bottom centre, dark pill 56px | `BulkBar` | "5 selected", primary-ish "Calculate spend" (sparkle), "Add to Timeline", copy, delete, close | fixed |

## Screen: Templates (image 6) -> /templates
| # | Region | Component | Contents | Layout |
|---|---|---|---|---|
| 1 | Top bar | | title "Choose a template"; search input 860px; right: Add idea / Templates links + primary | |
| 2 | Left pane 380px | `TemplateCategories` | intro paragraph muted; "Templates" heading; rows: All templates 39 (selected tint, grid icon), Branding 6, Content Marketing 9 ... | |
| 3 | Featured card, white, radius 16, shadow, 1270x620 | `FeaturedTemplate` | title 32px, heart count, share; author line "by X in Category - Last updated"; description with "Read more"; stat box (Campaigns 9 / Expected ROI 125-150%); donut "Channel distribution" with legend rows + percentages; right column notes with checks; top-right violet quarter-circle with "Preview & set up" white pill + caption | |
| 4 | Card grid 2-3 cols | `TemplateCard` | tinted illustration area 150px (lavender waves / orange circle), logo mark + title + author, heart count | |

## Screen: Landing (image 8) -> /
| # | Region | Component | Contents |
|---|---|---|---|
| 1 | Hero, white, centred | `Hero` | headline "Focus, Align & Track" 64px gradient (accent -> accent2 -> orange), subtitle 24px; central 300px tile (gradient, white glyph) with product name under it; four satellite tiles (Growth / Timeline / Experiments / Results, tinted, icon + label) connected by curved tinted lines; row of 7 integration logo chips (white circles, shadow) |

## Section plan
1. shell (rail + top bar)  2. growth  3. timeline  4. results  5. ideas  6. templates  7. landing  8. chat / setup / integrations / settings restyle
