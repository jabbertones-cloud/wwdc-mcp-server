# Swift Project Audit Matrix

Updated: 2026-06-02

Scope: Swift projects found under `/Users/scottmanthey/claw-architect` and `/Users/scottmanthey/claw-repos`.

Purpose: use `swift_app_audit` to improve Apple-platform apps, then feed repeated audit gaps back into `wwdc-mcp-server`.

## Data Coverage

Current local WWDC MCP index:

| Source | Count |
|---|---:|
| WWDC sessions | 561 |
| Apple tutorials | 184 |
| HIG entries | 167 |
| Swift Evolution proposals | 533 |
| Pathways | 18 |
| Sample code refs | 48 |

## Priority Order

1. Claw utility cluster: ClawBar, ClawBoard, ClawSnap, ClawTab, ClawDisplay, ClawExplorer.
2. ScreenshotNotes: iOS + macOS, AppIntents, capture, library, monetization.
3. SlideTac: iOS/macOS/tvOS, GameKit, StoreKit, ads, localization.
4. SafeFrameCamera: camera, capture, export, StoreKit.
5. EphemeralVoice: audio, push, deeplinks, monetization.

## First Batch: Claw Utility Cluster

All six audits returned `ready_for_code_review`, `confidence=high`, and zero caveats after MCP fixes.

| Project | Platform | Feature Areas | Audit Query | Top WWDC / Apple Evidence | Likely App Patch Areas | MCP Gaps / Learnings |
|---|---|---|---|---|---|---|
| ClawBar | macOS | menu bar, command palette, status item, windows, keyboard commands | `menu bar command palette status item window management keyboard commands` | HIG: The menu bar, Dark Mode, SF Symbols. Tutorials: Customizing menus, Supporting multiple windows. | command menu grouping, keyboard command discoverability, status-item menu polish, window lifecycle. | Need stronger macOS menu-bar pathway; top WWDC sessions still include some generic UIKit/iPad hits. |
| ClawBoard | macOS | clipboard, paste workflow, keyboard shortcuts, privacy | `clipboard board paste workflow keyboard shortcuts privacy` | HIG: Keyboards, The menu bar, Wallet. Tutorials: Persisting data, Loading reminders. | paste permissions/privacy copy, keyboard-first workflow, history empty/error states. | Need clipboard/paste-specific HIG/doc mapping; current HIG hit `Wallet` is weak. |
| ClawSnap | macOS | screenshot capture, annotation, export, menu workflow | `screenshot capture annotation export menu bar workflow` | WWDC: ScreenCaptureKit, HDR capture. HIG: Camera Control, Live Photos. Tutorials: Capturing and Saving a Photo. | ScreenCaptureKit path, export/share flow, annotation affordances, capture feedback. | Need screenshot/screen-capture archetype to weight ScreenCaptureKit above generic Mac/game results. |
| ClawTab | macOS | tab/window switcher, keyboard shortcuts, menu bar | `tab switcher window management keyboard shortcuts menu bar` | HIG: Multitasking, Context menus, Windows. Tutorials: Loading/editing reminders. | window switcher accessibility, keyboard focus order, context menus, background behavior. | Need Alt-Tab/window-switcher archetype and better macOS window-management session mapping. |
| ClawDisplay | macOS | display brightness, external monitors, profiles, menu bar controls | `display brightness profiles external monitors menu bar controls` | WWDC: Tailor macOS windows with SwiftUI, HDR dynamic image experiences, color consistency. Tutorials: Customizing menus. | color/HDR handling, external display profile states, menu bar controls, settings UI. | Need display/monitor archetype; HIG returned weak unrelated hits like ResearchKit/Game Center. |
| ClawExplorer | macOS | file explorer, sidebar navigation, drag/drop, keyboard commands | `file explorer sidebar navigation drag drop keyboard commands` | HIG: Sidebars, Tab bars, Mac Catalyst. WWDC: accessibility in SwiftUI, tab/sidebar iPadOS. | sidebar layout, drag/drop affordances, keyboard navigation, accessibility. | Need file-browser/finder-style archetype; should surface drag/drop docs and macOS table/sidebar sessions. |

