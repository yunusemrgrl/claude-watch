# Human Plan — claudedash Roadmap (2026-02-26)

**Status:** Active | **Last reviewed:** 2026-02-26
**AI decision doc:** @docs/ai/decision.md
**AI workflow:** @.claudedash/workflow.md
**Task queue:** @.claudedash/queue.md

---

## Active Pivot — Slice S26: Control Plane Shift

Triggered by: @docs/feedback1.md + @docs/feedback2.md

### S26-T1 — API-first startup (UI optional)
**Priority:** Critical  
**Why:** "Ayrı dashboard" odaklı kullanım, agent yürütmeyi yönetmek yerine izlemeye kayıyor.  
**What AI does:** `claudedash start` artık control plane API'yi başlatır; web UI `--open` ile opsiyonel açılır.

### S26-T2 — Source adapter boundary
**Priority:** High  
**Why:** Tek sağlayıcı dosya formatına sıkı bağlılık kırılganlık yaratıyor.  
**What AI does:** `--source` girişi ve `src/platform/source.ts` ile adapter sınırı tanımlanır (ilk sağlayıcı: `claude-code`).

### S26-T3 — Mutating endpoint hardening
**Priority:** High  
**Why:** `/hook`, `/log`, `/plan/task`, `/agent/*` gibi yazan endpoint'ler abuse riskine açık.  
**What AI does:** Bu endpoint'lere route-level rate limit eklenir.

### S26-T4 — Positioning rewrite
**Priority:** High  
**Why:** Ürün algısı "dashboard toy" olmaktan çıkıp "agent control plane" olarak netleşmeli.  
**What AI does:** README + CLI metinleri control plane diline çekilir; recovery + quality + safety öne alınır.

### S26-T5 — Token auth UX completion
**Priority:** Critical  
**Why:** `--token` ile korunan sunucuda web UI kullanılabilir olmalı.  
**What AI does:** `/auth/login` + `HttpOnly` cookie akışı, UI login ekranı.

### S26-T6 — MCP secured-server access
**Priority:** High  
**Why:** MCP proxy, token korumalı claudedash sunucularına bağlanabilmeli.  
**What AI does:** `claudedash mcp --token` seçeneği ve Authorization header forwarding.

---

## What's Done (Slices S11–S19)

All slices through S19 are complete per `execution.log`:
- S11: MCP status, MCP server, hooks, burn rate widget, CLAUDE.md editor, context endpoint
- S12: Keyboard shortcuts, task creation UI, doctor command
- S13: MCP tools (cost, history, hook events, agent lifecycle, create_task)
- S14: Bug fixes (todayCostUSD label, context health calc, get_current_session, /history pagination)
- S15: React doctor fixes (dead code, array keys, AbortController, a11y)
- S16: Claude worktree native support
- S17: Landing CSS fix, activity.gif, README rewrite, CI versioning
- S18: README screenshot grid
- S19: Zustand + Jotai state refactor (in queue, critical path)

---

## What's Next — Slice S20: Security + UX Hardening

Triggered by: @docs/feedback.md (two external reviews)

### S20-T1 — Remove queryToken, Bearer-only auth
**Priority:** Critical
**Why:** Query-string tokens appear in access logs, browser history, proxy logs. Security risk even on LAN.
**What AI does:** Remove `queryToken` support from auth middleware. All tokens must be `Authorization: Bearer`. Update docs.
**Your action after:** None — review the PR.

### S20-T2 — Force token when --host is non-localhost
**Priority:** Critical
**Why:** Users who expose claudedash on `0.0.0.0` without a token leave an unauthenticated endpoint that can run git commands.
**What AI does:** Server startup validates: if host is not `127.0.0.1`/`localhost`, token must be provided via `--token` or env var. Fails with clear error otherwise.
**Your action after:** Test with `claudedash start --host 0.0.0.0` — should refuse without `--token`.

### S20-T3 — Tail-read for /sessions/:id/context
**Priority:** Critical
**Why:** Current code reads entire JSONL (can be 50MB+) to get last 500 lines. This causes memory spikes and UI lag on large sessions.
**What AI does:** Implement `tailRead(path, lines)` utility, replace full-read in context endpoint.
**Your action after:** Test with a large session file. Endpoint should respond in <200ms.

