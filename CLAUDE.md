## General Rules

- Minimize file creation and token usage.
- Always prefer editing existing files over creating new ones.
- Do not create new files unless absolutely necessary.
- Do not create shell scripts unless explicitly requested.

## Workflow

- If workflow documents, task documents, predefined plans, or execution specs exist in the repository, follow them autonomously.
- Do NOT ask what to do next when an execution path is already defined.
- Only ask questions when there is a real ambiguity, missing requirement, or hard blocker.
- Avoid scope expansion beyond the defined plan.

## Debugging Rules

- When fixing bugs, attempt a maximum of 2 solutions.
- If both attempts fail, STOP immediately.
- Re-analyze the root cause before proceeding.
- Clearly explain the new hypothesis before writing additional code.
- Do not iterate blindly with small variations.

- After modifying authentication-related logic, audit ALL screens, tabs, and modules that perform API calls.
- Ensure coverage consistency across the entire authenticated surface — not only the screen that exposed the issue.

# Agent Scope Integration

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
{
  "task_id": "S1-T1",
  "status": "DONE",
  "timestamp": "2026-01-15T10:30:00Z",
  "agent": "claude"
}
```

Status values: `DONE`, `FAILED`, `BLOCKED` (requires `reason` field)

## Dashboard

Run `npx claudedash start` to view progress.
