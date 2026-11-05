# Product Acceptance Gate — AppDev Atlas

Technical CI proves the code behaves as tested. **It does not prove a customer can finish a useful job.** Before approving a release, a reviewer other than its author must run this gate against the candidate and challenge every significant output.

## Start with the customer's problem

Record the exact source SHA, packaged artifact hash, corpus version, MCP client, platform, and user prompt. Test a first-time developer who does not know MCP vocabulary; do not start by describing the 45 tools. Test the installed bundle and the public hosted endpoint separately. A release artifact or README is not a running service.

For each journey record the raw answer, source URLs, relevant screenshots/DOM or client state, concrete user outcome, failure, and retest. No generic "looks good" verdict.

| Journey | Acceptance observation | Critical failure |
| --- | --- | --- |
| Hosted first use | User can identify an HTTPS MCP URL without a local install, connect a supported client, and see a real source-backed tool call | Site sends them into Node/npm/index setup first or implies a prompt guarantees tool use |
| Local first use | Correct Node version, reproducible install, explicit index step, honest runtime/download costs, accurate optional semantic engine | Invented 60-second promise, unused Ollama instructions, hidden prerequisites |
| Real iPhone bug | Audit on iOS SwiftUI keyboard/menu issue surfaces platform-relevant evidence and actionable verification | AppKit/NSStatusItem/macOS pathways, unsupported ready-for-code-review verdict |
| Search relevance | Specific API query shows directly relevant hits or visibly labels transcript-only / tangential results | Freshness alone makes an unrelated session appear relevant |
| Honest uncertainty | No-match, empty corpus, unverified APIs, stale sources have distinct and comprehensible next steps | High-readiness or fabricated availability without direct evidence |
| No promotional diversion | Normal SwiftUI research fully answers the task without pitching AiSCent | Unsolicited sales prompt, invented cross-MCP action |
| Security / source trust | Actual 45 read-only catalog, retrieved text treated as untrusted, no leaked secrets | Trust boundary crossed or raw private data in output |
| Support / recovery | Support, privacy, legal, bug form and exact release links work, with clear reporter authorization | Dead link, no way to submit an issue, wrong publisher identity |
| Mobile / accessibility | At 320px width no horizontal navigation overflow; tab focus visible and controls reachable | Hidden install action, inaccessible links, keyboard trapping |

## Harsh review rubric

Score each axis **0–4** using direct evidence: relevance, practical completion, source freshness/precision, platform correctness, honesty of uncertainty, onboarding clarity, accessibility, and security. A score of 0–1 in any axis is **P1, blocks release**. Any incorrect platform guidance presented as actionable, fabricated citations/readiness, missing auth protection, or data leakage is **P0, blocks release**. Score 2 requires explicit improvement and retest; do not silently accept. A high average must never hide a failed critical axis.

For every P0/P1: **reproduce → research source/donor → change minimally → test exact head → rerun the original user's request → independent critique → exact main → deploy → live adversarial retest**. Record failure and corrected response; passing fixtures alone never closes it.

## Required release receipt

- Exact PR-head and merged-main SHAs, CI links and reviewed diff
- Donors, pinned sources, licenses, prior failure history and measured comparison
- At least three realistic source questions (including iOS and macOS), one typo, one nonexistent API, one empty-index/cold start, and one first-time install
- Before/after examples proving relevance and calibrated readiness, not just nonempty arrays
- Website mobile-width and keyboard-accessibility observations
- Published bundle SHA and actual stdio initialize/list/call; hosted /healthz, initialize/list/call and corpus SHA
- Open P0/P1 list (must be empty) and remaining unverified client-specific support

Do not describe the review as "independent" if the only judge was the implementer. Note any unavailable client or test explicitly; do not claim a perfect product.
