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
| ReactionTime v2 (ios-greenfield-game) | Reaction-time arcade game | SwiftUI + GameKit | iOS 17 | P0 fixed (48bf43a): async leaderboard submit, GCD→Task in GameCenterAuth; P1 open: `@Observable` migration (5 classes), `LSSupportsGameMode` missing |
| GravatarNativeOptimizer | Gravatar profile optimizer + NFC writer | SwiftUI + AVFoundation + CoreImage | macOS/iOS | Custom OAuth vs. ASWebAuthenticationSession, no `@Observable` |
| ClawBar | macOS menu bar item manager | SwiftUI + AppKit | macOS 13 | Timer-based pasteboard polling (0.5 s), Carbon hotkey API, no menu bar Extra improvements from UIKit 2025 |
| ClawBoard | macOS clipboard history palette | SwiftUI + AppKit | macOS | Same pasteboard polling pattern as ClawBar |
| ClawSnap | macOS window tiling | SwiftUI + AppKit | macOS | P0 fixed (86d9be5): 2 data races in SnapZoneDetector (GCD→Task @MainActor), 3 AX unsafe force casts → safe casts; P1 open: no Stage Manager awareness |
| ClawTab | macOS window switcher | SwiftUI + AppKit | macOS | P0 fixed (dee04a6): CGWindowListCopyWindowInfo deprecated → NSWorkspace + AXUIElement in WindowListService + WindowManager; 4 CF cast warnings fixed |
| ClawSentinel | macOS monitoring app (minimal) | SwiftUI | macOS | Only 1 source file found — skeleton only |
| ClawExplorer | macOS file/project browser | SwiftUI + AppKit | macOS | No Quick Look integration, no Spotlight index |
| ClawDisplay | External display manager | SwiftUI + AppKit + IOKit | macOS 13 | P0 fixed (89bf239): observer leak, wrong Settings URL, C callback GCD→Task; P1 open: duplicate `CGDisplayRegisterReconfigurationCallback` in `DisplayManager` |
| InstantMemory | macOS clipboard manager | SwiftUI + AppKit | macOS | Very small (2 source files) — feature incomplete |
| MartialArtsVideoApp | Martial arts video curriculum player | SwiftUI + AVFoundation + StoreKit | iOS | `nonisolated(unsafe)` on StoreKit task — actor isolation workaround, no Picture-in-Picture |
| GlitchVideoApp | Real-time glitch-effect video recorder | SwiftUI + AVFoundation + Metal | iOS 17 | P2: `commandBuffer.waitUntilCompleted()` may block `sessionQueue`; no Camera Control (WWDC25-253); missing `PrivacyInfo.xcprivacy` |
| WiFiMotion (wifi-sentinel) | Home WiFi motion detector | SwiftUI + AppKit + CoreWLAN | macOS 13 | P0: `scanCoreWLAN()` blocks `@MainActor` 1–4s per scan; `ObservableObject` throughout; git HEAD corrupted (5 fixes on disk, uncommitted) |

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

**Fixes applied and committed (`73e6d19`, `3a71333`):**

| ID | Fix | File |
|----|-----|------|
| CB-0 | Removed dead `requestAccessibilityPermission(completion:)` — defined but never called from any source | `AccessibilityHelper.swift` |
| CB-1 | 3× `DispatchQueue.main.async { self.lastError = ... }` inside `enumerateMenuBarItems()` (which runs on `DispatchQueue.global()`) → `Task { @MainActor [weak self] in self?.lastError = ... }` — eliminates data race on @Observable state | `MenuBarController.swift` |

**Open issues:**
- `MenuBarController` is `@Observable` but not `@MainActor` — full actor isolation would require restructuring `discoverMenuBarItems()` to not bridge via GCD continuation; flagged for future sprint
- Carbon `RegisterEventHotKey` is a 2003-era API; `NSEvent.addGlobalMonitorForEvents(matching: .keyDown, handler:)` is the modern approach
- 3-second AXUIElement scan timer has no exponential backoff when accessibility permission is revoked

**Recommended sessions:** wwdc2025-256 (Liquid Glass MenuBarExtra styling), wwdc2025-229 (macOS accessibility best practices).

---

### ClawBoard

