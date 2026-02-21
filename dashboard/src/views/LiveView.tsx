"use client";

import { useState, useEffect, useRef } from "react";
import { Copy, Check, RotateCcw } from "lucide-react";
import type { ClaudeSession, ClaudeTask, TokenUsage, QueueSummary, AgentRecord, HistoryPrompt, BillingBlock } from "@/types";
import { ContextHealthMini, ContextHealthWidget } from "@/components/ContextHealthWidget";
import { TypingPrompt } from "@/components/TypingPrompt";
import { ScrollArea } from "@/components/ui/scroll-area";
import { getStatusColor, getStatusLabel } from "@/lib/status";
import { useSessions } from "@/hooks/useSessions";

export function LiveView({
  searchQuery,
  sidebarCollapsed,
  mounted,
}: {
  searchQuery: string;
  sidebarCollapsed: boolean;
  mounted: boolean;
}) {
  const [showAllSessions, setShowAllSessions] = useState(false);
  const { sessions, selectedSession, setSelectedSession, sessionCounts } = useSessions(showAllSessions);
  const [selectedTask, setSelectedTask] = useState<ClaudeTask | null>(null);
  const [copiedTaskId, setCopiedTaskId] = useState(false);
  const [showSetupBanner, setShowSetupBanner] = useState(false);
  const [copiedSnippet, setCopiedSnippet] = useState(false);
  const [resumeToast, setResumeToast] = useState<string | null>(null);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [queueSummary, setQueueSummary] = useState<QueueSummary | null>(null);
  const [agents, setAgents] = useState<AgentRecord[]>([]);
  const [resumableSessions, setResumableSessions] = useState<
    { sessionId: string; projectName: string | null; lastPrompt: string; updatedAt: string }[]
  >([]);
  const [lastCompaction, setLastCompaction] = useState<{ at: string; phase: string } | null>(null);
  const [billingBlock, setBillingBlock] = useState<BillingBlock | null>(null);
  const tokenHistoryRef = useRef<Map<string, Array<{ ts: number; tokens: number }>>>(new Map());

  // Record token samples whenever sessions update (for burn rate calculation)
  useEffect(() => {
    const now = Date.now();
    const history = tokenHistoryRef.current;
    const cutoff = now - 10 * 60_000; // keep last 10 minutes
    for (const session of sessions) {
      const tokens = session.tokenUsage?.inputTokens ?? 0;
      if (tokens <= 0) continue;
      const arr = history.get(session.id) ?? [];
      arr.push({ ts: now, tokens });
      while (arr.length > 1 && arr[0].ts < cutoff) arr.shift();
      history.set(session.id, arr);
    }
  }, [sessions]);

  const getBurnRate = (sessionId: string): number | null => {
    const arr = tokenHistoryRef.current.get(sessionId);
    if (!arr || arr.length < 2) return null;
    const oldest = arr[0];
    const latest = arr[arr.length - 1];
    const deltaTokens = latest.tokens - oldest.tokens;
    const deltaMin = (latest.ts - oldest.ts) / 60_000;
    if (deltaMin < 0.25 || deltaTokens <= 0) return null;
    return deltaTokens / deltaMin;
  };

  const getMinutesToFull = (session: ClaudeSession): number | null => {
    const rate = getBurnRate(session.id);
    if (!rate || !session.contextHealth?.maxTokens) return null;
    const remaining = session.contextHealth.maxTokens - session.contextHealth.tokensUsed;
    if (remaining <= 0) return 0;
    return Math.round(remaining / rate);
  };

  // Poll agent API + history data every 15 seconds
  useEffect(() => {
    function fetchAgentData() {
      void fetch("/queue")
        .then((r) => r.ok ? r.json() : null)
        .then((d) => { if (d && !d.errors?.length) setQueueSummary(d.summary as QueueSummary); })
        .catch(() => {});
      void fetch("/agents")
        .then((r) => r.ok ? r.json() : null)
        .then((d) => { if (d?.agents) setAgents(d.agents as AgentRecord[]); })
        .catch(() => {});
      void fetch("/hook/events")
        .then((r) => r.ok ? r.json() : null)
        .then((d: { events?: Array<{ event: string; receivedAt: string }> } | null) => {
          if (!d?.events) return;
          const compact = d.events.find(e => e.event === 'PreCompact' || e.event === 'PostCompact');
          if (compact) setLastCompaction({ at: compact.receivedAt, phase: compact.event === 'PreCompact' ? 'pre' : 'post' });
        })
        .catch(() => {});
      void fetch("/billing-block")
        .then((r) => r.ok ? r.json() : null)
        .then((d) => { if (d) setBillingBlock(d as BillingBlock); })
        .catch(() => {});
      void fetch("/history")
        .then((r) => r.ok ? r.json() : null)
        .then((d: { prompts?: HistoryPrompt[] } | null) => {
          if (!d?.prompts) return;
          // Group by sessionId, keep the latest entry per session
          const map = new Map<string, HistoryPrompt>();
          for (const p of d.prompts) {
            const existing = map.get(p.sessionId);
            if (!existing || p.timestamp > existing.timestamp) map.set(p.sessionId, p);
          }
          setResumableSessions(
            [...map.values()]
              .sort((a, b) => b.timestamp.localeCompare(a.timestamp))
              .slice(0, 5)
              .map((p) => ({
                sessionId: p.sessionId,
                projectName: p.projectName,
                lastPrompt: p.display,
                updatedAt: p.timestamp,
              })),
          );
        })
        .catch(() => {});
    }
    fetchAgentData();
    const iv = setInterval(fetchAgentData, 15_000);
    return () => clearInterval(iv);
  }, []);

  const CLAUDE_MD_SNIPPET = `You MUST use the TodoWrite tool to track your work.\nAt the START of any multi-step task, create a todo list with all steps.\nMark each task in_progress before starting, completed after finishing.`;

  // Show setup banner if sessions exist but no tasks appear within 30 seconds
  useEffect(() => {
    const hasTasks = sessions.some((s) => s.tasks.length > 0);
    if (hasTasks) {
      setShowSetupBanner(false);
      if (timerRef.current) clearTimeout(timerRef.current);
      return;
    }
    if (sessions.length > 0 && !hasTasks) {
      if (timerRef.current) clearTimeout(timerRef.current);
      timerRef.current = setTimeout(() => setShowSetupBanner(true), 30_000);
    }
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, [sessions]);

  const handleCopySnippet = () => {
    void navigator.clipboard.writeText(CLAUDE_MD_SNIPPET);
    setCopiedSnippet(true);
    setTimeout(() => setCopiedSnippet(false), 2000);
  };

  const handleCopyTaskId = (id: string) => {
    navigator.clipboard.writeText(id);
    setCopiedTaskId(true);
    setTimeout(() => setCopiedTaskId(false), 2000);
  };

  const handleResumeSession = (sessionId: string) => {
    const command = `claude resume ${sessionId}`;
    // Client-side fallback — also hits the endpoint in background for consistency
    void navigator.clipboard.writeText(command);
    void fetch(`/sessions/${sessionId}/resume-cmd`, { method: "POST" }).catch(() => {});
    setResumeToast(command);
    setTimeout(() => setResumeToast(null), 3000);
  };

  // Aggregate context health across sessions that have data
  const sessionsWithHealth = sessions.filter((s) => s.contextHealth != null);
  const aggregateContextHealth =
    sessionsWithHealth.length > 0
      ? (() => {
          const maxPercentage = Math.max(
            ...sessionsWithHealth.map((s) => s.contextHealth!.percentage),
          );
          const level =
            maxPercentage >= 75
              ? "critical"
              : maxPercentage >= 65
                ? "warn"
                : "safe";
          return {
            percentage: maxPercentage,
            warningLevel: level as "safe" | "warn" | "critical",
          };
        })()
      : null;

  if (sessions.length === 0) {
    return (
      <div className="flex-1 flex items-center justify-center">
        <TypingPrompt
          lines={[
            "Start a Claude Code session to see tasks here",
            "npx claudedash start  →  launch dashboard",
            "Agent uses TodoWrite to track progress",
            "Sessions appear here in real-time",
          ]}
        />
      </div>
    );
  }

  const tasks = selectedSession?.tasks || [];
  const filteredTasks = tasks.filter(
    (t) =>
      t.subject.toLowerCase().includes(searchQuery.toLowerCase()) ||
      t.description.toLowerCase().includes(searchQuery.toLowerCase()) ||
      t.id.toLowerCase().includes(searchQuery.toLowerCase()),
  );

  const pending = filteredTasks.filter((t) => t.status === "pending");
  const inProgress = filteredTasks.filter((t) => t.status === "in_progress");
  const completed = filteredTasks.filter((t) => t.status === "completed");

  const hasActiveTask = (session: ClaudeSession) =>
    session.tasks.some((t) => t.status === "in_progress");

  const sessionProgress = (session: ClaudeSession) => {
    if (session.tasks.length === 0) return 0;
    return Math.round(
      (session.tasks.filter((t) => t.status === "completed").length /
        session.tasks.length) *
        100,
    );
  };

  const formatTokens = (n: number) => {
    if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
    if (n >= 1_000) return `${(n / 1_000).toFixed(0)}K`;
    return String(n);
  };

  const totalTokens = (u: TokenUsage) =>
    u.inputTokens + u.outputTokens + u.cacheCreationTokens + u.cacheReadTokens;

  const timeAgo = (timestamp: string) => {
    const diff = Date.now() - new Date(timestamp).getTime();
    const mins = Math.floor(diff / 60000);
    if (mins < 1) return "just now";
    if (mins < 60) return `${mins}m ago`;
    const hours = Math.floor(mins / 60);
    if (hours < 24) return `${hours}h ago`;
    return `${Math.floor(hours / 24)}d ago`;
  };

  return (
    <div className="flex-1 flex flex-col overflow-hidden">
      {/* Resume toast */}
      {resumeToast && (
        <div className="bg-chart-4/10 border-b border-chart-4/30 px-4 py-2 flex items-center gap-3 text-xs shrink-0">
          <RotateCcw className="size-3 text-chart-4 shrink-0" />
          <span className="text-foreground/80">Copied to clipboard:</span>
          <code className="font-mono text-chart-4 bg-chart-4/10 px-1.5 py-0.5 rounded">{resumeToast}</code>
          <button onClick={() => setResumeToast(null)} className="ml-auto text-muted-foreground hover:text-foreground">&times;</button>
        </div>
      )}

      {/* TodoWrite setup banner */}
      {showSetupBanner && (
        <div className="bg-chart-3/10 border-b border-chart-3/30 px-4 py-2.5 flex items-start gap-3 text-xs shrink-0">
          <span className="text-chart-3 mt-0.5 shrink-0">⚠</span>
          <div className="flex-1 text-foreground/80">
            <span className="font-semibold text-foreground">Agent setup missing.</span>{" "}
            Sessions are visible but no tasks have appeared in 30 seconds. Add this to your project&apos;s{" "}
            <code className="bg-muted px-1 rounded">CLAUDE.md</code>:
            <div className="mt-1.5 font-mono bg-muted/60 rounded px-2 py-1 text-[10px] leading-relaxed whitespace-pre">
              {CLAUDE_MD_SNIPPET}
            </div>
          </div>
          <button
            onClick={handleCopySnippet}
            className="flex items-center gap-1.5 shrink-0 text-chart-3 hover:text-foreground transition-colors border border-chart-3/30 rounded px-2 py-1"
          >
            {copiedSnippet ? (
              <><Check className="size-3" /><span>Copied</span></>
            ) : (
              <><Copy className="size-3" /><span>Copy</span></>
            )}
          </button>
          <button
            onClick={() => setShowSetupBanner(false)}
            className="text-muted-foreground hover:text-foreground shrink-0 ml-1"
          >
            &times;
          </button>
        </div>
      )}
      <div className="flex-1 flex overflow-hidden">
      {/* Session Sidebar */}
      <div
        className={`bg-sidebar border-r border-sidebar-border flex flex-col overflow-hidden ${
          mounted ? "transition-all duration-300" : ""
        } ${sidebarCollapsed ? "w-0 border-r-0" : "w-[220px]"}`}
      >
        <div className="p-3 border-b border-sidebar-border flex items-center justify-between gap-2">
          <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
            Sessions
          </span>
          {sessionCounts && sessionCounts.total > sessionCounts.filtered && !showAllSessions && (
            <button
              onClick={() => setShowAllSessions(true)}
              className="text-[9px] text-muted-foreground/60 hover:text-muted-foreground underline shrink-0"
              title={`${sessionCounts.total - sessionCounts.filtered} older sessions hidden`}
            >
              +{sessionCounts.total - sessionCounts.filtered} older
            </button>
          )}
          {showAllSessions && (
            <button
              onClick={() => setShowAllSessions(false)}
              className="text-[9px] text-muted-foreground/60 hover:text-muted-foreground underline shrink-0"
            >
              7d only
            </button>
          )}
        </div>
        <ScrollArea className="flex-1">
          <div className="p-2 space-y-1">
            {sessions.map((session) => (
              <div key={session.id} className="relative group">
              <button
                onClick={() => {
                  setSelectedSession(session);
                  setSelectedTask(null);
                }}
                className={`w-full text-left p-2.5 rounded-lg transition-colors ${
                  selectedSession?.id === session.id
                    ? "bg-accent border border-ring"
                    : "hover:bg-accent/50 border border-transparent"
                }`}
              >
                <div className="flex items-center gap-2 mb-1">
                  {hasActiveTask(session) && (
                    <span className="relative flex size-2">
                      <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-chart-2 opacity-75" />
                      <span className="relative inline-flex rounded-full size-2 bg-chart-2" />
                    </span>
                  )}
                  <span className="text-xs font-medium text-foreground truncate">
                    {session.projectName || session.id.slice(0, 8)}
                  </span>
                </div>
                {session.projectName && (
                  <div className="text-[10px] text-muted-foreground/60 font-mono truncate mb-1">
                    {session.id.slice(0, 8)}
                  </div>
                )}
                <div className="flex items-center gap-2">
                  <div className="flex-1 bg-muted rounded-full h-1.5">
                    <div
                      className="bg-chart-2 h-1.5 rounded-full transition-all"
                      style={{ width: `${sessionProgress(session)}%` }}
                    />
                  </div>
                  <span className="text-[10px] text-muted-foreground shrink-0">
                    {
                      session.tasks.filter((t) => t.status === "completed")
                        .length
                    }
                    /{session.tasks.length}
                  </span>
                </div>
                <div className="flex items-center justify-between text-[10px] text-muted-foreground/60 mt-1">
                  <span>{timeAgo(session.updatedAt)}</span>
                  <div className="flex items-center gap-2">
                    {session.tokenUsage && (
                      <span
                        title={`In: ${formatTokens(session.tokenUsage.inputTokens)} | Out: ${formatTokens(session.tokenUsage.outputTokens)} | Cache: ${formatTokens(session.tokenUsage.cacheReadTokens)}`}
                      >
                        {formatTokens(totalTokens(session.tokenUsage))} tok
                      </span>
                    )}
                    <ContextHealthMini health={session.contextHealth} />
                  </div>
                </div>
                {(() => {
                  const rate = getBurnRate(session.id);
                  const mins = getMinutesToFull(session);
                  if (!rate) return null;
                  return (
                    <div className="text-[9px] text-muted-foreground/50 mt-0.5 leading-tight">
                      {formatTokens(Math.round(rate))}/min
                      {mins != null && <span className="ml-1 text-chart-3">~{mins}min</span>}
                    </div>
                  );
                })()}
                {((session.linesAdded ?? 0) > 0 || (session.gitCommits ?? 0) > 0) && (
                  <div className="flex items-center gap-2 text-[10px] mt-1">
                    {(session.linesAdded ?? 0) > 0 && (
                      <span className="text-chart-2">+{formatTokens(session.linesAdded!)} lines</span>
                    )}
                    {(session.gitCommits ?? 0) > 0 && (
                      <span className="text-chart-1">{session.gitCommits} commit{session.gitCommits !== 1 ? "s" : ""}</span>
                    )}
                    {session.languages && Object.keys(session.languages).slice(0, 2).map(l => (
                      <span key={l} className="text-muted-foreground/50">{l}</span>
                    ))}
                  </div>
                )}
              </button>
              {/* Resume button — outside the main card button to avoid nested interactive elements */}
              <button
                onClick={(e) => { e.stopPropagation(); handleResumeSession(session.id); }}
                title={`Copy 'claude resume ${session.id}' to clipboard`}
                className="absolute top-2 right-2 p-1 rounded opacity-0 group-hover:opacity-100 hover:bg-accent transition-all text-muted-foreground hover:text-foreground"
              >
                <RotateCcw className="size-2.5" />
              </button>
              </div>
            ))}
          </div>
        </ScrollArea>

        {/* Quick Resume panel */}
        {resumableSessions.filter((r) => !sessions.some((s) => s.id === r.sessionId)).length > 0 && (
          <div className="border-t border-sidebar-border p-2 space-y-1 shrink-0">
            <span className="text-[9px] font-semibold text-muted-foreground uppercase tracking-wide">Resume</span>
            {resumableSessions
              .filter((r) => !sessions.some((s) => s.id === r.sessionId))
              .slice(0, 3)
              .map((r) => (
                <button
                  key={r.sessionId}
                  onClick={() => handleResumeSession(r.sessionId)}
                  title={`Copy: claude resume ${r.sessionId}`}
                  className="w-full text-left group flex items-start gap-1.5 p-1.5 rounded hover:bg-accent/50 transition-colors"
                >
                  <RotateCcw className="size-2.5 mt-0.5 shrink-0 text-muted-foreground group-hover:text-foreground" />
                  <div className="min-w-0">
                    <div className="text-[10px] font-medium text-foreground truncate leading-tight">
                      {r.projectName ?? r.sessionId.slice(0, 8)}
                    </div>
                    <div className="text-[9px] text-muted-foreground truncate leading-tight">
                      {r.lastPrompt.length > 40 ? r.lastPrompt.slice(0, 40) + "…" : r.lastPrompt}
                    </div>
                  </div>
                </button>
              ))}
          </div>
        )}

        {/* Last compaction indicator */}
        {lastCompaction && (() => {
          const diffMs = Date.now() - new Date(lastCompaction.at).getTime();
          const diffMin = Math.floor(diffMs / 60_000);
          const label = diffMin < 1 ? 'just now' : diffMin < 60 ? `${diffMin}m ago` : `${Math.floor(diffMin / 60)}h ago`;
          return (
            <div className="border-t border-sidebar-border px-2 py-1.5 shrink-0">
              <div className="text-[9px] text-muted-foreground leading-tight">
                <span className="font-medium text-chart-4">compact</span> {label} · state saved
              </div>
            </div>
          );
        })()}

        {/* Billing block projection */}
        {billingBlock?.active && billingBlock.minutesRemaining != null && (
          <div className="border-t border-sidebar-border px-2 py-1.5 shrink-0">
            <span className="text-[9px] font-semibold text-muted-foreground uppercase tracking-wide">Billing Block</span>
            <div className="text-[9px] text-chart-3 mt-0.5 leading-tight">
              ~{billingBlock.minutesRemaining}min left
              {billingBlock.estimatedCostUSD != null && billingBlock.minutesElapsed != null && billingBlock.minutesElapsed > 0 && (
                <span className="ml-1 text-muted-foreground">
                  · est. ${(billingBlock.estimatedCostUSD * (1 + billingBlock.minutesRemaining / billingBlock.minutesElapsed)).toFixed(2)}
                </span>
              )}
            </div>
          </div>
        )}

        {/* Agent API footer panel */}
        {(queueSummary || agents.length > 0) && (
          <div className="border-t border-sidebar-border p-2 space-y-2 shrink-0">
            {queueSummary && (
              <div className="space-y-1">
                <span className="text-[9px] font-semibold text-muted-foreground uppercase tracking-wide">Queue</span>
                <div className="flex flex-wrap gap-1 text-[9px]">
                  {queueSummary.ready > 0 && (
                    <span className="px-1.5 py-0.5 rounded bg-chart-2/15 text-chart-2 font-medium">{queueSummary.ready} READY</span>
                  )}
                  {queueSummary.done > 0 && (
                    <span className="px-1.5 py-0.5 rounded bg-muted text-muted-foreground">{queueSummary.done} DONE</span>
                  )}
                  {queueSummary.blocked > 0 && (
                    <span className="px-1.5 py-0.5 rounded bg-chart-5/15 text-chart-5 font-semibold">{queueSummary.blocked} BLOCKED</span>
                  )}
                  {queueSummary.failed > 0 && (
                    <span className="px-1.5 py-0.5 rounded bg-destructive/15 text-destructive">{queueSummary.failed} FAILED</span>
                  )}
                </div>
              </div>
            )}
            {agents.length > 0 && (
              <div className="space-y-1">
                <span className="text-[9px] font-semibold text-muted-foreground uppercase tracking-wide">Agents</span>
                {agents.map((a) => (
                  <div key={a.agentId} className={`text-[9px] leading-tight ${a.isStale ? "opacity-40" : ""}`}>
                    <span className="font-medium text-foreground truncate block">{a.name}</span>
                    {a.taskId && <span className="text-muted-foreground">{a.taskId}</span>}
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>

      {/* Kanban Board */}
      <div className="flex-1 flex flex-col overflow-hidden">
        {/* Live header: aggregate context health across all sessions */}
        {aggregateContextHealth &&
          aggregateContextHealth.warningLevel !== "safe" && (
            <div
              className={`px-4 py-1.5 flex items-center gap-2 text-xs border-b shrink-0 ${
                aggregateContextHealth.warningLevel === "critical"
                  ? "bg-chart-5/10 border-chart-5/20 text-chart-5"
                  : "bg-chart-3/10 border-chart-3/20 text-chart-3"
              }`}
            >
              <ContextHealthMini
                health={{ ...aggregateContextHealth, tokensUsed: 0 }}
              />
              <span>
                Highest context across {sessionsWithHealth.length} session
                {sessionsWithHealth.length !== 1 ? "s" : ""}:{" "}
                {aggregateContextHealth.percentage}% (
                {aggregateContextHealth.warningLevel})
              </span>
            </div>
          )}
        {selectedSession ? (
          <div className="flex-1 flex flex-col overflow-hidden">
            {/* Token Usage Bar */}
            {selectedSession.tokenUsage && (
              <div className="bg-sidebar border-b border-sidebar-border px-4 py-2 flex items-center gap-6 text-xs shrink-0">
                <span className="text-muted-foreground font-medium">
                  Tokens:
                </span>
                <span className="text-foreground">
                  <span className="text-muted-foreground">In </span>
                  {formatTokens(selectedSession.tokenUsage.inputTokens)}
                </span>
                <span className="text-foreground">
                  <span className="text-muted-foreground">Out </span>
                  {formatTokens(selectedSession.tokenUsage.outputTokens)}
                </span>
                <span className="text-foreground">
                  <span className="text-muted-foreground">Cache Write </span>
                  {formatTokens(selectedSession.tokenUsage.cacheCreationTokens)}
                </span>
                <span className="text-foreground">
                  <span className="text-muted-foreground">Cache Read </span>
                  {formatTokens(selectedSession.tokenUsage.cacheReadTokens)}
                </span>
                <span className="text-muted-foreground/60">
                  Total:{" "}
                  {formatTokens(totalTokens(selectedSession.tokenUsage))}
                </span>
                {selectedSession.contextHealth && (
                  <div className="ml-auto w-48">
                    <ContextHealthWidget health={selectedSession.contextHealth} />
                  </div>
                )}
              </div>
            )}
            {/* Kanban Columns */}
            <div className="flex-1 flex overflow-hidden">
              <div className="flex-1 flex gap-4 p-4 overflow-x-auto">
                <KanbanColumn
                  title="Pending"
                  count={pending.length}
                  tasks={pending}
                  statusColor="chart-1"
                  selectedTask={selectedTask}
                  setSelectedTask={setSelectedTask}
                />
                <KanbanColumn
                  title="In Progress"
                  count={inProgress.length}
                  tasks={inProgress}
                  statusColor="chart-4"
                  selectedTask={selectedTask}
                  setSelectedTask={setSelectedTask}
                />
                <KanbanColumn
                  title="Completed"
                  count={completed.length}
                  tasks={completed}
                  statusColor="chart-2"
                  selectedTask={selectedTask}
                  setSelectedTask={setSelectedTask}
                />
              </div>

              {/* Task Detail Slide-in */}
              {selectedTask && (
                <div className="w-[350px] bg-sidebar border-l border-border flex flex-col shrink-0">
                  <div className="p-4 border-b border-border flex items-center justify-between">
                    <span
                      className={`text-xs px-2 py-0.5 rounded font-semibold ${getStatusColor(selectedTask.status)}`}
                    >
                      {getStatusLabel(selectedTask.status)}
                    </span>
                    <button
                      onClick={() => setSelectedTask(null)}
                      className="text-muted-foreground hover:text-foreground text-sm"
                    >
                      &times;
                    </button>
                  </div>
                  <ScrollArea className="flex-1">
                    <div className="p-4 space-y-4">
                      <div>
                        <h3 className="text-sm font-semibold text-foreground mb-1">
                          {selectedTask.subject}
                        </h3>
                        {selectedTask.status === "in_progress" &&
                          selectedTask.activeForm && (
                            <p className="text-xs text-chart-4 italic">
                              {selectedTask.activeForm}
                            </p>
                          )}
                      </div>

                      {selectedTask.description && (
                        <div>
                          <h4 className="text-xs font-semibold text-muted-foreground uppercase mb-1">
                            Description
                          </h4>
                          <p className="text-xs text-foreground/80 leading-relaxed whitespace-pre-wrap">
                            {selectedTask.description}
                          </p>
                        </div>
                      )}

                      {selectedTask.blockedBy.length > 0 && (
                        <div>
                          <h4 className="text-xs font-semibold text-muted-foreground uppercase mb-1">
                            Blocked By
                          </h4>
                          <div className="flex flex-wrap gap-1">
                            {selectedTask.blockedBy.map((id) => (
                              <span
                                key={id}
                                className="text-xs bg-chart-3/20 text-chart-3 px-2 py-0.5 rounded"
                              >
                                Task #{id}
                              </span>
                            ))}
                          </div>
                        </div>
                      )}

                      {selectedTask.blocks.length > 0 && (
                        <div>
                          <h4 className="text-xs font-semibold text-muted-foreground uppercase mb-1">
                            Blocks
                          </h4>
                          <div className="flex flex-wrap gap-1">
                            {selectedTask.blocks.map((id) => (
                              <span
                                key={id}
                                className="text-xs bg-muted text-muted-foreground px-2 py-0.5 rounded"
                              >
                                Task #{id}
                              </span>
                            ))}
                          </div>
                        </div>
                      )}

                      <div className="pt-2 border-t border-border space-y-2">
                        <button
                          onClick={() => handleCopyTaskId(selectedTask.id)}
                          className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors"
                        >
                          {copiedTaskId ? (
                            <>
                              <Check className="size-3 text-chart-2" />
                              <span className="text-chart-2">Copied</span>
                            </>
                          ) : (
                            <>
                              <Copy className="size-3" />
                              <span>Copy ID: {selectedTask.id}</span>
                            </>
                          )}
                        </button>
                        {selectedSession && (
                          <button
                            onClick={() => handleResumeSession(selectedSession.id)}
                            className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors"
                            title={`Copy 'claude resume ${selectedSession.id}' to clipboard`}
                          >
                            <RotateCcw className="size-3" />
                            <span>Resume session</span>
                          </button>
                        )}
                      </div>
                    </div>
                  </ScrollArea>
                </div>
              )}
            </div>
          </div>
        ) : (
          <div className="flex-1 flex items-center justify-center">
            <div className="text-center">
              <p className="text-muted-foreground">
                Select a session from the sidebar
              </p>
            </div>
          </div>
        )}
      </div>
      </div>
    </div>
  );
}

function KanbanColumn({
  title,
  count,
  tasks,
  statusColor,
  selectedTask,
  setSelectedTask,
}: {
  title: string;
  count: number;
  tasks: ClaudeTask[];
  statusColor: string;
  selectedTask: ClaudeTask | null;
  setSelectedTask: (t: ClaudeTask) => void;
}) {
  return (
    <div className="flex-1 min-w-[250px] flex flex-col">
      <div className="flex items-center gap-2 mb-3 px-1">
        <div className={`size-2 rounded-full bg-${statusColor}`} />
        <span className="text-xs font-semibold text-muted-foreground uppercase">
          {title}
        </span>
        <span className="text-xs text-muted-foreground/60 bg-muted px-1.5 py-0.5 rounded">
          {count}
        </span>
      </div>
      <ScrollArea className="flex-1">
        <div className="space-y-2 pr-1">
          {tasks.map((task) => (
            <button
              key={task.id}
              onClick={() => setSelectedTask(task)}
              className={`w-full text-left p-3 rounded-lg border transition-colors ${
                selectedTask?.id === task.id
                  ? "bg-accent border-ring"
                  : "bg-card border-border hover:bg-accent/50"
              }`}
            >
              <div className="flex items-center justify-between mb-1">
                <span className="text-[10px] text-muted-foreground font-mono">
                  #{task.id}
                </span>
              </div>
              <p className="text-sm text-foreground line-clamp-2 mb-1">
                {task.subject}
              </p>
              {task.status === "in_progress" && task.activeForm && (
                <p className="text-xs text-chart-4 italic truncate">
                  {task.activeForm}
                </p>
              )}
              {task.blockedBy.length > 0 && (
                <div className="flex items-center gap-1 mt-1.5">
                  <span className="text-[10px] text-chart-3">
                    Blocked by #{task.blockedBy[0]}
                    {task.blockedBy.length > 1
                      ? ` +${task.blockedBy.length - 1}`
                      : ""}
                  </span>
                </div>
              )}
            </button>
          ))}
        </div>
      </ScrollArea>
    </div>
  );
}
