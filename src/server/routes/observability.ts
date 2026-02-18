import type { FastifyInstance } from 'fastify';
import { readSessions } from '../../core/todoReader.js';
import { detectWorktrees, enrichWorktreeStatus } from '../../core/worktreeDetector.js';
import { mapTasksToWorktrees } from '../../core/worktreeMapper.js';

export interface ObservabilityRouteOptions {
  claudeDir: string;
}

export async function observabilityRoutes(fastify: FastifyInstance, opts: ObservabilityRouteOptions): Promise<void> {
  const { claudeDir } = opts;

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
