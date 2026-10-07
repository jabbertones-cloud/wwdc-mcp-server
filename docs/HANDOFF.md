# WWDC MCP handoff — 2026-10-07

## Current public state

- Public repo: `jabbertones-cloud/wwdc-mcp-server`.
- Current release: **v0.2.1**.
- v0.2.1 tag points to `dcdd573f93c141f08acee0583ef922c7e45b51fe`.
- GitHub Release: `https://github.com/jabbertones-cloud/wwdc-mcp-server/releases/tag/v0.2.1`.
- Release assets:
  - `wwdc-mcp-server-0.2.1.tgz`
  - `WWDC-MCP-v0.2.1.mcpb`
- MCPB SHA-256: `0ad362082b60cec8a14c745665cad9fb151b0340beef76ea2b9cc6fc9938654a`.
- Official MCP Registry namespace: `io.github.jabbertones-cloud/wwdc`.
- Registry v0.2.1: **active**, **latest**.
- Registry v0.2.0: **deprecated**.
- npm package `wwdc-mcp-server`: **not published**; npm is optional secondary distribution.

## What shipped

### Core product

- WWDC20–WWDC26 Apple developer intelligence.
- 45 read-only MCP tools.
- SQLite + FTS5 local index.
- Local Hugging Face/ONNX semantic reranking with `nomic-ai/nomic-embed-text-v1.5`.
- `swift_app_audit` promoted as the repo-level Apple audit entry point.
- `wwdc_security_manifest` promoted as the trust/attestation entry point.
- stdio transport plus authenticated stateless Streamable HTTP.
- no Ollama service requirement.

### Public distribution

- GitHub v0.2.1 release is live.
- npm-format tarball exposes:
  - `wwdc-mcp-server`
  - `wwdc-mcp-ingest`
- valid MCPB v0.2.1 is live as a GitHub Release asset.
- official MCP Registry entry is live from that MCPB.
- Registry publication uses GitHub OIDC; no long-lived Registry token.
- normal Registry publishing is gated on a published GitHub Release.
- public MCPB is downloaded back, SHA-verified, and runtime-tested before Registry publication.
- v0.2.0 was deprecated after v0.2.1 proved healthy.

### Cursor integration

Committed on `main`:

- `.cursor-plugin/plugin.json`
- `mcp.json`
- `rules/wwdc-source-grounding.mdc`
- `commands/wwdc-setup.md`
- `commands/wwdc-audit.md`

Cursor/runtime install paths pin v0.2.1 GitHub Release assets and explicitly opt into npm 12 remote-tarball installs with `--allow-remote=all`.

### Discovery / positioning

GitHub About metadata and topics are current: WWDC26, Apple Developer, App Store, Xcode, macOS, Codex, Cursor, local-first, semantic search, Swift/SwiftUI, MCP.

The ecosystem story remains:

- **WWDC MCP = know what Apple expects.**
- **Research Fabric = reason and verify.**
- **AiSCent = execute the App Store Connect release.**

README links the open-source knowledge layer to AiSCent for App Store Connect execution.

## Verified proof

The release path has passed:

- Node 22/24 builds.
- deterministic parser/security tests.
- all 45 stdio MCP tools.
- authenticated Streamable HTTP E2E.
- search regression suite.
- retrieval eval.
- package smoke.
- npm 11.16 and npm 12.2 remote-release-asset install checks.
- npm audit: 0 vulnerabilities.
- official MCP Registry manifest validation.
- live WWDC26 ingest across sessions plus bounded tutorials/HIG/Swift Evolution/pathways.
- public v0.2.1 MCPB download.
- public MCPB SHA verification.
- public MCPB MCP `initialize` handshake returning `wwdc-mcp-server` v0.2.1.
- official Registry API verification showing v0.2.1 active/latest and v0.2.0 deprecated.

## Release incident closed

v0.2.0's first Registry MCPB launched a GitHub tarball through npm without opting into npm 12's remote-URL policy. npm 12 returned `EALLOWREMOTE`.

Recovery:

1. stopped trying to mutate Registry v0.2.0 in place because Registry versions are immutable;
2. added `--allow-remote=all` to the pinned release-asset launcher/install path;
3. issued v0.2.1;
4. runtime-tested the **public** v0.2.1 MCPB before Registry publication;
5. published v0.2.1;
6. deprecated v0.2.0.

Do not replace package bytes for an already-published Registry version.

## Remaining work requiring Scott's account interaction

### Cursor Marketplace submission

The repo/plugin is ready. Cursor's publisher page requires an account email/magic-link sign-in. The existing browser session is not signed into Cursor.

After Scott signs in once:

1. open `https://cursor.com/marketplace/publish`;
2. submit `https://github.com/jabbertones-cloud/wwdc-mcp-server`;
3. record review status and any requested manifest changes.

No code blocker remains for Cursor submission.

### Optional npm publication

npm is **not required** for the official MCP Registry or Cursor distribution.

If npm distribution is desired:

1. Scott signs into npm once;
2. bootstrap-publish `wwdc-mcp-server@0.2.1` publicly;
3. configure npm Trusted Publishing for `jabbertones-cloud/wwdc-mcp-server`;
4. set repository variable `ENABLE_NPM_PUBLISH=true`;
5. future releases publish npm through OIDC, not a long-lived token.

Do not claim npm is live until anonymous lookup/install is verified.

## Optional future remote-directory work

ChatGPT/Claude public connector directories may prefer a stable remote MCP endpoint. The server already supports authenticated Streamable HTTP, but a deliberately public hosted deployment should be treated as a separate distribution project.

Guardrails:

- do not mirror/bundle Apple source content merely to satisfy a directory;
- keep source-linked/local-index behavior;
- keep the MCP tool surface read-only;
- use TLS and fail-closed auth;
- do not conflate local MCPB distribution with a hosted public service.

## Do not regress

- Keep the 45-tool MCP surface read-only.
- Preserve source evidence vs inference separation.
- Keep WWDC26 coverage current.
- Keep `swift_app_audit` and `wwdc_security_manifest` promoted.
- Do not reintroduce Ollama as a required dependency.
- Registry versions are immutable.
- Runtime-test public release assets before publishing Registry metadata.
- Keep npm optional until its one-time account bootstrap is completed.
