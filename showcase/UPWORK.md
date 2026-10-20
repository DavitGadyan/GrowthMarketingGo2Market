# Upwork portfolio: GrowthPilot

## Project title
**GrowthPilot: AI Agents That Research, Plan and Run Your Go-To-Market**

## Project description (short)
GrowthPilot is a full-stack web app where seven AI agents take a company profile and produce a complete growth marketing plan: market research, TAM/SAM/SOM, personas, positioning, pricing, a 90-day launch timeline, and ready-to-approve execution tasks. It also finds Instagram and X influencers, scores them real or fake from engagement data, and writes a personal first message to each. Every action that costs money or contacts someone waits for the user's approval.

**Built with:** Next.js 15, React 19, TypeScript, Tailwind CSS v4, Recharts · Python FastAPI, SQLite, Claude Agent SDK (multi-agent orchestration, MCP tools, live web research) · Server-Sent Events for live agent logs · 54 automated backend tests.

**My role:** Product design, UX/UI, front-end, back-end, AI agent architecture, prompt engineering.

**Skills / tags:** AI Agents · LLM Apps · Claude API · Next.js · React · TypeScript · FastAPI · Python · SaaS Dashboard · Data Visualization · Growth Marketing · UX/UI Design

---

## Screenshots (`shots/`, 2880×1800, retina)

**01 · Landing: one workspace for the whole go-to-market**
`01-landing.png`
A clean entry point that explains the product in one glance: research, plan and execute, connected to the tools a marketing team already uses. Prospective users understand the value before they sign up.

**02 · Guided company setup**
`02-setup-wizard.png`
A three-step wizard collects what the AI needs: product, market, competitors, budget and goals. Short, structured questions replace a blank prompt, so the agents start from accurate inputs.

**03 · Growth goal and revenue projection**
`03-growth-chart-hover.png`
The goal, the plan and the projected revenue curve sit on one interactive chart, with a milestone table underneath. Hover any month to see plan vs projection and which milestones contribute.

**04 · Live strategy funnel**
`04-growth-strategy-funnel.png`
Change a target such as visitors or conversion rate and the funnel redraws instantly, comparing the edited plan against the current one. Founders can test "what if" scenarios in seconds instead of rebuilding a spreadsheet.

**05 · 90-day launch timeline (Gantt)**
`05-timeline-gantt.png`
Every milestone and execution task from the AI plan is laid out week by week, aligned with the revenue chart above it. The team sees what happens when and what it costs.

**06 · Milestone details on hover**
`06-timeline-bar-tooltip.png`
Hover a bar to see the full task, owner, week and its dependency. The whole plan is inspectable without opening another screen.

**07 · Plan readiness gauge**
`07-results-gauge-tooltip.png`
An AI review scores the plan on three lenses (resources, strategy, metric realism) and shows them as an interactive gauge. Hover a segment to read why it passed or raised a concern.

**08 · Review findings and recommendations**
`08-results-lens-panel.png`
Click a lens to see the concrete issue, the suggested fix and prioritised recommendations. Weak assumptions get caught before money is spent on them.

**09 · Ideas prioritised by impact and spend**
`09-ideas-bubble-hover.png`
Every proposed tactic is plotted by impact vs cost and coloured by expected ROI, with the list underneath synced to the chart. The best bets stand out immediately.

**10 · Bulk actions on ideas**
`10-ideas-bulk-actions.png`
Select tactics to estimate their 90-day spend in one click, then add them to the timeline. Planning a quarter becomes a few clicks instead of a meeting.

**11 · Influencers ranked by real engagement**
`11-influencers-ranked.png`
Real Instagram and X creators for the brand's niche, plotted by reach vs engagement and ranked by an audience-quality score. Accounts with big followings but tiny engagement are flagged as likely fake before you pay them.

**12 · Creator audit**
`12-influencers-audit.png`
Each creator gets a HypeAuditor-style audit: measured followers, likes and comments, engagement vs similar accounts, audience quality and estimated reach and price per post. Brands judge an influencer on evidence, not follower count.

**13 · Personalised outreach message**
`13-influencers-message.png`
The AI writes a short first message that references the creator's own recent post and explains why the product fits their audience. It is ready to copy or save as a Gmail draft, never sent automatically.

**14 · Deliverable templates**
`14-templates.png`
Market research, personas, positioning, pricing and the GTM plan become polished documents, exportable as Markdown or HTML. Agencies hand them straight to clients or stakeholders.

**15 · Chat with the AI agents**
`15-agents-chat.png`
Ask a question and get a short, specific answer grounded in the plan's data, plus proposed tasks with cost estimates. Nothing runs until you approve it.

**16 · Mobile: influencer research**
`16-mobile-influencers.png`
The full product works on a phone, including the creator list and audits. Founders can review creators and approve outreach on the go.

**17 · Mobile: growth plan**
`17-mobile-growth.png`
Goals, projections and milestones adapt to small screens without losing information, so the plan can be checked anywhere.

---

## Videos (`videos/`, 1440×900 MP4, H.264)

| File | Title | Caption (2–3 sentences) |
|---|---|---|
| `01-landing.mp4` | Animated product overview | The landing page animates the connection between research, timeline, ideas and results. It shows in seconds how the agents tie a marketing team's work together. |
| `02-setup.mp4` | Company setup in three steps | A guided wizard turns a few answers into everything the agents need. Setup takes minutes and needs no prompt writing. |
| `03-growth.mp4` | Interactive growth plan and live funnel | Hover the revenue projection, then edit a funnel target and watch the strategy recalculate with a side-by-side comparison. It shows how quickly a founder can test scenarios. |
| `04-timeline.mp4` | 90-day launch timeline | Hover milestones for details and select weeks on a Gantt that stays aligned with the revenue chart. The whole launch is visible and inspectable on one screen. |
| `05-results.mp4` | AI plan review | The readiness gauge explains each review lens on hover, and a click opens the findings and prioritised fixes. Weak assumptions surface before budget is committed. |
| `06-ideas.mp4` | Prioritise and plan tactics | Hover and select tactics on an impact-vs-spend chart, estimate their spend and add them to the timeline. Choosing what to do next becomes fast and visual. |
| `07-influencers.mp4` | Find real influencers, skip fake ones | Browse real creators with real profile pictures, open an audit and read the personalised outreach message. Brands avoid paying for bought followers. |
| `08-templates.mp4` | Client-ready deliverables | Hover the deliverable cards to preview research, positioning, pricing and the GTM plan. Each one exports as a clean document. |
| `09-chat.mp4` | Talk to the agents | A real question gets a concise, data-backed answer and follow-up suggestions. Proposed work waits for one-click approval. |

---

## Suggested Upwork portfolio order
Cover image: `12-influencers-audit.png` (most distinctive). Then `04`, `03`, `07`, `09`, `15`, `11`, `06`, `16`. Attach `07-influencers.mp4` and `03-growth.mp4` as the two videos. Upwork shows them as the most engaging items.

## Re-recording
Run `python3 showcase/capture.py` with the app on :3000 and the API on :8000. Pass scene names to re-record only some, e.g. `python3 showcase/capture.py growth ideas`.