### S20-T4 — Auto-commit opt-in
**Priority:** High
**Why:** Silent `git add -A && git commit` in PreCompact hook surprises users mid-rebase or with staged secrets.
**What AI does:**
- `autoCommit` defaults to `false` in `.claudedash/config.json`.
- CLI: `claudedash start --auto-commit` enables it.
- Hook template updated to check config and warn when disabled.
- Dashboard: "Auto-commit: ON/OFF" badge in hook status area.
**Your action after:** Run `claudedash hooks install --all` to regenerate hook templates. Verify old hooks warn on next PreCompact.

### S20-T5 — init --minimal + --template flag
**Priority:** Medium
**Why:** `claudedash init` generates opinionated templates; some users want blank files.
**What AI does:** Add `--minimal` flag (empty queue.md/workflow.md) and `--template minimal|default|team`.
**Your action after:** Test `claudedash init --minimal` in a fresh dir.

### S20-T6 — docs/compatibility.md
**Priority:** High
**Why:** claudedash reads Claude Code's file formats (JSONL schema, paths). This is undocumented — a Claude Code update can silently break everything.
**What AI does:** Create `docs/compatibility.md` declaring exact assumptions (Claude Code version range, file paths, JSONL field names relied upon).
**Your action after:** Review doc for accuracy. Update when Claude Code ships format changes.

### S20-T7 — README positioning update
**Priority:** High
**Why:** Feature list is too long; core value is buried. No "who is this for / not for" section.
**What AI does:**
- Add "Who is this for / Not for" section at top.
- Promote single headline: "Stuck detection + context overflow early warning".
- Demote secondary features to "Advanced" section.
**Your action after:** Review README on GitHub. Check that it renders correctly.

### S20-T8 — SECURITY.md threat model
**Priority:** High
**Why:** SECURITY.md currently only covers disclosure policy. Network exposure risks are undocumented.
**What AI does:** Add a "Threat Model" section: what's safe (localhost-only), what's risky (0.0.0.0 without token), what's dangerous (/hook endpoint), recommended hardening checklist.
**Your action after:** Review and approve before publishing.

---

## Future — Slice S21: live.ts Decomposition

**Do not start until S19 is confirmed stable in production.**

S21 will split `live.ts` into:
1. `SseHub` — EventSource lifecycle, client set, broadcast, ping
2. `SessionService` — sessions cache, filters, meta enrichment
3. `HookService` — ring buffer + PreCompact/PostCompact actions

This is a high-risk refactor. It requires dedicated integration tests and a rollback plan.

**Human gate:** You must explicitly approve S21 start after S19 validation.

---

## Platform Adapter Strategy

claudedash currently couples directly to Claude Code file formats. The mitigation is:
1. `docs/compatibility.md` declares the contract (S20-T6).
2. If/when Claude Code changes formats, we add a thin adapter shim before reading files.
3. Future: expose a `--source` driver flag (`claude-code|cursor|codex`) to support other agents.

No adapter code is being built pre-emptively — document first, build when needed.

---

## Decisions Made

| Decision | Chosen | Rejected |
|----------|--------|---------|
| queryToken | Removed (security) | Deprecate then remove (delay = sustained risk) |
| Auto-commit default | OFF (opt-in) | Keep ON with warning |
| init templates | --minimal + --template flag | Single opinionated template |
| Platform adapter | Doc contract first | Build adapter layer now |
| live.ts refactor | Slice S21, after S19 | Inline with S20 (too risky) |

---

## Human Actions Required Right Now

1. **Add S20 tasks to queue.md** — The AI cannot modify queue.md. Paste the tasks from this plan into `.claudedash/queue.md` as a new Slice S20.
2. **Confirm S19 status** — Is S19 (Zustand migration) complete and stable? If yes, S21 can be queued. If no, hold.
3. **Review security decisions** — Specifically: is immediate queryToken removal acceptable, or do you want a deprecation notice first?
4. **Fix repo typo** — GitHub repo topics has "antrophic" (should be "anthropic"). Fix manually via GitHub UI → Settings → Topics.

---

*Synchronized with @docs/ai/decision.md | Updated: 2026-02-26*
