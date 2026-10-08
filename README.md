# WWDC MCP — current Apple developer knowledge for coding agents

<!-- mcp-name: wwdc -->

Ground **Codex, Claude, Cursor, VS Code, Windsurf, Zed, and other MCP clients** in Apple source material before they change your Swift code.

WWDC MCP indexes **WWDC20–WWDC26 sessions**, Apple Developer Documentation, tutorials, Human Interface Guidelines, Swift Evolution, The Swift Programming Language, and App Store Review Guidelines into a local SQLite search layer. It exposes **45 read-only MCP tools** for search, API history, deprecations, transcripts, source-grounded app audits, and trust metadata.

[![CI](https://github.com/jabbertones-cloud/wwdc-mcp-server/actions/workflows/ci.yml/badge.svg)](https://github.com/jabbertones-cloud/wwdc-mcp-server/actions/workflows/ci.yml)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)
[![Node](https://img.shields.io/badge/Node-%3E%3D22.14-339933?logo=node.js&logoColor=white)](package.json)
[![MCP](https://img.shields.io/badge/MCP-45%20read--only%20tools-5A45FF)](server.json)
[![MCP Registry](https://img.shields.io/badge/MCP%20Registry-v0.2.1%20active-5A45FF)](https://registry.modelcontextprotocol.io/v0.1/servers/io.github.jabbertones-cloud%2Fwwdc/versions/0.2.1)

> **Unofficial community project.** Not affiliated with or endorsed by Apple. Apple content remains subject to Apple's terms and source-site availability.

## Pick your path

**I just want my coding agent to use Apple knowledge**

1. Install/connect WWDC MCP using the MCP Registry/MCPB release or the client config below.
2. Ask: *“Use WWDC MCP to audit this app against current Apple guidance before changing code.”*
3. Let the agent start with `swift_app_audit`; you do not need to learn all 45 tools.

**I am a power user**

Use the focused tools directly for transcripts, API history, HIG, Swift Evolution, App Review, source freshness, and trust metadata. See [Agent Guide](docs/AGENT_GUIDE.md) for recommended tool chains and prompt recipes.

**I am an agent working in this repository**

Read [AGENTS.md](AGENTS.md) first. Client-specific repository instructions are also provided for [Cursor](.cursor/rules/wwdc-mcp.mdc) and [GitHub Copilot](.github/copilot-instructions.md).

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

## Start here: three high-value workflows

You do not need to learn 45 tool names first. Start with the job you are trying to finish:

- **Modernize an Apple app:** call `swift_app_audit` with the repo's actual feature/API/problem, then follow its evidence into the focused WWDC, HIG, documentation, and API tools.
- **Answer “what changed?”:** use `wwdc_what_changed` or `wwdc_search` with a framework/API and a year range, then open the strongest session/transcript evidence.
- **Check shipping risk:** search `appstore_guidelines_search`, API availability/deprecation tools, and `wwdc_ingest_status` before treating a recommendation as current.

The server instructions teach connected agents this routing automatically; the catalog remains available when you need a narrower source.

## What makes this different?

- **WWDC26-aware** — the default ingest range is 2020–2026 and can be extended with `--year`.
- **Source-grounded app audits** — `swift_app_audit` combines WWDC, HIG, tutorials, Swift Evolution, pathways, Apple doc hints, caveats, and validation steps.
- **API intelligence** — availability, deprecation, replacement, introduction history, and WWDC mentions.
- **Transcript-native** — search complete session transcripts, read them in chunks, and generate timestamped deep links.
- **Local-first** — SQLite + FTS5 plus optional local ONNX semantic reranking; no separate embedding service or paid API is required for core search.
- **Trust-aware** — conservative judgment metadata, a content-safety tripwire, and a security manifest help agents distinguish evidence from instructions.
- **Two transports** — stdio by default, plus authenticated stateless Streamable HTTP for remote/self-hosted use.
- **Public-directory ready transport** — remote deployments can explicitly set `WWDC_MCP_PUBLIC_READ_ONLY=1` to allow anonymous access to the same read-only tool surface; without that flag or bearer auth, HTTP fails closed.
- **Read-only MCP surface** — the 45 tools retrieve and analyze source material; they do not mutate your Apple account or source repo.

## Install-path scorecard

Choose the path that matches what you value. **Do not confuse “local-first” with “everyone must self-host.”**

| Path | User work | Best for | Status |
| --- | --- | --- | --- |
| Hosted remote MCP | paste/connect one HTTPS MCP URL | ChatGPT, cloud/remote agents, fastest evaluation | endpoint prepared; not advertised live until verification passes |
| MCPB / MCP Registry | install published bundle | clients with bundle/Registry support | v0.2.1 active |
| Local stdio | clone/package + ingest + local client config | privacy, offline-ish retrieval, full local control | supported and tested |
| Self-hosted HTTP | deploy + choose auth + TLS/edge | teams controlling their own infrastructure | supported and tested |

When the hosted endpoint is live, the intended public URL is:

```text
https://wwdc-mcp.smatdesigns.com/mcp
```

For ChatGPT/custom remote MCP clients, that removes the local Node/index/config-path requirement. For Cursor, the same remote URL can be placed in `mcp.json` and can later back a one-click install/deeplink. Local stdio remains a first-class option rather than a fallback.

### Friction budget

A newcomer should be able to reach the **first source-grounded answer** with as few decisions as possible:

- hosted: connect URL → ask the 60-second check;
- Registry/MCPB: install → ask the 60-second check;
- local: install → ingest → configure → ask the 60-second check.

If a new distribution method adds steps before the first useful answer, treat that as an adoption regression unless it buys a clear privacy/security capability.

## Local-first quick start

Use this path when you want the corpus and server on your own machine. For hosted/Registry paths, use the scorecard above.

### Requirements

- Node.js **22.14 or newer**
- npm

> **Distribution status (October 7, 2026):** the official MCP Registry namespace is `io.github.jabbertones-cloud/wwdc`, distributed through a GitHub-hosted MCPB release asset. v0.2.1 is the current patch line. npm publication is optional secondary distribution and is not required for Registry or Cursor installs.

### 1. Clone and build

```bash
git clone https://github.com/jabbertones-cloud/wwdc-mcp-server.git
cd wwdc-mcp-server
npm ci
npm run build
```

The release package exposes two executables:

```text
wwdc-mcp-server   # stdio MCP server
wwdc-mcp-ingest   # build/update the local Apple knowledge index
```

Run the immutable GitHub release package directly:

```bash
PKG="https://github.com/jabbertones-cloud/wwdc-mcp-server/releases/download/v0.2.1/wwdc-mcp-server-0.2.1.tgz"

npm exec --yes --allow-remote=all --package="$PKG" -- wwdc-mcp-ingest --source wwdc --year 2026
npm exec --yes --allow-remote=all --package="$PKG" -- wwdc-mcp-server
```

Clients that support MCP Bundles can use the `WWDC-MCP-v0.2.1.mcpb` asset from the GitHub v0.2.1 release / official MCP Registry.

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

### 3. Prove it works before wiring your client

```bash
npm test
```

That exercises parser/security checks, all 45 tools over stdio, search regressions, package metadata, and authenticated Streamable HTTP.

### 4. Add it to an MCP client

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

## Make your agent use it automatically

The highest-leverage setup is a short repository instruction so the agent reaches for WWDC MCP without being reminded every prompt:

```text
For Apple-platform work, use WWDC MCP before material code changes.
Start with swift_app_audit for repo-level work, verify API availability/deprecation,
cite the strongest Apple/Swift source evidence, and separate evidence from inference.
```

Ready-made versions are included in [AGENTS.md](AGENTS.md), [Cursor rules](.cursor/rules/wwdc-mcp.mdc), and [GitHub Copilot instructions](.github/copilot-instructions.md).

### 60-second connection check

After connecting the server, ask your client to:

```text
Use WWDC MCP. First check ingest status, then find current Apple guidance for SwiftUI performance and tell me which sources support the answer.
```

A healthy setup should be able to see the `wwdc` server, call its tools, and return source-grounded results. For repository-level work, follow with:

```text
Audit this repository with swift_app_audit before proposing Apple-platform changes.
```

## Remote HTTP deployment modes

The HTTP transport is deliberately fail-closed by default.

Private/self-hosted bearer mode:

```bash
WWDC_MCP_HTTP_HOST=0.0.0.0 \
WWDC_MCP_BEARER_TOKEN='<secret>' \
npm run start:http
```

Explicit anonymous read-only mode for a public MCP directory/connector:

```bash
WWDC_MCP_HTTP_HOST=0.0.0.0 \
WWDC_MCP_PUBLIC_READ_ONLY=1 \
npm run start:http
```

In public mode, the MCP endpoint exposes the existing 45 read-only tools without requiring a shared bearer token. This mode is **opt-in**. If neither bearer authentication nor `WWDC_MCP_PUBLIC_READ_ONLY=1` is configured, `/mcp` returns `503 auth_not_configured`.

For an internet-facing deployment, put the server behind TLS/reverse-proxy controls, keep the corpus/source policy unchanged, and monitor/rate-limit at the edge. The repo does not claim a hosted public endpoint until one is independently deployed and verified.

## Client setup

<details>
<summary><strong>OpenAI Codex</strong></summary>

Codex CLI and the Codex IDE extension share MCP configuration. Add this to `~/.codex/config.toml`:

```toml
[mcp_servers.wwdc]
command = "node"
args = ["/absolute/path/to/wwdc-mcp-server/dist/index.js"]
```

Verify the server appears with:

```bash
codex mcp list
```

For reliable tool selection, add a project rule such as this to `AGENTS.md`:

```text
Use WWDC MCP before Apple-platform code changes. Start with swift_app_audit for repo-level work, use Apple/WWDC source tools for evidence, and distinguish retrieved source text from inference.
```

</details>

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

## Documentation map

| If you are… | Read |
| --- | --- |
| Installing for the first time | this README → Quick start → Client setup |
| Driving a coding agent | [Agent Guide](docs/AGENT_GUIDE.md) |
| Understanding design/trust boundaries | [Architecture](docs/ARCHITECTURE.md) |
| Diagnosing a failure | [Troubleshooting](docs/TROUBLESHOOTING.md) |
| Checking clients/runtimes/transports | [Compatibility](docs/COMPATIBILITY.md) |
| An agent modifying this repo | [AGENTS.md](AGENTS.md) |
| Self-hosting / deploying HTTP | [Deployment guide](docs/DEPLOY.md) |
| Contributing code or sources | [CONTRIBUTING.md](CONTRIBUTING.md) |
| Contributing with an AI coding agent | [AI-assisted contributions](docs/AI_CONTRIBUTIONS.md) |
| Reviewing trust/security | [SECURITY.md](SECURITY.md) |
| Publishing a release | [Release guide](docs/RELEASING.md) |

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

`session-summaries` is the one optional enrichment lane that uses an external model API. It runs only when `ANTHROPIC_API_KEY` is set, sends bounded WWDC session metadata/transcript excerpts to Anthropic, and may incur API cost. Core ingest, search, audits, and local semantic reranking do not require that key.

During WWDC week, re-run the WWDC ingest periodically to pick up newly published sessions.

## Local semantic search — no Ollama required

FTS5 keyword search works immediately. When semantic reranking is enabled, WWDC MCP lazily loads `nomic-ai/nomic-embed-text-v1.5` through `@huggingface/transformers` and runs the ONNX model locally. The model is cached under `~/.cache/huggingface/hub`; the first semantic use may need network access to download model files.

If the model cannot initialize, search falls back to FTS5 for that process. To force keyword-only behavior:

```bash
export WWDC_SKIP_EMBEDDINGS=1
```

### Local/index configuration

| Variable | Default | Purpose |
| --- | --- | --- |
| `WWDC_MCP_DATA_DIR` | OS app-data directory | Database/cache directory |
| `WWDC_MCP_DB` | `<data-dir>/wwdc.db` | SQLite database path |
| `WWDC_SKIP_EMBEDDINGS` | unset | Set to `1` to disable local model loading and semantic reranking |
| `WWDC_DOCS_MAX_PAGES` | `2500` | Bound Apple Developer Documentation crawl size |
| `WWDC_TUTORIAL_MAX_PAGES` | `250` | Bound Apple tutorial crawl size |

## Remote Streamable HTTP

Stdio remains the default and simplest local transport. The same 45-tool server can also run as a stateless Streamable HTTP MCP in either **private bearer-authenticated** mode or an explicitly enabled **public read-only** mode.

### Private bearer-authenticated mode

```bash
export WWDC_MCP_BEARER_TOKEN="$(openssl rand -hex 32)"
export WWDC_MCP_HTTP_HOST=127.0.0.1
export WWDC_MCP_HTTP_PORT=8789
npm run start:http
```

Routes:

- `GET /healthz`
- `POST /mcp`

For a deliberately public, read-only connector endpoint:

```bash
export WWDC_MCP_PUBLIC_READ_ONLY=1
export WWDC_MCP_HTTP_HOST=0.0.0.0
export WWDC_MCP_HTTP_PORT=8789
npm run start:http
```

The MCP route fails closed with `503 auth_not_configured` unless either bearer authentication is configured **or** `WWDC_MCP_PUBLIC_READ_ONLY=1` is explicitly enabled. Public mode does not add write capabilities: it exposes the same 45 read-only tools.

To mount the service behind a shared reverse proxy without path rewriting:

```bash
export WWDC_MCP_PATH_PREFIX=/wwdc
```

Routes become `/wwdc/healthz` and `/wwdc/mcp`.

The built-in HTTP server does **not** terminate TLS. If you expose it outside localhost, put it behind a TLS edge/reverse proxy, rate-limit and monitor it, and treat bearer tokens as secrets.

### Hosted public endpoint

A Cloudflare-backed public endpoint is being prepared at:

```text
https://wwdc-mcp.smatdesigns.com/mcp
```

It will be marked **live** here only after the deployed endpoint passes health, MCP initialize, tool-catalog, and source-grounding verification. Until then, use the GitHub release/MCP Registry or self-hosted modes above.

See [docs/DEPLOY.md](docs/DEPLOY.md) for the full runbook.

## Trust and security model

- All 45 MCP tools are read-only.
- Retrieved web text is treated as **untrusted evidence**, not executable instruction.
- Search responses can include `content_safety` metadata.
- `wwdc_security_manifest` reports the canonical tool surface, manifest hash, read-only posture, and prompt-injection handling.
- Remote HTTP fails closed by default. Private mode requires bearer authentication; anonymous access exists only when the operator explicitly enables `WWDC_MCP_PUBLIC_READ_ONLY=1`.
- The default stdio server opens no network listener.
- Ingest fetches public Apple/Swift sources. `apple_doc_lookup` performs live public Apple documentation requests.
- Local semantic reranking uses a Hugging Face Transformers/ONNX model and may download its model files on first use.
- Optional `session-summaries` sends bounded session metadata/transcript excerpts to Anthropic only when `ANTHROPIC_API_KEY` is explicitly configured.
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
- **Semantic reranking:** local `nomic-ai/nomic-embed-text-v1.5` via Hugging Face Transformers/ONNX
- **Response budget:** bounded tool responses, with compact envelopes for oversized JSON
- **Ingest:** public Apple/Swift sources with bounded concurrency, retries, and a stable User-Agent
- **Safety:** content-safety metadata, read-only tool contract, security manifest, fail-closed remote auth

## Public project docs

- [CHANGELOG.md](CHANGELOG.md) — implementation and release history
- [CONTRIBUTING.md](CONTRIBUTING.md) — contribution workflow
- [SECURITY.md](SECURITY.md) — security model and vulnerability reporting
- [docs/DEPLOY.md](docs/DEPLOY.md) — stdio and remote deployment
- [docs/RELEASING.md](docs/RELEASING.md) — npm + MCP Registry release checklist
- [docs/SOURCE-OF-TRUTH.md](docs/SOURCE-OF-TRUTH.md) — repository truth and verification rules
- [docs/SKILL-WIRING.md](docs/SKILL-WIRING.md) — agent/skill integration guidance
- [docs/APPLE-ENDPOINTS.md](docs/APPLE-ENDPOINTS.md) — ingest-maintainer notes

## From Apple guidance to App Store execution

WWDC MCP is intentionally read-only: it helps your agent **understand** current Apple APIs, design guidance, platform changes, and App Review requirements without holding App Store Connect credentials.

When the research is done and you need to **execute** the release workflow, [AiSCent](https://aiscentmcp.com) is the companion product: App Store Connect automation for release operations such as localization, screenshots, metadata, TestFlight readiness, and submission workflows.

**A useful agent workflow:**

1. Ask WWDC MCP to audit the app against current Apple guidance.
2. Fix the code and UX with source-grounded evidence.
3. Use AiSCent for the App Store Connect work needed to get the build ready to ship.

> **WWDC MCP = know what Apple expects. AiSCent = help get the release through App Store Connect.**

## Contributing

Issues and PRs are welcome. If you change the MCP tool surface, ingest behavior, transport behavior, or public claims, update the matching tests and docs in the same change.

See [CONTRIBUTING.md](CONTRIBUTING.md).

## License

MIT
