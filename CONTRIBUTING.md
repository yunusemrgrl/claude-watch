# Contributing to claudedash

Thank you for your interest in contributing! This document covers the architecture, directory structure, and how to extend the project.

## Architecture Overview

claudedash has two parts that communicate at runtime:

```
Claude Code session (agent)          claudedash server
─────────────────────────            ─────────────────
TodoWrite → tasks.json               reads tasks.json
execution.log ──────────────────────► /snapshot
queue.md     ──────────────────────► /snapshot
                                      │
                           SSE push  │  Dashboard (Next.js)
                           ◄─────────┤  polls /sessions, /snapshot
                                      │  receives SSE on /events
```

See [`docs/architecture.md`](docs/architecture.md) for a detailed data flow diagram.

**Important:** claudedash reads Claude Code's local files directly. See [`docs/compatibility.md`](docs/compatibility.md) for the exact file paths, JSONL schema fields, and what to do if formats change.

## Directory Map

```
claudedash/
├── src/
│   ├── cli.ts                  # Entry point: parses CLI args, calls startServer
│   ├── core/
│   │   ├── contextHealth.ts    # Context window % computation
│   │   ├── insightsEngine.ts   # Analytics over sessions and tasks
│   │   ├── logParser.ts        # Parses execution.log JSONL
│   │   ├── queueParser.ts      # Parses queue.md task definitions
│   │   ├── qualityTimeline.ts  # Extracts quality check events from log
│   │   ├── stateEngine.ts      # Merges queue + log → computed snapshot
│   │   ├── todoReader.ts       # Reads Claude Code session/task files
│   │   ├── types.ts            # Shared TypeScript types
│   │   ├── worktreeDetector.ts # Detects git worktrees on disk
│   │   └── worktreeMapper.ts   # Maps sessions to worktrees
│   └── server/
│       ├── server.ts           # Fastify setup + plugin registration
│       ├── watcher.ts          # chokidar watcher → EventEmitter
│       └── routes/
│           ├── live.ts         # /health, /events, /sessions, /sessions/:id
│           ├── plan.ts         # /snapshot, /insights, /quality-timeline, /claude-insights
│           └── observability.ts# /worktrees
├── dashboard/
│   └── src/
│       ├── app/page.tsx        # Layout shell: top bar + mode routing (< 150 lines)
│       ├── views/
│       │   ├── LiveView.tsx    # Session kanban + task detail
│       │   ├── PlanView.tsx    # Queue task tree + execution details
│       │   └── InsightsView.tsx# Claude Code /insight report iframe
│       ├── hooks/
│       │   ├── useSessions.ts  # SSE + session polling hook
│       │   └── usePlanSnapshot.ts # SSE + snapshot polling hook
│       ├── lib/
│       │   └── status.ts       # getStatusColor / getStatusLabel helpers
│       └── components/         # Shared UI components
├── tests/
│   ├── core/                   # Unit tests per core module
│   └── integration/            # Endpoint smoke tests
└── docs/
    └── architecture.md         # Data flow diagram + module responsibilities
```

## Local Development Setup

```bash
# 1. Clone and install
git clone https://github.com/yunusemrgrl/claudedash.git
cd claudedash
npm install

# 2. Build everything
npm run build           # builds TypeScript + Next.js dashboard

# 3. Run from local source (not the npm package)
node dist/cli.js start

# 4. Dashboard hot-reload (separate terminal)
cd dashboard && npm run dev
```

For tests:
```bash
npm test                # runs all 163 unit + integration tests
```

## How to Add a New Server Route

1. Decide which plugin it belongs to:
   - Live session data → `src/server/routes/live.ts`
   - Plan / queue / insights data → `src/server/routes/plan.ts`
   - Infrastructure / observability → `src/server/routes/observability.ts`

2. Add the route to the plugin function. Example adding `/sessions/:id/summary` to `live.ts`:

```typescript
fastify.get<{ Params: { id: string } }>('/sessions/:id/summary', async (request) => {
  const sessions = readSessions(claudeDir);
  const found = sessions.find(s => s.id === request.params.id);
  if (!found) return { error: 'Not found' };
  return { completed: found.tasks.filter(t => t.status === 'completed').length };
});
```

3. Add a corresponding type in `dashboard/src/types.ts` if the dashboard needs to consume the response.

4. Add an integration test in `tests/integration/endpoints.test.ts`.

## How to Add a New Dashboard View

1. Create `dashboard/src/views/MyView.tsx`. The view is self-contained — it fetches its own data and manages its own state:

```tsx
"use client";
import { useState, useEffect } from "react";

export function MyView({ searchQuery, sidebarCollapsed }: {
  searchQuery: string;
  sidebarCollapsed: boolean;
}) {
  const [data, setData] = useState(null);

  useEffect(() => {
    fetch("/my-endpoint").then(r => r.json()).then(setData);
  }, []);

  return <div>...</div>;
}
```

2. If the view needs real-time updates, create `dashboard/src/hooks/useMyData.ts` following the pattern in `useSessions.ts`: open an `EventSource`, listen for relevant event types, call a fetch on each event.

3. Add the view to the mode toggle and routing in `dashboard/src/app/page.tsx`:

```tsx
// Add to the modes array in the top bar
{ id: "myview", icon: SomeIcon, label: "My View", show: availableModes.live },

// Add to the content routing
mode === "myview" ? (
  <MyView searchQuery={searchQuery} sidebarCollapsed={sidebarCollapsed} />
) : ...
```

4. Add the new `ViewMode` string literal to the `type ViewMode` union at the top of `page.tsx`.
