"use client";

import { api } from "./api";
import { useAsync, useCompany, useDeliverables, useRuns, useStages, useTasks } from "./hooks";
import { stageOutput } from "./outputs";
import type { GtmPlan } from "./projection";
import type { CommsPlan, DemandMath, Review } from "./types";

/** Everything the v2 screens read: latest company, its latest run, stages, tasks, deliverables, events. */
export function usePlan() {
  const c = useCompany();
  const company = c.company;
  const runs = useRuns(company?.id, !!company);
  const run = runs.data?.[0] ?? null;
  const runId = run?.id;
  const stages = useStages(runId);
  const tasks = useTasks({ company_id: company?.id }, !!company);
  const deliverables = useDeliverables(company?.id, !!company);
  const events = useAsync(() => api.runs.events(runId!, 0), [runId], !!runId);
  const s = stages.data ?? [];
  return {
    company, run, runId,
    stages: s, tasks: tasks.data ?? [], deliverables: deliverables.data ?? [], events: events.data ?? [],
    demand: stageOutput<DemandMath>(s, "demand_math"),
    plan: stageOutput<GtmPlan>(s, "gtm_plan"),
    comms: stageOutput<CommsPlan>(s, "comms_plan"),
    review: stageOutput<Review>(s, "review"),
    loading: c.loading || runs.loading || (!!runId && stages.loading),
    error: c.error ?? runs.error ?? stages.error ?? tasks.error ?? deliverables.error,
    reload: () => { c.reload(); runs.reload(); stages.reload(); tasks.reload(); deliverables.reload(); events.reload(); },
    reloadTasks: tasks.reload,
    reloadEvents: events.reload,
    setCompany: c.setData,
  };
}
