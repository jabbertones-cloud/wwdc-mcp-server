# Changelog

## Unreleased

- Fixed transcript extraction: now reads individual `.sentence` spans to skip UI chrome ("Search this video…", "Transcript Code") present in 2025+ pages. Falls back to full container text for older pages.
- Added primary chapter extraction path for WWDC 2025+: `a.jump-to-time[data-start-time]` anchors with float-safe `Math.floor(parseFloat())` conversion. Chapters increased from 5 to up to 16 per session.
- Added `li.chapter-item` to supplement-li chapter selector for broader coverage.
- Fixed `WWDC_DB_PATH` env var documentation — correct name is `WWDC_MCP_DB`.
- Added `repository`, `homepage`, and `bugs` fields to package.json.
- Added `npx wwdc-mcp-server` quickstart to README.
- Test suite: 3 new parser tests covering 2025 chapter format, sentence transcript extraction, and cross-format dedup (11 total parse tests, 15 e2e tool tests).
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
