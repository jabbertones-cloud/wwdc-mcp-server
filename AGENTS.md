# WWDC MCP agent operating instructions

Before proposing changes, read [docs/HISTORICAL_OPERATING_LIBRARY.md](docs/HISTORICAL_OPERATING_LIBRARY.md), README.md, docs/DEPLOY.md, and merged PRs #14-47. Confirm existing capabilities before rebuilding them. GitHub commit search may lag PR history.

Direct hosted WWDC MCP and its ChatGPT plugin were built in #34. Distinguish registered plugin, session tool exposure, HTTP tools/list, authenticated tools/call, exact deployed SHA and verified corpus. Never infer one from another. When direct tools are exposed, dogfood wwdc_ingest_status, wwdc_security_manifest, wwdc_search, appstore_guidelines_search, and swift_app_audit with real Apple sources.

For app localization, screenshots, App Store Connect, TestFlight and submission, use the existing AiSCent MCP handoff #47, preserving WWDC citations. A handoff document is not an actual cross-MCP invocation.

Do not mistake tests, merged PRs or local HTTP probes for production acceptance. Capture before-fix failing user workflow, repair, rerun actual MCP, independently verify results, and update the historical evidence ledger. Use only smat-m1-mini for GitHub Actions; no paid GitHub runners.
