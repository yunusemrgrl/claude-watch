#!/usr/bin/env node

import { Command } from 'commander';
import { mkdirSync, writeFileSync, existsSync, readdirSync, readFileSync, statSync, watch } from 'fs';
import { join } from 'path';
import { execFile } from 'child_process';
import { startServer } from './server/server.js';

const program = new Command();

program
  .name('claudedash')
  .description('Live Kanban, quality gates and context health monitoring for Claude Code agents')
  .version('0.6.0');

program
  .command('init')
  .description('Initialize claudedash in current directory')
  .action(() => {
    const claudeWatchDir = join(process.cwd(), '.claudedash');

    // Create .claudedash/ directory
    if (existsSync(claudeWatchDir)) {
      console.log('⚠️  .claudedash/ already exists');
      process.exit(1);
    }

    try {
      mkdirSync(claudeWatchDir);
      console.log('✓ Created .claudedash/');

      // Create queue.md with realistic example
      const queueTemplate = `# Slice S1

## S1-T1
Area: Setup
Depends: -
Description: Initialize project structure and install dependencies
AC: Project builds and all linters pass

## S1-T2
Area: Core
Depends: S1-T1
Description: Implement core feature
AC: Feature works end-to-end with happy path

## S1-T3
Area: Test
Depends: S1-T1, S1-T2
Description: Add integration tests for core feature
AC: All tests pass, edge cases covered
`;
      writeFileSync(join(claudeWatchDir, 'queue.md'), queueTemplate);
      console.log('✓ Created queue.md');

      // Create empty execution.log
      writeFileSync(join(claudeWatchDir, 'execution.log'), '');
      console.log('✓ Created execution.log');

      // Create config.json
      const config = {
        queueFile: 'queue.md',
        logFile: 'execution.log',
        port: 4317,
        taskModel: {
          fields: [
            { name: 'Area', type: 'enum', required: true, values: ['Setup', 'Core', 'Test'] },
            { name: 'Depends', type: 'refs', required: false },
            { name: 'Description', type: 'text', required: true },
            { name: 'AC', type: 'text', required: true }
          ],
          id: '{slice}-T{n}',
          headings: {
            slice: '# Slice {name}',
            task: '## {id}'
          }
        }
      };
      writeFileSync(join(claudeWatchDir, 'config.json'), JSON.stringify(config, null, 2));
      console.log('✓ Created config.json');

      // Create workflow.md — autonomous execution protocol
      const workflowTemplate = `# Agent Workflow

Autonomous execution protocol for claudedash Plan mode.
Each task from \`queue.md\` is processed through these phases.

---

## Phase 1 — INTAKE

Read the next READY task from \`.claudedash/queue.md\`.

1. Parse the task: ID, Area, Description, AC, Dependencies.
2. Verify all dependencies have status DONE in \`execution.log\`.
3. If dependencies are not met, log BLOCKED and move to next task.

---

## Phase 2 — EXECUTE

Implement the task.

1. Read the task description and acceptance criteria.
2. Identify affected files using the codebase.
3. Implement the change. Follow existing conventions.
4. Run relevant tests/linters to verify.

---

## Phase 3 — LOG

Append result to \`.claudedash/execution.log\` (one JSON line):

Success:
\`\`\`json
{"task_id":"S1-T1","status":"DONE","timestamp":"2026-01-15T10:30:00Z","agent":"claude"}
\`\`\`

Failure:
\`\`\`json
{"task_id":"S1-T1","status":"FAILED","timestamp":"2026-01-15T10:30:00Z","agent":"claude","meta":{"reason":"tests failing"}}
\`\`\`

Blocked:
\`\`\`json
{"task_id":"S1-T1","status":"BLOCKED","reason":"missing API key","timestamp":"2026-01-15T10:30:00Z","agent":"claude"}
\`\`\`

---

## Phase 4 — NEXT

Pick the next READY task and return to Phase 1.
If no READY tasks remain, stop and report summary.

---

## Rules

1. One task at a time. Finish before starting next.
2. Always log to execution.log — never skip Phase 3.
3. If stuck after 2 attempts, log FAILED and move on.
4. Do not modify queue.md — it is read-only for the agent.
5. Use \`new Date().toISOString()\` for timestamps.
`;
      writeFileSync(join(claudeWatchDir, 'workflow.md'), workflowTemplate);
      console.log('✓ Created workflow.md');

      // Create CLAUDE.md snippet file
      const claudeMdContent = `# claudedash Integration

## Task Tracking (MANDATORY)

You MUST use the TodoWrite tool to track your work. This is not optional.
The user monitors your progress via a live dashboard that reads TodoWrite output.

Rules:
- At the START of any multi-step task, create a todo list with all steps.
- Mark each task as \`in_progress\` BEFORE you start working on it.
- Mark each task as \`completed\` IMMEDIATELY after finishing it.
- Keep exactly ONE task as \`in_progress\` at any time.
- Update the todo list as you discover new subtasks.

If you skip TodoWrite, the user cannot see what you are doing.

## Plan Mode (if .claudedash/queue.md exists)

Follow \`.claudedash/workflow.md\` for structured task execution.
Tasks are defined in \`.claudedash/queue.md\`.
Log progress to \`.claudedash/execution.log\`.

Log format (append one JSON line per task):
\`\`\`json
{"task_id":"S1-T1","status":"DONE","timestamp":"2026-01-15T10:30:00Z","agent":"claude"}
\`\`\`

Status values: \`DONE\`, \`FAILED\`, \`BLOCKED\` (requires \`reason\` field)

## Dashboard

Run \`npx -y claudedash@latest start\` to view progress.
`;
      writeFileSync(join(claudeWatchDir, 'CLAUDE.md'), claudeMdContent);
      console.log('✓ Created CLAUDE.md');

      // Create hooks/ directory with lifecycle templates
      mkdirSync(join(claudeWatchDir, 'hooks'), { recursive: true });

      const preCompactHook = `# Pre-Compact Hook

Run this before Claude Code compacts the conversation.
Add to your project's CLAUDE.md or register as a PreCompact hook.

## Purpose
Save the current plan state so it can be restored after compaction.

## Instructions for the agent

Before context compaction, write a brief state snapshot:
1. Current task ID from .claudedash/queue.md (the one in_progress)
2. How many tasks are DONE (count lines in execution.log)
3. Any important decisions or blockers from the last few messages

Write the snapshot to .claudedash/compact-state.md:
\`\`\`
# Compact State
Task: S1-T3
Completed: 2 (S1-T1, S1-T2)
Status: In progress — editing src/server/server.ts, adding CORS restriction
Blocker: none
\`\`\`
`;

      const postCompactHook = `# Post-Compact Hook

Run this after Claude Code compacts the conversation.
Add to your project's CLAUDE.md or register as a PostCompact hook.

## Purpose
Re-inject plan context after compaction so the agent resumes correctly.

## Instructions for the agent

After context compaction, immediately:
1. Read .claudedash/compact-state.md (if it exists)
2. Read .claudedash/execution.log to verify completed tasks
3. Read .claudedash/queue.md to find the current task
4. Resume from exactly where the snapshot says

Then delete .claudedash/compact-state.md to avoid stale state.
`;

      const stopHook = `# Stop Hook

Prevents the agent from stopping mid-task.
Register as a Stop hook in Claude Code settings.

## Purpose
If there are pending tasks in the queue, remind the agent to continue.

## Logic (loop_limit: 3)

\`\`\`json
{
  "hook": "Stop",
  "loop_limit": 3,
  "condition": "pending tasks remain in .claudedash/queue.md not in execution.log",
  "followup_message": "There are still pending tasks in .claudedash/queue.md. Check .claudedash/workflow.md and continue with the next READY task. Do not stop until all tasks are DONE or BLOCKED."
}
\`\`\`

## How to Install

Add to your Claude Code hooks configuration:
1. Open Claude Code settings
2. Navigate to Hooks → Stop
3. Paste the JSON block above
4. Set loop_limit to 3 to prevent infinite loops
`;

      const postToolUseHook = `# PostToolUse Hook — Quality Gate

Runs automatically after Bash, Edit, or Write tool calls.
Register in Claude Code settings under Hooks → PostToolUse.

## Purpose
Run lint and typecheck after every code change and record results
in execution.log so the Quality Gates dashboard panel can display them.

## Hook Configuration

\`\`\`json
{
  "hook": "PostToolUse",
  "matcher": { "tool_name": ["Bash", "Edit", "Write"] },
  "command": "npm run lint --silent 2>/dev/null && npx tsc --noEmit 2>/dev/null",
  "on_success": {
    "append_to": ".claudedash/execution.log",
    "line": {"task_id":"{{task_id}}","status":"QUALITY","timestamp":"{{iso}}","agent":"claude","meta":{"quality":{"lint":true,"typecheck":true}}}
  },
  "on_failure": {
    "append_to": ".claudedash/execution.log",
    "line": {"task_id":"{{task_id}}","status":"QUALITY","timestamp":"{{iso}}","agent":"claude","meta":{"quality":{"lint":false,"typecheck":false}}}
  }
}
\`\`\`

## Manual Usage

After any code change, run:
\`\`\`bash
npm run lint && npx tsc --noEmit
\`\`\`
Then append to execution.log:
\`\`\`json
{"task_id":"S1-T1","status":"QUALITY","timestamp":"2026-01-15T10:30:00Z","agent":"claude","meta":{"quality":{"lint":true,"typecheck":true}}}
\`\`\`
`;

      const tddHook = `# TDD Enforcement Hook

Warns when a new source file is created without a corresponding test file.

## Naming Conventions Checked

| Source file          | Expected test file                  |
|----------------------|-------------------------------------|
| src/foo.ts           | tests/foo.test.ts or foo.spec.ts    |
| src/core/bar.ts      | tests/core/bar.test.ts              |
| lib/baz.py           | test_baz.py or baz_test.py          |
| pkg/qux.go           | qux_test.go                         |

## Skip List (configure in .claudedash/config.json)

\`\`\`json
{
  "tddHook": {
    "skipPatterns": ["src/cli.ts", "src/server/server.ts", "**/*.d.ts"]
  }
}
\`\`\`

## Hook Configuration

\`\`\`json
{
  "hook": "PostToolUse",
  "matcher": { "tool_name": ["Write"], "file_pattern": "src/**/*.ts" },
  "script": ".claudedash/hooks/tdd-check.sh"
}
\`\`\`

## Behavior

- If a matching test file exists → silent pass
- If no test file found → prints a warning (does NOT block)
- Agent should create the test file before marking the task DONE
`;

      writeFileSync(join(claudeWatchDir, 'hooks', 'pre-compact.md'), preCompactHook);
      writeFileSync(join(claudeWatchDir, 'hooks', 'post-compact.md'), postCompactHook);
      writeFileSync(join(claudeWatchDir, 'hooks', 'stop.md'), stopHook);
      writeFileSync(join(claudeWatchDir, 'hooks', 'post-tool-use.md'), postToolUseHook);
      writeFileSync(join(claudeWatchDir, 'hooks', 'tdd-enforcement.md'), tddHook);
      console.log('✓ Created hooks/ (pre-compact, post-compact, stop, post-tool-use, tdd-enforcement)');

      // Auto-inject TodoWrite directive into project CLAUDE.md
      const projectClaudeMdPath = join(process.cwd(), 'CLAUDE.md');
      const todoWriteMarker = 'TodoWrite tool to track your work';
      const todoWriteDirective = `\n## Task Tracking (MANDATORY)\n\nYou MUST use the TodoWrite tool to track your work. This is not optional.\nThe user monitors your progress via a live dashboard that reads TodoWrite output.\n\nRules:\n- At the START of any multi-step task, create a todo list with all steps.\n- Mark each task as \`in_progress\` BEFORE you start working on it.\n- Mark each task as \`completed\` IMMEDIATELY after finishing it.\n- Keep exactly ONE task as \`in_progress\` at any time.\n- Update the todo list as you discover new subtasks.\n\nIf you skip TodoWrite, the user cannot see what you are doing.\n`;

      if (existsSync(projectClaudeMdPath)) {
        const existing = readFileSync(projectClaudeMdPath, 'utf-8');
        if (!existing.includes(todoWriteMarker)) {
          writeFileSync(projectClaudeMdPath, existing + todoWriteDirective, 'utf-8');
          console.log('✓ Added TodoWrite directive to CLAUDE.md');
        } else {
          console.log('✓ CLAUDE.md already has TodoWrite directive');
        }
      } else {
        writeFileSync(projectClaudeMdPath, `# CLAUDE.md${todoWriteDirective}`, 'utf-8');
        console.log('✓ Created CLAUDE.md with TodoWrite directive');
      }

      console.log('\n✓ Ready! Next steps:');
      console.log('  1. Edit .claudedash/queue.md with your tasks');
      console.log('  3. Tell your agent: "follow .claudedash/workflow.md, start with S1-T1"');
      console.log('  4. Run: npx -y claudedash@latest start');
    } catch (error) {
      console.error('❌ Failed to initialize:', error);
      process.exit(1);
    }
  });

