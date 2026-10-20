# GrowthPilot methodology

Distilled from the four course transcripts in `knowledge_base/`:
**MM2** = Marketing Management II, **MST** = Market Strategy & Targeting,
**PMF** = Product Marketing Foundations, **GAI** = Generative AI Prompt Engineering.
Agents are prompted with the card for their stage. Only what the courses teach
is here; nothing is invented to fill a gap.

Core principle (MM2): *sell the problem you solve, not the product you make.*
Value is what the customer gets relative to what they give up.

---

## Stage 1 - Situation analysis (MM2)
Scan the environment, examine potential customers, competitors and
collaborators. The output is a list of **value gaps**: needs not met, or not
met well. Every gap must name who has it, the evidence, and who serves it today.
Output: `value_gaps[]` with `{gap, who_has_it, evidence, served_today_by, why_underserved}`.

## Stage 2 - Market sizing: TAM / SAM / SOM (MST)
- **TAM**: total demand if there were no competition.
- **SAM**: TAM after geography and product-fit filters. `SAM = TAM × geo% × segment%`.
- **SOM**: share of SAM capturable in 12-36 months. `SOM = SAM × capture_rate`.
  New entrants assume a conservative **2-3 %** capture rate.
- Worked example: $15B × 30 % × 10 % = $450M SAM; 3 % capture → $13.5M SOM.
- Document a **Data Source** and an **Assumptions** table; cite sources.
- Pitfalls: confusing TAM with SAM, inflating TAM, treating SOM as a long-term goal.

## Stage 3 - Target market selection (PMF)
Score each candidate market with the template:
1. What is the problem?
2. Where do you see it / what is the market?
3. How big is the problem (1-10)?
4. Would our offering be compelling (Y/N)?
5. Is there evidence people will and can pay?
6. Is the segment big enough?

The right target market has a **high-priority need, willingness to pay, and
meaningful size**. Pick one or two, then sub-segment (Twilio split "developers"
into hackers, entrepreneurs, corporates, guns-for-hire). Describe it:
- B2B: industry, geography, size, status/structure, performance.
- B2C: demographic, behavioural, psychographic, geographic.
Give the market a name (Capway: "the underserved market in banking").

## Stage 4 - Product-market fit: Feature-Benefit Matrix (MST)
Columns: **Pain point** (with evidence) → **Feature** → **Benefit** (apply the
"So what?" test) → **Value** (quantified: time saved, cost reduced, revenue
gained). Pitfalls: thinking in features; assuming pains without evidence.

## Stage 5 - Audience: personas, buying roles, ICP, segmentation (PMF, MST)
- **Persona page 1**: name, title, prose covering demographics, goals and
  challenges, values and fears, how they learn and buy.
- **Persona page 2**: key touchpoints, key motivations, "tidbits".
- Ground personas in data (CRM attributes, behavioural signals, interviews,
  competitor research, surveys), never aspiration.
- **Buying roles**: decision maker, approver, recommender, influencer, "sniper"
  (PMF); end-user / influencer / decision-maker each get a different message (MST).
- **ICP**: the company type with the fastest buying process and best retention.
  Research your best customers, find what they share, write the definition.
- **Segmentation** (MST): layer demographic + firmographic (incl. tech stack) +
  geographic + behavioural/intent. Example: persona + firmographic + geography
  + "visited the pricing page in the last 30 days". Specific enough to be
  relevant, large enough to matter.

## Stage 6 - Value proposition and positioning (MST, MM2)
- Lead with benefits, not features. Four benefit types: **Functional,
  Emotional, Economic, Social**.
- **Problem-Solution-Outcome** statement, 25-50 words: specific, in the
  customer's language, outcome quantified ("weeks to minutes"), no jargon.
- Positioning = **frame of reference** (category you compete in) + **point of
  difference**. The positioning stays fixed; the message adapts per platform.
- A product is "a bundle of benefits, not a collection of attributes" (MM2).

## Stage 7 - Go-to-market motion (PMF)
Classify: B2B, B2C, B2G, B2P, B2D, or platform (platforms need two demand
plans: producers and consumers). Then place on the 2×2
(ease of seeing value for the price × ease of buying and getting started):
- easy / easy → **marketing-led**
- hard value / easy start → **sales-led**
- hard / hard → **sales + customer success**
- easy value / hard start → **marketing-led + customer success**
- plus **product-led growth (PLG)** where a self-serve product carries the motion.

