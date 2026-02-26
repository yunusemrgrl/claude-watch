# AI Decision Document — Feedback Processing

**Date:** 2026-02-26
**Session:** CEO+CTO feedback integration
**Source:** @docs/feedback.md (two independent reviews)

---

## 1. Current Situation Summary

claudedash has completed Slices S11–S19 (all DONE per execution.log). The product is feature-rich but has received two critical reviews exposing the following gaps:

### Positioning Gap
- Too many features presented at equal weight → no clear single-sentence pitch.
- README lacks "who this is for / not for" clarity.
- Core value (stuck detection + context overflow warning) is buried under feature list noise.

### Security Gaps (P0)
- Query-string token (`?token=...`) exists — leaks to logs, browser history, proxy.
- `--host 0.0.0.0` does not force-require token → open door when forgotten.
- `/hook` endpoint runs `git add -A && git commit` via `execFileSync` — dangerous if network-exposed.
- CORS allows localhost but token auth is optional by default.

### Architecture Gaps (P1)
- `live.ts` is a God file: SSE, sessions cache, dismissed persistence, JSONL context, hook ring buffer, git commit, snapshot, plan state all in one file.
- `/sessions/:id/context` reads full JSONL then slices last 500 lines (expensive on large files).
- `readFileSync/readdirSync` throughout routes — blocks on Windows + large repos.

### UX / Behavior Gaps (P1)
- PreCompact hook does `git add -A && git commit` silently — users with wrong repo or mismatched commit format get surprised. Should be opt-in.
- `claudedash init` generates opinionated templates with no `--minimal` or `--template` selector.

### Platform Risk (P2)
- Deep coupling to Claude Code file paths/formats (`.claude/todos/`, JSONL schema). No adapter layer, no compatibility declaration. A Claude Code format change silently breaks everything.

---

## 2. AI Understanding of Requirements and Constraints

### Hard Constraints
- `CLAUDE.md` pre-commit checklist must pass before any commit (lint → tsc → dashboard tsc → build).
- No new files unless absolutely necessary.
- No manual `npm publish` — CI handles it.
- queue.md is read-only for the agent; tasks are added by the human.

### Requirements from Feedback
The feedback translates into **two categories** of work:

**Category A — Non-breaking improvements** (can be shipped immediately):
1. Security hardening in server auth middleware.
2. Tail-read implementation for `/sessions/:id/context`.
3. Auto-commit opt-in flag + config allowlist.
4. README positioning and "Who is this for" section.
5. Docs: threat model / compatibility declaration.

**Category B — Architectural refactoring** (higher risk, needs careful sequencing):
1. `live.ts` decomposition into SseHub / SessionService / HookService.
2. Adapter/driver layer for Claude Code file format coupling.
3. `claudedash init --minimal` / `--template` support.

### Priority Ordering
```
P0: Security hardening (blocks public sharing / team use safety)
P0: Tail-read for context endpoint (correctness + perf)
P1: Auto-commit opt-in (UX trust)
P1: live.ts decomposition (maintainability, reduces bug surface)
P2: Positioning / README (growth)
P2: Platform adapter declaration (long-term robustness)
P3: init templates (DX polish)
```

---

## 3. Detailed Decision Rationale

### Decision 1: Security — Remove query token, enforce token when non-localhost

**Rationale:** Query string tokens appear in:
- Server access logs (nginx, caddy, etc.)
- Browser history
- Referrer headers
- Reverse proxy logs

This is unacceptable even for a local tool that can be shared. The risk is low-effort to eliminate.

**Decision:** Remove `queryToken` support entirely. All token validation moves to `Authorization: Bearer` header only. When `--host` is not `127.0.0.1`/`localhost`, token becomes mandatory (server refuses to start without `--token`).

### Decision 2: Tail-read for context endpoint

**Rationale:** Current pattern reads entire JSONL (can be 50MB+) to grab last 500 lines. A simple seek-from-end approach (`fs.statSync` → allocate buffer → `fs.read` from offset) is O(buffer) not O(file).

**Decision:** Implement `tailRead(path, lines)` utility in `src/utils/` and replace the full-read pattern in `/sessions/:id/context`.

### Decision 3: Auto-commit as opt-in

**Rationale:** Silent `git add -A` in a PreCompact hook is a correctness trap:
- User may be mid-rebase
- User may have staged partial work
- User may have secrets in unstaged files

