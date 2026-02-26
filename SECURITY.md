# Security Policy

## Threat Model

claudedash is a **local developer tool**. It runs on your machine, reads your `~/.claude/` files, and exposes a local HTTP server. Understanding the threat model helps you use it safely.

### Safe: Localhost-only (default)

```bash
claudedash start  # binds to 127.0.0.1 only
```

Default configuration binds to `127.0.0.1`. Only processes on your local machine can connect. No token needed — the network is your protection.

**Risk:** Low. Only local processes can reach the server.

### Risky: Network-exposed without a token

```bash
claudedash start --host 0.0.0.0  # ❌ refused — token required
```

**As of v1.1.30+, claudedash refuses to start with `--host 0.0.0.0` (or any non-loopback address) unless `--token` is provided.**

If this check were bypassed, anyone on your network could:
- Read all your Claude session data and tool call history
- Read your cost/billing information
- POST to `/hook` which runs `git` commands in your working directory
- POST to `/log` which writes to your `execution.log`

**Risk:** High if no token. The `/hook` endpoint is particularly dangerous as it can trigger `git add -A && git commit` (when `autoCommit` is enabled in config).

### Built-in Abuse Controls

claudedash includes global request limiting and additional stricter limits on mutating routes:
- `/hook`: 30 req/min
- `/plan/task`: 30 req/min
- `/plan/task/:taskId`: 60 req/min
- `/log`: 120 req/min
- `/agent/register`: 30 req/min
- `/agent/heartbeat`: 240 req/min
- `/claudemd`: 30 req/min
- `DELETE /snapshots/:hash`: 20 req/min

These controls reduce accidental loops and scripted abuse on exposed instances.

### Recommended: Token + tunnel for team sharing

```bash
# Generate a strong random token
claudedash start --token $(openssl rand -hex 16)

# Use a tunnel — never expose raw --host 0.0.0.0 to the internet
ngrok http 4317
```

Token is validated via `Authorization: Bearer <token>` header only. Query-string tokens (`?token=`) are **not supported** — they appear in server logs, browser history, and proxy access logs.
For web UI login, claudedash can issue a short-lived `HttpOnly` auth cookie after a successful `POST /auth/login`.

### Hardening Checklist for LAN / Team Use

- [ ] Always use `--token` when `--host` is not localhost
- [ ] Use a reverse proxy (nginx, caddy) with HTTPS for internet-facing deployments
- [ ] Rotate token regularly (`openssl rand -hex 16`)
- [ ] Keep `autoCommit` disabled (default) unless you understand the implications
- [ ] Do not expose port 4317 directly to the internet — use a tunnel or VPN

### API Endpoints and Their Risk Level

| Endpoint | Risk | Notes |
|----------|------|-------|
| `GET /sessions`, `GET /cost`, etc. | Read-only | Leaks session/cost data if exposed |
| `POST /hook` | **Critical** | Can run git commands when `autoCommit: true` |
| `POST /log` | Medium | Writes to `execution.log` |
| `POST /plan/task` | Medium | Appends new task blocks to `queue.md` |
| `PUT /claudemd` | **High** | Writes to `CLAUDE.md` files |
| `DELETE /snapshots/:hash` | Low | Deletes a snapshot file |

→ See [docs/compatibility.md](docs/compatibility.md) for full file access list.

---

## Supported Versions

| Version | Supported |
| ------- | --------- |
| 1.1.x   | ✅        |
| < 1.1   | ❌        |

## Reporting a Vulnerability

Please **do not** open a public GitHub issue for security vulnerabilities.

Report vulnerabilities by e-mail to **yunusemregurlu@gmail.com** with the subject line:
`[claudedash] Security Vulnerability Report`

Include the following in your report:
- Description of the vulnerability and its potential impact
- Steps to reproduce (proof of concept if possible)
- Affected version(s)
- Any suggested remediation

You will receive an acknowledgement within **72 hours**. We aim to release a patch within **14 days** of confirmed vulnerabilities.

## Scope

### In Scope
- Server-side request handling (`src/server/`)
- CLI argument parsing (`src/cli.ts`)
- File system access patterns
- Dependency vulnerabilities

### Out of Scope
- Vulnerabilities in development/test tooling (vitest, TypeScript compiler)
- Social engineering attacks
- Attacks requiring physical access to the machine

## Disclosure Policy

We follow a **coordinated disclosure** process. We ask that you give us reasonable time to patch before public disclosure. We will credit reporters in release notes unless anonymity is requested.
