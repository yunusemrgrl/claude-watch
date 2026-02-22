# Pre-Compact Hook

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
```
# Compact State
Task: S1-T3
Completed: 2 (S1-T1, S1-T2)
Status: In progress — editing src/server/server.ts, adding CORS restriction
Blocker: none
```
