export interface StageMeta { number: number; key: string; title: string; agent: "research" | "strategy" | "planning" | "review" }

export const STAGES: StageMeta[] = [
  { number: 1, key: "situation_analysis", title: "Situation analysis", agent: "research" },
  { number: 2, key: "market_sizing", title: "Market sizing (TAM / SAM / SOM)", agent: "research" },
  { number: 3, key: "target_market", title: "Target market selection", agent: "research" },
  { number: 4, key: "feature_benefit", title: "Feature-Benefit Matrix", agent: "strategy" },
  { number: 5, key: "audience", title: "Personas, ICP & segments", agent: "strategy" },
  { number: 6, key: "positioning", title: "Value proposition & positioning", agent: "strategy" },
  { number: 7, key: "gtm_motion", title: "Go-to-market motion", agent: "strategy" },
  { number: 8, key: "objectives", title: "OKRs, SMART goals & KPIs", agent: "planning" },
  { number: 9, key: "demand_math", title: "Demand math (waterfall, LTV > CAC)", agent: "planning" },
  { number: 10, key: "buyer_journey", title: "Buyer's journey", agent: "planning" },
  { number: 11, key: "marketing_mix", title: "Marketing mix (4 Ps)", agent: "planning" },
  { number: 12, key: "comms_plan", title: "Communications plan (6 M's)", agent: "planning" },
  { number: 13, key: "gtm_plan", title: "GTM plan & 90-day timeline", agent: "planning" },
  { number: 14, key: "review", title: "Review, recommendations & execution plan", agent: "review" },
];

export const stageByKey = (key: string) => STAGES.find((s) => s.key === key);
