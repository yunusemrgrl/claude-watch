# Worktree Observability

When running multiple Claude Code sessions in parallel across different git worktrees, claudedash can show you which branch each session is working in, whether its worktree is clean, and which tasks are associated with it.

## What is a git worktree?

A git worktree is an additional working directory attached to the same repository. It lets you check out different branches simultaneously without stashing or switching:

```bash
# Create a worktree for a feature branch
git worktree add ../my-project-feature feature/auth

# Now you can run Claude Code in each worktree independently
cd ../my-project          # main branch
cd ../my-project-feature  # feature/auth branch
```

This is particularly useful when running multiple AI agents on different tasks in parallel — each agent gets its own branch and working directory, and their changes don't interfere.

## The Worktrees tab

Open the **Worktrees** tab in the dashboard to see all worktrees for the project:

| Column | Description |
|--------|-------------|
| Name | Directory basename + dirty indicator (⚠ dirty / ✓ clean) |
| Branch | Current checked-out branch |
| Ahead/Behind | Commits ahead ↑ or behind ↓ relative to upstream |
| Tasks | Number of agent tasks associated with this worktree |

Click any row to expand it and see:
- Full path to the worktree
- HEAD commit SHA (abbreviated)
- List of tasks currently running in this worktree

The panel auto-refreshes every 30 seconds and has a manual refresh button.

## How task association works

claudedash matches sessions to worktrees by comparing `session.cwd` against `worktree.path`. It uses **longest-prefix matching** — if a session's cwd is `/home/user/project/sub`, it will be matched to the worktree at `/home/user/project/sub` rather than `/home/user/project`.

If multiple sessions share the same worktree (e.g. parallel agents), all their tasks appear in the expanded worktree row.

## Dirty detection and ahead/behind tracking

When loading the worktree panel, claudedash runs:

1. `git status --porcelain` to detect uncommitted changes (dirty = any output)
2. `git rev-list --left-right --count HEAD...@{u}` to count ahead/behind commits

Both commands run for each worktree in parallel. If a worktree has no upstream configured (detached HEAD, no remote branch), ahead/behind counts stay at 0 — no error is raised.

## Best practices for parallel execution

1. **One branch per task slice**: Create a worktree per major feature or sprint slice. This keeps agent changes isolated and easy to review.

2. **Watch ahead counts**: A high ahead count means the agent's branch has diverged significantly from upstream. Consider merging or rebasing before the branch grows too large to review.

3. **Monitor dirty state**: A persistent dirty indicator across refreshes may mean the agent left uncommitted work. Check before starting a new session in that worktree.

4. **Clean up worktrees**: After merging, remove the worktree with `git worktree remove ../my-project-feature`. Stale worktrees continue to appear in the dashboard until removed.

## API

```
GET /worktrees
```

Returns `{ worktrees: WorktreeState[] }` with enriched status. Degrades gracefully:
- Returns `[]` when not in a git repository
- Returns `[]` when git is not installed
- Never returns a 500 error

### WorktreeState schema

```typescript
interface WorktreeState {
  path: string;           // Absolute path to worktree
  branch: string;         // Current branch (or "(detached HEAD)")
  head: string;           // Commit SHA
  dirty: boolean;         // Has uncommitted changes
  aheadCount: number;     // Commits ahead of upstream
  behindCount: number;    // Commits behind upstream
  associatedTasks?: Array<{
    sessionId: string;
    taskId: string;
    taskSubject: string;
  }>;
}
```
