export type TaskStatus = "READY" | "BLOCKED" | "DONE" | "FAILED";

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
  isStale?: boolean;
}

export interface TokenUsage {
  inputTokens: number;
  outputTokens: number;
  cacheCreationTokens: number;
  cacheReadTokens: number;
  /** Tokens from the most recent API call only — used for context health estimation. */
  lastInputTokens?: number;
  lastCacheReadTokens?: number;
}

export interface ClaudeSession {
  id: string;
  tasks: ClaudeTask[];
  createdAt: string;
  updatedAt: string;
  projectName?: string;
  cwd?: string;
  tokenUsage?: TokenUsage;
  contextHealth?: ContextHealth | null;
}

export interface Task {
  id: string;             // S1-T1
  slice: string;          // S1
  area: string;
  description: string;
  acceptanceCriteria: string;
  dependsOn: string[];
  extra?: Record<string, string>;
}

export interface LogEvent {
  task_id: string;
  status: "DONE" | "FAILED" | "BLOCKED";
  timestamp: string;      // ISO-8601
  agent: string;
  reason?: string;        // Required when status is BLOCKED
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
    progress: number;     // percentage
  }>;
  summary: {
    total: number;
    done: number;
    failed: number;
    blocked: number;
    ready: number;
    successRate: number;  // done / (done + failed)
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
    avgTaskDuration: number; // in minutes
  };
  bottlenecks: Array<{
    taskId: string;
    blocksCount: number; // how many tasks it blocks
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

// Quality Gates types
export interface QualityChecks {
  lint?: boolean;
  typecheck?: boolean;
  test?: boolean;
}

export interface QualityEvent {
  timestamp: string;      // ISO-8601
  file: string;           // File path that was checked
  checks: QualityChecks;  // Results of quality checks
  taskId?: string;        // Associated task ID
  sessionId?: string;     // Associated session ID
}

// Context Health types
export type ContextWarningLevel = 'safe' | 'warn' | 'critical';

export interface ContextHealth {
  percentage: number;              // 0-100, estimated context usage
  warningLevel: ContextWarningLevel; // safe: <65%, warn: 65-74%, critical: 75%+
  tokensUsed: number;              // Current tokens in context
  maxTokens?: number;              // Max tokens if known
  estimationMethod?: string;       // How percentage was calculated
}

// Context Snapshot types (used by `claudedash snapshot` / `claudedash recover`)
export interface ContextSnapshot {
  schemaVersion: 1;
  capturedAt: string;       // ISO timestamp
  cwd: string;
  focus?: string;           // Optional --focus message
  commitHash?: string;      // Git commit hash when snapshotted (--commit flag)
  git: {
    branch: string;
    dirty: boolean;
    changedFiles: string[]; // max 20
    recentCommits: string[]; // max 5, format: "abc1234 commit msg"
  };
  tasks: {
    inProgress: { id: string; description: string } | null;
    ready: { id: string; description: string }[];  // max 5
    doneIds: string[];      // last 10 DONE task IDs
    failedIds: string[];
    blockedIds: string[];
    summary: { total: number; done: number; ready: number; failed: number; blocked: number };
  };
  execution: {
    lastEntries: { task_id: string; status: string; timestamp: string; reason?: string }[];
  };
}

// Worktree Observability types
export interface WorktreeState {
  path: string;           // Absolute path to worktree
  branch: string;         // Current branch name
  head: string;           // Commit SHA
  dirty: boolean;         // Has uncommitted changes
  aheadCount: number;     // Commits ahead of upstream
  behindCount: number;    // Commits behind upstream
  isClaudeManaged: boolean;  // True if inside .claude/worktrees/
  worktreeName?: string;     // Extracted name (basename) for Claude-managed worktrees
  associatedTasks?: Array<{
    sessionId: string;
    taskId: string;
    taskSubject: string;
  }>;
}
