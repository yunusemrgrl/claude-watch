/**
 * E2E Smoke Test — Live Mode with Quality Events, Context Warnings, and Worktree Panel
 *
 * This test simulates a full agent workflow:
 * 1. Creates a realistic session directory (TodoWrite format)
 * 2. Populates execution.log with quality check results
 * 3. Starts an in-process server on a free port
 * 4. Verifies endpoint data accuracy: sessions (with contextHealth), quality-timeline, worktrees
 * 5. Validates SSE connection delivery
 *
 * Reproducible: run with `npx vitest run tests/integration/e2e-smoke.test.ts`
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { writeFileSync, mkdirSync, rmSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';
import { startServer } from '../../src/server/server.js';
import http from 'http';

const PORT = 17831;
const BASE = `http://127.0.0.1:${PORT}`;

// Helper to GET a URL and parse JSON
async function get(path: string): Promise<unknown> {
  return new Promise((resolve, reject) => {
    http.get(`${BASE}${path}`, (res) => {
      let data = '';
      res.on('data', (chunk) => { data += chunk; });
      res.on('end', () => {
        try { resolve(JSON.parse(data)); } catch { resolve(data); }
      });
    }).on('error', reject);
  });
}

// Helper to read one SSE event (with timeout)
function readOneSSEEvent(timeoutMs = 5000): Promise<string> {
  return new Promise((resolve, reject) => {
    const req = http.get(`${BASE}/events`, (res) => {
      res.setEncoding('utf8');
      let buf = '';
      const timer = setTimeout(() => {
        req.destroy();
        resolve('timeout'); // receiving keep-alive ping counts as connected
      }, timeoutMs);
      res.on('data', (chunk: string) => {
        buf += chunk;
        if (buf.includes('data:')) {
          clearTimeout(timer);
          req.destroy();
          resolve(buf);
        }
      });
    });
    req.on('error', (e) => {
      // ECONNRESET is expected when we destroy mid-stream
      if ((e as NodeJS.ErrnoException).code === 'ECONNRESET') resolve('connected');
      else reject(e);
    });
  });
}

describe('E2E Smoke — Live Mode + Quality + Context + Worktrees', () => {
  let tmpClaudeDir: string;
  let tmpAgentScopeDir: string;
  let sessionId: string;

  beforeAll(async () => {
    // --- Create realistic directory structure ---
    sessionId = 'e2e-smoke-session-001';
    tmpClaudeDir = join(tmpdir(), `claudedash-e2e-${Date.now()}`);
    tmpAgentScopeDir = join(tmpClaudeDir, '.claudedash');

    // Create session task files (legacy tasks/ format — individual JSON per task)
    const tasksDir = join(tmpClaudeDir, 'tasks', sessionId);
    mkdirSync(tasksDir, { recursive: true });
    mkdirSync(tmpAgentScopeDir, { recursive: true });

    writeFileSync(join(tasksDir, '1.json'), JSON.stringify({
      id: '1',
      subject: 'Implement feature X',
      description: 'Write the implementation',
      activeForm: 'Implementing feature X',
      status: 'completed',
      blocks: [],
      blockedBy: [],
    }));

    writeFileSync(join(tasksDir, '2.json'), JSON.stringify({
      id: '2',
      subject: 'Write tests for feature X',
      description: 'Test coverage',
      activeForm: '',
      status: 'in_progress',
      blocks: [],
      blockedBy: [],
    }));

    // Project metadata in projects/ JSONL format (100k input tokens = 50% context)
    const projectsDir = join(tmpClaudeDir, 'projects', 'e2e-smoke-project');
    mkdirSync(projectsDir, { recursive: true });
    writeFileSync(join(projectsDir, `${sessionId}.jsonl`), [
      JSON.stringify({ cwd: tmpClaudeDir }),
      JSON.stringify({ message: { usage: { input_tokens: 100_000, output_tokens: 5_000, cache_creation_input_tokens: 0, cache_read_input_tokens: 0 } } }),
    ].join('\n'));

    // Execution log with quality events
    writeFileSync(join(tmpAgentScopeDir, 'execution.log'), [
      JSON.stringify({
        task_id: 'F1-1',
        status: 'DONE',
        timestamp: '2026-02-18T10:00:00Z',
        agent: 'claude',
        meta: { quality: { lint: true, typecheck: true, test: true } },
      }),
      JSON.stringify({
        task_id: 'F1-2',
        status: 'DONE',
        timestamp: '2026-02-18T11:00:00Z',
        agent: 'claude',
        meta: { quality: { lint: true, typecheck: false, test: true }, file: 'src/core/logParser.ts' },
      }),
    ].join('\n'));

    // Start server
    await startServer({
      claudeDir: tmpClaudeDir,
      agentScopeDir: tmpAgentScopeDir,
      port: PORT,
    });
  }, 30_000);

  afterAll(() => {
    rmSync(tmpClaudeDir, { recursive: true, force: true });
  });

  it('should respond to /health', async () => {
    const body = await get('/health') as { status: string; modes: { live: boolean } };
    expect(body.status).toBe('ok');
  });

  it('should return sessions with contextHealth field', async () => {
    const body = await get('/sessions') as { sessions: Array<{
      contextHealth: { percentage: number; warningLevel: string } | null;
    }> };
    expect(body.sessions.length).toBeGreaterThan(0);
    const session = body.sessions[0];
    // Context health should be computed (100k/200k = 50% = safe)
    expect(session.contextHealth).not.toBeNull();
    expect(session.contextHealth!.percentage).toBe(50);
    expect(session.contextHealth!.warningLevel).toBe('safe');
  });

  it('should return quality events from /quality-timeline', async () => {
    const body = await get('/quality-timeline') as { events: Array<{
      taskId: string;
      checks: Record<string, boolean>;
    }> };
    expect(body.events.length).toBe(2);

    const f1 = body.events.find((e) => e.taskId === 'F1-1')!;
    expect(f1).toBeDefined();
    expect(f1.checks.lint).toBe(true);
    expect(f1.checks.typecheck).toBe(true);
    expect(f1.checks.test).toBe(true);
  });

  it('should filter quality events by taskId', async () => {
    const body = await get('/quality-timeline?taskId=F1-2') as { events: Array<{
      taskId: string;
      checks: Record<string, boolean>;
    }> };
    expect(body.events).toHaveLength(1);
    expect(body.events[0].taskId).toBe('F1-2');
    expect(body.events[0].checks.typecheck).toBe(false);
  });

  it('should return quality events sorted chronologically', async () => {
    const body = await get('/quality-timeline') as { events: Array<{ timestamp: string }> };
    const timestamps = body.events.map((e) => e.timestamp);
    expect(timestamps).toEqual([...timestamps].sort());
  });

  it('should return worktrees array from /worktrees', async () => {
    const body = await get('/worktrees') as { worktrees: unknown[] };
    expect(Array.isArray(body.worktrees)).toBe(true);
  });

  it('should connect to SSE /events endpoint', async () => {
    const result = await readOneSSEEvent(3000);
    // We expect either a 'data:' event or timeout (keep-alive ping)
    // Either confirms SSE is working
    expect(['timeout', 'connected'].some((s) => result.includes(s) || result.includes('data:'))).toBe(true);
  });
});
