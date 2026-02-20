# Context Health Monitoring

claudedash estimates how much of Claude's context window is being used and surfaces this information in the Live mode dashboard.

## What is context health?

Claude models have a finite context window (200,000 tokens for claude-sonnet-4-6 and claude-opus-4-6). As a session grows — with more turns, tool outputs, and conversation history — the context fills up. When it approaches capacity, Claude may begin truncating older context, which can degrade task recall and coherence.

The context health widget gives you an at-a-glance indicator of context pressure across your active sessions.

## Warning levels

| Level | Range | Indicator |
|-------|-------|-----------|
| Safe | 0 – 64% | Green bar, no badge |
| Warn | 65 – 74% | Yellow bar, warning badge |
| Critical | 75%+ | Red bar, critical badge |

## Where it appears

### Session sidebar (Live mode)
Each session card shows a compact inline indicator:
- A colored percentage (green/yellow/red) with an icon
- The icon is `✓` (safe), `⚠` (warn), or `⊗` (critical)

### Token usage bar (selected session)
When a session with token data is selected, a progress bar appears in the header showing:
- A color-coded bar (green → yellow → red as usage grows)
- The exact percentage and warning level

### Live mode header banner
When any session reaches `warn` or `critical` level, a banner appears at the top of the kanban board showing the highest context percentage across all sessions.

## How percentage is calculated

Context percentage is estimated from the session's `inputTokens` count:

```
percentage = (inputTokens / 200,000) × 100
```

This is an approximation. See [context-estimation.md](./context-estimation.md) for a full explanation of the methodology, accuracy expectations, and fallback strategy.

### When no data is available

If a session has no token usage data (e.g. the session file doesn't include API response metadata), the widget shows `–` (unknown) and no warning is raised.

## API

Context health is included in the sessions response:

```
GET /sessions
```

Each session object includes a `contextHealth` field:

```json
{
  "id": "session-abc123",
  "tasks": [...],
  "contextHealth": {
    "percentage": 72.3,
    "warningLevel": "warn",
    "tokensUsed": 144600,
    "maxTokens": 200000,
    "estimationMethod": "token-based"
  }
}
```

`contextHealth` is `null` when estimation is impossible.

## Troubleshooting

**Context always shows `–`:** claudedash reads token usage from `~/.claude/projects/<project>/<session>.jsonl`. If this file doesn't contain `usage` fields (which are written by the Claude API), context health cannot be estimated. This typically means the session predates API usage logging or was started without network access.

**Percentage seems higher/lower than expected:** The estimate is based on input tokens only, which is the best available proxy for context window usage. It does not account for model-internal tokenization differences. Expect ±5–15% variance.
