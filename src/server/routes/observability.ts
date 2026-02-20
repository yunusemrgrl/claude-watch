import type { FastifyInstance } from 'fastify';
import { readFileSync, existsSync } from 'fs';
import { join } from 'path';
import { readSessions } from '../../core/todoReader.js';
import { detectWorktrees, enrichWorktreeStatus } from '../../core/worktreeDetector.js';
import { mapTasksToWorktrees } from '../../core/worktreeMapper.js';

export interface ObservabilityRouteOptions {
  claudeDir: string;
}

export async function observabilityRoutes(fastify: FastifyInstance, opts: ObservabilityRouteOptions): Promise<void> {
  const { claudeDir } = opts;

  fastify.get('/usage', async (_req, reply) => {
    const usagePath = join(claudeDir, 'usage.json');
    if (!existsSync(usagePath)) {
      return reply.code(404).send({
        error: 'Usage data not found',
        hint: 'Claude Code does not yet write usage.json. Usage data is unavailable.',
      });
    }
    try {
      const raw = readFileSync(usagePath, 'utf8');
      return JSON.parse(raw) as unknown;
    } catch {
      return reply.code(500).send({ error: 'Failed to read usage.json' });
    }
  });

  fastify.get('/worktrees', async () => {
    try {
      const raw = await detectWorktrees(process.cwd());
      const enriched = await Promise.all(raw.map(w => enrichWorktreeStatus(w)));
      const sessions = readSessions(claudeDir);
      return { worktrees: mapTasksToWorktrees(sessions, enriched) };
    } catch {
      return { worktrees: [] };
    }
  });
}
