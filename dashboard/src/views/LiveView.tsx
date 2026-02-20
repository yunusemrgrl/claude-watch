"use client";

import { useState } from "react";
import { Copy, Check } from "lucide-react";
import type { ClaudeSession, ClaudeTask, TokenUsage } from "@/types";
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
  const { sessions, selectedSession, setSelectedSession } = useSessions();
  const [selectedTask, setSelectedTask] = useState<ClaudeTask | null>(null);
  const [copiedTaskId, setCopiedTaskId] = useState(false);

  const handleCopyTaskId = (id: string) => {
    navigator.clipboard.writeText(id);
    setCopiedTaskId(true);
    setTimeout(() => setCopiedTaskId(false), 2000);
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
    <>
      {/* Session Sidebar */}
      <div
        className={`bg-sidebar border-r border-sidebar-border flex flex-col overflow-hidden ${
          mounted ? "transition-all duration-300" : ""
        } ${sidebarCollapsed ? "w-0 border-r-0" : "w-[220px]"}`}
      >
        <div className="p-3 border-b border-sidebar-border">
          <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
            Sessions
          </span>
        </div>
        <ScrollArea className="flex-1">
          <div className="p-2 space-y-1">
            {sessions.map((session) => (
              <button
                key={session.id}
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
              </button>
            ))}
          </div>
        </ScrollArea>
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

                      <div className="pt-2 border-t border-border">
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
    </>
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
