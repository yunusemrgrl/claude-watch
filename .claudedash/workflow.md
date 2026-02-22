# Agent Workflow

Autonomous execution protocol for claudedash Plan mode.
Each task from `queue.md` is processed through these phases.

---

## Phase 0 — BOOTSTRAP (run once at session start)

1. Read `.claudedash/CLAUDE.md` — mandatory project rules (TodoWrite, MCP tools, pre-commit checklist).
2. Read `.claudedash/queue.md` — full task list.
3. Read `.claudedash/execution.log` — understand what is already DONE/FAILED/BLOCKED.
4. Identify all READY tasks: dependencies satisfied, not yet in execution.log as DONE.

If claudedash MCP is configured (`claude mcp list` shows `claudedash`), use `get_queue` instead of reading files manually.

---

## Phase 1 — INTAKE

Read the next READY task from `.claudedash/queue.md`.

1. Parse the task: ID, Area, Description, AC, Dependencies.
2. Verify all dependencies have status DONE in `execution.log`.
3. If dependencies are not met, log BLOCKED and move to next task.

---

## Phase 2 — EXECUTE

Implement the task.

1. Read the task description and acceptance criteria carefully.
2. Identify affected files using the codebase.
3. Implement the change. Follow existing conventions.
4. Run relevant tests/linters to verify the AC is met.

---

## Phase 3 — VERIFY (mandatory before logging DONE)

Run the full pre-commit checklist. Never skip.

```
npm run lint                              # 0 errors required
npx tsc --noEmit                          # server/CLI types
cd dashboard && npx tsc --noEmit && cd .. # dashboard types
npm run build                             # full build must succeed
```

If any step fails: fix it, re-run, then proceed to Phase 4.

---

## Phase 4 — LOG

Append result to `.claudedash/execution.log` (one JSON line):

Success:
```json
{"task_id":"S1-T1","status":"DONE","timestamp":"2026-01-15T10:30:00Z","agent":"claude"}
```

Failure:
```json
{"task_id":"S1-T1","status":"FAILED","timestamp":"2026-01-15T10:30:00Z","agent":"claude","meta":{"reason":"tests failing"}}
```

Blocked:
```json
{"task_id":"S1-T1","status":"BLOCKED","reason":"missing API key","timestamp":"2026-01-15T10:30:00Z","agent":"claude"}
```

If claudedash MCP is configured, use `log_task` tool instead of writing the file directly.

---

## Phase 5 — NEXT

Pick the next READY task and return to Phase 1.
If no READY tasks remain, stop and report summary.

---

## Rules

1. One task at a time. Finish before starting next.
2. Always run Phase 3 (verify) before Phase 4 (log). Never log DONE without a passing build.
3. Always log to execution.log — never skip Phase 4.
4. If stuck after 2 attempts, log FAILED and move on.
5. Do not modify queue.md — it is read-only for the agent.
6. Use `new Date().toISOString()` for timestamps.
7. Use TodoWrite to track progress — the user monitors the live dashboard.
