# NotebookLM WWDC MCP Documentation Audit

Updated: 2026-06-10

NotebookLM is the source of truth for this audit. Local docs are pointers/snapshots only.

## NotebookLM Sources Queried

- Notebook: `9266b7eb-013e-4288-958b-f4d444636448`
- Current correction source: `7ab770f4-eed1-4874-9b64-a955ffe71bc6`
- Relevant older sources in notebook may still mention a local/pending 16th tool. Scott has now promoted `swift_app_audit` as canonical tool 16; prefer the latest promotion source if sources conflict.

## SOT Facts

- `wwdc-mcp-server` exists and is fully built as the WWDC/Apple source MCP.
- Canonical public/current surface: 45 tools.
- Canonical capabilities include search, HIG, sessions, session deep links, sample code grep/listing, pathways, Apple docs/tutorials, Swift Evolution, and ingest status.
- SOT lives in NotebookLM, not local docs.
- Local files should describe themselves as pointers, snapshots, runbooks, or docs, never as final authority.

## Adjacent Existing Inputs

- `OPENCLAW-MAC-UTILITIES-SPEC.md` already defines Mac utility app spec format and shared app patterns.
- `oss-index` already exists for OSS/pattern benchmarking.
- `patent-opportunity-radar` already exists for opportunity discovery.
- These lanes complement WWDC MCP; they do not replace Apple/WWDC/HIG/tutorial source retrieval.

## Current Local Repo Drift

- Local `src/tools/index.ts` and `tests/mcp-e2e.ts` contain `swift_app_audit`.
- `swift_app_audit` is now promoted as the 16th canonical tool and should appear in README, deploy docs, skill wiring, the Codex OSS brief, and release notes.
- Local `npm run build` passes.
- Local `npm test` should accept conservative `swift_app_audit` readiness when fixture data falls back from platform-filtered sessions.

## README/Docs Must Contain

- 45 canonical tools and their exact names, including `swift_app_audit`, `apple_swift_book_get`, `appstore_guidelines_search`, and `wwdc_security_manifest`.
- Local-first/no paid API baseline: SQLite FTS5 plus optional Ollama embeddings.
- Apple-platform breadth: iOS, macOS, visionOS, watchOS, tvOS, iPadOS, Swift, SwiftUI, UIKit, AppKit, Metal, StoreKit, GameKit, Vision, AVFoundation, Foundation Models, HIG, DocC tutorials, Swift Evolution.
- Clear note that NotebookLM is the SOT and local docs are snapshots/pointers.
- Security/trust note: `wwdc_security_manifest` is the MCP trust entry point; search `content_safety` treats retrieved text as untrusted evidence.
- How WWDC MCP is used in app improvement workflows:
  - WWDC/HIG/tutorial/evolution source retrieval.
  - App spec context from `OPENCLAW-MAC-UTILITIES-SPEC.md`.
  - Competitive/pattern context from `oss-index`.
  - Opportunity context from `patent-opportunity-radar`.
- Codex for Open Source brief should mention the six-month token/credit submission only if status is known.

## SOT Notebook Questions

1. Was the Codex for Open Source six-month token/credit application accepted, pending, or rejected?
2. Should stale/older NotebookLM sources that describe `swift_app_audit` as pending be deleted or left with the latest promotion source taking precedence?
3. Should local `SWIFT-APP-AUDIT.md` remain in this repo, or should app-improvement audits live in a separate reports/notebook export lane?
4. Should README include a short "Used With" section naming `OPENCLAW-MAC-UTILITIES-SPEC.md`, `oss-index`, and `patent-opportunity-radar`?
