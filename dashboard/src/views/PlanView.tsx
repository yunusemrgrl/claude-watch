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
  GitCommit,
  Copy,
  Check,
  List,
  LayoutGrid,
  Plus,
  X,
} from "lucide-react";
import type { ComputedTask } from "@/types";
import type { QualityEvent } from "@/types";
import { QualityTimeline } from "@/components/QualityTimeline";
import { TypingPrompt } from "@/components/TypingPrompt";
import { ScrollArea } from "@/components/ui/scroll-area";
import { getStatusColor } from "@/lib/status";
import { usePlanSnapshot } from "@/hooks/usePlanSnapshot";

// ── Kanban column order and labels ──────────────────────────────────────────
const KANBAN_COLUMNS: Array<{ status: string; label: string; colorClass: string }> = [
  { status: "READY",       label: "Ready",       colorClass: "text-chart-1 border-chart-1/30 bg-chart-1/5" },
  { status: "IN_PROGRESS", label: "In Progress",  colorClass: "text-chart-4 border-chart-4/30 bg-chart-4/5" },
  { status: "DONE",        label: "Done",         colorClass: "text-chart-2 border-chart-2/30 bg-chart-2/5" },
  { status: "BLOCKED",     label: "Blocked",      colorClass: "text-chart-3 border-chart-3/30 bg-chart-3/5" },
];

// ── Task card used in Kanban ─────────────────────────────────────────────────
function KanbanCard({
  task,
  selected,
  onClick,
}: {
  task: ComputedTask;
  selected: boolean;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className={`w-full text-left p-3 rounded-lg border transition-colors ${
        selected
          ? "bg-accent border-ring"
          : "bg-card border-border hover:bg-accent/50"
      }`}
    >
      <div className="flex items-center justify-between mb-1">
        <span className="text-xs font-mono text-muted-foreground">{task.id}</span>
        {typeof task.lastEvent?.meta?.commit === "string" && (
          <span className="flex items-center gap-1 text-[10px] text-chart-4/70 font-mono">
            <GitCommit className="size-2.5" />
            {task.lastEvent.meta.commit.slice(0, 7)}
          </span>
        )}
      </div>
      <p className="text-xs text-foreground line-clamp-2">{task.description}</p>
      <span className="mt-1.5 inline-block text-[10px] text-muted-foreground/60">{task.area}</span>
    </button>
  );
}

// ── Kanban board ─────────────────────────────────────────────────────────────
function KanbanBoard({
  tasks,
  selectedTaskId,
  onSelectTask,
}: {
  tasks: ComputedTask[];
  selectedTaskId?: string;
  onSelectTask: (task: ComputedTask) => void;
}) {
  return (
    <div className="flex-1 flex gap-3 p-3 overflow-x-auto overflow-y-hidden min-w-0">
      {KANBAN_COLUMNS.map(({ status, label, colorClass }) => {
        const col = tasks.filter((t) => t.status === status);
        return (
          <div key={status} className={`flex flex-col rounded-lg border ${colorClass} min-w-[200px] flex-1`}>
            <div className={`px-3 py-2 flex items-center justify-between border-b ${colorClass} rounded-t-lg`}>
              <span className="text-xs font-semibold uppercase tracking-wide">{label}</span>
              <span className="text-xs opacity-60">{col.length}</span>
            </div>
            <ScrollArea className="flex-1">
              <div className="p-2 space-y-2">
                {col.length === 0 ? (
                  <p className="text-[11px] text-muted-foreground/40 text-center py-4">Empty</p>
                ) : (
                  col.map((task) => (
                    <KanbanCard
                      key={task.id}
                      task={task}
                      selected={selectedTaskId === task.id}
                      onClick={() => onSelectTask(task)}
                    />
                  ))
                )}
              </div>
            </ScrollArea>
          </div>
        );
      })}
    </div>
  );
}

