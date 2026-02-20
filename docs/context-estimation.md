# Context Percentage Estimation Strategy

## Chosen Approach: Token-Based Approximation

Context percentage is estimated from the `tokenUsage` field stored in each session's JSONL file. When Claude Code logs a turn, it records `usage` in message objects, which claudedash parses into cumulative `inputTokens`, `outputTokens`, `cacheCreationTokens`, and `cacheReadTokens`.

### Estimation Formula

```
effectiveTokens = inputTokens + cacheCreationTokens
percentage      = (effectiveTokens / maxContextTokens) * 100
```

**Why only input + cacheCreation?**

- `outputTokens` are generated tokens and do not consume context window space in the same sense — they contribute to the *next* turn's input but are not accumulated across turns.
- `cacheReadTokens` are served from the KV cache and reduce costs but still occupy context window space. However, they reflect previously counted `cacheCreationTokens`, so including both would double-count.
- `inputTokens` in the Claude API response represents the *total* input for the turn, which already includes any injected system prompts and conversation history. This makes it the best single-field proxy for context occupancy.

### Max Context Reference Values

| Model                  | Context Window |
|------------------------|----------------|
| claude-opus-4-6        | 200,000 tokens |
| claude-sonnet-4-6      | 200,000 tokens |
| claude-haiku-4-5       | 200,000 tokens |

The implementation uses **200,000** as the default when the model is unknown.

### Warning Thresholds

| Level      | Range      | Color  |
|------------|------------|--------|
| `safe`     | 0 – 64%    | Green  |
| `warn`     | 65 – 74%   | Yellow |
| `critical` | 75%+       | Red    |

These thresholds mirror the warning points at which Claude models typically begin to truncate older context or exhibit degraded recall.

## Trade-offs

| Consideration | Detail |
|---------------|--------|
| **Accuracy** | Approximation only. Real context usage depends on model-internal tokenization, injected tool results, and system prompts not visible in the log. Expect ±5–15% deviation. |
| **Latency** | Computed at read time from already-parsed session data; no extra API calls needed. |
| **Cumulative vs. per-turn** | The stored `inputTokens` is the cumulative sum across all turns in the session, not a single-turn count. This makes it a reasonable proxy for total context consumed. |
| **Cache effects** | Cache hits reduce cost but not context usage. The formula ignores `cacheReadTokens` to avoid double-counting. |
| **Multi-session** | Each session is estimated independently. Cross-session context sharing is not modelled. |

## Fallback Strategy

When context percentage cannot be estimated, `estimateContextPercentage()` returns `null`.

Causes of `null`:
- Session has no `tokenUsage` field (session file missing usage blocks).
- `inputTokens` is 0 (brand-new session with no turns yet).

When `null` is returned:
- `ContextHealth.percentage` is not set.
- `ContextHealth.warningLevel` defaults to `'safe'`.
- The UI widget renders a grey "unknown" state with a dash instead of a percentage.
- No warning badges are shown.

## Accuracy Disclaimer

This is an **estimation**, not an exact measurement. The Claude API does not expose the raw context window occupancy directly. Token counts from the usage fields are the closest available proxy and have been chosen for their accessibility and reasonable accuracy under normal usage patterns. Users should treat percentages as directional indicators rather than precise measurements.
