# Stop Hook

Prevents the agent from stopping mid-task.
Register as a Stop hook in Claude Code settings.

## Purpose
If there are pending tasks in the queue, remind the agent to continue.

## Logic (loop_limit: 3)

```json
{
  "hook": "Stop",
  "loop_limit": 3,
  "condition": "pending tasks remain in .claudedash/queue.md not in execution.log",
  "followup_message": "There are still pending tasks in .claudedash/queue.md. Check .claudedash/workflow.md and continue with the next READY task. Do not stop until all tasks are DONE or BLOCKED."
}
```

## How to Install

Add to your Claude Code hooks configuration:
1. Open Claude Code settings
2. Navigate to Hooks → Stop
3. Paste the JSON block above
4. Set loop_limit to 3 to prevent infinite loops
