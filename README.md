# wwdc-mcp-server

<!-- mcp-name: wwdc -->

Local-first MCP server that indexes Apple's WWDC sessions, tutorials, Human Interface Guidelines, and Swift Evolution proposals — with hybrid keyword + semantic search powered by **Ollama** running locally (no paid APIs).

Works with **OpenAI Codex**, **Claude**, **Cursor**, **Windsurf**, **Zed**, or any MCP-compatible client. No paid APIs required — all retrieval runs locally via Ollama.

[![CI](https://github.com/jabbertones-cloud/wwdc-mcp-server/actions/workflows/ci.yml/badge.svg)](https://github.com/jabbertones-cloud/wwdc-mcp-server/actions/workflows/ci.yml)

## Features

- **WWDC sessions** (2020–2025+) — title, description, topics, platforms, speakers, transcript excerpts, sample-code links, related docs, chapter deep-links.
- **Apple tutorials** — full DocC JSON walk starting from SwiftUI, visionOS, SwiftData, Develop in Swift, and more.
- **Human Interface Guidelines** — iOS, macOS, watchOS, visionOS, tvOS components and patterns.
- **Swift Evolution** — every proposal pulled from the apple/swift-evolution GitHub repo with status, authors, and full body.
- **Pathways** — curated + auto-derived learning tracks, including SwiftUI Fundamentals, Ship with Swift 6, Build with Apple Intelligence, visionOS Essentials, and app archetypes such as macOS display tools, Finder-style navigation, window switchers, ScreenCaptureKit capture tools, GameKit/StoreKit games, camera export, audio/push, and App Intents.
- **Hybrid search** — SQLite FTS5 (porter stemmer) keyword match + Ollama `nomic-embed-text` semantic reranking.
- **Deep links** — generate `?time=SECONDS` URLs that jump straight to a session chapter.
- **Sample-code grep** — filter every indexed zip/repo URL by substring or regex.
- **Judgment metadata** — search/session responses can include confidence, evidence basis, caveats, and suggested next MCP tools.

## Recent updates and upgrades

Current unreleased work strengthens the existing 45-tool WWDC/Apple source foundation:

- **Better platform search** — broad queries like `macOS`, `iOS`, or `visionOS` now search session platform metadata instead of relying only on FTS text matches.
- **More useful search judgment** — search results include confidence, answer readiness, caveats, evidence basis, and suggested next tools so agents know when context is strong enough.
- **Empty-index guidance** — low-confidence searches now point to exact ingest commands instead of silently returning weak answers.
- **Improved WWDC 2025 parsing** — transcript extraction skips Apple video UI chrome, and chapter parsing supports newer `jump-to-time` anchors plus supplemental chapter list items.
- **Expanded session response controls** — callers can cap transcript length and toggle chapters, sample code, related docs, and session judgment metadata.
- **Package and public repo polish** — `npx wwdc-mcp-server` quickstart, repository/homepage/bugs metadata, Node 20+ baseline, and package smoke coverage.
- **Swift app audit bundle** — `swift_app_audit` builds source-grounded Apple-platform audit context before code changes, including source coverage, direct Apple doc hints, archetype pathways, validation checklists, and weak-hit diagnostics.
- **Indexed Apple documentation** — `npm run ingest:docs` crawls public DocC JSON for Swift and Apple-platform frameworks into local FTS.
- **Pattern finding** — `apple_swift_pattern_find` groups repeated signals across WWDC, docs, tutorials, HIG, and Swift Evolution.
- **Security manifest** — `wwdc_security_manifest` returns the canonical tool list, manifest hash, read-only posture, and prompt-injection handling notes.
- **Content safety tripwire** — search JSON includes `content_safety` so agents treat retrieved text as evidence, not instruction.
- **Stronger tests** — parser tests cover new WWDC formats and MCP e2e covers the canonical 45-tool surface.

## 45 MCP tools

| Tool | Purpose |
|------|---------|
| `wwdc_search` | Hybrid search across sessions/docs/tutorials/hig/evolution |
| `wwdc_list_years` | WWDC years in the index with session counts |
| `wwdc_list_topics` | Top topics (SwiftUI, Swift, AI, visionOS…) |
| `wwdc_list_pathways` | Curated + auto-derived learning tracks |
| `wwdc_get_pathway` | A pathway with its ordered steps |
| `wwdc_get_session` | Full session record (incl. transcript) |
| `wwdc_session_deep_link` | URL with `?time=SECONDS` |
| `wwdc_list_session_code` | All sample-code URLs for a session |
| `wwdc_sample_code_grep` | Filter every indexed sample-code URL |
| `apple_doc_lookup` | Live Apple `/documentation` JSON lookup |
| `apple_doc_get` | Return indexed Apple documentation from the local DB |
| `apple_tutorial_get` | Return a tutorial (from local index) |
| `apple_hig_search` | HIG keyword search |
| `apple_swift_evolution_get` | Proposal by id (SE-0428) |
| `apple_swift_evolution_list` | List proposals, optional status filter |
| `apple_swift_pattern_find` | Find repeated Apple/Swift patterns across indexed sources |
| `swift_app_audit` | Audit bundle for Swift/SwiftUI/macOS/iOS app work using WWDC, HIG, tutorials, and Swift Evolution |
| `apple_swift_book_get` | Retrieve a chapter from The Swift Programming Language |
| `appstore_guidelines_search` | Search App Store Review Guidelines |
| `wwdc_find_api_introduction` | Find when an Apple API first appeared in WWDC coverage |
| `wwdc_what_changed` | Compare topic coverage between two WWDC years |
| `wwdc_related_sessions` | Find sessions related to a known session |
| `apple_hig_list` | Browse HIG entries by category or keyword |
| `apple_swift_evolution_filter` | Filter Swift Evolution proposals by version, status, author, or keyword |
| `wwdc_session_transcript_full` | Read complete transcripts in chunks |
| `wwdc_topics_by_year` | Show topic trends by WWDC year |
| `wwdc_sample_code_list` | Browse all indexed sample-code projects |
| `wwdc_list_sessions` | List sessions for a year with optional filters |
| `wwdc_speaker_search` | Find sessions by speaker |
| `wwdc_transcript_search` | Search inside session transcripts |
| `apple_doc_list_framework` | Browse indexed Apple docs by framework/module |
| `appstore_guideline_get` | Retrieve one App Store Review Guideline section |
| `wwdc_ingest_status` | Per-source last-run metadata + what's new |
| `apple_api_deprecation` | Check deprecation status for indexed Apple APIs |
| `apple_api_availability` | Check minimum OS availability for indexed Apple APIs |
| `apple_release_notes_search` | Search indexed Apple release notes |
| `apple_what_replaced` | Find replacements for deprecated Apple APIs |
| `apple_search_all` | Federated search across indexed Apple content |
| `wwdc_sessions_for_api` | Find WWDC sessions mentioning a specific API |
| `swift_forum_search` | Search indexed Swift Forums posts |
| `apple_forum_search` | Search indexed Apple Developer Forums posts |
| `wwdc_session_summary` | Retrieve generated structured session summaries |
| `apple_cross_references` | Inspect cross-reference graph edges |
| `wwdc_export_status` | Report indexed table counts |
| `wwdc_security_manifest` | Verify canonical tool surface, read-only posture, and prompt-injection controls |

## Search parameters

`wwdc_search` supports focused retrieval for agent workflows:

| Parameter | Purpose |
|-----------|---------|
| `kinds` | Limit search to `session`, `tutorial`, `hig`, and/or `evolution` |
| `year` | Restrict sessions to one WWDC year |
| `year_min`, `year_max` | Restrict sessions to a year range |
| `topics` | Require session topics/status text to include each value |
| `platforms` | Require session platforms to include each value |
| `require_transcript` | Return only sessions with transcript text |
| `judgment` | Include confidence, caveats, and suggested next tools |
| `detail` | `compact`, `standard`, or `detailed` markdown output |

Judgment metadata is intentionally conservative. Platform-only searches like `macOS` or `iOS` are marked as broad, even when many results match, because app audits need a framework, API, symptom, or feature term. If the local index is empty, search judgment points directly to ingest commands instead of returning silent low-confidence misses.

Example:

```json
{
  "query": "SwiftUI navigation",
  "kinds": ["session"],
  "year_min": 2024,
  "topics": ["SwiftUI"],
  "platforms": ["visionOS"],
  "require_transcript": true,
  "detail": "detailed"
}
```

`wwdc_get_session` also supports response shaping:

| Parameter | Purpose |
|-----------|---------|
| `include_transcript` | Include or omit transcript text |
| `transcript_chars` | Cap returned transcript characters, from 500 to 25,000 |
| `include_chapters` | Include or omit chapter deep-links |
| `include_sample_code` | Include or omit sample-code URLs |
| `include_related_docs` | Include or omit related Apple docs |
| `include_judgment` | Include confidence, coverage, caveats, and suggested next tools |

## Project docs

- [`CHANGELOG.md`](CHANGELOG.md) — release notes and unreleased changes.
- [`docs/SOURCE-OF-TRUTH.md`](docs/SOURCE-OF-TRUTH.md) — local pointer to the NotebookLM source of truth.
- [`docs/NOTEBOOKLM-WWDC-MCP-DOC-AUDIT.md`](docs/NOTEBOOKLM-WWDC-MCP-DOC-AUDIT.md) — latest NotebookLM-grounded doc audit, gaps, and questions.
- [`docs/DEPLOY.md`](docs/DEPLOY.md) — local deployment and verification runbook.
- [`docs/SKILL-WIRING.md`](docs/SKILL-WIRING.md) — guidance for wiring this MCP into Apple-platform coding skills.
- [`docs/APPLE-ENDPOINTS.md`](docs/APPLE-ENDPOINTS.md) — Apple endpoint notes for ingest maintainers.

## Install

Requires Node.js 20 or newer.

```bash
git clone https://github.com/jabbertones-cloud/wwdc-mcp-server.git
cd wwdc-mcp-server
npm install
npm run build
```

Or run directly without cloning (no build step):

```bash
npx wwdc-mcp-server
```

Ollama (optional but recommended for semantic search):

```bash
ollama pull nomic-embed-text
# Server must be running at http://127.0.0.1:11434
```

## Ingest

```bash
npm run ingest:all        # everything (takes a while on first run)
npm run ingest:wwdc       # just WWDC sessions
npm run ingest:tutorials  # Apple tutorials (DocC)
npm run ingest:docs       # Apple documentation (DocC)
npm run ingest:hig        # Human Interface Guidelines
npm run ingest:evolution  # Swift Evolution proposals
```

You can restrict WWDC years with `--year 2024 --year 2025`, and cap evolution with `--limit 20`.

## Environment variables

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `OLLAMA_BASE` | No | `http://127.0.0.1:11434` | Ollama base URL |
| `OLLAMA_EMBED_MODEL` | No | `nomic-embed-text` | Embedding model for semantic reranking |
| `WWDC_MCP_DB` | No | `<repo>/data/wwdc.db` | Custom SQLite database path |

Without Ollama the server falls back to pure keyword (FTS5) search.

## Connect to your AI client

### Claude Desktop

`~/Library/Application Support/Claude/claude_desktop_config.json`

```json
{
  "mcpServers": {
    "wwdc": {
      "command": "node",
      "args": ["/absolute/path/to/wwdc-mcp-server/dist/index.js"],
      "env": {
        "OLLAMA_BASE": "http://127.0.0.1:11434",
        "OLLAMA_EMBED_MODEL": "nomic-embed-text"
      }
    }
  }
}
```

### VS Code (GitHub Copilot / MCP extension)

`.vscode/mcp.json` in your workspace:

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

### Cursor

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

### Windsurf

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

### Zed

`.zed/settings.json` in your project:

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

### Dev mode (any client, via tsx)

```json
{
  "mcpServers": {
    "wwdc": {
      "command": "npx",
      "args": ["tsx", "/abs/path/to/wwdc-mcp-server/src/index.ts"]
    }
  }
}
```

## Scheduled ingest

During WWDC week, re-run `npm run ingest:wwdc` every 30 min to catch newly-published sessions:

```cron
# Regular cadence
0 6 * * * cd /abs/path/to/wwdc-mcp-server && npm run ingest:all

# WWDC week burst (uncomment during the conference)
# */30 * * * 1-5 cd /abs/path/to/wwdc-mcp-server && npm run ingest:wwdc
```

## Tests

```bash
npm run smoke   # offline DB/FTS assertions
npm run build   # TypeScript strict typecheck
npm test        # smoke + parse + MCP e2e + package smoke
```

The `tests/evaluation.xml` file contains 10 read-only, stable QA pairs for scoring LLM answer quality with the MCP builder evaluation harness.

## Design notes

- Transport: **stdio** — one process per client, no HTTP endpoint to secure.
- DB: **SQLite + FTS5** with porter stemmer; embeddings stored as raw `BLOB` (Float32).
- Network: polite concurrency (4), retries, 20 s timeout, honest User-Agent.
- Response budget: every tool truncates to **25,000 chars** (~6K tokens).
- Naming: `{service}_{action}_{resource}` snake_case with `wwdc_` / `apple_` prefixes so it never collides with other MCP servers.

## License

MIT
