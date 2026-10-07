# Codex for Open Source application brief

Updated: 2026-10-07

This is a paste-ready public-project brief for an OpenAI open-source program application. Keep any program-specific status or credit amount out of the repository unless it is confirmed.

## Repository

`jabbertones-cloud/wwdc-mcp-server`

## Short description

`wwdc-mcp-server` is a local-first Model Context Protocol server that gives coding agents searchable, source-grounded Apple developer context from WWDC sessions, Apple Developer Documentation, tutorials, Human Interface Guidelines, Swift Evolution, The Swift Programming Language, and App Store Review Guidelines.

It currently exposes 45 read-only tools for Apple-platform search, transcripts, API history, availability/deprecation checks, App Review guidance, source-grounded Swift app audits, and trust metadata.

## Why this is open-source infrastructure

Apple-platform developers regularly need current information about Swift, SwiftUI, UIKit, AppKit, StoreKit, App Intents, Apple Intelligence, platform UX, API availability, deprecations, and App Review rules.

Generic model memory can be stale or incomplete. This project gives coding agents a reusable Apple-source retrieval layer that can:

- search WWDC20–WWDC26 sessions and transcripts
- retrieve timestamped session deep links
- search indexed Apple docs, tutorials, HIG, Swift Evolution, and Swift language reference material
- check API introduction, availability, deprecation, and replacement evidence
- search App Store Review Guidelines
- build source-grounded `swift_app_audit` context before code changes
- report confidence/caveats and trust metadata rather than treating every hit equally

## Architecture

The server is intentionally local-first:

- SQLite + FTS5 for durable local indexing
- optional local Ollama embeddings for semantic reranking
- MCP stdio by default
- optional authenticated stateless Streamable HTTP for self-hosted/remote use
- no paid API dependency for baseline retrieval
- read-only MCP tool surface
- content-safety metadata for untrusted retrieved text

The project does not require Apple Developer account credentials for its public-source retrieval workflow.

## How Codex helps maintain the project

Codex is useful for:

- reviewing changes to MCP tool contracts
- tracing parser failures when Apple changes public source layouts
- improving TypeScript strictness and test coverage
- analyzing search regressions
- maintaining client setup examples
- triaging issues and PRs
- reviewing changelog/release metadata
- checking that README claims match executable tests
- turning real Apple-platform implementation questions into better retrieval/evaluation cases

## Security fit

The repository is useful for security-oriented review because it:

- fetches and parses untrusted public web content
- stores external material in SQLite
- exposes that material to AI agents through MCP
- supports an optional authenticated HTTP transport
- needs durable guarantees that retrieved text remains evidence rather than executable instruction

Current controls include:

- stdio default with no network listener
- fail-closed bearer authentication for remote MCP requests
- bounded request bodies
- a read-only 45-tool surface
- `wwdc_security_manifest` for tool-surface and trust metadata
- content-safety scanning/evaluation
- deterministic stdio and HTTP E2E tests
- dependency audit in CI

## Current project readiness

- Public GitHub repository: yes
- MIT license: yes
- README: current
- Contribution guide: current
- Security policy: current
- 45-tool stdio E2E: yes
- authenticated Streamable HTTP E2E: yes
- package dry-run test: yes
- npm package published: **not yet**
- official MCP Registry entry: **not yet; intentionally blocked on npm publication**

## Local verification

```bash
npm ci
npm run build
npm test
npm audit --audit-level=high
```

## Suggested application answer

I maintain `wwdc-mcp-server`, an MIT-licensed, local-first MCP server for Apple-platform development. It turns public Apple and Swift source material — including WWDC sessions, Apple Developer Documentation, Human Interface Guidelines, Swift Evolution, the Swift language reference, and App Store Review Guidelines — into 45 read-only tools that Codex and other coding agents can query before changing Swift code.

The project focuses on source grounding and verification rather than generic summarization. It supports transcript search and timestamped WWDC deep links, API introduction/availability/deprecation research, App Review guidance, and a `swift_app_audit` workflow that gathers relevant Apple evidence and validation steps before implementation. SQLite FTS5 works without a paid API, while local Ollama embeddings are optional.

I use Codex for open-source maintenance tasks such as parser-drift diagnosis, PR review, test failure analysis, search regression work, release checks, and documentation consistency. The repository also has explicit trust controls for agent use: a read-only tool surface, content-safety handling for retrieved text, a security manifest, deterministic protocol tests, and fail-closed authentication for the optional Streamable HTTP transport.
