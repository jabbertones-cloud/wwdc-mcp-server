# Changelog

## Unreleased

- Fixed the deprecation index contradicting the SDK (TL-194): for `UIGraphicsBeginImageContext` the tools answered "not deprecated" / "not found" / no replacement while Apple's DocC records it deprecated (iOS 27.0) in favor of `UIGraphicsImageRenderer`. Three compounding causes, all fixed: (1) structured availability was parsed only by an optional backfill whose queue selected `deprecated IS NULL` while the schema default is `0`, so no row was ever eligible and enrichment never ran — availability is now parsed at ingest by one shared parser (`src/ingest/availability.ts`), the processed state is an explicit `deprecated_checked_at` marker, and `--source all` runs the backfill as part of a complete refresh; (2) DocC symbol titles carry signature suffixes (`UIGraphicsBeginImageContext(_:)`), which the exact-match lookups could never match by bare name — deprecation/availability/replacement lookups now match signature-bearing titles and paths, and references from frameworks' "Deprecated symbols" pages are crawled with priority so the page cap no longer starves the deprecation surface; (3) `apple_api_deprecation` rendered any per-symbol miss on a populated index as "not deprecated" — it now renders four distinct states (deprecated / checked not deprecated / indexed but unchecked / not indexed), and only the checked state may say "not deprecated" (the PR #25 rule, one level below TL-034's empty-index fix). Replacement extraction now understands Apple's "Replace usage of X with Y" phrasing. Regression coverage in `tests/deprecation-honesty.ts` with a real DocC fixture.
- Added `scripts/repair-availability.ts` (TL-194): re-derives every `apple_docs` row's availability fields from the DocC JSON already archived in `raw_json`, using the shared parser — a parser fix no longer requires re-fetching 2,500 pages to repair derived columns (the re-derivation is exactly what a fresh ingest with the fixed parser writes). Stamp discipline mirrors the corpus verifier: the corpus is re-stamped (source `all`) only when the previous stamp's per-source snapshot shows a complete, error-free refresh inside the 12-hour freshness window; otherwise fields are repaired, no stamp is claimed, and the CLI exits non-zero. Regression coverage in `tests/repair-availability.ts`.
- TL-194 follow-through (2), from the second fixed-pipeline corpus rebuild: the target symbol now indexes as deprecated (662 deprecated rows vs 0 in the shipped corpus), but its `deprecated_message` shipped as "Use  instead." — Apple's deprecation summary names the replacement as a DocC *reference* inline node (identifier only, no text), and the summary flattener dropped reference nodes entirely. `extractInlineText` now resolves reference nodes to their identifier's last path segment (and `codeVoice` nodes to their `code`), yielding the complete "Use UIGraphicsImageRenderer instead." The regression fixture now carries the page's verbatim `deprecationSummary` (the original excerpt omitted it, which is why the gap survived the first fix's tests).
- TL-194 follow-through, from the first fixed-pipeline corpus rebuild: crawl *drain* priority alone did not populate the deprecation surface — the uikit aggregate was crawled at position ~348 of 2,500, but the general queue already held ~2,100 admitted references, so the shared budget guard admitted only ~50 of its ~600 symbol references. Priority references now displace unvisited general-queue tail entries at admission time: the page cap's tradeoff is made explicitly in favor of the deprecation surface instead of by discovery order. The same rebuild exposed a sequencing hazard: `swiftbook` ran immediately after the 2,500-request docs crawl and fetched only 15/43 chapters under the throttling that follows a bulk crawl from one client address (43/43 standalone), failing the whole refresh at the stamp gate — small sources now run before the docs crawl in `--source all`.

- Added an optional, intent-matched AiSCent release-workflow handoff to `swift_app_audit` in both JSON and Markdown. Pure Apple/WWDC/Swift research stays free of promotional content. Server instructions and the audit tool description now help agents explain when the separate AiSCent release workspace is relevant without claiming it is connected. Includes positive and negative tests, no paid claims or automatic tool calls.
- Hardened GitHub Actions CI to run exclusively on the physical `smat-m1-mini` ARM64 runner with `smat-m1` and `wwdc-ci` labels, exact hostname validation, and no hosted Linux fallbacks. WWDC repository runner registration is still required before CI can be reported green.

