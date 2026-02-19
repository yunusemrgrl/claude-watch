#!/usr/bin/env node

import { Command } from 'commander';
import { mkdirSync, writeFileSync, existsSync } from 'fs';
import { join } from 'path';
import { exec } from 'child_process';
import { startServer } from './server/server.js';

const program = new Command();

program
  .name('claudedash')
  .description('Live Kanban, quality gates and context health monitoring for Claude Code agents')
  .version('0.5.3');

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

      console.log('\n✓ Ready! Next steps:');
      console.log('  1. Edit .claudedash/queue.md with your tasks');
      console.log('  2. Copy .claudedash/CLAUDE.md contents into your project CLAUDE.md');
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

    const url = `http://localhost:${port}`;

    try {
      await startServer({
        claudeDir,
        port,
        agentScopeDir: hasPlan ? claudeWatchDir : undefined
      });

      console.log(`✓ Server running on ${url}`);
      if (hasLive) console.log(`  Live mode: watching ${claudeDir}/tasks/`);
      if (hasPlan) console.log('  Plan mode: reading .claudedash/');
      console.log('✓ Opening browser...');

      const platform = process.platform;
      const openCommand = platform === 'darwin' ? 'open' :
                         platform === 'win32' ? 'start' :
                         'xdg-open';

      exec(`${openCommand} ${url}`, (error) => {
        if (error) {
          console.log('Could not auto-open browser. Please visit:', url);
        }
      });
    } catch (error) {
      console.error('❌ Failed to start server:', error);
      process.exit(1);
    }
  });

program.parse();
