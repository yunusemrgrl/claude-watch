import type { ClaudeSession, ContextHealth, ContextWarningLevel } from './types.js';

const DEFAULT_MAX_TOKENS = 200_000;

const MODEL_CONTEXT_LIMITS: Record<string, number> = {
  'claude-haiku':     100_000,
  'claude-haiku-3':   200_000,
  'claude-haiku-4':   200_000,
  'claude-sonnet':    200_000,
  'claude-opus':      200_000,
  'claude-3-haiku':   200_000,
  'claude-3-sonnet':  200_000,
  'claude-3-opus':    200_000,
};

/**
 * Returns the context window limit for a given model name.
 * Matches by prefix so "claude-haiku-4-5-20251001" → 200k.
 */
export function getModelContextLimit(model?: string): number {
  if (!model) return DEFAULT_MAX_TOKENS;
  const key = Object.keys(MODEL_CONTEXT_LIMITS).find(k => model.startsWith(k));
  return key ? MODEL_CONTEXT_LIMITS[key] : DEFAULT_MAX_TOKENS;
}

const WARN_THRESHOLD = 65;
const CRITICAL_THRESHOLD = 75;

/**
 * Derives warning level from a 0-100 percentage.
 */
function deriveWarningLevel(percentage: number): ContextWarningLevel {
  if (percentage >= CRITICAL_THRESHOLD) return 'critical';
  if (percentage >= WARN_THRESHOLD) return 'warn';
  return 'safe';
}

/**
 * Estimates context window usage percentage for a Claude session.
 *
 * Uses inputTokens as the primary proxy for context occupancy (see docs/context-estimation.md).
 * Returns null when token data is unavailable or empty.
 */
export function estimateContextPercentage(session: ClaudeSession, maxTokens = DEFAULT_MAX_TOKENS): number | null {
  if (!session.tokenUsage) return null;

  const { inputTokens } = session.tokenUsage;
  if (inputTokens <= 0) return null;

  const percentage = Math.min(100, (inputTokens / maxTokens) * 100);
  return Math.round(percentage * 10) / 10; // 1 decimal place
}

/**
 * Builds a full ContextHealth object for a session.
 * Returns null when estimation is impossible.
 * Pass `model` to use the correct context window limit for that model.
 */
export function buildContextHealth(session: ClaudeSession, model?: string): ContextHealth | null {
  const maxTokens = getModelContextLimit(model);
  const percentage = estimateContextPercentage(session, maxTokens);
  if (percentage === null) return null;

  const tokensUsed = session.tokenUsage!.inputTokens;

  return {
    percentage,
    warningLevel: deriveWarningLevel(percentage),
    tokensUsed,
    maxTokens,
    estimationMethod: 'token-based',
  };
}
