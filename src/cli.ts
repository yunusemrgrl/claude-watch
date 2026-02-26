#!/usr/bin/env node

import { Command } from 'commander';
import { mkdirSync, writeFileSync, existsSync, readdirSync, readFileSync, statSync, watch } from 'fs';
import { join } from 'path';
import { execFile, spawn } from 'child_process';
import { startServer } from './server/server.js';
import {
  captureContextSnapshot, writeContextSnapshot, readContextSnapshot,
  formatRecoveryOutput, listSnapshots, readSnapshotByHash, deleteSnapshot,
} from './core/contextCapture.js';
import { DEFAULT_SOURCE, getSourceLayout, hasLiveSourceData, parseSource } from './platform/source.js';

const program = new Command();

program
  .name('claudedash')
  .description('Local agent control plane with recovery, quality gates, and context safety for Claude Code')
  .version('1.1.29');

program
  .command('init')
  .description('Initialize claudedash in current directory')
  .option('--minimal', 'Create only empty queue.md and workflow.md (no opinionated templates)')
  .option('--template <name>', 'Template preset: minimal | default | team', 'default')
  .action((opts: { minimal?: boolean; template?: string }) => {
    // --minimal is shorthand for --template minimal
    const template = opts.minimal ? 'minimal' : (opts.template ?? 'default');
    const claudeWatchDir = join(process.cwd(), '.claudedash');

    // Create .claudedash/ directory
    if (existsSync(claudeWatchDir)) {
      console.log('⚠️  .claudedash/ already exists');
      process.exit(1);
    }

    try {
      mkdirSync(claudeWatchDir);
      console.log('✓ Created .claudedash/');

      // Create queue.md — content depends on template choice
      let queueContent = '';
      if (template === 'minimal') {
        // Empty queue for users who want a blank slate
        queueContent = '# Tasks\n';
      } else if (template === 'team') {
        queueContent = `# Slice S1 — Foundation\n\n## S1-T1\nArea: Setup\nPriority: critical\nDepends: -\nDescription: Initialize project structure, install dependencies, configure linting and CI.\nAC: Project builds, linters pass, CI pipeline green.\n\n## S1-T2\nArea: Backend\nPriority: high\nDepends: S1-T1\nDescription: Implement core feature with full error handling and logging.\nAC: Feature works end-to-end, happy path and error cases covered.\n\n## S1-T3\nArea: Test\nPriority: high\nDepends: S1-T1, S1-T2\nDescription: Add unit + integration tests. Minimum 80% branch coverage.\nAC: All tests pass. Coverage report shows ≥80%.\n\n## S1-T4\nArea: Review\nPriority: medium\nDepends: S1-T2, S1-T3\nDescription: Code review checkpoint. Check for security issues, performance, and accessibility.\nAC: Review complete. All critical findings addressed.\n`;
      } else {
        // default
        queueContent = `# Slice S1\n\n## S1-T1\nArea: Setup\nDepends: -\nDescription: Initialize project structure and install dependencies\nAC: Project builds and all linters pass\n\n## S1-T2\nArea: Core\nDepends: S1-T1\nDescription: Implement core feature\nAC: Feature works end-to-end with happy path\n\n## S1-T3\nArea: Test\nDepends: S1-T1, S1-T2\nDescription: Add integration tests for core feature\nAC: All tests pass, edge cases covered\n`;
      }
      writeFileSync(join(claudeWatchDir, 'queue.md'), queueContent);
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

## Phase 0 — BOOTSTRAP (run once at session start)

1. Read \`.claudedash/CLAUDE.md\` — mandatory project rules (TodoWrite, MCP tools, pre-commit checklist).
2. Read \`.claudedash/queue.md\` — full task list.
3. Read \`.claudedash/execution.log\` — understand what is already DONE/FAILED/BLOCKED.
4. Identify all READY tasks: dependencies satisfied, not yet in execution.log as DONE.

If claudedash MCP is configured (\`claude mcp list\` shows \`claudedash\`), use \`get_queue\` instead of reading files manually.

---

## Phase 1 — INTAKE

Read the next READY task from \`.claudedash/queue.md\`.

1. Parse the task: ID, Area, Description, AC, Dependencies.
2. Verify all dependencies have status DONE in \`execution.log\`.
3. If dependencies are not met, log BLOCKED and move to next task.

---

## Phase 2 — EXECUTE

Implement the task.

1. Read the task description and acceptance criteria carefully.
2. Identify affected files using the codebase.
3. Implement the change. Follow existing conventions.
4. Run relevant tests/linters to verify the AC is met.

---

## Phase 3 — VERIFY (mandatory before logging DONE)

Run the full pre-commit checklist. Never skip.

\`\`\`
npm run lint                              # 0 errors required
npx tsc --noEmit                          # server/CLI types
cd dashboard && npx tsc --noEmit && cd .. # dashboard types
npm run build                             # full build must succeed
\`\`\`

If any step fails: fix it, re-run, then proceed to Phase 4.

---

## Phase 4 — LOG

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

If claudedash MCP is configured, use \`log_task\` tool instead of writing the file directly.

---

## Phase 5 — NEXT

Pick the next READY task and return to Phase 1.
If no READY tasks remain, stop and report summary.

---

## Rules

1. One task at a time. Finish before starting next.
2. Always run Phase 3 (verify) before Phase 4 (log). Never log DONE without a passing build.
3. Always log to execution.log — never skip Phase 4.
4. If stuck after 2 attempts, log FAILED and move on.
5. Do not modify queue.md — it is read-only for the agent.
6. Use \`new Date().toISOString()\` for timestamps.
7. Use TodoWrite to track progress — the user monitors the live dashboard.
`;
      const finalWorkflow = template === 'minimal' ? '# Workflow\n\nAdd your agent execution protocol here.\n' : workflowTemplate;
      writeFileSync(join(claudeWatchDir, 'workflow.md'), finalWorkflow);
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
  .description('Start the claudedash control plane API (web UI is optional)')
  .option('--claude-dir <path>', 'Path to Claude directory', join(process.env.HOME || '~', '.claude'))
  .option('--source <name>', 'Data source provider (currently: claude-code)', DEFAULT_SOURCE)
  .option('-p, --port <number>', 'Port number', '4317')
  .option('--host <host>', 'Bind host', '127.0.0.1')
  .option('--open', 'Open the companion web UI in your browser')
  .option('--no-bell', 'Disable terminal bell on task alerts')
  .option('--token <secret>', 'Require Bearer token for all API requests (reads CLAUDEDASH_TOKEN env var if not provided)')
  .option('--auto-commit', 'Enable automatic git commit on PreCompact hook (opt-in; default: off)')
  .action(async (opts) => {
    const claudeDir = opts.claudeDir;
    const claudeWatchDir = join(process.cwd(), '.claudedash');
    const source = parseSource(opts.source as string | undefined);
    if (!source) {
      console.error(`❌ Unsupported --source: ${opts.source as string}`);
      console.error('   Supported values: claude-code');
      process.exit(1);
    }
    const sourceLayout = getSourceLayout(source, claudeDir);

    // Detect available modes
    const hasLive = hasLiveSourceData(source, claudeDir);
    const hasPlan = existsSync(claudeWatchDir);

    if (!hasLive && !hasPlan) {
      console.error('❌ No data sources found.');
      console.error(`   Live mode: ${sourceLayout.tasksDir} and ${sourceLayout.todosDir} not found`);
      console.error('   Plan mode: .claudedash/ not found (run "claudedash init")');
      process.exit(1);
    }

    // Read port and autoCommit from config if plan mode available, otherwise use CLI option
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
          // --auto-commit CLI flag overrides config; write back if flag was set
          if (opts.autoCommit && !config.autoCommit) {
            config.autoCommit = true;
            await import('fs').then(fs =>
              fs.promises.writeFile(configPath, JSON.stringify(config, null, 2), 'utf-8')
            );
          }
          if (config.autoCommit) {
            console.log('⚡ Auto-commit on PreCompact: enabled');
          }
        } catch { /* use default port */ }
      }
    }

    const host = opts.host as string;
    const isLocalhost = host === '127.0.0.1' || host === 'localhost' || host === '::1';
    const url = `http://${isLocalhost ? 'localhost' : host}:${port}`;

    const token = (opts.token as string | undefined) ?? process.env.CLAUDEDASH_TOKEN;

    if (!isLocalhost) {
      if (!token) {
        console.error('❌ Security: --token is required when --host is not localhost.');
        console.error('   Exposing claudedash without a token allows unauthenticated access to');
        console.error('   endpoints that can run git commands and read your session data.');
        console.error('');
        console.error('   Fix: claudedash start --host ' + host + ' --token <your-secret>');
        console.error('   Or:  CLAUDEDASH_TOKEN=<your-secret> claudedash start --host ' + host);
        process.exit(1);
      }
      console.log(`⚠️  Server exposed to network on ${host}:${port}`);
    }

    if (token) console.log('🔒 Token authentication enabled (Authorization: Bearer)');

    try {
      await startServer({
        claudeDir,
        port,
        host,
        planDir: hasPlan ? claudeWatchDir : undefined,
        token,
        source,
      });

      console.log(`✓ Server running on ${url}`);
      console.log(`  Source: ${source}`);
      if (hasLive) console.log(`  Live mode: watching ${sourceLayout.tasksDir} + ${sourceLayout.todosDir}`);
      if (hasPlan) console.log('  Plan mode: reading .claudedash/');
      if (opts.open) {
        console.log('✓ Opening web UI...');
        const platform = process.platform;
        const openCommand = platform === 'darwin' ? 'open' :
                           platform === 'win32' ? 'start' :
                           'xdg-open';
        execFile(openCommand, [url], (error) => {
          if (error) {
            console.log('Could not auto-open browser. Please visit:', url);
          }
        });
      } else {
        console.log(`✓ Control plane API ready. Run \`claudedash start --open\` to launch the web UI.`);
      }

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
  .command('snapshot')
  .description('Save current project state to .claudedash/context-snapshot.json')
  .option('--focus <message>', 'Brief description of what was being worked on')
  .option('--commit', 'Tag snapshot with the current git commit hash (auto-called by git post-commit hook)')
  .action(async (opts) => {
    try {
      const snapshot = await captureContextSnapshot({
        focus: opts.focus as string | undefined,
        commit: !!opts.commit,
      });
      const claudedashDir = join(process.cwd(), '.claudedash');
      writeContextSnapshot(snapshot, claudedashDir);

      const { tasks, git } = snapshot;
      console.log('\n✅ Context snapshot saved');
      console.log(`   Branch  : ${git.branch}${git.dirty ? ' (dirty)' : ''}`);
      console.log(`   Tasks   : ${tasks.summary.done}/${tasks.summary.total} done, ${tasks.summary.ready} ready`);
      if (snapshot.commitHash) {
        console.log(`   Commit  : ${snapshot.commitHash.slice(0, 8)}`);
      }
      if (tasks.inProgress) {
        console.log(`   Next    : [${tasks.inProgress.id}] ${tasks.inProgress.description}`);
      }
      if (opts.focus) {
        console.log(`   Focus   : ${opts.focus as string}`);
      }
      console.log(`\n   Saved to .claudedash/context-snapshot.json\n`);
    } catch (err) {
      console.error('❌ Snapshot failed:', (err as Error).message);
      process.exit(1);
    }
  });

program
  .command('snapshots [action] [hash]')
  .description('Manage context snapshots (actions: list, delete <hash>)')
  .action((action: string | undefined, hash: string | undefined) => {
    const claudedashDir = join(process.cwd(), '.claudedash');
    const act = action ?? 'list';

    if (act === 'list') {
      const entries = listSnapshots(claudedashDir);
      if (entries.length === 0) {
        console.log('\n  No snapshots found. Run `claudedash snapshot --commit` after a git commit.\n');
        return;
      }
      console.log('\n📸 Context Snapshots\n');
      for (const e of entries) {
        const hashLabel = e.commitHash ? `[${e.commitHash}]` : `[ts]`;
        const date = e.capturedAt.slice(0, 16).replace('T', ' ');
        const tasks = `${e.taskSummary.done}/${e.taskSummary.total} done`;
        const focus = e.focus ? ` — ${e.focus}` : '';
        console.log(`  ${hashLabel}  ${date}  ${e.branch}  ${tasks}${focus}`);
        if (e.commitHash) {
          console.log(`         ↳ recover: claudedash recover ${e.commitHash}`);
        }
      }
      console.log('');
      return;
    }

    if (act === 'delete') {
      if (!hash) { console.error('Usage: claudedash snapshots delete <hash>'); process.exit(1); }
      const ok = deleteSnapshot(claudedashDir, hash);
      if (ok) {
        console.log(`✓ Snapshot ${hash} deleted.`);
      } else {
        console.error(`❌ No snapshot found matching: ${hash}`);
        process.exit(1);
      }
      return;
    }

    console.error(`Unknown action: ${act}. Use list or delete.`);
    process.exit(1);
  });

program
  .command('recover [hash]')
  .description('Summarize the last Claude Code session after /clear. Pass a commit hash to recover a specific snapshot.')
  .option('--claude-dir <path>', 'Path to Claude directory', join(process.env.HOME || '~', '.claude'))
  .action((hash: string | undefined, opts) => {
    const claudedashDir = join(process.cwd(), '.claudedash');

    // If hash provided, load that specific snapshot
    if (hash) {
      const snap = readSnapshotByHash(claudedashDir, hash);
      if (!snap) {
        console.error(`❌ No snapshot found for: ${hash}`);
        console.error(`   Run \`claudedash snapshots list\` to see available snapshots.`);
        process.exit(1);
      }
      console.log(formatRecoveryOutput(snap));
      console.log(`\n💡 To roll back:\n   git reset --hard ${hash}\n   claudedash recover ${hash}\n`);
      return;
    }

    // Check for a saved context snapshot first
    const snapshot = readContextSnapshot(claudedashDir);
    if (snapshot) {
      console.log(formatRecoveryOutput(snapshot));
    }

    const claudeDir = opts.claudeDir;
    const projectsDir = join(claudeDir, 'projects');

    if (!existsSync(projectsDir)) {
      if (!snapshot) {
        console.error('❌ No projects directory found at', projectsDir);
        process.exit(1);
      }
      // Snapshot was shown, exit gracefully
      console.log('Run `claudedash start` to view the live dashboard.\n');
      return;
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

    console.log('─'.repeat(50));
    console.log('Run `claudedash start` to view the live dashboard.\n');
  });

program
  .command('upgrade')
  .description('Upgrade claudedash to the latest version')
  .action(() => {
    const pkgPath = new URL('../package.json', import.meta.url).pathname;
    const current = (JSON.parse(readFileSync(pkgPath, 'utf-8')) as { version: string }).version;
    console.log(`\nclaudedash v${current} → checking for updates...\n`);

    execFile('npm', ['show', 'claudedash', 'version'], (err, stdout) => {
      if (err) {
        console.error('❌ Could not fetch latest version from npm:', err.message);
        process.exit(1);
      }
      const latest = stdout.trim();
      if (latest === current) {
        console.log(`✓ Already on latest (v${current})\n`);
        return;
      }
      console.log(`  Latest : v${latest}`);
      console.log(`  Current: v${current}`);
      console.log(`  Installing...\n`);

      const runInstall = (useSudo: boolean) => {
        const args = useSudo
          ? ['npm', 'install', '-g', `claudedash@${latest}`]
          : ['install', '-g', `claudedash@${latest}`];
        const cmd = useSudo ? 'sudo' : 'npm';
        const child = spawn(cmd, args, { stdio: 'inherit' });
        child.on('close', (code) => {
          if (code === 0) {
            console.log(`\n✅ Upgraded to v${latest}\n`);
          } else if (!useSudo) {
            // Retry with sudo (permission denied)
            console.log('  Permission denied — retrying with sudo...\n');
            runInstall(true);
          } else {
            console.error('\n❌ Upgrade failed.');
            process.exit(1);
          }
        });
      };

      runInstall(false);
    });
  });

program
  .command('doctor')
  .description('Check claudedash environment and configuration')
  .option('--claude-dir <path>', 'Path to Claude directory', join(process.env.HOME || '~', '.claude'))
  .option('--source <name>', 'Data source provider (currently: claude-code)', DEFAULT_SOURCE)
  .action(async (opts) => {
    const claudeDir = opts.claudeDir;
    const source = parseSource(opts.source as string | undefined);
    if (!source) {
      console.error(`❌ Unsupported --source: ${opts.source as string}`);
      console.error('   Supported values: claude-code');
      process.exit(1);
    }
    const sourceLayout = getSourceLayout(source, claudeDir);
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

    // source live directories
    checks.push({
      label: `${sourceLayout.tasksDir} or ${sourceLayout.todosDir} (Live mode data)`,
      ok: existsSync(sourceLayout.tasksDir) || existsSync(sourceLayout.todosDir),
    });

    // .claudedash/ (plan mode)
    checks.push({ label: '.claudedash/ (Plan mode)', ok: existsSync(claudeWatchDir) });

    // CLAUDE.md in cwd
    const claudeMdPath = join(process.cwd(), 'CLAUDE.md');
    const claudeMdExists = existsSync(claudeMdPath);
    const hasTodoWrite = claudeMdExists && readFileSync(claudeMdPath, 'utf-8').includes('TodoWrite');
    checks.push({ label: 'CLAUDE.md with TodoWrite directive', ok: hasTodoWrite, note: !claudeMdExists ? 'Not found — run claudedash init' : !hasTodoWrite ? 'TodoWrite missing — run claudedash init' : undefined });

    // queue.md (if plan mode)
    if (existsSync(claudeWatchDir)) {
      const queuePath = join(claudeWatchDir, 'queue.md');
      const logPath = join(claudeWatchDir, 'execution.log');
      checks.push({ label: 'queue.md', ok: existsSync(queuePath), note: existsSync(queuePath) ? undefined : 'Not found — run claudedash init' });
      checks.push({ label: 'execution.log', ok: existsSync(logPath), note: existsSync(logPath) ? undefined : 'Not found — run claudedash init' });
    }

    // Hooks installed
    const settingsPath = join(claudeDir, 'settings.json');
    if (existsSync(settingsPath)) {
      try {
        const settingsRaw = readFileSync(settingsPath, 'utf8');
        const settings = JSON.parse(settingsRaw) as Record<string, unknown>;
        const hooks = (settings.hooks ?? {}) as Record<string, unknown[]>;
        const hasHook = (key: string) => (hooks[key] ?? []).some((h: unknown) =>
          typeof h === 'object' && (JSON.stringify(h).includes('claudedash') || JSON.stringify(h).includes('/hook'))
        );
        const postToolUse = hasHook('PostToolUse');
        const stopHook = hasHook('Stop');
        checks.push({ label: 'Hook: PostToolUse', ok: postToolUse, note: !postToolUse ? 'Run: claudedash hooks install' : undefined });
        checks.push({ label: 'Hook: Stop', ok: stopHook, note: !stopHook ? 'Run: claudedash hooks install' : undefined });
      } catch { /* skip */ }
    }

    // Server running on default port
    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 1000);
      const res = await fetch('http://localhost:4317/health', { signal: controller.signal });
      clearTimeout(timeout);
      const serverOk = res.ok;
      checks.push({ label: 'Server on port 4317', ok: serverOk, note: serverOk ? undefined : 'Not running — start with: claudedash start' });
    } catch {
      checks.push({ label: 'Server on port 4317', ok: false, note: 'Not running — start with: claudedash start' });
    }

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
  .option('--git', 'Also install git post-commit hook for auto-snapshot on every commit')
  .action((action: string, opts: { port: string; all?: boolean; git?: boolean }) => {
    const port = opts.port;
    const installAll = !!opts.all;
    const installGit = !!opts.git;
    const settingsPath = join(process.env.HOME ?? '~', '.claude', 'settings.json');
    const gitHookPath = join(process.cwd(), '.git', 'hooks', 'post-commit');
    const gitHookMarker = 'claudedash snapshot --commit';

    const hasGitHook = () => existsSync(gitHookPath) &&
      readFileSync(gitHookPath, 'utf-8').includes(gitHookMarker);

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
      console.log(`  PostToolUse:   ${hasHook('PostToolUse') ? '\x1b[32m✓ installed\x1b[0m' : '\x1b[31m✗ not installed\x1b[0m'}`);
      console.log(`  Stop:          ${hasHook('Stop') ? '\x1b[32m✓ installed\x1b[0m' : '\x1b[31m✗ not installed\x1b[0m'}`);
      console.log(`  PreCompact:    ${hasHook('PreCompact') ? '\x1b[32m✓ installed\x1b[0m' : '\x1b[33m- not installed\x1b[0m'}`);
      console.log(`  PostCompact:   ${hasHook('PostCompact') ? '\x1b[32m✓ installed\x1b[0m' : '\x1b[33m- not installed\x1b[0m'}`);
      console.log(`  git post-commit: ${hasGitHook() ? '\x1b[32m✓ installed\x1b[0m' : '\x1b[33m- not installed\x1b[0m'}`);
      if (!hasHook('PostToolUse') || !hasHook('Stop')) {
        console.log(`\nRun \x1b[36mnpx claudedash hooks install\x1b[0m to enable real-time tool event streaming.`);
      }
      if (!hasHook('PreCompact') || !hasHook('PostCompact')) {
        console.log(`Run \x1b[36mnpx claudedash hooks install --all\x1b[0m to also enable context compaction state.`);
      }
      if (!hasGitHook()) {
        console.log(`Run \x1b[36mnpx claudedash hooks install --git\x1b[0m to auto-snapshot on every git commit.\n`);
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

      // Claude Code passes hook event data via stdin as JSON (tool_name, session_id, etc.)
      // We forward stdin directly to the server; HookService normalises the field names.
      const hookCmd = (_event: string) =>
        `curl -sf -X POST http://localhost:${port}/hook -H 'Content-Type: application/json' -d @- || true`;

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

      // Install git post-commit hook
      if (installGit) {
        const gitHooksDir = join(process.cwd(), '.git', 'hooks');
        if (!existsSync(join(process.cwd(), '.git'))) {
          console.log(`\n\x1b[33m⚠ No .git directory found — skipping git post-commit hook.\x1b[0m`);
        } else {
          mkdirSync(gitHooksDir, { recursive: true });
          const hookContent = existsSync(gitHookPath)
            ? readFileSync(gitHookPath, 'utf-8')
            : '#!/bin/sh\n';
          if (!hookContent.includes(gitHookMarker)) {
            const newContent = hookContent.trimEnd() + `\n\n# claudedash: auto-snapshot on commit\nclaudedash snapshot --commit 2>/dev/null || true\n`;
            writeFileSync(gitHookPath, newContent, { mode: 0o755 });
            console.log(`  git post-commit → claudedash snapshot --commit`);
          } else {
            console.log(`  git post-commit → already installed`);
          }
        }
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

      // Remove git hook entry if present
      if (existsSync(gitHookPath)) {
        const content = readFileSync(gitHookPath, 'utf-8');
        if (content.includes(gitHookMarker)) {
          const cleaned = content
            .replace(/\n# claudedash: auto-snapshot on commit\nclaudedash snapshot --commit 2>\/dev\/null \|\| true\n/g, '\n')
            .trimEnd() + '\n';
          writeFileSync(gitHookPath, cleaned, { mode: 0o755 });
          console.log(`\n\x1b[32m✓ claudedash hooks removed\x1b[0m from ~/.claude/settings.json and .git/hooks/post-commit\n`);
          return;
        }
      }
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
  .option('--token <secret>', 'Bearer token for protected claudedash server (reads CLAUDEDASH_TOKEN env var if not provided)')
  .action((opts: { port: string; token?: string }) => {
    const port = opts.port;
    const baseUrl = `http://localhost:${port}`;
    const token = opts.token ?? process.env.CLAUDEDASH_TOKEN;

    const withAuth = (headers: Record<string, string> = {}): Record<string, string> =>
      token
        ? { ...headers, Authorization: `Bearer ${token}` }
        : headers;

    async function tryFetch<T>(path: string): Promise<T | null> {
      try {
        const res = await fetch(`${baseUrl}${path}`, {
          signal: AbortSignal.timeout(2000),
          headers: withAuth(),
        });
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
        description: 'Get recent prompt history across all projects. Supports pagination.',
        inputSchema: {
          type: 'object',
          properties: {
            limit: { type: 'number', description: 'Number of prompts to return (default 20, max 500)' },
            offset: { type: 'number', description: 'Skip first N prompts (for pagination, default 0)' },
          },
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
        name: 'get_session_context',
        description: 'Get a summary of a session\'s conversation: message count, last user prompt, last assistant response, tool usage counts.',
        inputSchema: {
          type: 'object',
          properties: { sessionId: { type: 'string', description: 'Session ID to retrieve context for' } },
          required: ['sessionId'],
        },
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
      {
        name: 'register_agent',
        description: 'Register this agent in the claudedash agent registry so it appears in the Agents view. Call at the start of a task.',
        inputSchema: {
          type: 'object',
          properties: {
            agentId: { type: 'string', description: 'Unique identifier for this agent instance' },
            name: { type: 'string', description: 'Human-readable agent name' },
            taskId: { type: 'string', description: 'Current task ID (e.g. S1-T1)' },
            sessionId: { type: 'string', description: 'Claude session ID (optional)' },
          },
          required: ['agentId'],
        },
      },
      {
        name: 'send_heartbeat',
        description: 'Send a heartbeat to keep this agent\'s registration alive in the dashboard (expires after 60s of silence).',
        inputSchema: {
          type: 'object',
          properties: {
            agentId: { type: 'string', description: 'Agent ID used during register_agent' },
            status: { type: 'string', description: 'Current status (e.g. "working", "idle")' },
            taskId: { type: 'string', description: 'Current task ID (optional update)' },
          },
          required: ['agentId'],
        },
      },
      {
        name: 'create_task',
        description: 'Create a new task in queue.md. The task is appended to the specified slice (or the last slice if omitted).',
        inputSchema: {
          type: 'object',
          properties: {
            description: { type: 'string', description: 'Task description (required)' },
            slice: { type: 'string', description: 'Slice to add the task to (e.g. "S5"). Defaults to the last slice.' },
            area: { type: 'string', description: 'Area/category (e.g. "Dashboard", "CLI")' },
            ac: { type: 'string', description: 'Acceptance criteria' },
            dependsOn: { type: 'string', description: 'Task ID this task depends on (e.g. "S1-T1")' },
          },
          required: ['description'],
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
          const args2 = args as { limit?: number; offset?: number };
          const limit = Math.min(args2.limit ?? 20, 500);
          const offset = args2.offset ?? 0;
          const data = await tryFetch<unknown>(`/history?limit=${limit}&offset=${offset}`);
          if (!data) return 'claudedash server not running. Start with: npx claudedash start';
          return JSON.stringify(data, null, 2);
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
        case 'get_session_context': {
          const { sessionId } = args as { sessionId?: string };
          if (!sessionId) return 'Error: sessionId is required';
          const data = await tryFetch<unknown>(`/sessions/${encodeURIComponent(sessionId)}/context`);
          if (!data) return 'claudedash server not running. Start with: npx claudedash start';
          return JSON.stringify(data, null, 2);
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
                headers: withAuth({ 'Content-Type': 'application/json' }),
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
        case 'register_agent': {
          const { agentId, name: agentName, taskId, sessionId } = args as { agentId?: string; name?: string; taskId?: string; sessionId?: string };
          if (!agentId) return 'Error: agentId is required';
          try {
            const res = await fetch(`${baseUrl}/agent/register`, {
              method: 'POST',
              headers: withAuth({ 'Content-Type': 'application/json' }),
              body: JSON.stringify({ agentId, name: agentName ?? agentId, taskId, sessionId }),
              signal: AbortSignal.timeout(2000),
            });
            if (!res.ok) return `Error: server returned ${res.status}`;
            return JSON.stringify(await res.json(), null, 2);
          } catch { return 'claudedash server not running. Start with: npx claudedash start'; }
        }
        case 'send_heartbeat': {
          const { agentId, status: hbStatus, taskId } = args as { agentId?: string; status?: string; taskId?: string };
          if (!agentId) return 'Error: agentId is required';
          try {
            const res = await fetch(`${baseUrl}/agent/heartbeat`, {
              method: 'POST',
              headers: withAuth({ 'Content-Type': 'application/json' }),
              body: JSON.stringify({ agentId, ...(hbStatus ? { status: hbStatus } : {}), ...(taskId !== undefined ? { taskId } : {}) }),
              signal: AbortSignal.timeout(2000),
            });
            if (!res.ok) return `Error: server returned ${res.status}`;
            return JSON.stringify(await res.json(), null, 2);
          } catch { return 'claudedash server not running. Start with: npx claudedash start'; }
        }
        case 'create_task': {
          const { description, slice, area, ac, dependsOn } = args as { description?: string; slice?: string; area?: string; ac?: string; dependsOn?: string };
          if (!description) return 'Error: description is required';
          try {
            const res = await fetch(`${baseUrl}/plan/task`, {
              method: 'POST',
              headers: withAuth({ 'Content-Type': 'application/json' }),
              body: JSON.stringify({ description, ...(slice ? { slice } : {}), ...(area ? { area } : {}), ...(ac ? { ac } : {}), ...(dependsOn ? { dependsOn } : {}) }),
              signal: AbortSignal.timeout(2000),
            });
            if (!res.ok) {
              const body = await res.text();
              return `Error: server returned ${res.status} — ${body}`;
            }
            return JSON.stringify(await res.json(), null, 2);
          } catch { return 'claudedash server not running. Start with: npx claudedash start'; }
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
  .description('Show a one-line control plane status summary (sessions, tasks, cost, billing block)')
  .option('--port <port>', 'claudedash server port', '4317')
  .option('--source <name>', 'Data source provider (currently: claude-code)', DEFAULT_SOURCE)
  .option('--json', 'output machine-readable JSON')
  .action(async (opts: { port: string; source?: string; json?: boolean }) => {
    const port = opts.port;
    const baseUrl = `http://localhost:${port}`;
    const claudeDir = join(process.env.HOME ?? '~', '.claude');
    const source = parseSource(opts.source);
    if (!source) {
      console.error(`❌ Unsupported --source: ${opts.source as string}`);
      console.error('   Supported values: claude-code');
      process.exit(1);
    }
    const sourceLayout = getSourceLayout(source, claudeDir);

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
      const todosDir = sourceLayout.todosDir;
      if (existsSync(todosDir)) {
        const files = readdirSync(todosDir).filter((f) => f.endsWith('.json') || f.endsWith('.jsonl'));
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