- `wwdc_search` any-term fallback hits now carry a first-class no-hit disclosure (TestLabs Job 6, GAP-01): when the strict all-terms search matches nothing and the labeled `or_relaxed` fallback returns partial hits, the response states the no-hit at the top of the answer — a top-level `notice` field in JSON and a "**No full match.**" line above the hits in markdown — instead of leaving the disclosure only in the machine `fallback` field and a caveat nested under judgment. A query naming a session that does not exist no longer presents partial matches as if they answered it. Non-fallback responses are byte-identical to before. Regression coverage in `tests/search-fallback-notice.ts`.
- `wwdc_search` did-you-mean is no longer all-or-nothing (TestLabs Job 6, GAP-02): a term with no plausible corpus correction no longer vetoes the whole proposal. `suggestQueryCorrection` now returns the corrections that exist, carries uncorrectable terms verbatim into `suggested_query`, and names them in a new `unmatched_terms` field (echoed in the judgment caveat and the markdown "Did you mean" line). Silence is preserved when NO term corrects — nothing is fabricated. Term comparison is also accent-folded: "navigación" now corrects to the corpus term "Navigation" instead of dead-ending (a multi-term French query — "Réunion sur les modèles de fondation" — proposes "Models" and "Foundation" and names the four terms it could not match). Regression coverage extended in `tests/search-did-you-mean.ts`.
- Anti-extraction hardening W3 (fleet standard STD-OUT-1/5): the remaining judgment surfaces are coarsened like the audit — `wwdc_search` judgments (per-hit and overall) now report `relevance_band`, `wwdc_get_session` reports `coverage_band`, and `apple_swift_pattern_find` reports `evidence_band`; no tool returns a `confidence` field in JSON or markdown. Raw BM25/vector ranking scores no longer leave the server: the JSON serialization boundary strips any `score`/`confidence` key at any depth (internal ranking is unchanged). Regression coverage extended in `tests/anti-extraction.ts`. Client break: consumers reading `judgment.confidence` from `wwdc_search` / `wwdc_get_session` / `apple_swift_pattern_find`, or a numeric `score` on any hit, must switch to the band fields / result order.
- Anti-extraction hardening (fleet standard STD-OUT-1 / STD-QUOTA-1/4): `swift_app_audit` no longer returns a `confidence` field — the summary now reports a coarse `readiness_band` (high / medium / low) alongside the existing `readiness` verdict, and audit session hits no longer embed per-hit judgment objects. The HTTP transport now rate limits tool calls with a per-IP token bucket (1 unit per call, 5 for `swift_app_audit`; 120 burst / 120 per minute by default, `WWDC_MCP_TOOL_CALL_RATE_CAPACITY` / `WWDC_MCP_TOOL_CALL_RATE_REFILL_PER_MINUTE`); throttled calls get an opaque `429` + `Retry-After`. Regression coverage in `tests/anti-extraction.ts`, `tests/rate-limit-unit.ts`, `tests/rate-limit-http.ts`.
- Fixed `wwdc_export_status` rendering table counts with a locale-dependent bare `toLocaleString()`: the same DB produced different wire text by process locale (`1,100 rows` under C, `1.100 rows` under de_DE.UTF-8) on a tool annotated `idempotentHint: true` (TL-095). Both render sites now pin `toLocaleString("en-US")` — the fleet precedent (commerce-os pins `en-US` at every wire render site) — so the markdown is a pure function of (inputs, DB state). Regression coverage in `~/workspace/testlabs/regressions/wwdc-export-status-locale.mjs` (wire-level, TestLabs: 1100-row fixture, byte-identical wire under C and de_DE.UTF-8).

- Fixed `wwdc_search` verdict depending on server warm-up state (TL-092): the handler collapsed the embedding `OptionalService`'s tri-state verdict (unknown/available/unavailable) through the boolean `checkEmbeddings(timeoutMs)`, so identical cold and warm calls differed in the judgment caveats ("semantic rerank unavailable; results use FTS only" present while the model was still loading, absent once loaded). The handler now uses a tri-state probe (`checkEmbeddingsState()`): a genuinely failed init still renders "unavailable", but a still-loading model renders "semantic rerank still loading; FTS-only results for now (repeat the query later for hybrid rerank)" — the wire output stays a pure function of (inputs + disclosed service state), and repeats in the same state are byte-identical. Regression coverage in `~/workspace/testlabs/regressions/wwdc-search-warmup-disclosure.mjs` (wire-level, TestLabs).

- Fixed `wwdc_search` blocking a fresh user's first search on the local embedding model load: the availability probe ran unconditionally, so even an empty index (zero hits to rerank) waited on the ~500MB first-run model download/load with no timeout. The probe is now skipped when there are ≤1 hits and time-bounded otherwise (`WWDC_EMBED_TIMEOUT_MS`, default 3000ms), falling back to FTS-only with the existing disclosed caveat while the model keeps loading in the background. `OptionalService` gained `getBounded()` (timeout never marks the service unavailable or cancels the shared in-flight init). Regression coverage in `tests/optional-service.ts`.

