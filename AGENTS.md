# WWDC MCP agent operating instructions

Before proposing changes, read [docs/HISTORICAL_OPERATING_LIBRARY.md](docs/HISTORICAL_OPERATING_LIBRARY.md), README.md, docs/DEPLOY.md, and merged PRs #14-47. Confirm existing capabilities before rebuilding them. GitHub commit search may lag PR history.

Direct hosted WWDC MCP and its ChatGPT plugin were built in #34. Distinguish registered plugin, session tool exposure, HTTP tools/list, authenticated tools/call, exact deployed SHA and verified corpus. Never infer one from another. When direct tools are exposed, dogfood wwdc_ingest_status, wwdc_security_manifest, wwdc_search, appstore_guidelines_search, and swift_app_audit with real Apple sources.

For app localization, screenshots, App Store Connect, TestFlight and submission, use the existing AiSCent MCP handoff #47, preserving WWDC citations. A handoff document is not an actual cross-MCP invocation.

Do not mistake tests, merged PRs or local HTTP probes for production acceptance. Capture before-fix failing user workflow, repair, rerun actual MCP, independently verify results, and update the historical evidence ledger. Use only smat-m1-mini for GitHub Actions; no paid GitHub runners.

## Mandatory six-rule learning loop (owner directive, 2026-10-10)

These rules are ordered. Do not substitute a troubleshooting workflow or treat assumptions as evidence.

1. **Learn before coding.** Learn how the existing system works and follow instructions; do not assume the solution.
2. **Git history first.** Study previous attempts, fixes, failures, regressions, and lessons before doing anything new.
3. **GitHub research second.** Find similar and better implementations; study actual code, history, and tests.
4. **Clone and port, don't reinvent.** Reuse the best proven implementations instead of inventing replacements.
5. **Research before declaring blockers.** Missing information requires more research in the prescribed sequence.
6. **On failure, return to Rule 1.** A failure does not automatically prove breakage. Wait and retry; if it still fails, restart the learning and research sequence.

**Required loop:** Learn -> Git history -> GitHub research -> Clone and port -> Research missing information -> Failure? Wait, retry, return to Learn. Repeat until independently verified working in real use.

No substitute workflow, invented shortcuts, or unverified completion claims. Do not use a broken dependency to repair itself when an independent route exists. This instruction applies to every agent, coding task, investigation, release, and continuation.


## Owner's six rules (mandatory sequence)

1. Learn before coding. I am here to learn how to code and follow instructions, not assume I already know the solution.
2. Git history first. Study previous attempts, fixes, failures, regressions, and lessons before doing anything new.
3. GitHub research second. Find similar and better implementations. Study actual source code, history, and tests.
4. Clone and port, don't reinvent. Reuse the best proven implementations instead of creating my own solutions, respecting licenses.
5. Research before declaring blockers. Missing information means more research is needed, following the prescribed sequence.
6. When something doesn't work, return to Rule 1. A failure does not automatically mean something is broken. Wait and safely retry. If it still fails, begin the learning and research sequence again.

Rule 6 loops back to Rule 1; it is not a separate troubleshooting procedure. Repeat until independently verified working. No substitute workflow. No invented shortcuts. No treating assumptions as evidence. The sequence itself is the instruction.
