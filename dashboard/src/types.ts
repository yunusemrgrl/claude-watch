// Plan mode types (queue.md)
export type TaskStatus = "READY" | "BLOCKED" | "DONE" | "FAILED";

interface Task {
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
  // Enriched from session-meta
  linesAdded?: number;
  gitCommits?: number;
  languages?: Record<string, number>;
  durationMinutes?: number;
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
  connectedClients?: number;
  lastSessions?: string | null;
}

// Insights types
interface TimelineDataPoint {
  timestamp: string;
  completed: number;
  failed: number;
  total: number;
}


// Quality Gates types
export interface QualityChecks {
  lint?: boolean;
  typecheck?: boolean;
  test?: boolean;
}

export interface QualityEvent {
  timestamp: string;
  file: string;
  checks: QualityChecks;
  taskId?: string;
  sessionId?: string;
}

export interface QualityTimelineResponse {
  events: QualityEvent[];
}

// Context Health types
export type ContextWarningLevel = 'safe' | 'warn' | 'critical';

export interface ContextHealth {
  percentage: number;
  warningLevel: ContextWarningLevel;
  tokensUsed: number;
  maxTokens?: number;
  estimationMethod?: string;
}

// Activity / Stats types (from stats-cache.json + session-meta)
export interface DailyActivity {
  date: string;
  messageCount: number;
  sessionCount: number;
  toolCallCount: number;
}

export interface ModelUsageEntry {
  inputTokens: number;
  outputTokens: number;
  cacheReadInputTokens: number;
  cacheCreationInputTokens: number;
  costUSD?: number;
}

export interface UsageStats {
  totalSessions: number;
  totalMessages: number;
  firstSessionDate: string | null;
  longestSession: { sessionId: string; duration: number; messageCount: number; timestamp: string } | null;
  hourCounts: Record<string, number>;
  modelUsage: Record<string, ModelUsageEntry>;
  dailyActivity: DailyActivity[];
  lastComputedDate: string | null;
}

export interface ActivitySession {
  sessionId: string;
  projectPath: string | null;
  projectName: string | null;
  startTime: string | null;
  durationMinutes: number | null;
  userMessageCount: number;
  assistantMessageCount: number;
  toolCounts: Record<string, number>;
  languages: Record<string, number>;
  gitCommits: number;
  gitPushes: number;
  inputTokens: number;
  outputTokens: number;
  linesAdded: number;
  linesRemoved: number;
  filesModified: number;
  firstPrompt: string | null;
  toolErrors: number;
  usesMcp: boolean;
  usesWebSearch: boolean;
  usesTaskAgent: boolean;
  userInterruptions: number;
}

export interface ActivitySessionsResponse {
  sessions: ActivitySession[];
  total: number;
}

// Facets types (from ~/.claude/usage-data/facets/)
export interface FacetSession {
  sessionId: string;
  outcome: string;
  helpfulness: string;
  sessionType: string | null;
  goal: string | null;
  briefSummary: string | null;
  frictionDetail: string | null;
  frictionCounts: Record<string, number>;
  goalCategories: Record<string, number>;
  primarySuccess: string | null;
  satisfiedCount: number;
  dissatisfiedCount: number;
}

export interface FacetsAggregate {
  totalSessions: number;
  outcomeCounts: Record<string, number>;
  helpfulnessCounts: Record<string, number>;
  topFriction: { type: string; count: number }[];
  satisfactionRate: number | null;
  satisfiedTotal: number;
  dissatisfiedTotal: number;
}

export interface FacetsResponse {
  sessions: FacetSession[];
  aggregate: FacetsAggregate | null;
}

// Conversation analytics types (from ~/.claude/projects/ JSONL)
export interface ConversationSession {
  sessionId: string;
  cwd: string | null;
  projectName: string | null;
  messageCount: number;
  toolCounts: Record<string, number>;
  topTools: { name: string; count: number }[];
  errorCount: number;
  fileOps: { read: number; write: number; edit: number };
}

export interface ConversationsAggregate {
  totalConversations: number;
  topTools: { name: string; count: number }[];
  totalToolCalls: number;
  totalErrors: number;
  errorRate: number;
}

export interface ConversationsResponse {
  sessions: ConversationSession[];
  aggregate: ConversationsAggregate | null;
}

// Cost types
export interface ModelCostEntry {
  model: string;
  inputTokens: number;
  outputTokens: number;
  cacheRead: number;
  cacheCreate: number;
  estimatedCostUSD: number | null;
}

export interface CostResponse {
  totalCostUSD: number;
  perModel: ModelCostEntry[];
  disclaimer: string;
}

// History types (from ~/.claude/history.jsonl)
export interface HistoryPrompt {
  display: string;
  timestamp: string;
  project: string;
  projectName: string | null;
  sessionId: string;
}

export interface HistoryResponse {
  prompts: HistoryPrompt[];
  topProjects: { path: string; name: string; count: number }[];
  total: number;
}

// Plans types (from ~/.claude/plans/*.md)
export interface Plan {
  id: string;
  filename: string;
  title: string;
  createdAt: string;
  content: string;
}

export interface PlansResponse {
  plans: Plan[];
}

// Billing block types (5-hour rolling window)
export interface BillingBlock {
  active: boolean;
  blockStart?: string;
  blockEnd?: string;
  minutesElapsed?: number;
  minutesRemaining?: number;
  tokensUsed?: number;
  breakdown?: { input: number; output: number; cacheCreate: number; cacheRead: number };
  estimatedCostUSD?: number;
}

// Hook event types
export interface HookEvent {
  type: 'hook';
  event: string;
  tool?: string;
  session?: string;
  cwd?: string;
  receivedAt: string;
}

export interface HookEventsResponse {
  events: HookEvent[];
}

// Agent API types
export interface AgentRecord {
  agentId: string;
  name: string;
  sessionId: string | null;
  taskId: string | null;
  status: string;
  registeredAt: string;
  lastSeen: string;
  isStale: boolean;
}

export interface QueueSummary {
  total: number;
  done: number;
  failed: number;
  blocked: number;
  ready: number;
}

export interface AgentsResponse {
  agents: AgentRecord[];
}

export interface QueueResponse {
  tasks: {
    id: string;
    area: string;
    slice: string;
    description: string;
    dependsOn: string[];
    status: string;
    lastEvent: unknown;
  }[];
  summary: QueueSummary;
  errors: string[];
}

// Worktree types
export interface WorktreeAssociatedTask {
  sessionId: string;
  taskId: string;
  taskSubject: string;
}

export interface WorktreeState {
  path: string;
  branch: string;
  head: string;
  dirty: boolean;
  aheadCount: number;
  behindCount: number;
  isClaudeManaged: boolean;
  worktreeName?: string;
  associatedTasks?: WorktreeAssociatedTask[];
}

// CLAUDE.md editor types
export interface ClaudeMdFile {
  path: string | null;
  content: string;
  exists: boolean;
}

export interface ClaudeMdResponse {
  plan: ClaudeMdFile;
  project: ClaudeMdFile;
}
