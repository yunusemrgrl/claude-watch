## General Rules

- Minimize file creation and token usage.
- Always prefer editing existing files over creating new ones.
- Do not create new files unless absolutely necessary.
- Do not create shell scripts unless explicitly requested.

## Pre-Commit Checklist (MANDATORY)

Before every `git commit`, run ALL of the following in order. Do NOT skip any step.

```
npm run lint        # ESLint — must pass with 0 errors
npx tsc --noEmit    # TypeScript check (server/CLI)
cd dashboard && npx tsc --noEmit && cd ..  # TypeScript check (dashboard)
npm run build       # Full build — must succeed
```

If any step fails: fix the error first, then re-run from the beginning. Never commit with lint or type errors.

## Workflow

- If workflow documents, task documents, predefined plans, or execution specs exist in the repository, follow them autonomously.
- Do NOT ask what to do next when an execution path is already defined.
- Only ask questions when there is a real ambiguity, missing requirement, or hard blocker.
- Avoid scope expansion beyond the defined plan.

## Debugging Rules

- When fixing bugs, attempt a maximum of 2 solutions.
- If both attempts fail, STOP immediately.
- Re-analyze the root cause before proceeding.
- Clearly explain the new hypothesis before writing additional code.
- Do not iterate blindly with small variations.

- After modifying authentication-related logic, audit ALL screens, tabs, and modules that perform API calls.
- Ensure coverage consistency across the entire authenticated surface — not only the screen that exposed the issue.

## Publishing

**NEVER run `npm publish` manually.** Publishing is fully automated via GitHub Actions.

Flow: bump version with `npm version patch` → commit → push → `auto-tag.yml` triggers automatically → builds, publishes to npm, creates git tag + GitHub Release.

The workflow only publishes if the version is not already on npm, so re-pushes are safe.

## Task Tracking

If `.claudedash/queue.md` exists, follow `.claudedash/workflow.md` for structured task execution.
Log progress to `.claudedash/execution.log`. See `.claudedash/CLAUDE.md` for full details.
