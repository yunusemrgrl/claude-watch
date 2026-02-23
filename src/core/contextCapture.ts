import { execFileSync } from 'child_process';
import { existsSync, readFileSync, writeFileSync, mkdirSync, readdirSync, unlinkSync } from 'fs';
import { join } from 'path';
import type { ContextSnapshot } from './types.js';
import { parseQueue } from './queueParser.js';
import { parseLog } from './logParser.js';
import { computeSnapshot } from './stateEngine.js';

function safeExec(cmd: string, args: string[], cwd: string): string {
  try {
    return execFileSync(cmd, args, { cwd, encoding: 'utf-8', timeout: 5000 }).trim();
  } catch {
    return '';
  }
}

function captureGit(cwd: string): ContextSnapshot['git'] {
  const branch = safeExec('git', ['rev-parse', '--abbrev-ref', 'HEAD'], cwd) || 'unknown';
  const statusOut = safeExec('git', ['status', '--porcelain'], cwd);
  const dirty = statusOut.length > 0;
  const changedFiles = statusOut
    .split('\n')
    .filter(Boolean)
    .slice(0, 20)
    .map(l => l.slice(3).trim());
  const logOut = safeExec('git', ['log', '--oneline', '-5'], cwd);
  const recentCommits = logOut.split('\n').filter(Boolean);
  return { branch, dirty, changedFiles, recentCommits };
}

export async function captureContextSnapshot(
  opts: { focus?: string; cwd?: string; commit?: boolean } = {}
): Promise<ContextSnapshot> {
  const cwd = opts.cwd ?? process.cwd();
  const claudedashDir = join(cwd, '.claudedash');
  const queuePath = join(claudedashDir, 'queue.md');
  const logPath = join(claudedashDir, 'execution.log');

  const git = captureGit(cwd);
  const commitHash = opts.commit
    ? (safeExec('git', ['rev-parse', 'HEAD'], cwd) || undefined)
    : undefined;

  // Read raw log lines for chronological tail (parseLog deduplicates, we want order here)
  const lastEntries: ContextSnapshot['execution']['lastEntries'] = [];
  if (existsSync(logPath)) {
    const logLines = readFileSync(logPath, 'utf-8').trim().split('\n').filter(Boolean);
    for (const line of logLines.slice(-10)) {
      try {
        const e = JSON.parse(line) as { task_id?: string; status?: string; timestamp?: string; reason?: string };
        if (e.task_id && e.status && e.timestamp) {
          lastEntries.push({
            task_id: e.task_id,
            status: e.status,
            timestamp: e.timestamp,
            ...(e.reason ? { reason: e.reason } : {}),
          });
        }
      } catch { /* skip malformed */ }
    }
  }

  // Compute task state using existing parsers + stateEngine
  let taskSnapshot: ReturnType<typeof computeSnapshot> | null = null;
  if (existsSync(queuePath)) {
    const queueContent = readFileSync(queuePath, 'utf-8');
    const { tasks: parsedTasks } = parseQueue(queueContent);
    const events = existsSync(logPath)
      ? parseLog(readFileSync(logPath, 'utf-8')).events
      : [];
    taskSnapshot = computeSnapshot(parsedTasks, events);
  }

  const readyTasks = taskSnapshot?.tasks.filter(t => t.status === 'READY') ?? [];
  const doneTasks = taskSnapshot?.tasks.filter(t => t.status === 'DONE') ?? [];
  const failedTasks = taskSnapshot?.tasks.filter(t => t.status === 'FAILED') ?? [];
  const blockedTasks = taskSnapshot?.tasks.filter(t => t.status === 'BLOCKED') ?? [];
  const snap = taskSnapshot?.summary ?? { total: 0, done: 0, ready: 0, failed: 0, blocked: 0 };

  const inProgress = readyTasks.length > 0
    ? { id: readyTasks[0].id, description: readyTasks[0].description }
    : null;

  return {
    schemaVersion: 1,
    capturedAt: new Date().toISOString(),
    cwd,
    ...(opts.focus ? { focus: opts.focus } : {}),
    ...(commitHash ? { commitHash } : {}),
    git,
    tasks: {
      inProgress,
      ready: readyTasks.slice(0, 5).map(t => ({ id: t.id, description: t.description })),
      doneIds: doneTasks.slice(-10).map(t => t.id),
      failedIds: failedTasks.map(t => t.id),
      blockedIds: blockedTasks.map(t => t.id),
      summary: {
        total: snap.total,
        done: snap.done,
        ready: snap.ready,
        failed: snap.failed,
        blocked: snap.blocked,
      },
    },
    execution: { lastEntries },
  };
}

export function writeContextSnapshot(snapshot: ContextSnapshot, claudedashDir: string): void {
  if (!existsSync(claudedashDir)) {
    mkdirSync(claudedashDir, { recursive: true });
  }
  const snapshotsDir = join(claudedashDir, 'snapshots');
  if (!existsSync(snapshotsDir)) {
    mkdirSync(snapshotsDir, { recursive: true });
  }

  const json = JSON.stringify(snapshot, null, 2);
  writeFileSync(join(claudedashDir, 'context-snapshot.json'), json, 'utf-8');

  // Commit-hash named snapshot (primary for rollback)
  if (snapshot.commitHash) {
    writeFileSync(join(snapshotsDir, `${snapshot.commitHash}.json`), json, 'utf-8');
  } else {
    // Timestamped archive fallback
    const ts = snapshot.capturedAt.replace(/[:.]/g, '-').replace('T', '_').slice(0, 19);
    writeFileSync(join(snapshotsDir, `${ts}.json`), json, 'utf-8');
  }
}

