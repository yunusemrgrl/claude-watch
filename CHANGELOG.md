# Changelog

All notable changes to claudedash are documented here.

## [0.5.0] — 2026-02-18

### New Features

#### Quality Gates
- **`meta.quality` support in execution.log** — Log lint, typecheck, and test boolean results per task
- **`parseQualityTimeline()` function** — Reads execution.log and extracts quality events chronologically
- **`GET /quality-timeline` endpoint** — Returns quality events, filterable by `?taskId=`
- **`QualityTimeline` React component** — Displays quality events with pass/fail badges (✅/❌) in Plan mode task detail

#### Context Health Monitoring
- **`estimateContextPercentage()` / `buildContextHealth()`** — Token-based context window usage estimation (see `docs/context-estimation.md`)
- **`GET /sessions` enriched with `contextHealth`** — Each session now includes `{ percentage, warningLevel, tokensUsed, maxTokens }`
- **`ContextHealthWidget` component** — Progress bar with green/yellow/red color coding
- **`ContextHealthMini` component** — Compact inline indicator for session sidebar cards
- **Aggregate context banner** — Live mode header warns when any session crosses 65% or 75%

#### Worktree Observability
- **`detectWorktrees(cwd)`** — Parses `git worktree list --porcelain` output
- **`enrichWorktreeStatus(worktree)`** — Adds dirty flag, ahead/behind counts via git commands
- **`mapTasksToWorktrees(sessions, worktrees)`** — Associates sessions with worktrees by longest-prefix cwd matching
- **`GET /worktrees` endpoint** — Returns enriched worktree state with task associations
- **`WorktreePanel` dashboard component** — New **Worktrees** tab showing branch, dirty state, ahead/behind, and associated tasks

### Type Additions (`src/core/types.ts`)
- `QualityChecks` — `{ lint?, typecheck?, test? }` boolean map
- `QualityEvent` — Quality check result with timestamp, file, checks, taskId
- `ContextWarningLevel` — `'safe' | 'warn' | 'critical'`
- `ContextHealth` — `{ percentage, warningLevel, tokensUsed, maxTokens?, estimationMethod? }`
- `WorktreeState` — `{ path, branch, head, dirty, aheadCount, behindCount, associatedTasks? }`
- `ClaudeSession.contextHealth` — Optional `ContextHealth | null`

### Tests
- 148 tests total (up from 97)
- New test suites: `qualityTimeline`, `contextHealth`, `worktreeDetector`, `worktreeMapper`
- New integration tests: `endpoints.test.ts`, `e2e-smoke.test.ts`

### Documentation
- `docs/quality-gates.md`
- `docs/context-health.md`
- `docs/context-estimation.md`
- `docs/worktrees.md`

---

## [0.4.0] — 2026-02-17

- InsightsView redesign for cleaner fullscreen experience
- TypingPrompt for missing insights report
- Fixed iframe error handling

## [0.3.0] — earlier

- Plan mode with queue.md + execution.log
- SSE real-time updates
- Session sidebar + Kanban board