program
  .command('start')
  .description('Start the claudedash server and dashboard')
  .option('--claude-dir <path>', 'Path to Claude directory', join(process.env.HOME || '~', '.claude'))
  .option('-p, --port <number>', 'Port number', '4317')
  .option('--host <host>', 'Bind host', '127.0.0.1')
  .option('--no-bell', 'Disable terminal bell on task alerts')
  .option('--token <secret>', 'Require Bearer token for all API requests (reads CLAUDEDASH_TOKEN env var if not provided)')
  .action(async (opts) => {
    const claudeDir = opts.claudeDir;
    const claudeWatchDir = join(process.cwd(), '.claudedash');

    // Detect available modes
    const hasLive = existsSync(join(claudeDir, 'tasks'));
    const hasPlan = existsSync(claudeWatchDir);

    if (!hasLive && !hasPlan) {
      console.error('❌ No data sources found.');
      console.error(`   Live mode: ${claudeDir}/tasks/ not found`);
      console.error('   Plan mode: .claudedash/ not found (run "claudedash init")');
      process.exit(1);
    }

    // Read port from config if plan mode available, otherwise use CLI option
    let port = parseInt(opts.port, 10);
    if (hasPlan) {
      const configPath = join(claudeWatchDir, 'config.json');
      if (existsSync(configPath)) {
        try {
          const configContent = await import('fs').then(fs =>
            fs.promises.readFile(configPath, 'utf-8')
          );
          const config = JSON.parse(configContent);
          if (config.port && opts.port === '4317') {
            port = config.port;
          }
        } catch { /* use default port */ }
      }
    }

    const host = opts.host as string;
    const isLocalhost = host === '127.0.0.1' || host === 'localhost' || host === '::1';
    const url = `http://${isLocalhost ? 'localhost' : host}:${port}`;

    if (!isLocalhost) {
      console.log(`⚠️  Server exposed to network on ${host}:${port}`);
    }

    const token = (opts.token as string | undefined) ?? process.env.CLAUDEDASH_TOKEN;
    if (token) console.log('🔒 Token authentication enabled');

    try {
      await startServer({
        claudeDir,
        port,
        host,
        agentScopeDir: hasPlan ? claudeWatchDir : undefined,
        token,
      });

      console.log(`✓ Server running on ${url}`);
      if (hasLive) console.log(`  Live mode: watching ${claudeDir}/tasks/`);
      if (hasPlan) console.log('  Plan mode: reading .claudedash/');
      console.log('✓ Opening browser...');

      const platform = process.platform;
      const openCommand = platform === 'darwin' ? 'open' :
                         platform === 'win32' ? 'start' :
                         'xdg-open';

      execFile(openCommand, [url], (error) => {
        if (error) {
          console.log('Could not auto-open browser. Please visit:', url);
        }
      });

      // Watch execution.log for FAILED/BLOCKED events and alert in terminal
      if (hasPlan) {
        const logPath = join(claudeWatchDir, 'execution.log');
        const useBell = opts.bell !== false;
        let lastSize = existsSync(logPath) ? statSync(logPath).size : 0;

        watch(logPath, () => {
          try {
            if (!existsSync(logPath)) return;
            const currentSize = statSync(logPath).size;
            if (currentSize <= lastSize) return;
            const content = readFileSync(logPath, 'utf-8');
            const newContent = content.slice(lastSize);
            lastSize = currentSize;
            for (const line of newContent.split('\n').filter(Boolean)) {
              try {
                const event = JSON.parse(line) as Record<string, unknown>;
                if (event.status === 'FAILED') {
                  if (useBell) process.stdout.write('\u0007');
                  console.error(`\x1b[31m⚠  TASK FAILED: ${event.task_id}\x1b[0m`);
                } else if (event.status === 'BLOCKED') {
                  if (useBell) process.stdout.write('\u0007');
                  const reason = event.reason ? ` — ${String(event.reason)}` : '';
                  console.warn(`\x1b[33m⚠  TASK BLOCKED: ${event.task_id}${reason}\x1b[0m`);
                }
              } catch { /* skip malformed lines */ }
            }
          } catch { /* skip watch errors */ }
        });
      }
    } catch (error) {
      console.error('❌ Failed to start server:', error);
      process.exit(1);
    }
  });

