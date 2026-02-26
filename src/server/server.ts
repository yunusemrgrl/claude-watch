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
  planDir?: string;
  claudeDir: string;
  port: number;
  host?: string;
  token?: string;
}

export async function startServer(options: ServerOptions): Promise<void> {
  const { claudeDir, port, planDir, host = '127.0.0.1', token } = options;

  const fastify = Fastify({ logger: false, routerOptions: { ignoreTrailingSlash: true } });

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

  // Token auth middleware — protect all API endpoints when token is set
  if (token) {
    fastify.addHook('onRequest', async (request, reply) => {
      // Static assets and dashboard HTML pass through
      const url = request.url.split('?')[0];
      const isApi = !url.match(/\.(html|js|css|png|svg|ico|woff2?)$/) && url !== '/';
      if (!isApi) return;

      const authHeader = request.headers['authorization'];
      const provided = authHeader?.startsWith('Bearer ')
        ? authHeader.slice(7)
        : undefined;

      if (provided !== token) {
        return reply.code(401).send({ error: 'Unauthorized. Use Authorization: Bearer <token>' });
      }
    });
  }

  const { watcher, emitter } = createWatcher({ claudeDir, planDir });

  fastify.addHook('onClose', async () => { await watcher.close(); });

  // ── Endpoint timing metrics ───────────────────────────────────────────────
  // Rolling ring buffer of last 100 response times per route (ms).
  const RING_SIZE = 100;
  const timings = new Map<string, number[]>();

  fastify.addHook('onResponse', (request, reply, done) => {
    const route = request.routeOptions?.url ?? request.url.split('?')[0];
    // Skip SSE stream, static files, and the timing endpoint itself
    if (route === '/events' || route === '/debug/timing' || reply.getHeader('content-type')?.toString().startsWith('text/event-stream')) {
      done(); return;
    }
    const ms = reply.elapsedTime;
    const buf = timings.get(route) ?? [];
    buf.push(ms);
    if (buf.length > RING_SIZE) buf.shift();
    timings.set(route, buf);
    done();
  });

  fastify.get('/debug/timing', async () => {
    const result: Record<string, { p50: number; p95: number; max: number; samples: number }> = {};
    for (const [route, samples] of timings) {
      if (samples.length === 0) continue;
      const sorted = [...samples].sort((a, b) => a - b);
      const p = (pct: number) => sorted[Math.min(Math.floor(sorted.length * pct / 100), sorted.length - 1)];
      result[route] = {
        p50: Math.round(p(50) * 10) / 10,
        p95: Math.round(p(95) * 10) / 10,
        max: Math.round(Math.max(...sorted) * 10) / 10,
        samples: sorted.length,
      };
    }
    return result;
  });

  await fastify.register(liveRoutes, { claudeDir, planDir, emitter });
  await fastify.register(planRoutes, { claudeDir, planDir, emitter });
  await fastify.register(observabilityRoutes, { claudeDir, emitter });

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