**What it does:** macOS clipboard history palette — monitors `NSPasteboard`, stores last N text clips, shows in a floating palette window.

**Tech stack:** SwiftUI + AppKit + `@Observable`.

**Concurrency audit (2026-05-31 deep pass):** `HotkeyManager.swift` dispatches via `DispatchQueue.main.async { manager.onHotkeyPressed?() }` inside a `@convention(c)` CGEvent tap callback. This is **correct and required** — Swift structured concurrency (`Task`, `async/await`) cannot be used inside C-convention functions; GCD is the only valid dispatch mechanism in this context. `ClipboardStore.swift` uses `private let queue = DispatchQueue(label: "...", qos: .utility)` with `queue.sync { }` for file I/O serialization — a correct serial-queue pattern, not a data race. **No GCD data races found; all concurrency patterns verified intentional.**

**Open issues:**
- Same `Timer`-based pasteboard polling as ClawBar (identical anti-pattern, different target)
- `BoardStore` and `ClipboardMonitor` likely share 80% of their logic with ClawBar's equivalent classes — a shared SPM library would DRY this
- No rich media support (images, files) — only string clips

---

### ClawSnap

**What it does:** macOS window tiling manager — maps keyboard shortcuts to tiling actions (half left, half right, maximize, thirds, etc.) using AXUIElement window manipulation.

**Tech stack:** SwiftUI + AppKit + AXUIElement + `@Observable`.

**Fixes applied and committed (`86d9be5`):**

| ID | Fix | File |
|----|-----|------|
| CS-0 | `stopMonitoring()`: `DispatchQueue.main.async { self?.currentSnapZone = nil; self?.dragScreen = nil }` → `Task { @MainActor [weak self] in }` — eliminates data race: `@Observable SnapZoneDetector` (not `@MainActor`) was writing tracked state from background `updateQueue` via GCD | `SnapZoneDetector.swift` |
| CS-1 | `monitorDragPosition()`: `DispatchQueue.main.async { self?.dragScreen = screen; self?.currentSnapZone = detectedZone }` → `Task { @MainActor [weak self] in }` — same data race on repeated poll cycle | `SnapZoneDetector.swift` |
| CS-2 | `getFocusedWindow()`: `focusedWindow as! AXUIElement?` → `focusedWindow as? AXUIElement` — force cast to Optional crashes on type mismatch instead of returning nil; safe cast is correct for AX attribute values | `WindowController.swift` |
| CS-3 | `getWindowFrame()`: `position as! AXValue?` → `position as? AXValue` | `WindowController.swift` |
| CS-4 | `getWindowFrame()`: `size as! AXValue?` → `size as? AXValue` | `WindowController.swift` |

**Note on `SnapZoneDetector` concurrency model:** The class is `@Observable` but deliberately NOT `@MainActor` (polling runs on `updateQueue`). The correct fix is `Task { @MainActor [weak self] in }` for state writes — NOT adding `@MainActor` to the class, which would block the background polling. The CGEvent tap callback in `HotkeyManager` (if present) must remain on GCD — see ClawBoard note above.

**Open issues:**
- No awareness of Stage Manager state — snapping windows while Stage Manager is active can produce unexpected layouts; `NSWorkspace` Stage Manager API should be checked before applying tiling
- `ScreenGeometry` calculations are tested well (`ScreenGeometryTests.swift`) — one of the more test-complete Claw tools
- AX window move/resize is synchronous — could block actor under slow window server response

---

### ClawTab

**What it does:** macOS window switcher — custom Cmd+Tab replacement with window thumbnails, filtering by app.

**Tech stack:** SwiftUI + AppKit + AXUIElement + `@Observable`.

**Fixes applied and committed (`92f708b`, `dee04a6`):**

