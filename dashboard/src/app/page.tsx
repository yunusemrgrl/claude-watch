"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import {
  Search,
  RefreshCw,
  Copy,
  Check,
  ChevronRight,
  ChevronDown,
  Brain,
  Wrench,
  Eye,
  AlertCircle,
  Clock,
  Bot,
  FileText,
  GitCommit,
  Radio,
  ClipboardList,
  PanelLeft,
  PanelLeftClose,
} from "lucide-react";
import type {
  SnapshotResponse,
  ComputedTask,
  ClaudeSession,
  ClaudeTask,
  SessionsResponse,
  HealthResponse,
  TokenUsage,
} from "@/types";
import { ScrollArea } from "@/components/ui/scroll-area";

type ViewMode = "live" | "plan";

function TypingPrompt({ lines }: { lines: string[] }) {
  const [lineIndex, setLineIndex] = useState(0);
  const [charIndex, setCharIndex] = useState(0);
  const [isDeleting, setIsDeleting] = useState(false);

  useEffect(() => {
    const currentLine = lines[lineIndex];

    if (!isDeleting && charIndex < currentLine.length) {
      const timeout = setTimeout(() => setCharIndex((c) => c + 1), 40 + Math.random() * 30);
      return () => clearTimeout(timeout);
    }

    if (!isDeleting && charIndex === currentLine.length) {
      const timeout = setTimeout(() => setIsDeleting(true), 2000);
      return () => clearTimeout(timeout);
    }

    if (isDeleting && charIndex > 0) {
      const timeout = setTimeout(() => setCharIndex((c) => c - 1), 20);
      return () => clearTimeout(timeout);
    }

    if (isDeleting && charIndex === 0) {
      setIsDeleting(false);
      setLineIndex((i) => (i + 1) % lines.length);
    }
  }, [charIndex, isDeleting, lineIndex, lines]);

  return (
    <div className="flex flex-col items-center gap-4">
      <div className="text-muted-foreground/30 text-4xl font-bold select-none">&gt;_</div>
      <div className="h-8 flex items-center">
        <span className="text-sm text-muted-foreground/60 typing-cursor pr-1">
          {lines[lineIndex].slice(0, charIndex)}
        </span>
      </div>
    </div>
  );
}

