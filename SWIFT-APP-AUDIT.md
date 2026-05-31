# Swift App Fleet Audit
> Powered by wwdc-mcp-server — WWDC 2025 sessions indexed (122 sessions, year: 2025)
> Generated: 2026-05-31

---

## Fleet Summary

| App | Purpose | Framework | Platform Target | Priority Issues |
|-----|---------|-----------|-----------------|-----------------|
| SlideTac | iMessage sliding-piece board game | SwiftUI + GameKit + AdMob | iOS 17 / macOS 14 | ObservableObject in AppModel, no Game Center Challenges/Activities, StoreKit misses new `currentEntitlements(productID:)` API |
| EphemeralVoice | Burn-after-listen voice messaging | SwiftUI + AVAudioEngine + Supabase | iOS 17 | AVAudioEngine instead of SpeechAnalyzer, no App Intents, RLS not applied |
| ScreenshotNotes (SnapNotes) | Screenshot OCR + auto-organization | SwiftUI + Vision + SwiftData | iOS 17 | AppState god object (900 LOC), SwiftData lacks inheritance model, no Foundation Models integration |
| LocalizeShots | macOS App Store screenshot automation | SwiftUI + SPM | macOS 14 | No Xcode localization code-along alignment, ASC JWT auth fragile, no `wwdc2025-225` adoption |
| SafeFrameCamera | Multi-platform safe-zone framing camera | SwiftUI + AVFoundation + Foundation Models | iOS 17 / macOS 14 | Already uses iOS 26 APIs correctly but Camera Control (wwdc2025-253) not wired, cinematic video gap |
| sleep-coach | HealthKit sleep coaching | SwiftUI + HealthKit | macOS 13 (iOS via Xcode) | `ObservableObject` not migrated to `@Observable`, no App Intents, HKObserverQuery callback crosses actor boundary |
| EmotionGuesser | GameKit turn-based facial emotion game | SwiftUI + GameKit + Vision | iOS 17 | Uses `@Observable` correctly, no Challenges/Activities (wwdc2025-214), missing Apple Games app integration |
| ReactionTime (ios-greenfield-game) | Reaction-time arcade game | SwiftUI + GameKit | iOS (unspecified) | `ObservableObject`/Combine throughout — not migrated to `@Observable`, no Game Mode key |
| GravatarNativeOptimizer | Gravatar profile optimizer + NFC writer | SwiftUI + AVFoundation + CoreImage | macOS/iOS | Custom OAuth vs. ASWebAuthenticationSession, no `@Observable` |
| ClawBar | macOS menu bar item manager | SwiftUI + AppKit | macOS 13 | Timer-based pasteboard polling (0.5 s), Carbon hotkey API, no menu bar Extra improvements from UIKit 2025 |
| ClawBoard | macOS clipboard history palette | SwiftUI + AppKit | macOS | Same pasteboard polling pattern as ClawBar |
| ClawSnap | macOS window tiling | SwiftUI + AppKit | macOS | AX API dependency, no Stage Manager awareness |
| ClawTab | macOS window switcher | SwiftUI + AppKit | macOS | AX window enumeration on main thread risk |
| ClawSentinel | macOS monitoring app (minimal) | SwiftUI | macOS | Only 1 source file found — skeleton only |
| ClawExplorer | macOS file/project browser | SwiftUI + AppKit | macOS | No Quick Look integration, no Spotlight index |
| ClawDisplay | (not found at listed path) | — | — | Path mismatch: `/Users/scottmanthey/craw-repos/ClawDisplay` (typo: `craw` vs `claw`) |
| InstantMemory | macOS clipboard manager | SwiftUI + AppKit | macOS | Very small (2 source files) — feature incomplete |
| MartialArtsVideoApp | Martial arts video curriculum player | SwiftUI + AVFoundation + StoreKit | iOS | `nonisolated(unsafe)` on StoreKit task — actor isolation workaround, no Picture-in-Picture |

---

## Deep Audits

### SlideTac

**What it does:** iOS/macOS/tvOS iMessage game extension + host app for "SlideTac," a sliding-piece Tic-Tac-Toe variant. Turn-based via Game Center `matchData`. Freemium: ad-supported free tier, subscription removes ads.

**Tech stack:**
- SwiftUI (iOS 17 / macOS 14 / tvOS 17)
- GameKit (turn-based match + Game Center auth)
- Google Mobile Ads + User Messaging Platform (iOS only)
- StoreKit 2 (`Transaction.updates`, `Transaction.currentEntitlements`)
- iMessage Extension (`MessagesViewController`)
- Swift Package Manager multi-target (SlideTacCore / SlideTacUI / SlideTacMonetization)

**Issue 1 — `SlideTacPurchaseManager` uses deprecated `currentEntitlements` API**

The `refreshEntitlements()` call iterates `Transaction.currentEntitlements` (the sequence overload). WWDC 2025-241 documents that as of iOS 18.4, `Transaction.currentEntitlement(for productID:)` is deprecated in favor of `Transaction.currentEntitlements(productID:)` (the new productID-keyed API). The current code still iterates the full sequence which works but is less efficient.

```swift
// Current (works but deprecated path in iOS 18.4+):
for await result in Transaction.currentEntitlements { ... }

// WWDC25-241 recommended pattern:
for await result in Transaction.currentEntitlements(productID: IAPProductID.removeAds.rawValue) { ... }
```

**Issue 2 — No Game Center Challenges or Activities integration**

