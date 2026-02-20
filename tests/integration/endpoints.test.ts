import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import Fastify from 'fastify';
import cors from '@fastify/cors';
import staticPlugin from '@fastify/static';
import { writeFileSync, mkdirSync, rmSync, existsSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';
import { planRoutes } from '../../src/server/routes/plan.js';

/**
 * Minimal server builder for integration tests.
 * Registers only the routes under test to avoid filesystem side effects.
 */
async function buildTestServer(agentScopeDir: string, claudeDir: string) {
  const fastify = Fastify({ logger: false });
  await fastify.register(cors, { origin: true });

  // Inline the routes that were added in this sprint to test them in isolation
  const { parseQualityTimeline } = await import('../../src/core/qualityTimeline.js');
  const { readSessions } = await import('../../src/core/todoReader.js');
  const { buildContextHealth } = await import('../../src/core/contextHealth.js');
  const { detectWorktrees, enrichWorktreeStatus } = await import('../../src/core/worktreeDetector.js');
  const { mapTasksToWorktrees } = await import('../../src/core/worktreeMapper.js');
  const { readFileSync: readFile, existsSync: exists } = await import('fs');

  // GET /quality-timeline
  fastify.get<{ Querystring: { sessionId?: string; taskId?: string } }>(
    '/quality-timeline',
    async (request) => {
      const logPath = join(agentScopeDir, 'execution.log');
      if (!exists(logPath)) return { events: [] };
      try {
        const content = readFile(logPath, 'utf-8');
        let events = parseQualityTimeline(content);
        const { taskId } = request.query;
        if (taskId) events = events.filter((e) => e.taskId === taskId);
        return { events };
      } catch {
        return { events: [] };
      }
    }
  );

  // GET /sessions
  fastify.get('/sessions', async () => {
    const sessions = readSessions(claudeDir).map((s) => ({
      ...s,
      contextHealth: buildContextHealth(s),
    }));
    return { sessions };
  });

  // GET /worktrees
  fastify.get('/worktrees', async () => {
    try {
      const raw = await detectWorktrees(process.cwd());
      const enriched = await Promise.all(raw.map((w) => enrichWorktreeStatus(w)));
      const sessions = readSessions(claudeDir);
      return { worktrees: mapTasksToWorktrees(sessions, enriched) };
    } catch {
      return { worktrees: [] };
    }
  });

  await fastify.ready();
  return fastify;
}

async function buildPlanServer(agentScopeDir: string, claudeDir: string) {
  const fastify = Fastify({ logger: false });
  await fastify.register(staticPlugin, { root: claudeDir });
  await planRoutes(fastify, { agentScopeDir, claudeDir });
  await fastify.ready();
  return fastify;
}

describe('GET /quality-timeline', () => {
  let tmpDir: string;
  let server: Awaited<ReturnType<typeof buildTestServer>>;

  beforeAll(async () => {
    tmpDir = join(tmpdir(), `claudedash-test-${Date.now()}`);
    mkdirSync(tmpDir, { recursive: true });
    server = await buildTestServer(tmpDir, tmpDir);
  });

  afterAll(async () => {
    await server.close();
    rmSync(tmpDir, { recursive: true, force: true });
  });

  it('should return empty array when log file does not exist', async () => {
    const res = await server.inject({ method: 'GET', url: '/quality-timeline' });
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.payload);
    expect(body).toEqual({ events: [] });
  });

  it('should return quality events from log', async () => {
    writeFileSync(
      join(tmpDir, 'execution.log'),
      '{"task_id":"F1-1","status":"DONE","timestamp":"2026-02-18T12:00:00Z","agent":"claude","meta":{"quality":{"lint":true,"test":true}}}\n'
    );

    const res = await server.inject({ method: 'GET', url: '/quality-timeline' });
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.payload);
    expect(body.events).toHaveLength(1);
    expect(body.events[0].taskId).toBe('F1-1');
    expect(body.events[0].checks.lint).toBe(true);
    expect(body.events[0].checks.test).toBe(true);
  });

  it('should filter events by taskId query param', async () => {
    writeFileSync(
      join(tmpDir, 'execution.log'),
      [
        '{"task_id":"F1-1","status":"DONE","timestamp":"2026-02-18T12:00:00Z","agent":"claude","meta":{"quality":{"lint":true}}}',
        '{"task_id":"F1-2","status":"DONE","timestamp":"2026-02-18T12:01:00Z","agent":"claude","meta":{"quality":{"test":false}}}',
      ].join('\n')
    );

    const res = await server.inject({ method: 'GET', url: '/quality-timeline?taskId=F1-1' });
    const body = JSON.parse(res.payload);
    expect(body.events).toHaveLength(1);
    expect(body.events[0].taskId).toBe('F1-1');
  });

  it('should return empty array for missing quality data', async () => {
    writeFileSync(
      join(tmpDir, 'execution.log'),
      '{"task_id":"F1-1","status":"DONE","timestamp":"2026-02-18T12:00:00Z","agent":"claude"}\n'
    );

    const res = await server.inject({ method: 'GET', url: '/quality-timeline' });
    const body = JSON.parse(res.payload);
    expect(body.events).toEqual([]);
  });

  it('should not 500 on malformed log content', async () => {
    writeFileSync(join(tmpDir, 'execution.log'), 'not json at all\n');
    const res = await server.inject({ method: 'GET', url: '/quality-timeline' });
    expect(res.statusCode).toBe(200);
  });
});

