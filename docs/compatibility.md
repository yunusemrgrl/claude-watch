# claudedash Compatibility

claudedash reads Claude Code's local files directly — zero server integration required.
This document declares the exact file paths and data formats it depends on.

If Claude Code changes any of these, claudedash will silently return empty data or errors.
Report format compatibility issues via [GitHub Issues](https://github.com/yunusemrgrl/claudedash/issues).

---

## Supported Claude Code Versions

| claudedash version | Claude Code (CLI) | Notes |
|-------------------|-------------------|-------|
| 1.1.x             | ≥ 1.0.0           | Tested with Claude Code CLI shipped via npm |

claudedash does not depend on a specific Claude Code version — it reads file-system artifacts.
If a file path or JSONL schema changes in a future Claude Code release, update this doc and open an issue.

---

## File Paths Read

All paths are relative to the Claude directory, defaulting to `~/.claude/`.

| Path | Purpose | Required |
|------|---------|---------|
| `~/.claude/tasks/` | Live session task files (Kanban cards) — watched for changes | Live mode only |
| `~/.claude/todos/` | Alternate session directory (older Claude Code versions) | Live mode only |
| `~/.claude/projects/*/` | Per-project directories containing JSONL session files | Session context |
| `~/.claude/projects/*/<sessionId>.jsonl` | Full conversation JSONL for a session | Session context, context health |
| `~/.claude/statsCache.json` | Aggregate token usage and cost stats | Cost / billing block |
| `~/.claude/history.jsonl` | User prompt history (one JSON object per line) | Activity / history view |
| `~/.claude/settings.json` | Claude Code settings (for hook installation) | `claudedash hooks install` |
| `~/.claude/usage-data/session-meta/<sessionId>.json` | Per-session enrichment metadata | Optional enrichment |

Plan mode additionally reads from `.claudedash/` in the current working directory:

| Path | Purpose |
|------|---------|
| `.claudedash/queue.md` | Task definitions (read-only for agent) |
| `.claudedash/execution.log` | Task status log (DONE / FAILED / BLOCKED) |
| `.claudedash/config.json` | Configuration (port, taskModel, autoCommit) |
| `.claudedash/workflow.md` | Agent execution protocol |
| `.claudedash/compact-state.json` | Saved task state on PreCompact hook |
| `.claudedash/snapshots/` | Context snapshots directory |
| `.claudedash/context-snapshot.json` | Latest context snapshot |

---

## JSONL Schema (Session Files)

Each line in `~/.claude/projects/*/<sessionId>.jsonl` is a JSON object. Fields relied upon:

| Field | Type | Purpose |
|-------|------|---------|
| `type` | `"user"` \| `"assistant"` \| `"summary"` | Message role |
| `uuid` | string | Unique message ID |
| `sessionId` | string | Session identifier |
| `cwd` | string | Working directory when message was sent |
| `message.content` | string \| array | Message content (text blocks and tool_use blocks) |
| `message.content[].type` | `"text"` \| `"tool_use"` | Content block type |
| `message.content[].name` | string | Tool name (when type = tool_use) |
| `message.usage.inputTokens` | number | Input tokens for this turn |
| `message.usage.cacheReadInputTokens` | number | Cache-read tokens (counted toward context fill) |
| `message.usage.outputTokens` | number | Output tokens for this turn |
| `costUSD` | number | Cost for this turn in USD |

Context health is calculated as:
```
(inputTokens + cacheReadInputTokens) / contextWindowSize
```
where `contextWindowSize` defaults to `200000` (Claude 3.5 Sonnet).

---

## statsCache.json Schema

Used by the billing block and cost endpoint:

```json
{
  "totalCostUSD": 12.34,
  "billingPeriodStartTime": 1700000000000,
  "billingPeriodCostUSD": 1.23
}
```

If this file is absent or has a different schema, the cost/billing endpoints return `null`.

---

## history.jsonl Schema

Each line:
```json
{
  "display": "user prompt text",
  "timestamp": "2026-02-26T10:00:00.000Z",
  "sessionId": "abc123",
  "cwd": "/path/to/project"
}
```

---

## What Breaks If Formats Change

| Change | Impact |
|--------|--------|
| JSONL field rename (`inputTokens` → anything) | Context health shows 0% |
| `tasks/` renamed to something else | Live mode shows no sessions |
| `statsCache.json` schema change | Cost / billing block shows null |
| `history.jsonl` format change | History view empty |
| Session JSONL `type` field removed | Context summary returns empty |

---

## Reporting Format Compatibility Issues

If you're on a Claude Code version where claudedash shows wrong data:
1. Open a [GitHub Issue](https://github.com/yunusemrgrl/claudedash/issues) with title: `[compat] <Claude Code version> — <what's broken>`
2. Include: `claude --version`, your OS, and what data is missing/wrong
3. If possible, attach a sanitized (no PII) sample of the affected file
