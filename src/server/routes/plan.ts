import type { FastifyInstance } from 'fastify';
import { existsSync, readFileSync, appendFileSync, writeFileSync, statSync } from 'fs';
import { join, dirname } from 'path';
import type { EventEmitter } from 'events';
import { parseQueue, type QueueParseConfig } from '../../core/queueParser.js';
import { parseLog } from '../../core/logParser.js';
import { computeSnapshot } from '../../core/stateEngine.js';
import { computePlanInsights, computeLiveInsights } from '../../core/insightsEngine.js';
import { readSessions } from '../../core/todoReader.js';
import { parseQualityTimeline } from '../../core/qualityTimeline.js';
import { listSnapshots, readSnapshotByHash, deleteSnapshot } from '../../core/contextCapture.js';
import type { Snapshot, InsightsResponse } from '../../core/types.js';

export interface PlanRouteOptions {
  claudeDir: string;
  planDir?: string;
  emitter?: EventEmitter;
}

function readQueueParseConfig(planDir: string): QueueParseConfig | undefined {
  const configPath = join(planDir, 'config.json');
  if (!existsSync(configPath)) return undefined;
  try {
    const configData = JSON.parse(readFileSync(configPath, 'utf-8'));
    if (configData.taskModel) return configData.taskModel;
  } catch { /* use defaults */ }
  return undefined;
}

