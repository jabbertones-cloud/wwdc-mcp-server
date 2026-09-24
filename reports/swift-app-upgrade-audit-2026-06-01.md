# Swift App Upgrade Audit

Generated: 2026-06-01

Inputs:

- Swift skills: SwiftPM build/test, SwiftUI UI patterns, SwiftUI view refactor, SwiftUI performance audit, macOS telemetry.
- WWDC MCP local index: 561 WWDC sessions from 2023-2025.
- Existing fleet audit: `SWIFT-APP-AUDIT.md`.
- Mac utilities spec shape: app purpose, platform, framework, risk, validation path, monetizable upgrade.
- Patent/OSS radar pattern: every opportunity gets confidence, risk flags, and verification path; no single-source "cleared" claims.

## WWDC Evidence Used

Direct WWDC MCP searches found current Apple-platform anchors:

| Theme | WWDC Evidence |
|---|---|
| SwiftUI baseline | `wwdc2025-256` What's new in SwiftUI; `wwdc2025-266` Explore concurrency in SwiftUI |
| GameKit | `wwdc2025-214` Get started with Game Center |
| AppKit/macOS | `wwdc2025-310` Build an AppKit app with the new design; `wwdc2024-10124` What's new in AppKit |
| Performance | `wwdc2025-306` Optimize SwiftUI performance with Instruments; `wwdc2025-308` Optimize CPU performance with Instruments |
| StoreKit/App Store | `wwdc2025-241` What's new in StoreKit and In-App Purchase |
| App Intents | `wwdc2025-244` Get to know App Intents; `wwdc2024-10176` Design App Intents for system experiences |
| Speech/AI | `wwdc2025-277` SpeechAnalyzer; `wwdc2025-301` Foundation Models deep dive |
| SwiftData | `wwdc2024-10137` What's new in SwiftData; `wwdc2024-10075` Track model changes with SwiftData |

Note: the new `swift_app_audit` helper initially returned no session results when platform filters were applied because current session rows lack platform/topic metadata. That fallback is now fixed: if platform filtering yields zero hits while the index has sessions, `swift_app_audit` reruns session search without platform filters and adds a caveat. Direct FTS searches still provide sharper evidence anchors for framework-specific terms such as `GameKit`, `AppKit`, `StoreKit`, and `SpeechAnalyzer`.

## Applied Fixes

### ReactionTime

Repo: `/Users/scottmanthey/claw-repos/ios-greenfield-game`

Changed:

- `ReactionTime/Services/GameCenterAuth.swift`
  - Replaced remaining `DispatchQueue.main.async` / `asyncAfter` presentation retries with `Task { @MainActor }` and `Task.sleep`.
  - Keeps Game Center sign-in presentation on MainActor and removes mixed GCD/async flow.

Validation:

- `xcodebuild -project ReactionTime.xcodeproj -scheme ReactionTime -sdk iphonesimulator -configuration Debug build CODE_SIGNING_ALLOWED=NO`
- Result: passed.

Residual opportunities:

| Priority | Opportunity | Evidence | Risk | Validation |
|---|---|---|---|---|
| P1 | Add Game Center Challenges/Activities | `wwdc2025-214` | Requires product/design decisions | Game Center sandbox smoke; leaderboard/challenge flow |
| P2 | Add App Intent for "start reaction test" | `wwdc2025-244` | New framework surface | AppIntents metadata extraction; Shortcuts test |
| P2 | Instrument first-play/leaderboard submit path | `wwdc2025-306` | Low | Instruments SwiftUI timeline before/after |

### LocalizeShots

Repo: `/Users/scottmanthey/claw-repos/LocalizeShots`

Changed:

- `Sources/LocalizeShotsApp/PipelineStore.swift`
  - Added `OSLog.Logger` category `Pipeline`.
  - Logged capture start, self-test start/finish, self-test failures, capture event failures, and capture finish.
  - No secret payloads logged; only counts, locale IDs, context labels, and errors.

Validation:

- `swift build`
- Result: passed.

Residual opportunities:

| Priority | Opportunity | Evidence | Risk | Validation |
|---|---|---|---|---|
| P1 | Add `.xcstrings` preflight warning before simulator capture | `wwdc2025-225` localization workflow | Low, file scan only | Unit test fixture with `.strings` and `.xcstrings` |
| P1 | Replace more `Task.detached` in observable stores with structured task ownership | `wwdc2025-266` | Medium, cancellation behavior | Swift concurrency warnings + focused run |
| P2 | ASC upload/package telemetry spans | `wwdc2025-306`, `wwdc2025-241` | Low | `log stream` predicate for `Pipeline`/`Publish` |

## Next App Targets

### EphemeralVoice

Best next fix:

- Wrap notification-open routing at delegate call sites in `Task { @MainActor in ... }`.
- Add `SpeechAnalyzer` spike behind availability checks for transcript/search affordance.

Evidence:

- `wwdc2025-266` for MainActor/concurrency.
- `wwdc2025-277` for on-device transcription.

Risk flags:

- Audio/session behavior needs device validation.
- Backend/RLS issues must remain separate security work.

### ScreenshotNotes

Best next fix:

- Extract `PhotoImportCoordinator` from large observable app state.
- Convert string-heavy bulk import progress into numeric progress state plus bounded status text.

Evidence:

- `wwdc2025-306` for SwiftUI invalidation/performance.
- `wwdc2024-10137` and `wwdc2024-10075` for SwiftData evolution.

Risk flags:

- Data model changes need migration tests.
- Bulk import flow needs fixture-driven Photos/Vision simulation.

### Claw macOS utilities

Best next fix:

- Add consistent `OSLog` categories for window, clipboard, menu, command, and AX fallback paths.
- Convert repeated polling surfaces into bounded, visible scheduling where possible.

Evidence:

- `wwdc2025-310` for AppKit/new design.
- `wwdc2025-306` and `wwdc2025-308` for Instruments validation.

Risk flags:

- Accessibility APIs and permissions make runtime validation mandatory.
- Avoid logging paths, clipboard contents, or raw window titles unless privacy reviewed.

## MCP Improvements Found During Audit

1. Session ingest should backfill `topics` and `platforms` where Apple page metadata has them.
2. `swift_app_audit` ranking should blend focus/framework terms so `GameKit` and `StoreKit` app audits surface framework-specific sessions ahead of broad SwiftUI basics.
3. Add eval cases for:
   - `GameKit` + `iOS` returns `wwdc2025-214`.
   - `SwiftUI performance` + `iOS` returns `wwdc2025-306`.
   - `AppKit` + `macOS` returns `wwdc2025-310` or `wwdc2024-10124`.

## Confidence

Overall confidence: medium.

Why:

- Builds passed for the two touched apps.
- WWDC evidence was found through direct FTS.
- Existing fleet audit already matches many findings.

Caveats:

- `swift_app_audit` metadata fallback needs improvement before it can be the only audit entry point.
- No device/runtime UI validation was performed.
- Several repos already had unrelated local changes; this audit did not revert or normalize them.
