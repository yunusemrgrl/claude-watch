# claudedash Integration

## Task Tracking (MANDATORY)

You MUST use the TodoWrite tool to track your work. This is not optional.
The user monitors your progress via a live dashboard that reads TodoWrite output.

Rules:
- At the START of any multi-step task, create a todo list with all steps.
- Mark each task as `in_progress` BEFORE you start working on it.
- Mark each task as `completed` IMMEDIATELY after finishing it.
- Keep exactly ONE task as `in_progress` at any time.
- Update the todo list as you discover new subtasks.

If you skip TodoWrite, the user cannot see what you are doing.

## Plan Mode (if .claudedash/queue.md exists)

Follow `.claudedash/workflow.md` for structured task execution.
Tasks are defined in `.claudedash/queue.md`.
Log progress to `.claudedash/execution.log`.

Log format (append one JSON line per task):
```json
{"task_id":"S1-T1","status":"DONE","timestamp":"2026-01-15T10:30:00Z","agent":"claude"}
```

Status values: `DONE`, `FAILED`, `BLOCKED` (requires `reason` field)

## Dashboard

Run `npx -y claudedash@latest start` to view progress.

## MCP Tools (if claudedash MCP is configured)

If `claudedash` is registered as an MCP server, use these tools instead of reading files:
- `get_queue` — task list with computed READY/DONE/BLOCKED statuses
- `get_sessions` — active Claude Code sessions
- `get_billing_block` — current cost and billing block status
- `log_task` — log task result (preferred over writing execution.log directly)
- `get_agents` — registered agent list

Register once: `claude mcp add claudedash -- npx -y claudedash@latest mcp`

## Quick Status

`npx claudedash status` — single-line summary without opening the browser.