## Stage 8 - Objectives: OKRs → SMART goals → KPIs (MST, PMF)
Cascade: corporate objective → corporate key result → marketing objective →
marketing key result → campaign KPIs (conversion rate, cost per lead, MQL→SQL).
Objectives are qualitative ("what"); key results are quantitative outcomes
("how"), never tasks. GTM goals must be **SMART**.
Alignment audit: `Corporate KR | Campaign initiative | Campaign KPI |
Alignment (Strong/Partial/Weak/Conflicting) | Recommendation`.

## Stage 9 - Demand math (PMF)
Sales & marketing **waterfall**, worked backwards from the revenue goal:
Revenue → Closed-won → Opportunities → SQL → SAL → MQL → Raw leads → Visitors,
with a conversion rate at each step. PLG version: Visitors → Signup/Trial → PQL
→ Customer. Rule: **LTV must exceed CAC**. Planning model: Audience →
Objectives → Strategy → Tactics (inbound + outbound) → Measurement.

## Stage 10 - Buyer's journey (PMF, MM2)
Stages: **Awareness / Consideration / Action**, extended by **Activate →
Retain → Referral**. For each stage record: persona, needs and questions,
messages, content, vehicles. Hierarchy of effects: Unaware → Awareness →
Knowledge → Liking → Preference → Conviction → Purchase. Information processing
needs consistency, frequency and pertinence; use multiple channels because
audiences learn differently.

## Stage 11 - Marketing mix (MM2)
**Product**: Levitt's 5 levels (core benefit → basic → expected → augmented,
where differentiation happens → potential); classification (convenience,
shopping, specialty, unsought); product mix breadth/length/depth; life-cycle
stage (introduction, growth, maturity, decline). Services add People, Process,
Physical environment.
**Place**: research customer needs, channel capabilities and cost, channel
power, competition. Push vs. pull. Channel design: direct vs. indirect; length;
breadth (intensive / selective / exclusive) matched to product classification.
**Price**: (1) price objective → (2) demand and elasticity → (3) cost = price
floor → (4) competitors → (5) method (cost-plus, value-based, sealed bid) →
(6) final price. Skimming vs. penetration. True economic value (TEV) = cost of
next-best alternative + value of relative advantage; perceived value ≤ TEV.
Firm incentive = price − COGS; customer incentive = perceived value − price.
Psychology: reference prices, price-quality inference, 9-endings, signposts.
**Promotion**: communications mix = advertising (paid), sales promotion, PR
(earned), personal selling, direct marketing. Advertising and PR → recognition
and search; personal selling → evaluation; selling, sales promotion and direct
marketing → close. For low-involvement products behaviour precedes attitude.

## Stage 12 - Communications plan (MM2)
The **6 M's**: Market, Mission, Message, Media, Money, Measurement.
Integrated Marketing Communications: one positioning across every medium.
Measurement principles: measure what matters, relative to purpose, full impact.

## Stage 13 - GTM plan (MST)
Six pillars: **Objectives (SMART), Target segments, Value proposition, Channel
strategy, Budget, 90-day timeline** (pre-launch → launch → post-launch
optimisation, with milestones and dependencies). Chain: objective → audience →
value proposition → channels → budget → timeline; budget follows strategy.
Scenarios: product launch / MVP, market expansion, campaign initiative.

## Stage 14 - Review (MST, GAI)
Three lenses: **resource alignment** (do resources match the plan?),
**strategic alignment** (does the strategy fit product and audience?),
**metric feasibility** (are the metrics realistic? a 5 % LinkedIn conversion
assumption should be modelled at 1-2.5 %). Common fix: pivot from a big-bang
launch to a phased PLG pilot. Use tree-of-thought: explore three alternatives,
evaluate, converge on one plan with short / medium / long-term actions.

## Stage 15 - Execute and measure (MM2, MST, PMF)
- **ADPLANE** ad scoring, 1-7 each: Attention, Distinction, Positioning,
  Linkage, Amplification, Net equity, Emotion.
- **A/B tests**: one variable at a time; awareness → open rate, consideration
  → click-through rate, decision → conversion rate; 95 % confidence (90 % low
  stakes, 99 % high stakes). `lift = (variant − control) / control × 100`.
  Result summary: which won, by how much, what it means, what next.
- Funnel metrics: open rate = opens/sent; CTR = clicks/sent; conversion =
  conversions/clicks; revenue = conversions × average sale value.