WWDC 2025-214 ("Get started with Game Center") introduces Game Center Challenges and Activities as first-class hooks that feed the new Apple Games app's "Top Played Games" chart and "Friends Are Playing" section. SlideTac has Leaderboard scaffolding but zero Challenges or Activities defined. Every Game Center feature integrated increases visibility in the Games app.

Key APIs from wwdc2025-214:
- `GKChallenge` — enable players to challenge friends on a score/achievement
- `GKActivity` — track sessions and feed the Games app's engagement signals
- `LSSupportsGameMode = true` in Info.plist — enables Game Mode CPU boost

**Issue 3 — iMessage Extension concurrency: no `@MainActor` annotations on `MessagesViewController`**

`MessagesViewController` is a UIKit subclass. Its callbacks fire on the main thread, but async methods dispatched from it have no actor annotation. With Swift 6.2's implicit `@MainActor` mode (wwdc2025-266), this will surface warnings. Annotating the class `@MainActor` and using structured `Task { }` blocks instead of bare `Task.detached` will be required before a Swift 6 strict mode migration.

**Issue 4 — Liquid Glass design update requires audit**

wwdc2025-356 and wwdc2025-256 ("What's new in SwiftUI") show that tab bars and navigation containers automatically adopt the new iOS 26 design when recompiled. The iMessage extension's `SlideTacIMessageRootView` uses a custom `SlideTacGrooveBackground` that may conflict with the new compositor. The `.glassEffect()` modifier in SwiftUI should be evaluated for the board surface overlay.

**Issue 5 — Google Ads SDK: no Instruments profiling baseline**

AdMob integration introduces a background network stack. wwdc2025-306 ("Optimize SwiftUI performance with Instruments") introduces the new SwiftUI instrument in Instruments 26. A profile run during an ad load would reveal whether ad callback closures cause unnecessary view body re-evaluations in the game board view.

**WWDC sessions to study:**

| Title | Year | Session ID | Why |
|-------|------|-----------|-----|
| Get started with Game Center | 2025 | wwdc2025-214 | Challenges, Activities, Apple Games app visibility |
| Engage players with the Apple Games app | 2025 | wwdc2025-215 | Games app integration, discovery signals |
| Level up your games | 2025 | wwdc2025-209 | Game Mode, Sustained Execution, controller support |
| What's new in StoreKit and In-App Purchase | 2025 | wwdc2025-241 | `currentEntitlements(productID:)` migration |
| Explore concurrency in SwiftUI | 2025 | wwdc2025-266 | Swift 6.2 implicit @MainActor, iMessage Extension safety |
| What's new in SwiftUI | 2025 | wwdc2025-256 | Liquid Glass tab bar adoption, toolbar tinting |

**Concrete quick wins:**

1. Add `LSSupportsGameMode = true` to Info.plist (0 code, immediate CPU benefit during play).
2. Replace `Transaction.currentEntitlements` iteration with `Transaction.currentEntitlements(productID: IAPProductID.removeAds.rawValue)` in `refreshEntitlements()`.
3. Mark `MessagesViewController` with `@MainActor` to future-proof Swift 6 migration.

---

### EphemeralVoice

**What it does:** Burn-after-listen voice messaging app — record M4A messages, send to contacts via Supabase backend, messages expire after one play. Has a "SleepWearableCoach" secondary feature that reads Apple Watch sleep data.

**Tech stack:**
- SwiftUI + `@Observable` (iOS 17+, correctly used)
- AVAudioEngine (M4A recording + playback)
- Supabase (realtime backend, `can_play` RPC, `deleteMessage`)
- StoreKit 2 (replay entitlement tiers)
- `DeepLinkParser` + `NotificationRouter` + `InviteChannelResolver`
- XCTest with async test methods

**Issue 1 — AVAudioEngine for voice recording vs. new SpeechAnalyzer API**

The `AudioSessionCoordinator` uses a manual `AVAudioEngine` tap pipeline for recording. WWDC 2025-277 ("Bring advanced speech-to-text to your app with SpeechAnalyzer") introduces `SpeechAnalyzer`, the new iOS 26 API already powering Notes, Voice Memos, and Journal. For EphemeralVoice, SpeechAnalyzer unlocks:
- Automatic transcription of voice messages for search and accessibility
- On-device, offline, long-form audio support (better than SFSpeechRecognizer)
- Configurable `SpeechTranscriber` module with no server round-trip

```swift
// WWDC25-277 pattern:
let analyzer = SpeechAnalyzer()
let transcriber = SpeechTranscriber(locale: .current)
try await analyzer.add(module: transcriber)
// pass AVAudioPCMBuffer from existing AVAudioEngine tap
```

Adding transcription would enable message search across the contact list — a high-value feature differentiation.

**Issue 2 — No App Intents integration**

WWDC 2025-275 ("Explore new advances in App Intents") shows Interactive Snippets and new system integrations. A "Send Voice Message" App Intent would let Siri and Spotlight surface EphemeralVoice directly. The `InviteChannelResolver` and routing logic already encapsulate the domain — wrapping a `SendVoiceMessageIntent` and `RecordVoiceMessageIntent` is straightforward.

**Issue 3 — RLS not applied (from project AUDIT.md)**

The project's own `AUDIT.md` documents that the Supabase `voice_messages` table had RLS disabled with the anon key, creating total data exposure. Migration `003` was authored but not confirmed applied. This is the highest-severity security issue in the fleet.

**Issue 4 — `SleepWearableCoach` lives in `EphemeralVoice` target**