// ── Task detail panel ─────────────────────────────────────────────────────────
function TaskDetailPanel({
  task,
  snapshot,
  qualityEvents,
  onUpdateStatus,
  onClose,
  actionToast,
  onDismissToast,
}: {
  task: ComputedTask;
  snapshot: NonNullable<ReturnType<typeof usePlanSnapshot>["data"]>["snapshot"];
  qualityEvents: QualityEvent[];
  onUpdateStatus: (id: string, status: "DONE" | "BLOCKED") => void;
  onClose: () => void;
  actionToast: string | null;
  onDismissToast: () => void;
}) {
  const [copiedId, setCopiedId] = useState(false);

  const handleCopy = () => {
    navigator.clipboard.writeText(task.id);
    setCopiedId(true);
    setTimeout(() => setCopiedId(false), 2000);
  };

  const getDependentTasks = (taskId: string): ComputedTask[] =>
    snapshot?.tasks.filter((t) => t.dependsOn.includes(taskId)) ?? [];

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="px-4 py-3 border-b border-border bg-sidebar/50 shrink-0">
        <div className="flex items-center gap-2 mb-2">
          <span className="text-xs font-mono text-muted-foreground flex-1">{task.id}</span>
          <span className={`text-[11px] px-2 py-0.5 rounded font-semibold ${getStatusColor(task.status)}`}>
            {task.status}
          </span>
          <button onClick={handleCopy} className="p-1 rounded hover:bg-accent transition-colors" title="Copy task ID">
            {copiedId ? <Check className="size-3 text-chart-2" /> : <Copy className="size-3 text-muted-foreground" />}
          </button>
          <button onClick={onClose} className="p-1 rounded hover:bg-accent transition-colors" title="Clear selection">
            <X className="size-3 text-muted-foreground" />
          </button>
        </div>
        {/* Action buttons */}
        {(task.status === "READY" || task.status === "BLOCKED") && (
          <div className="flex gap-2">
            <button
              onClick={() => onUpdateStatus(task.id, "DONE")}
              className="flex-1 flex items-center justify-center gap-1.5 px-2 py-1 rounded bg-chart-2/10 text-chart-2 hover:bg-chart-2/20 transition-colors text-xs font-medium border border-chart-2/20"
            >
              <Check className="size-3" />
              Mark Done
            </button>
            <button
              onClick={() => onUpdateStatus(task.id, "BLOCKED")}
              className="flex-1 flex items-center justify-center gap-1.5 px-2 py-1 rounded bg-chart-3/10 text-chart-3 hover:bg-chart-3/20 transition-colors text-xs font-medium border border-chart-3/20"
            >
              <AlertCircle className="size-3" />
              Block
            </button>
          </div>
        )}
        {/* Toast */}
        {actionToast && (
          <div className="mt-2 flex items-center gap-2 text-[11px] text-chart-2 bg-chart-2/10 rounded px-2 py-1">
            <Check className="size-3 shrink-0" />
            <span className="flex-1">{actionToast}</span>
            <button onClick={onDismissToast} className="text-chart-2/60 hover:text-chart-2">×</button>
          </div>
        )}
      </div>

      {/* Scrollable content */}
      <ScrollArea className="flex-1">
        <div className="p-4 space-y-4">
          {/* Description */}
          <div>
            <h4 className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wide mb-1.5">Description</h4>
            <p className="text-sm text-foreground/90 leading-relaxed">{task.description}</p>
          </div>

          {/* AC */}
          {task.acceptanceCriteria && (
            <div>
              <h4 className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wide mb-1.5">Acceptance Criteria</h4>
              <p className="text-xs text-foreground/80 leading-relaxed bg-muted/40 rounded p-2">{task.acceptanceCriteria}</p>
            </div>
          )}

          {/* Area */}
          <div className="flex items-center gap-3 text-xs text-muted-foreground">
            <span>Area: <span className="text-foreground">{task.area}</span></span>
          </div>

          {/* Dependencies */}
          {task.dependsOn.length > 0 && (
            <div>
              <h4 className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wide mb-1.5">Dependencies</h4>
              <div className="space-y-1">
                {task.dependsOn.map((depId) => {
                  const depTask = snapshot?.tasks.find((t) => t.id === depId);
                  return (
                    <div key={depId} className="flex items-center justify-between p-2 rounded bg-card border border-border">
                      <span className="text-xs font-mono text-foreground">{depId}</span>
                      {depTask && (
                        <span className={`text-[11px] px-1.5 py-0.5 rounded font-semibold ${getStatusColor(depTask.status)}`}>
                          {depTask.status}
                        </span>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* Blocked by this */}
          {getDependentTasks(task.id).length > 0 && (
            <div>
              <h4 className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wide mb-1.5">Blocks</h4>
              <div className="space-y-1">
                {getDependentTasks(task.id).map((dep) => (
                  <div key={dep.id} className="flex items-center justify-between p-2 rounded bg-card border border-border">
                    <span className="text-xs font-mono text-foreground">{dep.id}</span>
                    <span className={`text-[11px] px-1.5 py-0.5 rounded font-semibold ${getStatusColor(dep.status)}`}>
                      {dep.status}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Execution */}
          {task.lastEvent && (
            <div>
              <h4 className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wide mb-1.5">Last Execution</h4>
              <div className="bg-card rounded-lg p-3 space-y-2 text-sm border border-border">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-mono text-foreground">{task.lastEvent.agent}</span>
                    <span className={`px-1.5 py-0.5 rounded text-[11px] font-semibold ${getStatusColor(task.lastEvent.status)}`}>
                      {task.lastEvent.status}
                    </span>
                  </div>
                  <span className="text-muted-foreground text-[11px]">
                    {new Date(task.lastEvent.timestamp).toLocaleString()}
                  </span>
                </div>

                {task.lastEvent.reason && (
                  <div className="text-xs text-chart-3 bg-chart-3/10 p-2 rounded">{task.lastEvent.reason}</div>
                )}

                {task.lastEvent.meta?.duration != null && (
                  <div className="flex items-center gap-4 text-xs text-muted-foreground">
                    <span className="flex items-center gap-1">
                      <Clock className="size-3" />
                      {String(task.lastEvent.meta.duration)}s
                    </span>
                    {task.lastEvent.meta.stepCount != null && (
                      <span>{String(task.lastEvent.meta.stepCount)} steps</span>
                    )}
                  </div>
                )}

                {typeof task.lastEvent.meta?.commit === "string" && (
                  <div className="flex items-center gap-2 px-2 py-1.5 bg-background rounded">
                    <GitCommit className="size-3 text-chart-4 shrink-0" />
                    <code className="text-xs text-chart-4 font-mono">{String(task.lastEvent.meta.commit).slice(0, 7)}</code>
                    <span className="text-xs text-muted-foreground truncate">{String(task.lastEvent.meta.commitMsg || "")}</span>
                  </div>
                )}

                {Array.isArray(task.lastEvent.meta?.steps) && (
                  <div className="pt-2 border-t border-border space-y-1">
                    {(task.lastEvent.meta.steps as Array<{ type: string; name: string; summary: string; duration: number }>).map((step) => (
                      <div key={`${step.type}-${step.name}`} className="flex items-start gap-2 py-1 px-1.5 rounded hover:bg-background/50">
                        <div className="mt-0.5">
                          {step.type === "thought" && <Brain className="size-3 text-chart-4" />}
                          {step.type === "tool_call" && <Wrench className="size-3 text-chart-1" />}
                          {step.type === "observation" && <Eye className="size-3 text-chart-2" />}
                          {step.type === "error" && <AlertCircle className="size-3 text-chart-5" />}
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center justify-between gap-2">
                            <span className="text-xs font-medium text-foreground truncate">{step.name}</span>
                            <span className="text-[10px] text-muted-foreground/60 shrink-0">{step.duration}ms</span>
                          </div>
                          <p className="text-xs text-muted-foreground/80 truncate">{step.summary}</p>
                        </div>
                      </div>
                    ))}
                  </div>
                )}

                {task.lastEvent.meta && !Array.isArray(task.lastEvent.meta.steps) && (
                  <div className="pt-2 border-t border-border">
                    <pre className="text-xs text-muted-foreground bg-background p-2 rounded overflow-auto">
                      {JSON.stringify(task.lastEvent.meta, null, 2)}
                    </pre>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Quality timeline */}
          {qualityEvents.length > 0 && (
            <div>
              <h4 className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wide mb-1.5">Quality Checks</h4>
              <QualityTimeline events={qualityEvents} />
            </div>
          )}
        </div>
      </ScrollArea>
    </div>
  );
}

// ── Main PlanView ─────────────────────────────────────────────────────────────
export function PlanView({
  searchQuery,
  sidebarCollapsed,
}: {
  searchQuery: string;
  sidebarCollapsed: boolean;
}) {
  const { data, refresh } = usePlanSnapshot();
  const [selectedTask, setSelectedTask] = useState<ComputedTask | null>(null);
  const [expandedSlices, setExpandedSlices] = useState<Set<string>>(new Set());
  const [qualityEvents, setQualityEvents] = useState<QualityEvent[]>([]);
  const [actionToast, setActionToast] = useState<string | null>(null);
  const [showAddForm, setShowAddForm] = useState(false);
  const [newDesc, setNewDesc] = useState("");
  const [newSlice, setNewSlice] = useState("");
  const [newArea, setNewArea] = useState("");
  const [newAC, setNewAC] = useState("");
  const [addingTask, setAddingTask] = useState(false);
  const [viewMode, setViewMode] = useState<"list" | "kanban">(() => {
    if (typeof window === "undefined") return "list";
    return (localStorage.getItem("plan-view-mode") as "list" | "kanban") ?? "list";
  });

  // Persist view mode
  useEffect(() => {
    localStorage.setItem("plan-view-mode", viewMode);
  }, [viewMode]);

  const addTask = async () => {
    if (!newDesc.trim()) return;
    setAddingTask(true);
    try {
      const body: Record<string, string> = { description: newDesc.trim() };
      if (newSlice.trim()) body.slice = newSlice.trim();
      if (newArea.trim()) body.area = newArea.trim();
      if (newAC.trim()) body.ac = newAC.trim();
      const res = await fetch("/plan/task", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (res.ok) {
        setNewDesc("");
        setNewSlice("");
        setNewArea("");
        setNewAC("");
        setShowAddForm(false);
        void refresh();
      }
    } catch {
      // ignore
    } finally {
      setAddingTask(false);
    }
  };

  const updateTaskStatus = async (taskId: string, status: "DONE" | "BLOCKED") => {
    try {
      const res = await fetch(`/plan/task/${encodeURIComponent(taskId)}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status }),
      });
      if (res.ok) {
        setActionToast(`Task ${taskId} marked ${status}`);
        setTimeout(() => setActionToast(null), 5000);
        void refresh();
      }
    } catch {
      // ignore
    }
  };

  // Auto-expand all slices on first data load
  useEffect(() => {
    if (data?.snapshot) {
      setExpandedSlices((prev) => {
        if (prev.size > 0) return prev;
        return new Set(Object.keys(data.snapshot!.slices));
      });
    }
  }, [data]);

  // Fetch quality events for selected task
  useEffect(() => {
    if (!selectedTask) {
      setQualityEvents([]);
      return;
    }
    const controller = new AbortController();
    fetch(`/quality-timeline?taskId=${encodeURIComponent(selectedTask.id)}`, { signal: controller.signal })
      .then((r) => (r.ok ? r.json() : { events: [] }))
      .then((d) => setQualityEvents(d.events ?? []))
      .catch(() => setQualityEvents([]));
    return () => controller.abort();
  }, [selectedTask?.id]);

  const toggleSlice = (sliceId: string) => {
    setExpandedSlices((prev) => {
      const next = new Set(prev);
      if (next.has(sliceId)) next.delete(sliceId);
      else next.add(sliceId);
      return next;
    });
  };

  if (!data || !data.snapshot) {
    return (
      <div className="flex-1 p-8">
        <div className="max-w-4xl mx-auto">
          <div className="bg-destructive/10 border border-destructive rounded-lg p-6">
            <h2 className="text-xl font-bold text-destructive-foreground mb-4">
              {data?.queueErrors?.length ? "Queue Parse Errors" : "Plan Mode Not Available"}
            </h2>
            <div className="space-y-2">
              {data?.queueErrors?.map((err) => (
                <div key={err} className="text-destructive-foreground text-sm">{err}</div>
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

  return (
    <>
      {/* ── Left Sidebar ────────────────────────────────────────────────── */}
      <div
        className={`bg-sidebar border-r border-sidebar-border flex flex-col overflow-hidden ${
          "transition-all duration-300"
        } ${sidebarCollapsed ? "w-0 min-w-0 border-r-0" : "w-72 min-w-[280px]"}`}
      >
        {/* Sidebar header + mini stats + view toggle */}
        <div className="px-3 py-2 border-b border-sidebar-border shrink-0 flex items-center gap-2">
          <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Tasks</span>
          {/* Mini stats */}
          <div className="flex items-center gap-1.5 text-[10px] flex-1">
            <span className="text-muted-foreground/50">{snapshot.summary.total}T</span>
            <span className="text-chart-2 font-medium">{snapshot.summary.done}✓</span>
            {snapshot.summary.failed > 0 && (
              <span className="text-chart-5 font-medium">{snapshot.summary.failed}✗</span>
            )}
            {snapshot.summary.blocked > 0 && (
              <span className="text-chart-3 font-medium">{snapshot.summary.blocked}⊘</span>
            )}
            <span className="text-chart-1 font-medium">{snapshot.summary.ready}→</span>
          </div>
          <div className="flex items-center bg-muted rounded p-0.5 gap-0.5">
            <button
              onClick={() => setViewMode("list")}
              title="List view"
              className={`p-1 rounded transition-colors ${viewMode === "list" ? "bg-background text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"}`}
            >
              <List className="size-3" />
            </button>
            <button
              onClick={() => setViewMode("kanban")}
              title="Kanban view"
              className={`p-1 rounded transition-colors ${viewMode === "kanban" ? "bg-background text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"}`}
            >
              <LayoutGrid className="size-3" />
            </button>
          </div>
        </div>

        {/* ── Add Task — at TOP ── */}
        <div className="px-3 py-2 border-b border-sidebar-border shrink-0">
          {showAddForm ? (
            <div className="space-y-2">
              <textarea
                value={newDesc}
                onChange={(e) => setNewDesc(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Escape") { setShowAddForm(false); setNewDesc(""); setNewSlice(""); setNewArea(""); setNewAC(""); }
                }}
                placeholder="Description (required)..."
                rows={2}
                className="w-full bg-background border border-border rounded px-2 py-1.5 text-xs text-foreground placeholder-muted-foreground focus:outline-none focus:border-ring resize-none"
              />
              <div className="flex gap-2">
                <select
                  value={newSlice}
                  onChange={(e) => setNewSlice(e.target.value)}
                  className="flex-1 bg-background border border-border rounded px-2 py-1.5 text-xs text-foreground focus:outline-none focus:border-ring"
                >
                  <option value="">Slice (last)</option>
                  {Object.keys(snapshot.slices).map((s) => (
                    <option key={s} value={s}>{s}</option>
                  ))}
                </select>
                <input
                  type="text"
                  value={newArea}
                  onChange={(e) => setNewArea(e.target.value)}
                  placeholder="Area"
                  className="flex-1 bg-background border border-border rounded px-2 py-1.5 text-xs text-foreground placeholder-muted-foreground focus:outline-none focus:border-ring"
                />
              </div>
              <input
                type="text"
                value={newAC}
                onChange={(e) => setNewAC(e.target.value)}
                placeholder="Acceptance criteria (optional)"
                className="w-full bg-background border border-border rounded px-2 py-1.5 text-xs text-foreground placeholder-muted-foreground focus:outline-none focus:border-ring"
              />
              <div className="flex gap-2">
                <button
                  onClick={() => void addTask()}
                  disabled={!newDesc.trim() || addingTask}
                  className="flex-1 text-xs py-1 rounded bg-chart-2/10 text-chart-2 border border-chart-2/20 hover:bg-chart-2/20 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                >
                  {addingTask ? "Adding…" : "Add task"}
                </button>
                <button
                  onClick={() => { setShowAddForm(false); setNewDesc(""); setNewSlice(""); setNewArea(""); setNewAC(""); }}
                  className="text-xs py-1 px-2 rounded text-muted-foreground hover:text-foreground transition-colors"
                >
                  <X className="size-3" />
                </button>
              </div>
            </div>
          ) : (
            <button
              onClick={() => setShowAddForm(true)}
              className="w-full flex items-center justify-center gap-1.5 text-xs text-muted-foreground hover:text-foreground py-1.5 border border-dashed border-border rounded hover:border-ring transition-colors"
            >
              <Plus className="size-3" />
              Add task
            </button>
          )}
        </div>

        {/* ── Task list ── */}
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
                    <span>{sliceId} &bull; {tasks.length} tasks</span>
                  </div>
                  <span className="text-muted-foreground/60">
                    {tasks.filter((t) => t.status === "DONE").length}/{tasks.length}
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
                        <span className="text-sm font-mono text-foreground">{task.id}</span>
                        <span className={`text-xs px-2 py-0.5 rounded font-semibold ${getStatusColor(task.status)}`}>
                          {task.status}
                        </span>
                      </div>
                      <div className="text-sm text-muted-foreground line-clamp-2">{task.description}</div>
                      <div className="flex items-center gap-2 mt-1">
                        <span className="text-xs text-muted-foreground/60">{task.area}</span>
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

      {/* ── Main area: Kanban only (list mode has no middle panel) ──────── */}
      {viewMode === "kanban" && (
        <KanbanBoard
          tasks={filteredTasks}
          selectedTaskId={selectedTask?.id}
          onSelectTask={setSelectedTask}
        />
      )}

      {/* ── Right detail panel — always visible ─────────────────────────── */}
      {/* In list mode: flex-1 (fills remaining space). In kanban: fixed 380px */}
      <div className={`border-l border-border flex flex-col overflow-hidden ${
        viewMode === "kanban" ? "w-[380px] min-w-[380px] shrink-0" : "flex-1"
      }`}>
        {selectedTask ? (
          <TaskDetailPanel
            task={selectedTask}
            snapshot={snapshot}
            qualityEvents={qualityEvents}
            onUpdateStatus={updateTaskStatus}
            onClose={() => setSelectedTask(null)}
            actionToast={actionToast}
            onDismissToast={() => setActionToast(null)}
          />
        ) : (
          <div className="flex-1 flex flex-col items-center justify-center gap-2 text-muted-foreground/40">
            <LayoutGrid className="size-8 opacity-20" />
            <p className="text-xs">Select a task to view details</p>
          </div>
        )}
      </div>
    </>
  );
}
