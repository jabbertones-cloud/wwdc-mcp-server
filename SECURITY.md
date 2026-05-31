# Security Policy

## Supported versions

| Version | Supported |
|---------|-----------|
| 0.1.x   | Yes       |

## Reporting a vulnerability

**Do not open a public GitHub issue for security vulnerabilities.**

Email: security@openclaw.dev (or open a [GitHub private security advisory](https://github.com/jabbertones-cloud/wwdc-mcp-server/security/advisories/new)).

Include:
- Description of the vulnerability
- Steps to reproduce
- Potential impact
- Suggested fix (if any)

You will receive a response within 72 hours. We aim to publish a fix within 14 days of confirmed vulnerabilities.

## Scope

This server runs **locally only** by default. It binds to `stdio` transport (MCP standard) with no network listener exposed by default. The HTTP transport is opt-in and should only be used on trusted networks.

Ingest fetches data from public Apple developer URLs and optionally Ollama (localhost). No user credentials are stored or transmitted.
