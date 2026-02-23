# claudedash Launch Campaign

> v1.1.22 · 180 commits · MIT · [github.com/yunusemrgrl/claudedash](https://github.com/yunusemrgrl/claudedash)

---

## Launch Sequence (30-Day Calendar)

| Day | Platform | Content | Goal |
|-----|----------|---------|------|
| D1 Mon | Hacker News | Show HN post | 100+ upvotes → front page |
| D2 Tue | X/Twitter | Launch thread (8 tweets) | 500+ impressions, 50+ RT |
| D3 Wed | Product Hunt | Full launch | #1–2 Product of the Day |
| D4 Thu | Reddit r/ClaudeAI | Authentic builder post | 200+ upvotes |
| D5 Fri | Reddit r/LocalLLaMA | Technical deep-dive | 150+ upvotes |
| D7 Sun | LinkedIn | Engineering lead post | 5k+ impressions |
| D10 Wed | X/Twitter | Context health thread | Edu content |
| D14 Sun | Reddit r/programming | Show r/programming | 300+ upvotes |
| D15 Mon | LinkedIn | Technical credibility post | Developer audience |
| D18 Thu | X/Twitter | MCP recursion thread | Viral potential |
| D21 Sun | LinkedIn | Zero-dependency philosophy | Thought leadership |
| D24 Wed | X/Twitter | Plan mode walkthrough | Feature education |
| D28 Sun | All | "Share your setup" campaign | Community flywheel |
| D30 Tue | LinkedIn | 30-day recap post | Social proof |

---

## Assets Checklist

### Screenshots (capture with Playwright)
- [ ] `hero-dashboard.png` — Full dashboard, live sessions visible
- [ ] `context-health.png` — Context health widget closeup
- [ ] `worktrees.png` — Worktree panel with multiple branches
- [ ] `plan-mode.png` — Plan view with task dependency
- [ ] `kanban-tasks.png` — Task cards in different states
- [ ] `terminal-start.png` — npx command + startup output
- [ ] `mobile-crop.png` — Dashboard cropped to 9:16 for Instagram

### AI-Generated Visuals (use prompts in Section 3)
- [ ] Hero image × 5 (Midjourney v6 / Flux)
- [ ] Twitter header banner
- [ ] LinkedIn banner
- [ ] Instagram carousel backgrounds × 3

### Video / GIF
- [ ] Cold start demo GIF (record terminal → browser, 8s)
- [ ] Context health alert animation (Kling / Runway)
- [ ] MCP query loop clip (Runway)

---

## Section 1 — X/Twitter

---

### Thread 1: LAUNCH THREAD (pin this)

> **Visual:** `hero-dashboard.png` attached to tweet 1

**Tweet 1/10**
```
I gave Claude Code a 3-hour task last week.

Terminal scrolling. Zero visibility.
Is it stuck? Done? Looping?

I had no idea. So I built something. 🧵
```

**Tweet 2/10**
```
One command. That's it.

  npx -y claudedash@latest start

Opens localhost:4317 in 5 seconds.
Live Kanban. Context health. Cost tracker. Zero config.
```
> **Visual:** Terminal GIF showing startup

**Tweet 3/10**
```
The feature I didn't know I needed until I had it:

Context Health.

🟢 Under 65% → safe
🟡 65–75% → warning
🔴 Over 75% → critical

Now I know exactly when my agent is about to lose its mind.
Not after. Before.
```
> **Visual:** `context-health.png`

**Tweet 4/10**
```
Running agents on 3 branches simultaneously?

claudedash shows all of them.
Per-worktree status. Per-branch context health.
Which branch is stuck. Which is flying.

This is the feature that convinced my team.
```
> **Visual:** `worktrees.png`

**Tweet 5/10**
```
Plan Mode is where it gets serious.

Drop a queue.md with your tasks.
claudedash renders a dependency graph.
Tracks READY → IN_PROGRESS → DONE → BLOCKED in real time.

It's a sprint board for your AI agents.
No Jira. No Notion. Just files.
```
> **Visual:** `plan-mode.png`

**Tweet 6/10**
```
The wildest part:

I added the MCP server.
Then I asked Claude "what tasks do I have left?"

It queried its own dashboard and answered me.

🤖 watching itself work.
We're living in a simulation and I'm fine with it.
```

**Tweet 7/10**
```
No database. No cloud. No API key. No telemetry.

Everything stays on your machine.
Reads ~/.claude/tasks/ passively.
Doesn't touch your agents. Doesn't slow anything down.

Pure observer. Zero footprint.
```

**Tweet 8/10**
```
It also tracks:

→ Quality gates (lint + typecheck + test per task)
→ Hook integration (PreToolUse / PostToolUse)
→ Billing blocks (5-hour rolling cost window)
→ Session history + prompt replay

All from files. All local. All real-time.
```

**Tweet 9/10**
```
Add this to your CLAUDE.md:

  Before starting, check claudedash at localhost:4317
  to see current task queue and context health.

Now your agent knows about its own dashboard.
The loop closes.
```

**Tweet 10/10**
```
180 commits. Built in public. v1.1.22 dropped today.

If you use Claude Code and don't have this open,
you're flying blind.

⭐ github.com/yunusemrgrl/claudedash

🔁 if your team needs this
#ClaudeCode #AIAgents #DevTools #OpenSource
```

---

### Thread 2: Context Health Deep Dive

**Tweet 1/4**
```
Your Claude Code agent just silently degraded.

You won't know for another 20 minutes.

Here's the number you should have been watching 🧵
```

**Tweet 2/4**
```
Claude Code sessions have a context window.
When it fills up, the agent starts forgetting earlier instructions.
Quality drops. Loops form. Weird behavior appears.

Most people debug for 30 minutes before realizing what happened.
```

**Tweet 3/4**
```
claudedash shows you a live % based on the last API call.

65% → yellow warning
75% → red critical

You see it coming. You intervene. Or let it compact.
But now it's YOUR decision — not a surprise.
```

**Tweet 4/4**
```
The math: last message's input_tokens + cache_read_input_tokens
divided by model max.

No guessing. No sampling. The actual number.

npx -y claudedash@latest start
github.com/yunusemrgrl/claudedash

#ClaudeCode #AIAgents
```
> **Visual:** `context-health.png`

---

### Thread 3: 5-Second Setup

**Tweet 1/3**
```
Most developer tools have a README that starts with "Prerequisites."

claudedash has a README that starts with one command.

That difference matters more than you think. 🧵
```

**Tweet 2/3**
```
[GIF: terminal → command → browser open → dashboard live in 4.8s]

No npm install -g.
No config files.
No .env.
No Docker.

The first time you run it, it just works.
```

**Tweet 3/3**
```
Tools with friction get evaluated then abandoned.
Tools with zero friction get adopted then shared.

The "send this to your team" moment only happens
if you can say: one command, it works.

claudedash ships at 4.8 seconds.
github.com/yunusemrgrl/claudedash ⭐
```

---

### Thread 4: Plan Mode Walkthrough

**Tweet 1/4**
```
I run AI agents like a proper engineering team now.

Backlog. Sprint board. Dependency graph. Acceptance criteria.

All from a markdown file. Zero new tools. 🧵
```

**Tweet 2/4**
```
Create .claudedash/queue.md:

  ## S1-T1 — Auth API [depends: none]
  ## S1-T2 — Frontend [depends: S1-T1]
  ## S1-T3 — E2E tests [depends: S1-T2]

claudedash reads it. Renders the dependency graph.
Agent logs to execution.log. Dashboard syncs live.
```
> **Visual:** `plan-mode.png`

**Tweet 3/4**
```
Why this changes team standups:

The execution log IS the standup.

No "what did Claude do all night?"
The answer is timestamped, structured, already there.
```

**Tweet 4/4**
```
This is Plan Mode.

queue.md + execution.log + dependency graph + AC tracking.

It's a sprint board for your AI agent.
No extra tools. No integrations.

github.com/yunusemrgrl/claudedash
#ClaudeCode #AgentOps #BuildInPublic
```

---

### Thread 5: MCP Recursion

**Tweet 1/4**
```
I gave my AI agent access to its own dashboard.

It can now check task status, context health, and billing.

The recursion is making me uncomfortable. 🧵
```

**Tweet 2/4**
```
Add to claude_desktop_config.json:

{
  "claudedash": {
    "command": "npx",
    "args": ["-y", "claudedash@latest", "mcp"]
  }
}

Claude can now call:
get_sessions · get_snapshot · get_context_health
```

**Tweet 3/4**
```
Real example:

Me: "How far along is the auth feature?"

Claude: [calls get_snapshot]
"S1-T2 is in progress. S1-T1 completed 23 minutes ago.
2 tasks remaining in the sprint."

I didn't look at a single file.
```

**Tweet 4/4**
```
This is what meta-agent architectures look like in practice.

An orchestrator agent can query sub-agent dashboards.
Status propagation. No custom API glue.

github.com/yunusemrgrl/claudedash
#MCPServer #ClaudeCode #AgentOps
```

---

## Section 2 — LinkedIn

---

### Post 1: Engineering Lead (Long Form)

> **Visual:** `worktrees.png` or `hero-dashboard.png`
> **Carousel suggestion:** 6 slides (dashboard → context health → worktrees → plan → MCP → install command)

```
I gave Claude Code a long autonomous task.

Came back an hour later. Terminal had scrolled thousands of lines.
200 new lines of code written. But what actually happened?
I had to read through tool calls to reconstruct it.

That's the visibility problem with AI coding agents. I built claudedash to fix it.

claudedash solves this at the infrastructure level.

Single command: npx -y claudedash@latest start

What you get immediately:
✅ Live Kanban of every agent's task state
✅ Context health % per session (critical for long overnight runs)
✅ Per-worktree observability (which branch, which agent, what status)
✅ Cost tracking (5-hour billing blocks)
✅ Plan Mode: queue.md → dependency graph → execution log

The part that changed our team meetings: the execution log IS the standup.
No more "what did the agent do?" The answer is timestamped and structured.

If your team uses Claude Code and you're not monitoring it,
you're not running AI agents. You're running AI hope.

🔗 github.com/yunusemrgrl/claudedash

Drop a ⭐ if you build with AI agents.
Comment if you want to know how we structured our queue.md for a 40-task sprint.

#AIAgents #ClaudeCode #EngineeringLeadership #DevTools #BuildInPublic
```

---

### Post 2: Technical Credibility

> **Visual:** Code snippet / architecture diagram

```
The hardest part of building claudedash wasn't the Kanban.
It was the context health calculation.

Here's why it matters and how we solved it.

Claude Code sessions don't expose context usage directly.
The data is in JSONL files — but the naive approach of summing all
input_tokens across the session gives a wildly inflated number.

We shipped this. It showed 100% context health for every session.
Users noticed immediately.

The correct approach: use only the LAST message's input_tokens +
cache_read_input_tokens. This reflects what's actually in the model's
context window right now — not cumulative history.

We track lastInputTokens and lastCacheReadTokens separately (overwrite,
never accumulate) and compute:

  (lastInputTokens + lastCacheReadTokens) / modelMaxTokens

The result: a live, deterministic, accurate context health indicator.

🟢 Under 65% — safe
🟡 65–75% — time to plan a checkpoint
🔴 75%+ — compaction imminent

This is the kind of detail that separates tools that work
from tools that feel right.

Full source: github.com/yunusemrgrl/claudedash

#OpenSource #ClaudeCode #AIEngineering #DevTools
```

---

### Post 3: Show Your Team (Carousel)

> **Carousel:** 6 slides — each feature as one slide, final slide = install command
> **Visual:** Real screenshots per slide

```
I sent my team one screenshot on Monday morning.
By Friday, every engineer had it running.

The screenshot was of the worktree panel.
Four branches. Four agents. All visible in one view.
One was blocked. One was at 71% context. Two were flying.

My CTO's reply: "wait, how?"

That's the claudedash pitch.
Not a features list.
One screenshot that makes someone ask "wait, how?"

Link in comments 👇
github.com/yunusemrgrl/claudedash

#ClaudeCode #AIProductivity #EngineeringTeams #DevTools
```

---

### Post 4: Zero-Dependency Philosophy

```
The best developer tools don't add to your stack. They observe it.

claudedash is built on this philosophy:

→ No database. Claude Code already writes to ~/.claude/tasks/. We read it.
→ No cloud. Your agent data stays on your machine. Always.
→ No config. Point it at a directory, it figures the rest out.
→ No agent modification. We watch. We don't touch.

This is what "passive execution observer" means.
The tool doesn't make choices for you.
It shows you what's happening so you can.

In a world where every AI tool wants to be your new operating system,
there's something genuinely refreshing about a tool that just watches.

  npx -y claudedash@latest start

github.com/yunusemrgrl/claudedash

What's your philosophy for adopting new dev tools? 👇

#DevPhilosophy #AITools #OpenSource #ClaudeCode #BuildInPublic
```

---

## Section 3 — Reddit

---

### r/ClaudeAI — Post 1

**Title:** `I got tired of not knowing what my Claude Code agents were doing, so I built a dashboard. One command to start.`

```
Hey r/ClaudeAI,

I've been using Claude Code heavily for autonomous tasks
and the lack of visibility was killing me.

So I built claudedash — a real-time local dashboard that reads Claude's
task files and renders a live Kanban.

**What it does:**
- Live task Kanban (pending → in_progress → completed → blocked)
- Context health % per session (65% warn, 75% critical)
- Worktree observability — see all your branches at once
- Plan Mode: queue.md + dependency graph + execution.log
- MCP server: Claude can query its own dashboard
- Cost tracker, hook integration, session history

**What it doesn't do:**
- Phone home. Zero telemetry. All local.
- Modify your agents. Pure passive observer.
- Require config. One command: npx -y claudedash@latest start

The context health feature is the one people love most — instead of being
surprised when an agent degrades, you watch the % creep up and intervene.

GitHub: https://github.com/yunusemrgrl/claudedash

Happy to answer any questions about the implementation.
Built with Fastify + chokidar + Next.js static export.
```

---

### r/LocalLLaMA — Post 2

**Title:** `Built a zero-dependency local dashboard for Claude Code agents. No cloud, no DB, no telemetry. Filesystem watching only.`

```
If you're running Claude Code locally and want observability without
giving anything to anyone — this might be for you.

claudedash is a local Fastify server that watches ~/.claude/tasks/
and renders a live dashboard. Static Next.js frontend, SSE for updates,
no external services.

**Architecture:**
- Server: Fastify + chokidar file watcher
- Frontend: Next.js static export
- Data: reads .jsonl files Claude writes natively
- SSE singleton (one shared connection for all hooks)
- MCP server for agent self-querying
- Server-side mtime-based cache (no unnecessary file reads)

**Context health implementation:**
last message's (input_tokens + cache_read_input_tokens) / model_max
Not cumulative. Just current window state.

Everything local. npx install. No setup.

github.com/yunusemrgrl/claudedash

Would love feedback from people running local agent setups.
```

---

### r/programming — Post 3

**Title:** `Show r/programming: claudedash — real-time observer for AI coding agents`

```
**Show r/programming:** claudedash

Context: I use Claude Code (Anthropic's CLI agent) heavily.
It runs autonomously, modifies files, executes tasks.
The problem: zero native observability.

So I built claudedash:

1. Watches ~/.claude/tasks/ passively (no agent modification)
2. Live Kanban of task states
3. Context health % in real time
4. Per-worktree agent status
5. MCP server: Claude can query itself
6. GET /debug/timing → p50/p95/max per endpoint (for local profiling)

**Technical:**
- TypeScript + Fastify + chokidar
- SSE for browser updates (module-level singleton, 3 connections → 1)
- Server-side mtime-based caching for hot endpoints
- Static Next.js export, zero server rendering

162 commits, MIT license, built in public.
https://github.com/yunusemrgrl/claudedash

Happy to discuss architecture decisions.
```

---

## Section 4 — Instagram Carousels

---

### Carousel 1: "What's your AI agent doing right now?"

> **10 slides, 1:1 format, dark theme**

| Slide | Text | Visual |
|-------|------|--------|
| 1 | "Your AI agent is running. But what is it actually doing right now? 🤔" | Dark background, cyan text glow |
| 2 | "Most developers find out when it's done. Or when it crashes." | Minimal, red accent |
| 3 | "claudedash changes that." | Logo + terminal command |
| 4 | "Live Kanban. Every task. Every state. Every agent." | `kanban-tasks.png` |
| 5 | "Context Health. Know before it degrades." | `context-health.png` |
| 6 | "Worktree View. 4 branches. 4 agents. One screen." | `worktrees.png` |
| 7 | "Plan Mode. queue.md → dependency graph → execution log." | `plan-mode.png` |
| 8 | "Zero config. Zero telemetry. Totally local." | Terminal screenshot |
| 9 | "`npx -y claudedash@latest start`" | Large mono typography |
| 10 | "⭐ github.com/yunusemrgrl/claudedash" | QR code + CTA |

**Caption:**
```
Most developers find out their AI agent crashed after the fact.
Not anymore.

npx -y claudedash@latest start

Real-time dashboard for Claude Code agents.
Context health. Live Kanban. Worktrees. Local only.

Link in bio → github.com/yunusemrgrl/claudedash

#ClaudeCode #AIAgents #DevTools #OpenSource #BuildInPublic
#AICode #DeveloperTools #Productivity #LocalFirst
```

---

### Carousel 2: "5 Things I know about my agents now"

| Slide | Text |
|-------|------|
| 1 | "5 things I know about my Claude Code agents now that I couldn't see before 👇" |
| 2 | "1. Exactly which task they're on right now" |
| 3 | "2. How full their context window is — before it degrades" |
| 4 | "3. Which agent on which branch is stuck" |
| 5 | "4. How much the last 5-hour billing block cost" |
| 6 | "5. What they did while I slept (timestamped execution log)" |
| 7 | "All of this from one terminal command." |
| 8 | "`npx -y claudedash@latest start`" |
| 9 | "Localhost. Local data. No cloud. No config." |
| 10 | "github.com/yunusemrgrl/claudedash — link in bio ⭐" |

**Caption:**
```
Zero visibility → full observability. One command.

#ClaudeCode #AIAgents #DevTools #MachineLearning
#AIProductivity #OpenSource #Anthropic #LocalFirst
```

---

### Carousel 3: "The MCP Recursion"

| Slide | Text |
|-------|------|
| 1 | "I gave my AI agent access to its own dashboard. Then I asked it how far along it was. 🤯" |
| 2 | "Claude Code has an MCP protocol. claudedash has an MCP server." |
| 3 | "Two lines of config. That's the entire setup." |
| 4 | "Claude can now call: get_sessions · get_snapshot · get_context_health" |
| 5 | "Me: 'What tasks are left?'" |
| 6 | "Claude: [queries own dashboard] '2 tasks remaining in sprint.'" |
| 7 | "It knows what it knows. It knows what it needs to do." |
| 8 | "This is what meta-agent architectures feel like in practice." |
| 9 | "One command to start. One config line to connect." |
| 10 | "github.com/yunusemrgrl/claudedash — link in bio 👆" |

**Caption:**
```
The AI agent that monitors itself.

#MCP #ClaudeCode #AIAgents #MetaAgent #DevTools
#OpenSource #Anthropic #AIEngineering #BuildInPublic
```

---

## Section 5 — Visual & Video Prompts

> Copy-paste these directly into Midjourney v6, Grok Imagine, or Flux Dev.

---

### Hero Images (Midjourney / Flux)

**Hero 1 — Full Dashboard**
```
Ultra-detailed cinematic screenshot mockup of a dark futuristic developer
dashboard, deep space black background (#0a0a0f), floating glassmorphism
panels with cyan (#00f5ff) and indigo accent glows, Kanban board showing
AI agent tasks in columns labeled PENDING IN_PROGRESS COMPLETED BLOCKED,
each card has a small glowing status indicator, top bar shows "claudedash
v1.1.21" in monospace font, context health bar at 43% in green gradient,
multiple worktree branches on left sidebar, ambient blue particle fog in
background, ultra sharp 4K render, cinematic depth of field, f/1.8
aperture blur on background elements, professional UI mockup style
--ar 16:9 --v 6 --style raw --q 2
```

**Hero 2 — Context Health Widget**
```
Close-up cinematic render of a glowing context health monitoring widget,
dark glass panel floating in void, three horizontal progress bars labeled
SAFE WARNING CRITICAL with gradient fills emerald to amber to blood red,
percentage number in large monospace white text, soft bloom light around
the critical bar at 78%, dark background with subtle hexagonal grid
texture, neon accent reflections on glass surface, ultra sharp product
photography style, professional developer tool aesthetic
--ar 4:3 --v 6 --style raw
```

**Hero 3 — Multi-Agent Worktree View**
```
Futuristic dashboard showing 4 parallel AI agent workflows on separate
branches, each branch displayed as a glowing lane with distinct color
coding cyan violet amber emerald, agent status indicators with live
pulsing animations, git branch names in monospace font, context health
percentages floating above each lane, dark terminal aesthetic with
blue-black gradient background, cinematic wide angle, depth of field
blur on far lanes, professional developer tool product screenshot,
ultra realistic UI render --ar 21:9 --v 6
```

**Hero 4 — Plan Mode Dependency Graph**
```
Dark developer tool interface showing a task dependency graph, nodes
labeled S1-T1 through S1-T6 connected by glowing directional arrows,
completed nodes pulse green, in-progress nodes pulse blue, blocked nodes
pulse amber, READY nodes glow white, dark grid background with subtle
depth, floating execution timeline at bottom showing timestamps, monospace
fonts throughout, cinematic render with volumetric light rays between
node clusters, ultra detailed 4K product mockup --ar 16:9 --v 6 --style raw
```

**Hero 5 — Terminal Split Screen**
```
Split-screen cinematic composition: left half shows dark terminal with
npx claudedash start command in green monospace text with pulsing cursor,
right half shows fully populated live dashboard emerging with cyan glow,
split lit dramatically from center, terminal text reflections on glass
separator panel, deep space black background, developer keyboard shadow
at bottom of frame, ultra sharp product photography, professional tech
poster composition --ar 16:9 --v 6
```

---

### Animated GIF / Video (Runway ML / Kling)

**Video 1 — Cold Start Demo**
```
Screen recording style animation: empty dark terminal window, user types
"npx -y claudedash@latest start" with realistic keystroke timing, progress
spinner appears for 2 seconds, browser window slides in from right showing
live dashboard populating with task cards in real time, context health bars
filling with smooth animation, green "LIVE" indicator pulsing, total
duration 8 seconds, clean professional screencast aesthetic, dark theme
throughout, loop-friendly
```

**Video 2 — Context Health Alert**
```
Short cinematic animation: developer dashboard, camera slowly pushes into
context health widget, percentage counter ticks from 60% to 71% to 78%,
color shifts green to yellow to red with bloom effect, warning indicator
appears with subtle pulse, agent task card in background shows RUNNING
state, ambient dashboard lights reflect the color change, duration 6
seconds, loop-friendly, professional motion design, dark futuristic aesthetic
```

**Video 3 — MCP Query Loop**
```
Cinematic split-screen: left panel shows Claude Code terminal receiving
"what tasks do you have left?", right panel shows claudedash dashboard
with get_snapshot MCP call briefly highlighting, then terminal populates
"S1-T2 in progress, 2 tasks remaining", glowing connection line pulses
between panels during query, duration 10 seconds, dark background,
green terminal text on left, polished dashboard UI on right, subtle
particle effects during data transfer
```

---

### Instagram Carousel Slide Backgrounds (Midjourney)

**Slide Background 1 — Hook Slide**
```
Instagram carousel first slide design, 1:1 square, dark background
#0d0d14, large white bold headline "Your AI agent is running." second
line in cyan "Do you know what it's doing?", bottom quarter shows blurred
dark dashboard screenshot with glow effect, claudedash logo top-right
in monospace font, subtle grid texture overlay, high contrast legible
typography --ar 1:1 --v 6
```

**Slide Background 2 — Context Health**
```
Instagram carousel slide 1:1 format, dark background, centered large
circular gauge showing 73% fill in amber-orange gradient, label CONTEXT
HEALTH above in small caps monospace, three labels below: GREEN safe
YELLOW warn RED critical with color swatches, subtle glow bloom around
gauge, white percentage number in center very large and sharp, minimal
clean layout, professional developer UI screenshot style --ar 1:1
```

**Slide Background 3 — CTA Final Slide**
```
Instagram carousel final slide CTA, 1:1 square, dark background #0a0a0f,
centered large white monospace text "npx -y claudedash@latest start",
below in smaller cyan "localhost:4317 in 5 seconds", GitHub star icon
with "Star on GitHub" in bottom third, QR code in corner, subtle cyan
gradient glow radiating from text center, minimal clean layout, high
contrast, professional developer brand identity --ar 1:1 --v 6
```

---

### Banners

**Twitter / X Header (1500×500)**
```
Wide panoramic Twitter header banner 1500x500px, dark futuristic developer
tool branding, left side "claudedash" in large monospace bold white text
with subtle cyan glow, tagline "Real-time observability for Claude Code
agents", right two-thirds shows stylized dashboard screenshot at slight
angle with depth of field blur, dark background with subtle particle field,
cyan and indigo accent colors, professional developer tool brand
--ar 3:1 --v 6 --style raw
```

**LinkedIn Banner (1584×396)**
```
LinkedIn banner 1584x396px, professional dark developer tool aesthetic,
gradient background deep navy #0a0a1a left to near-black right, left
third "claudedash" in clean monospace font with version tag "v1.1.21",
center shows three minimalist icons: Kanban board, context health ring,
worktree branches, right third shows "npx -y claudedash@latest start"
in code-style highlighted box with subtle glow, horizontal composition,
subtle grid lines in background --ar 4:1 --v 6
```

---

## Hacker News Post

**Title:** `Show HN: claudedash – real-time local dashboard for Claude Code agents`

> Title length: 70 chars (HN limit: 80) ✓

```
Hi HN,

I've been using Claude Code heavily for autonomous agent workflows and hit
a consistent pain point: zero visibility into what's running, what's stuck,
and how close to context overflow each session is.

So I built claudedash. One command:

    npx -y claudedash@latest start

Opens a local dashboard on port 4317. It passively watches ~/.claude/tasks/
(the files Claude Code writes natively) and renders:

- Live Kanban: pending → in_progress → completed → blocked
- Context health % per session (last-message tokens / model max)
- Worktree observability (per-branch agent status)
- Plan Mode: reads queue.md, renders dependency graph, syncs execution.log
- MCP server: so Claude can query its own dashboard
- Cost tracker, hook event log, session history

Technical notes for the curious:
- Fastify + chokidar for the server
- SSE (one shared connection via module-level singleton)
- Server-side mtime-based caching (no unnecessary file reads)
- Static Next.js export, no server rendering
- Zero telemetry, fully local

The context health feature was trickier than expected — the naive approach
of summing all input_tokens gives wildly wrong numbers. The correct approach
is using only the last message's token counts.

180 commits, MIT license.

GitHub: https://github.com/yunusemrgrl/claudedash

Happy to answer questions about the implementation or design decisions.
```

### Posting Checklist

- [ ] Account has ≥ 10 karma (required to show on /newest)
- [ ] Pick timing: **Tuesday or Wednesday, 09:00–11:00 ET** (peak HN front page window)
- [ ] Do NOT submit on weekends or Monday
- [ ] Log in, go to `news.ycombinator.com/submit`
- [ ] URL: `https://github.com/yunusemrgrl/claudedash`
- [ ] Title: exactly as above (copy-paste)
- [ ] DO NOT add text to the URL submission box — put body in first comment
- [ ] Post the body text (above) as the FIRST COMMENT immediately after submitting
- [ ] Stay online for first 2 hours to reply to early questions
- [ ] Reply to every comment within the first hour

### Likely HN Questions & Answers

| Question | Answer |
|----------|--------|
| "How is this different from ccusage?" | ccusage tracks costs per model. claudedash tracks task state, context health, worktrees, and plan execution — operational observability, not billing analytics. |
| "Does this work with Claude Desktop?" | No — it's for Claude Code (CLI). Claude Desktop doesn't write JSONL task files to `~/.claude/tasks/`. |
| "Why port 4317?" | OpenTelemetry default port — felt appropriate for an observability tool. Configurable with `--port`. |
| "Windows support?" | Yes, Node.js cross-platform. Tested on macOS/Linux primarily. |
| "Can I run this remotely / expose it to my team?" | Not yet. `--share` flag (ngrok tunnel) is on the roadmap. |
| "What model versions are supported?" | Any model Claude Code uses. Context window size is fetched from the model config in the JSONL files. |
| "Does this slow down agents?" | No. It only reads files that Claude Code already writes. Zero writes to agent directories. |

---

## CLAUDE.md Viral Snippet

> Share this snippet publicly. When developers copy-paste their CLAUDE.md
> to new projects, they re-discover claudedash organically.

```markdown
## Monitoring

Before starting a multi-step task, check claudedash at localhost:4317
to review current task queue and context health percentage.

If context health > 65%, plan a compaction checkpoint.
If context health > 75%, compact immediately before proceeding.

After completing tasks, verify they appear as DONE in the dashboard.
```

---

## Product Hunt

**Tagline** (max 60 chars):
```
Real-time dashboard for Claude Code agents — one command
```
> 57 chars ✓

**Description** (max 260 chars for gallery caption):
```
Zero-config observability for Claude Code. Live Kanban, context health %, per-worktree agent status, plan execution graph, MCP self-query. No telemetry. No cloud. Just: npx -y claudedash@latest start
```

**Full Description** (product page body):
```
claudedash is a local real-time dashboard for Claude Code agents.

If you're running AI coding agents autonomously — overnight runs, parallel
worktrees, multi-task sprints — you know the problem: zero visibility.
You don't know which task is stuck. You don't know how close to context
overflow each session is. You find out after.

claudedash solves this with one command:

  npx -y claudedash@latest start

Opens localhost:4317 in under 5 seconds. Passively reads the files Claude
Code already writes. Zero agents modified. Zero telemetry.

WHAT YOU GET:
→ Live Kanban — every task, every state, real-time
→ Context Health — live % per session (65% warn, 75% critical)
→ Worktree View — all branches, all agents, one screen
→ Plan Mode — queue.md + dependency graph + execution log
→ MCP Server — Claude can query its own dashboard
→ Cost Tracker — 5-hour billing block monitoring
→ Hook Events — PreToolUse/PostToolUse log

WHY IT'S DIFFERENT:
No database. No API key. No config file. No cloud sync.
Pure filesystem watcher (chokidar) + SSE + Next.js static export.
Everything runs on your machine. Everything stays on your machine.

180 commits. MIT license. Open source.
```

### Gallery Images (in order)

1. `hero-dashboard.png` — Full live dashboard with Kanban
2. `context-health.png` — Context health widget closeup
3. `worktrees.png` — Multi-branch worktree panel
4. `kanban.png` — Kanban task cards
5. `queue.png` — Plan mode dependency graph
6. `terminal-start.gif` — Cold start demo (animated)

### First Comment (post immediately after launch goes live)

```
Hey PH! Builder here.

Quick context: I built this because I was running 4 Claude Code agents
in parallel and had zero visibility. Cat-ing JSON files at 2am to figure
out which agent was stuck got old fast.

The feature most users mention first is Context Health — seeing the live
% of context window used, with 65%/75% thresholds, so you know when your
agent is about to degrade. It sounds simple but it changes how you work.

Technical note for the curious: the naive approach (summing all input_tokens
across the session) gives wildly wrong numbers. The correct approach is
using only the LAST message's token counts. That was a fun 3am debugging
session.

Happy to answer any questions about the implementation, design decisions,
or Claude Code workflows in general.

GitHub: https://github.com/yunusemrgrl/claudedash
```

### Posting Checklist

- [ ] Create account at producthunt.com (if not existing)
- [ ] Profile: real photo, filled bio, linked Twitter/GitHub
- [ ] Pick launch day: **Tuesday** (highest traffic) or **Wednesday**
- [ ] Submit at **00:01 PST** to maximize 24-hour window
- [ ] Notify existing GitHub stargazers the day before
- [ ] Ask 5–10 genuine users to upvote on launch day (no coordinated voting rings)
- [ ] Post on Twitter/X announcing the PH launch on launch morning
- [ ] Stay online all day to reply to comments
- [ ] Reply to EVERY comment within 2 hours

### Categories

Primary: `Developer Tools`
Secondary: `Artificial Intelligence`, `Open Source`

### Maker Tags

`open-source`, `cli`, `devtools`, `claude`, `ai-agents`, `observability`

---

## "Share Your Setup" Weekly Post Template

> Post every Sunday. Seed with 2–3 real screenshots first week.

**X/Twitter:**
```
🗓️ Sunday setup share:

Drop a screenshot of your claudedash setup 👇

What are you monitoring? How many agents?
What's your queue.md look like?

Best setup gets a RT.

github.com/yunusemrgrl/claudedash
#ClaudeCode #AIAgents #BuildInPublic
```

**Engagement replies to watch for:**
- "How did you set up Plan Mode?" → link to docs
- "Does this work on Windows?" → yes, Node.js cross-platform
- "Can I run this remotely?" → not yet, planned `--share` flag

---

*Updated for claudedash v1.1.22 · February 2026*
