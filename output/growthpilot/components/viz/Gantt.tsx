"use client";

import { useEffect, useRef, useState, type KeyboardEvent, type ReactNode } from "react";
import type { LucideIcon } from "lucide-react";
import { MessageSquare } from "lucide-react";
import { useReducedMotion } from "@/lib/usePresence";
import { Avatar } from "./Avatar";
import { MonthRing } from "./MonthRing";
import { V } from "./theme";
import "./growth.css";

export interface GanttRow {
  id: string; title: string; status: "done" | "running" | "proposed" | "blocked" | "planned" | "past";
  icon: LucideIcon; meta?: string; spend?: string; owner: string; start: number; end: number; kind: "milestone" | "task"; href?: string;
  phase?: string; dependsOn?: string; taskId?: number;
}
export interface GanttGroup { title: string; spend?: string; rows: GanttRow[]; addLabel?: string; addHref?: string }

const DOT: Record<GanttRow["status"], string> = { done: V.success, running: V.accent, proposed: V.muted, blocked: V.orange, planned: V.accent2, past: V.success };
const STATUS_LABEL: Record<GanttRow["status"], string> = { done: "Done", running: "Running", proposed: "Proposed", blocked: "Blocked", planned: "Planned", past: "Completed" };

export const GANTT_LEFT = 520;

export interface GanttProps {
  groups: GanttGroup[]; weeks?: number; todayWeek: number; todayProgress?: number; zoom?: number; toolbar?: ReactNode; left?: number;
  /** hovered week (from the chart or a bar) - highlights that column everywhere */
  hotWeek?: number | null; onHotWeek?: (week: number | null) => void;
  /** selected week ring: filled, and the grid scrolls it into the centre */
  selectedWeek?: number | null; onSelectWeek?: (week: number) => void;
  /** inline detail row under a milestone */
  expandedId?: string | null; onToggleRow?: (row: GanttRow) => void;
  /** task bars route elsewhere */
  onOpenTask?: (row: GanttRow) => void;
  renderDetail?: (row: GanttRow) => ReactNode;
}

/**
 * Grouped Gantt sharing one time axis with the chart above it: the left
 * column is `left` px wide, the remaining width is split into `weeks` equal
 * columns, so the chart's grid, the week rings and the bars share x positions.
 * Bars show a hover card, the hovered column is banded, rings can be selected.
 */