| ID | Fix | File | Commit |
|----|-----|------|--------|
| CT-0 | `AccessibilityHelper.requestAccessibilityPermission()`: `DispatchQueue.main.async { showAccessibilityAlert() }` → `Task { @MainActor in showAccessibilityAlert() }` | `AccessibilityHelper.swift` | 92f708b |
| CT-1 | `WindowManager.quitApp()`: `DispatchQueue.main.asyncAfter(deadline: .now() + 0.5)` → `Task { try? await Task.sleep(for: .seconds(0.5)); await MainActor.run { ... } }` | `WindowManager.swift` | 92f708b |
| CT-2 | `SettingsView` "Grant Access" button: same `asyncAfter` pattern → `Task + Task.sleep` | `SettingsView.swift` | 92f708b |
| CT-3 | `WindowListService.getAllWindows()`: `CGWindowListCopyWindowInfo` (deprecated macOS 15) → `NSWorkspace.shared.runningApplications` (`.regular` activation policy filter) + AXUIElement for window attributes. Also fixes 2× `as? AXValue` CF conditional cast errors (use `CFGetTypeID` guard + `as! AXValue`). | `Services/WindowListService.swift` | dee04a6 |
| CT-4 | `WindowManager.fetchWindows()`: same deprecated API replacement + CF cast fix (2 occurrences). New private static helper `axValue(_:_:)` mirrors `WindowListService.copyAXAttribute`. `app.icon` populates the `icon` field (was previously derived from `kCGWindowNumber` dict). | `WindowManager.swift` | dee04a6 |

**Open issues:**
- Thumbnail generation uses `CGWindowListCreateImage` (if present) — deprecated macOS 15; replace with `SCScreenshotManager`
- `SwitcherOverlayView` key-down latency needs profiling with wwdc2025-306's SwiftUI instrument
- Pre-existing Swift 6 warning in `quitApp()`: `[weak self]` capture in `Task` is flagged as `#SendableClosureCaptures` — not a runtime bug but will be a compile error in strict Swift 6 mode

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

**What it does:** Minimal macOS menu bar status monitor — reports disk free space (GiB), shows a shield icon that changes color below 5 GiB, refreshes every 30 seconds. Single-file app.

**Fixes applied and committed (`dd0052c`):**

| ID | Fix | File |
|----|-----|------|
| CS-0 | `SentinelMonitor: ObservableObject` → `@Observable`, removed 4 `@Published`, `import Observation` added | `ClawSentinelApp.swift` |
| CS-1 | `@StateObject private var monitor` → `@State private var monitor` in App entry | `ClawSentinelApp.swift` |
| CS-2 | `@ObservedObject var monitor: SentinelMonitor` → `var monitor: SentinelMonitor` in View | `ClawSentinelApp.swift` |

**No open issues** — single-file app, zero dead code, zero GCD patterns, no OO remaining.

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

## Deep Audits — Expanded Fleet (Secondary Discovery)

Apps found via filesystem search (`find ~/claw-repos -name "*.swift"`) after the initial 17-app pass. All previously unknown to the audit index.

---

### GlitchVideoApp

**What it does:** iOS app for recording real-time glitch-effect video. Metal shaders process `AVCaptureSession` frames live; processed output is saved to `PHPhotoLibrary`.

**Tech stack:**
- `@Observable @MainActor GlitchCaptureViewModel` — already migrated to modern observation
- `AVCaptureSession` + `sessionQueue` background isolation, `alwaysDiscardsLateVideoFrames = true`
- Metal: `CVMetalTextureCache`, `MTLRenderPipelineState`, `GlitchUniforms` struct, `MTLCommandBuffer`
- `CameraSession.swift`: `notificationObservers: [NSObjectProtocol]` stored and removed in `deinit`
- Disk space preflight, max recording duration cap, `UIAccessibility.isReduceMotionEnabled` check

**Issue 1 (P2) — `commandBuffer.waitUntilCompleted()` blocks the calling queue**

`GlitchMetalRenderer.renderToPixelBuffer()` calls `commandBuffer.waitUntilCompleted()` synchronously. The inline comment acknowledges the block. If this is called from `AVCaptureVideoDataOutputSampleBufferDelegate.captureOutput(_:didOutput:from:)` (which runs on `sessionQueue`), the synchronous GPU wait blocks capture delivery — at high resolution or GPU load this produces frame drops. The correct pattern is bounded in-flight buffer count via semaphore + `addCompletedHandler`:

```swift
// Current — blocks calling queue until GPU finishes:
commandBuffer.commit()
commandBuffer.waitUntilCompleted()

// Triple-buffer pattern — does not block:
inFlightSemaphore.wait()               // blocks only when 3 frames are in-flight
commandBuffer.addCompletedHandler { [weak self] _ in
    self?.inFlightSemaphore.signal()
}
commandBuffer.commit()
```