## Next Batches

| Project | Platform | Feature Areas | Audit Query |
|---|---|---|---|
| ScreenshotNotes | iOS + macOS | AppIntents, screenshot capture, library, notes, monetization | `screenshot notes library app intents capture workflow monetization` |
| SlideTac | iOS + macOS + tvOS | GameKit, StoreKit, ads, localization, online match | `turn based game monetization leaderboard online match localization ads` |
| SafeFrameCamera | iOS + macOS | camera, AVFoundation, Photos, export, paywall | `camera capture framing export review paywall photos` |
| EphemeralVoice | iOS | audio session, push, deeplinks, replay, monetization | `voice audio session push notification deeplink replay monetization` |

## MCP Fixes Already Applied

- Fixed Swift Evolution ingest when GitHub contents API returns JSON as a string.
- Made tutorial ingest bounded with `WWDC_TUTORIAL_MAX_PAGES`.
- Added source coverage to `swift_app_audit`.
- Added app archetype query expansion for menu bar, clipboard, screenshot/capture, camera, game, voice/audio, and App Intents.
- Added app archetype query expansion for display/monitor, Finder-style file browser navigation, and window/app switcher.
- Added direct Apple doc hints for ScreenCaptureKit, NSPasteboard, NSStatusItem, NSWindow, NSScreen, App Intents, GameKit, StoreKit, AVFoundation, Photos, and adjacent file/navigation APIs.
- Added archetype-derived pathway hints and curated pathway rows.
- Added weak-hit diagnostics for unrelated HIG results.
- Fixed oversized JSON response truncation by returning a parseable compacted JSON envelope.
- Ranked feature/archetype hits ahead of generic SwiftUI results.
- Added inferred platform filtering when WWDC session platform metadata is empty.
- Ingested HIG, tutorials, Swift Evolution, and pathways into local `wwdc.db`.

## MCP Gaps Closed In This Pass

- `display/monitor` archetype now hints `NSScreen`, `ScreenCaptureKit`, display/HDR validation, and `macos-display-monitor-tools`.
- `file browser / Finder-style navigation` archetype now hints `NavigationSplitView`, `NSOpenPanel`, Quick Look, Uniform Type Identifiers, File Provider, and `macos-file-browser-navigation`.
- `window switcher / app switcher` archetype now hints `NSWindow`, `WindowGroup`, commands, focus validation, and `macos-window-app-switcher`.
- Direct doc hints now cover ScreenCaptureKit, NSPasteboard, NSStatusItem, NSWindow, NSScreen, App Intents, GameKit, StoreKit, AVFoundation, Photos, PhotosUI, Quick Look, File Provider, Uniform Type Identifiers, NSOpenPanel, SwiftUI commands/window/file/share APIs.
- Pathway ingest now seeds 10 app-archetype pathways; local pathway count is 18 after ingest.
- Weak HIG diagnostics now expose unrelated hits. Live rerun examples flagged `researchkit`, `game-center`, `playing-video`, `camera-control`, `maps`, and `menus` as weak support instead of burying them.

## MCP Gaps Still Open

- Continue replacing broad HIG hits with better direct HIG/file-navigation/macOS-window docs as the Apple source corpus grows.

## JSON Response Shaping Verification

High-limit `swift_app_audit` JSON rerun now parses successfully:

- Query: ClawDisplay display/monitor audit with `limit=20`, `format=json`.
- Result: parseable JSON envelope with `truncated=true`, `original_length`, `hint`, compacted `data`, and preserved `summary.readiness=ready_for_code_review`.

## Repeat Loop

1. Run `swift_app_audit` for project feature area.
2. Patch app with WWDC/HIG/tutorial/evolution evidence.
3. Record bad hits, missing terms, weak caveats, missing docs/pathways.
4. Patch MCP query expansion, platform mapping, readiness, validation, app-spec ingestion, pattern extraction.
5. Rerun same audit and compare top hits/readiness/caveats.
