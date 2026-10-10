# WWDC MCP historical operating library — 2026-10-10

Read before planning, modifying or claiming completion. The root README documents the 45-tool read-only surface; GitHub PR history is the canonical chronology. This file is a discovery map, not live acceptance proof.

## Avoid repeating completed work
- Local WWDC/Apple research, search, FTS, ingestion and Swift audits already exist (May/September commits, #10). Do not propose rebuilding the corpus or `swift_app_audit`.
- Streamable HTTP/hosted transport #14 #15 #23. Direct ChatGPT plugin #34, merged 2026-10-09, at chatgpt.com/plugins/Plugin_89205add1b808191bc6799652dd58ff3. Its existence is not proof it is exposed in a particular chat.
- Corpus versioning, WAL-safe promotion, persistent refresh, launchd fixes #28 #30 #31 #32 #33. Check the actual corpus version and ingest state before restarting ingestion.
- Attested deployment and rollout corrections #35 #36 #37 #38 #39; compare exact live source SHA, staged DB logical corpus digest and running process. Local SQLite byte SHA is not the logical corpus digest.
- Search truth fixes #27 #40 #41 #46: bounded FTS query, no raw errors, truthful missing corpus, year filter only for sessions, title-aware sample grep, query narrowing disclosure, typo suggestion. #46 merged four sibling fixes #42-45; do not reimplement them.
- WWDC-to-AiSCent source-grounded handoff #47, merged 2026-10-10. It gives guidance, not cross-server tool execution. AiSCent handles localization, screenshots, TestFlight, ASC and guarded submission; WWDC supplies Apple docs/HIG/Swift evidence.

## First 5 minutes
1. Inspect latest main and merged PRs; commit-search index can be stale. Read README, docs/DEPLOY.md, this file, #34-47.
2. Query real `wwdc_ingest_status` and `wwdc_security_manifest`, then `wwdc_search`, `appstore_guidelines_search`, `swift_app_audit` when direct tools are exposed. Check 45 descriptors and actual nonempty source-grounded responses.
3. Record exact deployed source SHA and logical corpus version; compare with main. A plugin registration, HTTP initialize, tests, and ChatGPT tool availability are four separate gates.
4. For AiSCent app work, provide cited WWDC/HIG guidance then use actual AiSCent tools; do not claim a successful handoff unless both are invoked.
5. Add a failing real-world negative experiment for each discovered defect, fix, rerun, and record external proof.

## Failure-to-repair map
- Plugin exists but no callable tools: inspect ChatGPT plugin activation/tool registry separately from server health; do not recreate #34.
- HTTP tools/list succeeds but answers are empty: inspect DB mount, `wwdc_ingest_status`, logical digest, #28-41; fail closed, do not invent sessions.
- Search fails or silently narrows: reproduce 500+ character/32-token queries, misspellings, year filter, sample-code title search; compare #27 #40 #46.
- Deploy reports healthy but old SHA: inspect Cloudflare account pin, cold startup, forced rollout, JSON identity, corpus provenance; compare #35-39.
- Agent proposes building localization or submission in WWDC: route to existing AiSCent control plane via #47; preserve source citations and freshness.

## Historical evidence ledger
Date UTC | User task | Source/PR | Source SHA | Deployed SHA | Corpus version | Direct plugin callable? | Tool input/output | Negative test before/after | Independent readback | Next unverified boundary.

Evidence ladder: docs < code < merged < exact deployment < real direct tool call < verified cross-MCP user outcome. Never substitute a lower rung for a higher one. Link AiSCent historical library: jabbertones-cloud/LocalizeShots/docs/HISTORICAL_OPERATING_LIBRARY.md.