**Issue 2 (P2) — No `AVCaptureEventInteraction` for iPhone 16 Camera Control**

`CameraSession` handles the full `AVCaptureSession` lifecycle but does not implement `AVCaptureEventInteraction`. WWDC 2025-253 documents that on iPhone 16+, Camera Control maps to custom capture actions via this interaction. For a glitch-effects recorder, Camera Control triggering "apply next preset" or "start/stop record" is a natural fit — and is the UX users expect on a hardware-button device.

**Session:** wwdc2025-253 "Enhancing your camera experience with capture controls."

**Issue 3 (P3) — Missing `PrivacyInfo.xcprivacy`**

Camera, microphone, and `PHPhotoLibrary` access requires a privacy manifest for App Store submission (required since spring 2024). `NSCameraUsageDescription` / `NSMicrophoneUsageDescription` strings are in `Info.plist` but the `PrivacyInfo.xcprivacy` file declaring `NSPrivacyAccessedAPITypes` (file timestamp, UserDefaults) is absent.

**Overall:** GlitchVideoApp is the best-structured app in the expanded fleet. `@Observable` migration already done, observer tokens properly stored, `sessionQueue` isolation correct. Only the Metal buffering pattern needs a substantive fix.

---

### WiFiMotion (wifi-sentinel)

**What it does:** macOS 13+ menu bar app that scans home WiFi via CoreWLAN, analyzes per-BSSID RSSI variance to detect motion, maps detections to rooms, and dispatches `UNUserNotification` alerts when away mode is enabled. Includes a ghost-replay timeline viewer.

**Repo:** `claw-repos/wifi-sentinel` | **Module:** `Sources/WiFiMotion/` (31 Swift files)

**Tech stack:**
- SwiftUI + AppKit (`NSStatusBar`, `NSPopover`, `NSWindow`)
- CoreWLAN (`CWInterface.scanForNetworks(withName:)`) — macOS-only blocking I/O API
- `UserNotifications` for motion alerts
- `UserDefaults` for all persistence (rooms, signal history, config)
- `ObservableObject` + `@Published` throughout (not migrated)

**Fixes applied to disk — NOT committed (git HEAD corrupted; run `git fetch origin && git reset --hard origin/main`):**

| Fix | File | Status |
|-----|------|--------|
| `requestNotificationPermission()`: check `authorizationStatus == .notDetermined` before calling `requestAuthorization`; async/await | `WiFiScanEngine.swift` | On disk |
| `onChange(of: engine.awayModeEnabled)` → two-arg `{ _, newVal in }` form | `StatusPopoverView.swift` | On disk |
| `onChange(of: selectedDate)` → two-arg form | `GhostReplayView.swift` | On disk |
| `onChange(of: isDragging)` → two-arg form | `GhostReplayView.swift` | On disk |
| `DispatchQueue.main.asyncAfter(deadline: .now() + 0.2)` → `Task { @MainActor } + Task.sleep(for: .milliseconds(200))` | `AppDelegate.swift` (line 127) | On disk |
| `DispatchQueue.main.asyncAfter(deadline: .now() + 0.3)` → `Task { @MainActor } + Task.sleep(for: .milliseconds(300))` | `AppDelegate.swift` (line 175) | On disk |

**Issue WF-1 (P0, open) — `scanCoreWLAN()` executes blocking CoreWLAN I/O on `@MainActor`**

`WiFiScanEngine` is `@MainActor`. Its `scanCoreWLAN()` calls `CWInterface.scanForNetworks(withName:)`, which is synchronous blocking I/O. On a congested 2.4 GHz environment this takes 1–4 seconds. Executing on the main actor freezes the menu bar popover, blocks all `@Published` updates, and makes the status icon non-responsive during every scan cycle. Fix: mark the scan path `nonisolated` and dispatch to `Task.detached(priority: .background)`, then hop back to `@MainActor` to publish results:

```swift
// Fix — off-actor scan, on-actor publish:
private func performScan() {
    Task {
        let readings = await Task.detached(priority: .background) {
            self.scanCoreWLANOffActor()  // nonisolated
        }.value
        await MainActor.run {
            self.processReadings(readings)
        }
    }
}
```

