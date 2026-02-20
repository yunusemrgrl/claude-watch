# Quality Gates

claudedash can track quality check results (lint, typecheck, test) per task and display them as a chronological timeline in the Plan mode dashboard.

## Logging quality checks

When your agent completes a task, append a log entry to `.claudedash/execution.log` that includes a `meta.quality` field:

```json
{
  "task_id": "F1-2",
  "status": "DONE",
  "timestamp": "2026-02-18T12:05:00Z",
  "agent": "claude",
  "meta": {
    "file": "src/core/logParser.ts",
    "quality": {
      "lint": true,
      "typecheck": true,
      "test": false
    }
  }
}
```

### Fields

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `quality.lint` | `boolean` | No | Did lint pass? |
| `quality.typecheck` | `boolean` | No | Did TypeScript type check pass? |
| `quality.test` | `boolean` | No | Did tests pass? |
| `meta.file` | `string` | No | File or module that was checked (used as display label). Falls back to `task_id` if omitted. |

All three quality fields are optional — include only the checks you ran.

### Example CLAUDE.md instruction for agents

Add this to your project's `CLAUDE.md` to instruct your agent to log quality results:

```markdown
After completing a task, log quality check results to .claudedash/execution.log:
{
  "task_id": "<ID>",
  "status": "DONE",
  "timestamp": "<ISO-8601>",
  "agent": "claude",
  "meta": {
    "file": "<file-or-module>",
    "quality": {
      "lint": <true|false>,
      "typecheck": <true|false>,
      "test": <true|false>
    }
  }
}
```

## Viewing quality results

Open the **Plan** tab in the dashboard and click any task. If quality check data exists for that task, a **Quality Checks** section appears below the slice progress stats, showing:

- A badge for each check (✅ pass / ❌ fail)
- The file or module that was checked
- The timestamp of the check

## API

```
GET /quality-timeline
GET /quality-timeline?taskId=F1-2
```

Returns `{ events: QualityEvent[] }` sorted chronologically. The optional `taskId` query parameter filters to a specific task.

## Data validation

The parser validates that all quality values are booleans. Non-boolean values (strings, numbers, null) cause the log line to be rejected. Existing log entries without a `quality` field continue to work unchanged.
