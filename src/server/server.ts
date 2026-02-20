import Fastify from 'fastify';
import cors from '@fastify/cors';
import rateLimit from '@fastify/rate-limit';
import staticPlugin from '@fastify/static';
import { existsSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { createWatcher } from './watcher.js';
import { liveRoutes } from './routes/live.js';
import { planRoutes } from './routes/plan.js';
import { observabilityRoutes } from './routes/observability.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

export interface ServerOptions {
  agentScopeDir?: string;
  claudeDir: string;
  port: number;
  host?: string;
}

export async function startServer(options: ServerOptions): Promise<void> {
  const { claudeDir, port, agentScopeDir, host = '127.0.0.1' } = options;

  const fastify = Fastify({ logger: false, ignoreTrailingSlash: true });

  await fastify.register(rateLimit, {
    max: 100,
    timeWindow: '1 minute',
    allowList: ['127.0.0.1', '::1'],
    addHeaders: {
      'x-ratelimit-limit': true,
      'x-ratelimit-remaining': true,
      'x-ratelimit-reset': true,
      'retry-after': true,
    },
  });

  const allowedOrigins = [
    `http://localhost:${port}`,
    `http://127.0.0.1:${port}`,
  ];
  await fastify.register(cors, {
    origin: (origin, cb) => {
      if (!origin || allowedOrigins.includes(origin)) {
        cb(null, true);
      } else {
        cb(new Error('Not allowed by CORS'), false);
      }
    },
  });

  const { watcher, emitter } = createWatcher({ claudeDir, agentScopeDir });

  fastify.addHook('onClose', async () => { await watcher.close(); });

  await fastify.register(liveRoutes, { claudeDir, agentScopeDir, emitter });
  await fastify.register(planRoutes, { claudeDir, agentScopeDir, emitter });
  await fastify.register(observabilityRoutes, { claudeDir });

  // Serve static dashboard + SPA fallback
  const publicPath = join(__dirname, '../public');
  if (existsSync(publicPath)) {
    await fastify.register(staticPlugin, { root: publicPath, prefix: '/' });
    fastify.get('/', async (_request, reply) => reply.sendFile('index.html'));
    fastify.setNotFoundHandler(async (_request, reply) => {
      if (_request.url.startsWith('/api/') || _request.url.match(/\.\w+$/)) {
        return reply.code(404).send({ error: 'Not found' });
      }
      return reply.sendFile('index.html');
    });
  }

  try {
    await fastify.listen({ port, host });
  } catch (err) {
    fastify.log.error(err);
    throw err;
  }
}
