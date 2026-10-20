import type { LucideIcon } from "lucide-react";
import { Search, Compass, CalendarRange, ShieldCheck, PenLine, Mail, Image } from "lucide-react";
import type { Event, Run, Task } from "./types";

export interface AgentMeta {
  key: "research" | "strategy" | "planning" | "review" | "content" | "outreach" | "creative";
  name: string;
  icon: LucideIcon;
  model: string;
  tools: string[];
  stages: number[];
  blurb: string;
}

export const AGENTS: AgentMeta[] = [
  { key: "research", name: "Research Agent", icon: Search, model: "claude-opus-5-5", tools: ["WebSearch", "WebFetch", "Firecrawl"], stages: [1, 2, 3], blurb: "Situation analysis, TAM/SAM/SOM and target-market scoring, every claim cited." },
  { key: "strategy", name: "Strategy Agent", icon: Compass, model: "claude-opus-5-5", tools: ["Calculators"], stages: [4, 5, 6, 7], blurb: "Feature-benefit fit, personas and ICP, positioning, go-to-market motion." },
  { key: "planning", name: "Planning Agent", icon: CalendarRange, model: "claude-opus-5-5", tools: ["Calculators"], stages: [8, 9, 10, 11, 12, 13], blurb: "OKRs, demand waterfall, buyer's journey, 4 Ps, 6 M's and the 90-day plan." },
  { key: "review", name: "Review Agent", icon: ShieldCheck, model: "claude-opus-5-5", tools: ["Three-lens critique"], stages: [14], blurb: "Resource, strategic and metric feasibility; proposes the execution tasks you approve." },
  { key: "content", name: "Content Agent", icon: PenLine, model: "claude-sonnet-5-5", tools: ["ADPLANE scorer"], stages: [], blurb: "Ad, landing-page, email and social copy with A/B variants, scored on ADPLANE." },
  { key: "outreach", name: "Outreach Agent", icon: Mail, model: "claude-sonnet-5-5", tools: ["Gmail drafts"], stages: [], blurb: "Writes outreach sequences as Gmail drafts. Nothing is sent without you." },
  { key: "creative", name: "Creative Agent", icon: Image, model: "claude-sonnet-5-5", tools: ["Higgsfield"], stages: [], blurb: "Image and video ad creatives. Quotes credits and waits for approval first." },
];

export type AgentStatus = "working" | "idle" | "connected";

export function agentStatus(agent: AgentMeta, run: Run | null, tasks: Task[]): AgentStatus {
  if (run?.status === "running" && agent.stages.includes(run.current_stage)) return "working";
  if (tasks.some((t) => t.agent === agent.key && t.status === "running")) return "working";
  return run ? "connected" : "idle";
}

export function lastActivity(agent: AgentMeta, events: Event[]): Event | null {
  // Events name the agent as "research agent" (orchestrator) or "research"; match either.
  const norm = (a: string) => a.toLowerCase().replace(/\s*agent$/, "").trim();
  for (let i = events.length - 1; i >= 0; i--) if (norm(events[i].agent) === agent.key) return events[i];
  return null;
}

export const agentByKey = (key: string) => AGENTS.find((a) => a.key === key);
