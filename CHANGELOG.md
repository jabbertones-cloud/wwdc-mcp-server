# Changelog

## Unreleased

- Added `docs/SOURCE-OF-TRUTH.md` as a local pointer to the NotebookLM SOT, existing adjacent inputs, and release verification guidance.
- Updated README, deploy, skill wiring, and Codex for Open Source brief for the canonical 16-tool surface and broader Apple-platform use with app specs, OSS benchmarks, and patent/opportunity radar patterns.
- Promoted `swift_app_audit` as the 16th canonical MCP tool for source-grounded Swift/SwiftUI/macOS/iOS audit context before app code changes.
- Fixed Swift Evolution ingest when the GitHub contents API returns JSON as a string; full local run now ingests 534 proposal files with 0 errors.
- Made tutorial ingest bounded with `WWDC_TUTORIAL_MAX_PAGES` so DocC walks finish instead of hanging after partial success.
- Added `swift_app_audit` source coverage metadata for sessions, tutorials, HIG, Swift Evolution, pathways, and sample code.
- Added app archetype query expansion for macOS menu bar, display/monitor, Finder-style file browser navigation, window/app switcher, clipboard, screenshot/capture, camera, game, voice/audio, and App Intents workflows.
- Added direct Apple documentation hints inside `swift_app_audit` for ScreenCaptureKit, NSPasteboard, NSStatusItem, NSWindow, NSScreen, App Intents, GameKit, StoreKit, AVFoundation, Photos, and adjacent file/navigation APIs.
- Added archetype-derived pathways and weak-hit diagnostics so unrelated HIG results are flagged instead of silently treated as strong evidence.
- Changed oversized JSON responses to return a parseable compacted envelope instead of invalid truncated JSON.
- Changed audit result selection to rank feature/archetype hits ahead of generic SwiftUI fallbacks.
- Added inferred platform filtering for WWDC sessions when Apple pages omit explicit platform metadata.
- Added platform-only session search fallback, so queries like `macOS` and `iOS` search session platform metadata instead of returning empty FTS misses.
- Added platform metadata to session search hits and judgment evidence.
- Made search judgment more conservative for broad platform-only queries and more actionable for empty local indexes by returning exact ingest commands.
- Fixed transcript extraction: now reads individual `.sentence` spans to skip UI chrome ("Search this video…", "Transcript Code") present in 2025+ pages. Falls back to full container text for older pages.
- Added primary chapter extraction path for WWDC 2025+: `a.jump-to-time[data-start-time]` anchors with float-safe `Math.floor(parseFloat())` conversion. Chapters increased from 5 to up to 16 per session.
- Added `li.chapter-item` to supplement-li chapter selector for broader coverage.
- Fixed `WWDC_DB_PATH` env var documentation — correct name is `WWDC_MCP_DB`.
- Added `repository`, `homepage`, and `bugs` fields to package.json.
- Added `npx wwdc-mcp-server` quickstart to README.
- Test suite: 3 new parser tests covering 2025 chapter format, sentence transcript extraction, and cross-format dedup.
- Removed Node.js 18 from CI matrix (package already required Node 20+).

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
