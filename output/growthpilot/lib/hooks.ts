"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { api, ApiError } from "./api";
import { openEventSource, parseSseStream } from "./sse";
import type {
  ChatMessage, Company, Dashboard, Deliverable, Event, Insight, Integration, Run, StageResult, StreamEnvelope, Task,
} from "./types";

export interface Async<T> {
  data: T | null;
  error: ApiError | null;
  loading: boolean;
  reload: () => void;
  setData: (d: T | null | ((prev: T | null) => T | null)) => void;
}

function toApiError(e: unknown): ApiError {
  if (e instanceof ApiError) return e;
  return new ApiError(0, e instanceof Error ? e.message : String(e));
}

export function useAsync<T>(fn: () => Promise<T>, deps: unknown[], enabled = true): Async<T> {
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState<ApiError | null>(null);
  const [loading, setLoading] = useState(enabled);
  const [tick, setTick] = useState(0);
  const fnRef = useRef(fn);
  fnRef.current = fn;

  useEffect(() => {
    if (!enabled) {
      setLoading(false);
      return;
    }
    let alive = true;
    setLoading(true);
    fnRef
      .current()
      .then((d) => {
        if (!alive) return;
        setData(d);
        setError(null);
      })
      .catch((e) => {
        if (!alive) return;
        setError(toApiError(e));
      })
      .finally(() => {
        if (alive) setLoading(false);
      });
    return () => {
      alive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [...deps, tick, enabled]);

  const reload = useCallback(() => setTick((t) => t + 1), []);
  return { data, error, loading, reload, setData };
}

export const latestOf = <T extends { created_at: string }>(items: T[] | null | undefined): T | null =>
  items && items.length ? [...items].sort((a, b) => b.created_at.localeCompare(a.created_at))[0] : null;

export function useHealth() {
  return useAsync(() => api.health(), []);
}

export function useCompanies() {
  return useAsync(() => api.companies.list(), []);
}

/** The most recently created company - v1 is single-workspace. */
export function useCompany(): Async<Company[]> & { company: Company | null } {
  const r = useCompanies();
  return { ...r, company: latestOf(r.data) };
}

export function useDashboard(companyId?: number) {
  return useAsync(() => api.dashboard(companyId), [companyId]);
}

export function useRuns(companyId?: number, enabled = true) {
  return useAsync(() => api.runs.list(companyId), [companyId], enabled);
}

export function useRun(runId?: number) {
  return useAsync(() => api.runs.get(runId!), [runId], !!runId);
}

export function useStages(runId?: number) {
  return useAsync(() => api.runs.stages(runId!), [runId], !!runId);
}

export function useTasks(params: { company_id?: number; run_id?: number; status?: string } = {}, enabled = true) {
  return useAsync(() => api.tasks.list(params), [params.company_id, params.run_id, params.status], enabled);
}

export function useDeliverables(companyId?: number, enabled = true) {
  return useAsync(() => api.deliverables.list(companyId), [companyId], enabled);
}

export function useIntegrations() {
  return useAsync(() => api.integrations.list(), []);
}

/** Live view of one run: stages, events and insights, kept current by the SSE stream. */
export function useRunStream(runId?: number) {
  const [run, setRun] = useState<Run | null>(null);
  const [stages, setStages] = useState<StageResult[]>([]);
  const [events, setEvents] = useState<Event[]>([]);
  const [insights, setInsights] = useState<Insight[]>([]);
  const [tasks, setTasks] = useState<Task[]>([]);
  const [error, setError] = useState<ApiError | null>(null);
  const [connected, setConnected] = useState(false);
  const [loading, setLoading] = useState(!!runId);

  const apply = useCallback((env: StreamEnvelope) => {
    switch (env.type) {
      case "event":
        setEvents((prev) => (prev.some((e) => e.id === env.data.id) ? prev : [...prev, env.data].slice(-200)));
        break;
      case "insight":
        setInsights((prev) => (prev.some((i) => i.id === env.data.id) ? prev : [env.data, ...prev]));
        break;
      case "stage":
        setStages((prev) => {
          const i = prev.findIndex((s) => s.id === env.data.id || s.key === env.data.key);
          if (i === -1) return [...prev, env.data].sort((a, b) => a.number - b.number);
          const next = [...prev];
          next[i] = env.data;
          return next;
        });
        break;
      case "run":
        setRun(env.data);
        break;
      case "task":
        setTasks((prev) => {
          const i = prev.findIndex((t) => t.id === env.data.id);
          if (i === -1) return [...prev, env.data];
          const next = [...prev];
          next[i] = env.data;
          return next;
        });
        break;
      case "done":
        setConnected(false);
        break;
      default:
        break;
    }
  }, []);

  useEffect(() => {
    setRun(null); setStages([]); setEvents([]); setInsights([]); setTasks([]); setError(null); setConnected(false);
    if (!runId) {
      setLoading(false);
      return;
    }
    let alive = true;
    setLoading(true);
    Promise.all([api.runs.get(runId), api.runs.stages(runId), api.runs.insights(runId), api.runs.events(runId, 0)])
      .then(([r, s, i, e]) => {
        if (!alive) return;
        setRun(r); setStages(s); setInsights(i); setEvents(e.slice(-200));
        lastEventId = Math.max(lastEventId, ...e.map((x) => x.id), 0);
      })
      .catch((e) => alive && setError(toApiError(e)))
      .finally(() => alive && setLoading(false));

    // After the stream ends (the run is terminal) task execution still
    // produces events and task updates, so fall back to a slow poll.
    let lastEventId = 0;
    let poll: ReturnType<typeof setInterval> | null = null;
    const startPolling = () => {
      if (poll) return;
      poll = setInterval(() => {
        if (!alive) return;
        void Promise.all([api.runs.events(runId, lastEventId), api.tasks.list({ run_id: runId })])
          .then(([evs, ts]) => {
            if (!alive) return;
            for (const e of evs) apply({ type: "event", data: e });
            for (const t of ts) apply({ type: "task", data: t });
          })
          .catch(() => {});
      }, 6000);
    };
    const close = openEventSource(
      api.runs.streamUrl(runId),
      (env) => {
        if (!alive) return;
        if (env.type === "event") lastEventId = Math.max(lastEventId, env.data.id);
        setConnected(env.type !== "done");
        apply(env);
        if (env.type === "done") startPolling();
      },
      () => {
        if (!alive) return;
        setConnected(false);
        startPolling();
      },
    );
    return () => {
      alive = false;
      close();
      if (poll) clearInterval(poll);
    };
  }, [runId, apply]);

  return { run, stages, events, insights, tasks, error, connected, loading, apply };
}

export function useChat(companyId?: number) {
  const history = useAsync(() => api.chat.history(companyId!), [companyId], !!companyId);
  const [local, setLocal] = useState<ChatMessage[]>([]);
  const [pending, setPending] = useState<string | null>(null);
  const [streaming, setStreaming] = useState(false);
  const [sendError, setSendError] = useState<ApiError | null>(null);
  const [sideEffects, setSideEffects] = useState<{ tasks: Task[]; insights: Insight[] }>({ tasks: [], insights: [] });

  useEffect(() => {
    setLocal([]); setPending(null); setSendError(null); setSideEffects({ tasks: [], insights: [] });
  }, [companyId]);

  const send = useCallback(
    async (text: string) => {
      if (!companyId || !text.trim() || streaming) return;
      setSendError(null);
      const now = new Date().toISOString();
      setLocal((m) => [...m, { id: -Date.now(), company_id: companyId, role: "user", content: text, ts: now, meta: {} }]);
      setStreaming(true);
      setPending("");
      let finalMsg: ChatMessage | null = null;
      let acc = "";
      try {
        const res = await api.chat.send(companyId, text);
        if (!res.body) throw new ApiError(0, "Empty response body");
        for await (const env of parseSseStream(res.body)) {
          if (env.type === "token") {
            acc += env.data.text;
            setPending(acc);
          } else if (env.type === "message") {
            finalMsg = env.data;
          } else if (env.type === "task") {
            setSideEffects((s) => ({ ...s, tasks: [...s.tasks.filter((t) => t.id !== env.data.id), env.data] }));
          } else if (env.type === "insight") {
            setSideEffects((s) => ({ ...s, insights: [env.data, ...s.insights] }));
          }
        }
        if (!finalMsg && acc) {
          finalMsg = { id: -Date.now() - 1, company_id: companyId, role: "agent", content: acc, ts: new Date().toISOString(), meta: {} };
        }
        if (finalMsg) setLocal((m) => [...m, finalMsg!]);
      } catch (e) {
        setSendError(toApiError(e));
      } finally {
        setPending(null);
        setStreaming(false);
      }
    },
    [companyId, streaming],
  );

  const messages = [...(history.data ?? []), ...local];
  return { messages, pending, streaming, send, sendError, loading: history.loading, error: history.error, reload: history.reload, sideEffects };
}

export type { Company, Dashboard, Deliverable, Event, Insight, Integration, Run, StageResult, Task };

/* ---- Influencer research: latest result + 3 s polling while it runs ---- */
import type { InfluencerResearchIn, InfluencerResearchOut } from "./types";

const INFLUENCER_LIVE = new Set(["proposed", "approved", "running"]);

export function useInfluencers(companyId?: number) {
  const [data, setData] = useState<InfluencerResearchOut | null>(null);
  const [error, setError] = useState<ApiError | null>(null);
  const [loading, setLoading] = useState(!!companyId);
  const [notRun, setNotRun] = useState(false);
  const [tick, setTick] = useState(0);
  const reload = useCallback(() => setTick((t) => t + 1), []);

  useEffect(() => {
    if (!companyId) { setLoading(false); return; }
    let alive = true;
    setLoading(true);
    api.influencers.latest(companyId)
      .then((d) => { if (!alive) return; setData(d); setNotRun(false); setError(null); })
      .catch((e) => {
        if (!alive) return;
        const err = toApiError(e);
        if (err.status === 404) { setNotRun(true); setData(null); setError(null); } else setError(err);
      })
      .finally(() => { if (alive) setLoading(false); });
    return () => { alive = false; };
  }, [companyId, tick]);

  const status = data?.status;
  useEffect(() => {
    if (!companyId || !status || !INFLUENCER_LIVE.has(status)) return;
    const id = setInterval(() => { api.influencers.latest(companyId).then(setData).catch(() => {}); }, 3000);
    return () => clearInterval(id);
  }, [companyId, status]);

  const start = useCallback(async (body: InfluencerResearchIn) => {
    const d = await api.influencers.research(body);
    setData(d); setNotRun(false); setError(null);
    return d;
  }, []);

  return { data, error, loading, notRun, reload, start, setData, running: !!status && INFLUENCER_LIVE.has(status) };
}