Making it opt-in (`--auto-commit` CLI flag + `autoCommit: boolean` in `.claudedash/config.json`) eliminates surprise while keeping the feature.

**Decision:** `autoCommit` defaults to `false`. Hook template prints a warning when triggered without opt-in. Dashboard shows "Auto-commit: OFF" badge when enabled.

### Decision 4: live.ts decomposition — deferred to S20

**Rationale:** live.ts decomposition is high-risk (SSE state is global) and requires careful sequencing similar to S19 (Zustand migration). Doing it without a migration plan risks breaking real-time features. It should be a dedicated slice with its own test coverage.

**Decision:** Create Slice S20 for live.ts refactoring. It will not be executed until S19 is complete and stable.

### Decision 5: Platform adapter declaration

**Rationale:** Adding a full adapter layer is scope-expansive. The minimum viable mitigation is a `docs/compatibility.md` that states exactly which Claude Code version, file paths, and JSONL schema claudedash depends on. This gives users and contributors a clear contract.

**Decision:** Create `docs/compatibility.md` as a static declaration doc. If Claude Code changes formats, we update this doc and ship an adapter shim — but the shim is not built pre-emptively.

---

## 4. Proposed AI Execution Flow

```
Phase 1 — Security (P0, unblocked)
  S20-T1: Remove queryToken, enforce Bearer-only auth
  S20-T2: Make --host non-localhost require --token
  S20-T3: Tail-read utility + /sessions/:id/context migration

Phase 2 — UX Trust (P1)
  S20-T4: Auto-commit opt-in (config + hook template + dashboard badge)
  S20-T5: claudedash init --minimal + --template flag

Phase 3 — Documentation (P2, can run in parallel with Phase 2)
  S20-T6: docs/compatibility.md (Claude Code version + path/schema assumptions)
  S20-T7: README "Who is this for / Not for" + single-headline value prop
  S20-T8: SECURITY.md threat model section (network exposure risks)

Phase 4 — Architecture (P1, depends on S19 completion)
  S21-T1: live.ts → SseHub module
  S21-T2: live.ts → SessionService module
  S21-T3: live.ts → HookService module
  S21-T4: Integration tests for decomposed services
```

**Execution rule:** Each task follows the standard 5-phase workflow (INTAKE → EXECUTE → VERIFY → LOG → NEXT). Pre-commit checklist is mandatory before every LOG.

---

## 5. Risks, Dependencies, Open Questions

### Risks
| Risk | Likelihood | Impact | Mitigation |
|------|-----------|--------|------------|
| Removing queryToken breaks existing users | Medium | Medium | Add deprecation note in changelog; Bearer header is easy to set |
| Tail-read utility edge case (file < N lines) | Low | Low | Guard: if file small, fall back to full read |
| Auto-commit opt-in breaks existing hook installations | High | Medium | Hook install regenerates template; existing hooks warn user to re-run `hooks install` |
| live.ts decomposition breaks SSE during refactor | Medium | High | Feature-flag old path; run both in parallel for 1 release |

### Dependencies
- S20 (security + UX) has no blockers — can start immediately.
- S21 (architecture) should not start until S19-T14 is DONE (Zustand migration complete).
- `docs/compatibility.md` can be written any time — no code dependency.

### Open Questions
1. **queryToken removal**: Should we add a one-version deprecation warning before hard removal, or remove immediately? Recommendation: remove immediately since it's a security issue, not a UX issue.
2. **Auto-commit config location**: `.claudedash/config.json` (per-project) or CLI flag only? Recommendation: both — CLI flag overrides config.
3. **init templates**: What are the 3 template presets? Recommendation: `minimal` (empty files only), `default` (current behavior), `team` (with area enum + git conventions).

---

## 6. Clear Next Actions for AI

When executing tasks from queue.md:

1. **Start with S20-T1** (queryToken removal) — smallest blast radius, highest security value.
2. **S20-T3** (tail-read) is self-contained and can be done in parallel or immediately after T1.
3. **S20-T4** (auto-commit opt-in) requires modifying hook templates — test that `hooks install` regenerates cleanly.
4. **S20-T6/T7/T8** (docs) — write these any time; no build verification required.
5. **S21** — do NOT start until human confirms S19 is stable in production.

### Pre-execution checklist reminder
```bash
npm run lint
npx tsc --noEmit
cd dashboard && npx tsc --noEmit && cd ..
npm run build
```
All must pass with 0 errors before any commit.

---

*Last updated: 2026-02-26 | Source: @docs/feedback.md*
