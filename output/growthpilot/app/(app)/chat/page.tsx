"use client";

import { Suspense, useCallback, useEffect, useMemo, useRef, useState, type KeyboardEvent } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Bot, Loader2, MessageSquare, PanelRight, Rocket, Send, X } from "lucide-react";
import { api, ApiError } from "@/lib/api";
import { useChat, useCompany, useRuns, useRunStream, useTasks } from "@/lib/hooks";
import { usePresence } from "@/lib/usePresence";
import { timeHM } from "@/lib/format";
import type { Insight, Task } from "@/lib/types";
import { TopBar } from "@/components/shell/TopBar";
import { Button } from "@/components/ui/Button";
import { EmptyState, ErrorState, InlineError, Skeleton } from "@/components/ui/States";
import { Markdown } from "@/components/ui/Markdown";
import { Bubble } from "@/components/chat/Bubble";
import { TypingDots } from "@/components/chat/TypingDots";
import { FollowUpChips, followUpsFor } from "@/components/chat/FollowUpChips";
import { ProposalBubble } from "@/components/chat/ProposalBubble";
import { ChatRail } from "@/components/chat/ChatRail";

const MD_COMPACT = "!text-[15px] [&>*:first-child]:mt-0 [&>*:last-child]:mb-0 [&_h1]:text-[15px] [&_h2]:text-[15px] [&_h3]:text-[15px] [&_ul]:my-1 [&_ol]:my-1 [&_li]:my-0 [&_p]:my-1";
const STARTERS = ["Which segment first?", "How big is the market?", "What's the biggest risk?", "Propose next tasks"];
const RAIL_KEY = "gp.chatRail";

