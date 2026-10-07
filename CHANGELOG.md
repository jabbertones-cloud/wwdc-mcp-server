# Changelog

## Unreleased

### 2026-10-07 frontier directory distribution

- Added a stable public read-only Streamable HTTP mode with per-client rate limiting for directory clients.
- Added a hosted remote to the official MCP Registry manifest so Registry publication no longer waits on npm.
- Added portable Agent Plugin metadata for ChatGPT, Codex, and Cursor plus direct Claude and Grok setup.
- Added public privacy, terms, support, submission, and icon assets for marketplace review.

## v0.2.0 — 2026-10-07

### 2026-10-07 public release-readiness refresh

- Added `server.json` for official MCP Registry publication and a tag-driven npm → Registry GitHub Actions workflow using GitHub OIDC.
- Added an AiSCent companion workflow to the README so WWDC research naturally hands off to App Store Connect execution.

- Added authenticated, stateless **Streamable HTTP** transport alongside the default stdio transport.
- Added `GET /healthz` with service/version/protocol/auth state, endpoint paths, optional path prefix, and deployed commit identity.
- Added fail-closed bearer authentication for `POST /mcp` via `WWDC_MCP_BEARER_TOKEN` or `WWDC_MCP_BEARER_TOKEN_SHA256`.
- Added `WWDC_MCP_PATH_PREFIX` so the remote MCP can share a reverse-proxy hostname without path rewriting.
- Added remote MCP E2E coverage to CI; both stdio and HTTP tests assert the canonical 45-tool surface.
- Aligned the public runtime requirement with the current package contract: Node.js `>=22.14.0`.
- Confirmed the default WWDC year list includes **2020 through 2026**.
- Rebuilt the public README around Apple-source grounding, WWDC26, source-grounded app audits, API intelligence, trust metadata, current transports, and concrete agent prompts.
- Removed the stale `npx wwdc-mcp-server` quickstart because the npm package is not yet published.
- Expanded npm discovery keywords and package description.
- Added `mcpName: io.github.jabbertones-cloud/wwdc` in preparation for official MCP Registry publication after the npm artifact exists.
- Replaced private/internal documentation assumptions with public repo truth in `docs/SOURCE-OF-TRUTH.md`, `docs/DEPLOY.md`, and `docs/SKILL-WIRING.md`.
- Updated `SECURITY.md` for remote bearer auth, TLS/reverse-proxy expectations, untrusted retrieved content, and live Apple documentation lookup behavior.
- Updated `CONTRIBUTING.md` for the current 45-tool architecture and deterministic stdio/HTTP/security test gates.

### Prior unreleased work

- Added `docs/SOURCE-OF-TRUTH.md` and release verification guidance.
- Updated README, deploy, skill wiring, and Codex for Open Source brief for the canonical **45-tool** surface and broader Apple-platform use.
- Promoted `swift_app_audit` as the app-audit entry point for source-grounded Swift/SwiftUI/macOS/iOS context before code changes.
- Fixed Swift Evolution ingest when the GitHub contents API returns JSON as a string; full local run ingests proposal files with errors reported rather than swallowed.
- Made tutorial ingest bounded with `WWDC_TUTORIAL_MAX_PAGES` so DocC walks finish instead of hanging after partial success.
- Added `swift_app_audit` source coverage metadata for sessions, tutorials, HIG, Swift Evolution, pathways, and sample code.
- Added app archetype query expansion for macOS menu bar, display/monitor, Finder-style navigation, window/app switcher, clipboard, screenshot/capture, camera, game, voice/audio, and App Intents workflows.
- Added direct Apple documentation hints inside `swift_app_audit` for ScreenCaptureKit, NSPasteboard, NSStatusItem, NSWindow, NSScreen, App Intents, GameKit, StoreKit, AVFoundation, Photos, and adjacent file/navigation APIs.
- Added archetype-derived pathways and weak-hit diagnostics so unrelated HIG results are flagged instead of silently treated as strong evidence.
- Changed oversized JSON responses to return a parseable compacted envelope instead of invalid truncated JSON.
- Changed audit result selection to rank feature/archetype hits ahead of generic SwiftUI fallbacks.
- Added inferred platform filtering for WWDC sessions when Apple pages omit explicit platform metadata.
- Added platform-only session search fallback, so queries like `macOS` and `iOS` search session platform metadata instead of returning empty FTS misses.
- Added platform metadata to session search hits and judgment evidence.
- Made search judgment more conservative for broad platform-only queries and more actionable for empty local indexes by returning exact ingest commands.
- Fixed transcript extraction to prefer individual `.sentence` spans and avoid Apple video UI chrome.
- Added chapter extraction for `a.jump-to-time[data-start-time]`, legacy `data-start` anchors, and supplemental chapter list items.
- Fixed `WWDC_DB_PATH` documentation; the correct variable is `WWDC_MCP_DB`.
- Added repository/homepage/bugs metadata to `package.json`.
- Added parser, MCP E2E, security, search-regression, package-smoke, and HTTP protocol coverage.

## v0.1.3

- Expanded `wwdc_search` with `year_min`, `year_max`, `topics`, `platforms`, `require_transcript`, `judgment`, and `detail` parameters.
- Added search judgment metadata: confidence, evidence basis, caveats, answer readiness, and suggested next tools.
- Expanded `wwdc_get_session` with transcript length caps plus toggles for chapters, sample code, related docs, and judgment metadata.
- Added session judgment metadata: confidence, coverage counts, caveats, and suggested next tools.
- Expanded MCP end-to-end coverage for filtered search, no-hit judgment, session output controls, and transcript truncation.

## v0.1.2

- Added package smoke coverage and npm package file controls.
- Hardened Apple documentation URL handling.
- Preserved existing query strings when generating WWDC deep links.

## v0.1.1

- Fixed SQL year-filter totals.
- Converted invalid regex/timestamp cases into MCP tool errors.
- Added stable User-Agent handling for public ingest.
