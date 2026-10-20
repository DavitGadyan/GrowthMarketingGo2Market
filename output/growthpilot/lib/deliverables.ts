import type { LucideIcon } from "lucide-react";
import { Globe, Users, Crosshair, Tag, CalendarRange, PenLine, Image } from "lucide-react";
import type { DeliverableKind, StageResult, Task } from "./types";

export type DeliverableCategory = "Research" | "Strategy" | "Execution";

export interface DeliverableTemplate {
  kind: DeliverableKind;
  title: string;
  category: DeliverableCategory;
  icon: LucideIcon;
  description: string;
  stages: string[];
  agents: string[];
  minutes: number;
  sections: number;
  taskActions: string[];
}

export const DELIVERABLE_TEMPLATES: DeliverableTemplate[] = [
  { kind: "market_research", title: "Market Research", category: "Research", icon: Globe, description: "Situation analysis, value gaps, TAM/SAM/SOM with sources, and the scored target-market choice.", stages: ["situation_analysis", "market_sizing", "target_market"], agents: ["research"], minutes: 8, sections: 6, taskActions: [] },
  { kind: "personas_icp", title: "Personas & ICP", category: "Strategy", icon: Users, description: "Two-page personas grounded in data, buying roles, the ideal customer profile and layered segments.", stages: ["feature_benefit", "audience"], agents: ["strategy"], minutes: 5, sections: 5, taskActions: [] },
  { kind: "positioning_brief", title: "Positioning Brief", category: "Strategy", icon: Crosshair, description: "Benefits by type, the Problem-Solution-Outcome statement, frame of reference, point of difference and motion.", stages: ["positioning", "gtm_motion"], agents: ["strategy"], minutes: 4, sections: 5, taskActions: [] },
  { kind: "pricing_analysis", title: "Pricing Analysis", category: "Strategy", icon: Tag, description: "Six-step pricing: objective, demand, cost floor, competitors, method, final price, with true economic value.", stages: ["marketing_mix"], agents: ["planning"], minutes: 4, sections: 6, taskActions: [] },
  { kind: "gtm_plan", title: "GTM Plan + 90-day timeline", category: "Strategy", icon: CalendarRange, description: "OKRs, demand waterfall, buyer's journey, 6 M's, six pillars, the 90-day timeline and the three-lens review.", stages: ["objectives", "demand_math", "buyer_journey", "comms_plan", "gtm_plan", "review"], agents: ["planning", "review"], minutes: 12, sections: 9, taskActions: [] },
  { kind: "content_pack", title: "Content Pack", category: "Execution", icon: PenLine, description: "Ad, landing-page, email and social copy in A/B variants, each scored on ADPLANE, with test designs.", stages: [], agents: ["content"], minutes: 6, sections: 4, taskActions: ["write_ad_copy", "write_landing_page", "write_email_sequence", "write_social_posts", "design_ab_test"] },
  { kind: "ad_creatives", title: "Ad Creatives", category: "Execution", icon: Image, description: "Image and video creatives generated through Higgsfield from art-directed prompts, after you approve the quote.", stages: [], agents: ["creative"], minutes: 10, sections: 3, taskActions: ["generate_ad_images", "generate_ad_video", "render_ad_images"] },
];

export function coverage(t: DeliverableTemplate, stages: StageResult[], tasks: Task[]): number {
  if (t.stages.length) {
    const done = t.stages.filter((k) => stages.find((s) => s.key === k)?.status === "completed").length;
    return Math.round((done / t.stages.length) * 100);
  }
  const mine = tasks.filter((x) => t.taskActions.includes(x.action));
  if (!mine.length) return 0;
  return Math.round((mine.filter((x) => x.status === "done").length / mine.length) * 100);
}

export const templateByKind = (kind: string) => DELIVERABLE_TEMPLATES.find((t) => t.kind === kind);
