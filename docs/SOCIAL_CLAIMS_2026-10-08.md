# Social publishing facts and guardrails (verified 2026-10-08)

This is the source-of-truth checklist for the proposed October 8-17 social campaign. Recheck against current main and the live release before posting; source code and a green CI run do not prove a filmed demo or a hosted endpoint works.

## Verified in repository

- **45 read-only MCP tools** (canonical registry: `src/security/manifest.ts`). Avoid outdated '15 tools' or ambiguous '40+'. 
- **Node.js >=22.14**, not Node 20.
- **Core local search:** SQLite FTS5; optional local ONNX embeddings via `@huggingface/transformers` with `nomic-ai/nomic-embed-text-v1.5`. **Not Ollama**. Core use requires no paid API. First embedding use may download model files.
- **Core corpus:** WWDC20-WWDC26 sessions, Apple documentation, tutorials/pathways, HIG, Swift Evolution, Swift Book, App Store Review Guidelines. Local source coverage depends on successful ingestion; do not promise every session or transcript exists.
- **Ingestion:** after cloning, `npm ci && npm run build && npm run ingest:all`; targeted `npm run ingest:wwdc -- --year 2026` is also documented. An empty index does not establish useful retrieval.
- **Distribution:** GitHub v0.2.1 release has MCPB and tarball assets, with MCP Registry distribution described in README. Do not lead with `npx wwdc-mcp-server` unless npm publication and command are verified live.
- **Transport:** stdio default; stateless Streamable HTTP supported with bearer auth or explicit `WWDC_MCP_PUBLIC_READ_ONLY=1`. Do not say 'stdio only' or 'no HTTP endpoint'. Do not advertise `https://wwdc-mcp.smatdesigns.com/mcp` as live without an independent production request.
- **Offline:** indexed local searches can work offline; live `apple_doc_lookup` and initial model downloads require network. Avoid blanket 'nothing leaves your machine' because source ingest and live Apple lookups make network requests.
- **Security:** read-only MCP tool surface, heuristic `content_safety` tripwire, canonical tool-list manifest and SHA-256 hash. These are not proof of immunity to prompt injection.
- **Tool examples:** `apple_api_deprecation`, `apple_what_replaced`, `apple_api_availability`, `wwdc_transcript_search`, `wwdc_session_deep_link`, `wwdc_what_changed`, `wwdc_topics_by_year`, `wwdc_find_api_introduction`, `swift_app_audit`, `appstore_guidelines_search`, `appstore_guideline_get`, `apple_hig_search`, `apple_swift_evolution_get`, `wwdc_security_manifest` are registered.

## Claims to qualify

- `wwdc_find_api_introduction` returns **earliest indexed WWDC mention / likely introduction**, not authoritative first API availability.
- `wwdc_what_changed` compares **indexed session coverage**, not Apple's internal roadmap or investment priorities.
- Deprecation/replacement/availability answers depend on indexed Apple metadata; absence of a match is **not** proof an API is supported or current.
- Deep links construct `?time=SECONDS`; film one real click and verify the destination and playback seek before saying 'jumps to the exact moment'.
- `swift_app_audit` returns source-grounded context and validation steps; it does **not** inspect/compile a Swift project or guarantee App Review acceptance.
- Guideline lookup is informational, not an Apple policy compliance certification. Recheck live official Apple guidelines when publishing policy advice.
- Do not claim 'entire archive', 'every proposal', 'zero network', 'no cloud dependency' or 'guaranteed to prevent deprecated APIs'.
- Star count, release version, endpoint availability, client integrations, current source freshness and subreddit rules are **time-sensitive**. Recheck each before publishing.

## Daily editorial corrections

| Day | Required correction |
| --- | --- |
| 1 | 'Search indexed WWDC and Apple developer sources'; avoid 'entire archive' and blanket offline/privacy claims. |
| 2 | Demonstrate real indexed deprecation, replacement and availability records; never treat a miss as 'not deprecated'. |
| 3 | Replace all Ollama commands and claims with local ONNX/Transformers; explain optional model download and FTS fallback. |
| 4 | Verify a real transcript result and that the timestamped Apple video link seeks correctly. |
| 5 | Say 'indexed WWDC topic coverage' and 'earliest indexed mention'; no roadmap/investment claim. |
| 6 | Show an actual `swift_app_audit` response and its caveats; don't imply source-code static analysis. |
| 7 | App Review guidelines are reference material, not guaranteed pre-approval. Avoid asserting a specific rejection reason without a real example. |
| 8 | Use Node >=22.14, documented clone/build/ingest/client setup or verified MCPB/Registry path; do not promise 60-second install without filming it. |
| 9 | Explain heuristic content-safety scanning and manifest hashing, not a security guarantee; mention both transports. |
| 10 | Recheck actual stars, issue/PR openness and campaign results before reporting them. |

## Proof before publication

For every video: capture exact commit/release, client name/version, successful ingest status, the actual tool call and response, and any caveats; redact local paths, tokens and private data. Do not fabricate an assistant failure or success. Recheck each community's self-promotion rules; do not automate repetitive subreddit posting.

The README and code are authoritative over this dated editorial note when they change.
