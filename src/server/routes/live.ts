import type { FastifyInstance } from 'fastify';
import { existsSync, readFileSync, writeFileSync, appendFileSync, readdirSync, openSync, readSync, fstatSync, closeSync } from 'fs';
import { join } from 'path';
import { SseHub } from '../../services/SseHub.js';
import { SessionService } from '../../services/SessionService.js';

/**
 * Read only the last `lineCount` lines of a file without loading the entire file.
 * Uses backward seek from EOF scanning for newlines.
 * Also returns the total estimated line count (based on full scan only when needed).
 */
function tailRead(filePath: string, lineCount: number): { lines: string[]; totalLines: number } {
  let fd = -1;
  try {
    fd = openSync(filePath, 'r');
    const stat = fstatSync(fd);
    const fileSize = stat.size;

    if (fileSize === 0) return { lines: [], totalLines: 0 };

    // Read in chunks from the end, collecting newlines
    const CHUNK = 65536; // 64KB
    let remaining = fileSize;
    let linesFound = 0;
    let cutoffPos = fileSize;
    let totalNewlines = 0;

    // Phase 1: scan from end to find cutoff position for lineCount lines
    while (remaining > 0 && linesFound < lineCount) {
      const readSize = Math.min(CHUNK, remaining);
      remaining -= readSize;
      const buf = Buffer.allocUnsafe(readSize);
      readSync(fd, buf, 0, readSize, remaining);
      for (let i = readSize - 1; i >= 0; i--) {
        if (buf[i] === 0x0a) { // '\n'
          linesFound++;
          if (linesFound === lineCount) {
            cutoffPos = remaining + i + 1;
            break;
          }
        }
      }
    }

    // Phase 2: count total lines (scan rest of file for accurate count)
    // We approximate: count newlines in already-scanned portion plus estimate remainder
    // For simplicity, report linesFound + rough estimate from size ratio
    const scannedBytes = fileSize - remaining;
    const density = scannedBytes > 0 ? linesFound / scannedBytes : 0;
    totalNewlines = Math.round(density * fileSize);

    // Phase 3: read from cutoffPos to end
    const readLen = fileSize - cutoffPos;
    const content = Buffer.allocUnsafe(readLen);
    readSync(fd, content, 0, readLen, cutoffPos);

    const lines = content.toString('utf-8').split('\n').filter(l => l.trim());
    return { lines, totalLines: Math.max(totalNewlines, lines.length) };
  } catch {
    return { lines: [], totalLines: 0 };
  } finally {
    if (fd >= 0) closeSync(fd);
  }
}
import { execFileSync } from 'child_process';
import { parseQueue } from '../../core/queueParser.js';
import { parseLog } from '../../core/logParser.js';
import { computeSnapshot } from '../../core/stateEngine.js';
import { captureContextSnapshot, writeContextSnapshot } from '../../core/contextCapture.js';
import type { WatchEvent } from '../watcher.js';
import type { EventEmitter } from 'events';

export interface LiveRouteOptions {
  claudeDir: string;
  planDir?: string;
  emitter: EventEmitter;
}

export interface HookEvent {
  type: 'hook';
  event: string;
  tool?: string;
  session?: string;
  cwd?: string;
  receivedAt: string;
  [key: string]: unknown;
}

