import type { FastifyInstance } from 'fastify';
import { existsSync, readFileSync } from 'fs';
import { join } from 'path';
import { parseQueue, type QueueParseConfig } from '../../core/queueParser.js';
import { parseLog } from '../../core/logParser.js';
import { computeSnapshot } from '../../core/stateEngine.js';
import { computePlanInsights, computeLiveInsights } from '../../core/insightsEngine.js';
import { readSessions } from '../../core/todoReader.js';
import { parseQualityTimeline } from '../../core/qualityTimeline.js';
import type { Snapshot, InsightsResponse } from '../../core/types.js';

export interface PlanRouteOptions {
  claudeDir: string;
  agentScopeDir?: string;
}

function readQueueParseConfig(agentScopeDir: string): QueueParseConfig | undefined {
  const configPath = join(agentScopeDir, 'config.json');
  if (!existsSync(configPath)) return undefined;
  try {
    const configData = JSON.parse(readFileSync(configPath, 'utf-8'));
    if (configData.taskModel) return configData.taskModel;
  } catch { /* use defaults */ }
  return undefined;
}

export async function planRoutes(fastify: FastifyInstance, opts: PlanRouteOptions): Promise<void> {
  const { claudeDir, agentScopeDir } = opts;

  fastify.get('/snapshot', async () => {
    if (!agentScopeDir) {
      return {
        snapshot: null,
        queueErrors: ['Plan mode not configured. Run "agent-scope init" first.'],
        logErrors: [],
        meta: { generatedAt: new Date().toISOString(), totalTasks: 0 }
      };
    }

    const queuePath = join(agentScopeDir, 'queue.md');
    const logPath = join(agentScopeDir, 'execution.log');

    if (!existsSync(queuePath)) {
      return {
        snapshot: null,
        queueErrors: ['queue.md not found'],
        logErrors: [],
        meta: { generatedAt: new Date().toISOString(), totalTasks: 0 }
      };
    }

    const queueParseConfig = readQueueParseConfig(agentScopeDir);
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

    return {
      snapshot,
      queueErrors: [],
      logErrors: logResult.errors,
      meta: { generatedAt: new Date().toISOString(), totalTasks: queueResult.tasks.length }
    };
  });

  fastify.get('/insights', async () => {
    const hasLive = existsSync(join(claudeDir, 'tasks')) || existsSync(join(claudeDir, 'todos'));
    const hasPlan = agentScopeDir ? existsSync(join(agentScopeDir, 'queue.md')) : false;

    const response: InsightsResponse = {
      mode: hasLive && hasPlan ? 'both' : hasLive ? 'live' : 'plan',
      generatedAt: new Date().toISOString(),
    };

    if (hasLive) {
      response.live = computeLiveInsights(readSessions(claudeDir));
    }

    if (hasPlan && agentScopeDir) {
      const queuePath = join(agentScopeDir, 'queue.md');
      const logPath = join(agentScopeDir, 'execution.log');
      if (existsSync(queuePath)) {
        const queueParseConfig = readQueueParseConfig(agentScopeDir);
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

  fastify.get<{ Querystring: { taskId?: string } }>('/quality-timeline', async (request) => {
    if (!agentScopeDir) return { events: [] };
    const logPath = join(agentScopeDir, 'execution.log');
    if (!existsSync(logPath)) return { events: [] };
    try {
      let events = parseQualityTimeline(readFileSync(logPath, 'utf-8'));
      if (request.query.taskId) {
        events = events.filter(e => e.taskId === request.query.taskId);
      }
      return { events };
    } catch {
      return { events: [] };
    }
  });

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