export async function planRoutes(fastify: FastifyInstance, opts: PlanRouteOptions): Promise<void> {
  const { claudeDir, planDir, emitter } = opts;

  // mtime-based cache for /snapshot — invalidated when queue.md or execution.log changes
  let snapshotCache: { queueMtime: number; logMtime: number; result: unknown } | null = null;

  fastify.get('/snapshot', async () => {
    if (!planDir) {
      return {
        snapshot: null,
        queueErrors: ['Plan mode not configured. Run "claudedash init" first.'],
        logErrors: [],
        meta: { generatedAt: new Date().toISOString(), totalTasks: 0 }
      };
    }

    const queuePath = join(planDir, 'queue.md');
    const logPath = join(planDir, 'execution.log');

    if (!existsSync(queuePath)) {
      return {
        snapshot: null,
        queueErrors: ['queue.md not found'],
        logErrors: [],
        meta: { generatedAt: new Date().toISOString(), totalTasks: 0 }
      };
    }

    // Return cached snapshot if neither queue.md nor execution.log has changed
    const queueMtime = statSync(queuePath).mtimeMs;
    const logMtime = existsSync(logPath) ? statSync(logPath).mtimeMs : 0;
    if (snapshotCache && snapshotCache.queueMtime === queueMtime && snapshotCache.logMtime === logMtime) {
      return snapshotCache.result;
    }

    const queueParseConfig = readQueueParseConfig(planDir);
    const queueResult = parseQueue(readFileSync(queuePath, 'utf-8'), queueParseConfig);

    if (queueResult.errors.length > 0) {
      return {
        snapshot: null,
        queueErrors: queueResult.errors,
        logErrors: [],
        meta: { generatedAt: new Date().toISOString(), totalTasks: 0 }
      };
    }

    let logResult = parseLog('');
    if (existsSync(logPath)) {
      logResult = parseLog(readFileSync(logPath, 'utf-8'));
    }

    let snapshot: Snapshot | null = null;
    try {
      snapshot = computeSnapshot(queueResult.tasks, logResult.events);
    } catch (error) {
      return {
        snapshot: null,
        queueErrors: [`Failed to compute snapshot: ${error}`],
        logErrors: logResult.errors,
        meta: { generatedAt: new Date().toISOString(), totalTasks: queueResult.tasks.length }
      };
    }

    const snapshotResult = {
      snapshot,
      queueErrors: [],
      logErrors: logResult.errors,
      meta: { generatedAt: new Date().toISOString(), totalTasks: queueResult.tasks.length }
    };
    snapshotCache = { queueMtime, logMtime, result: snapshotResult };
    return snapshotResult;
  });

  fastify.get('/insights', async () => {
    const hasLive = existsSync(join(claudeDir, 'tasks')) || existsSync(join(claudeDir, 'todos'));
    const hasPlan = planDir ? existsSync(join(planDir, 'queue.md')) : false;

    const response: InsightsResponse = {
      mode: hasLive && hasPlan ? 'both' : hasLive ? 'live' : 'plan',
      generatedAt: new Date().toISOString(),
    };

    if (hasLive) {
      response.live = computeLiveInsights(readSessions(claudeDir));
    }

    if (hasPlan && planDir) {
      const queuePath = join(planDir, 'queue.md');
      const logPath = join(planDir, 'execution.log');
      if (existsSync(queuePath)) {
        const queueParseConfig = readQueueParseConfig(planDir);
        const queueResult = parseQueue(readFileSync(queuePath, 'utf-8'), queueParseConfig);
        if (queueResult.errors.length === 0) {
          let logResult = parseLog('');
          if (existsSync(logPath)) logResult = parseLog(readFileSync(logPath, 'utf-8'));
          try {
            const snapshot = computeSnapshot(queueResult.tasks, logResult.events);
            response.plan = computePlanInsights(snapshot.tasks, logResult.events);
          } catch { /* skip */ }
        }
      }
    }

    return response;
  });

  fastify.get<{ Querystring: { taskId?: string; file?: string } }>('/quality-timeline', async (request) => {
    if (!planDir) return { events: [] };
    const logPath = join(planDir, 'execution.log');
    if (!existsSync(logPath)) return { events: [] };
    try {
      let events = parseQualityTimeline(readFileSync(logPath, 'utf-8'));
      if (request.query.taskId) {
        events = events.filter(e => e.taskId === request.query.taskId);
      }
      if (request.query.file) {
        events = events.filter(e => e.file === request.query.file);
      }
      return { events };
    } catch {
      return { events: [] };
    }
  });

  fastify.post<{
    Body: { description: string; slice?: string; area?: string; priority?: string; dependsOn?: string; ac?: string };
  }>(
    '/plan/task',
    {
      config: {
        rateLimit: {
          max: 30,
          timeWindow: '1 minute',
        },
      },
    },
    async (request, reply) => {
    if (!planDir) return reply.code(400).send({ error: 'Plan mode not configured' });

    const { description, slice, area = 'General', priority = 'medium', dependsOn = '-', ac = '-' } = request.body ?? {};
    if (!description || typeof description !== 'string' || !description.trim()) {
      return reply.code(400).send({ error: 'description is required' });
    }

    const queuePath = join(planDir, 'queue.md');
    if (!existsSync(queuePath)) return reply.code(400).send({ error: 'queue.md not found' });

    const existing = readFileSync(queuePath, 'utf-8');
    const allIds = [...existing.matchAll(/^## (S(\d+)-T(\d+))/gm)].map(m => ({
      full: m[1], s: parseInt(m[2]), t: parseInt(m[3]),
    }));

    let nextId: string;
    if (slice) {
      // Find the slice number from the slice label (e.g. "S5" → 5)
      const sNum = /^S?(\d+)$/i.exec(slice.trim())?.[1];
      if (sNum) {
        const sliceN = parseInt(sNum);
        const inSlice = allIds.filter(x => x.s === sliceN);
        const maxT = inSlice.length > 0 ? Math.max(...inSlice.map(x => x.t)) : 0;
        nextId = `S${sliceN}-T${maxT + 1}`;
      } else {
        // Non-numeric slice label — fall back to last task +1
        const last = allIds[allIds.length - 1];
        nextId = last ? `S${last.s}-T${last.t + 1}` : 'S1-T1';
      }
    } else {
      // No slice specified — append to last slice
      const last = allIds[allIds.length - 1];
      nextId = last ? `S${last.s}-T${last.t + 1}` : 'S1-T1';
    }

    const newBlock = `\n## ${nextId}\nArea: ${area.trim()}\nPriority: ${priority}\nDepends: ${dependsOn}\nDescription: ${description.trim()}\nAC: ${ac.trim() || '-'}\n`;
    try {
      appendFileSync(queuePath, newBlock, 'utf-8');
    } catch {
      return reply.code(500).send({ error: 'Failed to write to queue.md' });
    }

    if (emitter) emitter.emit('change', { type: 'plan', timestamp: new Date().toISOString() });

    return { ok: true, task_id: nextId, description: description.trim() };
    }
  );

  fastify.patch<{
    Params: { taskId: string };
    Body: { status: 'DONE' | 'BLOCKED' | 'FAILED'; reason?: string };
  }>(
    '/plan/task/:taskId',
    {
      config: {
        rateLimit: {
          max: 60,
          timeWindow: '1 minute',
        },
      },
    },
    async (request, reply) => {
    if (!planDir) return reply.code(400).send({ error: 'Plan mode not configured' });

    const { taskId } = request.params;
    const { status, reason } = request.body ?? {};

    if (!['DONE', 'BLOCKED', 'FAILED'].includes(status)) {
      return reply.code(400).send({ error: 'status must be DONE, BLOCKED, or FAILED' });
    }

    const logPath = join(planDir, 'execution.log');
    const entry: Record<string, unknown> = {
      task_id: taskId,
      status,
      timestamp: new Date().toISOString(),
      agent: 'dashboard',
    };
    if (reason) entry.reason = reason;

    try {
      appendFileSync(logPath, JSON.stringify(entry) + '\n', 'utf-8');
    } catch {
      return reply.code(500).send({ error: 'Failed to write to execution.log' });
    }

    // Notify SSE clients
    if (emitter) emitter.emit('change', { type: 'plan', timestamp: new Date().toISOString() });

    return { ok: true, task_id: taskId, status };
    }
  );

  // POST /log — agent HTTP execution log append (ai_feedback.md #3)
  fastify.post<{ Body: { task_id?: string; status?: string; agent?: string; reason?: string; meta?: unknown } }>(
    '/log',
    {
      config: {
        rateLimit: {
          max: 120,
          timeWindow: '1 minute',
        },
      },
    },
    async (request, reply) => {
      if (!planDir) return reply.code(404).send({ error: 'Plan mode not configured. Run claudedash init first.' });

      const { task_id, status, agent = 'agent', reason, meta } = request.body ?? {};
      if (!task_id) return reply.code(400).send({ error: 'task_id is required' });
      if (!status || !['DONE', 'FAILED', 'BLOCKED'].includes(status)) {
        return reply.code(400).send({ error: 'status must be DONE, FAILED, or BLOCKED' });
      }

      const logPath = join(planDir, 'execution.log');
      const entry: Record<string, unknown> = {
        task_id,
        status,
        timestamp: new Date().toISOString(),
        agent,
      };
      if (reason) entry.reason = reason;
      if (meta) entry.meta = meta;

      try {
        appendFileSync(logPath, JSON.stringify(entry) + '\n', 'utf-8');
      } catch {
        return reply.code(500).send({ error: 'Failed to write to execution.log' });
      }

      // SSE: always push plan change; also push blocked event for dashboard notification
      const now = new Date().toISOString();
      if (emitter) {
        emitter.emit('change', { type: 'plan', timestamp: now });
        if (status === 'BLOCKED') {
          emitter.emit('change', {
            type: 'task-blocked',
            task_id,
            reason: reason ?? null,
            agent,
            timestamp: now,
          });
        }
      }

      return { ok: true, task_id, status, timestamp: now };
    }
  );

  // GET /queue — computed queue snapshot for agents (ai_feedback.md #1)
  fastify.get('/queue', async () => {
    if (!planDir) {
      return { tasks: [], summary: { total: 0, done: 0, failed: 0, blocked: 0, ready: 0 }, errors: ['Plan mode not configured'] };
    }

    const queuePath = join(planDir, 'queue.md');
    const logPath = join(planDir, 'execution.log');

    if (!existsSync(queuePath)) {
      return { tasks: [], summary: { total: 0, done: 0, failed: 0, blocked: 0, ready: 0 }, errors: ['queue.md not found'] };
    }

    const queueParseConfig = readQueueParseConfig(planDir);
    const queueResult = parseQueue(readFileSync(queuePath, 'utf-8'), queueParseConfig);
    if (queueResult.errors.length > 0) {
      return { tasks: [], summary: { total: 0, done: 0, failed: 0, blocked: 0, ready: 0 }, errors: queueResult.errors };
    }

    let logResult = parseLog('');
    if (existsSync(logPath)) {
      logResult = parseLog(readFileSync(logPath, 'utf-8'));
    }

    const snapshot = computeSnapshot(queueResult.tasks, logResult.events);
    return {
      tasks: snapshot.tasks.map(t => ({
        id: t.id,
        area: t.area,
        slice: t.slice,
        description: t.description.slice(0, 200),
        dependsOn: t.dependsOn,
        status: t.status,
        lastEvent: t.lastEvent ?? null,
      })),
      summary: snapshot.summary,
      errors: [],
    };
  });

  // POST /agent/register — agent self-registration (ai_feedback.md #2)
  // GET  /agents        — list active agents
  // POST /agent/heartbeat — keep-alive
  interface AgentRecord {
    agentId: string;
    name: string;
    sessionId: string | null;
    taskId: string | null;
    status: string;
    registeredAt: string;
    lastSeen: string;
  }
  const agentRegistry = new Map<string, AgentRecord>();

  fastify.post<{ Body: { agentId?: string; sessionId?: string; taskId?: string; name?: string } }>(
    '/agent/register',
    {
      config: {
        rateLimit: {
          max: 30,
          timeWindow: '1 minute',
        },
      },
    },
    async (request, reply) => {
      const { agentId, sessionId, taskId, name } = request.body ?? {};
      if (!agentId) return reply.code(400).send({ error: 'agentId is required' });

      const now = new Date().toISOString();
      const record: AgentRecord = {
        agentId,
        name: name ?? agentId,
        sessionId: sessionId ?? null,
        taskId: taskId ?? null,
        status: 'active',
        registeredAt: agentRegistry.get(agentId)?.registeredAt ?? now,
        lastSeen: now,
      };
      agentRegistry.set(agentId, record);
      if (emitter) emitter.emit('change', { type: 'agent-update', timestamp: now });
      return { ok: true, agentId, registeredAt: record.registeredAt };
    }
  );

  fastify.post<{ Body: { agentId?: string; status?: string; taskId?: string } }>(
    '/agent/heartbeat',
    {
      config: {
        rateLimit: {
          max: 240,
          timeWindow: '1 minute',
        },
      },
    },
    async (request, reply) => {
      const { agentId, status, taskId } = request.body ?? {};
      if (!agentId) return reply.code(400).send({ error: 'agentId is required' });

      const existing = agentRegistry.get(agentId);
      if (!existing) return reply.code(404).send({ error: 'Agent not registered. Call /agent/register first.' });

      const now = new Date().toISOString();
      existing.lastSeen = now;
      if (status) existing.status = status;
      if (taskId !== undefined) existing.taskId = taskId;
      if (emitter) emitter.emit('change', { type: 'agent-update', timestamp: now });
      return { ok: true, agentId, lastSeen: now };
    }
  );

  fastify.get('/agents', async () => {
    const now = Date.now();
    const agents = Array.from(agentRegistry.values()).map(a => ({
      ...a,
      isStale: now - new Date(a.lastSeen).getTime() > 60_000,
    }));
    return { agents };
  });

  // GET /claudemd — read both CLAUDE.md files (plan dir + project root)
  fastify.get('/claudemd', async () => {
    const planMdPath = planDir ? join(planDir, 'CLAUDE.md') : null;
    const projectMdPath = planDir ? join(dirname(planDir), 'CLAUDE.md') : null;

    return {
      plan: planMdPath
        ? { path: planMdPath, content: existsSync(planMdPath) ? readFileSync(planMdPath, 'utf-8') : '', exists: existsSync(planMdPath) }
        : { path: null, content: '', exists: false },
      project: projectMdPath
        ? { path: projectMdPath, content: existsSync(projectMdPath) ? readFileSync(projectMdPath, 'utf-8') : '', exists: existsSync(projectMdPath) }
        : { path: null, content: '', exists: false },
    };
  });

  // PUT /claudemd — save CLAUDE.md content
  fastify.put<{ Body: { file?: 'plan' | 'project'; content?: string } }>(
    '/claudemd',
    {
      config: {
        rateLimit: {
          max: 30,
          timeWindow: '1 minute',
        },
      },
    },
    async (request, reply) => {
      if (!planDir) return reply.code(400).send({ error: 'Plan mode not configured' });

      const { file, content } = request.body ?? {};
      if (file !== 'plan' && file !== 'project') {
        return reply.code(400).send({ error: 'file must be "plan" or "project"' });
      }
      if (typeof content !== 'string') {
        return reply.code(400).send({ error: 'content must be a string' });
      }

      const targetPath = file === 'plan'
        ? join(planDir, 'CLAUDE.md')
        : join(dirname(planDir), 'CLAUDE.md');

      try {
        writeFileSync(targetPath, content, 'utf-8');
      } catch {
        return reply.code(500).send({ error: `Failed to write ${targetPath}` });
      }

      return { ok: true, path: targetPath };
    }
  );

  // GET /snapshots — list all context snapshots with metadata
  fastify.get('/snapshots', async (_request, reply) => {
    if (!planDir) return reply.code(404).send({ error: 'Plan mode not configured' });
    const entries = listSnapshots(planDir);
    return { snapshots: entries };
  });

  // GET /snapshots/:hash — get a specific snapshot by commit hash
  fastify.get<{ Params: { hash: string } }>('/snapshots/:hash', async (request, reply) => {
    if (!planDir) return reply.code(404).send({ error: 'Plan mode not configured' });
    const snap = readSnapshotByHash(planDir, request.params.hash);
    if (!snap) return reply.code(404).send({ error: 'Snapshot not found' });
    return snap;
  });

  // DELETE /snapshots/:hash — delete a snapshot
  fastify.delete<{ Params: { hash: string } }>(
    '/snapshots/:hash',
    {
      config: {
        rateLimit: {
          max: 20,
          timeWindow: '1 minute',
        },
      },
    },
    async (request, reply) => {
      if (!planDir) return reply.code(404).send({ error: 'Plan mode not configured' });
      const ok = deleteSnapshot(planDir, request.params.hash);
      if (!ok) return reply.code(404).send({ error: 'Snapshot not found' });
      return { ok: true };
    }
  );

  fastify.get('/claude-insights', async (_request, reply) => {
    const reportPath = join(claudeDir, 'usage-data', 'report.html');
    if (!existsSync(reportPath)) {
      return reply.code(404).send({
        error: 'Claude insights report not found',
        hint: 'Run /insight command in Claude Code to generate the report'
      });
    }
    reply.header('Content-Security-Policy', "sandbox; default-src 'none'");
    reply.type('text/html');
    return reply.sendFile('usage-data/report.html', join(claudeDir));
  });
}