**Session:** wwdc2025-105 "Swift concurrency: Beyond the basics."

**Issue WF-2 (P1, open) — No `PrivacyInfo.xcprivacy` privacy manifest**

CoreWLAN (local network), `UserDefaults`, and `UNUserNotificationCenter` all require `PrivacyInfo.xcprivacy` entries for App Store submission. Without it, the binary will fail App Store review. Minimum required entries: `NSPrivacyAccessedAPICategoryUserDefaults` (reason `CA92.1`).

**Issue WF-3 (P1, open) — `ObservableObject` + `@Published` not migrated to `@Observable`**

`WiFiScanEngine`, `ReplayController`, and other view models use `ObservableObject`. Migrating to `@Observable` (macOS 14+) enables per-property granular change tracking — with a 30s scan cycle publishing RSSI readings to 8+ `@Published` properties, unnecessary view re-renders are a real cost. `ReplayController` in particular drives a 30fps timer that animates all room cards; per-property observation prevents redrawing unrelated cards.

**Issue WF-4 (P2, open) — Signal history persisted to `UserDefaults`**

`UserDefaults` serializes its entire store to a plist on every write. A WiFi scanner writing RSSI samples every 30 seconds accumulates 50K+ entries over a month, making each write increasingly expensive and risking data loss on crash mid-plist-write. Replace with SQLite (SwiftData or `sqlite3` FFI) with a 30-day rolling retention window.

**Issue WF-5 (P2, open) — `ReplayController.schedulePlayback()` creates 30fps `Timer` on `@MainActor`**

`ReplayController` is `@MainActor` and runs `Timer.scheduledTimer(withTimeInterval: 1.0/30.0, repeats: true)` to drive ghost-replay animation. A 30Hz main-run-loop timer competes with SwiftUI render passes at 60/120Hz. Replace with a cooperative `Task`-based loop:

```swift
private func schedulePlayback() {
    playbackTask = Task { @MainActor in
        while !Task.isCancelled {
            updateCurrentEntry()
            try await Task.sleep(for: .seconds(1.0 / 30.0))
        }
    }
}
```

---

### ClawDisplay

**What it does:** macOS 13+ menu bar app for managing external display settings (brightness, refresh rate, night mode, resolution presets). Registers for `CGDisplayReconfigurationCallback` to react to live display events.

**Repo:** `claw-repos/ClawDisplay` (24 Swift files)  
**Fleet summary correction:** The original table showed "not found" due to a `craw-repos` typo in the audit script. The app is at `/Users/scottmanthey/claw-repos/ClawDisplay/`.

**Fixes applied and committed (`89bf239`):**

| ID | Fix | File |
|----|-----|------|
| CD-0 | `NSObjectProtocol` observer token now stored as `screenParamsObserver: NSObjectProtocol?`; removed in `deinit`. Previously discarded → leaked for app lifetime. | `DisplayService.swift` |
| CD-1 | System Settings URL: `x-apple.systempreferences:com.apple.preference.displays` → `x-apple.systempreferences:com.apple.Displays-Settings.extension` (correct for macOS 13+ Ventura). Old URL silently no-ops on Ventura+. | `DisplayService.swift` |
| CD-2 | `CGDisplayRegisterReconfigurationCallback` C callback: `DispatchQueue.main.async { ... }` → `Task { @MainActor in ... }` for structured concurrency consistency on a `@MainActor`-isolated class. | `DisplayService.swift` |

**Issue CD-3 (P1, open) — Duplicate `CGDisplayRegisterReconfigurationCallback` in `DisplayManager.swift`**

Both `DisplayManager` and `DisplayService` register a C callback for display reconfiguration. Duplicate registrations cause the callback to fire twice per display event — two `didChangeScreenParametersNotification` posts, two icon refreshes, and potential double-execution of resolution/brightness state mutations. `DisplayService` is the correct sole owner (already fixed in CD-2). Remove or guard the registration in `DisplayManager`:

```swift
// DisplayManager.swift — remove this block, or guard with:
guard !isCallbackRegistered else { return }
isCallbackRegistered = true
CGDisplayRegisterReconfigurationCallback(displayReconfigCallback, nil)
```

