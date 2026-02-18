import Fastify from 'fastify';
import cors from '@fastify/cors';
import staticPlugin from '@fastify/static';
import { readFileSync, existsSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { parseQueue, type QueueParseConfig } from '../core/queueParser.js';
import { parseLog } from '../core/logParser.js';
import { computeSnapshot } from '../core/stateEngine.js';
import { computePlanInsights, computeLiveInsights } from '../core/insightsEngine.js';
import { readSessions } from '../core/todoReader.js';
import { createWatcher, type WatchEvent } from './watcher.js';
import type { Snapshot, InsightsResponse } from '../core/types.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

export interface ServerOptions {
  agentScopeDir?: string;
  claudeDir: string;
  port: number;
}

export async function startServer(options: ServerOptions): Promise<void> {
  const { claudeDir, port, agentScopeDir } = options;

  const fastify = Fastify({
    logger: false,
    ignoreTrailingSlash: true
  });

  // Enable CORS
  await fastify.register(cors, {
    origin: true
  });

  // Setup file watcher
  const { watcher, emitter } = createWatcher({
    claudeDir,
    agentScopeDir
  });

  // Track SSE clients
  const sseClients = new Set<(event: WatchEvent) => void>();

  emitter.on('change', (event: WatchEvent) => {
    for (const send of sseClients) {
      send(event);
    }
  });

  // Cleanup on server close
  fastify.addHook('onClose', async () => {
    await watcher.close();
  });

  // Health check endpoint
  fastify.get('/health', async () => {
    const hasLive = existsSync(join(claudeDir, 'tasks')) || existsSync(join(claudeDir, 'todos'));
    const hasPlan = agentScopeDir ? existsSync(join(agentScopeDir, 'queue.md')) : false;
    return { status: 'ok', modes: { live: hasLive, plan: hasPlan } };
  });

  // SSE endpoint for real-time updates
  fastify.get('/events', async (_request, reply) => {
    reply.raw.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive',
      'Access-Control-Allow-Origin': '*'
    });

    // Send initial connection event
    reply.raw.write(`data: ${JSON.stringify({ type: 'connected', timestamp: new Date().toISOString() })}\n\n`);

    const send = (event: WatchEvent) => {
      reply.raw.write(`data: ${JSON.stringify(event)}\n\n`);
    };

    sseClients.add(send);

    // Keep-alive ping every 30s
    const pingInterval = setInterval(() => {
      reply.raw.write(`: ping\n\n`);
    }, 30000);

    _request.raw.on('close', () => {
      sseClients.delete(send);
      clearInterval(pingInterval);
    });

    // Don't end the response - keep it open for SSE
    await new Promise(() => {}); // never resolves
  });

  // Live mode: List all sessions
  fastify.get('/sessions', async () => {
    const sessions = readSessions(claudeDir);
    return { sessions };
  });

  // Live mode: Get tasks for a specific session
  fastify.get<{ Params: { id: string } }>('/sessions/:id', async (request) => {
    const sessions = readSessions(claudeDir);
    const session = sessions.find(s => s.id === request.params.id);
    if (!session) {
      return { session: null, error: 'Session not found' };
    }
    return { session };
  });

  // Plan mode: Snapshot endpoint (existing functionality)
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

    // Read config for queue parse patterns
    const configPath = join(agentScopeDir, 'config.json');
    let queueParseConfig: QueueParseConfig | undefined;
    if (existsSync(configPath)) {
      try {
        const configData = JSON.parse(readFileSync(configPath, 'utf-8'));
        if (configData.taskModel) {
          queueParseConfig = {
            id: configData.taskModel.id,
            headings: configData.taskModel.headings,
            fields: configData.taskModel.fields
          };
        }
      } catch { /* use defaults */ }
    }

    // Read and parse queue
    const queueContent = readFileSync(queuePath, 'utf-8');
    const queueResult = parseQueue(queueContent, queueParseConfig);

    if (queueResult.errors.length > 0) {
      return {
        snapshot: null,
        queueErrors: queueResult.errors,
        logErrors: [],
        meta: { generatedAt: new Date().toISOString(), totalTasks: 0 }
      };
    }

    // Read and parse log
    let logResult = parseLog('');
    if (existsSync(logPath)) {
      const logContent = readFileSync(logPath, 'utf-8');
      logResult = parseLog(logContent);
    }

    // Compute snapshot
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

  // Insights endpoint - analytics for both Live and Plan modes
  fastify.get('/insights', async () => {
    const hasLive = existsSync(join(claudeDir, 'tasks')) || existsSync(join(claudeDir, 'todos'));
    const hasPlan = agentScopeDir ? existsSync(join(agentScopeDir, 'queue.md')) : false;

    const response: InsightsResponse = {
      mode: hasLive && hasPlan ? 'both' : hasLive ? 'live' : 'plan',
      generatedAt: new Date().toISOString(),
    };

    // Compute Live insights
    if (hasLive) {
      const sessions = readSessions(claudeDir);
      response.live = computeLiveInsights(sessions);
    }

    // Compute Plan insights
    if (hasPlan && agentScopeDir) {
      const queuePath = join(agentScopeDir, 'queue.md');
      const logPath = join(agentScopeDir, 'execution.log');

      if (existsSync(queuePath)) {
        // Read config for queue parse patterns
        const configPath = join(agentScopeDir, 'config.json');
        let queueParseConfig: QueueParseConfig | undefined;
        if (existsSync(configPath)) {
          try {
            const configData = JSON.parse(readFileSync(configPath, 'utf-8'));
            if (configData.taskModel) {
              queueParseConfig = {
                id: configData.taskModel.id,
                headings: configData.taskModel.headings,
                fields: configData.taskModel.fields
              };
            }
          } catch { /* use defaults */ }
        }

        // Parse queue
        const queueContent = readFileSync(queuePath, 'utf-8');
        const queueResult = parseQueue(queueContent, queueParseConfig);

        if (queueResult.errors.length === 0) {
          // Parse log
          let logResult = parseLog('');
          if (existsSync(logPath)) {
            const logContent = readFileSync(logPath, 'utf-8');
            logResult = parseLog(logContent);
          }

          // Compute snapshot first, then insights
          try {
            const snapshot = computeSnapshot(queueResult.tasks, logResult.events);
            response.plan = computePlanInsights(snapshot.tasks, logResult.events);
          } catch { /* skip plan insights on error */ }
        }
      }
    }

    return response;
  });

  // Serve static files and SPA
  const publicPath = join(__dirname, '../public');
  if (existsSync(publicPath)) {
    await fastify.register(staticPlugin, {
      root: publicPath,
      prefix: '/'
    });

    fastify.get('/', async (_request, reply) => {
      return reply.sendFile('index.html');
    });

    fastify.setNotFoundHandler(async (_request, reply) => {
      if (_request.url.startsWith('/api/') || _request.url.match(/\.\w+$/)) {
        return reply.code(404).send({ error: 'Not found' });
      }
      return reply.sendFile('index.html');
    });
  }

  // Start server
  try {
    await fastify.listen({ port, host: '0.0.0.0' });
  } catch (err) {
    fastify.log.error(err);
    throw err;
  }
}
