"use client";

import { useState, useEffect } from "react";
import {
  ChevronRight,
  ChevronDown,
  Brain,
  Wrench,
  Eye,
  AlertCircle,
  Clock,
  Bot,
  GitCommit,
  Copy,
  Check,
} from "lucide-react";
import type { ComputedTask } from "@/types";
import type { QualityEvent } from "@/types";
import { QualityTimeline } from "@/components/QualityTimeline";
import { TypingPrompt } from "@/components/TypingPrompt";
import { ScrollArea } from "@/components/ui/scroll-area";
import { getStatusColor } from "@/lib/status";
import { usePlanSnapshot } from "@/hooks/usePlanSnapshot";

export function PlanView({
  searchQuery,
  sidebarCollapsed,
  mounted,
}: {
  searchQuery: string;
  sidebarCollapsed: boolean;
  mounted: boolean;
}) {
  const { data } = usePlanSnapshot();
  const [selectedTask, setSelectedTask] = useState<ComputedTask | null>(null);
  const [expandedSlices, setExpandedSlices] = useState<Set<string>>(new Set());
  const [qualityEvents, setQualityEvents] = useState<QualityEvent[]>([]);
  const [copiedTaskId, setCopiedTaskId] = useState(false);

  // Auto-expand all slices on first data load
  useEffect(() => {
    if (data?.snapshot) {
      setExpandedSlices((prev) => {
        if (prev.size > 0) return prev;
        return new Set(Object.keys(data.snapshot!.slices));
      });
    }
  }, [data]);

  useEffect(() => {
    if (!selectedTask) {
      setQualityEvents([]);
      return;
    }
    fetch(`/quality-timeline?taskId=${encodeURIComponent(selectedTask.id)}`)
      .then((r) => (r.ok ? r.json() : { events: [] }))
      .then((d) => setQualityEvents(d.events ?? []))
      .catch(() => setQualityEvents([]));
  }, [selectedTask?.id]);

  const toggleSlice = (sliceId: string) => {
    setExpandedSlices((prev) => {
      const next = new Set(prev);
      if (next.has(sliceId)) next.delete(sliceId);
      else next.add(sliceId);
      return next;
    });
  };

  const handleCopyTaskId = (id: string) => {
    navigator.clipboard.writeText(id);
    setCopiedTaskId(true);
    setTimeout(() => setCopiedTaskId(false), 2000);
  };

  if (!data || !data.snapshot) {
    return (
      <div className="flex-1 p-8">
        <div className="max-w-4xl mx-auto">
          <div className="bg-destructive/10 border border-destructive rounded-lg p-6">
            <h2 className="text-xl font-bold text-destructive-foreground mb-4">
              {data?.queueErrors?.length
                ? "Queue Parse Errors"
                : "Plan Mode Not Available"}
            </h2>
            <div className="space-y-2">
              {data?.queueErrors?.map((err, i) => (
                <div key={i} className="text-destructive-foreground text-sm">
                  {err}
                </div>
              )) || (
                <div className="text-muted-foreground text-sm">
                  Run &quot;claudedash init&quot; to set up Plan mode
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    );
  }

  const snapshot = data.snapshot;
  const filteredTasks = snapshot.tasks.filter(
    (t) =>
      t.description.toLowerCase().includes(searchQuery.toLowerCase()) ||
      t.id.toLowerCase().includes(searchQuery.toLowerCase()),
  );

  const tasksBySlice = filteredTasks.reduce(
    (acc, task) => {
      if (!acc[task.slice]) acc[task.slice] = [];
      acc[task.slice].push(task);
      return acc;
    },
    {} as Record<string, ComputedTask[]>,
  );

  const getDependentTasks = (taskId: string): ComputedTask[] => {
    return snapshot.tasks.filter((t) => t.dependsOn.includes(taskId));
  };

  const agentStats = snapshot.tasks.reduce(
    (acc, task) => {
      if (task.lastEvent) {
        const agent = task.lastEvent.agent;
        if (!acc[agent])
          acc[agent] = { done: 0, failed: 0, totalDuration: 0, taskCount: 0 };
        acc[agent].taskCount++;
        if (task.lastEvent.status === "DONE") acc[agent].done++;
        if (task.lastEvent.status === "FAILED") acc[agent].failed++;
        const dur = task.lastEvent.meta?.duration;
        if (typeof dur === "number") acc[agent].totalDuration += dur;
      }
      return acc;
    },
    {} as Record<
      string,
      { done: number; failed: number; totalDuration: number; taskCount: number }
    >,
  );

  return (
    <>
      {/* Left Sidebar */}
      <div
        className={`bg-sidebar border-r border-sidebar-border flex flex-col overflow-hidden ${
          mounted ? "transition-all duration-300" : ""
        } ${sidebarCollapsed ? "w-0 min-w-0 border-r-0" : "w-72 min-w-[280px]"}`}
      >
        <ScrollArea className="flex-1">
          <div className="p-3 space-y-3">
            {Object.entries(tasksBySlice).map(([sliceId, tasks]) => (
              <div key={sliceId} className="space-y-2">
                <button
                  onClick={() => toggleSlice(sliceId)}
                  className="w-full flex items-center justify-between px-2 py-1.5 bg-muted rounded text-xs font-semibold text-muted-foreground hover:bg-muted/80 transition-colors"
                >
                  <div className="flex items-center gap-1.5">
                    {expandedSlices.has(sliceId) ? (
                      <ChevronDown className="size-3.5" />
                    ) : (
                      <ChevronRight className="size-3.5" />
                    )}
                    <span>
                      {sliceId} &bull; {tasks.length} tasks
                    </span>
                  </div>
                  <span className="text-muted-foreground/60">
                    {tasks.filter((t) => t.status === "DONE").length}/
                    {tasks.length}
                  </span>
                </button>
                {expandedSlices.has(sliceId) &&
                  tasks.map((task) => (
                    <button
                      key={task.id}
                      onClick={() => setSelectedTask(task)}
                      className={`w-full text-left p-3 rounded-lg border transition-colors ${
                        selectedTask?.id === task.id
                          ? "bg-accent border-ring"
                          : "bg-card border-border hover:bg-accent/50"
                      }`}
                    >
                      <div className="flex items-center justify-between mb-1.5">
                        <span className="text-sm font-mono text-foreground">
                          {task.id}
                        </span>
                        <span
                          className={`text-xs px-2 py-0.5 rounded font-semibold ${getStatusColor(task.status)}`}
                        >
                          {task.status}
                        </span>
                      </div>
                      <div className="text-sm text-muted-foreground line-clamp-2">
                        {task.description}
                      </div>
                      <div className="flex items-center gap-2 mt-1">
                        <span className="text-xs text-muted-foreground/60">
                          {task.area}
                        </span>
                        {typeof task.lastEvent?.meta?.commit === "string" && (
                          <span className="flex items-center gap-1 text-[10px] text-chart-4/70 font-mono">
                            <GitCommit className="size-2.5" />
                            {String(task.lastEvent.meta.commit).slice(0, 7)}
                          </span>
                        )}
                      </div>
                    </button>
                  ))}
              </div>
            ))}
          </div>
        </ScrollArea>
      </div>

      {/* Main Content */}
      <div className="flex-1 flex flex-col overflow-hidden">
        {selectedTask ? (
          <>
            <div className="bg-sidebar border-b border-border p-6">
              <h2 className="text-2xl font-semibold text-foreground mb-3">
                {selectedTask.description}
              </h2>
              <div className="flex items-center gap-4 text-sm text-muted-foreground">
                <span>Task: {selectedTask.id}</span>
                <span>&bull;</span>
                <span>Area: {selectedTask.area}</span>
                <span>&bull;</span>
                <span
                  className={`px-2 py-1 rounded text-xs font-semibold ${getStatusColor(selectedTask.status)}`}
                >
                  {selectedTask.status}
                </span>
                <div className="flex-1" />
                <button
                  onClick={() => handleCopyTaskId(selectedTask.id)}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded hover:bg-accent transition-colors"
                >
                  {copiedTaskId ? (
                    <>
                      <Check className="size-3.5 text-chart-2" />
                      <span className="text-chart-2">Copied</span>
                    </>
                  ) : (
                    <>
                      <Copy className="size-3.5" />
                      <span>Copy ID</span>
                    </>
                  )}
                </button>
              </div>
            </div>

            <div className="flex-1 flex overflow-hidden">
              {/* Details */}
              <div className="w-1/2 border-r border-border flex flex-col">
                <div className="bg-sidebar border-b border-border px-4 py-2">
                  <h3 className="text-sm font-semibold text-foreground uppercase tracking-wide">
                    Task Details
                  </h3>
                </div>
                <ScrollArea className="flex-1">
                  <div className="p-6 space-y-6">
                    <div>
                      <h4 className="text-xs font-semibold text-muted-foreground uppercase mb-2">
                        Acceptance Criteria
                      </h4>
                      <p className="text-sm text-foreground/80 leading-relaxed">
                        {selectedTask.acceptanceCriteria}
                      </p>
                    </div>

                    {selectedTask.dependsOn.length > 0 && (
                      <div>
                        <h4 className="text-xs font-semibold text-muted-foreground uppercase mb-2">
                          Dependencies
                        </h4>
                        <div className="space-y-2">
                          {selectedTask.dependsOn.map((depId) => {
                            const depTask = snapshot.tasks.find(
                              (t) => t.id === depId,
                            );
                            return (
                              <button
                                key={depId}
                                onClick={() =>
                                  depTask && setSelectedTask(depTask)
                                }
                                className="w-full text-left p-3 rounded-lg bg-card border border-border hover:bg-accent/50 transition-colors"
                              >
                                <div className="flex items-center justify-between">
                                  <span className="text-sm font-mono text-foreground">
                                    {depId}
                                  </span>
                                  {depTask && (
                                    <span
                                      className={`text-xs px-2 py-0.5 rounded font-semibold ${getStatusColor(depTask.status)}`}
                                    >
                                      {depTask.status}
                                    </span>
                                  )}
                                </div>
                              </button>
                            );
                          })}
                        </div>
                      </div>
                    )}

                    {getDependentTasks(selectedTask.id).length > 0 && (
                      <div>
                        <h4 className="text-xs font-semibold text-muted-foreground uppercase mb-2">
                          Blocks These Tasks
                        </h4>
                        <div className="space-y-2">
                          {getDependentTasks(selectedTask.id).map((task) => (
                            <button
                              key={task.id}
                              onClick={() => setSelectedTask(task)}
                              className="w-full text-left p-3 rounded-lg bg-card border border-border hover:bg-accent/50 transition-colors"
                            >
                              <div className="flex items-center justify-between">
                                <span className="text-sm font-mono text-foreground">
                                  {task.id}
                                </span>
                                <span
                                  className={`text-xs px-2 py-0.5 rounded font-semibold ${getStatusColor(task.status)}`}
                                >
                                  {task.status}
                                </span>
                              </div>
                            </button>
                          ))}
                        </div>
                      </div>
                    )}

                    {selectedTask.lastEvent && (
                      <div>
                        <h4 className="text-xs font-semibold text-muted-foreground uppercase mb-2">
                          Execution
                        </h4>
                        <div className="bg-card rounded-lg p-4 space-y-3 text-sm border border-border">
                          <div className="flex items-center justify-between">
                            <div className="flex items-center gap-2">
                              <span className="text-foreground font-mono">
                                {selectedTask.lastEvent.agent}
                              </span>
                              <span
                                className={`px-2 py-0.5 rounded text-xs font-semibold ${getStatusColor(selectedTask.lastEvent.status)}`}
                              >
                                {selectedTask.lastEvent.status}
                              </span>
                            </div>
                            <span className="text-muted-foreground text-xs">
                              {new Date(
                                selectedTask.lastEvent.timestamp,
                              ).toLocaleString()}
                            </span>
                          </div>

                          {selectedTask.lastEvent.reason && (
                            <div className="text-xs text-chart-3 bg-chart-3/10 p-2 rounded">
                              {selectedTask.lastEvent.reason}
                            </div>
                          )}

                          {selectedTask.lastEvent.meta?.duration != null && (
                            <div className="flex items-center gap-4 text-xs text-muted-foreground">
                              <span className="flex items-center gap-1">
                                <Clock className="size-3" />
                                {String(selectedTask.lastEvent.meta.duration)}s
                              </span>
                              {selectedTask.lastEvent.meta.stepCount != null && (
                                <span>
                                  {String(selectedTask.lastEvent.meta.stepCount)}{" "}
                                  steps
                                </span>
                              )}
                            </div>
                          )}

                          {typeof selectedTask.lastEvent.meta?.commit ===
                            "string" && (
                            <div className="flex items-center gap-2 px-3 py-2 bg-background rounded-md">
                              <GitCommit className="size-3.5 text-chart-4 shrink-0" />
                              <code className="text-xs text-chart-4 font-mono">
                                {String(
                                  selectedTask.lastEvent.meta.commit,
                                ).slice(0, 7)}
                              </code>
                              <span className="text-xs text-muted-foreground truncate">
                                {String(
                                  selectedTask.lastEvent.meta.commitMsg || "",
                                )}
                              </span>
                            </div>
                          )}

                          {Array.isArray(selectedTask.lastEvent.meta?.steps) && (
                            <div className="mt-2 pt-3 border-t border-border space-y-1">
                              {(
                                selectedTask.lastEvent.meta.steps as Array<{
                                  type: string;
                                  name: string;
                                  summary: string;
                                  duration: number;
                                }>
                              ).map((step, i) => (
                                <div
                                  key={i}
                                  className="flex items-start gap-2 py-1.5 px-2 rounded hover:bg-background/50"
                                >
                                  <div className="mt-0.5">
                                    {step.type === "thought" && (
                                      <Brain className="size-3.5 text-chart-4" />
                                    )}
                                    {step.type === "tool_call" && (
                                      <Wrench className="size-3.5 text-chart-1" />
                                    )}
                                    {step.type === "observation" && (
                                      <Eye className="size-3.5 text-chart-2" />
                                    )}
                                    {step.type === "error" && (
                                      <AlertCircle className="size-3.5 text-chart-5" />
                                    )}
                                  </div>
                                  <div className="flex-1 min-w-0">
                                    <div className="flex items-center justify-between gap-2">
                                      <span className="text-xs font-medium text-foreground truncate">
                                        {step.name}
                                      </span>
                                      <span className="text-[10px] text-muted-foreground/60 shrink-0">
                                        {step.duration}ms
                                      </span>
                                    </div>
                                    <p className="text-xs text-muted-foreground/80 truncate">
                                      {step.summary}
                                    </p>
                                  </div>
                                </div>
                              ))}
                            </div>
                          )}

                          {selectedTask.lastEvent.meta &&
                            !Array.isArray(selectedTask.lastEvent.meta.steps) && (
                              <div className="mt-2 pt-3 border-t border-border">
                                <pre className="text-xs text-muted-foreground bg-background p-2 rounded overflow-auto">
                                  {JSON.stringify(
                                    selectedTask.lastEvent.meta,
                                    null,
                                    2,
                                  )}
                                </pre>
                              </div>
                            )}
                        </div>
                      </div>
                    )}
                  </div>
                </ScrollArea>
              </div>

              {/* Overview */}
              <div className="w-1/2 flex flex-col">
                <div className="bg-sidebar border-b border-border px-4 py-2">
                  <h3 className="text-sm font-semibold text-foreground uppercase tracking-wide">
                    Overview
                  </h3>
                </div>
                <ScrollArea className="flex-1">
                  <div className="p-6 space-y-6">
                    <div className="grid grid-cols-2 gap-3">
                      <div className="bg-card border border-border rounded-lg p-4">
                        <div className="text-2xl font-bold text-foreground">
                          {snapshot.summary.total}
                        </div>
                        <div className="text-xs text-muted-foreground mt-1">
                          Total Tasks
                        </div>
                      </div>
                      <div className="bg-card border border-chart-2/30 rounded-lg p-4">
                        <div className="text-2xl font-bold text-chart-2">
                          {snapshot.summary.done}
                        </div>
                        <div className="text-xs text-muted-foreground mt-1">
                          Done
                        </div>
                      </div>
                      <div className="bg-card border border-chart-5/30 rounded-lg p-4">
                        <div className="text-2xl font-bold text-chart-5">
                          {snapshot.summary.failed}
                        </div>
                        <div className="text-xs text-muted-foreground mt-1">
                          Failed
                        </div>
                      </div>
                      <div className="bg-card border border-chart-3/30 rounded-lg p-4">
                        <div className="text-2xl font-bold text-chart-3">
                          {snapshot.summary.blocked}
                        </div>
                        <div className="text-xs text-muted-foreground mt-1">
                          Blocked
                        </div>
                      </div>
                      <div className="bg-card border border-chart-1/30 rounded-lg p-4">
                        <div className="text-2xl font-bold text-chart-1">
                          {snapshot.summary.ready}
                        </div>
                        <div className="text-xs text-muted-foreground mt-1">
                          Ready
                        </div>
                      </div>
                      <div className="bg-card border border-border rounded-lg p-4">
                        <div className="text-2xl font-bold text-foreground">
                          {Math.round(snapshot.summary.successRate * 100)}%
                        </div>
                        <div className="text-xs text-muted-foreground mt-1">
                          Success Rate
                        </div>
                      </div>
                    </div>

                    <div>
                      <h4 className="text-xs font-semibold text-muted-foreground uppercase mb-3">
                        Slice Progress
                      </h4>
                      <div className="space-y-3">
                        {Object.entries(snapshot.slices).map(
                          ([sliceId, slice]) => (
                            <div
                              key={sliceId}
                              className="bg-card border border-border rounded-lg p-4"
                            >
                              <div className="flex justify-between mb-2">
                                <span className="font-semibold text-foreground">
                                  {sliceId}
                                </span>
                                <span className="text-muted-foreground text-sm">
                                  {slice.done}/{slice.total} ({slice.progress}%)
                                </span>
                              </div>
                              <div className="w-full bg-muted rounded-full h-2">
                                <div
                                  className="bg-chart-2 h-2 rounded-full transition-all"
                                  style={{ width: `${slice.progress}%` }}
                                />
                              </div>
                              <div className="flex gap-4 mt-3 text-xs">
                                <span className="text-chart-2">
                                  Done: {slice.done}
                                </span>
                                <span className="text-chart-5">
                                  Failed: {slice.failed}
                                </span>
                                <span className="text-chart-3">
                                  Blocked: {slice.blocked}
                                </span>
                                <span className="text-chart-1">
                                  Ready: {slice.ready}
                                </span>
                              </div>
                            </div>
                          ),
                        )}
                      </div>
                    </div>

                    {qualityEvents.length > 0 && (
                      <div>
                        <h4 className="text-xs font-semibold text-muted-foreground uppercase mb-3">
                          Quality Checks
                        </h4>
                        <QualityTimeline events={qualityEvents} />
                      </div>
                    )}

                    {Object.keys(agentStats).length > 0 && (
                      <div>
                        <h4 className="text-xs font-semibold text-muted-foreground uppercase mb-3">
                          Agent Activity
                        </h4>
                        <div className="space-y-2">
                          {Object.entries(agentStats).map(([agent, stats]) => (
                            <div
                              key={agent}
                              className="bg-card border border-border rounded-lg p-4"
                            >
                              <div className="flex items-center justify-between mb-2">
                                <div className="flex items-center gap-2">
                                  <Bot className="size-4 text-chart-4" />
                                  <span className="font-mono text-sm text-foreground">
                                    {agent}
                                  </span>
                                </div>
                                <span className="text-xs text-muted-foreground">
                                  {stats.taskCount} tasks
                                </span>
                              </div>
                              <div className="flex gap-3 text-xs">
                                <span className="text-chart-2">
                                  {stats.done} done
                                </span>
                                {stats.failed > 0 && (
                                  <span className="text-chart-5">
                                    {stats.failed} failed
                                  </span>
                                )}
                                {stats.totalDuration > 0 && (
                                  <span className="text-muted-foreground flex items-center gap-1">
                                    <Clock className="size-3" />
                                    {stats.totalDuration.toFixed(1)}s total
                                  </span>
                                )}
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                </ScrollArea>
              </div>
            </div>
          </>
        ) : (
          <div className="flex items-center justify-center h-full">
            <TypingPrompt
              lines={[
                "Select a task from the sidebar to view details",
                "claudedash init  →  create .claudedash/",
                "Define tasks in queue.md with dependencies",
                "Agent logs progress to execution.log",
                "Watch your workflow unfold in real-time",
              ]}
            />
          </div>
        )}
      </div>
    </>
  );
}
