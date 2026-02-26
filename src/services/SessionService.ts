/**
 * SessionService — owns the sessions cache and related business logic.
 *
 * Responsibilities:
 * - Caching readSessions() results, invalidated by watcher events
 * - Applying filters (days cutoff, dismissed tasks, stale detection)
 * - Reading optional session-meta enrichment data
 */

import { existsSync, readFileSync, writeFileSync } from 'fs';
import { join } from 'path';
import { readSessions } from '../core/todoReader.js';
import { buildContextHealth } from '../core/contextHealth.js';

const STALE_MS = 24 * 60 * 60 * 1000; // 24 hours

type RawSession = ReturnType<typeof readSessions>[number];

export interface EnrichedSession extends RawSession {
  contextHealth: ReturnType<typeof buildContextHealth>;
  linesAdded?: number;
  gitCommits?: number;
  languages?: Record<string, number>;
  durationMinutes?: number;
}

export class SessionService {
  private readonly claudeDir: string;
  private cache: RawSession[] | null = null;
  private readonly dismissed: Set<string>;

  constructor(claudeDir: string) {
    this.claudeDir = claudeDir;
    this.dismissed = this.loadDismissed();
  }

  /** Invalidate the session cache (call on file-system change events). */
  invalidate(): void {
    this.cache = null;
  }

  /** Dismiss a specific task so it no longer appears in /sessions output. */
  dismiss(sessionId: string, taskId: string): void {
    this.dismissed.add(`${sessionId}/${taskId}`);
    this.saveDismissed();
    this.cache = null;
  }

  /**
   * Return sessions with context health, stale detection, and meta enrichment.
   * @param cutoffMs  - only include sessions updated after this timestamp (null = all)
   * @param model     - optional model override for context window sizing
   */
  getSessions(
    cutoffMs: number | null,
    model?: string,
  ): { sessions: EnrichedSession[]; total: number; filtered: number } {
    if (!this.cache) this.cache = readSessions(this.claudeDir);
    const allSessions = this.cache;

    const filtered = cutoffMs
      ? allSessions.filter(s => !s.updatedAt || new Date(s.updatedAt).getTime() >= cutoffMs)
      : allSessions;

    const now = Date.now();
    const enriched = filtered.map(s => this.buildSession(s, now, model));

    return { sessions: enriched, total: allSessions.length, filtered: filtered.length };
  }

  /** Find a single session by id. */
  getById(id: string, model?: string): EnrichedSession | null {
    if (!this.cache) this.cache = readSessions(this.claudeDir);
    const s = this.cache.find(sess => sess.id === id);
    if (!s) return null;
    return this.buildSession(s, Date.now(), model);
  }

  private buildSession(s: RawSession, now: number, model?: string): EnrichedSession {
    const sessionAgeMs = now - new Date(s.updatedAt).getTime();
    const isSessionStale = sessionAgeMs > STALE_MS;
    const tasks = s.tasks
      .filter(t => !this.dismissed.has(`${s.id}/${t.id}`))
      .map(t => ({
        ...t,
        isStale: t.status === 'in_progress' && isSessionStale ? true : undefined,
      }));
    return {
      ...s,
      tasks,
      contextHealth: buildContextHealth(s, model),
      ...this.readMeta(s.id),
    } as EnrichedSession;
  }

  private readMeta(sessionId: string): {
    linesAdded?: number;
    gitCommits?: number;
    languages?: Record<string, number>;
    durationMinutes?: number;
  } | null {
    const metaPath = join(this.claudeDir, 'usage-data', 'session-meta', `${sessionId}.json`);
    if (!existsSync(metaPath)) return null;
    try {
      const m = JSON.parse(readFileSync(metaPath, 'utf8')) as Record<string, unknown>;
      return {
        linesAdded: typeof m.lines_added === 'number' ? m.lines_added : undefined,
        gitCommits: typeof m.git_commits === 'number' ? m.git_commits : undefined,
        languages: m.languages && typeof m.languages === 'object' ? m.languages as Record<string, number> : undefined,
        durationMinutes: typeof m.duration_minutes === 'number' ? m.duration_minutes : undefined,
      };
    } catch { return null; }
  }

  private loadDismissed(): Set<string> {
    const filePath = join(this.claudeDir, 'claudedash-dismissed.json');
    try {
      if (existsSync(filePath)) {
        const arr = JSON.parse(readFileSync(filePath, 'utf-8')) as string[];
        return new Set(Array.isArray(arr) ? arr : []);
      }
    } catch { /* ignore */ }
    return new Set();
  }

  private saveDismissed(): void {
    const filePath = join(this.claudeDir, 'claudedash-dismissed.json');
    try {
      writeFileSync(filePath, JSON.stringify([...this.dismissed], null, 2));
    } catch { /* ignore */ }
  }
}
