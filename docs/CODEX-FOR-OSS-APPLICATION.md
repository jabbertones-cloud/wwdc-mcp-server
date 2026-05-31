# Codex for Open Source application brief

This file is a paste-ready application brief for OpenAI's Codex for Open Source program.

## Repository

https://github.com/jabbertones-cloud/wwdc-mcp-server

## Short description

`wwdc-mcp-server` is a local-first MCP server that indexes Apple's WWDC sessions, tutorials, Human Interface Guidelines, and Swift Evolution proposals. It gives Codex and other MCP-compatible coding agents searchable, source-grounded Apple platform context without paid APIs.

## Maintainer role

Primary maintainer and repository administrator. I maintain the MCP server, ingest pipeline, tests, documentation, release workflow, and issue/PR triage.

## Why this is open source infrastructure

Apple platform developers often need authoritative, current context from WWDC sessions, HIG pages, DocC tutorials, and Swift Evolution proposals. This project packages those sources into a reusable local MCP server so coding agents can answer Swift, SwiftUI, visionOS, macOS, and iOS implementation questions with better context and fewer hallucinations.

The server is intentionally local-first:

- SQLite + FTS5 for durable local indexing.
- Optional Ollama embeddings for semantic reranking.
- Stdio MCP transport by default, with no public network listener.
- No paid API dependency for baseline use.

## How Codex helps maintain this project

Codex is useful for:

- Reviewing PRs that change MCP tool contracts.
- Auditing ingest changes against Apple source structure drift.
- Maintaining TypeScript strictness and test coverage.
- Improving docs and examples for new MCP clients.
- Triage of issues from Apple platform developers.
- Release checks before publishing tags.

## API credit use case

If API credits are granted, they would support maintainer automation:

- PR review summaries for MCP tool and ingest changes.
- Release checklist generation and changelog review.
- Test failure triage for CI runs.
- Documentation quality checks against repository examples.

API credits would not be used to power a commercial hosted service.

## Codex Security fit

The repository is a good fit for security review because it:

- Fetches public web content during ingest.
- Parses and stores external data in SQLite.
- Exposes local MCP tools to agent clients.
- Needs continued validation that default stdio/local-only behavior remains safe.

Current security posture:

- Stdio transport by default.
- No user credentials stored or transmitted.
- No paid API keys required.
- `npm audit --audit-level=high` is part of CI.
- Search/session tools expose judgment metadata so agent clients can inspect confidence, caveats, and recommended follow-up tools instead of treating every hit as equally authoritative.
- Security reporting documented in `SECURITY.md`.

## Readiness checklist

- Public GitHub repository: yes.
- License file: MIT.
- README: yes.
- Contributing guide: yes.
- Security policy: yes.
- CI: build, smoke test, parse test, high-severity audit.
- MCP e2e coverage: all 15 tools plus filtered search, no-hit judgment, session response shaping, package smoke.
- Local verification:
  - `npm run build`
  - `npm test`
  - `npm audit --audit-level=high`

## Suggested application answer

I maintain `wwdc-mcp-server`, a local-first MCP server for Apple platform development. It indexes WWDC sessions, Apple tutorials, Human Interface Guidelines, and Swift Evolution proposals, then exposes them through 15 MCP tools for Codex and other MCP-compatible coding agents.

The project helps Swift, SwiftUI, iOS, macOS, and visionOS developers ground agent answers in authoritative Apple material while keeping retrieval local through SQLite FTS5 and optional Ollama embeddings. It does not require paid APIs for normal use.

I use Codex for maintainer workflows: PR review, issue triage, test failure analysis, release checks, and documentation updates. API credits would be used only for open-source maintainer automation around this repository, especially PR/release review and CI triage. Codex Security would help validate the local MCP boundary, public-web ingest code, and SQLite-backed tool surface.
