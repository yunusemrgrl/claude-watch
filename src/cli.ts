#!/usr/bin/env node

import { Command } from 'commander';
import { mkdirSync, writeFileSync, existsSync } from 'fs';
import { join } from 'path';
import { exec } from 'child_process';
import { startServer } from './server/server.js';

const program = new Command();

program
  .name('agent-scope')
  .description('Deterministic, local, passive execution observer for AI agent workflows')
  .version('0.2.1');

program
  .command('init')
  .description('Initialize agent-scope in current directory')
  .action(() => {
    const agentScopeDir = join(process.cwd(), '.agent-scope');

    // Create .agent-scope/ directory
    if (existsSync(agentScopeDir)) {
      console.log('⚠️  .agent-scope/ already exists');
      process.exit(1);
    }

    try {
      mkdirSync(agentScopeDir);
      console.log('✓ Created .agent-scope/ folder');

      // Create queue.md template
      const queueTemplate = `# Slice S1

## S1-T1
Area: Core
Depends: -
Description: First task
AC: Task completed successfully
`;
      writeFileSync(join(agentScopeDir, 'queue.md'), queueTemplate);
      console.log('✓ Created queue.md template');

      // Create empty execution.log
      writeFileSync(join(agentScopeDir, 'execution.log'), '');
      console.log('✓ Created execution.log');

      // Create config.json
      const config = {
        queueFile: 'queue.md',
        logFile: 'execution.log',
        port: 4317,
        taskModel: {
          fields: [
            { name: 'Area', type: 'enum', required: true, values: ['Core'] },
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
      writeFileSync(join(agentScopeDir, 'config.json'), JSON.stringify(config, null, 2));
      console.log('✓ Created config.json');

      // Generate Claude.md snippet
      const claudeMdSnippet = `
# Agent Scope Integration

When working on tasks, log your progress to \`.agent-scope/execution.log\`:

## Log Format (JSONL)

Each completed task should be logged as a single line:

\`\`\`json
{"task_id":"S1-T1","status":"DONE","timestamp":"2026-02-16T14:31:22Z","agent":"claude"}
\`\`\`

For failures:

\`\`\`json
{"task_id":"S1-T2","status":"FAILED","timestamp":"2026-02-16T14:33:10Z","agent":"claude","meta":{"reason":"timeout"}}
\`\`\`

For blockers (when a task cannot proceed):

\`\`\`json
{"task_id":"S1-T3","status":"BLOCKED","reason":"API key missing","timestamp":"2026-02-16T14:35:00Z","agent":"claude"}
\`\`\`

## Required Fields

- \`task_id\`: Task identifier from queue.md (e.g., "S1-T1")
- \`status\`: "DONE", "FAILED", or "BLOCKED"
- \`timestamp\`: ISO-8601 timestamp (use \`new Date().toISOString()\`)
- \`agent\`: Your agent name (e.g., "claude")
- \`reason\`: (Required for BLOCKED) Why the task is blocked
- \`meta\`: (Optional) Additional context

Run \`npx agent-scope start\` to view the dashboard.
`;

      console.log('✓ Ready to use! Add this to your Claude.md:\n');
      console.log(claudeMdSnippet);
    } catch (error) {
      console.error('❌ Failed to initialize:', error);
      process.exit(1);
    }
  });

program
  .command('start')
  .description('Start the agent-scope server and dashboard')
  .option('--claude-dir <path>', 'Path to Claude directory', join(process.env.HOME || '~', '.claude'))
  .option('-p, --port <number>', 'Port number', '4317')
  .action(async (opts) => {
    const claudeDir = opts.claudeDir;
    const agentScopeDir = join(process.cwd(), '.agent-scope');

    // Detect available modes
    const hasLive = existsSync(join(claudeDir, 'tasks'));
    const hasPlan = existsSync(agentScopeDir);

    if (!hasLive && !hasPlan) {
      console.error('❌ No data sources found.');
      console.error(`   Live mode: ${claudeDir}/tasks/ not found`);
      console.error('   Plan mode: .agent-scope/ not found (run "agent-scope init")');
      process.exit(1);
    }

    // Read port from config if plan mode available, otherwise use CLI option
    let port = parseInt(opts.port, 10);
    if (hasPlan) {
      const configPath = join(agentScopeDir, 'config.json');
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
        agentScopeDir: hasPlan ? agentScopeDir : undefined
      });

      console.log(`✓ Server running on ${url}`);
      if (hasLive) console.log(`  Live mode: watching ${claudeDir}/tasks/`);
      if (hasPlan) console.log('  Plan mode: reading .agent-scope/');
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
