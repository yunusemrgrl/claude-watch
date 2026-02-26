/**
 * HookService — owns the hook event ring buffer and PreCompact/PostCompact actions.
 *
 * Responsibilities:
 * - Ring buffer of last N hook events (default 100)
 * - hooksInstalled detection from ~/.claude/settings.json
 * - autoCommit config read from .claudedash/config.json
 * - PreCompact: optional git commit + context snapshot + compact-state.json
 * - PostCompact: append restore reminder to CLAUDE.md
 */

import { existsSync, readFileSync, writeFileSync, appendFileSync } from 'fs';
import { join } from 'path';
import { execFileSync } from 'child_process';
import { parseQueue } from '../core/queueParser.js';
import { parseLog } from '../core/logParser.js';
import { computeSnapshot } from '../core/stateEngine.js';
import { captureContextSnapshot, writeContextSnapshot } from '../core/contextCapture.js';

export interface HookEvent {
  type: 'hook';
  event: string;
  tool?: string;
  session?: string;
  cwd?: string;
  receivedAt: string;
  [key: string]: unknown;
}

const RING_SIZE = 100;

export class HookService {
  private readonly claudeDir: string;
  private readonly planDir: string | undefined;
  private readonly ring: HookEvent[] = [];

  constructor(claudeDir: string, planDir?: string) {
    this.claudeDir = claudeDir;
    this.planDir = planDir;
  }

  /** Parse a raw POST /hook body into a HookEvent and add it to the ring buffer. */
  push(body: Record<string, unknown>): HookEvent {
    const hookEvent: HookEvent = {
      ...body,
      type: 'hook',
      event: typeof body.event === 'string' ? body.event : 'unknown',
      tool: typeof body.tool === 'string' && body.tool ? body.tool : undefined,
      session: typeof body.session === 'string' ? body.session : undefined,
      cwd: typeof body.cwd === 'string' ? body.cwd : undefined,
      receivedAt: new Date().toISOString(),
    };
    this.ring.push(hookEvent);
    if (this.ring.length > RING_SIZE) this.ring.shift();
    return hookEvent;
  }

  /** Returns ring buffer in reverse-chronological order (newest first). */
  getEvents(): HookEvent[] {
    return this.ring.slice().reverse();
  }

  /** Reads autoCommit flag from .claudedash/config.json. */
  getAutoCommit(): boolean {
    if (!this.planDir) return false;
    try {
      const cfg = JSON.parse(
        readFileSync(join(this.planDir, 'config.json'), 'utf-8'),
      ) as Record<string, unknown>;
      return cfg.autoCommit === true;
    } catch { return false; }
  }

  /** Checks whether claudedash hooks are installed in ~/.claude/settings.json. */
  getHooksInstalled(): boolean {
    try {
      const settingsPath = join(this.claudeDir, 'settings.json');
      if (!existsSync(settingsPath)) return false;
      const settings = JSON.parse(readFileSync(settingsPath, 'utf-8')) as Record<string, unknown>;
      const hooks = (settings.hooks ?? {}) as Record<string, unknown[]>;
      const hasHook = (key: string) =>
        (hooks[key] ?? []).some((h: unknown) =>
          typeof h === 'object' &&
          (JSON.stringify(h).includes('claudedash') || JSON.stringify(h).includes('/hook'))
        );
      return hasHook('PostToolUse') || hasHook('Stop');
    } catch { return false; }
  }

  /** Handle PreCompact side-effects: optional git commit, context snapshot, compact-state.json. */
  async handlePreCompact(hookEvent: HookEvent): Promise<void> {
    const snapshotCwd =
      (hookEvent.cwd as string | undefined) ??
      (this.planDir ? join(this.planDir, '..') : process.cwd());
    const snapshotDir = this.planDir ?? join(snapshotCwd, '.claudedash');

    // 1. Auto git commit — only if explicitly enabled in config.json
    let commitMade = false;
    if (this.getAutoCommit()) {
      try {
        execFileSync('git', ['add', '-A'], { cwd: snapshotCwd, stdio: 'ignore' });
        execFileSync('git', ['commit', '-m', 'chore: pre-compact auto-save [claudedash]'], {
          cwd: snapshotCwd,
          stdio: 'ignore',
        });
        commitMade = true;
      } catch { /* nothing to commit or not a git repo */ }
    }

    // 2. Context snapshot (commit-tied if we just committed, else timestamped)
    try {
      const ctxSnap = await captureContextSnapshot({
        focus: 'pre-compact auto-save',
        cwd: snapshotCwd,
        commit: commitMade,
      });
      writeContextSnapshot(ctxSnap, snapshotDir);
    } catch { /* non-fatal */ }

    // 3. compact-state.json for PostCompact restore
    if (this.planDir) {
      try {
        const queuePath = join(this.planDir, 'queue.md');
        const logPath = join(this.planDir, 'execution.log');
        if (existsSync(queuePath)) {
          const queueResult = parseQueue(readFileSync(queuePath, 'utf-8'));
          let logResult = parseLog('');
          if (existsSync(logPath)) logResult = parseLog(readFileSync(logPath, 'utf-8'));
          const stateSnap = computeSnapshot(queueResult.tasks, logResult.events);
          const readyTasks = stateSnap.tasks.filter(t => t.status === 'READY').map(t => t.id);
          const state = {
            compactedAt: hookEvent.receivedAt,
            sessionId: hookEvent.session ?? null,
            summary: stateSnap.summary,
            readyTasks,
          };
          writeFileSync(
            join(this.planDir, 'compact-state.json'),
            JSON.stringify(state, null, 2),
            'utf-8',
          );
        }
      } catch { /* non-fatal */ }
    }
  }

  /** Handle PostCompact side-effects: append restore reminder to CLAUDE.md. */
  handlePostCompact(hookEvent: HookEvent): void {
    if (!this.planDir) return;
    try {
      const statePath = join(this.planDir, 'compact-state.json');
      if (!existsSync(statePath)) return;
      const state = JSON.parse(readFileSync(statePath, 'utf-8')) as Record<string, unknown>;
      const claudeMdPath = join(this.planDir, 'CLAUDE.md');
      const summary = state.summary as Record<string, number> | undefined;
      const ready = summary?.ready ?? 0;
      const done = summary?.done ?? 0;
      const note =
        `\n\n> **[compact-restore ${hookEvent.receivedAt}]** Context was compacted. ` +
        `State: ${done} DONE, ${ready} READY. Read \`.claudedash/compact-state.json\` for full task list.\n`;
      appendFileSync(claudeMdPath, note, 'utf-8');
    } catch { /* non-fatal */ }
  }
}
