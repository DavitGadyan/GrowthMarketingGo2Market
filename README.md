# GrowthPilot - AI growth marketing & go-to-market agents

GrowthPilot takes a company profile and runs the growth-marketing / go-to-market
methodology taught in the five courses under `knowledge_base/` (Marketing
Management II, Market Strategy & Targeting, Product Marketing Foundations, GenAI
Prompt Engineering, B2B Sales). Seven AI agents research, strategise, plan and review; after
you approve each task they execute: ad and landing-page copy with ADPLANE scores
and A/B tests, email sequences, Gmail outreach **drafts**, and Higgsfield ad
creatives behind a quote-then-approve gate.

```
knowledge_base/              the course transcripts the methodology is distilled from
backend/                     FastAPI + Claude Agent SDK + SQLite              (:8000)
  app/schemas.py             company profile, 14 stage schemas, task schemas, API shapes
  app/prompts/*.md           one prompt per stage: persona + framework card + schema
  app/orchestrator.py        runs stages 1-14, streams events, creates tasks + deliverables
  app/executors.py           stage 15 - runs only tasks whose status is "approved"
  app/runner.py              SdkRunner (real agents) and FakeRunner (deterministic demo)
  app/calculators.py         SAM/SOM, reverse waterfall, lift, CPM - exposed to agents as MCP tools
  knowledge/methodology.md   the framework cards, with course citations
  tests/                     40 tests (calculators, schemas, pipeline, API + approval gate)
output/growthpilot/          Next.js 15 app, re-skinned from a designice template  (:3000)
```

## The 15 stages

| # | Stage | Agent | Course |
|---|---|---|---|
| 1 | Situation analysis → value gaps | Research (web) | MM2 |
| 2 | TAM / SAM / SOM with an assumptions table | Research (web + calculators) | MST |
| 3 | Target market selection & naming | Research (web) | PMF |
| 4 | Feature-Benefit Matrix | Strategy | MST |
| 5 | Personas, buying roles, ICP, layered segments | Strategy | PMF, MST |
| 6 | Value proposition & positioning (Problem-Solution-Outcome) | Strategy | MST, MM2 |
| 7 | Go-to-market motion (2×2) | Strategy | PMF |
| 8 | OKRs → SMART goals → KPIs | Planning | MST, PMF |
| 9 | Demand math: reverse waterfall, LTV > CAC | Planning (calculators) | PMF |
| 10 | Buyer's journey | Planning | PMF |
| 11 | Marketing mix (4 Ps) | Planning | MM2 |
| 12 | Communications plan (6 M's) | Planning | MM2 |
| 13 | GTM plan + 90-day timeline | Planning | MST |
| 14 | Three-lens review → recommendations, tactics matrix, execution plan | Review | MST, GAI |
| 15 | Execute approved tasks | Content / Outreach / Creative / Research | MM2, MST, PMF |
| + | Influencer research: find IG / X creators, score real vs fake, rank, write the first DM | Research | B2B Sales |

## Run it

`backend/growthpilot.db` ships with two real runs already in it - **Loopwise**
(B2B sales SaaS) and **Bespoke Thread** (made-to-measure dresses, men's suits and
girls' occasion wear) - each with its 14 stages, proposed tasks and a real
influencer research. `make dev` opens on them. `backend/growthpilot_demo.db` is
the deterministic demo data; copy it over `growthpilot.db` for `make demo`.

```bash
cp .env.example .env      # optional: ANTHROPIC_API_KEY; the `claude` CLI login works too
make install              # python venv (uv) + npm install
make demo                 # deterministic fake agents: no key, no cost, instant runs
make dev                  # real agents through the Claude Agent SDK
make test                 # backend pytest + frontend production build
```

Open http://localhost:3000 → *Create your workspace* → the 3-step setup → the
run starts and streams into **Chat**. Approve execution tasks from the chat
cards or the Deliverables page; nothing is sent, generated or spent without an
approval. Screens: Growth (goal, projection chart, milestones, live strategy
funnel), Timeline (90-day plan + execution tasks as a Gantt on one axis),
Ideas (tactics as an impact × spend bubble chart with bulk "Add to Timeline"),
Results (tasks and deliverables, an interactive three-lens readiness gauge,
approvals), Influencers (Instagram / X creators ranked by authenticity with a
personalised first message each), Templates (deliverables with Markdown/HTML
export), Agents chat, Integrations, Settings.

The backend alone: `cd backend && GROWTHPILOT_FAKE_AGENTS=1 .venv/bin/uvicorn
app.main:app --port 8000`; API docs at http://localhost:8000/docs.

## Influencer authenticity rule

Engagement rate = (avg likes + avg comments) ÷ followers over 3-6 recent posts.
Judged against the account's tier (nano <10k, micro 10-100k, mid 100-500k,
macro 500k+; Instagram good ≥ 4 / 2 / 1.2 / 0.8 %, poor < 1 / 0.5 / 0.3 / 0.2 %;
X at half those). 60 points for the rate's position in its band, 20 for the
follower : following ratio, 20 for comments : likes. Real ≥ 65, suspicious
40-64, likely fake < 40. Examples: 35k followers with 25 likes → 0.07 % →
likely fake; 30k with 750 likes and 40 comments → 2.6 % → real. The agent
refines the benchmarks with cited research on each run; the score itself is
computed, never estimated.

What a real research run can and cannot see: Instagram and X block direct
page fetches, so follower and per-post counts come from public creator
directories, stat sites and search snippets (`data_quality: estimated`), and
the agent marks each DM's hook "verify the latest post before sending" when it
could not open the post itself. Connect Firecrawl for deeper sampling. The
HypeAuditor-style audit (AQS, audience types, comments authenticity, growth
pattern, reachability, est. reach / price / CPE) is a GrowthPilot estimate
modelled on HypeAuditor's published definitions, not their data.

## Integrations

| Name | Enables | Configure in `.env` |
|---|---|---|
| Anthropic | every agent | `ANTHROPIC_API_KEY`, or a `claude` CLI login |
| Firecrawl | deeper competitor research | `FIRECRAWL_API_KEY` |
| Gmail | outreach **drafts** (send tools are denied) | `GMAIL_MCP_COMMAND` (a stdio Gmail MCP server) |
| Higgsfield | ad images / video, quote first, render after a second approval | `HIGGSFIELD_MCP_URL` + `HIGGSFIELD_MCP_TOKEN` |

Tasks that need an unconnected integration are created as *blocked* with a
"Connect … to run" note; the Integrations page shows what is connected.

## Notes

- Creator profile pictures are fetched by the backend (`GET /api/avatar/{platform}/{handle}`:
  Instagram from the profile's link-preview image, X via unavatar.io) and cached
  in `backend/avatar_cache/`; initials show when a picture can't be fetched.

- Intel Macs: `cryptography` is pinned `<50` because 50.x ships no x86_64 wheels.
- Exports are Markdown and HTML; print the HTML to PDF from the browser.
- UI reproduced from the designice reference "Growth Marketing Platform"
  (trueNorth Marketing OS: icon rail, Growth / Timeline / Ideas / Results /
  Templates), light mode, re-skinned to emerald `#10B981` / violet `#8B5CF6`,
  Space Grotesk + Inter. The reference lives in the designiceui repo library
  (`docs/designs/Growth Marketing Platform`).
