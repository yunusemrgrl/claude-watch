# Release Notes: agent-scope v0.1.0

**Release Date:** February 16, 2026
**Type:** Initial Release
**Status:** Stable

---

## 🎉 Initial Release

We're excited to announce the first stable release of **agent-scope** – a deterministic, local, passive execution observer for AI agent workflows!

## 🚀 What is agent-scope?

agent-scope is a lightweight, file-based execution observer that provides real-time visibility into AI agent workflows. It monitors task progress, dependencies, and completion status without requiring databases, authentication, or cloud infrastructure.

## ✨ Key Features

### Core Functionality
- **📁 File-Based Architecture** - No database required, just markdown + JSONL
- **🎯 Deterministic State Computation** - Pure functions, same input = same output
- **👀 Passive Observer** - Monitors workflows without wrapping agents
- **🤖 Model-Agnostic** - Works with any AI agent or framework
- **🔒 Local-First** - All data stays on your machine
- **⚡ Real-Time Dashboard** - Live progress tracking and visualization

### Technical Highlights
- **TypeScript** - Strict mode throughout for maximum type safety
- **98.33% Test Coverage** - 62 comprehensive unit tests
- **Circular Dependency Detection** - DFS-based cycle detection
- **Error-Tolerant Parsing** - Collects errors instead of crashing
- **Stateless Architecture** - Clean, deterministic state recomputation

## 📦 What's Included

### CLI Commands
```bash
agent-scope init   # Initialize .agent-scope/ directory
agent-scope start  # Start server and open dashboard
```

### HTTP API
- `GET /snapshot` - Returns computed system state
- `GET /health` - Health check endpoint

### Dashboard Features
- **Executive Summary** - Total tasks, done, failed, blocked, ready counts
- **Slice Progress Bars** - Visual progress per workflow slice
- **Task Table** - Filterable, sortable task list
- **Task Details Drawer** - Click any task for full information
- **Dependency Visualization** - See dependencies and reverse dependencies
- **Dark Mode** - Beautiful dark theme built with Tailwind CSS

### Core Modules
- **Queue Parser** - Markdown DSL parser with validation
- **Log Parser** - JSONL event parser with schema validation
- **State Engine** - Dependency-aware status computation
- **Type System** - Complete TypeScript type definitions

## 🎯 Use Cases

- **AI Agent Development** - Monitor multi-step agent workflows
- **Task Automation** - Track long-running automation pipelines
- **Project Management** - Visualize task dependencies and progress
- **Testing** - Observe test execution flows
- **CI/CD Monitoring** - Track deployment task completion

## 📊 Status Computation

agent-scope uses a deterministic algorithm to compute task status:

```
For each task:
  if lastEvent.status === FAILED → FAILED
  else if lastEvent.status === DONE → DONE
  else if any dependency.status !== DONE → BLOCKED
  else → READY
```

**Priority:** FAILED > DONE > BLOCKED > READY

## 🏗️ Architecture

### Tech Stack
- **Language:** TypeScript 5.3 (strict mode)
- **CLI:** Commander 12.0
- **Server:** Fastify 4.26
- **UI:** Next.js 14.1 + Tailwind CSS
- **Testing:** Vitest 1.2

### Project Structure
```
agent-scope/
├─ src/core/          # Parsers + state engine
├─ src/server/        # Fastify API
├─ src/cli.ts         # Commander CLI
├─ dashboard/         # Next.js UI
└─ tests/            # Unit tests (98.33% coverage)
```

## 📝 File Formats

### Task Queue (queue.md)
```markdown
# Slice S1

## S1-T1
Area: Backend
Depends: -
Description: Setup database
AC: Tables created
```

### Execution Log (execution.log)
```json
{"task_id":"S1-T1","status":"DONE","timestamp":"2026-02-16T14:31:22Z","agent":"claude"}
{"task_id":"S1-T2","status":"FAILED","timestamp":"2026-02-16T14:33:10Z","agent":"claude","meta":{"reason":"timeout"}}
```

## 🔧 Installation

### Global Installation
```bash
npm install -g agent-scope
```

### Quick Start
```bash
npx agent-scope init
# Edit .agent-scope/queue.md
# Log events to .agent-scope/execution.log
npx agent-scope start
```

## 📈 Package Stats

- **Package Size:** 229.7 KB
- **Unpacked Size:** 769.8 KB
- **Total Files:** 46
- **Dependencies:** 4 runtime, 5 dev
- **Node Version:** >=18.0.0
- **License:** MIT

## 🧪 Test Coverage

```
File            | % Stmts | % Branch | % Funcs | % Lines
----------------|---------|----------|---------|----------
All files       |   98.33 |    97.41 |     100 |   98.33
logParser.ts    |     100 |      100 |     100 |     100
queueParser.ts  |    97.7 |    95.83 |     100 |    97.7
stateEngine.ts  |      98 |    96.87 |     100 |      98
```

## 🚫 Non-Goals (v0.1)

This release intentionally does **not** include:
- Real-time streaming (manual refresh only)
- Agent execution wrapper
- Git integration
- SaaS/cloud mode
- Authentication
- Task editing UI
- WebSocket updates

**agent-scope is an observer, not an orchestrator.** It watches your workflow, it doesn't run it.

## 🗺️ Roadmap

### v0.2 (Planned)
- Incremental state updates
- File watching for auto-refresh
- Export reports (JSON, CSV)
- Performance optimizations

### v0.3 (Planned)
- Historical snapshots
- Time-series progress tracking
- Multiple project support
- Advanced search and filters

## 🐛 Known Issues

None reported yet! This is the initial release.

## 🙏 Acknowledgments

Built with ❤️ using:
- [TypeScript](https://www.typescriptlang.org/)
- [Fastify](https://www.fastify.io/)
- [Next.js](https://nextjs.org/)
- [Commander](https://github.com/tj/commander.js)
- [Vitest](https://vitest.dev/)

## 📄 License

MIT License - See [LICENSE](LICENSE) file for details

## 🔗 Links

- **npm Package:** https://www.npmjs.com/package/agent-scope
- **GitHub Repository:** https://github.com/yunusemrgrl/agent-scope
- **Issue Tracker:** https://github.com/yunusemrgrl/agent-scope/issues
- **Documentation:** [README.md](README.md)

## 💬 Feedback

We'd love to hear from you! Please:
- ⭐ Star the repository if you find it useful
- 🐛 Report bugs via GitHub Issues
- 💡 Suggest features via GitHub Discussions
- 🤝 Contribute via Pull Requests

---

**Full Changelog:** https://github.com/yunusemrgrl/agent-scope/commits/v0.1.0

Co-Authored-By: Claude Sonnet 4.5 <noreply@anthropic.com>