program
  .command('spec')
  .description('Initialize spec-mode templates (.claudedash/spec/)')
  .action(() => {
    const specDir = join(process.cwd(), '.claudedash', 'spec');
    if (!existsSync(join(process.cwd(), '.claudedash'))) {
      console.error('❌ Run "claudedash init" first.');
      process.exit(1);
    }
    if (existsSync(specDir)) {
      console.log('⚠️  .claudedash/spec/ already exists');
      process.exit(1);
    }
    try {
      mkdirSync(specDir, { recursive: true });

      writeFileSync(join(specDir, 'plan.md'), `# Spec: Plan Phase

## Goal
[One-sentence feature description]

## Exploration Checklist
- [ ] Read existing code affected by this change
- [ ] Identify integration points and edge cases
- [ ] Propose approach (max 3 options, choose one)
- [ ] Get user approval before moving to implement phase

## Decision
Chosen approach: [write here]
Approved: yes / no
`);

      writeFileSync(join(specDir, 'implement.md'), `# Spec: Implement Phase

## Acceptance Criteria
[Copy from queue.md task AC]

## TDD Checklist
- [ ] Write failing test first
- [ ] Implement minimum code to pass
- [ ] Refactor if needed (tests still green)
- [ ] Run npm test — all pass

## Files Changed
[List here]
`);

      writeFileSync(join(specDir, 'verify.md'), `# Spec: Verify Phase

## Review Checklist
- [ ] All AC items satisfied
- [ ] No regressions (full test suite passes)
- [ ] Lint clean
- [ ] Edge cases handled
- [ ] Peer/self review complete

## Result
Status: DONE / FAILED
Notes: [write here]
`);

      console.log('✓ Created .claudedash/spec/ (plan.md, implement.md, verify.md)');
      console.log('\nUsage:');
      console.log('  1. Fill in spec/plan.md and get approval');
      console.log('  2. Follow spec/implement.md (TDD)');
      console.log('  3. Complete spec/verify.md checklist');
      console.log('  4. Log result to .claudedash/execution.log');
    } catch (error) {
      console.error('❌ Failed to create spec templates:', error);
      process.exit(1);
    }
  });