`SleepWearableCoach.swift` and its full test suite (`SleepWearableCoachTests.swift`) are in the EphemeralVoice app target. This feature reads Apple Watch sleep/HR data and has no relationship to voice messaging. It should be extracted to a separate framework or app. As it stands, every voice messaging user who doesn't have a wearable carries dead HealthKit permission prompts.

**Issue 5 — `AppModel` singleton pattern with `@Observable`**

`AppModel.shared = AppModel()` is a correct `@Observable` pattern (wwdc2025-266 confirms @Observable + @MainActor is the 2025 baseline). However, `handleNotificationOpen` has an `assert(Thread.isMainThread)` comment documenting that callers must dispatch to main before calling — this is fragile. The `UNUserNotificationCenterDelegate` method should be wrapped with `Task { @MainActor in ... }` at the call site, not rely on documentation.

**WWDC sessions to study:**

| Title | Year | Session ID | Why |
|-------|------|-----------|-----|
| Bring advanced speech-to-text to your app with SpeechAnalyzer | 2025 | wwdc2025-277 | Voice message transcription; on-device, offline, long-form |
| Explore new advances in App Intents | 2025 | wwdc2025-275 | Send/Record voice message Intents, interactive snippets |
| Explore concurrency in SwiftUI | 2025 | wwdc2025-266 | @MainActor in notification delegate path |
| Meet the Foundation Models framework | 2025 | wwdc2025-286 | On-device summarization of transcribed messages |

**Concrete quick wins:**

1. Fix `handleNotificationOpen` call site: wrap in `Task { @MainActor in model.handleNotificationOpen(...) }` at the delegate.
2. Confirm Supabase migration `003` is applied; add a startup assertion that RLS is active.
3. Move `SleepWearableCoach` to a conditional compilation block (`#if ENABLE_SLEEP_FEATURE`) or a separate SPM target.

---

### ScreenshotNotes (SnapNotes)

**What it does:** iOS screenshot capture + Vision OCR pipeline that auto-classifies screenshots into notes, clusters by topic, surfaces actionable items (todos, links, receipts, amounts), with a companion macOS app (`SnapNotesMac`). SwiftData persistence. Freemium with monthly screenshot limit paywall.

**Tech stack:**
- SwiftUI + `@Observable` + SwiftData (iOS 17)
- Vision (`VNRecognizeTextRequest` revision 4, iOS 17+)
- Photos framework (smart album observation + PHAsset processing)
- StoreKit 2
- `OSLog` (good: structured logging throughout)
- `MCPBridge` (domain service abstraction layer)

**Issue 1 — AppState is a 900-line god object**

`AppState.swift` is 900 lines and owns 14 service references, all observable UI state, photo library logic, monetization triggers, cluster management, note CRUD, and export. This violates the single-responsibility principle and makes the body heavy — every property access through `@Observable` potentially causes unnecessary view updates across every subscriber. wwdc2025-306 directly addresses this: the new SwiftUI Instrument diagnoses unnecessary update chains caused by over-broad observable objects.

The fix is to split into domain-scoped observable objects:
- `PhotoImportCoordinator` (pending screenshots, bulk processing, re-entry guard)
- `NoteLibraryModel` (allNotes, todayNotes, searchResults, cluster management)
- `MonetizationModel` (paywall triggers, quota)
- Inject via `@Environment`

**Issue 2 — SwiftData lacks inheritance modeling for `Note` subtypes**

WWDC 2025-291 ("SwiftData: Dive into inheritance and schema migration") introduces class inheritance for SwiftData models in iOS 26. `ScreenshotNotes` uses flat `Note` + `TodoItem` + `LinkItem` as separate `@Model` classes with back-references. Using Swift class inheritance would let `ReceiptNote`, `TodoNote`, `LinkNote` share a base `Note` superclass, enabling typed queries:

```swift
// WWDC25-291 pattern:
@Model class Note { ... }
@Model class ReceiptNote: Note { var amount: String }
// Query a specific subtype:
let receipts = try context.fetch(FetchDescriptor<ReceiptNote>())
```

**Issue 3 — Vision OCR uses `VNRecognizeTextRequest` without `.languageCorrection` tuning**

`OCRService.swift` instantiates `VNRecognizeTextRequest()` with default parameters. The `recognitionLevel` and `usesLanguageCorrection` are not explicitly set per call. For receipt OCR (amounts, merchant names), `.accurate` level with language correction off gives better numeric fidelity. For general screenshot text, `.fast` with correction on is more appropriate. The current single-path approach trades accuracy for code simplicity.

**Issue 4 — `configureDomainServices()` called repeatedly and guarded only by `noteService == nil`**

`configureDomainServices()` is called in `onAppLaunch`, `handleOnboardingCompletion`, `processPendingScreenshots`, `onScreenshotDetected`, and `drainScreenshotQueue`. The guard `noteService == nil` prevents double-init but creates tight coupling between photo processing and service wiring. This should be an explicit lifecycle phase, not an ad-hoc guard scattered across call sites.

**Issue 5 — No Foundation Models integration for screenshot interpretation**

WWDC 2025-286 ("Meet the Foundation Models framework") describes on-device LLM (3B parameter, Apple Intelligence) available for classification, extraction, and summarization — exactly what ScreenshotNotes does with rule-based heuristics today. `ContextDetector.detect()` and the tagging pipeline are candidates for augmentation:

