# Architecture

## Data Flow

```
┌─────────────────────────────────────────────────────────────────────┐
│  Claude Code session (agent process)                                │
│                                                                     │
│  TodoWrite tool ──────────────► ~/.claude/tasks/<session-id>.json  │
│  execution.log  ──────────────► .claudedash/execution.log         │
│  queue.md       ──────────────► .claudedash/queue.md              │
└──────────────────────┬──────────────────────────────────────────────┘
                       │ filesystem changes
                       ▼
┌─────────────────────────────────────────────────────────────────────┐
│  claudedash server (Fastify)                                       │
│                                                                     │
│  watcher.ts (chokidar)                                              │
│    watches ~/.claude/ and .claudedash/                             │
│    emits WatchEvent { type: 'sessions' | 'plan' }                  │
│         │                                                           │
│         ▼                                                           │
│  routes/live.ts                    routes/plan.ts                  │
│    /health   → mode detection        /snapshot  → queue + log      │
│    /events   → SSE broadcast         /insights  → analytics        │
│    /sessions → todoReader            /quality-timeline             │
│    /sessions/:id                     /claude-insights              │
│                                                                     │
│  routes/observability.ts                                            │
│    /worktrees → git worktree detection + session mapping            │
└──────────────────────┬──────────────────────────────────────────────┘
                       │ HTTP / SSE
                       ▼
┌─────────────────────────────────────────────────────────────────────┐
│  Dashboard (Next.js, served as static export)                       │
│                                                                     │
│  page.tsx (layout shell, ~150 lines)                                │
│    top bar: mode toggle, search, sidebar collapse                   │
│    routes to: LiveView | PlanView | InsightsView | WorktreePanel   │
│                                                                     │
│  hooks/useSessions.ts          hooks/usePlanSnapshot.ts            │
│    EventSource('/events/')        EventSource('/events/')           │
│    on 'sessions' → fetchSessions  on 'plan' → fetchSnapshot        │
│    returns { sessions,            returns { data, refresh }        │
│              selectedSession }                                      │
│         │                                  │                        │
│         ▼                                  ▼                        │
│  views/LiveView.tsx            views/PlanView.tsx                  │
│    session sidebar                task tree sidebar                 │
│    kanban: pending/active/done    task detail + quality timeline    │
│    token usage bar                execution log + agent stats       │
│    context health widget                                            │
│                                                                     │
│  views/InsightsView.tsx                                             │
│    iframe → /claude-insights (HTML report)                          │
│    TypingPrompt if no report yet                                    │
└─────────────────────────────────────────────────────────────────────┘
```

## Module Responsibilities

### Core (`src/core/`)

| Module | Input | Output |
|--------|-------|--------|
| `todoReader.ts` | `~/.claude/` directory | `ClaudeSession[]` with tasks + token usage |
| `contextHealth.ts` | `ClaudeSession` | `ContextHealth { percentage, warningLevel }` |
| `queueParser.ts` | `queue.md` content | `{ tasks: QueueTask[], errors: string[] }` |
| `logParser.ts` | `execution.log` content | `{ events: LogEvent[], errors: string[] }` |
| `stateEngine.ts` | queue tasks + log events | `Snapshot` with computed statuses |
| `qualityTimeline.ts` | `execution.log` content | `QualityEvent[]` (quality check results) |
| `insightsEngine.ts` | sessions + snapshot | `LiveInsights` / `PlanInsights` |
| `worktreeDetector.ts` | `cwd` | `WorktreeInfo[]` from `git worktree list` |
| `worktreeMapper.ts` | sessions + worktrees | worktrees with associated session/task data |

### Server (`src/server/`)

| Module | Responsibility |
|--------|----------------|
| `server.ts` | Fastify init, CORS, plugin registration, static serving |
| `watcher.ts` | chokidar file watch → `WatchEvent` EventEmitter |
| `routes/live.ts` | Live mode HTTP routes + SSE management |
| `routes/plan.ts` | Plan mode HTTP routes (queue/log reads per request) |
| `routes/observability.ts` | Worktree detection and mapping |

## How SSE Works End-to-End

1. **File change**: Claude Code (or the agent) writes to `tasks.json`, `queue.md`, or `execution.log`.

2. **Watcher fires**: `watcher.ts` (chokidar) detects the change and emits a `WatchEvent`:
   ```ts
   { type: 'sessions' }   // for .claude/tasks/* changes
   { type: 'plan' }       // for .claudedash/* changes
   ```

3. **SSE broadcast**: `routes/live.ts` has registered a `change` listener on the emitter. When it fires, it writes the event to all open SSE connections:
   ```
   data: {"type":"sessions"}\n\n
   ```

4. **Dashboard receives**: A module-level singleton `EventSource` (managed by `useSSEEvents.ts`) holds the single `/events/` connection. All hooks subscribe via `useSSEEvents(handler)` — the handler checks the event type and triggers the appropriate fetch.

5. **UI updates**: React re-renders with fresh data — typically within ~100ms of the file change.

### One shared EventSource connection

`useSessions`, `usePlanSnapshot`, and `useNotifications` all share a single `/events/` connection via a pub/sub singleton in `useSSEEvents.ts`. Each hook subscribes a handler; the singleton dispatches incoming events to all subscribers. This eliminates redundant keep-alive traffic and reduces browser connection overhead.

## Performance Trade-offs

### What was implemented (P0)

All hot-path caching and connection deduplication has been applied:

| Layer | Change |
|-------|--------|
| Frontend | 3 EventSource connections → 1 shared singleton (`useSSEEvents.ts`) |
| Frontend | `/billing-block` client poll 15s → 5min; `/history` SSE-triggered only |
| Server | `/history` mtime-based cache — re-parses only when `history.jsonl` changes |
| Server | `/billing-block` 60s TTL cache — avoids full JSONL project scan on every request |
| Server | `/sessions` emitter-invalidated cache — `readSessions()` result reused until watcher fires |
| Server | `/snapshot` mtime cache on `queue.md` + `execution.log` — skips parse when files unchanged |

### What was intentionally deferred (P1)

**Streaming / tail-based JSONL parser**

`/history` and `/billing-block` currently read the full file then parse. A stream/tail approach would lower peak memory for very large files (100k+ lines). Deferred because:
- The server-side cache already absorbs the per-request cost; the expensive read happens only once per file change.
- `history.jsonl` grows slowly (one entry per user prompt); reaching 100k lines requires years of heavy daily use.
- Adding a streaming parser increases code complexity with no measurable benefit at current scale.

**Optional SQLite index layer**

Competing tools (e.g. `multi-agent-observability`) use SQLite for indexed queries. Deferred because:
- claudedash is a zero-dependency local tool (`npx claudedash`). Introducing SQLite adds a native build dependency and complicates installation on some platforms.
- The file-based model with in-memory caching is sufficient for the target use case (single developer, one machine, ≤ a few thousand sessions).
- If a user reaches a scale where file-based reads become a real bottleneck, an opt-in SQLite mode can be added as a separate backend adapter without changing the route layer.

**Performance regression tests**

Automated benchmarks (1k/5k/10k tasks, 100k history lines, p95 targets) were not added because:
- claudedash has no CI test suite today; adding perf tests before unit tests would create an unbalanced test pyramid.
- Synthetic benchmarks on a local filesystem are environment-sensitive and would produce noisy results in CI.
- The correct sequencing is: unit/integration tests first, then perf regression gates on top.
