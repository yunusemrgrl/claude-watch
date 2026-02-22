# PostToolUse Hook — Quality Gate

Runs automatically after Bash, Edit, or Write tool calls.
Register in Claude Code settings under Hooks → PostToolUse.

## Purpose
Run lint and typecheck after every code change and record results
in execution.log so the Quality Gates dashboard panel can display them.

## Hook Configuration

```json
{
  "hook": "PostToolUse",
  "matcher": { "tool_name": ["Bash", "Edit", "Write"] },
  "command": "npm run lint --silent 2>/dev/null && npx tsc --noEmit 2>/dev/null",
  "on_success": {
    "append_to": ".claudedash/execution.log",
    "line": {"task_id":"{{task_id}}","status":"QUALITY","timestamp":"{{iso}}","agent":"claude","meta":{"quality":{"lint":true,"typecheck":true}}}
  },
  "on_failure": {
    "append_to": ".claudedash/execution.log",
    "line": {"task_id":"{{task_id}}","status":"QUALITY","timestamp":"{{iso}}","agent":"claude","meta":{"quality":{"lint":false,"typecheck":false}}}
  }
}
```

## Manual Usage

After any code change, run:
```bash
npm run lint && npx tsc --noEmit
```
Then append to execution.log:
```json
{"task_id":"S1-T1","status":"QUALITY","timestamp":"2026-01-15T10:30:00Z","agent":"claude","meta":{"quality":{"lint":true,"typecheck":true}}}
```
