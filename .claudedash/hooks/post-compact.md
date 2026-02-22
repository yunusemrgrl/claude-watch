# Post-Compact Hook

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
