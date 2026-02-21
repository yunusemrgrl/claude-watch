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
  .version('1.1.5');

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

Record the result. **Preferred: HTTP** (when claudedash server is running). **Fallback: file** (append to execution.log directly).

### Option A — HTTP (preferred when server is running on port 4317)

\`\`\`bash
# Success
curl -sf -X POST http://localhost:4317/log \\
  -H 'Content-Type: application/json' \\
  -d '{"task_id":"S1-T1","status":"DONE","agent":"claude"}' || true

# Failure
curl -sf -X POST http://localhost:4317/log \\
  -H 'Content-Type: application/json' \\
  -d '{"task_id":"S1-T1","status":"FAILED","agent":"claude","reason":"tests failing"}' || true

# Blocked (triggers real-time browser notification)
curl -sf -X POST http://localhost:4317/log \\
  -H 'Content-Type: application/json' \\
  -d '{"task_id":"S1-T1","status":"BLOCKED","agent":"claude","reason":"missing API key"}' || true
\`\`\`

### Option B — File (fallback, append one JSON line)

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

## Phase 3b — CHECK QUEUE (optional, when server is running)

Get computed task statuses with dependency resolution:

\`\`\`bash
curl -sf http://localhost:4317/queue
# Returns: { tasks: [...], summary: { total, done, failed, blocked, ready } }
\`\`\`

Use this instead of manually parsing queue.md + execution.log.

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

Log format — prefer HTTP when server is running (port 4317):
\`\`\`bash
curl -sf -X POST http://localhost:4317/log \\
  -H 'Content-Type: application/json' \\
  -d '{"task_id":"S1-T1","status":"DONE","agent":"claude"}' || true
\`\`\`

Fallback (append one JSON line to \`.claudedash/execution.log\`):
\`\`\`json
{"task_id":"S1-T1","status":"DONE","timestamp":"2026-01-15T10:30:00Z","agent":"claude"}
\`\`\`

Status values: \`DONE\`, \`FAILED\`, \`BLOCKED\` (requires \`reason\` field).
See \`.claudedash/workflow.md\` for full execution protocol.

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
        planDir: hasPlan ? claudeWatchDir : undefined,
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

// ── hooks command ─────────────────────────────────────────────────────────────
program
  .command('hooks <action>')
  .description('Manage Claude Code hooks integration (actions: install, status, uninstall)')
  .option('--port <port>', 'claudedash server port', '4317')
  .option('--all', 'Also install PreCompact + PostCompact hooks for context persistence')
  .action((action: string, opts: { port: string; all?: boolean }) => {
    const port = opts.port;
    const installAll = !!opts.all;
    const settingsPath = join(process.env.HOME ?? '~', '.claude', 'settings.json');

    if (action === 'status') {
      if (!existsSync(settingsPath)) {
        console.log('\x1b[33mNo ~/.claude/settings.json found.\x1b[0m');
        return;
      }
      const raw = readFileSync(settingsPath, 'utf8');
      const settings = JSON.parse(raw) as Record<string, unknown>;
      const hooks = (settings.hooks ?? {}) as Record<string, unknown[]>;
      const hasHook = (key: string) => (hooks[key] ?? []).some((h: unknown) =>
        typeof h === 'object' && (JSON.stringify(h).includes('claudedash') || JSON.stringify(h).includes(`${port}/hook`))
      );
      console.log(`\nclaudedash hooks status (port ${port}):\n`);
      console.log(`  PostToolUse:  ${hasHook('PostToolUse') ? '\x1b[32m✓ installed\x1b[0m' : '\x1b[31m✗ not installed\x1b[0m'}`);
      console.log(`  Stop:         ${hasHook('Stop') ? '\x1b[32m✓ installed\x1b[0m' : '\x1b[31m✗ not installed\x1b[0m'}`);
      console.log(`  PreCompact:   ${hasHook('PreCompact') ? '\x1b[32m✓ installed\x1b[0m' : '\x1b[33m- not installed\x1b[0m'}`);
      console.log(`  PostCompact:  ${hasHook('PostCompact') ? '\x1b[32m✓ installed\x1b[0m' : '\x1b[33m- not installed\x1b[0m'}`);
      if (!hasHook('PostToolUse') || !hasHook('Stop')) {
        console.log(`\nRun \x1b[36mnpx claudedash hooks install\x1b[0m to enable real-time tool event streaming.`);
      }
      if (!hasHook('PreCompact') || !hasHook('PostCompact')) {
        console.log(`Run \x1b[36mnpx claudedash hooks install --all\x1b[0m to also enable context compaction state.\n`);
      } else {
        console.log('');
      }
      return;
    }

    if (action === 'install') {
      let settings: Record<string, unknown> = {};
      if (existsSync(settingsPath)) {
        try { settings = JSON.parse(readFileSync(settingsPath, 'utf8')) as Record<string, unknown>; }
        catch { console.error('Failed to parse settings.json'); process.exit(1); }
      }

      const hookCmd = (event: string) =>
        `curl -sf -X POST http://localhost:${port}/hook -H 'Content-Type: application/json' -d '{"event":"${event}","tool":"$CLAUDE_TOOL_NAME","session":"$CLAUDE_SESSION_ID","cwd":"$CLAUDE_CWD"}' || true`;

      const hooks = (settings.hooks ?? {}) as Record<string, unknown[]>;

      const installHook = (key: string) => {
        const entry = { matcher: '', hooks: [{ type: 'command', command: hookCmd(key) }] };
        if (!Array.isArray(hooks[key])) hooks[key] = [];
        const already = (hooks[key] as unknown[]).some((h: unknown) => JSON.stringify(h).includes(`${port}/hook`));
        if (!already) (hooks[key] as unknown[]).push(entry);
      };

      installHook('PostToolUse');
      installHook('Stop');

      if (installAll) {
        installHook('PreCompact');
        installHook('PostCompact');
      }

      settings.hooks = hooks;
      writeFileSync(settingsPath, JSON.stringify(settings, null, 2), 'utf8');
      console.log(`\n\x1b[32m✓ claudedash hooks installed\x1b[0m in ~/.claude/settings.json`);
      console.log(`  PostToolUse → POST http://localhost:${port}/hook`);
      console.log(`  Stop        → POST http://localhost:${port}/hook`);
      if (installAll) {
        console.log(`  PreCompact  → POST http://localhost:${port}/hook`);
        console.log(`  PostCompact → POST http://localhost:${port}/hook`);
      }
      console.log(`\nStart claudedash and run a Claude Code session to see real-time tool events.\n`);
      return;
    }

    if (action === 'uninstall') {
      if (!existsSync(settingsPath)) { console.log('No settings.json found.'); return; }
      let settings: Record<string, unknown> = {};
      try { settings = JSON.parse(readFileSync(settingsPath, 'utf8')) as Record<string, unknown>; }
      catch { console.error('Failed to parse settings.json'); process.exit(1); }
      const hooks = (settings.hooks ?? {}) as Record<string, unknown[]>;
      const filterHook = (arr: unknown[]) => arr.filter((h: unknown) =>
        !(typeof h === 'object' && JSON.stringify(h).includes(`${port}/hook`))
      );
      if (Array.isArray(hooks.PostToolUse)) hooks.PostToolUse = filterHook(hooks.PostToolUse);
      if (Array.isArray(hooks.Stop)) hooks.Stop = filterHook(hooks.Stop);
      if (Array.isArray(hooks.PreCompact)) hooks.PreCompact = filterHook(hooks.PreCompact);
      if (Array.isArray(hooks.PostCompact)) hooks.PostCompact = filterHook(hooks.PostCompact);
      settings.hooks = hooks;
      writeFileSync(settingsPath, JSON.stringify(settings, null, 2), 'utf8');
      console.log(`\n\x1b[32m✓ claudedash hooks removed\x1b[0m from ~/.claude/settings.json\n`);
      return;
    }

    console.error(`Unknown action: ${action}. Use install, status, or uninstall.`);
    process.exit(1);
  });

// ── mcp command ────────────────────────────────────────────────────────────────
program
  .command('mcp')
  .description('Start claudedash as an MCP server (stdio transport). Add with: claude mcp add claudedash -- npx -y claudedash@latest mcp')
  .option('--port <port>', 'claudedash server port to proxy', '4317')
  .action((opts: { port: string }) => {
    const port = opts.port;
    const baseUrl = `http://localhost:${port}`;

    async function tryFetch<T>(path: string): Promise<T | null> {
      try {
        const res = await fetch(`${baseUrl}${path}`, { signal: AbortSignal.timeout(2000) });
        return res.ok ? (res.json() as Promise<T>) : null;
      } catch { return null; }
    }

    const TOOLS = [
      {
        name: 'get_queue',
        description: 'Get the current task queue snapshot with computed statuses (READY/DONE/FAILED/BLOCKED) and dependency resolution.',
        inputSchema: { type: 'object', properties: {}, required: [] },
      },
      {
        name: 'get_sessions',
        description: 'Get currently active Claude Code sessions with their task lists and context health.',
        inputSchema: { type: 'object', properties: {}, required: [] },
      },
      {
        name: 'get_billing_block',
        description: 'Get the current 5-hour billing block status, tokens used, estimated cost, and today\'s total cost.',
        inputSchema: { type: 'object', properties: {}, required: [] },
      },
      {
        name: 'get_cost',
        description: 'Get estimated token cost breakdown by model (from stats-cache). Shows total and per-model costs.',
        inputSchema: { type: 'object', properties: {}, required: [] },
      },
      {
        name: 'get_history',
        description: 'Get recent prompt history across all projects (last 20 prompts with project and timestamp).',
        inputSchema: {
          type: 'object',
          properties: { limit: { type: 'number', description: 'Number of prompts to return (default 20, max 50)' } },
          required: [],
        },
      },
      {
        name: 'get_hook_events',
        description: 'Get recent Claude Code hook events (PostToolUse, Stop) streamed via the hook architecture.',
        inputSchema: {
          type: 'object',
          properties: { limit: { type: 'number', description: 'Number of events to return (default 20)' } },
          required: [],
        },
      },
      {
        name: 'get_agents',
        description: 'Get the list of registered agents with their status, current task, and whether they are stale (>60s since last heartbeat).',
        inputSchema: { type: 'object', properties: {}, required: [] },
      },
      {
        name: 'get_current_session',
        description: 'Get the current Claude Code session. Uses $CLAUDE_SESSION_ID env var for exact match, falls back to the most recently updated session.',
        inputSchema: { type: 'object', properties: {}, required: [] },
      },
      {
        name: 'log_task',
        description: 'Log a task result to the execution log. Use this after completing, failing, or getting blocked on a task.',
        inputSchema: {
          type: 'object',
          properties: {
            task_id: { type: 'string', description: 'Task ID (e.g. S1-T1)' },
            status: { type: 'string', enum: ['DONE', 'FAILED', 'BLOCKED'], description: 'Task outcome' },
            reason: { type: 'string', description: 'Required for BLOCKED status. Explanation of what is blocking.' },
            agent: { type: 'string', description: 'Agent name (optional)' },
          },
          required: ['task_id', 'status'],
        },
      },
    ];

    async function callTool(name: string, args: Record<string, unknown>): Promise<string> {
      switch (name) {
        case 'get_queue': {
          const data = await tryFetch<unknown>('/queue');
          if (!data) return 'claudedash server not running. Start with: npx claudedash start';
          return JSON.stringify(data, null, 2);
        }
        case 'get_sessions': {
          const data = await tryFetch<unknown>('/sessions');
          if (!data) return 'claudedash server not running. Start with: npx claudedash start';
          return JSON.stringify(data, null, 2);
        }
        case 'get_billing_block': {
          const [block, cost] = await Promise.all([
            tryFetch<Record<string, unknown>>('/billing-block'),
            tryFetch<Record<string, unknown>>('/cost'),
          ]);
          if (!block) return 'claudedash server not running. Start with: npx claudedash start';
          // Enrich with lifetime cost (note: this is cumulative, not just today)
          const enriched = { ...block, lifetimeCostUSD: (cost as { totalCostUSD?: number } | null)?.totalCostUSD ?? null };
          return JSON.stringify(enriched, null, 2);
        }
        case 'get_cost': {
          const data = await tryFetch<unknown>('/cost');
          if (!data) return 'claudedash server not running. Start with: npx claudedash start';
          return JSON.stringify(data, null, 2);
        }
        case 'get_history': {
          const args2 = args as { limit?: number };
          const limit = Math.min(args2.limit ?? 20, 50);
          const data = await tryFetch<{ prompts?: unknown[] }>('/history');
          if (!data) return 'claudedash server not running. Start with: npx claudedash start';
          const prompts = (data.prompts ?? []).slice(0, limit);
          return JSON.stringify({ prompts, total: data.prompts?.length ?? 0 }, null, 2);
        }
        case 'get_hook_events': {
          const args3 = args as { limit?: number };
          const limit = Math.min(args3.limit ?? 20, 100);
          const data = await tryFetch<{ events?: unknown[] }>('/hook/events');
          if (!data) return 'claudedash server not running. Start with: npx claudedash start';
          return JSON.stringify({ events: (data.events ?? []).slice(0, limit) }, null, 2);
        }
        case 'get_agents': {
          const data = await tryFetch<unknown>('/agents');
          if (!data) return 'claudedash server not running. Start with: npx claudedash start';
          return JSON.stringify(data, null, 2);
        }
        case 'get_current_session': {
          const sessionsData = await tryFetch<{ sessions?: Array<{ id: string; updatedAt?: string; [key: string]: unknown }> }>('/sessions');
          if (!sessionsData) return 'claudedash server not running. Start with: npx claudedash start';
          const sessions = sessionsData.sessions ?? [];
          if (sessions.length === 0) return JSON.stringify({ session: null, isCurrent: false, note: 'No active sessions found' });

          // Try exact match by $CLAUDE_SESSION_ID env var
          const envSessionId = process.env.CLAUDE_SESSION_ID;
          if (envSessionId) {
            const exact = sessions.find(s => s.id === envSessionId);
            if (exact) return JSON.stringify({ ...exact, isCurrent: true, matchMethod: 'env-exact' }, null, 2);
          }

          // Fall back to most recently updated session
          const sorted = [...sessions].sort((a, b) => {
            const ta = a.updatedAt ? new Date(a.updatedAt).getTime() : 0;
            const tb = b.updatedAt ? new Date(b.updatedAt).getTime() : 0;
            return tb - ta;
          });
          return JSON.stringify({ ...sorted[0], isCurrent: true, matchMethod: 'most-recent' }, null, 2);
        }
        case 'log_task': {
          const { task_id, status, reason, agent } = args as { task_id?: string; status?: string; reason?: string; agent?: string };
          if (!task_id || !status) return 'Error: task_id and status are required';
          if (status === 'BLOCKED' && !reason) return 'Error: reason is required for BLOCKED status';

          // Try HTTP first
          const serverData = await tryFetch<{ ok?: boolean }>('/health');
          if (serverData) {
            try {
              const res = await fetch(`${baseUrl}/log`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ task_id, status, reason, agent: agent ?? 'mcp' }),
                signal: AbortSignal.timeout(2000),
              });
              if (res.ok) return `Task ${task_id} logged as ${status} via HTTP`;
            } catch { /* fall through to file */ }
          }

          // Fallback: write to file
          const logPath = join(process.cwd(), '.claudedash', 'execution.log');
          if (!existsSync(join(process.cwd(), '.claudedash'))) {
            return 'Error: .claudedash/ not found. Run claudedash init first.';
          }
          const entry = JSON.stringify({ task_id, status, timestamp: new Date().toISOString(), agent: agent ?? 'mcp', ...(reason ? { reason } : {}) });
          const { appendFileSync } = await import('fs');
          appendFileSync(logPath, entry + '\n', 'utf8');
          return `Task ${task_id} logged as ${status} to execution.log`;
        }
        default:
          return `Unknown tool: ${name}`;
      }
    }

    type JsonRpcRequest = { jsonrpc: string; id: number | string | null; method: string; params?: Record<string, unknown> };
    type ToolCallParams = { name: string; arguments?: Record<string, unknown> };

    function respond(id: number | string | null, result: unknown) {
      process.stdout.write(JSON.stringify({ jsonrpc: '2.0', id, result }) + '\n');
    }
    function respondError(id: number | string | null, code: number, message: string) {
      process.stdout.write(JSON.stringify({ jsonrpc: '2.0', id, error: { code, message } }) + '\n');
    }

    // Track pending async tool calls so we don't exit before they complete
    let pendingCount = 0;
    let stdinEnded = false;

    // Read newline-delimited JSON-RPC from stdin
    let buf = '';
    process.stdin.setEncoding('utf8');
    process.stdin.on('data', (chunk: string) => {
      buf += chunk;
      const lines = buf.split('\n');
      buf = lines.pop() ?? '';
      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed) continue;
        let req: JsonRpcRequest;
        try { req = JSON.parse(trimmed) as JsonRpcRequest; }
        catch { respondError(null, -32700, 'Parse error'); continue; }

        if (req.method === 'initialize') {
          respond(req.id, {
            protocolVersion: '2024-11-05',
            capabilities: { tools: {} },
            serverInfo: { name: 'claudedash', version: program.version() },
          });
        } else if (req.method === 'notifications/initialized') {
          // no response needed
        } else if (req.method === 'tools/list') {
          respond(req.id, { tools: TOOLS });
        } else if (req.method === 'tools/call') {
          const params = (req.params ?? {}) as ToolCallParams;
          pendingCount++;
          void callTool(params.name ?? '', params.arguments ?? {}).then((text) => {
            respond(req.id, { content: [{ type: 'text', text }] });
          }).finally(() => {
            pendingCount--;
            if (stdinEnded && pendingCount === 0) process.exit(0);
          });
        } else {
          respondError(req.id, -32601, `Method not found: ${req.method}`);
        }
      }
    });

    process.stdin.on('end', () => {
      stdinEnded = true;
      if (pendingCount === 0) process.exit(0);
    });
    // Keep process alive
    process.stdin.resume();
  });

