// Plan mode types (queue.md)
export type TaskStatus = "READY" | "BLOCKED" | "DONE" | "FAILED";

export interface Task {
  id: string;
  slice: string;
  area: string;
  description: string;
  acceptanceCriteria: string;
  dependsOn: string[];
}

export interface LogEvent {
  task_id: string;
  status: "DONE" | "FAILED" | "BLOCKED";
  timestamp: string;
  agent: string;
  reason?: string;
  meta?: Record<string, unknown>;
}

export interface ComputedTask extends Task {
  status: TaskStatus;
  lastEvent?: LogEvent;
}

export interface Snapshot {
  tasks: ComputedTask[];
  slices: Record<string, {
    total: number;
    done: number;
    failed: number;
    blocked: number;
    ready: number;
    progress: number;
  }>;
  summary: {
    total: number;
    done: number;
    failed: number;
    blocked: number;
    ready: number;
    successRate: number;
  };
}

export interface SnapshotResponse {
  snapshot: Snapshot | null;
  queueErrors: string[];
  logErrors: string[];
  meta: {
    generatedAt: string;
    totalTasks: number;
  };
}

// Live mode types (Claude Code TodoWrite)
export type ClaudeTaskStatus = "pending" | "in_progress" | "completed";

export interface ClaudeTask {
  id: string;
  subject: string;
  description: string;
  activeForm: string;
  status: ClaudeTaskStatus;
  blocks: string[];
  blockedBy: string[];
}

export interface TokenUsage {
  inputTokens: number;
  outputTokens: number;
  cacheCreationTokens: number;
  cacheReadTokens: number;
}

export interface ClaudeSession {
  id: string;
  tasks: ClaudeTask[];
  createdAt: string;
  updatedAt: string;
  projectName?: string;
  cwd?: string;
  tokenUsage?: TokenUsage;
}

export interface SessionsResponse {
  sessions: ClaudeSession[];
}

export interface HealthResponse {
  status: string;
  modes: {
    live: boolean;
    plan: boolean;
  };
}

// Insights types
export interface TimelineDataPoint {
  timestamp: string;
  completed: number;
  failed: number;
  total: number;
}

export interface PlanInsights {
  summary: {
    totalTasks: number;
    completedTasks: number;
    failedTasks: number;
    blockedTasks: number;
    successRate: number;
    completionRate: number;
  };
  timeline: TimelineDataPoint[];
  sliceStats: Record<string, {
    name: string;
    total: number;
    completed: number;
    failed: number;
    blocked: number;
    progress: number;
  }>;
  velocity: {
    tasksPerHour: number;
    tasksPerDay: number;
    avgTaskDuration: number;
  };
  bottlenecks: Array<{
    taskId: string;
    blocksCount: number;
    description: string;
  }>;
}

export interface LiveInsights {
  summary: {
    totalSessions: number;
    activeSessions: number;
    totalTasks: number;
    completedTasks: number;
    inProgressTasks: number;
    pendingTasks: number;
  };
  timeline: TimelineDataPoint[];
  tokenUsage: {
    total: number;
    input: number;
    output: number;
    cacheCreation: number;
    cacheRead: number;
  };
  topSessions: Array<{
    id: string;
    taskCount: number;
    completedCount: number;
    projectName?: string;
    lastActivity: string;
  }>;
}

export interface InsightsResponse {
  mode: 'live' | 'plan' | 'both';
  live?: LiveInsights;
  plan?: PlanInsights;
  generatedAt: string;
}
