import type { FastifyInstance } from 'fastify';
import { existsSync, readdirSync, openSync, readSync, fstatSync, closeSync } from 'fs';
import { join } from 'path';
import { SseHub } from '../../services/SseHub.js';
import { SessionService } from '../../services/SessionService.js';
import { HookService } from '../../services/HookService.js';

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

import type { WatchEvent } from '../watcher.js';
import type { EventEmitter } from 'events';

export interface LiveRouteOptions {
  claudeDir: string;
  planDir?: string;
  emitter: EventEmitter;
}


export async function liveRoutes(fastify: FastifyInstance, opts: LiveRouteOptions): Promise<void> {
  const { claudeDir, planDir, emitter } = opts;
  const hub = new SseHub();
  const sessions = new SessionService(claudeDir);
  const hooks = new HookService(claudeDir, planDir);
  let lastSessions: string | null = null;

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
    return {
      status: 'ok',
      modes: { live: hasLive, plan: hasPlan },
      connectedClients: hub.clientCount,
      lastSessions,
      autoCommit: hooks.getAutoCommit(),
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
    const hookEvent = hooks.push(request.body ?? {});
    hub.broadcast(hookEvent);

    if (hookEvent.event === 'PreCompact') await hooks.handlePreCompact(hookEvent);
    if (hookEvent.event === 'PostCompact') hooks.handlePostCompact(hookEvent);

    return { ok: true, receivedAt: hookEvent.receivedAt };
  });

  // GET /hook/events — returns the ring buffer of recent hook events
  fastify.get('/hook/events', async () => {
    return {
      events: hooks.getEvents(),
      autoCommit: hooks.getAutoCommit(),
      hooksInstalled: hooks.getHooksInstalled(),
    };
  });
}
