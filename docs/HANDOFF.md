# WWDC MCP handoff — 2026-10-07

## Current public state

- Public repo: `jabbertones-cloud/wwdc-mcp-server`.
- GitHub release `v0.2.0` is published and points to commit `6c692ac50d73b01512a6cd9e65fccbe74549485b`.
- Release asset attached: `wwdc-mcp-server-0.2.0.tgz`.
- Release asset SHA-256: `2126322dc4c93d64c8a0b71a205d8d90ebada624eb08ed24000f6a33e5ddf5d1`.
- Public About metadata was updated from the stale “15 tools + Ollama” description to WWDC20-WWDC26 / 45 read-only MCP tools / current Apple developer intelligence.
- GitHub topics now include WWDC26, Apple Developer, App Store, Xcode, macOS, Codex, Cursor, local-first, and semantic search.
- README already contains the AiSCent funnel: WWDC MCP is the read-only Apple knowledge layer; AiSCent is the App Store Connect execution layer.

## Verified release proof

The release candidate was exercised under Node 22.23.3 / npm 12.2.0:

- build: pass
- deterministic test suite: pass
- parser/security checks: pass
- all 45 stdio MCP tools: pass
- search regression: pass
- retrieval eval: pass
- package smoke: pass
- authenticated Streamable HTTP MCP test: pass
- live WWDC26 ingest: pass
- live tutorials/HIG/Swift Evolution/pathways ingest: pass
- `npm audit --audit-level=high`: 0 vulnerabilities
- MCP Registry `server.json` validation: pass
- npm tarball contains both `wwdc-mcp-server` and `wwdc-mcp-ingest`.

The npm 12 `npm pack --json` format change was fixed by normalizing legacy array, direct object, and npm 12 keyed-object shapes.

## Distribution work completed

### npm package shape

`package.json` now exposes:

- `wwdc-mcp-server` -> `dist/index.js`
- `wwdc-mcp-ingest` -> `dist/ingest/run.js`

The repository URL was normalized to the npm-preferred git URL.

### Cursor plugin

Post-v0.2.0 work on `main` added:

- `.cursor-plugin/plugin.json`
- `mcp.json`
- `rules/wwdc-source-grounding.mdc`
- `commands/wwdc-setup.md`
- `commands/wwdc-audit.md`

Latest validated `main` head after these files: `a697aff1877ef72ac88b33bc77825d4914496166`.

The Cursor MCP config uses the immutable GitHub release npm tarball, not the unpublished npm registry package:

`https://github.com/jabbertones-cloud/wwdc-mcp-server/releases/download/v0.2.0/wwdc-mcp-server-0.2.0.tgz`

That artifact was proven installable via `npm exec --package=<release-asset>`, and both public executables resolve.

## Remaining blockers / next actions

### 1. First npm publish — human account bootstrap only

The code and release pipeline are not blocked. The first publish failed with npm `E404` because `wwdc-mcp-server` has never been created under an authenticated npm owner.

Important facts:

- GitHub Actions has **no repository or environment secrets** configured.
- npm trusted publishing cannot create a brand-new package; the package must exist first.
- Safari has no saved npm credential and the Mac is not authenticated with `npm whoami`.
- Do not add a long-lived token just to bootstrap unless necessary.

Next action:

1. Sign into npm once.
2. Publish `wwdc-mcp-server@0.2.0` publicly.
3. Configure npm trusted publishing for this GitHub repo/workflow.
4. Future releases should use OIDC only.

### 2. Official MCP Registry — npm is not the only path

The official Registry supports GitHub-hosted `mcpb` packages with:

- `registryType: "mcpb"`
- direct GitHub release asset URL
- required `fileSha256`

The Registry validator explicitly accepts GitHub release redirects.

Do **not** rename the npm tarball to `.mcpb`. Build a valid MCPB bundle using manifest spec 0.3, upload it to the GitHub release, compute SHA-256, update `server.json`, validate with `mcp-publisher`, then publish.

A clean design is a tiny Node MCPB bootstrap package that launches the pinned WWDC MCP release artifact while preserving stdio, with Node >=22.14 compatibility declared. Validate client behavior before listing it.

### 3. Cursor Marketplace submission

The public repo is structurally ready for Cursor marketplace submission.

Current blocker: Cursor’s publisher page requires sign-in. The local Safari session reached the Cursor/WorkOS authentication page, which is an email/magic-link boundary. No account email was guessed or entered.

Next action after Cursor sign-in:

1. Open `https://cursor.com/marketplace/publish`.
2. Submit the public GitHub repo.
3. Confirm review status and any requested manifest changes.

### 4. ChatGPT / Claude public directories

Current public connector directories favor remote MCP endpoints. WWDC MCP is intentionally local-first and read-only. Do not weaken the product by mirroring Apple content into a hosted service merely to satisfy a directory.

If a remote listing is desired, use the existing authenticated Streamable HTTP transport with a deliberate public deployment and a safe indexing model. Keep Apple content source-linked and respect source terms.

## Product / positioning

Keep the ecosystem story:

- **WWDC MCP = know what Apple expects.**
- **Research Fabric = reason and verify.**
- **AiSCent = execute the App Store Connect release.**

Primary open-source audience: AI-assisted Apple developers using Codex, Claude, Cursor, etc. who need current Apple evidence before changing or shipping code.

## Do not regress

- Keep the 45-tool surface read-only.
- Preserve source/evidence vs inference separation.
- Keep WWDC26 coverage current.
- Keep `swift_app_audit` as the promoted repo-level entry point.
- Keep `wwdc_security_manifest` as the promoted trust entry point.
- Do not reintroduce Ollama as a required dependency; semantic reranking is local ONNX/Hugging Face.
- Do not claim npm or official Registry publication until independently verified.
- Do not repoint `v0.2.0` away from its published release commit now that the GitHub release exists.