```swift
// WWDC25-286 pattern — guided generation with @Generable:
@Generable struct ScreenshotAnalysis {
    var category: ContentCategory
    var title: String
    var actionItems: [String]
    var detectedAmount: String?
}
let session = LanguageModelSession()
let result = try await session.respond(
    to: "Categorize this screenshot text: \(ocrText)",
    generating: ScreenshotAnalysis.self
)
```

**WWDC sessions to study:**

| Title | Year | Session ID | Why |
|-------|------|-----------|-----|
| SwiftData: Dive into inheritance and schema migration | 2025 | wwdc2025-291 | Note subtype modeling, query optimization |
| Optimize SwiftUI performance with Instruments | 2025 | wwdc2025-306 | Diagnose AppState update chain breadth |
| Meet the Foundation Models framework | 2025 | wwdc2025-286 | Replace heuristic classifier with on-device LLM |
| Code-along: Bring on-device AI to your app using the Foundation Models framework | 2025 | wwdc2025-259 | Practical adoption walkthrough |
| Explore concurrency in SwiftUI | 2025 | wwdc2025-266 | AppState @MainActor isolation correctness |

**HIG violations:**
- The `screenshotImportStatusMessage` string is updated 3 times per screenshot during bulk import (string interpolation on main thread). Move progress reporting to a `ProgressView` with `Double` progress value to avoid string-formatting churn.

**Concrete quick wins:**
1. Run the new SwiftUI instrument (wwdc2025-306) against the bulk import flow; the AppState god object will light up with unnecessary evaluations on every PHAsset processed.
2. Extract `PhotoImportCoordinator` — the re-entry guard (`isProcessingPendingScreenshots`) and the queue drain logic are self-contained and can be isolated in one session.

---

### LocalizeShots

**What it does:** macOS developer tool that automates App Store screenshot generation by driving iOS simulators via `xcrun simctl`, setting languages/locales, launching apps, capturing screenshots, overlaying device frames, and uploading to App Store Connect via ASC API (JWT auth).

**Tech stack:**
- SwiftUI (macOS 14)
- SPM multi-target (LocalizeShotsApp / LocalizeShotsCore / LocalizeShotsOverlay)
- `Process` / `xcrun simctl` shell driver (`SimctlDriver`)
- ASC API JWT (`ASCJWT.swift`)
- StoreKit 2 (`@Observable LocalizeShotsPurchaseStore` — monthly + annual)
- `NSSecureCoding` bookmark-based security-scoped access

**Issue 1 — WWDC 2025-225 "Code-along: Explore localization with Xcode" alignment**