export default function Dashboard() {
  const [mode, setMode] = useState<ViewMode>("live");
  const [availableModes, setAvailableModes] = useState({ live: false, plan: false });

  // Live mode state
  const [sessions, setSessions] = useState<ClaudeSession[]>([]);
  const [selectedSession, setSelectedSession] = useState<ClaudeSession | null>(null);
  const [selectedClaudeTask, setSelectedClaudeTask] = useState<ClaudeTask | null>(null);

  // Plan mode state
  const [planData, setPlanData] = useState<SnapshotResponse | null>(null);
  const [selectedTask, setSelectedTask] = useState<ComputedTask | null>(null);
  const [expandedSlices, setExpandedSlices] = useState<Set<string>>(new Set());

  // Shared state
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [copiedTaskId, setCopiedTaskId] = useState(false);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const eventSourceRef = useRef<EventSource | null>(null);

  // Detect available modes
  useEffect(() => {
    fetch("/health")
      .then((r) => r.json())
      .then((data: HealthResponse) => {
        setAvailableModes(data.modes);
        if (data.modes.live) setMode("live");
        else if (data.modes.plan) setMode("plan");
        setLoading(false);
      })
      .catch(() => {
        setError("Failed to connect to server");
        setLoading(false);
      });
  }, []);

  // Ref to track selected session ID without causing re-renders of fetchSessions
  const selectedSessionIdRef = useRef<string | null>(null);
  useEffect(() => {
    selectedSessionIdRef.current = selectedSession?.id ?? null;
  }, [selectedSession]);

  // Fetch sessions (Live mode) — no dependency on selectedSession
  const fetchSessions = useCallback(async () => {
    try {
      const response = await fetch("/sessions");
      if (!response.ok) throw new Error("Failed to fetch sessions");
      const result: SessionsResponse = await response.json();
      setSessions(result.sessions);

      const currentId = selectedSessionIdRef.current;
      if (!currentId && result.sessions.length > 0) {
        setSelectedSession(result.sessions[0]);
      } else if (currentId) {
        const updated = result.sessions.find((s) => s.id === currentId);
        if (updated) setSelectedSession(updated);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unknown error");
    }
  }, []);

  // Fetch snapshot (Plan mode)
  const fetchSnapshot = useCallback(async () => {
    try {
      const response = await fetch("/snapshot");
      if (!response.ok) throw new Error("Failed to fetch snapshot");
      const result: SnapshotResponse = await response.json();
      setPlanData(result);
      // Auto-expand all slices on first load
      if (result.snapshot) {
        setExpandedSlices((prev) => {
          if (prev.size > 0) return prev;
          return new Set(Object.keys(result.snapshot!.slices));
        });
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unknown error");
    }
  }, []);

  // Initial data load based on mode
  useEffect(() => {
    if (loading) return;
    if (mode === "live" && availableModes.live) fetchSessions();
    if (mode === "plan" && availableModes.plan) fetchSnapshot();
  }, [mode, loading, availableModes]);

  // Refs for latest fetch functions and mode — SSE handler uses these to avoid stale closures
  const fetchSessionsRef = useRef(fetchSessions);
  const fetchSnapshotRef = useRef(fetchSnapshot);
  const modeRef = useRef(mode);
  useEffect(() => { fetchSessionsRef.current = fetchSessions; }, [fetchSessions]);
  useEffect(() => { fetchSnapshotRef.current = fetchSnapshot; }, [fetchSnapshot]);
  useEffect(() => { modeRef.current = mode; }, [mode]);

  // SSE connection — opens once on mount, never reconnects due to state changes
  useEffect(() => {
    if (loading) return;

    const es = new EventSource("/events/");
    eventSourceRef.current = es;

    es.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);
        if (data.type === "sessions" && modeRef.current === "live") fetchSessionsRef.current();
        if (data.type === "plan" && modeRef.current === "plan") fetchSnapshotRef.current();
      } catch { /* ignore parse errors */ }
    };

    es.onerror = () => {
      // EventSource auto-reconnects
    };

    return () => {
      es.close();
      eventSourceRef.current = null;
    };
  }, [loading]);

  const handleCopyTaskId = (id: string) => {
    navigator.clipboard.writeText(id);
    setCopiedTaskId(true);
    setTimeout(() => setCopiedTaskId(false), 2000);
  };

  const toggleSlice = (sliceId: string) => {
    setExpandedSlices((prev) => {
      const next = new Set(prev);
      if (next.has(sliceId)) next.delete(sliceId);
      else next.add(sliceId);
      return next;
    });
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case "DONE": case "completed":
        return "bg-chart-2/20 text-chart-2";
      case "FAILED":
        return "bg-chart-5/20 text-chart-5";
      case "BLOCKED":
        return "bg-chart-3/20 text-chart-3";
      case "READY": case "pending":
        return "bg-chart-1/20 text-chart-1";
      case "in_progress":
        return "bg-chart-4/20 text-chart-4";
      default:
        return "bg-muted text-muted-foreground";
    }
  };

  const getStatusDotColor = (status: string) => {
    switch (status) {
      case "DONE": case "completed":
        return "bg-chart-2";
      case "FAILED":
        return "bg-chart-5";
      case "BLOCKED":
        return "bg-chart-3";
      case "READY": case "pending":
        return "bg-chart-1";
      case "in_progress":
        return "bg-chart-4";
      default:
        return "bg-muted-foreground";
    }
  };

  const getStatusLabel = (status: string) => {
    switch (status) {
      case "pending": return "PENDING";
      case "in_progress": return "IN PROGRESS";
      case "completed": return "COMPLETED";
      default: return status;
    }
  };

  if (loading) {
    return (
      <div className="h-screen bg-background flex items-center justify-center">
        <div className="text-muted-foreground">Loading...</div>
      </div>
    );
  }

  if (error && !sessions.length && !planData) {
    return (
      <div className="h-screen bg-background flex items-center justify-center">
        <div className="text-destructive-foreground">Error: {error}</div>
      </div>
    );
  }

  return (
    <div className="h-screen bg-background flex flex-col overflow-hidden">
      {/* Top Bar */}
      <div className="bg-sidebar border-b border-sidebar-border px-4 py-2 flex items-center justify-between shrink-0">
        <div className="flex items-center gap-4">
          <button
            onClick={() => setSidebarCollapsed(!sidebarCollapsed)}
            className="p-1.5 rounded hover:bg-sidebar-accent transition-colors"
            title={sidebarCollapsed ? "Expand sidebar" : "Collapse sidebar"}
          >
            {sidebarCollapsed ? <PanelLeft className="size-4" /> : <PanelLeftClose className="size-4" />}
          </button>
          <div className="flex items-baseline gap-2">
            <h1 className="text-lg font-semibold text-foreground">agent-scope</h1>
            <span className="text-xs text-muted-foreground bg-muted px-2 py-0.5 rounded">v0.4.0</span>
          </div>

          {/* Mode Toggle */}
          <div className="flex items-center bg-muted rounded-lg p-0.5">
            {availableModes.live && (
              <button
                onClick={() => setMode("live")}
                className={`flex items-center gap-1.5 px-3 py-1 rounded text-xs font-medium transition-colors ${
                  mode === "live"
                    ? "bg-background text-foreground shadow-sm"
                    : "text-muted-foreground hover:text-foreground"
                }`}
              >
                <Radio className="size-3" />
                Live
              </button>
            )}
            {availableModes.plan && (
              <button
                onClick={() => setMode("plan")}
                className={`flex items-center gap-1.5 px-3 py-1 rounded text-xs font-medium transition-colors ${
                  mode === "plan"
                    ? "bg-background text-foreground shadow-sm"
                    : "text-muted-foreground hover:text-foreground"
                }`}
              >
                <ClipboardList className="size-3" />
                Plan
              </button>
            )}
          </div>
        </div>

        <div className="flex items-center gap-3">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 size-3.5 text-muted-foreground" />
            <input
              type="text"
              placeholder="Filter..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="bg-background border border-border rounded-lg pl-8 pr-3 py-1.5 text-xs text-foreground placeholder-muted-foreground focus:outline-none focus:border-ring w-48"
            />
          </div>
          <button
            onClick={() => mode === "live" ? fetchSessions() : fetchSnapshot()}
            className="p-1.5 rounded hover:bg-sidebar-accent transition-colors"
          >
            <RefreshCw className="size-3.5 text-muted-foreground" />
          </button>
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 flex overflow-hidden">
        {mode === "live" ? (
          <LiveView
            sessions={sessions}
            selectedSession={selectedSession}
            setSelectedSession={setSelectedSession}
            selectedTask={selectedClaudeTask}
            setSelectedTask={setSelectedClaudeTask}
            searchQuery={searchQuery}
            getStatusColor={getStatusColor}
            getStatusDotColor={getStatusDotColor}
            getStatusLabel={getStatusLabel}
            handleCopyTaskId={handleCopyTaskId}
            copiedTaskId={copiedTaskId}
            sidebarCollapsed={sidebarCollapsed}
          />
        ) : (
          <PlanView
            data={planData}
            selectedTask={selectedTask}
            setSelectedTask={setSelectedTask}
            expandedSlices={expandedSlices}
            toggleSlice={toggleSlice}
            searchQuery={searchQuery}
            getStatusColor={getStatusColor}
            handleCopyTaskId={handleCopyTaskId}
            copiedTaskId={copiedTaskId}
            sidebarCollapsed={sidebarCollapsed}
          />
        )}
      </div>
    </div>
  );
}

