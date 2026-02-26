import { watch, type FSWatcher } from 'chokidar';
import { EventEmitter } from 'events';
import { existsSync } from 'fs';
import { join } from 'path';
import { DEFAULT_SOURCE, getSourceLayout, type SourceProvider } from '../platform/source.js';

export interface WatcherOptions {
  claudeDir: string;
  planDir?: string;
  source?: SourceProvider;
}

export interface WatchEvent {
  type: 'sessions' | 'plan';
  timestamp: string;
}

/**
 * Creates a file watcher that emits events when task files change.
 * Watches ~/.claude/tasks/ and ~/.claude/todos/ for Live mode and .claudedash/ for Plan mode.
 * Monitors parent directory to detect late-created subdirectories.
 */
export function createWatcher(options: WatcherOptions): { watcher: FSWatcher; emitter: EventEmitter } {
  const emitter = new EventEmitter();
  const watchPaths: string[] = [];
  const trackedSessionDirs = new Set<string>();
  const layout = getSourceLayout(options.source ?? DEFAULT_SOURCE, options.claudeDir);

  const claudeTasksDir = layout.tasksDir;
  const claudeTodosDir = layout.todosDir;

  // Add existing session directories
  for (const dir of [claudeTasksDir, claudeTodosDir]) {
    if (existsSync(dir)) {
      watchPaths.push(dir);
      trackedSessionDirs.add(dir);
    }
  }

  // Watch claudedash files if configured
  if (options.planDir && existsSync(options.planDir)) {
    const queuePath = join(options.planDir, 'queue.md');
    const logPath = join(options.planDir, 'execution.log');
    if (existsSync(queuePath)) watchPaths.push(queuePath);
    if (existsSync(logPath)) watchPaths.push(logPath);
  }

  // Always watch the parent claude dir to detect late-created tasks/ and todos/
  if (existsSync(options.claudeDir)) {
    watchPaths.push(options.claudeDir);
  }

  if (watchPaths.length === 0) {
    const noopWatcher = watch([], { persistent: false });
    return { watcher: noopWatcher, emitter };
  }

  let debounceTimer: ReturnType<typeof setTimeout> | null = null;
  let pendingEventType: WatchEvent['type'] | null = null;

  const watcher = watch(watchPaths, {
    persistent: true,
    ignoreInitial: true,
    depth: 2,
    awaitWriteFinish: {
      stabilityThreshold: 100,
      pollInterval: 50
    }
  });

  const emitDebounced = (eventType: WatchEvent['type']) => {
    if (pendingEventType && pendingEventType !== eventType) {
      pendingEventType = 'sessions';
    } else {
      pendingEventType = eventType;
    }

    if (debounceTimer) clearTimeout(debounceTimer);

    debounceTimer = setTimeout(() => {
      if (pendingEventType) {
        const event: WatchEvent = {
          type: pendingEventType,
          timestamp: new Date().toISOString()
        };
        emitter.emit('change', event);
        pendingEventType = null;
      }
    }, 100);
  };

  const classifyEvent = (path: string): WatchEvent['type'] => {
    return path.includes('.claudedash') ? 'plan' : 'sessions';
  };

  // Detect late-created directories and start watching them
  const maybeTrackNewDir = (path: string) => {
    for (const dir of [claudeTasksDir, claudeTodosDir]) {
      if (path === dir && !trackedSessionDirs.has(dir) && existsSync(dir)) {
        watcher.add(dir);
        trackedSessionDirs.add(dir);
      }
    }
  };

  watcher.on('addDir', (path: string) => {
    maybeTrackNewDir(path);
  });

  watcher.on('change', (path: string) => {
    emitDebounced(classifyEvent(path));
  });

  watcher.on('add', (path: string) => {
    emitDebounced(classifyEvent(path));
  });

  watcher.on('unlink', (path: string) => {
    emitDebounced(classifyEvent(path));
  });

  return { watcher, emitter };
}
