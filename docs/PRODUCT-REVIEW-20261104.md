# AppDev Atlas: adversarial user review, November 4, 2026

Status: **candidate only, release blocked.** Baseline production is Registry v0.2.2 / GitHub main c8b128c2dd612afc9196d1a9d211734e72d03a5d. Candidate branch: fix/appdev-atlas-critical-ux-20261104. Source corpus for the local holdout: M1 1,426-session SQLite snapshot. Do not imply this is a production-corpus checksum match.

## Why the previous green release was inadequate

A real iPhone keyboard/navigation request returned unrelated macOS AppKit and menu-bar WWDC sources and claimed ready-for-code-review/high readiness. A NavigationStack query with WWDC 2026 restrictions broadened the Swift API name into the English words "navigation" and "stack", promoting unrelated tvOS, MLX, and other transcripts. The live website sent first-time users into a local Node/npm/Ollama setup despite a working hosted MCP, promised a one-minute install, and used a 280px minimum card width even at 320px viewport.

## Observed candidate improvements (not approval)

- On the M1 indexed corpus, the same iPhone failure now returns the directly relevant WWDC26 "Design intuitive search experiences" session (https://developer.apple.com/videos/play/wwdc2026/292/) and no unrelated macOS session. Readiness is seed_context_only/low, citing missing direct NavigationStack/TextField evidence and independent-source corroboration. Links to FocusState, TextField, NavigationStack and scrollDismissesKeyboard are clearly described as lookup suggestions, not verified evidence. Validation steps now address actual software-keyboard/menu access and FocusState, conditionally scrolled keyboard dismissal, Dynamic Type and VoiceOver.
- Exact CamelCase symbols are never silently expanded into ordinary English retrieval claims. Transcript-only matches have explicit relevance caveats; age/recency is not a relevance score.
- Hosted HTTP connection is the first website choice, local install is optional, stale Ollama instructions and unrealistic installation timing are gone, and a narrow-screen tool-card overflow rule was corrected. Automated static onboarding tests do **not** replace a real 320px browser test.

## Handroll Rehab and donor evidence

Unloopr Handroll Rehab pinned to jabbertones-cloud/unloopr@09daf810f19702514ac89c7a1191ee0d1a8e07b6, license MIT, uses upstream ast-grep 0.40.0. The actual local scanner ran against this candidate repository src/ and returned **24 SELECT COUNT(*) review candidates**, all in SQL-count-guard family; it did not prove 24 defects. Inspected examples include corpus row totals, readonly FTS hit counts, migration-column existence checks, and import progress counts. Replacing them with quota/transaction donors would be inappropriate without a write-after-count race. No automatic replacements were applied.

Hosted Unloopr loop scanned the real candidate diff but its GitHub-history stage failed with HTTP 403 rate-limit, so the status was INCOMPLETE_EVIDENCE, not a clean full-repo verdict. Research Fabric job 36081297-012d-47f5-a2e4-d8715d075157 reported insufficient relevant donors. Existing implementation reused official @modelcontextprotocol/sdk, SQLite FTS5/BM25, Apple primary documentation and existing tests. No new parser, vector engine, MCP router, or invented donor was added.

## Unfinished acceptance gates: do not merge or deploy yet

1. Independent review by someone other than the implementer must score practical usefulness, citation accuracy, platform correctness, uncertainty, accessibility, and security against actual outputs. Any P0/P1 blocks.
2. Browser QA of preview at 320/375/768px, real keyboard focus order, overflowing code blocks, touch targets, and accessibility. Static CSS assertions are not visual proof.
3. Real external MCP client (hosted and newly packaged candidate) must answer actual user requests with visible tool calls and Apple citations. A seeded test is not a human acceptance test.
4. Run exact-head CI after independent review, merge exact-head, exact-main CI, then guarded Cloudflare website/MCP deployment and adversarial live acceptance against exact runtime and preserved corpus. Do not consume hosted paid runners when prohibited by operator policy.

The release standard is not a green build or nonempty list; it is source-grounded progress on a user's real problem without wrong-platform recommendations, false readiness, or confusing setup.