export function Gantt({ groups, weeks = 13, todayWeek, todayProgress = 0, zoom = 1, toolbar, left = GANTT_LEFT, hotWeek, onHotWeek, selectedWeek, onSelectWeek, expandedId, onToggleRow, onOpenTask, renderDetail }: GanttProps) {
  const ref = useRef<HTMLDivElement>(null);
  const reduce = useReducedMotion();
  const [containerW, setContainerW] = useState(0);
  const [tip, setTip] = useState<{ row: GanttRow; left: number; flip: boolean } | null>(null);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const measure = () => setContainerW(el.clientWidth);
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  // a column never gets narrower than its 40px week ring (+ gutter); narrow screens scroll the grid instead
  const colWidth = Math.max(44, ((containerW || left + weeks * 64) - left) / weeks) * zoom;
  const gridW = weeks * colWidth;
  const grid = { width: gridW, flex: "none" as const };

  // centre the selected week's column in the scroller
  useEffect(() => {
    const el = ref.current;
    if (!el || selectedWeek == null) return;
    // the left column is sticky, so only the grid area (clientWidth - left) shows weeks
    const x = (selectedWeek - 0.5) * colWidth - (el.clientWidth - left) / 2;
    el.scrollTo({ left: Math.max(0, x), behavior: reduce ? "auto" : "smooth" });
  }, [selectedWeek, colWidth, left, reduce]);

  const barGeom = (r: GanttRow) => {
    const l = (r.start - 1) * colWidth + 4;
    const w = Math.max(colWidth - 8, (r.end - r.start + 1) * colWidth - 8);
    return { l, w };
  };
  const showTip = (r: GanttRow) => {
    const { l, w } = barGeom(r);
    const flip = l + w + 280 > gridW;
    setTip({ row: r, left: flip ? Math.max(0, l - 268) : l + w + 10, flip });
    onHotWeek?.(r.start);
  };
  const hideTip = () => { setTip(null); onHotWeek?.(null); };
  const activate = (r: GanttRow) => (r.kind === "task" ? onOpenTask?.(r) : onToggleRow?.(r));
  const onKey = (e: KeyboardEvent, r: GanttRow) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); activate(r); } };

  // narrow left column (mobile): hide the comment-count meta and the spend column so the title keeps its width
  const compact = left < 400;
  const leftCell = "gx-left sticky left-0 z-10";

  const ColBand = () => (hotWeek != null && hotWeek >= 1 && hotWeek <= weeks ? <div className="gx-colband" style={{ left: (hotWeek - 1) * colWidth, width: colWidth }} aria-hidden /> : null);

  return (
    <div ref={ref} className="overflow-x-auto scroll-thin">
      <div style={{ minWidth: left + gridW }}>
        {/* header: toolbar on the left, one ring centred per column on the right */}
        <div className="relative flex h-16 items-center border-b border-black/[0.06]">
          <div className={`${leftCell} flex h-full min-w-0 items-center gap-4 overflow-hidden ${compact ? "px-4" : "px-6"}`} style={{ width: left, flex: "none" }}>{toolbar}</div>
          <div className="relative h-full" style={grid}>
            <GridLines weeks={weeks} colWidth={colWidth} todayWeek={todayWeek} />
            <ColBand />
            {Array.from({ length: weeks }).map((_, i) => {
              const w = i + 1;
              const progress = w < todayWeek ? 100 : w === todayWeek ? todayProgress : 0;
              return (
                <button
                  key={w} type="button"
                  className="absolute top-1/2 -translate-x-1/2 -translate-y-1/2 rounded-full"
                  style={{ left: (i + 0.5) * colWidth }}
                  onClick={() => onSelectWeek?.(w)}
                  onMouseEnter={() => onHotWeek?.(w)} onMouseLeave={() => onHotWeek?.(null)}
                  aria-pressed={selectedWeek === w} aria-label={`Week ${w}${selectedWeek === w ? ", selected" : ""}`}
                >
                  <MonthRing label={`W${w}`} progress={progress} active={w === todayWeek} tone={w < todayWeek ? "accent" : "muted"} selected={selectedWeek === w} hot={hotWeek === w} pulse={w === todayWeek} />
                </button>
              );
            })}
          </div>
        </div>

        {groups.map((g) => {
          const groupSpend = g.rows.some((r) => r.spend) && !compact;
          return (
          <div key={g.title}>
            <div className="relative flex h-14 items-center">
              <div className={`${leftCell} flex h-full items-center gap-4 ${compact ? "px-4" : "px-6"}`} style={{ width: left, flex: "none" }}>
                <span className="text-[16px] font-medium">{g.title}</span>
                {g.spend && <span className="ml-auto text-[15px] font-medium">{g.spend}</span>}
              </div>
              <div className="relative h-full" style={grid}>
                <GridLines weeks={weeks} colWidth={colWidth} todayWeek={todayWeek} />
                <ColBand />
                <div className="absolute top-1/2 h-[3px] rounded-full" style={{ left: 0, width: gridW, background: V.tintAccent2, transform: "translateY(-50%)" }} />
                {g.rows.filter((r) => r.kind === "milestone").map((r) => (
                  <span key={r.id} className="absolute top-1/2 h-3 w-3 -translate-x-1/2 -translate-y-1/2 rotate-45" style={{ left: (r.start - 0.5) * colWidth, background: "#C9BBFF" }} aria-hidden />
                ))}
              </div>
            </div>
            {g.rows.map((r, idx) => {
              const { l, w } = barGeom(r);
              const hot = tip?.row.id === r.id;
              const open = expandedId === r.id;
              return (
                <div key={r.id}>
                  <div className={`gx-row relative flex h-14 items-center border-t border-black/[0.04]`} data-hot={hot || undefined}>
                    <div className={`${leftCell} flex h-full min-w-0 items-center gap-3 ${compact ? "px-4" : "px-6"}`} style={{ width: left, flex: "none" }}>
                      <span className="h-2 w-2 flex-none rounded-full" style={{ background: DOT[r.status] }} aria-label={r.status} />
                      <r.icon size={18} className="flex-none text-muted" aria-hidden />
                      <button type="button" className="min-w-0 truncate text-left text-[15px] hover:text-accent" onClick={() => activate(r)}>{r.title}</button>
                      {r.meta && !compact && <span className="flex flex-none items-center gap-1 text-[12.5px] text-muted-strong"><MessageSquare size={12} /> {r.meta}</span>}
                      <span className="ml-auto flex flex-none items-center gap-4">
                        {groupSpend && <span className="tnum w-24 truncate whitespace-nowrap text-right text-[14px] text-muted-strong" title={r.spend}>{r.spend ?? "—"}</span>}
                        <Avatar name={r.owner} />
                      </span>
                    </div>
                    <div className="relative h-full" style={grid}>
                      <GridLines weeks={weeks} colWidth={colWidth} todayWeek={todayWeek} />
                      <ColBand />
                      <div
                        role="button" tabIndex={0}
                        className="gantt-bar gx-bar absolute top-1/2 h-[14px] -translate-y-1/2 rounded-full"
                        data-hot={hot || undefined}
                        style={{ ["--i" as string]: idx, left: l, width: w, background: r.kind === "task" ? "#A7F3D0" : "#C9BBFF", opacity: r.status === "past" || r.status === "done" ? 1 : 0.8 }}
                        aria-label={`${r.title}, week ${r.start}${r.end !== r.start ? ` to ${r.end}` : ""}, ${STATUS_LABEL[r.status]}`}
                        onMouseEnter={() => showTip(r)} onMouseLeave={hideTip} onFocus={() => showTip(r)} onBlur={hideTip}
                        onClick={() => activate(r)} onKeyDown={(e) => onKey(e, r)}
                      />
                      {hot && tip && (
                        <div className="gx-tip absolute top-[-6px] z-20 w-[260px] rounded-[12px] border border-black/[0.08] bg-white px-4 py-3 text-[13px] shadow-[0_12px_40px_rgba(17,17,20,.14)]" style={{ left: tip.left }} role="tooltip">
                          <div className="font-medium text-ink">{r.title}</div>
                          <div className="mt-1 flex items-center gap-2 text-muted-strong"><span className="h-2 w-2 rounded-full" style={{ background: DOT[r.status] }} />{STATUS_LABEL[r.status]} · {r.kind === "task" ? "execution task" : (r.phase ?? "milestone")}</div>
                          <div className="mt-2 grid grid-cols-2 gap-x-4 gap-y-1">
                            <span className="text-muted-strong">Owner</span><span className="truncate">{r.owner}</span>
                            <span className="text-muted-strong">Week</span><span className="tnum">W{r.start}{r.end !== r.start ? `–W${r.end}` : ""}</span>
                            {r.spend && <><span className="text-muted-strong">Cost</span><span className="tnum">{r.spend}</span></>}
                            {r.dependsOn && <><span className="text-muted-strong">After</span><span className="truncate">{r.dependsOn}</span></>}
                          </div>
                          <div className="mt-2 text-[12px] text-accent">{r.kind === "task" ? "Click to open in Results" : open ? "Click to collapse" : "Click for details"}</div>
                        </div>
                      )}
                    </div>
                  </div>
                  {open && r.kind === "milestone" && (
                    <div className="content-enter sticky left-0 flex flex-wrap items-start gap-6 border-t border-black/[0.04] bg-ground py-4 pl-[60px] pr-6 text-[14px]" style={{ width: containerW || undefined }}>
                      {renderDetail ? renderDetail(r) : (
                        <>
                          <div><div className="t-meta">Phase</div><div>{r.phase ?? "—"}</div></div>
                          <div><div className="t-meta">Owner</div><div>{r.owner}</div></div>
                          <div><div className="t-meta">Depends on</div><div>{r.dependsOn || "nothing"}</div></div>
                          <a className="ml-auto text-accent hover:underline" href={`/chat?ask=${encodeURIComponent(`Tell me about the milestone "${r.title}"`)}`}>Ask the agents about this →</a>
                        </>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
            {g.addLabel && (
              <div className="flex h-12 items-center border-t border-black/[0.04] text-[15px] text-muted">
                <div className={`${leftCell} flex h-full items-center`} style={{ width: left, flex: "none", paddingLeft: compact ? 16 + 24 : 24 + 36 }}>
                  <a href={g.addHref ?? "/chat"} className="truncate hover:text-accent">{g.addLabel}</a>
                </div>
              </div>
            )}
          </div>
          );
        })}
      </div>
    </div>
  );
}

function GridLines({ weeks, colWidth, todayWeek }: { weeks: number; colWidth: number; todayWeek: number }) {
  return (
    <>
      {Array.from({ length: weeks + 1 }).map((_, i) => (
        <span key={i} className="absolute top-0 h-full w-px" style={{ left: i * colWidth, background: V.grid }} aria-hidden />
      ))}
      {todayWeek >= 1 && todayWeek <= weeks && (
        <span className="absolute top-0 h-full w-[2px]" style={{ left: (todayWeek - 0.5) * colWidth, background: V.accent2 }} aria-hidden />
      )}
    </>
  );
}