export async function liveRoutes(fastify: FastifyInstance, opts: LiveRouteOptions): Promise<void> {
  const { claudeDir, planDir, emitter } = opts;
  const hub = new SseHub();
  const sessions = new SessionService(claudeDir);
  let lastSessions: string | null = null;
  // Ring buffer of last 100 hook events
  const hookEvents: HookEvent[] = [];

  emitter.on('change', (event: WatchEvent) => {
    if (event.type === 'sessions') {
      lastSessions = new Date().toISOString();
      sessions.invalidate();
    }
    hub.broadcast(event);
  });

  fastify.get('/health', async () => {
    const hasLive = existsSync(join(claudeDir, 'tasks')) || existsSync(join(claudeDir, 'todos'));
    const hasPlan = planDir ? existsSync(join(planDir, 'queue.md')) : false;
    let autoCommit = false;
    if (planDir) {
      try {
        const cfg = JSON.parse(readFileSync(join(planDir, 'config.json'), 'utf-8')) as Record<string, unknown>;
        autoCommit = cfg.autoCommit === true;
      } catch { /* ignore */ }
    }
    return {
      status: 'ok',
      modes: { live: hasLive, plan: hasPlan },
      connectedClients: hub.clientCount,
      lastSessions,
      autoCommit,
    };
  });

  fastify.get('/events', async (_request, reply) => {
    reply.raw.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive',
      'Access-Control-Allow-Origin': '*'
    });
    reply.raw.write(`data: ${JSON.stringify({ type: 'connected', timestamp: new Date().toISOString() })}\n\n`);

    const send = (event: WatchEvent) => {
      reply.raw.write(`data: ${JSON.stringify(event)}\n\n`);
    };
    const ping = () => { reply.raw.write(`: ping\n\n`); };

    hub.addClient(send, ping, (handler) => _request.raw.on('close', handler));

    await new Promise(() => {});
  });

  fastify.get<{ Querystring: { model?: string; days?: string } }>('/sessions', async (request) => {
    const model = request.query.model;
    const daysParam = request.query.days;

    let cutoffMs: number | null = null;
    if (daysParam !== 'all' && daysParam !== '0') {
      const days = daysParam ? parseInt(daysParam, 10) : 7;
      if (!isNaN(days) && days > 0) {
        cutoffMs = Date.now() - days * 24 * 60 * 60 * 1000;
      }
    }

    return sessions.getSessions(cutoffMs, model);
  });

  fastify.get<{ Params: { id: string }; Querystring: { model?: string } }>('/sessions/:id', async (request) => {
    const found = sessions.getById(request.params.id, request.query.model);
    if (!found) return { session: null, error: 'Session not found' };
    return { session: found };
  });

  fastify.post<{ Params: { id: string } }>('/sessions/:id/resume-cmd', async (request, reply) => {
    const { id } = request.params;
    const found = sessions.getById(id);
    if (!found) return reply.code(404).send({ error: 'Session not found' });
    return { command: `claude resume ${id}`, sessionId: id };
  });

  // GET /sessions/:id/context — session JSONL summary (last N messages)
  fastify.get<{ Params: { id: string } }>('/sessions/:id/context', async (request, reply) => {
    const { id } = request.params;

    // Find JSONL file in ~/.claude/projects/*/*
    const projectsDir = join(claudeDir, 'projects');
    let jsonlPath: string | null = null;
    if (existsSync(projectsDir)) {
      try {
        for (const dir of readdirSync(projectsDir)) {
          const candidate = join(projectsDir, dir, `${id}.jsonl`);
          if (existsSync(candidate)) { jsonlPath = candidate; break; }
        }
      } catch { /* ignore */ }
    }

    if (!jsonlPath) return reply.code(404).send({ error: 'Session JSONL not found' });

    try {
      const { lines, totalLines: messageCount } = tailRead(jsonlPath, 500);

      let lastUserPrompt: string | null = null;
      let lastAssistantSummary: string | null = null;
      const toolCounts: Record<string, number> = {};

      for (const line of lines) {
        try {
          const obj = JSON.parse(line) as Record<string, unknown>;
          const msg = obj.message as Record<string, unknown> | undefined;
          const role = obj.type as string | undefined;

          if (role === 'user' && msg) {
            const content = msg.content;
            if (typeof content === 'string') {
              lastUserPrompt = content.slice(0, 300);
            } else if (Array.isArray(content)) {
              const textBlock = (content as Array<Record<string, unknown>>).find(b => b.type === 'text');
              if (textBlock && typeof textBlock.text === 'string') {
                lastUserPrompt = textBlock.text.slice(0, 300);
              }
            }
          }

          if (role === 'assistant' && msg) {
            const content = msg.content;
            if (Array.isArray(content)) {
              for (const block of content as Array<Record<string, unknown>>) {
                if (block.type === 'text' && typeof block.text === 'string') {
                  lastAssistantSummary = block.text.slice(0, 300);
                }
                if (block.type === 'tool_use' && typeof block.name === 'string') {
                  toolCounts[block.name] = (toolCounts[block.name] ?? 0) + 1;
                }
              }
            }
          }
        } catch { /* skip malformed lines */ }
      }

      const recentTools = Object.entries(toolCounts)
        .sort(([, a], [, b]) => b - a)
        .slice(0, 10)
        .map(([name]) => name);

      return {
        sessionId: id,
        messageCount,
        lastUserPrompt,
        lastAssistantSummary,
        toolCounts,
        recentTools,
      };
    } catch {
      return reply.code(500).send({ error: 'Failed to parse session JSONL' });
    }
  });

  // DELETE /sessions/:sessionId/tasks/:taskId — dismiss a stale task from the Kanban
  fastify.delete<{ Params: { sessionId: string; taskId: string } }>(
    '/sessions/:sessionId/tasks/:taskId',
    async (request, reply) => {
      const { sessionId, taskId } = request.params;
      sessions.dismiss(sessionId, taskId);
      hub.broadcast({ type: 'sessions', timestamp: new Date().toISOString() });
      return reply.send({ ok: true });
    }
  );

  // POST /hook — receives Claude Code hook events, fans out via SSE, stores in ring buffer
  fastify.post<{ Body: Record<string, unknown> }>('/hook', async (request) => {
    const body = request.body ?? {};
    const hookEvent: HookEvent = {
      type: 'hook',
      event: typeof body.event === 'string' ? body.event : 'unknown',
      tool: typeof body.tool === 'string' && body.tool ? body.tool : undefined,
      session: typeof body.session === 'string' ? body.session : undefined,
      cwd: typeof body.cwd === 'string' ? body.cwd : undefined,
      receivedAt: new Date().toISOString(),
      ...body,
    };
    hookEvents.push(hookEvent);
    if (hookEvents.length > 100) hookEvents.shift();
    hub.broadcast(hookEvent);

    // PreCompact: save task state + context snapshot + auto-commit
    if (hookEvent.event === 'PreCompact') {
      const snapshotCwd = (hookEvent.cwd as string | undefined) ?? (planDir ? join(planDir, '..') : process.cwd());
      const snapshotDir = planDir ?? join(snapshotCwd, '.claudedash');

      // 1. Auto git commit — only if autoCommit is explicitly enabled in config.json
      let commitMade = false;
      let autoCommitEnabled = false;
      if (planDir) {
        try {
          const cfg = JSON.parse(readFileSync(join(planDir, 'config.json'), 'utf-8')) as Record<string, unknown>;
          autoCommitEnabled = cfg.autoCommit === true;
        } catch { /* config missing or malformed — default off */ }
      }
      if (autoCommitEnabled) {
        try {
          execFileSync('git', ['add', '-A'], { cwd: snapshotCwd, stdio: 'ignore' });
          execFileSync('git', ['commit', '-m', 'chore: pre-compact auto-save [claudedash]'], { cwd: snapshotCwd, stdio: 'ignore' });
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
      if (planDir) {
        try {
          const queuePath = join(planDir, 'queue.md');
          const logPath = join(planDir, 'execution.log');
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
            writeFileSync(join(planDir, 'compact-state.json'), JSON.stringify(state, null, 2), 'utf-8');
          }
        } catch { /* non-fatal */ }
      }
    }

    // PostCompact: append restore reminder to CLAUDE.md
    if (hookEvent.event === 'PostCompact' && planDir) {
      try {
        const statePath = join(planDir, 'compact-state.json');
        if (existsSync(statePath)) {
          const state = JSON.parse(readFileSync(statePath, 'utf-8')) as Record<string, unknown>;
          const claudeMdPath = join(planDir, 'CLAUDE.md');
          const summary = state.summary as Record<string, number> | undefined;
          const ready = summary?.ready ?? 0;
          const done = summary?.done ?? 0;
          const note = `\n\n> **[compact-restore ${hookEvent.receivedAt}]** Context was compacted. State: ${done} DONE, ${ready} READY. Read \`.claudedash/compact-state.json\` for full task list.\n`;
          appendFileSync(claudeMdPath, note, 'utf-8');
        }
      } catch { /* non-fatal */ }
    }

    return { ok: true, receivedAt: hookEvent.receivedAt };
  });

  // GET /hook/events — returns the ring buffer of recent hook events
  fastify.get('/hook/events', async () => {
    let autoCommit = false;
    if (planDir) {
      try {
        const cfg = JSON.parse(readFileSync(join(planDir, 'config.json'), 'utf-8')) as Record<string, unknown>;
        autoCommit = cfg.autoCommit === true;
      } catch { /* ignore */ }
    }

    // Check if hooks are installed in ~/.claude/settings.json
    // (independent of whether any events have fired yet in this session)
    let hooksInstalled = false;
    try {
      const settingsPath = join(claudeDir, 'settings.json');
      if (existsSync(settingsPath)) {
        const settings = JSON.parse(readFileSync(settingsPath, 'utf-8')) as Record<string, unknown>;
        const hooks = (settings.hooks ?? {}) as Record<string, unknown[]>;
        const hasHook = (key: string) =>
          (hooks[key] ?? []).some((h: unknown) =>
            typeof h === 'object' && (JSON.stringify(h).includes('claudedash') || JSON.stringify(h).includes('/hook'))
          );
        hooksInstalled = hasHook('PostToolUse') || hasHook('Stop');
      }
    } catch { /* ignore */ }

    return { events: hookEvents.slice().reverse(), autoCommit, hooksInstalled };
  });
}