- `wwdc_search` year filters only ever applied to WWDC sessions, but the response echoed the requested `year`/`year_min`/`year_max` in `filters` for every kind, implying tutorials, docs, HIG, and Swift Evolution results were year-filtered too. The response now discloses applicability: `filters.year_applies_to: ["session"]` whenever a year constraint is set, plus a judgment caveat ("year filters apply to WWDC sessions only…") when a year constraint is combined with any non-session kind. The `year` parameter description now says sessions-only, matching `year_min`/`year_max`. Regression coverage in `tests/search-year-disclosure.ts`.
- `wwdc_sample_code_grep` matched patterns against URLs only, so its own advertised example ("find sessions with SwiftData" — a title/subject term) silently missed, and a zero-hit result returned a bare empty list with no explanation. Matching now covers each ref's title and URL (substring and regex), the tool description says so, and every response carries `searched: {refs, fields, mode}`; a zero-hit response explains what was searched and points at `wwdc_sample_code_list`. Regression coverage in `tests/sample-code-grep-honesty.ts`.
- `wwdc_search` echoed the user's raw query in the response even when execution silently narrowed it (dedupe of repeated terms, hard cap of 32 unique terms). The response now discloses narrowing: `query_normalization: {rawTokens, executedTokens, deduped, capped}` whenever the executed query differs, plus a judgment caveat naming exactly what happened ("removed N duplicate terms", "limited to the first 32 unique terms"). Ordinary queries are byte-identical to before. Regression coverage in `tests/search-query-disclosure.ts`.
- `wwdc_search` dead-ended when every term was misspelled (e.g. "SwftUI navigaton"): the strict search and the any-term fallback both return zero and the caller got no path forward. On a zero-hit result the server now proposes a correction built from the corpus vocabulary (session titles + topics, frequency-ranked edit distance ≤2): `did_you_mean: {suggested_query, corrections}`, a judgment caveat, and a "Did you mean" line in markdown. The suggestion is proposed, never executed, and the server stays silent when any term has no plausible correction instead of fabricating a guess. Regression coverage in `tests/search-did-you-mean.ts`.
- Fixed `wwdc_ingest_status` masking a missing corpus as a healthy empty status: an absent DB file is silently created empty on open, so a missing/misconfigured corpus volume presented as "none recorded yet; run ingest". The tool now names the corpus state explicitly — `corpus_state: "empty"` (0 sessions, no stamp; markdown leads with an EMPTY CORPUS warning naming the DB path and the missing-volume explanation), `"unstamped"` (sessions present, no stamp), `"stamped"` — and adds `db_path` and `sessions_indexed` to the JSON payload (additive; existing fields unchanged). Regression coverage in `tests/ingest-status-honesty.ts`.
- Fixed raw FTS5 error leak: punctuation-only / tokenless search queries quoted down to an empty FTS string and surfaced `fts5: syntax error near ""` as the MCP tool error. Every FTS entry point in `src/db/queries.ts` now returns an empty result for an empty query (`isEmptyFtsQuery` guard), so clients get a normal no-results response.
- Added typo tolerance to `wwdc_search`: when the strict all-terms search returns zero hits, it retries once with any-term matching (`ftsQuoteOr`) and labels the response (`fallback: "or_relaxed"` in JSON, plus a judgment caveat) instead of dead-ending — e.g. "SwiftUI navigaton" now finds navigation sessions. Regression coverage in `tests/search-regression.ts`.
- Added corpus-version stamping: every completed ingest run records a `corpus_versions` row (ingest date, per-source status, session count, WWDC year range, per-table counts), and `wwdc_ingest_status` now reports the latest stamp, so "which corpus is this?" is answerable from the server itself.
- Added `.woodpecker/weekly-ingest.yml`: a weekly Woodpecker cron pipeline that gates on build + full tests, runs `ingest:all` into a persistent corpus volume, and proves the result with `verify:corpus`. (GitHub-hosted runners are not used; see the pipeline header for cron/volume activation.)
- Extracted the optional-service degradation pattern (cached probe, null-safe access, one-time caveat, resettable verdict) from the embeddings service into `src/services/optional-service.ts`, with unit tests (`tests/optional-service.ts`, `tests/corpus-version.ts` wired into `npm test`). Embedding behavior is unchanged.

## v0.2.1 — 2026-10-07

- Fixed MCPB startup under npm 12 by explicitly opting into the pinned GitHub release tarball with `--allow-remote=all`; the same path remains compatible with npm 11.
- Made the official MCP Registry distribution MCPB-first and npm publication optional.
- Added an OIDC-only Registry publishing workflow with no repository secrets.
- Added a portable MCPB wrapper, release-asset integrity hash, Cursor plugin manifest, Apple source-grounding rule, and `wwdc-setup` / `wwdc-audit` commands.
- Updated Cursor and release-asset install paths to v0.2.1.
- v0.2.0 is superseded because its initial MCPB launcher did not opt into npm 12 remote-tarball fetching.

## v0.2.0 — 2026-10-07 (superseded)

### 2026-10-07 public release-readiness refresh

- Migrated semantic reranking from the old Ollama-backed path to a local Hugging Face Transformers/ONNX engine using `nomic-ai/nomic-embed-text-v1.5`; Ollama is no longer required.
- Added `services/embeddings.ts` as the current implementation and retained `services/ollama.ts` only as a deprecated compatibility shim.
- Added MCP server instructions so compatible clients receive first-party tool-selection/trust guidance at initialization.
- Added release-parity tests for package/runtime/lockfile/User-Agent/MCP Registry versions and Registry description constraints.
- Moved the live source guard to WWDC26 and bounded HIG coverage to a single leaf; verified live ingest across WWDC26, tutorials, HIG, Swift Evolution, and pathways.
- Added first-class Codex configuration guidance and clarified the source-only install status while npm remains unpublished.
- Validated `server.json` against the official MCP Registry before npm publication and reordered the release workflow to fail before creating a half-release.
- Documented that optional `session-summaries` uses Anthropic only when `ANTHROPIC_API_KEY` is explicitly configured.


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
