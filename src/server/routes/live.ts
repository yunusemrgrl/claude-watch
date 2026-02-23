import type { FastifyInstance } from 'fastify';
import { existsSync, readFileSync, writeFileSync, appendFileSync, readdirSync } from 'fs';
import { join } from 'path';
import { execFileSync } from 'child_process';
import { readSessions } from '../../core/todoReader.js';
import { buildContextHealth } from '../../core/contextHealth.js';
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

const STALE_MS = 24 * 60 * 60 * 1000; // 24 hours

function loadDismissed(claudeDir: string): Set<string> {
  const filePath = join(claudeDir, 'claudedash-dismissed.json');
  try {
    if (existsSync(filePath)) {
      const raw = readFileSync(filePath, 'utf-8');
      const arr = JSON.parse(raw) as string[];
      return new Set(Array.isArray(arr) ? arr : []);
    }
  } catch { /* ignore */ }
  return new Set();
}

function saveDismissed(claudeDir: string, dismissed: Set<string>): void {
  const filePath = join(claudeDir, 'claudedash-dismissed.json');
  try {
    writeFileSync(filePath, JSON.stringify([...dismissed], null, 2));
  } catch { /* ignore */ }
}

export async function liveRoutes(fastify: FastifyInstance, opts: LiveRouteOptions): Promise<void> {
  const { claudeDir, planDir, emitter } = opts;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const sseClients = new Set<(event: any) => void>();
  let lastSessions: string | null = null;
  // Ring buffer of last 100 hook events
  const hookEvents: HookEvent[] = [];
  // Dismissed task keys: "sessionId/taskId"
  const dismissed = loadDismissed(claudeDir);

  // Cache for readSessions — invalidated by watcher on any session file change
  let sessionsCache: ReturnType<typeof readSessions> | null = null;

  emitter.on('change', (event: WatchEvent) => {
    if (event.type === 'sessions') {
      lastSessions = new Date().toISOString();
      sessionsCache = null; // invalidate on file change
    }
    for (const send of sseClients) send(event);
  });

  fastify.get('/health', async () => {
    const hasLive = existsSync(join(claudeDir, 'tasks')) || existsSync(join(claudeDir, 'todos'));
    const hasPlan = planDir ? existsSync(join(planDir, 'queue.md')) : false;
    return {
      status: 'ok',
      modes: { live: hasLive, plan: hasPlan },
      connectedClients: sseClients.size,
      lastSessions,
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
    sseClients.add(send);

    const pingInterval = setInterval(() => {
      reply.raw.write(`: ping\n\n`);
    }, 30000);

    _request.raw.on('close', () => {
      sseClients.delete(send);
      clearInterval(pingInterval);
    });

    await new Promise(() => {});
  });

  // Read session-meta enrichment data if available
  function readSessionMeta(sessionId: string): { linesAdded?: number; gitCommits?: number; languages?: Record<string, number>; durationMinutes?: number } | null {
    const metaPath = join(claudeDir, 'usage-data', 'session-meta', `${sessionId}.json`);
    if (!existsSync(metaPath)) return null;
    try {
      const raw = readFileSync(metaPath, 'utf8');
      const m = JSON.parse(raw) as Record<string, unknown>;
      return {
        linesAdded: typeof m.lines_added === 'number' ? m.lines_added : undefined,
        gitCommits: typeof m.git_commits === 'number' ? m.git_commits : undefined,
        languages: m.languages && typeof m.languages === 'object' ? m.languages as Record<string, number> : undefined,
        durationMinutes: typeof m.duration_minutes === 'number' ? m.duration_minutes : undefined,
      };
    } catch { return null; }
  }

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

    if (!sessionsCache) sessionsCache = readSessions(claudeDir);
    const allSessions = sessionsCache;
    const filtered = cutoffMs
      ? allSessions.filter(s => !s.updatedAt || new Date(s.updatedAt).getTime() >= cutoffMs)
      : allSessions;

    const now = Date.now();
    const sessions = filtered.map(s => {
      const sessionAgeMs = now - new Date(s.updatedAt).getTime();
      const isSessionStale = sessionAgeMs > STALE_MS;
      const tasks = s.tasks
        .filter(t => !dismissed.has(`${s.id}/${t.id}`))
        .map(t => ({
          ...t,
          isStale: t.status === 'in_progress' && isSessionStale ? true : undefined,
        }));
      return {
        ...s,
        tasks,
        contextHealth: buildContextHealth(s, model),
        ...readSessionMeta(s.id),
      };
    });
    return { sessions, total: allSessions.length, filtered: filtered.length };
  });

  fastify.get<{ Params: { id: string }; Querystring: { model?: string } }>('/sessions/:id', async (request) => {
    if (!sessionsCache) sessionsCache = readSessions(claudeDir);
    const found = sessionsCache.find(s => s.id === request.params.id);
    if (!found) return { session: null, error: 'Session not found' };
    const model = request.query.model;
    return { session: { ...found, contextHealth: buildContextHealth(found, model) } };
  });

  fastify.post<{ Params: { id: string } }>('/sessions/:id/resume-cmd', async (request, reply) => {
    const { id } = request.params;
    if (!sessionsCache) sessionsCache = readSessions(claudeDir);
    const found = sessionsCache.find(s => s.id === id);
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
      const raw = readFileSync(jsonlPath, 'utf-8');
      const allLines = raw.split('\n').filter(l => l.trim());
      // Only read last 500 lines to avoid OOM on huge files
      const lines = allLines.slice(-500);
      const messageCount = allLines.length;

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
      const key = `${sessionId}/${taskId}`;
      dismissed.add(key);
      saveDismissed(claudeDir, dismissed);
      sessionsCache = null;
      for (const send of sseClients) send({ type: 'sessions', timestamp: new Date().toISOString() });
      return reply.send({ ok: true });
    }
  );

  // POST /hook — receives Claude Code hook events, fans out via SSE, stores in ring buffer
  fastify.post<{ Body: Record<string, unknown> }>('/hook', async (request) => {
    const body = request.body ?? {};
    const hookEvent: HookEvent = {
      type: 'hook',
      event: typeof body.event === 'string' ? body.event : 'unknown',
      tool: typeof body.tool === 'string' ? body.tool : undefined,
      session: typeof body.session === 'string' ? body.session : undefined,
      cwd: typeof body.cwd === 'string' ? body.cwd : undefined,
      receivedAt: new Date().toISOString(),
      ...body,
    };
    hookEvents.push(hookEvent);
    if (hookEvents.length > 100) hookEvents.shift();
    for (const send of sseClients) send(hookEvent);

    // PreCompact: save task state + context snapshot + auto-commit
    if (hookEvent.event === 'PreCompact') {
      const snapshotCwd = (hookEvent.cwd as string | undefined) ?? (planDir ? join(planDir, '..') : process.cwd());
      const snapshotDir = planDir ?? join(snapshotCwd, '.claudedash');

      // 1. Auto git commit (non-fatal — silently skipped if nothing to commit)
      let commitMade = false;
      try {
        execFileSync('git', ['add', '-A'], { cwd: snapshotCwd, stdio: 'ignore' });
        execFileSync('git', ['commit', '-m', 'chore: pre-compact auto-save [claudedash]'], { cwd: snapshotCwd, stdio: 'ignore' });
        commitMade = true;
      } catch { /* nothing to commit or not a git repo */ }

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
    return { events: hookEvents.slice().reverse() };
  });
}
