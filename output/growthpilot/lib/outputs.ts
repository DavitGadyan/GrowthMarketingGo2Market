import type { StageResult } from "./types";

/** Typed access to a completed stage's output. */
export function stageOutput<T>(stages: StageResult[] | null | undefined, key: string): T | undefined {
  const s = stages?.find((x) => x.key === key && x.status === "completed" && x.output);
  return s ? (s.output as unknown as T) : undefined;
}