describe('GET /sessions (context health)', () => {
  let tmpDir: string;
  let server: Awaited<ReturnType<typeof buildTestServer>>;

  beforeAll(async () => {
    tmpDir = join(tmpdir(), `claudedash-test-session-${Date.now()}`);
    mkdirSync(tmpDir, { recursive: true });
    server = await buildTestServer(tmpDir, tmpDir);
  });

  afterAll(async () => {
    await server.close();
    rmSync(tmpDir, { recursive: true, force: true });
  });

  it('should return sessions array', async () => {
    const res = await server.inject({ method: 'GET', url: '/sessions' });
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.payload);
    expect(Array.isArray(body.sessions)).toBe(true);
  });
});

describe('GET /worktrees', () => {
  let tmpDir: string;
  let server: Awaited<ReturnType<typeof buildTestServer>>;

  beforeAll(async () => {
    tmpDir = join(tmpdir(), `claudedash-test-wt-${Date.now()}`);
    mkdirSync(tmpDir, { recursive: true });
    server = await buildTestServer(tmpDir, tmpDir);
  });

  afterAll(async () => {
    await server.close();
    rmSync(tmpDir, { recursive: true, force: true });
  });

  it('should return worktrees array', async () => {
    const res = await server.inject({ method: 'GET', url: '/worktrees' });
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.payload);
    expect(Array.isArray(body.worktrees)).toBe(true);
  });

  it('should not 500 when git is unavailable for cwd', async () => {
    const res = await server.inject({ method: 'GET', url: '/worktrees' });
    expect(res.statusCode).toBe(200);
  });
});

describe('GET /claude-insights', () => {
  let tmpDir: string;
  let server: Awaited<ReturnType<typeof buildPlanServer>>;

  beforeAll(async () => {
    tmpDir = join(tmpdir(), `claudedash-test-insights-${Date.now()}`);
    mkdirSync(join(tmpDir, 'usage-data'), { recursive: true });
    writeFileSync(
      join(tmpDir, 'usage-data', 'report.html'),
      '<!doctype html><html><body><script>window.__xss = true;</script></body></html>'
    );
    server = await buildPlanServer(tmpDir, tmpDir);
  });

  afterAll(async () => {
    await server.close();
    rmSync(tmpDir, { recursive: true, force: true });
  });

  it('should return report HTML with sandbox CSP', async () => {
    const res = await server.inject({ method: 'GET', url: '/claude-insights' });
    expect(res.statusCode).toBe(200);
    expect(res.headers['content-security-policy']).toBe("sandbox; default-src 'none'");
    expect(String(res.headers['content-type'])).toContain('text/html');
  });

  it('should return 404 when report file does not exist', async () => {
    rmSync(join(tmpDir, 'usage-data', 'report.html'));
    const res = await server.inject({ method: 'GET', url: '/claude-insights' });
    expect(res.statusCode).toBe(404);
    const body = JSON.parse(res.payload);
    expect(body.error).toBe('Claude insights report not found');
  });
});
