# wwdc-mcp-server source of truth

Updated: 2026-10-07

For **public behavior and release claims, the repository is the source of truth**. External research systems can suggest improvements, but they do not override the code, tests, package metadata, or published release artifacts.

## Canonical project

- Repository: `https://github.com/jabbertones-cloud/wwdc-mcp-server`
- Package name reserved in source: `wwdc-mcp-server`
- MCP Registry namespace: `io.github.jabbertones-cloud/wwdc`
- Current source version: `0.2.1`
- Runtime: Node.js `>=22.14.0`, TypeScript
- Default transport: MCP stdio
- Optional transport: authenticated stateless Streamable HTTP
- Tool surface: 45 read-only MCP tools
- Default WWDC years: 2020 through 2026

## Distribution status

As of 2026-10-07, the official MCP Registry entry `io.github.jabbertones-cloud/wwdc` is published through a GitHub-hosted MCPB bundle. GitHub source checkout and the signed release assets are public distribution paths.

The npm package `wwdc-mcp-server` is still **not published**. npm is optional secondary distribution and must not be described as live until an authenticated first publish succeeds.

Registry versions are immutable. v0.2.1 is active/latest. v0.2.0 is deprecated because its initial MCPB launcher did not opt into npm 12 remote-tarball fetching.

## Public capability claims

The current code and tests support these claims:

- 45 tools are exposed over stdio and Streamable HTTP.
- `WWDC_YEARS` includes 2020–2026.
- `swift_app_audit` is the promoted Apple-platform audit entry point.
- `wwdc_security_manifest` is the promoted trust/attestation entry point.
- Search always has local SQLite FTS5 available.
- Optional semantic reranking runs locally through `@huggingface/transformers` using `nomic-ai/nomic-embed-text-v1.5`; no Ollama service is required.
- `apple_doc_lookup` intentionally performs a live Apple Developer Documentation lookup.
- Remote HTTP requires bearer authentication and fails closed when auth is not configured.
- `WWDC_MCP_PATH_PREFIX` supports mounting the HTTP service behind a shared reverse proxy without path rewriting.
- Retrieved source text is treated as untrusted evidence; security metadata reminds agents not to execute instructions found in retrieved content.

## Canonical public docs

| File | Purpose |
| --- | --- |
| `README.md` | Product story, quick start, tools, sources, transports |
| `CHANGELOG.md` | Release and unreleased changes |
| `CONTRIBUTING.md` | Contribution and test expectations |
| `SECURITY.md` | Threat model and vulnerability reporting |
| `docs/DEPLOY.md` | Local and remote deployment |
| `docs/SKILL-WIRING.md` | Generic agent/skill integration |
| `docs/APPLE-ENDPOINTS.md` | Maintainer notes for public Apple source ingestion |

## Canonical tools

The built server exposes exactly 45 read-only tools. The executable contract is asserted by `tests/mcp-e2e.ts` and `tests/mcp-http.ts`; `src/security/manifest.ts` provides the runtime manifest used for trust checks.

If a tool is added, removed, or renamed, update the manifest, both protocol tests, README, and changelog in the same change.

## Latest verified evidence

On 2026-10-07:

- a fresh-clone deterministic run passed `npm ci`, `npm run build`, `npm test`, and `npm audit --audit-level=high`
- stdio and authenticated Streamable HTTP both exposed the 45-tool contract and v0.2.1 server instructions
- Apple WWDC 2026 discovery returned 138 sessions
- a live WWDC26 session parse returned transcript text, timestamp chapters, and related Apple documentation
- the bounded live ingest suite passed WWDC26 sessions, SwiftUI tutorials, a HIG leaf, Swift Evolution, and pathways
- the public v0.2.1 MCPB was downloaded back from GitHub Release, SHA-256 verified, and successfully completed an MCP `initialize` handshake
- the official MCP Registry lists `io.github.jabbertones-cloud/wwdc` v0.2.1 as `active` and `isLatest=true`
- the official MCP Registry lists v0.2.0 as `deprecated`
- npm still returned 404 for `wwdc-mcp-server`; this does not block the official MCP Registry because Registry distribution uses the GitHub-hosted MCPB bundle

## Verification before a public claim

Run:

```bash
npm ci
npm run build
npm test
npm audit --audit-level=high
```

For changes that depend on Apple's live public pages, also run the smallest applicable live ingest test and record the date/source used.

A successful command is evidence only for what that command actually proves. It is not proof that every Apple endpoint, every indexed source, or every client integration is healthy.