/* ===== LIVE VIEW ===== */

function LiveView({
  sessions,
  selectedSession,
  setSelectedSession,
  selectedTask,
  setSelectedTask,
  searchQuery,
  getStatusColor,
  getStatusDotColor,
  getStatusLabel,
  handleCopyTaskId,
  copiedTaskId,
  sidebarCollapsed,
}: {
  sessions: ClaudeSession[];
  selectedSession: ClaudeSession | null;
  setSelectedSession: (s: ClaudeSession) => void;
  selectedTask: ClaudeTask | null;
  setSelectedTask: (t: ClaudeTask | null) => void;
  searchQuery: string;
  getStatusColor: (s: string) => string;
  getStatusDotColor: (s: string) => string;
  getStatusLabel: (s: string) => string;
  handleCopyTaskId: (id: string) => void;
  copiedTaskId: boolean;
  sidebarCollapsed: boolean;
}) {
  if (sessions.length === 0) {
    return (
      <div className="flex-1 flex items-center justify-center">
        <TypingPrompt
          lines={[
            "Start a Claude Code session to see tasks here",
            "npx agent-scope start  →  launch dashboard",
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
      (session.tasks.filter((t) => t.status === "completed").length / session.tasks.length) * 100,
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
      <div className={`bg-sidebar border-r border-sidebar-border flex flex-col transition-all duration-300 overflow-hidden ${
        sidebarCollapsed ? "w-0 border-r-0" : "w-[220px]"
      }`}>
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
                    {session.tasks.filter((t) => t.status === "completed").length}/{session.tasks.length}
                  </span>
                </div>
                <div className="flex items-center justify-between text-[10px] text-muted-foreground/60 mt-1">
                  <span>{timeAgo(session.updatedAt)}</span>
                  {session.tokenUsage && (
                    <span title={`In: ${formatTokens(session.tokenUsage.inputTokens)} | Out: ${formatTokens(session.tokenUsage.outputTokens)} | Cache: ${formatTokens(session.tokenUsage.cacheReadTokens)}`}>
                      {formatTokens(totalTokens(session.tokenUsage))} tok
                    </span>
                  )}
                </div>
              </button>
            ))}
          </div>
        </ScrollArea>
      </div>

      {/* Kanban Board */}
      <div className="flex-1 flex flex-col overflow-hidden">
        {selectedSession ? (
          <div className="flex-1 flex flex-col overflow-hidden">
            {/* Token Usage Bar */}
            {selectedSession.tokenUsage && (
              <div className="bg-sidebar border-b border-sidebar-border px-4 py-2 flex items-center gap-6 text-xs shrink-0">
                <span className="text-muted-foreground font-medium">Tokens:</span>
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
                <span className="text-muted-foreground/60 ml-auto">
                  Total: {formatTokens(totalTokens(selectedSession.tokenUsage))}
                </span>
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
                getStatusColor={getStatusColor}
                getStatusLabel={getStatusLabel}
              />
              <KanbanColumn
                title="In Progress"
                count={inProgress.length}
                tasks={inProgress}
                statusColor="chart-4"
                selectedTask={selectedTask}
                setSelectedTask={setSelectedTask}
                getStatusColor={getStatusColor}
                getStatusLabel={getStatusLabel}
              />
              <KanbanColumn
                title="Completed"
                count={completed.length}
                tasks={completed}
                statusColor="chart-2"
                selectedTask={selectedTask}
                setSelectedTask={setSelectedTask}
                getStatusColor={getStatusColor}
                getStatusLabel={getStatusLabel}
              />
            </div>

            {/* Task Detail Slide-in */}
            {selectedTask && (
              <div className="w-[350px] bg-sidebar border-l border-border flex flex-col shrink-0">
                <div className="p-4 border-b border-border flex items-center justify-between">
                  <span className={`text-xs px-2 py-0.5 rounded font-semibold ${getStatusColor(selectedTask.status)}`}>
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
                      {selectedTask.status === "in_progress" && selectedTask.activeForm && (
                        <p className="text-xs text-chart-4 italic">{selectedTask.activeForm}</p>
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
                            <span key={id} className="text-xs bg-chart-3/20 text-chart-3 px-2 py-0.5 rounded">
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
                            <span key={id} className="text-xs bg-muted text-muted-foreground px-2 py-0.5 rounded">
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
                          <><Check className="size-3 text-chart-2" /><span className="text-chart-2">Copied</span></>
                        ) : (
                          <><Copy className="size-3" /><span>Copy ID: {selectedTask.id}</span></>
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
              <p className="text-muted-foreground">Select a session from the sidebar</p>
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
  getStatusColor,
  getStatusLabel,
}: {
  title: string;
  count: number;
  tasks: ClaudeTask[];
  statusColor: string;
  selectedTask: ClaudeTask | null;
  setSelectedTask: (t: ClaudeTask) => void;
  getStatusColor: (s: string) => string;
  getStatusLabel: (s: string) => string;
}) {
  return (
    <div className="flex-1 min-w-[250px] flex flex-col">
      <div className="flex items-center gap-2 mb-3 px-1">
        <div className={`size-2 rounded-full bg-${statusColor}`} />
        <span className="text-xs font-semibold text-muted-foreground uppercase">{title}</span>
        <span className="text-xs text-muted-foreground/60 bg-muted px-1.5 py-0.5 rounded">{count}</span>
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
                <span className="text-[10px] text-muted-foreground font-mono">#{task.id}</span>
              </div>
              <p className="text-sm text-foreground line-clamp-2 mb-1">{task.subject}</p>
              {task.status === "in_progress" && task.activeForm && (
                <p className="text-xs text-chart-4 italic truncate">{task.activeForm}</p>
              )}
              {task.blockedBy.length > 0 && (
                <div className="flex items-center gap-1 mt-1.5">
                  <span className="text-[10px] bg-chart-3/20 text-chart-3 px-1.5 py-0.5 rounded">
                    Blocked
                  </span>
                </div>
              )}
            </button>
          ))}
          {tasks.length === 0 && (
            <div className="text-center py-8 text-muted-foreground/40 text-xs">No tasks</div>
          )}
        </div>
      </ScrollArea>
    </div>
  );
}

/* ===== PLAN VIEW ===== */

function PlanView({
  data,
  selectedTask,
  setSelectedTask,
  expandedSlices,
  toggleSlice,
  searchQuery,
  getStatusColor,
  handleCopyTaskId,
  copiedTaskId,
  sidebarCollapsed,
}: {
  data: SnapshotResponse | null;
  selectedTask: ComputedTask | null;
  setSelectedTask: (t: ComputedTask | null) => void;
  expandedSlices: Set<string>;
  toggleSlice: (s: string) => void;
  searchQuery: string;
  getStatusColor: (s: string) => string;
  handleCopyTaskId: (id: string) => void;
  copiedTaskId: boolean;
  sidebarCollapsed: boolean;
}) {
  if (!data || !data.snapshot) {
    return (
      <div className="flex-1 p-8">
        <div className="max-w-4xl mx-auto">
          <div className="bg-destructive/10 border border-destructive rounded-lg p-6">
            <h2 className="text-xl font-bold text-destructive-foreground mb-4">
              {data?.queueErrors?.length ? "Queue Parse Errors" : "Plan Mode Not Available"}
            </h2>
            <div className="space-y-2">
              {data?.queueErrors?.map((err, i) => (
                <div key={i} className="text-destructive-foreground text-sm">{err}</div>
              )) || (
                <div className="text-muted-foreground text-sm">
                  Run &quot;agent-scope init&quot; to set up Plan mode
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
        if (!acc[agent]) acc[agent] = { done: 0, failed: 0, totalDuration: 0, taskCount: 0 };
        acc[agent].taskCount++;
        if (task.lastEvent.status === "DONE") acc[agent].done++;
        if (task.lastEvent.status === "FAILED") acc[agent].failed++;
        const dur = task.lastEvent.meta?.duration;
        if (typeof dur === "number") acc[agent].totalDuration += dur;
      }
      return acc;
    },
    {} as Record<string, { done: number; failed: number; totalDuration: number; taskCount: number }>,
  );

  return (
    <>
      {/* Left Sidebar */}
      <div className={`bg-sidebar border-r border-sidebar-border flex flex-col transition-all duration-300 overflow-hidden ${
        sidebarCollapsed ? "w-0 min-w-0 border-r-0" : "w-[25%] min-w-[280px]"
      }`}>
        <ScrollArea className="flex-1">
          <div className="p-3 space-y-3">
            {Object.entries(tasksBySlice).map(([sliceId, tasks]) => (
              <div key={sliceId} className="space-y-2">
                <button
                  onClick={() => toggleSlice(sliceId)}
                  className="w-full flex items-center justify-between px-2 py-1.5 bg-muted rounded text-xs font-semibold text-muted-foreground hover:bg-muted/80 transition-colors"
                >
                  <div className="flex items-center gap-1.5">
                    {expandedSlices.has(sliceId) ? <ChevronDown className="size-3.5" /> : <ChevronRight className="size-3.5" />}
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

      {/* Main Content */}
      <div className="flex-1 flex flex-col overflow-hidden">
        {selectedTask ? (
          <>
            <div className="bg-sidebar border-b border-border p-6">
              <h2 className="text-2xl font-semibold text-foreground mb-3">{selectedTask.description}</h2>
              <div className="flex items-center gap-4 text-sm text-muted-foreground">
                <span>Task: {selectedTask.id}</span>
                <span>&bull;</span>
                <span>Area: {selectedTask.area}</span>
                <span>&bull;</span>
                <span className={`px-2 py-1 rounded text-xs font-semibold ${getStatusColor(selectedTask.status)}`}>
                  {selectedTask.status}
                </span>
                <div className="flex-1" />
                <button
                  onClick={() => handleCopyTaskId(selectedTask.id)}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded hover:bg-accent transition-colors"
                >
                  {copiedTaskId ? (
                    <><Check className="size-3.5 text-chart-2" /><span className="text-chart-2">Copied</span></>
                  ) : (
                    <><Copy className="size-3.5" /><span>Copy ID</span></>
                  )}
                </button>
              </div>
            </div>

            <div className="flex-1 flex overflow-hidden">
              {/* Details */}
              <div className="w-1/2 border-r border-border flex flex-col">
                <div className="bg-sidebar border-b border-border px-4 py-2">
                  <h3 className="text-sm font-semibold text-foreground uppercase tracking-wide">Task Details</h3>
                </div>
                <ScrollArea className="flex-1">
                  <div className="p-6 space-y-6">
                    <div>
                      <h4 className="text-xs font-semibold text-muted-foreground uppercase mb-2">Acceptance Criteria</h4>
                      <p className="text-sm text-foreground/80 leading-relaxed">{selectedTask.acceptanceCriteria}</p>
                    </div>

                    {selectedTask.dependsOn.length > 0 && (
                      <div>
                        <h4 className="text-xs font-semibold text-muted-foreground uppercase mb-2">Dependencies</h4>
                        <div className="space-y-2">
                          {selectedTask.dependsOn.map((depId) => {
                            const depTask = snapshot.tasks.find((t) => t.id === depId);
                            return (
                              <button
                                key={depId}
                                onClick={() => depTask && setSelectedTask(depTask)}
                                className="w-full text-left p-3 rounded-lg bg-card border border-border hover:bg-accent/50 transition-colors"
                              >
                                <div className="flex items-center justify-between">
                                  <span className="text-sm font-mono text-foreground">{depId}</span>
                                  {depTask && (
                                    <span className={`text-xs px-2 py-0.5 rounded font-semibold ${getStatusColor(depTask.status)}`}>
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
                        <h4 className="text-xs font-semibold text-muted-foreground uppercase mb-2">Blocks These Tasks</h4>
                        <div className="space-y-2">
                          {getDependentTasks(selectedTask.id).map((task) => (
                            <button
                              key={task.id}
                              onClick={() => setSelectedTask(task)}
                              className="w-full text-left p-3 rounded-lg bg-card border border-border hover:bg-accent/50 transition-colors"
                            >
                              <div className="flex items-center justify-between">
                                <span className="text-sm font-mono text-foreground">{task.id}</span>
                                <span className={`text-xs px-2 py-0.5 rounded font-semibold ${getStatusColor(task.status)}`}>
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
                        <h4 className="text-xs font-semibold text-muted-foreground uppercase mb-2">Execution</h4>
                        <div className="bg-card rounded-lg p-4 space-y-3 text-sm border border-border">
                          <div className="flex items-center justify-between">
                            <div className="flex items-center gap-2">
                              <span className="text-foreground font-mono">{selectedTask.lastEvent.agent}</span>
                              <span className={`px-2 py-0.5 rounded text-xs font-semibold ${getStatusColor(selectedTask.lastEvent.status)}`}>
                                {selectedTask.lastEvent.status}
                              </span>
                            </div>
                            <span className="text-muted-foreground text-xs">
                              {new Date(selectedTask.lastEvent.timestamp).toLocaleString()}
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
                                <span>{String(selectedTask.lastEvent.meta.stepCount)} steps</span>
                              )}
                            </div>
                          )}

                          {typeof selectedTask.lastEvent.meta?.commit === "string" && (
                            <div className="flex items-center gap-2 px-3 py-2 bg-background rounded-md">
                              <GitCommit className="size-3.5 text-chart-4 shrink-0" />
                              <code className="text-xs text-chart-4 font-mono">
                                {String(selectedTask.lastEvent.meta.commit).slice(0, 7)}
                              </code>
                              <span className="text-xs text-muted-foreground truncate">
                                {String(selectedTask.lastEvent.meta.commitMsg || "")}
                              </span>
                            </div>
                          )}

                          {Array.isArray(selectedTask.lastEvent.meta?.steps) && (
                            <div className="mt-2 pt-3 border-t border-border space-y-1">
                              {(selectedTask.lastEvent.meta.steps as Array<{ type: string; name: string; summary: string; duration: number }>).map(
                                (step, i) => (
                                  <div key={i} className="flex items-start gap-2 py-1.5 px-2 rounded hover:bg-background/50">
                                    <div className="mt-0.5">
                                      {step.type === "thought" && <Brain className="size-3.5 text-chart-4" />}
                                      {step.type === "tool_call" && <Wrench className="size-3.5 text-chart-1" />}
                                      {step.type === "observation" && <Eye className="size-3.5 text-chart-2" />}
                                      {step.type === "error" && <AlertCircle className="size-3.5 text-chart-5" />}
                                    </div>
                                    <div className="flex-1 min-w-0">
                                      <div className="flex items-center justify-between gap-2">
                                        <span className="text-xs font-medium text-foreground truncate">{step.name}</span>
                                        <span className="text-[10px] text-muted-foreground/60 shrink-0">{step.duration}ms</span>
                                      </div>
                                      <p className="text-xs text-muted-foreground/80 truncate">{step.summary}</p>
                                    </div>
                                  </div>
                                ),
                              )}
                            </div>
                          )}

                          {selectedTask.lastEvent.meta && !Array.isArray(selectedTask.lastEvent.meta.steps) && (
                            <div className="mt-2 pt-3 border-t border-border">
                              <pre className="text-xs text-muted-foreground bg-background p-2 rounded overflow-auto">
                                {JSON.stringify(selectedTask.lastEvent.meta, null, 2)}
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
                  <h3 className="text-sm font-semibold text-foreground uppercase tracking-wide">Overview</h3>
                </div>
                <ScrollArea className="flex-1">
                  <div className="p-6 space-y-6">
                    <div className="grid grid-cols-2 gap-3">
                      <div className="bg-card border border-border rounded-lg p-4">
                        <div className="text-2xl font-bold text-foreground">{snapshot.summary.total}</div>
                        <div className="text-xs text-muted-foreground mt-1">Total Tasks</div>
                      </div>
                      <div className="bg-card border border-chart-2/30 rounded-lg p-4">
                        <div className="text-2xl font-bold text-chart-2">{snapshot.summary.done}</div>
                        <div className="text-xs text-muted-foreground mt-1">Done</div>
                      </div>
                      <div className="bg-card border border-chart-5/30 rounded-lg p-4">
                        <div className="text-2xl font-bold text-chart-5">{snapshot.summary.failed}</div>
                        <div className="text-xs text-muted-foreground mt-1">Failed</div>
                      </div>
                      <div className="bg-card border border-chart-3/30 rounded-lg p-4">
                        <div className="text-2xl font-bold text-chart-3">{snapshot.summary.blocked}</div>
                        <div className="text-xs text-muted-foreground mt-1">Blocked</div>
                      </div>
                      <div className="bg-card border border-chart-1/30 rounded-lg p-4">
                        <div className="text-2xl font-bold text-chart-1">{snapshot.summary.ready}</div>
                        <div className="text-xs text-muted-foreground mt-1">Ready</div>
                      </div>
                      <div className="bg-card border border-border rounded-lg p-4">
                        <div className="text-2xl font-bold text-foreground">
                          {Math.round(snapshot.summary.successRate * 100)}%
                        </div>
                        <div className="text-xs text-muted-foreground mt-1">Success Rate</div>
                      </div>
                    </div>

                    <div>
                      <h4 className="text-xs font-semibold text-muted-foreground uppercase mb-3">Slice Progress</h4>
                      <div className="space-y-3">
                        {Object.entries(snapshot.slices).map(([sliceId, slice]) => (
                          <div key={sliceId} className="bg-card border border-border rounded-lg p-4">
                            <div className="flex justify-between mb-2">
                              <span className="font-semibold text-foreground">{sliceId}</span>
                              <span className="text-muted-foreground text-sm">
                                {slice.done}/{slice.total} ({slice.progress}%)
                              </span>
                            </div>
                            <div className="w-full bg-muted rounded-full h-2">
                              <div className="bg-chart-2 h-2 rounded-full transition-all" style={{ width: `${slice.progress}%` }} />
                            </div>
                            <div className="flex gap-4 mt-3 text-xs">
                              <span className="text-chart-2">Done: {slice.done}</span>
                              <span className="text-chart-5">Failed: {slice.failed}</span>
                              <span className="text-chart-3">Blocked: {slice.blocked}</span>
                              <span className="text-chart-1">Ready: {slice.ready}</span>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>

                    {Object.keys(agentStats).length > 0 && (
                      <div>
                        <h4 className="text-xs font-semibold text-muted-foreground uppercase mb-3">Agent Activity</h4>
                        <div className="space-y-2">
                          {Object.entries(agentStats).map(([agent, stats]) => (
                            <div key={agent} className="bg-card border border-border rounded-lg p-4">
                              <div className="flex items-center justify-between mb-2">
                                <div className="flex items-center gap-2">
                                  <Bot className="size-4 text-chart-4" />
                                  <span className="font-mono text-sm text-foreground">{agent}</span>
                                </div>
                                <span className="text-xs text-muted-foreground">{stats.taskCount} tasks</span>
                              </div>
                              <div className="flex gap-3 text-xs">
                                <span className="text-chart-2">{stats.done} done</span>
                                {stats.failed > 0 && <span className="text-chart-5">{stats.failed} failed</span>}
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
                "agent-scope init  →  create .agent-scope/",
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