export interface SnapshotEntry {
  filename: string;
  commitHash?: string;        // short hash for display
  capturedAt: string;
  branch: string;
  taskSummary: { total: number; done: number; ready: number };
  focus?: string;
}

export function listSnapshots(claudedashDir: string): SnapshotEntry[] {
  const snapshotsDir = join(claudedashDir, 'snapshots');
  if (!existsSync(snapshotsDir)) return [];

  const files = readdirSync(snapshotsDir)
    .filter(f => f.endsWith('.json'))
    .sort()
    .reverse(); // newest first

  const entries: SnapshotEntry[] = [];
  for (const file of files) {
    try {
      const raw = readFileSync(join(snapshotsDir, file), 'utf-8');
      const snap = JSON.parse(raw) as ContextSnapshot;
      entries.push({
        filename: file,
        commitHash: snap.commitHash ? snap.commitHash.slice(0, 8) : undefined,
        capturedAt: snap.capturedAt,
        branch: snap.git.branch,
        taskSummary: {
          total: snap.tasks.summary.total,
          done: snap.tasks.summary.done,
          ready: snap.tasks.summary.ready,
        },
        focus: snap.focus,
      });
    } catch { /* skip malformed */ }
  }
  return entries;
}

export function readSnapshotByHash(claudedashDir: string, hash: string): ContextSnapshot | null {
  const snapshotsDir = join(claudedashDir, 'snapshots');
  if (!existsSync(snapshotsDir)) return null;

  // Try exact match first (full or short hash)
  const files = existsSync(snapshotsDir) ? readdirSync(snapshotsDir) : [];
  const match = files.find(f => f.startsWith(hash) && f.endsWith('.json'));
  if (!match) return null;

  try {
    return JSON.parse(readFileSync(join(snapshotsDir, match), 'utf-8')) as ContextSnapshot;
  } catch {
    return null;
  }
}

export function deleteSnapshot(claudedashDir: string, hash: string): boolean {
  const snapshotsDir = join(claudedashDir, 'snapshots');
  if (!existsSync(snapshotsDir)) return false;
  const files = readdirSync(snapshotsDir);
  const match = files.find(f => f.startsWith(hash) && f.endsWith('.json'));
  if (!match) return false;
  try {
    unlinkSync(join(snapshotsDir, match));
    return true;
  } catch {
    return false;
  }
}

export function readContextSnapshot(claudedashDir: string): ContextSnapshot | null {
  const snapshotPath = join(claudedashDir, 'context-snapshot.json');
  if (!existsSync(snapshotPath)) return null;
  try {
    return JSON.parse(readFileSync(snapshotPath, 'utf-8')) as ContextSnapshot;
  } catch {
    return null;
  }
}

export function formatRecoveryOutput(snapshot: ContextSnapshot): string {
  const lines: string[] = [];
  const sep = '─'.repeat(50);

  lines.push('\n📋 Context Recovery');
  lines.push(sep);
  lines.push(`Snapshot taken : ${snapshot.capturedAt}`);
  lines.push(`Directory      : ${snapshot.cwd}`);
  if (snapshot.focus) {
    lines.push(`Focus          : ${snapshot.focus}`);
  }

  // Git state
  lines.push('\n📁 Git State');
  lines.push(`  Branch : ${snapshot.git.branch}${snapshot.git.dirty ? ' (dirty)' : ''}`);
  if (snapshot.git.changedFiles.length > 0) {
    lines.push(`  Changed files (${snapshot.git.changedFiles.length}):`);
    for (const f of snapshot.git.changedFiles.slice(0, 10)) {
      lines.push(`    ${f}`);
    }
  }
  if (snapshot.git.recentCommits.length > 0) {
    lines.push(`  Recent commits:`);
    for (const c of snapshot.git.recentCommits) {
      lines.push(`    ${c}`);
    }
  }

  // Task state
  const { tasks } = snapshot;
  lines.push('\n📊 Task State');
  lines.push(
    `  Total: ${tasks.summary.total}  Done: ${tasks.summary.done}  ` +
    `Ready: ${tasks.summary.ready}  Blocked: ${tasks.summary.blocked}  Failed: ${tasks.summary.failed}`
  );

  if (tasks.inProgress) {
    lines.push(`\n  ▶ Next task (first READY):`);
    lines.push(`    [${tasks.inProgress.id}] ${tasks.inProgress.description}`);
  }

  if (tasks.ready.length > 1) {
    lines.push(`\n  ➡ Also ready:`);
    for (const t of tasks.ready.slice(1)) {
      lines.push(`    [${t.id}] ${t.description}`);
    }
  }

  if (tasks.failedIds.length > 0) {
    lines.push(`\n  ❌ Failed: ${tasks.failedIds.join(', ')}`);
  }
  if (tasks.blockedIds.length > 0) {
    lines.push(`  🔒 Blocked: ${tasks.blockedIds.join(', ')}`);
  }
  if (tasks.doneIds.length > 0) {
    lines.push(`  ✓ Recently done: ${tasks.doneIds.slice(-5).join(', ')}`);
  }

  // Execution log tail
  if (snapshot.execution.lastEntries.length > 0) {
    lines.push('\n📜 Recent Execution Log');
    for (const e of snapshot.execution.lastEntries.slice(-5)) {
      const icon = e.status === 'DONE' ? '✓' : e.status === 'FAILED' ? '✗' : '⊘';
      const ts = e.timestamp.slice(0, 19).replace('T', ' ');
      const reason = e.reason ? ` — ${e.reason}` : '';
      lines.push(`  ${icon} [${e.task_id}] ${e.status} @ ${ts}${reason}`);
    }
  }

  lines.push('\n' + sep);
  return lines.join('\n');
}
