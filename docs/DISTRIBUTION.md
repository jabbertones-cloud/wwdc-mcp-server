# Distribution and adoption

This document tracks **time-to-first-source-grounded-answer**, not vanity distribution count.

## Current distribution surfaces

| Surface | Transport / artifact | User friction | What we should optimize |
| --- | --- | ---: | --- |
| MCP Registry | MCPB / stdio | low when client supports Registry/bundles | accurate metadata, release identity, screenshots/examples where supported |
| GitHub release | MCPB + package artifacts | medium | obvious latest asset, checksums, release notes, copy/paste verification |
| Local clients | stdio | medium/high | absolute-path mistakes, ingest clarity, client reload/restart |
| ChatGPT custom MCP | remote HTTPS MCP URL | very low after hosted endpoint exists | stable public URL, TLS, health, rate limits, source-grounded first prompt |
| Cursor remote MCP | remote HTTP MCP config | low after hosted endpoint exists | copyable config + one-click/deeplink/Marketplace path |
| VS Code | stdio or supported remote MCP config | low/medium | tested/documented config, Registry install path when applicable |
| Claude clients | stdio and/or remote connector depending on product | low/medium | keep instructions product-specific and current |

## Adoption funnel

Measure these separately:

1. **Discovery** — user lands on repo/Registry/directory.
2. **Intent** — user chooses a path instead of bouncing.
3. **Connection** — client can initialize and list 45 tools.
4. **Activation** — user gets one useful, source-grounded Apple answer.
5. **Habit** — repository instructions cause the agent to invoke WWDC MCP without repeated prompting.
6. **Trust** — user can inspect sources, freshness, security manifest, and deployment identity.
7. **Referral** — user shares a workflow/result/repo rather than merely starring it.

A star, install, or MCP connection is not activation.

## Activation test

The canonical first-run prompt is:

```text
Use WWDC MCP. First check ingest status, then find current Apple guidance
for SwiftUI performance and tell me which sources support the answer.
```

For repository work:

```text
Audit this repository with swift_app_audit before proposing Apple-platform changes.
```

## Fresh-user acceptance matrix

For each supported client, periodically test from a clean profile/machine:

- number of manual steps before connection;
- number of copy/paste operations;
- whether a restart/reload is required;
- whether the user must know a filesystem path;
- whether the user must install Node;
- whether the user must ingest locally;
- whether the client clearly shows tool permissions;
- whether the 60-second activation prompt succeeds;
- whether source links are usable;
- whether the agent reuses WWDC MCP on the next Apple task.

Record **tested date + client version**. Do not convert a one-time successful setup into a permanent compatibility claim.

## Hosted endpoint launch gate

Do not change README status from “prepared” to “live” until:

1. `https://wwdc-mcp.smatdesigns.com/healthz` is healthy over TLS.
2. `https://wwdc-mcp.smatdesigns.com/mcp` completes MCP initialize.
3. External MCP Inspector sees exactly 45 tools.
4. `wwdc_security_manifest` confirms read-only posture and expected manifest hash.
5. A WWDC26 query returns source-grounded evidence.
6. Rate limiting / abuse monitoring / observability are enabled.
7. Deployment SHA is visible and matches the intended release.
8. A fresh ChatGPT remote-MCP connection succeeds.
9. A fresh Cursor remote-MCP connection succeeds.
10. README/config examples are switched from “planned” to the verified URL in the same change.

## AEO / discoverability language

Use natural problem language in examples and headings, not only tool names:

- current Apple developer documentation for AI coding agents
- search WWDC transcripts with an AI coding agent
- SwiftUI WWDC26 changes
- App Store Review Guidelines MCP
- Apple HIG MCP
- Swift Evolution MCP
- check Apple API availability and deprecations
- audit an iOS/macOS app against current Apple guidance

Avoid keyword stuffing. The best discoverability artifact is a useful answerable workflow with primary-source links.

## Content that earns distribution

Prioritize examples that demonstrate a complete developer job:

- “Audit my SwiftUI app after WWDC26.”
- “What changed between WWDC25 and WWDC26 for Foundation Models?”
- “Is this StoreKit API deprecated and what replaces it?”
- “Check this feature against App Review before submission.”
- “Find the exact WWDC timestamp explaining this behavior.”

Each example should show **question → tool route → evidence → recommendation**, not a screenshot of a tool list.

## Companion-product boundary

Public WWDC MCP adoption should stand on its own. AiSCent can be the natural next step when a user moves from **knowing what Apple expects** to **executing App Store Connect work**, but do not gate knowledge retrieval behind AiSCent or turn every example into an upsell.