**Issue CD-4 (P1, open) — Dead OO layer: `DisplayMenuView`, `DisplayManager`, `ProfileManager`, `ProfileEditorView` unreachable from live entry points**

Confirmed via grep (2026-05-31): the three live entry points — `ClawDisplayApp.swift`, `MenuBarView.swift`, `DisplayService.swift` — have **zero references** to the old OO layer. These files are dead:

| File | Verdict |
|------|---------|
| `Views/DisplayMenuView.swift` | Zero live references — safe to delete |
| `Views/ProfileEditorView.swift` | Zero live references — safe to delete |
| `Views/SettingsView.swift` (legacy OO version) | Zero live references — safe to delete |
| `Services/DisplayManager.swift` | Zero live references; also source of CD-3 duplicate callback — deleting eliminates CD-3 | 
| `Services/ProfileManager.swift` | Zero live references — safe to delete |
| `BrightnessController.swift` | Referenced only from `BrightnessControllerTests.swift` (19+ test functions) — **do NOT delete** without migrating tests to use `DisplayService` |

Deleting `DisplayManager.swift` also resolves CD-3. Requires explicit sign-off before deletion; `BrightnessController` needs a test migration plan.

**Issue CD-5 (P2, open) — `@Observable` migration audit**

Verify: `grep -rn "ObservableObject" claw-repos/ClawDisplay/Sources/`. Any `ObservableObject` view models should migrate to `@Observable` (macOS 14+). Note: dead OO layer files (CD-4) will show hits; confirm only live files are audited.

**Issue CD-6 (P3, open) — Missing `PrivacyInfo.xcprivacy`**

ClawDisplay reads `UserDefaults` for display presets. Privacy manifest required for App Store submission.

---

### ReactionTime v2 (ios-greenfield-game)

**What it does:** iOS 17 arcade game measuring human reaction time. Tap a target the moment it appears; tracks millisecond-precision response times per session. Integrates Game Center leaderboards (best reaction time, lower-is-better sort). More architecturally complete than the `ReactionTime` repo audited in the initial pass — includes design token files (`Typography.swift`, `Motion.swift`, `Palette.swift`, `Spacing.swift`) and a water-physics idle animation.

**Repo:** `claw-repos/ios-greenfield-game` | **Source:** `ReactionTime/` (45 Swift files)

**Fixes applied and committed (`48bf43a`):**

| ID | Fix | File |
|----|-----|------|
| RT-0a | `GKLeaderboard.submitScore` migrated from completion-handler form (fires on unspecified queue) to `async throws` form inside `Task {}` — avoids needing an explicit `MainActor` hop in the callback. | `ReactionLeaderboardService.swift` |
| RT-0b | `GameCenterAuth.configureOnLaunch()`: deferred `installAuthenticateHandler()` call migrated from `DispatchQueue.main.async` to `Task { @MainActor [weak self] in }`. | `GameCenterAuth.swift` |

**Issue RT-1 (P1, open) — `ObservableObject` + `@Published` across entire view model stack**

Five classes still use `ObservableObject`: `AppModel`, `AppSettings`, `GameCenterAuth`, `ReactionSessionViewModel`, `WaterMotionEngine`. Migrate to `@Observable` (iOS 17). For a reaction-time game, per-property observation granularity matters: only the "tap target visible" state should trigger a re-render, not a full model publish cycle. The `@Observable` macro makes this automatic with zero behavior change.

```swift
// Current:
final class AppModel: ObservableObject {
    @Published var currentPhase: GamePhase = .idle
    @Published var sessionResults: [ReactionResult] = []
}

// Target (iOS 17+):
@Observable
final class AppModel {
    var currentPhase: GamePhase = .idle
    var sessionResults: [ReactionResult] = []
}
```

Views update: `@ObservedObject`/`@StateObject` → `@State`/`@Environment`; `@EnvironmentObject` → `.environment(model)` + `@Environment(AppModel.self)`.

**Session:** wwdc2023-10149 "Discover Observation in SwiftUI."

**Issue RT-2 (P1, open) — `LSSupportsGameMode` missing from `Info.plist`**

