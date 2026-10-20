import type {
  ChatMessage, Company, CompanyProfile, Dashboard, Deliverable, Event, InfluencerResearchIn, InfluencerResearchOut, Insight, Integration, Run, StageResult, Task,
} from "./types";

export const API_BASE = (process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000/api").replace(/\/$/, "");

export class ApiError extends Error {
  status: number;
  body: unknown;
  constructor(status: number, message: string, body?: unknown) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.body = body;
  }
}

export const UNREACHABLE = `Cannot reach the GrowthPilot API at ${API_BASE}. Start the backend (make dev) and retry.`;

async function doFetch(path: string, init: RequestInit = {}): Promise<Response> {
  let res: Response;
  try {
    res = await fetch(`${API_BASE}${path}`, {
      ...init,
      headers: { Accept: "application/json", ...(init.body ? { "Content-Type": "application/json" } : {}), ...(init.headers ?? {}) },
      cache: "no-store",
    });
  } catch {
    throw new ApiError(0, UNREACHABLE);
  }
  if (!res.ok) {
    let body: unknown = null;
    let msg = `${res.status} ${res.statusText}`;
    try {
      body = await res.json();
      const detail = (body as { detail?: unknown })?.detail;
      if (typeof detail === "string") msg = detail;
      else if (detail) msg = JSON.stringify(detail);
    } catch {
      /* non-JSON error body */
    }
    throw new ApiError(res.status, msg, body);
  }
  return res;
}

async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
  const res = await doFetch(path, init);
  if (res.status === 204) return undefined as T;
  return (await res.json()) as T;
}

const qs = (params: Record<string, string | number | undefined | null>) => {
  const p = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) if (v !== undefined && v !== null && v !== "") p.set(k, String(v));
  const s = p.toString();
  return s ? `?${s}` : "";
};

export interface Health { ok: boolean; fake_agents: boolean; anthropic_connected: boolean; [k: string]: unknown }

export const api = {
  health: () => request<Health>("/health"),

  companies: {
    list: () => request<Company[]>("/companies"),
    get: (id: number) => request<Company>(`/companies/${id}`),
    create: (profile: CompanyProfile) => request<Company>("/companies", { method: "POST", body: JSON.stringify(profile) }),
    update: (id: number, profile: CompanyProfile) =>
      request<Company>(`/companies/${id}`, { method: "PUT", body: JSON.stringify(profile) }),
  },

  runs: {
    create: (companyId: number) => request<Run>(`/companies/${companyId}/runs`, { method: "POST" }),
    list: (companyId?: number) => request<Run[]>(`/runs${qs({ company_id: companyId })}`),
    get: (id: number) => request<Run>(`/runs/${id}`),
    stages: (id: number) => request<StageResult[]>(`/runs/${id}/stages`),
    events: (id: number, afterId = 0) => request<Event[]>(`/runs/${id}/events${qs({ after_id: afterId })}`),
    insights: (id: number) => request<Insight[]>(`/runs/${id}/insights`),
    cancel: (id: number) => request<Run>(`/runs/${id}/cancel`, { method: "POST" }),
    streamUrl: (id: number) => `${API_BASE}/runs/${id}/events/stream`,
  },

  tasks: {
    list: (params: { company_id?: number; run_id?: number; status?: string } = {}) =>
      request<Task[]>(`/tasks${qs(params)}`),
    approve: (id: number) => request<Task>(`/tasks/${id}/approve`, { method: "POST" }),
    reject: (id: number) => request<Task>(`/tasks/${id}/reject`, { method: "POST" }),
  },

  deliverables: {
    list: (companyId?: number) => request<Deliverable[]>(`/deliverables${qs({ company_id: companyId })}`),
    get: (id: number) => request<Deliverable>(`/deliverables/${id}`),
    exportUrl: (id: number, fmt: "md" | "html") => `${API_BASE}/deliverables/${id}/export?fmt=${fmt}`,
  },

  integrations: {
    list: () => request<Integration[]>("/integrations"),
    update: (name: string, config: Record<string, unknown>) =>
      request<Integration>(`/integrations/${name}`, { method: "PUT", body: JSON.stringify({ config }) }),
  },

  chat: {
    history: (companyId: number) => request<ChatMessage[]>(`/chat${qs({ company_id: companyId })}`),
    /** Returns the raw streaming Response; parse with parseSseStream. */
    send: (companyId: number, message: string) =>
      doFetch("/chat", {
        method: "POST",
        body: JSON.stringify({ company_id: companyId, message }),
        headers: { Accept: "text/event-stream" },
      }),
  },

  dashboard: (companyId?: number) => request<Dashboard>(`/dashboard${qs({ company_id: companyId })}`),

  influencers: {
    /** Latest research for a company; the API answers 404 when it has never run. */
    latest: (companyId: number) => request<InfluencerResearchOut>(`/influencers${qs({ company_id: companyId })}`),
    research: (body: InfluencerResearchIn) =>
      request<InfluencerResearchOut>("/influencers/research", { method: "POST", body: JSON.stringify(body) }),
    outreach: (taskId: number, handles: string[]) =>
      request<Task>(`/influencers/${taskId}/outreach`, { method: "POST", body: JSON.stringify({ handles }) }),
  },
};
