import { readdirSync, readFileSync, statSync, existsSync } from 'fs';
import { join } from 'path';
import type { ClaudeTask, ClaudeSession } from './types.js';

const SKIP_FILES = new Set(['.lock', '.highwatermark']);

/**
 * Reads all sessions from ~/.claude/tasks/ and ~/.claude/todos/ directories.
 * tasks/: legacy format — subdirectories with individual JSON task files.
 * todos/: current format — single JSON array file per session.
 */
export function readSessions(claudeDir: string): ClaudeSession[] {
  const sessionMap = new Map<string, ClaudeSession>();

  // Read legacy tasks/ directory (subdirectories with individual files)
  const tasksDir = join(claudeDir, 'tasks');
  if (existsSync(tasksDir)) {
    const entries = readdirSync(tasksDir, { withFileTypes: true });
    for (const entry of entries) {
      if (!entry.isDirectory()) continue;
      const session = readSession(tasksDir, entry.name);
      if (session && session.tasks.length > 0) {
        sessionMap.set(session.id, session);
      }
    }
  }

  // Read current todos/ directory (single array file per session)
  const todosDir = join(claudeDir, 'todos');
  if (existsSync(todosDir)) {
    const files = readdirSync(todosDir).filter(f => f.endsWith('.json'));
    for (const file of files) {
      const session = readTodosFile(todosDir, file);
      if (session && session.tasks.length > 0) {
        // todos/ format is newer, overwrite if duplicate sessionId
        sessionMap.set(session.id, session);
      }
    }
  }

  const sessions = Array.from(sessionMap.values());

  // Sort by most recent activity (updatedAt desc)
  sessions.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));

  return sessions;
}

/**
 * Reads tasks for a specific session.
 */
export function readSession(tasksDir: string, sessionId: string): ClaudeSession | null {
  const sessionDir = join(tasksDir, sessionId);

  if (!existsSync(sessionDir)) {
    return null;
  }

  const tasks = readSessionTasks(sessionDir);

  if (tasks.length === 0) {
    return null;
  }

  // Derive timestamps from file stats
  let earliestCreated = Infinity;
  let latestModified = 0;

  const files = readdirSync(sessionDir).filter(f => f.endsWith('.json'));
  for (const file of files) {
    try {
      const stat = statSync(join(sessionDir, file));
      const created = stat.birthtime.getTime();
      const modified = stat.mtime.getTime();
      if (created < earliestCreated) earliestCreated = created;
      if (modified > latestModified) latestModified = modified;
    } catch { /* skip */ }
  }

  return {
    id: sessionId,
    tasks,
    createdAt: earliestCreated === Infinity
      ? new Date().toISOString()
      : new Date(earliestCreated).toISOString(),
    updatedAt: latestModified === 0
      ? new Date().toISOString()
      : new Date(latestModified).toISOString()
  };
}

/**
 * Reads all task JSON files from a session directory.
 */
function readSessionTasks(sessionDir: string): ClaudeTask[] {
  const entries = readdirSync(sessionDir);
  const tasks: ClaudeTask[] = [];

  for (const entry of entries) {
    // Skip non-JSON and meta files
    if (!entry.endsWith('.json') || SKIP_FILES.has(entry)) continue;

    try {
      const content = readFileSync(join(sessionDir, entry), 'utf-8');
      const parsed = JSON.parse(content);
      const task = validateClaudeTask(parsed);
      if (task) {
        tasks.push(task);
      }
    } catch { /* skip invalid files */ }
  }

  // Sort by numeric ID
  tasks.sort((a, b) => {
    const numA = parseInt(a.id, 10);
    const numB = parseInt(b.id, 10);
    if (!isNaN(numA) && !isNaN(numB)) return numA - numB;
    return a.id.localeCompare(b.id);
  });

  return tasks;
}

/**
 * Reads a todos/ format file: single JSON array with all tasks.
 * Filename pattern: <sessionId>-agent-<sessionId>.json
 */
function readTodosFile(todosDir: string, filename: string): ClaudeSession | null {
  // Extract sessionId from filename (e.g. "abc123-agent-abc123.json" → "abc123")
  const match = filename.match(/^([a-f0-9-]+)-agent-/);
  if (!match) return null;

  const sessionId = match[1];
  const filePath = join(todosDir, filename);

  try {
    const content = readFileSync(filePath, 'utf-8');
    const parsed = JSON.parse(content);

    if (!Array.isArray(parsed)) return null;

    const tasks: ClaudeTask[] = [];
    for (let i = 0; i < parsed.length; i++) {
      const task = validateTodoItem(parsed[i], i);
      if (task) tasks.push(task);
    }

    if (tasks.length === 0) return null;

    const stat = statSync(filePath);
    return {
      id: sessionId,
      tasks,
      createdAt: stat.birthtime.toISOString(),
      updatedAt: stat.mtime.toISOString()
    };
  } catch {
    return null;
  }
}

/**
 * Validates a todo item from the todos/ format (has content instead of subject, no id).
 */
function validateTodoItem(obj: unknown, index: number): ClaudeTask | null {
  if (!obj || typeof obj !== 'object') return null;

  const record = obj as Record<string, unknown>;

  if (typeof record.status !== 'string') return null;

  const validStatuses = ['pending', 'in_progress', 'completed'];
  if (!validStatuses.includes(record.status)) return null;

  // todos format uses "content" instead of "subject"
  const subject = typeof record.content === 'string' ? record.content
    : typeof record.subject === 'string' ? record.subject : '';

  return {
    id: typeof record.id === 'string' ? record.id : String(index + 1),
    subject,
    description: typeof record.description === 'string' ? record.description : '',
    activeForm: typeof record.activeForm === 'string' ? record.activeForm : '',
    status: record.status as ClaudeTask['status'],
    blocks: Array.isArray(record.blocks) ? record.blocks.filter((b): b is string => typeof b === 'string') : [],
    blockedBy: Array.isArray(record.blockedBy) ? record.blockedBy.filter((b): b is string => typeof b === 'string') : []
  };
}

/**
 * Validates and normalizes a parsed JSON object into a ClaudeTask (legacy tasks/ format).
 */
function validateClaudeTask(obj: unknown): ClaudeTask | null {
  if (!obj || typeof obj !== 'object') return null;

  const record = obj as Record<string, unknown>;

  if (typeof record.id !== 'string') return null;
  if (typeof record.status !== 'string') return null;

  const validStatuses = ['pending', 'in_progress', 'completed'];
  if (!validStatuses.includes(record.status)) return null;

  return {
    id: record.id,
    subject: typeof record.subject === 'string' ? record.subject : '',
    description: typeof record.description === 'string' ? record.description : '',
    activeForm: typeof record.activeForm === 'string' ? record.activeForm : '',
    status: record.status as ClaudeTask['status'],
    blocks: Array.isArray(record.blocks) ? record.blocks.filter((b): b is string => typeof b === 'string') : [],
    blockedBy: Array.isArray(record.blockedBy) ? record.blockedBy.filter((b): b is string => typeof b === 'string') : []
  };
}