// ── status command ─────────────────────────────────────────────────────────────
program
  .command('status')
  .description('Show a one-line dashboard status summary (sessions, tasks, cost, billing block)')
  .option('--port <port>', 'claudedash server port', '4317')
  .option('--json', 'output machine-readable JSON')
  .action(async (opts: { port: string; json?: boolean }) => {
    const port = opts.port;
    const baseUrl = `http://localhost:${port}`;
    const claudeDir = join(process.env.HOME ?? '~', '.claude');

    interface SessionsData { sessions?: Array<{ tasks?: Array<{ status: string }> }> }
    interface BillingData { active?: boolean; minutesRemaining?: number; estimatedCostUSD?: number }
    interface QueueData { summary?: { blocked?: number; ready?: number } }

    async function tryFetch<T>(url: string): Promise<T | null> {
      try {
        const res = await fetch(url, { signal: AbortSignal.timeout(1500) });
        if (!res.ok) return null;
        return res.json() as Promise<T>;
      } catch { return null; }
    }

    // Try server first
    const health = await tryFetch<{ status: string }>(`${baseUrl}/health`);
    const serverOnline = health?.status === 'ok';

    let sessionCount = 0;
    let inProgressCount = 0;
    let blockedCount = 0;
    let estimatedCostUSD: number | null = null;
    let blockMinutesRemaining: number | null = null;

    if (serverOnline) {
      const [sessionsData, billingData, queueData] = await Promise.all([
        tryFetch<SessionsData>(`${baseUrl}/sessions`),
        tryFetch<BillingData>(`${baseUrl}/billing-block`),
        tryFetch<QueueData>(`${baseUrl}/queue`),
      ]);

      sessionCount = sessionsData?.sessions?.length ?? 0;
      inProgressCount = sessionsData?.sessions?.flatMap((s) => s.tasks ?? [])
        .filter((t) => t.status === 'in_progress').length ?? 0;
      blockedCount = queueData?.summary?.blocked ?? 0;
      if (billingData?.active) {
        blockMinutesRemaining = billingData.minutesRemaining ?? null;
        estimatedCostUSD = billingData.estimatedCostUSD ?? null;
      }
    } else {
      // Fallback: read directly from files
      const todosDir = join(claudeDir, 'todos');
      if (existsSync(todosDir)) {
        const files = readdirSync(todosDir).filter((f) => f.endsWith('.jsonl'));
        const fiveMinAgo = Date.now() - 5 * 60 * 1000;
        for (const file of files) {
          const path = join(todosDir, file);
          const mtime = statSync(path).mtimeMs;
          if (mtime < fiveMinAgo) continue;
          sessionCount++;
          try {
            const lines = readFileSync(path, 'utf8').trim().split('\n').filter(Boolean);
            const last = lines.length ? JSON.parse(lines[lines.length - 1]) : null;
            const tasks: Array<{ status: string }> = last?.tasks ?? [];
            inProgressCount += tasks.filter((t) => t.status === 'in_progress').length;
          } catch { /* skip */ }
        }
      }
      // Count BLOCKED from execution.log
      const logPath = join(process.cwd(), '.claudedash', 'execution.log');
      if (existsSync(logPath)) {
        const lines = readFileSync(logPath, 'utf8').trim().split('\n').filter(Boolean);
        const taskStatus = new Map<string, string>();
        for (const line of lines) {
          try {
            const e = JSON.parse(line) as { task_id?: string; status?: string };
            if (e.task_id && e.status) taskStatus.set(e.task_id, e.status);
          } catch { /* skip */ }
        }
        blockedCount = [...taskStatus.values()].filter((s) => s === 'BLOCKED').length;
      }
    }

    if (opts.json) {
      console.log(JSON.stringify({ serverOnline, sessionCount, inProgressCount, blockedCount, estimatedCostUSD, blockMinutesRemaining }));
      return;
    }

    // Build one-line output
    const dim = '\x1b[2m'; const reset = '\x1b[0m';
    const green = '\x1b[32m'; const yellow = '\x1b[33m'; const red = '\x1b[31m'; const cyan = '\x1b[36m';

    const dot = serverOnline ? `${green}●${reset}` : `${dim}○${reset}`;
    const parts: string[] = [];

    parts.push(`${sessionCount} session${sessionCount !== 1 ? 's' : ''}`);
    if (inProgressCount > 0) parts.push(`${cyan}${inProgressCount} active${reset}`);
    if (blockedCount > 0) parts.push(`${red}${blockedCount} BLOCKED${reset}`);
    if (estimatedCostUSD !== null) parts.push(`${yellow}$${estimatedCostUSD.toFixed(2)} today${reset}`);
    if (blockMinutesRemaining !== null) {
      const h = Math.floor(blockMinutesRemaining / 60);
      const m = blockMinutesRemaining % 60;
      parts.push(`${dim}block ${h > 0 ? `${h}h` : ''}${m}m left${reset}`);
    }
    if (!serverOnline) parts.push(`${dim}server offline — run 'claudedash start'${reset}`);

    console.log(`${dot} ${parts.join(` ${dim}·${reset} `)}`);
  });

program.parse();