wwdc2025-225 covers Xcode 26's updated localization workflow including the new `.xcstrings` catalog format and Xcode's string extraction improvements. LocalizeShots produces screenshots but does not validate that the Xcode project being screenshotted actually uses `.xcstrings`. Adding a preflight check that warns when a project still uses legacy `.strings` files would prevent a common failure mode (screenshots captured in the wrong locale because string catalogs weren't exported).

**Issue 2 — ASC JWT is hand-rolled; App Store Connect API library now available**

wwdc2025-241 ("What's new in StoreKit and In-App Purchase") mentions the App Store Server Library for signing requests. The `ASCJWT.swift` file hand-rolls ES256 JWT signing. Apple's official Swift App Store Server Library handles token creation, caching, and rotation. Using it reduces maintenance surface and aligns with Apple's recommended path.

**Issue 3 — `SimctlDriver` `ProcessRunner` has no timeout on `boot` + `bootstatus`**

`SimctlDriver.boot()` calls `xcrun simctl bootstatus -b` which blocks until the simulator is ready but has no wall-clock timeout enforced in the Swift layer. A simulator that fails to boot hangs the entire pipeline indefinitely. The `ProcessRunner.xcrun()` call should accept an optional timeout.

**Issue 4 — No use of `@MainActor` on the main pipeline store**

`PipelineStore` (the orchestrator that drives capture sessions) does not appear to be annotated `@MainActor`. Given that it mutates observable state read by SwiftUI views, and that `SimctlDriver` dispatches async `Process` calls, there is a data-race risk on the store's published state under Swift 6 strict checking.

**WWDC sessions to study:**

| Title | Year | Session ID | Why |
|-------|------|-----------|-----|
| Code-along: Explore localization with Xcode | 2025 | wwdc2025-225 | Xcode 26 string catalog workflow; align screenshot pipeline with it |
| Enhance your app's multilingual experience | 2025 | wwdc2025-222 | Language Discovery API — detect active device language in captured screenshots |
| What's new in StoreKit and In-App Purchase | 2025 | wwdc2025-241 | App Store Server Library for JWT signing |
| Explore concurrency in SwiftUI | 2025 | wwdc2025-266 | PipelineStore actor boundary audit |

**Concrete quick wins:**
1. Add a 120-second `Task` timeout wrapping `ProcessRunner.xcrun(["simctl","bootstatus",...])` that throws a `SimctlDriver.Error.bootTimeout`.
2. Annotate `PipelineStore` with `@MainActor` and run the app with Swift strict concurrency warnings enabled.

---

### SafeFrameCamera

**What it does:** Camera app for creators that overlays platform-specific safe-zone framing guides (TikTok, Instagram, YouTube, etc.) on a live AVFoundation dual-camera preview (wide + ultra-wide PIP). Includes AI framing coach using Foundation Models (iOS 26). Freemium via StoreKit 2.

**Tech stack:**
- SwiftUI + `@Observable` (iOS 17 / macOS 14)
- AVFoundation `AVCaptureMultiCamSession` (dual camera)
- Foundation Models (`FoundationModels`, iOS 26 only, gated behind `#available(iOS 26, *)`)
- StoreKit 2
- `@ObservationIgnored` + `lazy var camera` for AVFoundation session (correct pattern)

**Issue 1 — Physical capture controls not wired (AVCaptureEventInteraction)**

WWDC 2025-253 ("Enhancing your camera experience with capture controls") introduces `AVCaptureEventInteraction`, which maps physical volume buttons and the iPhone 16 Camera Control to camera actions. SafeFrameCamera has its own in-app record/capture button but no physical button support. Content creators using SafeFrameCamera often have their phone mounted — physical button triggering is critical UX. The API handles `.began` (prepare) / `.ended` (capture) phases and the Action button:

```swift
// WWDC25-253 pattern:
let interaction = AVCaptureEventInteraction { event in
    if event.phase == .ended { viewModel.camera.takeSnapshot() }
}
view.addInteraction(interaction)
```

**Issue 2 — Cinematic Video mode not offered**

WWDC 2025-319 ("Capture cinematic video in your app") exposes `isCinematicVideoCaptureEnabled` on `AVCaptureDeviceInput`, which routes the entire session through Cinematic mode with a single property. SafeFrameCamera's primary use case (talking heads, product shots) is exactly the target audience for Cinematic video. Adding a Cinematic mode toggle would be a direct differentiation from system camera.

```swift
// WWDC25-319 pattern:
deviceInput.isCinematicVideoCaptureEnabled = true
// All connected outputs (movie file, preview layer, data output) get bokeh automatically
```

**Issue 3 — AI coach card gated at `#available(iOS 26, macOS 26, *)` — good pattern, but model loading not pre-warmed**

The `AIFramingCoachCard` correctly uses `#available` and silently hides on older OS (verified in `AIFramingCoachCardIfAvailable`). However, `LanguageModelSession` is instantiated inside the `task {}` modifier, meaning the first coach tip incurs model load latency on every appear. wwdc2025-286 recommends creating a `LanguageModelSession` once and keeping it alive for the app session, since it maintains conversation context and amortizes model load.

**Issue 4 — No `@Observable` SwiftUI Instrument profiling done on `SafeFrameViewModel`**

`SafeFrameViewModel` has 22 stored properties all participating in `@Observable` tracking. The guide overlay rendering path (`latestPreviews`, `latestAssessment`) updates on every frame assessment. wwdc2025-306 's new SwiftUI instrument would reveal whether guide overlay views re-evaluate their bodies on assessment ticks when their specific preview data hasn't changed. `withObservationTracking` scoping or `Equatable` conformance on `CropPreview` should be audited.

**WWDC sessions to study:**

| Title | Year | Session ID | Why |
|-------|------|-----------|-----|
| Enhancing your camera experience with capture controls | 2025 | wwdc2025-253 | Physical button capture (volume, Camera Control, Action button) |
| Capture cinematic video in your app | 2025 | wwdc2025-319 | `isCinematicVideoCaptureEnabled` — one-line Cinematic mode |
| Meet the Foundation Models framework | 2025 | wwdc2025-286 | Pre-warm LanguageModelSession; stateful multi-turn coach |
| Optimize SwiftUI performance with Instruments | 2025 | wwdc2025-306 | 22-property ViewModel update chain audit |

**Concrete quick wins:**
1. Add `AVCaptureEventInteraction` on the capture view — maps volume buttons to snapshot/record. Estimated: 30 minutes.
2. Lift `LanguageModelSession` to a `@State` property in `AIFramingCoachCard` initialized in `init()` rather than inside `task {}` to eliminate per-appear load latency.

---

### sleep-coach (SleepCoach)

**What it does:** HealthKit-backed sleep coaching app that reads sleep analysis, HRV, resting HR, steps, and exercise time over a 30-day window. Provides a daily "DayCoach" with behavioral prompts across morning reflection, day pulse, and night intent views. Read-only HealthKit; no writes.

**Tech stack:**
- SwiftUI (macOS 13 for tests; iOS via Xcode project)
- HealthKit (`HKHealthStore`, `HKObserverQuery`, `HKSampleQuery`)
- `ObservableObject` + `@Published` (NOT yet migrated to `@Observable`)
- `EventStore` (custom pub/sub for behavioral events)

**Issue 1 — `HealthKitService` is `ObservableObject` not `@Observable`**

`HealthKitService` is marked `final class HealthKitService: ObservableObject` with `@Published` properties. The iOS 17+ `@Observable` macro (wwdc2025-266) eliminates the need for `@Published` and reduces allocations. More importantly, `ObservableObject` causes all `@Published` subscribers to re-render on every change, while `@Observable` tracks only the exact properties accessed by each view body.

```swift
// Current:
@MainActor
final class HealthKitService: ObservableObject {
    @Published private(set) var authState: AuthorizationState = .notRequested

// Target (iOS 17+):
@MainActor
@Observable
final class HealthKitService {
    private(set) var authState: AuthorizationState = .notRequested
```

**Issue 2 — `HKObserverQuery` callback crosses actor boundary without `@MainActor` dispatch**

`startObserving(onChange:)` registers `HKObserverQuery` callbacks that fire on an arbitrary HealthKit background thread. The callback calls `Task { @MainActor [weak self] in ... }` — which is correct — but the outer closure captures `self` without `[weak self]`, creating a retain cycle between the HKStore and the service. The fix: `[weak self]` on the outer closure, not just the inner Task.

```swift
// Current (retain cycle):
let query = HKObserverQuery(sampleType: ...) { _, completion, error in
    Task { @MainActor [weak self] in ... } // weak only on Task, not outer closure

// Fix:
let query = HKObserverQuery(sampleType: ...) { [weak self] _, completion, error in
    guard let self else { completion(); return }
    Task { @MainActor [weak self] in ... }
```

**Issue 3 — No App Intents for sleep check-in**

The night intent and morning reflection flows (fixed UI navigations) are prime App Intents candidates. WWDC 2025-275 shows that App Intents with interactive snippets can surface "Log morning reflection" directly from Siri or the Action button — eliminating the app-open step for a daily habit. This is low-effort: the domain logic is already in `DayCoach.swift`.

**Issue 4 — macOS 13 deployment target limits `@Observable` and SwiftData**

Package.swift declares `.macOS(.v13)` for the test target, but the iOS app target likely targets iOS 17+. `@Observable` requires iOS 17 / macOS 14. The Package.swift split means the core model layer cannot use `@Observable` directly — it must remain `ObservableObject` or the deployment target must be raised.

**WWDC sessions to study:**

| Title | Year | Session ID | Why |
|-------|------|-----------|-----|
| Explore concurrency in SwiftUI | 2025 | wwdc2025-266 | @Observable migration for HealthKitService |
| Explore new advances in App Intents | 2025 | wwdc2025-275 | Sleep check-in Intent with interactive snippet |
| Profile and optimize power usage in your app | 2025 | wwdc2025-226 | HealthKit observer query power impact |
| Finish tasks in the background | 2025 | wwdc2025-227 | Background HealthKit refresh scheduling |

**Concrete quick wins:**
1. Fix the `HKObserverQuery` retain cycle — add `[weak self]` to the outer closure.
2. Raise Package.swift deployment to `.iOS(.v17), .macOS(.v14)` to unlock `@Observable`.

---

## Brief Audits

### EmotionGuesser

**What it does:** Turn-based GameKit game where players photograph their own face expressing an emotion, then opponents guess which emotion it is. Supports online (GameKit async match), pass-and-play, solo practice, and head-to-head analytics.

**Tech stack:** SwiftUI + `@Observable` (correctly used) + GameKit + Vision (selfie JPEG encoding) + StoreKit 2.

**Top issues:**
- No Game Center Challenges or Activities (wwdc2025-214) — the head-to-head analytics store tracks win/loss data that would feed directly into Challenges
- No integration with the Apple Games app visibility signals (wwdc2025-215)
- `SelfieMatchEncoding` uses iterative JPEG recompression loop (up to 14 attempts); Vision's `VNGeneratePersonSegmentationRequest` could be used to strip backgrounds before encoding, reducing payload size more deterministically
- `ObservableObject` is correctly removed in favor of `@Observable` — this is the fleet's best example of correct modern state management

**Recommended sessions:** wwdc2025-214, wwdc2025-215, wwdc2025-209 (Game Mode), wwdc2025-277 (SpeechAnalyzer for emotion audio cues).

---

### ReactionTime (ios-greenfield-game)

**What it does:** Reaction-time arcade game with organic water-motion visual effects. GameKit leaderboard integration. Custom design system (Typography, Palette, Spacing, Motion).

**Tech stack:** SwiftUI + `ObservableObject`/Combine (not migrated) + GameKit.

**Top issues:**
- `AppModel`, `AppSettings`, `GameCenterAuth`, `WaterMotionEngine` all use `ObservableObject` — the fleet's clearest migration candidate per wwdc2025-266
- No `LSSupportsGameMode = true` in plist (wwdc2025-209) — this game would benefit most from Game Mode
- `WaterMotionEngine` uses `Timer.publish` from Combine for animation ticks; migrating to SwiftUI `TimelineView` or `PhaseAnimator` (iOS 17+) would eliminate Combine dependency and integrate better with the render loop

**Recommended sessions:** wwdc2025-266 (concurrency/Observable migration), wwdc2025-209 (Game Mode), wwdc2025-256 (SwiftUI animation APIs).

---

### GravatarNativeOptimizer

**What it does:** macOS/iOS app that records a short looping video for Gravatar animated profile photos, exports as GIF/animated JPEG, optionally writes vCard/NFC tag, and manages OAuth2 tokens for Gravatar API.

**Tech stack:** SwiftUI + AVFoundation (`CameraLoopRecorder`) + CoreImage + CoreNFC + StoreKit 2 + hand-rolled OAuth2.

**Top issues:**
- Hand-rolled OAuth (`OAuthAuthenticator.swift`) instead of `ASWebAuthenticationSession` — the system handler manages cookies, Safe Browsing, and redirect URIs correctly; wwdc2025-279 ("What's new in passkeys") covers authentication best practices
- `PersonSegmentation.swift` uses Vision's `VNGeneratePersonSegmentationRequest` — already modern, but could be enhanced with Foundation Models to generate personalized backdrop suggestions (wwdc2025-286)
- No `@Observable` anywhere — all classes use `ObservableObject`
- `DNSAuditor.swift` — unclear what this does in a Gravatar profile app; likely dead code

**Recommended sessions:** wwdc2025-266 (Observable), wwdc2025-286 (Foundation Models for backdrop suggestions), wwdc2025-279 (passkeys/auth).

---

### ClawBar

**What it does:** macOS menu bar item manager — discovers, groups (visible/hidden/always-hidden), and reorders menu bar items via AXUIElement accessibility API. Global hotkey via Carbon `RegisterEventHotKey`.

**Tech stack:** SwiftUI `MenuBarExtra` + AppKit + Carbon hotkey + AXUIElement + `@Observable`.

**Top issues:**
- `ClipboardMonitor.startMonitoring()` uses `Timer.scheduledTimer(withTimeInterval: 0.5, ...)` polling — replace with `NSPasteboard.changedNotification` observation (not available on macOS for general pasteboard, but the changeCount check could be moved to a `NSWorkspace` or Carbon event hook for lower CPU)
- Carbon `RegisterEventHotKey` is a 2003-era API; `NSEvent.addGlobalMonitorForEvents(matching: .keyDown, handler:)` or `KeyboardShortcuts` package is the modern approach
- The 3-second AXUIElement scan timer has no exponential backoff when accessibility permission is revoked — it will spin at 3Hz logging errors
- `CLAUDE.md` in the repo is a detailed architecture doc — this is correct practice for AI-assisted maintenance

**Recommended sessions:** wwdc2025-256 (Liquid Glass MenuBarExtra styling), wwdc2025-229 (macOS accessibility best practices).

---

### ClawBoard

**What it does:** macOS clipboard history palette — monitors `NSPasteboard`, stores last N text clips, shows in a floating palette window.

**Tech stack:** SwiftUI + AppKit + `@Observable`.

**Top issues:**
- Same `Timer`-based pasteboard polling as ClawBar (identical anti-pattern, different target)
- `BoardStore` and `ClipboardMonitor` likely share 80% of their logic with ClawBar's equivalent classes — a shared SPM library would DRY this
- No rich media support (images, files) — only string clips

---

### ClawSnap

**What it does:** macOS window tiling manager — maps keyboard shortcuts to tiling actions (half left, half right, maximize, thirds, etc.) using AXUIElement window manipulation.

**Tech stack:** SwiftUI + AppKit + AXUIElement + `@Observable`.

**Top issues:**
- No awareness of Stage Manager state — snapping windows while Stage Manager is active can produce unexpected layouts; the `NSWorkspace` Stage Manager API should be checked before applying tiling
- `ScreenGeometry` calculations are tested well (`ScreenGeometryTests.swift`) — one of the more test-complete Claw tools
- AX window move/resize is synchronous — could block main thread under slow window server response

---

### ClawTab

**What it does:** macOS window switcher — custom Cmd+Tab replacement with window thumbnails, filtering by app.

**Tech stack:** SwiftUI + AppKit + AXUIElement.

**Top issues:**
- `WindowListService` enumerates windows via `CGWindowListCopyWindowInfo` — this function is deprecated in macOS 15 in favor of the new Screen Capture Kit window listing API (`SCShareableContent`)
- Thumbnail generation likely uses `CGWindowListCreateImage` — also deprecated in macOS 15 in favor of `SCScreenshotManager`
- `SwitcherOverlayView` rendering timing (key-down latency to overlay display) needs profiling with wwdc2025-306's SwiftUI instrument

---

### ClawExplorer

**What it does:** macOS file/project browser accessible from the menu bar — pinned folders, recent projects, quick open.

**Tech stack:** SwiftUI + AppKit + `@Observable` + security-scoped bookmarks.

**Top issues:**
- No Quick Look integration (QLPreviewPanel) for file previews
- No Spotlight index integration — can't surface files from Spotlight results
- File system reads not using `FileManager` async APIs or Actor isolation — risk of main thread I/O on large directories

---

### ClawSentinel

**What it does:** Unclear — only one Swift file found (`ClawSentinelApp.swift`). Appears to be a skeleton/placeholder.

**Top issues:** Effectively empty. No functional code to audit.

---

### InstantMemory

**What it does:** Minimal macOS clipboard manager — 2 source files (`ClipboardItem.swift`, `ClipboardService.swift`, `InstantMemoryApp.swift`, `ContentView.swift`).

**Top issues:** Feature-incomplete skeleton. Same pasteboard polling pattern as ClawBar/ClawBoard. No persistence layer. Should be merged into ClawBoard or deleted.

---

### MartialArtsVideoApp

**What it does:** iOS video curriculum player for martial arts instruction — YouTube embedded player, native AVFoundation player fallback, lesson progress tracking, StoreKit 2 section unlock.

**Tech stack:** SwiftUI + AVFoundation + `WKWebView` (YouTube embed) + StoreKit 2 + `@Observable`.

**Top issues:**
- `nonisolated(unsafe) private var updatesTask: Task<Void, Never>?` in `StoreManager` — this is a workaround for actor isolation on `Task.detached`. The correct pattern is `@MainActor` on the class + structured `Task { }` without `detached` (wwdc2025-266)
- No Picture-in-Picture (`AVPictureInPictureController`) — critical for a video learning app; users need to practice techniques while watching
- `YouTubePlayerView` is a `UIViewRepresentable` wrapping `WKWebView` — this should be migrated to the new `WebKit for SwiftUI` API (`WebView` from wwdc2025-231) when targeting iOS 26+
- No AVKit chapter markers or playback speed controls exposed to user

**Recommended sessions:** wwdc2025-231 (Meet WebKit for SwiftUI), wwdc2025-266 (StoreManager actor isolation), wwdc2025-319 (video capture for user-recorded technique reviews).

---

### ClawDisplay

**Note:** The provided path `/Users/scottmanthey/craw-repos/ClawDisplay` has a typo (`craw` instead of `claw`). The directory does not exist. Verify the correct path before auditing.

---

## Cross-Fleet Recommendations

### 1. ObservableObject → @Observable migration (affects 6 apps)

`ReactionTime`, `sleep-coach`, `GravatarNativeOptimizer`, and partially `MartialArtsVideoApp` still use `ObservableObject` + `@Published`. Every `@Published` change triggers all view subscribers; `@Observable` tracks only properties accessed by each view body. This is the single highest-ROI refactor across the fleet.

**Session:** wwdc2025-266 "Explore concurrency in SwiftUI" (Chapter: Main-actor Meadows, timestamp 0:02:13) — covers the exact migration pattern and Swift 6.2 implicit `@MainActor` mode.

Migration is mechanical:
- Remove `: ObservableObject`, add `@Observable`
- Remove `@Published` from each property
- Change `@StateObject` injection to `@State` at App level
- Change `@ObservedObject` to no wrapper (or `@Bindable` for two-way binding)

### 2. No app in the fleet uses App Intents (affects all consumer apps)

SlideTac, EphemeralVoice, ScreenshotNotes, SafeFrameCamera, sleep-coach, EmotionGuesser, ReactionTime — none have App Intents. WWDC 2025-275 shows that App Intents with interactive snippets now surface in Spotlight, Siri, the Action button, and Visual Intelligence. For habit apps (sleep-coach, EphemeralVoice), a "Log morning reflection" or "Send voice message" intent provides daily engagement without requiring the user to open the app.

**Session:** wwdc2025-275 "Explore new advances in App Intents" + wwdc2025-244 "Get to know App Intents."

### 3. No app in the fleet uses Foundation Models for on-device AI (1 app is ready, none use it in prod)

SafeFrameCamera has a `FoundationModels` import with `#available(iOS 26, *)` gating — the most advanced AI integration in the fleet. ScreenshotNotes, EphemeralVoice, and sleep-coach all have classification/coaching/summarization use cases that map directly to `LanguageModelSession` guided generation (wwdc2025-286). The 3B-parameter on-device model is optimized for classification, extraction, and summarization — precisely these apps' needs.

**Session:** wwdc2025-286 "Meet the Foundation Models framework" + wwdc2025-259 "Code-along: Bring on-device AI to your app."

### 4. Game Center apps missing Apple Games app visibility signals (3 apps)

SlideTac, EmotionGuesser, and ReactionTime all integrate GameKit but none have:
- `LSSupportsGameMode = true` in their Info.plist
- Game Center Challenges
- Game Center Activities
- Leaderboard-driven push notifications for "friend stole your top spot"

WWDC 2025-214 ("Get started with Game Center") and 2025-215 ("Engage players with the Apple Games app") explicitly document that the new Apple Games app (pre-installed on iOS/iPadOS/macOS starting Fall 2025) surfaces games with more Game Center features higher. Each feature added increases surface area in the Games app.

**Session:** wwdc2025-214, wwdc2025-215, wwdc2025-209.

### 5. Camera apps missing capture controls API (2 apps: SafeFrameCamera, EmotionGuesser)

Both apps present a camera view without physical button support. WWDC 2025-253 ("Enhancing your camera experience with capture controls") shows `AVCaptureEventInteraction` maps volume buttons and iPhone 16 Camera Control to custom capture actions. For content creators (SafeFrameCamera) and selfie games (EmotionGuesser), physical trigger support is a significant UX improvement.

**Session:** wwdc2025-253.

### 6. macOS Claw tools: timer-based pasteboard polling is an anti-pattern (3 tools)

ClawBar, ClawBoard, and InstantMemory all poll `NSPasteboard.general.changeCount` via `Timer.scheduledTimer`. This fires 2–120 times per minute depending on the interval, even when the user hasn't copied anything. The correct pattern is `NSPasteboard.readObjectsForClasses` with a `changeCount` check inside a `DistributedNotificationCenter` or `NSWorkspace.shared.notificationCenter` observer for clipboard-change events (where available), or using the Carbon `kEventClassHIObject` pasteboard change event on macOS.

### 7. StoreKit 2 `currentEntitlements` API deprecation affects 5 apps

SlideTac, LocalizeShots, EphemeralVoice, ScreenshotNotes, and SafeFrameCamera all iterate `Transaction.currentEntitlements` (the full-sequence form). As of iOS 18.4, the productID-keyed `Transaction.currentEntitlements(productID:)` overload is the preferred API per wwdc2025-241. Migrating is a one-line change per product ID.

### 8. Liquid Glass design system: all iOS apps need recompile audit

WWDC 2025-256 and 2025-356 document that recompiling against the iOS/iPadOS/macOS 26 SDK automatically adopts Liquid Glass tab bars, navigation containers, and toolbar styling. All consumer iOS apps in the fleet (SlideTac, EphemeralVoice, ScreenshotNotes, SafeFrameCamera, EmotionGuesser, ReactionTime, MartialArtsVideoApp) will have visual changes on first recompile. Custom backgrounds, blur effects, and overlay views should be audited against the new compositor before shipping an iOS 26 build.

**Session:** wwdc2025-256 (Chapter: Make the new design shine, timestamp 0:01:22), wwdc2025-356 "Get to know the new design system."

---

*End of audit. All session citations are from wwdc-mcp-server index (122 sessions, WWDC 2025). Session URLs verified via `wwdc_get_session` with transcript coverage confirmed.*
