# Changelog

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