program
  .command('worktree')
  .description('Manage isolated worktrees for parallel agent runs')
  .argument('<action>', 'Action: create')
  .argument('[branch]', 'Branch name for create action')
  .action((action: string, branch: string | undefined) => {
    if (action !== 'create') {
      console.error(`❌ Unknown action: ${action}. Supported: create`);
      process.exit(1);
    }
    if (!branch) {
      console.error('❌ Branch name required: claudedash worktree create <branch>');
      process.exit(1);
    }
    const worktreePath = join(process.cwd(), '..', branch.replace(/\//g, '-'));
    execFile('git', ['worktree', 'add', '-b', branch, worktreePath], (err, _stdout, stderr) => {
      if (err) {
        console.error('❌ Failed to create worktree:', stderr || err.message);
        process.exit(1);
      }
      console.log(`✓ Worktree created at: ${worktreePath}`);
      console.log(`  Branch: ${branch}`);
      console.log(`\nNext steps:`);
      console.log(`  cd ${worktreePath}`);
      console.log(`  claudedash init`);
      console.log(`  claudedash start`);
      console.log(`\nThe dashboard Worktrees tab will show sessions for this branch.`);
    });
  });

program
  .command('recover')
  .description('Summarize the last Claude Code session after /clear')
  .option('--claude-dir <path>', 'Path to Claude directory', join(process.env.HOME || '~', '.claude'))
  .action((opts) => {
    const claudeDir = opts.claudeDir;
    const projectsDir = join(claudeDir, 'projects');

    if (!existsSync(projectsDir)) {
      console.error('❌ No projects directory found at', projectsDir);
      process.exit(1);
    }

    // Map cwd to Claude project dir name (slashes → hyphens, no leading -)
    // Walk up from cwd to find a matching project directory
    let projectDir = '';
    let searchPath = process.cwd();
    while (searchPath !== '/') {
      const candidate = join(projectsDir, searchPath.replace(/\//g, '-'));
      if (existsSync(candidate)) {
        projectDir = candidate;
        break;
      }
      searchPath = join(searchPath, '..');
    }

    if (!projectDir) {
      console.error(`❌ No session history found for this directory or any parent.`);
      process.exit(1);
    }

    // Find most recently modified JSONL file
    const jsonlFiles = readdirSync(projectDir)
      .filter(f => f.endsWith('.jsonl'))
      .map(f => ({ name: f, mtime: statSync(join(projectDir, f)).mtime.getTime() }))
      .sort((a, b) => b.mtime - a.mtime);

    if (jsonlFiles.length === 0) {
      console.error('❌ No session files found.');
      process.exit(1);
    }

    const latestFile = join(projectDir, jsonlFiles[0].name);
    const lines = readFileSync(latestFile, 'utf-8').trim().split('\n').filter(Boolean);

    // Extract key info from JSONL
    let lastUserMsg = '';
    let lastAssistantText = '';
    let sessionId = '';
    let sessionStart = '';

    for (const line of lines) {
      try {
        const entry = JSON.parse(line) as Record<string, unknown>;
        if (entry.sessionId && !sessionId) {
          sessionId = String(entry.sessionId);
        }
        if (!sessionStart && entry.type === 'user') {
          const msg = entry.message as Record<string, unknown> | undefined;
          if (msg?.role === 'user') {
            const ts = entry.timestamp ?? (entry as Record<string, unknown>).ts;
            if (ts) sessionStart = String(ts);
          }
        }
        if (entry.type === 'user') {
          const msg = entry.message as Record<string, unknown> | undefined;
          const content = msg?.content;
          if (typeof content === 'string') lastUserMsg = content.slice(0, 200);
        }
        if (entry.type === 'assistant') {
          const msg = entry.message as Record<string, unknown> | undefined;
          const content = msg?.content;
          if (Array.isArray(content)) {
            for (const block of content) {
              const b = block as Record<string, unknown>;
              if (b.type === 'text' && typeof b.text === 'string') {
                lastAssistantText = b.text.slice(0, 400);
              }
            }
          }
        }
      } catch { /* skip malformed lines */ }
    }

    console.log('\n📋 Session Recovery Summary');
    console.log('─'.repeat(50));
    console.log(`Session file : ${jsonlFiles[0].name}`);
    console.log(`Total events : ${lines.length}`);
    if (sessionStart) console.log(`Started      : ${sessionStart}`);

    if (lastUserMsg) {
      console.log('\n💬 Last user message:');
      console.log(`   ${lastUserMsg.replace(/\n/g, '\n   ')}`);
    }

    if (lastAssistantText) {
      console.log('\n🤖 Last assistant response (excerpt):');
      console.log(`   ${lastAssistantText.replace(/\n/g, '\n   ')}`);
    }

    // Plan mode state
    const claudeWatchDir = join(process.cwd(), '.claudedash');
    const logPath = join(claudeWatchDir, 'execution.log');
    const queuePath = join(claudeWatchDir, 'queue.md');

    if (existsSync(logPath) && existsSync(queuePath)) {
      console.log('\n📊 Plan Mode State:');
      const logLines = readFileSync(logPath, 'utf-8').trim().split('\n').filter(Boolean);
      const doneTasks: string[] = [];
      let lastTask = '';
      for (const l of logLines) {
        try {
          const e = JSON.parse(l) as Record<string, unknown>;
          const tid = String(e.task_id ?? '');
          const status = String(e.status ?? '');
          if (status === 'DONE') doneTasks.push(tid);
          lastTask = tid;
        } catch { /* skip */ }
      }
      console.log(`   Completed tasks : ${doneTasks.length} (${doneTasks.join(', ') || 'none'})`);
      if (lastTask) console.log(`   Last task       : ${lastTask}`);

      // Find next READY task
      const queueContent = readFileSync(queuePath, 'utf-8');
      const taskIds = [...queueContent.matchAll(/^## (S\d+-T\d+)/gm)].map(m => m[1]);
      const doneSet = new Set(doneTasks);
      const nextTask = taskIds.find(id => !doneSet.has(id));
      if (nextTask) console.log(`   ➡  Next task    : ${nextTask}`);
    }

    console.log('\n─'.repeat(50));
    console.log('Run `claudedash start` to view the live dashboard.\n');
  });

program
  .command('doctor')
  .description('Check claudedash environment and configuration')
  .option('--claude-dir <path>', 'Path to Claude directory', join(process.env.HOME || '~', '.claude'))
  .action(async (opts) => {
    const claudeDir = opts.claudeDir;
    const claudeWatchDir = join(process.cwd(), '.claudedash');
    const checks: Array<{ label: string; ok: boolean; note?: string }> = [];

    // Node.js version
    const nodeVer = process.version;
    const major = parseInt(nodeVer.slice(1));
    checks.push({ label: `Node.js ${nodeVer}`, ok: major >= 18, note: major < 18 ? 'Requires Node.js 18+' : undefined });

    // git available
    try {
      const { execFileSync } = await import('child_process').then(m => m);
      execFileSync('git', ['--version'], { stdio: 'ignore' });
      checks.push({ label: 'git available', ok: true });
    } catch {
      checks.push({ label: 'git available', ok: false, note: 'git not found in PATH' });
    }

    // ~/.claude/ directory
    const claudeDirExists = existsSync(claudeDir);
    checks.push({ label: `~/.claude/ directory (${claudeDir})`, ok: claudeDirExists, note: claudeDirExists ? undefined : 'Not found — Claude Code may not be installed' });

    // ~/.claude/tasks/ (live mode)
    const tasksDir = join(claudeDir, 'tasks');
    checks.push({ label: '~/.claude/tasks/ (Live mode data)', ok: existsSync(tasksDir) });

    // .claudedash/ (plan mode)
    checks.push({ label: '.claudedash/ (Plan mode)', ok: existsSync(claudeWatchDir) });

    // CLAUDE.md in cwd
    const claudeMdPath = join(process.cwd(), 'CLAUDE.md');
    const claudeMdExists = existsSync(claudeMdPath);
    const hasTodoWrite = claudeMdExists && readFileSync(claudeMdPath, 'utf-8').includes('TodoWrite');
    checks.push({ label: 'CLAUDE.md with TodoWrite directive', ok: hasTodoWrite, note: !claudeMdExists ? 'Not found — run claudedash init' : !hasTodoWrite ? 'TodoWrite missing — run claudedash init' : undefined });

    // Port 4317 availability (simple check)
    checks.push({ label: 'Default port 4317', ok: true, note: 'Cannot test without binding' });

    // Print results
    console.log('\n🩺 claudedash doctor\n');
    for (const check of checks) {
      const icon = check.ok ? '\x1b[32m✓\x1b[0m' : '\x1b[31m✗\x1b[0m';
      const note = check.note ? ` \x1b[33m(${check.note})\x1b[0m` : '';
      console.log(`  ${icon}  ${check.label}${note}`);
    }
    const failed = checks.filter(c => !c.ok).length;
    console.log(`\n${failed === 0 ? '\x1b[32mAll checks passed.\x1b[0m' : `\x1b[31m${failed} check(s) failed.\x1b[0m`}\n`);
  });

program.parse();
