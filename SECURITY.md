# Security Policy

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
