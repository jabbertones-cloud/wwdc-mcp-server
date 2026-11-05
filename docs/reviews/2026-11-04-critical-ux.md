# AppDev Atlas critical product review — 2026-11-04

**Candidate:** `fix/appdev-atlas-independent-review-20261104` at the tested PR head (record exact SHA in GitHub after commit).
**Baseline:** main `c8b128c2dd612afc9196d1a9d211734e72d03a5d`, officially published MCP Registry v0.2.2.
**Release verdict:** **NOT APPROVED**. These improvements are unmerged and undeployed until exact-head CI, independent reviewer judgment, preview/mobile acceptance, exact-main CI, and live post-deploy retest.

## Reproduced failures and actual corrections

| Human task | Baseline on real 1,426-session corpus | Candidate and falsifying test |
| --- | --- | --- |
| iPhone SwiftUI TextField keyboard blocks menu | The audit returned macOS accessibility/AppKit, multilingual keyboard, and game-talk evidence, plus `ready_for_code_review`/high confidence without seeing the app | Returns iOS-relevant search/keyboard sessions, `NavigationStack`, `TextField`, `FocusState` official documentation hints, and focused on-device dismissal test; no code-review approval. Reproduced in `tests/mcp-e2e.ts` and direct stdio MCP against the 1,426-session corpus. |
| Exact WWDC26 `NavigationStack` search | 16 unrelated recent sessions because CamelCase expanded to broad "navigation" AND "stack" | 0 exact 2026 matches with an explicit no-match caveat; 2025 has one direct transcript excerpt with `[NavigationStack]`. Preserves deliberate typo relaxation for non-symbol queries. |
| App Store Connect screenshot/metadata preparation | ScreenCaptureKit permission, NSScreen, and StoreKit purchase requirements appeared without a screen-capture or payment request | `app-screenshots` and `appstoreconnectapi` hints, localization/assets validation; no invented capture or purchase prerequisites. Positive/negative tests exercise both cases. |
| First-time hosted connection | Website hero pushes source checkout and local npm setup, includes obsolete Ollama instructions, falsely implies prompt use guarantees MCP tool invocation | Hosted Streamable HTTP connection first, exact public MCP URL, separate optional local/ONNX setup, explicit verify-the-tool-call step; new DOM tests and browser viewport measurements. |

## Actual human-interface checks

Candidate HTML was loaded into Cloudflare BrowserConnector through a local document snapshot. This is **visual inspection of the candidate**, not a published preview. At 320×568 the primary connect action starts at y≈450 px, ends at y≈499 px, and the document scroll width equals the 320 px viewport. At 375×812 the action starts at y≈430 px; at 390×844 at y≈434 px. No horizontal overflow at these sizes or desktop 1280 px. Screenshot visually checked at 320 px; the primary action is fully inside the first viewport. A real screen-reader journey and a published preview are **not yet verified**.

## Reused building blocks, not a fresh search system

- Existing repo `searchSessionsFts` and SQLite FTS5 `MATCH`, BM25, and `snippet(...,-1,...)` for actual match excerpts; do not invent a second search engine.
- Existing `pickRankedAuditHits` / `pickTopSearchHits` and `swift_app_audit` tool workflow, with stricter platform/feature/symptom evidence and meaningful caveats. Code may still need simplification before approval.
- Official Apple SwiftUI documentation for `FocusState` and scroll-specific keyboard dismissal; App Store Connect API screenshot resource; optional local Hugging Face/ONNX model already used by source.
- Handroll Rehab / Unloopr `unloopr_loop` on an earlier candidate diff found no static findings **in the submitted diff only**. Its GitHub history lane failed HTTP 403 rate limit: `INCOMPLETE_EVIDENCE`. Re-run the final diff, do not equate a static scan with UX approval.
- Research Fabric job `36081297-012d-47f5-a2e4-d8715d075157`: `succeeded` but insufficient relevant donor evidence; not a substitute for independent user testing. No GitHub Research TaskMap is claimed.

## Required independent release gates

1. **Diff review and exact PR-head CI**: check every response-schema change, all 45 tools, performance, cold-start, corpus correctness, zero-hit transparency, security, and provenance. Preserve 0.2.2 Registry historical artifacts and stable technical IDs.
2. **First-time client acceptance**: a person or independent agent unfamiliar with the implementation follows hosted setup and local MCPB separately, exercises real tools, cites Apple URLs and handles failed/empty answers. Do not claim all IDE clients are verified because the endpoint responds.
3. **Published QA preview and accessibility**: Cloudflare Pages nonproduction preview remains unverified. M1 Wrangler authentication expired; M2 has critical disk pressure. Test keyboard tab order, screen reader/AX hierarchy, mobile viewport, first-fold CTA, and actual support links before deploying the site.
4. **Two held-out real tasks plus adverse inputs**: independent reviewer challenges iOS/macOS evidence quality, feature grounding, false-confidence boundaries, bogus APIs, SwiftUI typo, empty index and mixed-platform cases. Tests must grade usefulness, not merely existence of hits.
5. **Only then merge → exact main → authorized deploy → live source SHA and 45-tool/catalogue acceptance → adversarial retest**, with rollback path and published evidence.

**This candidate is not a shipped fix.** A green local suite and author-led browser evaluation are insufficient to certify final product quality.
