# WWDC MCP — current Apple developer knowledge for coding agents

<!-- mcp-name: wwdc -->

Ground **Codex, Claude, Cursor, VS Code, Windsurf, Zed, and other MCP clients** in Apple source material before they change your Swift code.

WWDC MCP indexes **WWDC20–WWDC26 sessions**, Apple Developer Documentation, tutorials, Human Interface Guidelines, Swift Evolution, The Swift Programming Language, and App Store Review Guidelines into a local SQLite search layer. It exposes **45 read-only MCP tools** for search, API history, deprecations, transcripts, source-grounded app audits, and trust metadata.

[![CI](https://github.com/jabbertones-cloud/wwdc-mcp-server/actions/workflows/ci.yml/badge.svg)](https://github.com/jabbertones-cloud/wwdc-mcp-server/actions/workflows/ci.yml)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)
[![Node](https://img.shields.io/badge/Node-%3E%3D22.14-339933?logo=node.js&logoColor=white)](package.json)

> **Unofficial community project.** Not affiliated with or endorsed by Apple. Apple content remains subject to Apple's terms and source-site availability.

## Why use it?

Coding agents are excellent at writing Swift, but Apple APIs, platform guidance, App Review rules, and WWDC recommendations change quickly. WWDC MCP gives an agent a source-grounded way to answer questions like:

- “What changed in SwiftUI at WWDC26, and which changes matter to this app?”
- “Audit this StoreKit subscription flow against current Apple guidance.”
- “When was this API introduced, is it deprecated, and what replaces it?”
- “Find the exact WWDC chapter that explains this App Intents behavior.”
- “Compare WWDC25 and WWDC26 coverage of Foundation Models.”
- “Check App Store Review Guideline 3.1.1 before I ship.”
- “Audit this macOS app for current SwiftUI, AppKit, concurrency, accessibility, and App Store guidance.”

The promoted entry point for repo-level Apple work is `swift_app_audit`. The promoted trust entry point is `wwdc_security_manifest`.

## What makes this different?

- **WWDC26-aware** — the default ingest range is 2020–2026 and can be extended with `--year`.
- **Source-grounded app audits** — `swift_app_audit` combines WWDC, HIG, tutorials, Swift Evolution, pathways, Apple doc hints, caveats, and validation steps.
- **API intelligence** — availability, deprecation, replacement, introduction history, and WWDC mentions.
- **Transcript-native** — search complete session transcripts, read them in chunks, and generate timestamped deep links.
- **Local-first** — SQLite + FTS5 works without a paid API; Ollama semantic reranking is optional.
- **Trust-aware** — conservative judgment metadata, a content-safety tripwire, and a security manifest help agents distinguish evidence from instructions.
- **Two transports** — stdio by default, plus authenticated stateless Streamable HTTP for remote/self-hosted use.
- **Read-only MCP surface** — the 45 tools retrieve and analyze source material; they do not mutate your Apple account or source repo.

## Quick start

### Requirements

- Node.js **22.14 or newer**
- npm
- Optional: [Ollama](https://ollama.com/) with `nomic-embed-text` for semantic reranking

### 1. Clone and build

```bash
git clone https://github.com/jabbertones-cloud/wwdc-mcp-server.git
cd wwdc-mcp-server
npm install
npm run build
```

### 2. Build a useful local index

For the full core corpus:

```bash
npm run ingest:all
```

For a faster WWDC26-first setup:

```bash
npm run ingest:wwdc -- --year 2026
npm run ingest:docs
npm run ingest:hig
npm run ingest:evolution
npm run ingest:appstore
```

`ingest:all` covers the **core** sources: WWDC, tutorials, pathways, HIG, Swift Evolution, Apple docs, Swift Book, and App Store Review Guidelines. Additional optional enrichment sources are documented below.

### 3. Add it to an MCP client

Generic stdio configuration:

```json
{
  "mcpServers": {
    "wwdc": {
      "command": "node",
      "args": ["/absolute/path/to/wwdc-mcp-server/dist/index.js"]
    }
  }
}
```

Then ask your agent:

> Use WWDC MCP to audit this app against current Apple guidance before changing code.

## Client setup

<details>
<summary><strong>Claude Desktop</strong></summary>

`~/Library/Application Support/Claude/claude_desktop_config.json`

```json
{
  "mcpServers": {
    "wwdc": {
      "command": "node",
      "args": ["/absolute/path/to/wwdc-mcp-server/dist/index.js"]
    }
  }
}
```

</details>

<details>
<summary><strong>Claude Code</strong></summary>

Use your normal MCP configuration flow and point the server command at:

```text
node /absolute/path/to/wwdc-mcp-server/dist/index.js
```

</details>

<details>
<summary><strong>VS Code</strong></summary>

`.vscode/mcp.json`:

```json
{
  "servers": {
    "wwdc": {
      "type": "stdio",
      "command": "node",
      "args": ["/absolute/path/to/wwdc-mcp-server/dist/index.js"]
    }
  }
}
```

</details>

<details>
<summary><strong>Cursor</strong></summary>

`~/.cursor/mcp.json`:

```json
{
  "mcpServers": {
    "wwdc": {
      "command": "node",
      "args": ["/absolute/path/to/wwdc-mcp-server/dist/index.js"]
    }
  }
}
```

</details>

<details>
<summary><strong>Windsurf</strong></summary>

`~/.codeium/windsurf/mcp_config.json`:

```json
{
  "mcpServers": {
    "wwdc": {
      "command": "node",
      "args": ["/absolute/path/to/wwdc-mcp-server/dist/index.js"]
    }
  }
}
```

</details>

<details>
<summary><strong>Zed</strong></summary>

`.zed/settings.json`:

```json
{
  "context_servers": {
    "wwdc": {
      "command": {
        "path": "node",
        "args": ["/absolute/path/to/wwdc-mcp-server/dist/index.js"]
      }
    }
  }
}
```

</details>

## Apple sources

The core index can include:

| Source | What you get |
| --- | --- |
| WWDC 2020–2026 | Sessions, descriptions, topics, platforms, speakers, transcripts, chapters, sample-code links, related docs |
| Apple Developer Documentation | Framework and symbol documentation from public DocC data |
| Apple tutorials | Public DocC tutorial content |
| Human Interface Guidelines | Platform design guidance |
| Swift Evolution | Proposal status, authors, versions, implementation links, and full proposal text |
| The Swift Programming Language | Swift language reference chapters |
| App Store Review Guidelines | Searchable guideline sections |
| Optional enrichment | Apple release notes, Swift Forums, Apple Developer Forums, generated summaries, cross-reference graph |

Most query tools read from the local SQLite index. `apple_doc_lookup` is intentionally a **live Apple Developer Documentation lookup** and therefore uses the network.

## 45 read-only MCP tools

### Search and discovery

- `wwdc_search`, `apple_search_all`
- `wwdc_list_years`, `wwdc_list_topics`, `wwdc_list_sessions`
- `wwdc_topics_by_year`, `wwdc_speaker_search`, `wwdc_what_changed`
- `wwdc_list_pathways`, `wwdc_get_pathway`

### Sessions, transcripts, and sample code

- `wwdc_get_session`, `wwdc_session_summary`, `wwdc_related_sessions`
- `wwdc_transcript_search`, `wwdc_session_transcript_full`
- `wwdc_session_deep_link`
- `wwdc_list_session_code`, `wwdc_sample_code_list`, `wwdc_sample_code_grep`

### Apple docs, HIG, Swift, and forums

- `apple_doc_lookup`, `apple_doc_get`, `apple_doc_list_framework`
- `apple_tutorial_get`
- `apple_hig_search`, `apple_hig_list`
- `apple_swift_book_get`
- `apple_swift_evolution_get`, `apple_swift_evolution_list`, `apple_swift_evolution_filter`
- `swift_forum_search`, `apple_forum_search`

### API and App Store intelligence

- `wwdc_find_api_introduction`, `wwdc_sessions_for_api`
- `apple_api_availability`, `apple_api_deprecation`, `apple_what_replaced`
- `apple_release_notes_search`
- `appstore_guidelines_search`, `appstore_guideline_get`

### Audit, graph, status, and trust

- `swift_app_audit`
- `apple_swift_pattern_find`, `apple_cross_references`
- `wwdc_ingest_status`, `wwdc_export_status`
- `wwdc_security_manifest`

The test suite asserts that both stdio and Streamable HTTP expose exactly 45 tools.

## Search example

`wwdc_search` supports year ranges, topics, platforms, transcript requirements, output detail, and conservative judgment metadata.

```json
{
  "query": "SwiftUI performance",
  "kinds": ["session"],
  "year_min": 2025,
  "year_max": 2026,
  "topics": ["SwiftUI"],
  "require_transcript": true,
  "judgment": true,
  "detail": "detailed"
}
```

Platform-only queries such as “macOS” intentionally receive conservative judgment. Better audit queries name a framework, API, feature, symptom, or goal.

## Ingest

### Core sources

```bash
npm run ingest:wwdc
npm run ingest:tutorials
npm run ingest:hig
npm run ingest:evolution
npm run ingest:docs
npm run ingest:swiftbook
npm run ingest:appstore
npm run ingest:all
```

Restrict WWDC years by repeating `--year`:

```bash
npm run ingest:wwdc -- --year 2025 --year 2026
```

### Optional enrichment

```bash
npm run ingest -- --source release-notes
npm run ingest -- --source swift-forums
npm run ingest -- --source apple-dev-forums
npm run ingest -- --source session-summaries --limit 50
npm run ingest -- --source cross-reference
npm run ingest -- --source deprecation-backfill
npm run ingest -- --source export-deprecation-qa
```

During WWDC week, re-run the WWDC ingest periodically to pick up newly published sessions.

## Optional semantic search with Ollama

FTS5 keyword search works without Ollama. For local semantic reranking:

```bash
ollama pull nomic-embed-text
```

Defaults:

| Variable | Default | Purpose |
| --- | --- | --- |
| `OLLAMA_BASE` | `http://127.0.0.1:11434` | Local Ollama endpoint |
| `OLLAMA_EMBED_MODEL` | `nomic-embed-text` | Embedding model |
| `WWDC_MCP_DATA_DIR` | OS app-data directory | Database/cache directory |
| `WWDC_MCP_DB` | `<data-dir>/wwdc.db` | SQLite database path |

## Remote Streamable HTTP

Stdio remains the default and simplest transport. The same 45-tool server can also run as an authenticated, stateless Streamable HTTP MCP:

```bash
export WWDC_MCP_BEARER_TOKEN="$(openssl rand -hex 32)"
export WWDC_MCP_HTTP_HOST=127.0.0.1
export WWDC_MCP_HTTP_PORT=8789
npm run start:http
```

Routes:

- `GET /healthz`
- `POST /mcp`

The MCP route fails closed with `503 auth_not_configured` if neither `WWDC_MCP_BEARER_TOKEN` nor `WWDC_MCP_BEARER_TOKEN_SHA256` is configured.

To mount the service behind a shared reverse proxy without path rewriting:

```bash
export WWDC_MCP_PATH_PREFIX=/wwdc
```

Routes become `/wwdc/healthz` and `/wwdc/mcp`.

The built-in HTTP server does **not** terminate TLS. If you expose it outside localhost, put it behind a TLS reverse proxy and treat the bearer token as a secret.

See [docs/DEPLOY.md](docs/DEPLOY.md) for the full runbook.

## Trust and security model

- All 45 MCP tools are read-only.
- Retrieved web text is treated as **untrusted evidence**, not executable instruction.
- Search responses can include `content_safety` metadata.
- `wwdc_security_manifest` reports the canonical tool surface, manifest hash, read-only posture, and prompt-injection handling.
- Remote HTTP requires bearer authentication and fails closed if auth is not configured.
- The default stdio server opens no network listener.
- Ingest fetches public Apple/Swift sources. `apple_doc_lookup` performs live public Apple documentation requests.
- No Apple Developer account credentials are required or stored.

For vulnerability reporting and deployment cautions, see [SECURITY.md](SECURITY.md).

## Tests and release proof

```bash
npm run build
npm test
npm audit --audit-level=high
```

`npm test` covers smoke tests, ingest parsing, security evaluation, stdio MCP E2E, search regression, package smoke, and Streamable HTTP MCP E2E.

The protocol tests verify the 45-tool catalog and exercise the trust manifest over both supported transports.

## Architecture

- **Runtime:** Node.js >=22.14, TypeScript
- **Default transport:** MCP stdio
- **Optional transport:** authenticated stateless Streamable HTTP
- **Storage:** SQLite + FTS5
- **Semantic reranking:** optional local Ollama embeddings
- **Response budget:** bounded tool responses, with compact envelopes for oversized JSON
- **Ingest:** public Apple/Swift sources with bounded concurrency, retries, and a stable User-Agent
- **Safety:** content-safety metadata, read-only tool contract, security manifest, fail-closed remote auth

## Public project docs

- [CHANGELOG.md](CHANGELOG.md) — implementation and release history
- [CONTRIBUTING.md](CONTRIBUTING.md) — contribution workflow
- [SECURITY.md](SECURITY.md) — security model and vulnerability reporting
- [docs/DEPLOY.md](docs/DEPLOY.md) — stdio and remote deployment
- [docs/SOURCE-OF-TRUTH.md](docs/SOURCE-OF-TRUTH.md) — repository truth and verification rules
- [docs/SKILL-WIRING.md](docs/SKILL-WIRING.md) — agent/skill integration guidance
- [docs/APPLE-ENDPOINTS.md](docs/APPLE-ENDPOINTS.md) — ingest-maintainer notes

## Contributing

Issues and PRs are welcome. If you change the MCP tool surface, ingest behavior, transport behavior, or public claims, update the matching tests and docs in the same change.

See [CONTRIBUTING.md](CONTRIBUTING.md).

## License

MIT
