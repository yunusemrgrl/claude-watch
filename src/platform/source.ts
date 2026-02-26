import { existsSync } from 'fs';
import { join } from 'path';

export type SourceProvider = 'claude-code';

export const DEFAULT_SOURCE: SourceProvider = 'claude-code';

export interface SourceLayout {
  tasksDir: string;
  todosDir: string;
  projectsDir: string;
  usageDataDir: string;
  plansDir: string;
  statsCachePath: string;
  historyPath: string;
}

export function parseSource(input?: string): SourceProvider | null {
  const normalized = (input ?? DEFAULT_SOURCE).trim().toLowerCase();
  if (normalized === 'claude-code' || normalized === 'claude') return 'claude-code';
  return null;
}

export function getSourceLayout(source: SourceProvider, baseDir: string): SourceLayout {
  switch (source) {
    case 'claude-code':
      return {
        tasksDir: join(baseDir, 'tasks'),
        todosDir: join(baseDir, 'todos'),
        projectsDir: join(baseDir, 'projects'),
        usageDataDir: join(baseDir, 'usage-data'),
        plansDir: join(baseDir, 'plans'),
        statsCachePath: join(baseDir, 'stats-cache.json'),
        historyPath: join(baseDir, 'history.jsonl'),
      };
  }
}

export function hasLiveSourceData(source: SourceProvider, baseDir: string): boolean {
  const layout = getSourceLayout(source, baseDir);
  return existsSync(layout.tasksDir) || existsSync(layout.todosDir);
}