function ChatScreen() {
  const params = useSearchParams();
  const router = useRouter();
  const runParam = Number(params.get("run")) || undefined;
  const askParam = params.get("ask") ?? "";
  const { company, loading: cLoading, error: cError } = useCompany();
  const runs = useRuns(company?.id, !!company);
  const runId = runParam ?? runs.data?.[0]?.id;
  const stream = useRunStream(runId);
  const chat = useChat(company?.id);
  const taskList = useTasks({ company_id: company?.id }, !!company);
  const [overrides, setOverrides] = useState<Record<number, Task>>({});
  const [draft, setDraft] = useState(askParam);
  const [starting, setStarting] = useState(false);
  const [startError, setStartError] = useState<ApiError | null>(null);
  const [railHidden, setRailHidden] = useState(false);
  const [railDrawer, setRailDrawer] = useState(false);
  const [settledId, setSettledId] = useState<number | null>(null);
  const [decidedIds, setDecidedIds] = useState<Set<number>>(() => new Set());
  const drawerP = usePresence(railDrawer, 320);
  const scrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const wasStreaming = useRef(false);

  useEffect(() => {
    try { setRailHidden(localStorage.getItem(RAIL_KEY) === "hidden"); } catch { /* ignore */ }
  }, []);
  const hideRail = (hidden: boolean) => {
    setRailHidden(hidden);
    try { localStorage.setItem(RAIL_KEY, hidden ? "hidden" : "shown"); } catch { /* ignore */ }
  };

  useEffect(() => {
    if (!railDrawer) return;
    const onKey = (e: globalThis.KeyboardEvent) => e.key === "Escape" && setRailDrawer(false);
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [railDrawer]);

  const tasks = useMemo(() => {
    const map = new Map<number, Task>();
    for (const t of taskList.data ?? []) map.set(t.id, t);
    for (const t of stream.tasks) map.set(t.id, t);
    for (const t of chat.sideEffects.tasks) map.set(t.id, t);
    for (const t of Object.values(overrides)) map.set(t.id, t);
    return [...map.values()].sort((a, b) => a.id - b.id);
  }, [taskList.data, stream.tasks, chat.sideEffects.tasks, overrides]);

  const insights: Insight[] = useMemo(() => {
    const seen = new Set<number>();
    return [...chat.sideEffects.insights, ...stream.insights].filter((i) => (seen.has(i.id) ? false : (seen.add(i.id), true)));
  }, [chat.sideEffects.insights, stream.insights]);

  // The streamed bubble and the stored message that replaces it are the same
  // words; skip the entrance on the replacement so nothing pops twice.
  useEffect(() => {
    if (wasStreaming.current && !chat.streaming) {
      const last = chat.messages[chat.messages.length - 1];
      if (last && last.role === "agent") setSettledId(last.id);
    }
    wasStreaming.current = chat.streaming;
  }, [chat.streaming, chat.messages]);

  useEffect(() => {
    const el = scrollRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [chat.messages.length, chat.pending]);

  const onTaskChange = (t: Task) => {
    setOverrides((o) => ({ ...o, [t.id]: t }));
    if (t.status !== "proposed") setDecidedIds((d) => new Set(d).add(t.id));
  };
  const attached = new Set<number>();
  for (const m of chat.messages) for (const id of ((m.meta?.task_ids as number[] | undefined) ?? [])) attached.add(id);
  // Keep tasks decided in this session in the list so their confirmation line can render.
  const proposedLoose = tasks.filter((t) => (t.status === "proposed" || t.status === "blocked" || decidedIds.has(t.id)) && !attached.has(t.id));

  const send = useCallback((text: string) => {
    const t = text.trim();
    if (!t || chat.streaming) return;
    setDraft("");
    void chat.send(t);
    inputRef.current?.focus();
  }, [chat]);

  const onKey = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      send(draft);
    }
  };

  const startRun = async () => {
    if (!company) return;
    setStarting(true);
    setStartError(null);
    try {
      const run = await api.runs.create(company.id);
      router.push(`/chat?run=${run.id}`);
    } catch (e) {
      setStartError(e instanceof ApiError ? e : new ApiError(0, String(e)));
    } finally {
      setStarting(false);
    }
  };

  const run = stream.run ?? runs.data?.find((r) => r.id === runId) ?? null;
  const running = run?.status === "running";
  const lastMsg = chat.messages[chat.messages.length - 1];
  const chips = !chat.streaming && lastMsg?.role === "agent" ? followUpsFor(lastMsg.content) : [];

  const railProps = { run, tasks, events: stream.events, insights, connected: stream.connected };
  const topBar = (
    <TopBar
      title="Agents"
      subtitle={run ? `Run #${run.id} · ${run.status}${run.cost_usd ? ` · $${run.cost_usd.toFixed(2)}` : ""}` : "Seven agents, one methodology"}
      actions={<>
        <Button variant="link" href="/agents" className="hidden md:inline-flex"><Bot size={16} /> Agent roster</Button>
        <Button onClick={startRun} disabled={!company || starting || running}>{starting ? <Loader2 size={16} className="animate-spin" /> : <Rocket size={16} />} {running ? "Run in progress" : "Start new run"}</Button>
        <button type="button" className="chip chip-lg lg:hidden" onClick={() => setRailDrawer(true)}><PanelRight size={14} /> Panel</button>
        {railHidden && (
          <button type="button" className="icon-btn hidden lg:grid" title="Show panel" aria-label="Show panel" onClick={() => hideRail(false)}><PanelRight size={16} /></button>
        )}
      </>}
    />
  );

  if (cLoading) {
    return (
      <>
        {topBar}
        <div className="grid min-h-[calc(100dvh-88px)] grid-cols-[minmax(0,1fr)] lg:grid-cols-[minmax(0,1fr)_360px]">
          <div className="pane p-6 md:p-8"><Skeleton className="h-10 w-2/5" /><Skeleton className="ml-auto mt-5 h-10 w-1/3" /><Skeleton className="mt-5 h-16 w-1/2" /></div>
          <div className="pane rule-l hidden space-y-4 p-5 lg:block"><Skeleton className="h-16" /><Skeleton className="h-40" /><Skeleton className="h-28" /></div>
        </div>
      </>
    );
  }
  if (!company && !cError) {
    return (
      <>
        {topBar}
        <div className="p-6 md:p-8">
          <EmptyState icon={<MessageSquare size={20} />} title="No workspace to talk to" body="The chat is wired to your company's agents. Set up a company first and come back." action={<Button href="/setup">Set up your company</Button>} />
        </div>
      </>
    );
  }

  // Timestamps only close a run of bubbles from one side; grouped bubbles sit 8px apart.
  const rows = chat.messages.map((m, i) => {
    const prev = chat.messages[i - 1];
    const next = chat.messages[i + 1];
    return { m, grouped: !!prev && prev.role === m.role, last: !next || next.role !== m.role };
  });
  const anyError = cError ?? chat.error ?? stream.error ?? startError;

  return (
    <>
      {topBar}
      <div className={`flex min-h-[calc(100dvh-88px)] flex-col lg:grid lg:h-[calc(100dvh-88px)] ${railHidden ? "lg:grid-cols-[minmax(0,1fr)]" : "lg:grid-cols-[minmax(0,1fr)_360px]"}`}>
        {/* Thread */}
        <section className="pane flex min-h-0 min-w-0 flex-1 flex-col" aria-label="Conversation">
          {anyError && <div className="p-5 pb-0"><ErrorState error={anyError} retry={chat.reload} /></div>}
          <div ref={scrollRef} className="scroll-thin min-h-0 flex-1 overflow-y-auto px-6 py-6">
            <div className="mx-auto w-full max-w-[760px]">
              {chat.loading && <><Skeleton className="h-10 w-2/5" /><Skeleton className="ml-auto mt-5 h-10 w-1/3" /></>}

              {!chat.loading && chat.messages.length === 0 && chat.pending === null && proposedLoose.length === 0 && (
                <div className="content-enter mx-auto mt-10 max-w-[460px] rounded-[18px] border border-black/[0.06] bg-surface p-6 text-center shadow-[var(--shadow-card)]">
                  <p className="text-[15px] leading-6">Ask the agents anything about the plan.</p>
                  <div className="chip-row mt-4 flex flex-wrap justify-center gap-2">
                    {STARTERS.map((s) => (
                      <button key={s} type="button" className="chip chip-lg" disabled={chat.streaming} onClick={() => send(s === "Propose next tasks" ? "propose" : s)}>{s}</button>
                    ))}
                  </div>
                </div>
              )}

              {rows.map(({ m, grouped, last }) => {
                const ids = (m.meta?.task_ids as number[] | undefined) ?? [];
                const mine = tasks.filter((t) => ids.includes(t.id));
                return (
                  <div key={m.id}>
                    <Bubble role={m.role} grouped={grouped} time={last && !mine.length ? timeHM(m.ts) : undefined} animate={m.id !== settledId}>
                      {m.role === "user" ? m.content : <Markdown source={m.content} className={MD_COMPACT} />}
                    </Bubble>
                    {mine.length > 0 && <ProposalBubble tasks={mine} onChange={onTaskChange} grouped animate={m.id !== settledId} />}
                  </div>
                );
              })}

              {proposedLoose.length > 0 && <ProposalBubble tasks={proposedLoose} onChange={onTaskChange} grouped={lastMsg?.role === "agent"} />}

              {chat.pending !== null && (
                <Bubble role="agent" grouped={lastMsg?.role === "agent"}>
                  {chat.pending ? <Markdown source={chat.pending} className={MD_COMPACT} /> : <TypingDots />}
                </Bubble>
              )}

              {chips.length > 0 && <FollowUpChips chips={chips} disabled={chat.streaming} onSend={send} className="mt-3 pl-11" />}
            </div>
          </div>

          <div className="rule-t sticky bottom-0 bg-surface px-6 pt-3 pb-[max(12px,env(safe-area-inset-bottom))]">
            <form className="mx-auto flex w-full max-w-[760px] items-end gap-3" onSubmit={(e) => { e.preventDefault(); send(draft); }}>
              <textarea
                ref={inputRef}
                className="textarea min-h-[48px] max-h-[160px] flex-1 resize-none py-3"
                rows={1}
                placeholder="Ask the agents…"
                value={draft}
                onChange={(e) => { setDraft(e.target.value); e.target.style.height = "auto"; e.target.style.height = `${Math.min(160, e.target.scrollHeight)}px`; }}
                onKeyDown={onKey}
                disabled={chat.streaming || !company}
                aria-label="Message"
              />
              <button type="submit" className="grid h-10 w-10 flex-none place-items-center rounded-full bg-accent text-white transition-colors hover:bg-[#0EA371] disabled:opacity-40" aria-label="Send" disabled={chat.streaming || !draft.trim() || !company}>
                {chat.streaming ? <Loader2 size={16} className="animate-spin" /> : <Send size={16} />}
              </button>
            </form>
            {chat.sendError && <div className="mx-auto mt-2 max-w-[760px]"><InlineError error={chat.sendError} /></div>}
          </div>
        </section>

        {/* Rail (desktop) */}
        {!railHidden && (
          <aside className="pane rule-l hidden min-h-0 overflow-y-auto scroll-thin lg:block">
            <ChatRail {...railProps} onHide={() => hideRail(true)} />
          </aside>
        )}
      </div>

      {/* Rail (mobile drawer) */}
      {drawerP.mounted && (
        <div className="fixed inset-0 z-50 lg:hidden">
          <button type="button" aria-label="Close panel" className="drawer-backdrop absolute inset-0 cursor-default bg-black/20" data-closing={drawerP.closing || undefined} onClick={() => setRailDrawer(false)} />
          <aside className="drawer-panel absolute inset-y-0 right-0 flex w-full max-w-[360px] flex-col overflow-y-auto bg-surface shadow-[var(--shadow-pop)]" data-side="right" data-closing={drawerP.closing || undefined} role="dialog" aria-label="Panel">
            <div className="flex justify-end px-3 pt-3">
              <button type="button" className="icon-btn !h-8 !w-8" aria-label="Close panel" onClick={() => setRailDrawer(false)}><X size={16} /></button>
            </div>
            <ChatRail {...railProps} />
          </aside>
        </div>
      )}
    </>
  );
}

export default function ChatPage() {
  return (
    <Suspense fallback={<div className="p-8"><Skeleton className="h-[560px]" /></div>}>
      <ChatScreen />
    </Suspense>
  );
}
