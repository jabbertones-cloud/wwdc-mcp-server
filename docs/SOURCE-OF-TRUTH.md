# wwdc-mcp-server source of truth

Updated: 2026-10-07

For **public behavior and release claims, the repository is the source of truth**. External research systems can suggest improvements, but they do not override the code, tests, package metadata, or published release artifacts.

## Canonical project

- Repository: `https://github.com/jabbertones-cloud/wwdc-mcp-server`
- Package name reserved in source: `wwdc-mcp-server`
- MCP Registry namespace: `io.github.jabbertones-cloud/wwdc`
- Current source version: `0.1.3`
- Runtime: Node.js `>=22.14.0`, TypeScript
- Default transport: MCP stdio
- Optional transport: authenticated stateless Streamable HTTP
- Tool surface: 45 read-only MCP tools
- Default WWDC years: 2020 through 2026

## Distribution status

As of 2026-10-07, the npm package `wwdc-mcp-server` is **not published**. The supported public install path is a GitHub source checkout.

Do not claim that `npx wwdc-mcp-server` works until the npm artifact exists. Do not publish `server.json` to the official MCP Registry until the npm package is live and its `mcpName` matches the Registry server name.

## Public capability claims

The current code and tests support these claims:

- 45 tools are exposed over stdio and Streamable HTTP.
- `WWDC_YEARS` includes 2020–2026.
- `swift_app_audit` is the promoted Apple-platform audit entry point.
- `wwdc_security_manifest` is the promoted trust/attestation entry point.
- Search can use local SQLite FTS5 without Ollama.
- Ollama semantic reranking is optional.
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