- `CPM = cost / (impressions / 1000)` ($185k / 10M impressions = $18.50).
- Demand system: one shared lead definition, lead scoring (demographic +
  behavioural points vs. threshold), nurturing, attribution (first/last touch;
  U, W, Z multi-touch; crawl-walk-run), a tech stack that attracts / engages /
  analyses without overbuying.

---

## Prompt patterns (GAI)
Every stage prompt uses: **persona** ("as a product marketer…"), the four
building blocks (**instruction, context, input data, output indicator**),
**few-shot** examples (format matters more than content), **chain-of-thought**
for the maths ("think step by step"), **tree-of-thought** for the review, and
a **JSON schema** as the output indicator. Intake uses the **interview
pattern**: ask for missing fields one at a time. Image prompts use style
modifiers, quality boosters and negative prompts.

## Company inputs the methodology needs
Identity (name, description, stage, business type B2B/B2C/B2G/B2P/B2D/platform);
product (name, description, goods vs. service, features, life-cycle stage);
problem (problem solved, evidence, priority, willingness to pay); market
(industry, geography, TAM source, assumptions); audience (known segments, best
customers, buying roles); competition (competitors, prices, next-best
alternative); value (differentiators, quantified outcomes); motion (ease of
seeing value, ease of starting, sales team, channels); pricing (COGS, price,
objective, tier); goals (revenue target, OKRs, scenario, horizon); resources
(budget, team, tech stack); data (conversion rates, ASP, CAC, LTV).

---

## Influencer outreach (B2B sales)
Source: **B2B** = B2B Sales course (`knowledge_base/b2b-sales_transcripts.txt`), module
"Influencer marketing to boost B2B sales" plus its cold-outreach modules.

**Qualify before you write.** Three must-haves - "if one of them is not present you
probably do not want to hire": (1) really well targeted to your audience, (2) a
significant volume of traffic, (3) significant engagement. "The size of the audience
is not the deciding factor. It's the level of engagement and the narrowness of the
targeting." Red flags: ~12 likes per post on 37k followers "looks really fake"; many
posts with uniformly low engagement; unfocused / general-entertainment content;
irregular posting; comments that look solicited; boosted posts that make everything
look engaged. Green flags: a consistent niche; steady likes AND comments across
recent posts (example: ~1,000 likes and 23 comments on a ~20k account ≈ 5 %);
existing legitimate sponsors; contact details listed; organic posting. Tiers: mega 1M+,
macro 500k-1M, mid-tier, micro 10-50k (fake risk rises), nano <10k (cheap; check how
deeply they focus on a niche). Trial before paying up front (a 5,000-member group
produced zero sales); compare the post price with what the same reach costs in ads.

**Research first, then warm up.** "Show, don't tell - research the business before
you approach them." Follow them, "comment intelligently" on their posts, let them
recognise you, then make the ask. Reference something specific and recent: "if they
just tweeted something today, you may bring that up."

**The message.** "Very brief, extremely clear and to the point." Their real name
("Nobody wants hi or dear"); a specific, non-generic compliment; one sentence on what
you are promoting and why it fits THEIR audience; ask exactly ONE easy question so the
answer is yes or no: "Are you open to creating a social media post or video to help me
promote it? I'm willing to pay." Subject line: "I'd like to hire you as an influencer"
(short enough for a phone screen). No "let's connect and explore ways we might
benefit" (that "offers to waste their time"), no vague promises, no 15-minute-call ask
in the first touch, no links or hype. If they say no, leave them alone.

**After a yes.** Email 2: "My budget is [X] - what can you do with that? ... How much
traffic do you think you can send, and how soon?" Email 3: "Do you have examples and
results of previous promotions?" Keep emails short and easy to answer; aim for a
win-win, don't over-negotiate. Compensation options: pay-per-post (preferred by
creators), discounted trial then long-term, revenue share / affiliate links with
tracking, pay per traffic or engagement, gifting / giveaways - match the model to the
goal. Disclose the relationship ("#sponsored", FTC rules); the brand is responsible too.

**Follow-up cadence.** Same-thread nudge after 3-7 days ("I just wanted to make sure
you got my previous email"), then a week later, then switch channel (email → DM on
another platform; never SMS - "too intrusive"); next day → 3 days → 7 days → a month,
up to six touch points, then stop. Track every contact and date in one sheet.

**Personal vs spam (checklist for every DM).** Personal: correct name, niche-specific
relevance, evidence you looked at their work (a named recent post), something useful
or a demo, one easy question, clear and direct. Spam: no name, templated "ultimate
solution", irrelevant claims, too long, vague "maximum results", generic compliments,
asking for time with no purpose, bombarding one channel.