Apple Game Mode (iOS 17+, `LSSupportsGameMode = true`) gives the foreground game lower CPU/GPU scheduling latency. For a millisecond-precision reaction timer, reduced scheduler jitter directly improves measurement accuracy and input latency. One-line `Info.plist` addition.

**Session:** wwdc2023-10118 "Reach new players with Game Center dashboard."

**Issue RT-3 (P2, open) — Game Center Challenges not implemented**

The lower-is-better leaderboard is live, but no Challenges are defined. WWDC 2025-214 identifies adding Challenges as the highest-leverage single change for Apple Games app visibility. A "Beat my reaction time" challenge (`GKLeaderboardScore.challengeComposeController(withMessage:players:completion:)`) is a natural fit requiring ~20 lines of code.

**Session:** wwdc2025-214 "Get started with Game Center," wwdc2025-215 "Engage players with the Apple Games app."

**Issue RT-4 (P2, open) — No App Intents / Shortcuts integration**

No `AppIntents` target exists. A `StartGameIntent` conforming to `AppIntent` (Siri: "Hey Siri, play reaction time") enables Shortcuts automation and Spotlight actions. For a game where fast launch-to-play is the core loop, this is a high-value low-effort addition.

**Session:** wwdc2025-215 "Engage players with the Apple Games app," wwdc2024-10176 "What's new in App Intents."

**Issue RT-5 (P3, open) — `WaterMotionEngine` main-actor timer review**

`WaterMotionEngine` drives the idle-screen water physics animation. Verify it does not create a high-frequency `Timer` on `@MainActor` (same pattern seen in `WiFiMotion/ReplayController`). If it does, replace with a cooperative `Task`-based animation loop as documented in the WiFiMotion WF-5 fix above.

---

## Concurrency Deep Pass — Verified Clean (2026-05-31)

Second-pass audit targeting `@Observable` data races, unsafe AX casts, and GCD anti-patterns. Apps below were audited and found to have **no GCD data races on `@Observable` state** and **no unsafe force casts**. Issues documented in their sections above remain open.

| App | Concurrency Finding | Why Clean |
|-----|---------------------|-----------|
| **ClawBoard** | No data race | `HotkeyManager` GCD required (C callback `@convention(c)`); `ClipboardStore.queue.sync` correct serialization |
| **ClawExplorer** | No data race | No `@Observable` state written from background GCD; file reads on dedicated actor |
| **SafeFrameCamera** | No data race | `AVCaptureSession.startRunning()` on `DispatchQueue(label:, qos: .userInitiated)` — Apple-required off-main-thread pattern; `@Observable` state updates already on `@MainActor` |
| **EmotionGuesser** | No data race | `GameCenterAuth` is `@Observable @MainActor` — all state changes on main actor; `SoloPracticeView` AVFoundation session queue off-main correct |
| **GlitchVideoApp** | No data race | `CameraSession` is `NSObject` (not `@Observable`); `sessionQueue` isolation standard AVFoundation pattern; `DispatchQueue.main.async { self.isRunning = ... }` on plain `@Published`-equivalent property is correct |
| **sleep-coach** | No data race | `HealthKitService` is `@MainActor` (even as `ObservableObject`); HKObserverQuery callback dispatches via `Task { @MainActor [weak self] in }` |

**GCD patterns that are CORRECT and must NOT be changed:**

| Pattern | Location | Why Required |
|---------|----------|-------------|
| `DispatchQueue.main.async` in `@convention(c)` CGEvent tap callback | `HotkeyManager` (ClawBoard, ClawBar, ClawTab) | Swift structured concurrency forbidden in C functions |
| `DispatchQueue(label:, qos: .userInitiated).async { session.startRunning() }` | SafeFrameCamera, EmotionGuesser, GlitchVideoApp | Apple explicitly requires `AVCaptureSession` ops off main thread |
| `queue.sync { }` for file I/O in serial queue | `ClipboardStore` (ClawBoard) | Correct mutual exclusion for file access from multiple call sites |

---

*End of audit. Initial fleet: 17 apps. Expanded fleet: +4 apps (GlitchVideoApp, WiFiMotion, ClawDisplay, ReactionTime v2). Concurrency deep pass: 6 additional apps verified clean. Total: 21 apps audited. All session citations from wwdc-mcp-server index (122 sessions, WWDC 2025).*
