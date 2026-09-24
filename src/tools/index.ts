/**
 * MCP tool registrations.
 *
 * Exposes canonical WWDC/Apple source tools:
 *   - wwdc_search
 *   - wwdc_list_years
 *   - wwdc_list_topics
 *   - wwdc_list_pathways
 *   - wwdc_get_pathway
 *   - wwdc_get_session
 *   - wwdc_session_deep_link
 *   - wwdc_list_session_code
 *   - wwdc_sample_code_grep
 *   - apple_doc_lookup
 *   - apple_tutorial_get
 *   - apple_hig_search
 *   - apple_swift_evolution_get
 *   - apple_swift_evolution_list
 *   - apple_doc_get
 *   - apple_swift_pattern_find
 *   - swift_app_audit
 *   - apple_swift_book_get         (new — Swift Language Reference)
 *   - appstore_guidelines_search   (new — App Store Review Guidelines)
 *   - wwdc_ingest_status
 */

import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { Database as DatabaseType } from "better-sqlite3";
import type { SearchHit } from "../types.js";
import {
  getSession,
  listSessionsByYear,
  listYears,
  listTopics,
  listPathways,
  getPathway,
  getTutorial,
  listSampleCodeForSession,
  searchSessionsFts,
  searchTutorialsFts,
  searchHigFts,
  searchEvolutionFts,
  searchAppleDocsFts,
  getEvolution,
  getAppleDoc,
  listIngestStatus,
  listSessionsAddedSince,
  searchSwiftBookFts,
  getSwiftBookChapter,
  searchAppStoreGuidelinesFts,
  getAppStoreGuideline,
  findApiIntroduction,
  getSessionsByYearAndTopic,
  findRelatedSessions,
  listHigEntries,
  filterEvolutionProposals,
  getSessionTranscriptChunk,
  getTopicsByYear,
  listSampleCode,
  listSessionsByYearFull,
  findSessionsBySpeaker,
  searchTranscripts,
  listDocsByFramework,
  getAppStoreGuidelineById,
  getApiDeprecation,
  getApiAvailability,
  searchReleaseNotes,
  findApiReplacement,
  searchAll,
  findSessionsForApi,
  searchSwiftForums,
  searchAppleDevForums,
  getSessionSummary,
  getCrossReferences,
  getExportStatus,
} from "../db/queries.js";
import { httpGet } from "../services/http.js";
import { APPLE_DOCS_BASE } from "../constants.js";
import { formatResponse, errorText, truncate } from "../services/format.js";
import { semanticSearch, checkOllama } from "../services/ollama.js";
import { DEFAULT_LIMIT, MAX_LIMIT } from "../constants.js";
import { getSecurityManifest, scanUntrustedText } from "../security/manifest.js";

const formatArg = z.enum(["markdown", "json"]).default("markdown").describe("Response format");
const limitArg = z.number().int().min(1).max(MAX_LIMIT).default(DEFAULT_LIMIT);
const offsetArg = z.number().int().min(0).default(0);
const detailArg = z.enum(["compact", "standard", "detailed"]).default("standard").describe("How much judgment and context to include.");
const platformArg = z.enum(["iOS", "iPadOS", "macOS", "watchOS", "tvOS", "visionOS"]);
const swiftAuditFocusArg = z.enum([
  "general",
  "performance",
  "navigation",
  "state",
  "concurrency",
  "data",
  "testing",
  "app-store",
  "accessibility",
  "visionos",
  "macos",
  "localization",
]).default("general");

/**
 * Build an FTS5 query from a user query string.
 *
 * Strategy:
 *   - Normalize camelCase symbols (e.g. "LiquidGlass" → "Liquid Glass")
 *   - 1 word: exact token match
 *   - 2+ words: AND of all tokens (space-separated, no phrase wrapping)
 *     Phrase match requires adjacency in exact order — kills most topic searches.
 *     Implicit AND finds docs containing all terms anywhere in any order.
 */
function ftsQuote(q: string): string {
  // Expand camelCase: "LiquidGlass" → "Liquid Glass", "@Observable" stays
  const expanded = q.replace(/([a-z])([A-Z])/g, "$1 $2").trim();
  const words = expanded.match(/[A-Za-z0-9_@.#+]+/g) ?? [];
  if (words.length === 1) {
    return `"${words[0].replace(/"/g, '""')}"`;
  }
  // Multi-word: AND all tokens. No phrase wrapping.
  return words.map((w) => `"${w.replace(/"/g, '""')}"`).join(" ");
}

function documentationPathFromInput(input: string): { clean?: string; error?: string } {
  const trimmed = input.trim();
  if (/^https?:\/\//i.test(trimmed)) {
    let parsed: URL;
    try {
      parsed = new URL(trimmed);
    } catch {
      return { error: "Invalid Apple documentation URL." };
    }
    if (parsed.protocol !== "https:" || parsed.hostname !== "developer.apple.com") {
      return { error: "Only https://developer.apple.com/documentation/... URLs are supported." };
    }
    const match = parsed.pathname.match(/^\/documentation\/(.+)$/);
    if (!match) {
      return { error: "Apple documentation URL must start with /documentation/." };
    }
    return { clean: normalizeDocumentationPath(match[1]!) };
  }
  return { clean: normalizeDocumentationPath(trimmed) };
}

function normalizeDocumentationPath(input: string): string {
  return input
    .replace(/^\/+/, "")
    .replace(/^documentation\//, "")
    .replace(/\/+$/, "")
    .split("/")
    .map((part) => encodeURIComponent(decodeURIComponent(part)))
    .join("/");
}

function deepLinkUrl(baseUrl: string, seconds: number): string {
  const url = new URL(baseUrl);
  url.searchParams.set("time", String(seconds));
  return url.toString();
}

type SearchHitWithJudgment = {
  id: string;
  kind: string;
  title: string;
  url: string;
  snippet?: string;
  score?: number;
  year?: number;
  topics?: string[];
  platforms?: string[];
  judgment?: {
    confidence: "high" | "medium" | "low";
    reasons: string[];
    caveats: string[];
    suggested_next_tools: string[];
  };
};

const APPLE_PLATFORM_TERMS = ["ios", "macos", "watchos", "tvos", "visionos", "ipados"];
const APPLE_FRAMEWORK_TERMS = [
  "swiftui", "swiftdata", "observation", "storekit", "gamekit", "appkit", "uikit",
  "instruments", "foundation models", "foundationmodels", "core data", "coredata",
  "metal", "realitykit", "cloudkit", "widgetkit", "screencapturekit", "screen capture kit",
  "nspasteboard", "pasteboard", "nsstatusitem", "status item", "nswindow", "nsscreen",
  "app intents", "appintents", "avfoundation", "photos", "photosui", "fileprovider",
  "file provider", "uniform type identifiers", "uniformtypeidentifiers", "quicklook", "quick look",
  "app store connect", "app store review", "localized screenshots", "localization",
  "simctl", "xcrun", "xcodebuild", "xcode", "app store connect api", "appstoreconnectapi",
];

type AppleDocHint = {
  id: string;
  title: string;
  path: string;
  url: string;
  reason: string;
  terms: string[];
};

const APPLE_DOC_HINTS: AppleDocHint[] = [
  docHint("screencapturekit", "ScreenCaptureKit", "screencapturekit", ["screencapturekit", "screen capture", "screenshot", "display capture", "window capture"]),
  docHint("nspasteboard", "NSPasteboard", "appkit/nspasteboard", ["nspasteboard", "pasteboard", "clipboard", "copy", "paste"]),
  docHint("nsstatusitem", "NSStatusItem", "appkit/nsstatusitem", ["nsstatusitem", "status item", "menu bar", "menubar"]),
  docHint("nswindow", "NSWindow", "appkit/nswindow", ["nswindow", "window", "window switcher", "app switcher"]),
  docHint("nsscreen", "NSScreen", "appkit/nsscreen", ["nsscreen", "display", "monitor", "external monitor", "screen"]),
  docHint("appintents", "App Intents", "appintents", ["app intents", "appintents", "intent"]),
  docHint("avkit", "AVKit", "avkit", ["avkit", "hls", "video playback", "player", "avplayer"]),
  docHint("authenticationservices", "AuthenticationServices", "authenticationservices", ["authenticationservices", "sign in", "magic link", "authentication", "auth"]),
  docHint("associated-domains", "Associated Domains Entitlement", "bundleresources/entitlements/com.apple.developer.associated-domains", ["associated domains", "universal links", "applinks", "deep link"]),
  docHint("keychain-services", "Keychain Services", "security/keychain_services", ["keychain", "token", "session token", "credential"]),
  docHint("safariservices", "SafariServices", "safariservices", ["safariservices", "sfsafariviewcontroller", "web purchase", "external purchase", "upgrade"]),
  docHint("gamekit", "GameKit", "gamekit", ["gamekit", "leaderboard", "multiplayer", "turn based", "match"]),
  docHint("storekit", "StoreKit", "storekit", ["storekit", "in-app purchase", "iap", "paywall", "transaction"]),
  docHint("storekit-subscriptions", "Auto-renewable subscriptions", "storekit/auto-renewable_subscriptions", ["subscription", "subscriptions", "auto-renewable", "paywall", "storekit"]),
  docHint("avfoundation", "AVFoundation", "avfoundation", ["avfoundation", "camera", "camera capture", "audio", "capture session"]),
  docHint("photos", "Photos", "photos", ["photos", "photo library", "library", "save photo", "asset"]),
  docHint("photosui", "PhotosUI", "photosui", ["photosui", "photo picker", "photos picker"]),
  docHint("uniformtypeidentifiers", "Uniform Type Identifiers", "uniformtypeidentifiers", ["uniform type identifiers", "uniformtypeidentifiers", "uti", "file type"]),
  docHint("quicklook", "Quick Look", "quicklook", ["quicklook", "quick look", "preview", "file preview"]),
  docHint("fileprovider", "File Provider", "fileprovider", ["fileprovider", "file provider", "file browser", "finder"]),
  docHint("nsopenpanel", "NSOpenPanel", "appkit/nsopenpanel", ["nsopenpanel", "open panel", "file picker", "choose file"]),
  docHint("navigation-split-view", "NavigationSplitView", "swiftui/navigationsplitview", ["navigationsplitview", "navigation split view", "sidebar", "file browser"]),
  docHint("windowgroup", "WindowGroup", "swiftui/windowgroup", ["windowgroup", "window group", "multiple windows"]),
  docHint("commands", "Commands", "swiftui/commands", ["commands", "keyboard shortcuts", "menu commands"]),
  docHint("fileimporter", "fileImporter", "swiftui/view/fileimporter(ispresented:allowedcontenttypes:allowsmultipleselection:oncompletion:)", ["fileimporter", "file importer", "import file"]),
  docHint("fileexporter", "fileExporter", "swiftui/view/fileexporter(ispresented:document:contenttype:defaultfilename:oncompletion:)", ["fileexporter", "file exporter", "export file"]),
  docHint("sharelink", "ShareLink", "swiftui/sharelink", ["sharelink", "share", "export"]),
  docHint("appstoreconnectapi", "App Store Connect API", "appstoreconnectapi", ["app store connect api", "appstoreconnectapi", "asc api", "screenshot upload", "build upload", "webhook notification", "testflight api"]),
];

function docHint(id: string, title: string, path: string, terms: string[]): AppleDocHint {
  return {
    id,
    title,
    path,
    url: `${APPLE_DOCS_BASE}/${path}`,
    reason: `Matched audit terms: ${terms.slice(0, 4).join(", ")}`,
    terms,
  };
}

const SWIFT_AUDIT_FOCUS_TERMS: Record<z.infer<typeof swiftAuditFocusArg>, {
  session: string[];
  hig: string[];
  evolution: string[];
  validation: string[];
}> = {
  general: {
    session: ["SwiftUI", "Swift", "What's new in SwiftUI"],
    hig: ["navigation", "buttons", "accessibility"],
    evolution: ["Swift 6", "concurrency"],
    validation: ["Build with SwiftPM or xcodebuild", "Run focused tests before full suite", "Check platform-specific HIG guidance"],
  },
  performance: {
    session: ["SwiftUI performance", "Instruments", "hangs"],
    hig: ["feedback", "loading", "progress indicators"],
    evolution: ["concurrency", "Sendable"],
    validation: ["Profile same interaction before and after", "Check body work, identity churn, layout thrash", "Add bounded OSLog telemetry around slow paths"],
  },
  navigation: {
    session: ["SwiftUI navigation", "NavigationStack", "navigation"],
    hig: ["navigation", "sidebars", "tab bars"],
    evolution: ["observation"],
    validation: ["Verify route state ownership", "Test deep links and back-stack restoration", "Check HIG platform differences"],
  },
  state: {
    session: ["Observation", "SwiftUI state", "SwiftData"],
    hig: ["editing", "forms", "controls"],
    evolution: ["observation", "macros"],
    validation: ["Narrow state ownership", "Avoid broad invalidation from shared models", "Test async loading and error states"],
  },
  concurrency: {
    session: ["Swift concurrency", "actors", "async await"],
    hig: ["progress indicators", "feedback"],
    evolution: ["concurrency", "actors", "Sendable"],
    validation: ["Check actor isolation warnings", "Avoid main-thread work in async callbacks", "Test cancellation and retries"],
  },
  data: {
    session: ["SwiftData", "Core Data", "data"],
    hig: ["lists", "tables", "forms"],
    evolution: ["persistence", "macros"],
    validation: ["Test migration and empty-state paths", "Verify list identity is stable", "Check persistence errors surface clearly"],
  },
  testing: {
    session: ["Swift Testing", "XCTest", "debugging"],
    hig: ["feedback", "errors"],
    evolution: ["testing", "macros"],
    validation: ["Run smallest meaningful test first", "Classify compile vs assertion vs environment failures", "Keep deterministic fixtures"],
  },
  "app-store": {
    session: ["App Store", "TestFlight", "StoreKit"],
    hig: ["privacy", "settings", "notifications"],
    evolution: ["availability"],
    validation: ["Check archive/export path", "Verify privacy manifest and signing", "Run upload or package smoke test"],
  },
  accessibility: {
    session: ["accessibility", "VoiceOver", "SwiftUI accessibility"],
    hig: ["accessibility", "buttons", "color"],
    evolution: ["accessibility"],
    validation: ["Verify labels, traits, focus order", "Test Dynamic Type and contrast", "Audit platform-specific interaction patterns"],
  },
  visionos: {
    session: ["visionOS", "spatial", "RealityKit"],
    hig: ["visionOS", "spatial layout", "immersive"],
    evolution: ["availability"],
    validation: ["Check spatial interaction affordances", "Verify window/volume/immersive transitions", "Keep platform-specific APIs guarded"],
  },
  macos: {
    session: ["macOS", "SwiftUI macOS", "AppKit"],
    hig: ["macOS", "menus", "sidebars"],
    evolution: ["availability"],
    validation: ["Use macOS build/run path", "Verify menus, windows, keyboard commands", "Inspect unified logs for action paths"],
  },
  localization: {
    session: ["localization", "String Catalogs", "Xcode localization", "App Store Connect screenshots"],
    hig: ["language", "text", "layout", "right-to-left"],
    evolution: ["availability"],
    validation: ["Export/import .xcloc and verify translation completeness", "Test RTL layout with pseudo-localization", "Verify screenshot locale cold-launch via -AppleLanguages", "Check String Catalog comment coverage for translator context"],
  },
};

function analyzeQuery(query: string) {
  const normalized = query.toLowerCase().replace(/[^a-z0-9+.# ]+/g, " ").replace(/\s+/g, " ").trim();
  const words = normalized.split(" ").filter(Boolean);
  const platformTerms = APPLE_PLATFORM_TERMS.filter((term) => words.includes(term));
  const frameworkTerms = APPLE_FRAMEWORK_TERMS.filter((term) => normalized.includes(term));
  return {
    normalized,
    platformTerms,
    frameworkTerms,
    isPlatformOnly: words.length > 0 && words.every((word) => APPLE_PLATFORM_TERMS.includes(word)),
  };
}

function judgeHit(query: string, hit: SearchHitWithJudgment): NonNullable<SearchHitWithJudgment["judgment"]> {
  const q = query.toLowerCase();
  const signals = analyzeQuery(query);
  const reasons: string[] = [];
  const caveats: string[] = [];
  const next = hit.kind === "session"
    ? ["wwdc_get_session", "wwdc_session_deep_link"]
    : hit.kind === "tutorial"
      ? ["apple_tutorial_get"]
    : hit.kind === "hig"
      ? ["apple_hig_search", "apple_doc_lookup"]
      : hit.kind === "doc"
        ? ["apple_doc_get", "apple_doc_lookup"]
        : ["apple_swift_evolution_get"];

  if (hit.title.toLowerCase().includes(q)) reasons.push("query appears in title");
  if ((hit.snippet ?? "").toLowerCase().includes(q)) reasons.push("query appears in indexed snippet");
  if ((hit.topics ?? []).some((topic) => topic.toLowerCase().includes(q))) reasons.push("query appears in topics/status");
  if ((hit.platforms ?? []).some((platform) => signals.platformTerms.includes(platform.toLowerCase()))) reasons.push("query appears in platform metadata");
  if (signals.frameworkTerms.some((term) => `${hit.title} ${(hit.topics ?? []).join(" ")} ${hit.snippet ?? ""}`.toLowerCase().includes(term))) reasons.push("Apple framework term matches indexed metadata");
  if (hit.kind === "session" && hit.year && hit.year >= 2024) reasons.push("recent WWDC session");
  if (!hit.snippet) caveats.push("no snippet available for this hit");
  if (hit.kind === "session" && !hit.year) caveats.push("session year missing");
  if (signals.isPlatformOnly) caveats.push("platform-only query is broad; add framework, API, or failure symptom for audit-grade guidance");

  const rawConfidence = reasons.length >= 2 ? "high" : reasons.length === 1 ? "medium" : "low";
  const confidence = signals.isPlatformOnly && rawConfidence === "high" ? "medium" : rawConfidence;
  return { confidence, reasons, caveats, suggested_next_tools: next };
}

function judgeSearch(query: string, hits: SearchHitWithJudgment[], total: number, hybrid: boolean, ingestStatus = [] as ReturnType<typeof listIngestStatus>) {
  const signals = analyzeQuery(query);
  const top = hits[0]?.judgment?.confidence ?? "low";
  const confidence = total === 0 ? "low" : top;
  const caveats: string[] = [];
  const indexedItems = ingestStatus.reduce((sum, row) => sum + row.itemsIngested, 0);
  if (total === 0 && indexedItems === 0) {
    caveats.push("local index appears empty; run `npm run ingest:all` or `npm run ingest:wwdc -- --year 2024 --year 2025`");
  } else if (total === 0) {
    caveats.push("no indexed matches; broaden query or run targeted ingest");
  }
  if (signals.isPlatformOnly) caveats.push("platform-only query is broad; add framework, API, error text, or app feature before making code changes");
  if (!hybrid) caveats.push("semantic rerank unavailable; results use FTS only");
  if (hits.length < total) caveats.push("more results available via offset");
  return {
    confidence,
    basis: hits.slice(0, 3).map((hit) => `${hit.kind}:${hit.id}`),
    caveats,
    suggested_next_tools: total === 0 ? ["wwdc_ingest_status", "wwdc_list_topics", "wwdc_list_years"] : [...new Set(hits.flatMap((hit) => hit.judgment?.suggested_next_tools ?? []))].slice(0, 4),
    answer_readiness: confidence === "high" ? "good_seed_context" : confidence === "medium" ? "needs_follow_up" : "insufficient_context",
  };
}

function uniqueTerms(terms: Array<string | undefined>): string[] {
  const seen = new Set<string>();
  const result: string[] = [];
  for (const term of terms) {
    const clean = term?.trim();
    if (!clean) continue;
    const key = clean.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    result.push(clean);
  }
  return result;
}

function splitAuditTerms(value?: string): string[] {
  if (!value) return [];
  const words = value
    .replace(/([a-z])([A-Z])/g, "$1 $2")
    .split(/[^A-Za-z0-9+.#]+/)
    .map((word) => word.trim())
    .filter((word) => word.length >= 3);
  const phrases: string[] = [];
  for (let i = 0; i < words.length - 1; i++) {
    phrases.push(`${words[i]} ${words[i + 1]}`);
  }
  return [...words, ...phrases];
}

function auditArchetypeTerms(args: {
  focus: z.infer<typeof swiftAuditFocusArg>;
  platforms: Array<z.infer<typeof platformArg>>;
  frameworks: string[];
  feature?: string;
  symptom?: string;
}): string[] {
  const text = `${args.focus} ${args.platforms.join(" ")} ${args.frameworks.join(" ")} ${args.feature ?? ""} ${args.symptom ?? ""}`.toLowerCase();
  const terms: string[] = [];
  if (/\b(menu|status item|command|window|appkit)\b/.test(text)) {
    terms.push("menu bar", "menus", "keyboard shortcuts", "windows", "AppKit", "SwiftUI macOS", "NSStatusItem", "NSWindow", "commands");
  }
  if (/\b(clipboard|paste|pasteboard|nspasteboard)\b/.test(text)) {
    terms.push("clipboard", "paste", "keyboard shortcuts", "privacy", "NSPasteboard");
  }
  if (/screenshot|screen capture|annotation|export/.test(text)) {
    terms.push("screen capture", "screenshots", "ScreenCaptureKit", "Photos", "ShareLink", "Vision");
  }
  if (/localized screenshot|app store screenshot|app store connect|screenshot localization|localizeshots|subscription review|review screenshot/.test(text)) {
    terms.push(
      "App Store Connect",
      "App Store Review",
      "App Store screenshots",
      "localized screenshots",
      "localization",
      "ScreenCaptureKit",
      "StoreKit",
      "subscriptions",
      "paywall",
      "review screenshot",
      "privacy",
      "metadata",
    );
  }
  if (/\b(display|monitor|brightness|nsscreen|hdr|color)\b|color profile|display profile/.test(text)) {
    terms.push("display", "external display", "monitor", "NSScreen", "HDR", "color management", "Display P3", "EDR", "ScreenCaptureKit");
  }
  if (/\b(reader|training|lesson|course|curriculum|hls|video|avkit|avplayer|magic link|keychain|auth|authentication|universal link|applinks|safari|web purchase|booking|critique)\b/.test(text)) {
    terms.push("reader app", "training app", "SwiftUI navigation", "AVKit", "HLS", "AVPlayer", "AuthenticationServices", "Associated Domains", "universal links", "Keychain", "SafariServices", "web purchase", "forms", "booking", "submission");
  }
  if (/file browser|file explorer|finder|sidebar|drag|drop|file navigation|open panel|quick look/.test(text)) {
    terms.push("Finder", "file browser", "sidebar", "NavigationSplitView", "outline", "tables", "drag and drop", "Quick Look", "NSOpenPanel", "Uniform Type Identifiers", "File Provider");
  }
  if (/window switcher|app switcher|tab switcher|alt tab|mission control|spaces|minimized|focus/.test(text)) {
    terms.push("window switcher", "app switcher", "window management", "NSWindow", "WindowGroup", "keyboard shortcuts", "focus", "accessibility");
  }
  if (/game|gamekit|leaderboard|match|turn/.test(text)) {
    terms.push("GameKit", "leaderboards", "multiplayer games", "StoreKit", "App Store");
  }
  if (/\b(camera|avfoundation|photo|framing)\b/.test(text)) {
    terms.push("AVFoundation", "camera capture", "Photos", "privacy", "StoreKit");
  }
  if (/voice|audio|push|notification|deeplink|deep link/.test(text)) {
    terms.push("AVAudioSession", "audio", "UserNotifications", "deep links", "background tasks");
  }
  if (/\b(appintents|app intents|intent)\b/.test(text)) {
    terms.push("App Intents", "Shortcuts", "actions", "Spotlight");
  }
  return terms;
}

function auditArchetypeValidationTerms(args: {
  focus: z.infer<typeof swiftAuditFocusArg>;
  platforms: Array<z.infer<typeof platformArg>>;
  frameworks: string[];
  feature?: string;
  symptom?: string;
}): string[] {
  const text = `${args.focus} ${args.platforms.join(" ")} ${args.frameworks.join(" ")} ${args.feature ?? ""} ${args.symptom ?? ""}`.toLowerCase();
  const terms: string[] = [];
  if (/\b(display|monitor|brightness|nsscreen|hdr|color)\b|color profile|display profile/.test(text)) {
    terms.push("Test internal, external, mirrored, and disconnected display states", "Verify HDR/EDR and color-profile behavior on supported displays", "Handle NSScreen changes without stale monitor state");
  }
  if (/\b(reader|training|lesson|course|curriculum|hls|video|avkit|avplayer|magic link|keychain|auth|authentication|universal link|applinks|safari|web purchase|booking|critique)\b/.test(text)) {
    terms.push(
      "Test signed-out, expired-token, locked-content, and member-tier states",
      "Verify universal-link and custom-scheme magic-link sign-in on device",
      "Confirm HLS stream URLs are authenticated and never bypass membership gates",
      "Test booking and submission forms for loading, error, success, and no-credit states",
      "Verify web purchase handoff avoids in-app pricing for reader-app compliance",
    );
  }
  if (/file browser|file explorer|finder|sidebar|drag|drop|file navigation|open panel|quick look/.test(text)) {
    terms.push("Verify sidebar selection, keyboard focus, and empty/error states", "Test drag/drop plus file import/export permissions", "Check Quick Look or preview fallback for unsupported file types");
  }
  if (/window switcher|app switcher|tab switcher|alt tab|mission control|spaces|minimized|focus/.test(text)) {
    terms.push("Test minimized, full-screen, multi-space, and multi-display windows", "Verify keyboard-only window switching and accessibility focus", "Avoid presenting stale or hidden NSWindow references");
  }
  if (/\b(clipboard|paste|pasteboard|nspasteboard)\b/.test(text)) {
    terms.push("Verify pasteboard privacy prompts and failure states", "Test copy/paste with text, files, and unavailable pasteboard contents");
  }
  if (/screenshot|screen capture|annotation|export/.test(text)) {
    terms.push("Verify ScreenCaptureKit permissions, denied states, and capture target changes", "Test export/share paths and Photos authorization states");
  }
  if (/localized screenshot|app store screenshot|app store connect|screenshot localization|localizeshots|subscription review|review screenshot/.test(text)) {
    terms.push(
      "Validate every App Store locale has metadata and screenshot assets before submit",
      "Verify StoreKit products load, purchase, restore, and entitlement refresh outside screenshot QA mode",
      "Confirm subscription review screenshots match live pricing and are COMPLETE in App Store Connect",
      "Run Mac App Store target build and inspect bundled resources for scripts or non-review-safe tooling",
    );
  }
  return terms;
}

function auditDocHints(args: {
  focus: z.infer<typeof swiftAuditFocusArg>;
  platforms: Array<z.infer<typeof platformArg>>;
  frameworks: string[];
  feature?: string;
  symptom?: string;
  archetypeTerms: string[];
}): AppleDocHint[] {
  const auditText = `${args.focus} ${args.platforms.join(" ")} ${args.frameworks.join(" ")} ${args.feature ?? ""} ${args.symptom ?? ""} ${args.archetypeTerms.join(" ")}`.toLowerCase();
  const hints = APPLE_DOC_HINTS.filter((hint) => hint.terms.some((term) => auditTextMatchesTerm(auditText, term)));
  return hints.slice(0, 10);
}

function auditTextMatchesTerm(auditText: string, term: string): boolean {
  const normalized = term.toLowerCase().trim();
  if (!normalized) return false;
  if (/\s/.test(normalized)) return auditText.includes(normalized);
  return new RegExp(`\\b${normalized.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\b`).test(auditText);
}

function auditPathwayHints(args: {
  focus: z.infer<typeof swiftAuditFocusArg>;
  platforms: Array<z.infer<typeof platformArg>>;
  frameworks: string[];
  feature?: string;
  symptom?: string;
}): Array<{ id: string; title: string; reason: string }> {
  const text = `${args.focus} ${args.platforms.join(" ")} ${args.frameworks.join(" ")} ${args.feature ?? ""} ${args.symptom ?? ""}`.toLowerCase();
  const pathways: Array<{ id: string; title: string; reason: string }> = [];
  const add = (id: string, title: string, reason: string) => {
    if (!pathways.some((p) => p.id === id)) pathways.push({ id, title, reason });
  };
  if (/\b(menu|status item|command|nsstatusitem)\b/.test(text)) add("macos-menu-bar-utilities", "macOS menu bar utilities", "menu/status-item archetype");
  if (/\b(display|monitor|brightness|nsscreen|hdr|color)\b|color profile|display profile/.test(text)) add("macos-display-monitor-tools", "macOS display and monitor tools", "display/monitor archetype");
  if (/\b(reader|training|lesson|course|curriculum|hls|video|avkit|avplayer|magic link|keychain|auth|authentication|universal link|applinks|safari|web purchase|booking|critique)\b/.test(text)) add("ios-reader-authenticated-video-training", "iOS reader and authenticated video training apps", "reader/authenticated-video training archetype");
  if (/file browser|file explorer|finder|sidebar|drag|drop|quick look/.test(text)) add("macos-file-browser-navigation", "macOS file browser navigation", "Finder-style navigation archetype");
  if (/window switcher|app switcher|tab switcher|alt tab|mission control|spaces|minimized|focus/.test(text)) add("macos-window-app-switcher", "macOS window and app switchers", "window/app switcher archetype");
  if (/\b(clipboard|paste|pasteboard|nspasteboard)\b/.test(text)) add("macos-clipboard-workflows", "macOS clipboard workflows", "pasteboard archetype");
  if (/screenshot|screen capture|annotation|export/.test(text)) add("screenshot-capture-tools", "Screenshot and capture tools", "screen capture archetype");
  if (/localized screenshot|app store screenshot|app store connect|screenshot localization|localizeshots|subscription review|review screenshot/.test(text)) add("app-store-localized-screenshot-workflows", "App Store localized screenshot workflows", "localized screenshot and App Store submission archetype");
  if (/game|gamekit|leaderboard|match|turn|storekit/.test(text)) add("gamekit-storekit-games", "GameKit and StoreKit games", "game monetization archetype");
  if (/\b(camera|avfoundation|photo|framing)\b/.test(text)) add("camera-capture-export", "Camera capture and export", "camera/export archetype");
  if (/voice|audio|push|notification|deeplink|deep link/.test(text)) add("voice-audio-push-workflows", "Voice, audio, and push workflows", "audio/push archetype");
  if (/\b(appintents|app intents|intent)\b/.test(text)) add("app-intents-automation", "App Intents automation", "App Intents archetype");
  return pathways;
}

function diagnoseWeakHits(args: {
  focus: z.infer<typeof swiftAuditFocusArg>;
  platforms: Array<z.infer<typeof platformArg>>;
  frameworks: string[];
  featureTerms: string[];
  archetypeTerms: string[];
  hig: SearchHitWithJudgment[];
}) {
  const usefulTerms = uniqueTerms([
    ...args.featureTerms,
    ...args.archetypeTerms,
    ...args.frameworks,
    ...args.platforms,
    args.focus,
  ])
    .flatMap((term) => term.toLowerCase().split(/[^a-z0-9]+/))
    .filter((term) => term.length >= 4 && !["swift", "swiftui", "macos", "ios"].includes(term));
  const weak_hig_hits = args.hig
    .filter((hit) => {
      const haystack = `${hit.id} ${hit.title} ${hit.snippet ?? ""} ${(hit.topics ?? []).join(" ")}`.toLowerCase();
      return usefulTerms.length > 0 && !usefulTerms.some((term) => haystack.includes(term));
    })
    .map((hit) => ({
      id: hit.id,
      title: hit.title,
      reason: "No feature, framework, platform, or archetype term matched this HIG hit; treat as weak supporting evidence.",
    }));
  return {
    weak_hig_hits,
    notes: weak_hig_hits.length
      ? ["Some HIG hits are weak or generic; prefer direct Apple docs and archetype pathways before code changes."]
      : [],
  };
}

function auditSourceCoverage(db: DatabaseType) {
  const count = (table: string) => (db.prepare(`SELECT COUNT(*) AS c FROM ${table}`).get() as any).c as number;
  return {
    sessions: count("sessions"),
    tutorials: count("tutorials"),
    hig: count("hig_entries"),
    evolution: count("evolution"),
    docs: count("apple_docs"),
    pathways: count("pathways"),
    sample_code: count("sample_code"),
  };
}

function pickTopSearchHits(
  searches: Array<{ query: string; hits: SearchHitWithJudgment[] }>,
  limit: number,
): SearchHitWithJudgment[] {
  const seen = new Set<string>();
  const picked: SearchHitWithJudgment[] = [];
  for (const search of searches) {
    for (const hit of search.hits) {
      const key = `${hit.kind}:${hit.id}`;
      if (seen.has(key)) continue;
      seen.add(key);
      picked.push(hit);
      if (picked.length >= limit) return picked;
    }
  }
  return picked;
}

function pickRankedAuditHits(
  searches: Array<{ query: string; hits: SearchHitWithJudgment[]; priority: number }>,
  limit: number,
): SearchHitWithJudgment[] {
  const best = new Map<string, SearchHitWithJudgment & { priority: number }>();
  for (const search of searches) {
    for (const hit of search.hits) {
      const key = `${hit.kind}:${hit.id}`;
      const current = best.get(key);
      const ranked = { ...hit, priority: search.priority };
      if (!current || ranked.priority < current.priority || (ranked.priority === current.priority && (ranked.score ?? 0) < (current.score ?? 0))) {
        best.set(key, ranked);
      }
    }
  }
  const rows = [...best.values()].sort((a, b) => a.priority - b.priority || (a.score ?? 0) - (b.score ?? 0));
  return rows.slice(0, limit).map(({ priority, ...hit }) => hit);
}

function buildSwiftAuditSummary(args: {
  focus: z.infer<typeof swiftAuditFocusArg>;
  platforms: Array<z.infer<typeof platformArg>>;
  frameworks: string[];
  feature?: string;
  symptom?: string;
  totalMatches: number;
  indexedItems: number;
  sourceCoverage?: ReturnType<typeof auditSourceCoverage>;
}) {
  const caveats: string[] = [];
  if (args.indexedItems === 0) caveats.push("local index appears empty; run `npm run ingest:all` before relying on this audit");
  if (args.sourceCoverage?.hig === 0) caveats.push("HIG index is empty; run `npm run ingest:hig`");
  if (args.sourceCoverage?.tutorials === 0) caveats.push("tutorial index is empty; run `npm run ingest:tutorials`");
  if (args.sourceCoverage?.evolution === 0) caveats.push("Swift Evolution index is empty; run `npm run ingest:evolution`");
  if (args.totalMatches === 0) caveats.push("no local matches found; broaden focus/frameworks or ingest newer WWDC content");
  if (args.platforms.length === 0) caveats.push("platform not specified; guidance may miss platform-specific HIG/API differences");
  if (!args.feature && !args.symptom && args.focus === "general") caveats.push("general audit is broad; add feature or symptom for sharper recommendations");
  const hasUsefulCoverage = (args.sourceCoverage?.sessions ?? 0) > 0 && (args.sourceCoverage?.hig ?? 0) > 0;
  const readiness = args.totalMatches >= 3 && caveats.length === 0 && hasUsefulCoverage
    ? "ready_for_code_review"
    : args.totalMatches > 0
      ? "seed_context_only"
      : "insufficient_context";
  return {
    confidence: args.totalMatches >= 5 && hasUsefulCoverage ? "high" : args.totalMatches > 0 ? "medium" : "low",
    readiness,
    caveats,
    next_tools: ["wwdc_get_session", "apple_hig_search", "apple_swift_evolution_get", "apple_doc_lookup"],
    source_coverage: args.sourceCoverage,
  };
}

export function registerAllTools(server: McpServer, db: DatabaseType): void {
  // ---------- wwdc_search ----------
  server.registerTool(
    "wwdc_search",
    {
      title: "Search WWDC + Apple docs",
      description:
        "Full-text + semantic search across WWDC sessions, Apple documentation, tutorials, HIG, and Swift Evolution. Returns ranked hits with snippets. If Ollama is available, hybrid (FTS + vector) is used; otherwise FTS only.",
      inputSchema: {
        query: z.string().min(1).describe("Search query; supports multi-word phrases."),
        kinds: z.array(z.enum(["session", "doc", "tutorial", "hig", "evolution"])).default(["session", "doc", "tutorial", "hig", "evolution"]),
        year: z.number().int().optional().describe("Restrict to a WWDC year."),
        year_min: z.number().int().optional().describe("Restrict WWDC sessions to this year or newer."),
        year_max: z.number().int().optional().describe("Restrict WWDC sessions to this year or older."),
        topics: z.array(z.string().min(1)).default([]).describe("Require WWDC session topics/status text to include every value."),
        platforms: z.array(z.string().min(1)).default([]).describe("Require WWDC session platforms to include every value."),
        require_transcript: z.boolean().default(false).describe("Only return WWDC sessions with transcript text."),
        judgment: z.boolean().default(true).describe("Include per-hit and overall search judgment metadata."),
        detail: detailArg,
        limit: limitArg,
        offset: offsetArg,
        format: formatArg,
      },
      annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
    },
    async ({ query, kinds, year, year_min, year_max, topics, platforms, require_transcript, judgment, detail, limit, offset, format }) => {
      const fts = ftsQuote(query);
      const hits: SearchHitWithJudgment[] = [];
      let total = 0;

      if (kinds.includes("session")) {
        const { hits: h, total: t } = searchSessionsFts(db, fts, limit, offset, {
          year,
          yearMin: year_min,
          yearMax: year_max,
          topics,
          platforms,
          requireTranscript: require_transcript,
        });
        hits.push(...h);
        total += t;
      }
      if (kinds.includes("tutorial")) {
        const { hits: h, total: t } = searchTutorialsFts(db, fts, limit, offset);
        hits.push(...h); total += t;
      }
      if (kinds.includes("doc")) {
        const { hits: h, total: t } = searchAppleDocsFts(db, fts, limit, offset);
        hits.push(...h); total += t;
      }
      if (kinds.includes("hig")) {
        const { hits: h, total: t } = searchHigFts(db, fts, limit, offset);
        hits.push(...h); total += t;
      }
      if (kinds.includes("evolution")) {
        const { hits: h, total: t } = searchEvolutionFts(db, fts, limit, offset);
        hits.push(...h); total += t;
      }

      // Semantic rerank if Ollama is available.
      const ollamaOn = await checkOllama();
      if (ollamaOn && hits.length > 1) {
        try {
          const vecHits = await semanticSearch(db, query, kinds.map((k) => k), Math.max(limit * 2, 20));
          const scoreMap = new Map(vecHits.map((v) => [`${v.kind}:${v.docId.split(":")[1] ?? v.docId}`, v.score]));
          hits.sort((a, b) => (scoreMap.get(`${b.kind}:${b.id}`) ?? 0) - (scoreMap.get(`${a.kind}:${a.id}`) ?? 0));
        } catch { /* fallback to FTS only */ }
      }

      const page = hits.slice(0, limit);
      const judgedPage = page.map((hit) => judgment || detail === "detailed" ? { ...hit, judgment: judgeHit(query, hit) } : hit);
      const searchJudgment = judgment || detail === "detailed" ? judgeSearch(query, judgedPage, total, ollamaOn, listIngestStatus(db)) : undefined;
      const contentSafety = scanUntrustedText(judgedPage.map((hit) => `${hit.title}\n${hit.snippet ?? ""}`).join("\n\n"));
      const md = renderSearchMd(query, judgedPage, total, searchJudgment, detail);
      const data = {
        query,
        filters: { kinds, year, year_min, year_max, topics, platforms, require_transcript },
        total,
        count: judgedPage.length,
        hits: judgedPage,
        judgment: searchJudgment,
        content_safety: contentSafety,
        hybrid: ollamaOn,
      };
      return { content: [{ type: "text", text: formatResponse(format, md, data) }] };
    },
  );

  // ---------- wwdc_list_years ----------
  server.registerTool(
    "wwdc_list_years",
    {
      title: "List WWDC years",
      description: "Returns the set of WWDC years present in the local index with session counts.",
      inputSchema: { format: formatArg },
      annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
    },
    async ({ format }) => {
      const rows = listYears(db);
      const md = `# WWDC years\n\n${rows.map((r) => `- **${r.year}** — ${r.count} sessions`).join("\n")}`;
      return { content: [{ type: "text", text: formatResponse(format, md, { years: rows }) }] };
    },
  );

  // ---------- wwdc_list_topics ----------
  server.registerTool(
    "wwdc_list_topics",
    {
      title: "List WWDC topics",
      description: "Top topics across WWDC sessions with counts (e.g. SwiftUI, Swift, AI, visionOS).",
      inputSchema: { limit: limitArg, format: formatArg },
      annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
    },
    async ({ limit, format }) => {
      const rows = listTopics(db).slice(0, limit);
      const md = `# Topics (top ${rows.length})\n\n${rows.map((r) => `- ${r.topic} — ${r.count}`).join("\n")}`;
      return { content: [{ type: "text", text: formatResponse(format, md, { topics: rows }) }] };
    },
  );

  // ---------- wwdc_list_pathways ----------
  server.registerTool(
    "wwdc_list_pathways",
    {
      title: "List learning pathways",
      description: "Curated + auto-derived Apple learning pathways (SwiftUI, visionOS, Swift 6, AI, etc.).",
      inputSchema: { category: z.string().optional(), format: formatArg },
      annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
    },
    async ({ category, format }) => {
      const all = listPathways(db);
      const rows = category ? all.filter((p) => p.category.toLowerCase() === category.toLowerCase()) : all;
      const md = `# Pathways (${rows.length})\n\n${rows.map((p) => `## ${p.title}\n*${p.category}* — ${p.description}\n- id: \`${p.id}\`\n- ${p.steps.length} steps`).join("\n\n")}`;
      return { content: [{ type: "text", text: formatResponse(format, md, { pathways: rows }) }] };
    },
  );

  // ---------- wwdc_get_pathway ----------
  server.registerTool(
    "wwdc_get_pathway",
    {
      title: "Get a specific pathway",
      description: "Returns a pathway with its ordered steps (sessions + tutorials + docs).",
      inputSchema: { id: z.string().min(1), format: formatArg },
      annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
    },
    async ({ id, format }) => {
      const p = getPathway(db, id);
      if (!p) return { isError: true, content: [{ type: "text", text: errorText(`pathway not found: ${id}`, "Use wwdc_list_pathways to enumerate IDs.") }] };
      const md = `# ${p.title}\n\n${p.description}\n\n**Category:** ${p.category}\n\n## Steps\n${p.steps.map((s) => `${s.order}. [${s.kind}] ${s.title} — ${s.url}${s.estimatedTime ? ` (${s.estimatedTime})` : ""}`).join("\n")}`;
      return { content: [{ type: "text", text: formatResponse(format, md, p) }] };
    },
  );

  // ---------- wwdc_get_session ----------
  server.registerTool(
    "wwdc_get_session",
    {
      title: "Get WWDC session",
      description: "Full record for a WWDC session by id (e.g. wwdc2024-10150). Includes description, topics, transcript, sample-code URLs, related docs.",
      inputSchema: {
        id: z.string().min(1).describe("Session id, e.g. wwdc2024-10150"),
        include_transcript: z.boolean().default(true),
        transcript_chars: z.number().int().min(500).max(25_000).default(8000).describe("Maximum transcript characters to return in markdown/json when transcript is included."),
        include_chapters: z.boolean().default(true),
        include_sample_code: z.boolean().default(true),
        include_related_docs: z.boolean().default(true),
        include_judgment: z.boolean().default(true),
        format: formatArg,
      },
      annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
    },
    async ({ id, include_transcript, transcript_chars, include_chapters, include_sample_code, include_related_docs, include_judgment, format }) => {
      const s = getSession(db, id);
      if (!s) return { isError: true, content: [{ type: "text", text: errorText(`session not found: ${id}`, "Use wwdc_search or wwdc_list_years → session list.") }] };
      if (!include_transcript) s.transcript = undefined;
      if (s.transcript && s.transcript.length > transcript_chars) s.transcript = truncate(s.transcript, transcript_chars);
      if (!include_chapters) s.deepLinks = [];
      if (!include_sample_code) s.sampleCodeUrls = [];
      if (!include_related_docs) s.relatedDocs = [];
      const sessionJudgment = include_judgment ? {
        confidence: s.transcript ? "high" : "medium",
        coverage: {
          has_transcript: Boolean(s.transcript),
          chapter_count: s.deepLinks?.length ?? 0,
          sample_code_count: s.sampleCodeUrls.length,
          related_doc_count: s.relatedDocs.length,
        },
        caveats: [
          ...(s.transcript ? [] : ["transcript unavailable"]),
          ...((s.deepLinks?.length ?? 0) === 0 ? ["chapter deep links unavailable"] : []),
        ],
        suggested_next_tools: ["wwdc_session_deep_link", "wwdc_list_session_code", "apple_doc_lookup"],
      } : undefined;
      const md = renderSessionMd(s, sessionJudgment);
      return { content: [{ type: "text", text: formatResponse(format, md, { ...s, judgment: sessionJudgment }) }] };
    },
  );

  // ---------- wwdc_session_deep_link ----------
  server.registerTool(
    "wwdc_session_deep_link",
    {
      title: "Create a deep link into a session",
      description: "Returns a URL with a ?time=SECONDS query so the user jumps straight to a chapter.",
      inputSchema: {
        id: z.string().min(1),
        seconds: z.number().int().min(0).optional(),
        timestamp: z.string().optional().describe("HH:MM:SS or MM:SS — alternative to seconds"),
        format: formatArg,
      },
      annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
    },
    async ({ id, seconds, timestamp, format }) => {
      const s = getSession(db, id);
      if (!s) return { isError: true, content: [{ type: "text", text: errorText(`session not found: ${id}`) }] };
      let total = seconds;
      if (total === undefined && timestamp) {
        const rawParts = timestamp.split(":");
        const parts = rawParts.map(Number);
        if (
          rawParts.length < 1 ||
          rawParts.length > 3 ||
          parts.some((part) => !Number.isInteger(part) || part < 0)
        ) {
          return { isError: true, content: [{ type: "text", text: errorText("Invalid timestamp. Use HH:MM:SS, MM:SS, or seconds.") }] };
        }
        total = parts.length === 3 ? parts[0]! * 3600 + parts[1]! * 60 + parts[2]! : parts.length === 2 ? parts[0]! * 60 + parts[1]! : parts[0]!;
      }
      if (total === undefined) return { isError: true, content: [{ type: "text", text: errorText("Provide either `seconds` or `timestamp`.") }] };
      if (!Number.isInteger(total) || total < 0) return { isError: true, content: [{ type: "text", text: errorText("Time must resolve to a non-negative integer number of seconds.") }] };
      const url = deepLinkUrl(s.url, total);
      const md = `[${s.title}](${url}) — ${Math.floor(total / 60)}:${(total % 60).toString().padStart(2, "0")}`;
      return { content: [{ type: "text", text: formatResponse(format, md, { id, url, seconds: total }) }] };
    },
  );

  // ---------- wwdc_list_session_code ----------
  server.registerTool(
    "wwdc_list_session_code",
    {
      title: "List sample-code links for a session",
      description: "Returns every sample-code URL Apple linked from the session page (zips, GitHub repos, snippets).",
      inputSchema: { id: z.string().min(1), format: formatArg },
      annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
    },
    async ({ id, format }) => {
      const refs = listSampleCodeForSession(db, id);
      const md = refs.length
        ? `# Sample code for ${id}\n\n${refs.map((r) => `- [${r.kind}] ${r.title} — ${r.url}`).join("\n")}`
        : `No sample-code links recorded for ${id}.`;
      return { content: [{ type: "text", text: formatResponse(format, md, { id, count: refs.length, refs }) }] };
    },
  );

  // ---------- wwdc_sample_code_grep ----------
  server.registerTool(
    "wwdc_sample_code_grep",
    {
      title: "Grep WWDC sample-code URLs",
      description: "Filter all indexed sample-code refs by substring/regex (e.g. find sessions with `.zip` or `SwiftData`).",
      inputSchema: {
        pattern: z.string().min(1).describe("Regex or literal substring."),
        is_regex: z.boolean().default(false),
        limit: limitArg,
        format: formatArg,
      },
      annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
    },
    async ({ pattern, is_regex, limit, format }) => {
      const rows = db.prepare(`SELECT id, session_id, title, url, kind FROM sample_code`).all() as Array<{ id: string; session_id: string; title: string; url: string; kind: string }>;
      let re: RegExp | null = null;
      if (is_regex) {
        try {
          re = new RegExp(pattern, "i");
        } catch (e: any) {
          return { isError: true, content: [{ type: "text", text: errorText(`Invalid regex: ${e?.message ?? String(e)}`) }] };
        }
      }
      const needle = pattern.toLowerCase();
      const hits = rows.filter((r) => re ? re.test(r.url) : r.url.toLowerCase().includes(needle)).slice(0, limit);
      const md = `# Sample-code grep: ${pattern}\n\n${hits.map((h) => `- [${h.session_id ?? "?"}] ${h.title}\n  ${h.url}`).join("\n")}`;
      return { content: [{ type: "text", text: formatResponse(format, md, { pattern, count: hits.length, hits }) }] };
    },
  );

  // ---------- apple_doc_lookup ----------
  server.registerTool(
    "apple_doc_lookup",
    {
      title: "Lookup an Apple developer doc",
      description: "Fetch an Apple /documentation JSON node by path (e.g. 'swiftui/view', 'foundationmodels/languagemodel'). Returns live data (no cache).",
      inputSchema: {
        path: z.string().min(1).describe("Framework path or Apple documentation URL, e.g. `swiftui/view` or `https://developer.apple.com/documentation/swiftui/view`."),
        format: formatArg,
      },
      annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: true },
    },
    async ({ path, format }) => {
      const normalized = documentationPathFromInput(path);
      if (normalized.error || !normalized.clean) {
        return { isError: true, content: [{ type: "text", text: errorText(normalized.error ?? "Invalid documentation path.") }] };
      }
      const clean = normalized.clean;
      const jsonUrl = `https://developer.apple.com/tutorials/data/documentation/${clean}.json`;
      const htmlUrl = `${APPLE_DOCS_BASE}/${clean}`;
      try {
        const { data, status } = await httpGet<{ metadata?: { title?: string; role?: string }; abstract?: Array<{ text: string }> }>(jsonUrl);
        if (status >= 400 || !data) {
          return { isError: true, content: [{ type: "text", text: errorText(`apple docs: HTTP ${status} for ${jsonUrl}`, `Try the path without trailing segments. Browser URL: ${htmlUrl}`) }] };
        }
        const title = data.metadata?.title ?? clean;
        const abstract = (data.abstract ?? []).map((a) => a.text).join("");
        const md = `# ${title}\n\n${abstract}\n\n${htmlUrl}`;
        return { content: [{ type: "text", text: formatResponse(format, md, { title, abstract, url: htmlUrl, raw: data }) }] };
      } catch (e: any) {
        return { isError: true, content: [{ type: "text", text: errorText(e?.message ?? String(e)) }] };
      }
    },
  );

  // ---------- apple_doc_get ----------
  server.registerTool(
    "apple_doc_get",
    {
      title: "Get indexed Apple documentation",
      description: "Return an Apple Developer documentation page from the local index by normalized path, e.g. `swiftui/view`.",
      inputSchema: {
        path: z.string().min(1).describe("Framework path or Apple documentation URL."),
        include_raw: z.boolean().default(false),
        body_chars: z.number().int().min(500).max(25_000).default(10_000),
        format: formatArg,
      },
      annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
    },
    async ({ path, include_raw, body_chars, format }) => {
      const normalized = documentationPathFromInput(path);
      if (normalized.error || !normalized.clean) {
        return { isError: true, content: [{ type: "text", text: errorText(normalized.error ?? "Invalid documentation path.") }] };
      }
      const doc = getAppleDoc(db, normalized.clean.toLowerCase());
      if (!doc) return { isError: true, content: [{ type: "text", text: errorText(`indexed Apple doc not found: ${normalized.clean}`, "Run: npm run ingest:docs") }] };
      const md = `# ${doc.title}\n\n${doc.abstract}\n\n**Path:** ${doc.id}\n**Modules:** ${doc.modules.join(", ") || "none"}\n**Platforms:** ${doc.platforms.join(", ") || "none"}\n**Role:** ${doc.role ?? "unknown"}${doc.symbolKind ? `\n**Symbol kind:** ${doc.symbolKind}` : ""}\n\n${truncate(doc.body, body_chars)}\n\n${doc.url}`;
      return { content: [{ type: "text", text: formatResponse(format, md, include_raw ? doc : { ...doc, rawJson: undefined }) }] };
    },
  );

  // ---------- apple_tutorial_get ----------
  server.registerTool(
    "apple_tutorial_get",
    {
      title: "Get an Apple tutorial (DocC)",
      description: "Return a tutorial from local index (ingest first) including chapter list and estimated time.",
      inputSchema: { id: z.string().min(1), format: formatArg },
      annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
    },
    async ({ id, format }) => {
      const t = getTutorial(db, id);
      if (!t) return { isError: true, content: [{ type: "text", text: errorText(`tutorial not found: ${id}`, "Run: npm run ingest:tutorials") }] };
      const md = `# ${t.title}\n\n*${t.category ?? ""}*${t.estimatedTime ? ` — ${t.estimatedTime}` : ""}\n\n${truncate(t.body, 8000)}\n\n${t.url}`;
      return { content: [{ type: "text", text: formatResponse(format, md, t) }] };
    },
  );

  // ---------- apple_hig_search ----------
  server.registerTool(
    "apple_hig_search",
    {
      title: "Search Human Interface Guidelines",
      description: "Keyword search across HIG topics (components, patterns, platforms).",
      inputSchema: { query: z.string().min(1), limit: limitArg, format: formatArg },
      annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
    },
    async ({ query, limit, format }) => {
      const { hits, total } = searchHigFts(db, ftsQuote(query), limit, 0);
      const md = `# HIG results for: ${query}\n\n${hits.map((h) => `- **${h.title}** — ${h.url}\n  ${h.snippet ?? ""}`).join("\n")}`;
      return { content: [{ type: "text", text: formatResponse(format, md, { total, hits }) }] };
    },
  );

  // ---------- apple_swift_evolution_get ----------
  server.registerTool(
    "apple_swift_evolution_get",
    {
      title: "Get a Swift Evolution proposal",
      description: "Return a proposal by id (e.g. SE-0428) with status, authors, and full body.",
      inputSchema: { id: z.string().min(1), format: formatArg },
      annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
    },
    async ({ id, format }) => {
      const p = getEvolution(db, id);
      if (!p) return { isError: true, content: [{ type: "text", text: errorText(`proposal not found: ${id}`, "Run npm run ingest:evolution; id format: SE-0428.") }] };
      const md = `# ${p.id}: ${p.title}\n\n**Status:** ${p.status}  **Authors:** ${p.authors.join(", ")}${p.swiftVersion ? `  **Swift:** ${p.swiftVersion}` : ""}\n\n${truncate(p.body, 10000)}\n\n${p.url}`;
      return { content: [{ type: "text", text: formatResponse(format, md, p) }] };
    },
  );

  // ---------- apple_swift_evolution_list ----------
  server.registerTool(
    "apple_swift_evolution_list",
    {
      title: "List Swift Evolution proposals",
      description: "List proposals (optionally filter by status: Implemented, Accepted, Rejected, Active review).",
      inputSchema: {
        status: z.string().optional(),
        limit: limitArg,
        offset: offsetArg,
        format: formatArg,
      },
      annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
    },
    async ({ status, limit, offset, format }) => {
      const rows = status
        ? db.prepare(`SELECT id, number, title, status, url FROM evolution WHERE status LIKE ? ORDER BY number LIMIT ? OFFSET ?`).all(`%${status}%`, limit, offset)
        : db.prepare(`SELECT id, number, title, status, url FROM evolution ORDER BY number LIMIT ? OFFSET ?`).all(limit, offset);
      const md = `# Swift Evolution proposals${status ? ` — ${status}` : ""} (${rows.length})\n\n${(rows as any[]).map((r) => `- **${r.id}** ${r.title} — ${r.status}`).join("\n")}`;
      return { content: [{ type: "text", text: formatResponse(format, md, { count: rows.length, rows }) }] };
    },
  );

  // ---------- apple_swift_pattern_find ----------
  server.registerTool(
    "apple_swift_pattern_find",
    {
      title: "Find Apple Swift patterns",
      description:
        "Find repeated implementation/product patterns across indexed WWDC sessions, Apple docs, tutorials, HIG, and Swift Evolution. Use for API adoption, app architecture, and opportunity discovery.",
      inputSchema: {
        query: z.string().min(1).describe("Pattern area, API, feature, or product need, e.g. `App Intents Spotlight actions` or `SwiftData migration`."),
        platforms: z.array(platformArg).default([]),
        frameworks: z.array(z.string().min(1)).default([]),
        year_min: z.number().int().default(2020),
        min_source_kinds: z.number().int().min(1).max(5).default(2).describe("Minimum distinct source kinds required for a strong pattern."),
        limit: limitArg,
        format: formatArg,
      },
      annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
    },
    async ({ query, platforms, frameworks, year_min, min_source_kinds, limit, format }) => {
      const terms = uniqueTerms([
        query,
        ...splitAuditTerms(query),
        ...frameworks,
        ...platforms,
      ]).slice(0, 16);
      const searches = terms.map((term) => {
        const fts = ftsQuote(term);
        return {
          term,
          session: searchSessionsFts(db, fts, Math.min(limit, 8), 0, { yearMin: year_min, platforms }),
          doc: searchAppleDocsFts(db, fts, Math.min(limit, 8), 0),
          tutorial: searchTutorialsFts(db, fts, Math.min(limit, 5), 0),
          hig: searchHigFts(db, fts, Math.min(limit, 5), 0),
          evolution: searchEvolutionFts(db, fts, Math.min(limit, 5), 0),
        };
      });
      const patterns = searches.map((search) => {
        const byKind = {
          session: search.session.hits,
          doc: search.doc.hits,
          tutorial: search.tutorial.hits,
          hig: search.hig.hits,
          evolution: search.evolution.hits,
        };
        const sourceKinds = Object.entries(byKind).filter(([, hits]) => hits.length > 0).map(([kind]) => kind);
        const evidence = Object.values(byKind).flat().slice(0, limit);
        return {
          term: search.term,
          sourceKinds,
          strength: sourceKinds.length >= min_source_kinds ? "strong" : sourceKinds.length > 0 ? "weak" : "none",
          evidence_count: evidence.length,
          evidence,
          suggested_next_tools: uniqueTerms(evidence.map((hit) => hit.kind === "session" ? "wwdc_get_session" : hit.kind === "doc" ? "apple_doc_get" : hit.kind === "tutorial" ? "apple_tutorial_get" : hit.kind === "hig" ? "apple_hig_search" : "apple_swift_evolution_get")),
        };
      }).filter((pattern) => pattern.evidence_count > 0)
        .sort((a, b) => b.sourceKinds.length - a.sourceKinds.length || b.evidence_count - a.evidence_count)
        .slice(0, limit);

      const strong = patterns.filter((pattern) => pattern.strength === "strong");
      const coverage = auditSourceCoverage(db);
      const caveats = [
        ...(coverage.docs === 0 ? ["Apple docs index empty; run `npm run ingest:docs`"] : []),
        ...(coverage.sessions === 0 ? ["WWDC index empty; run `npm run ingest:wwdc`"] : []),
        ...(patterns.length === 0 ? ["No indexed pattern evidence found; broaden query or ingest more docs/sessions"] : []),
        ...(strong.length === 0 && patterns.length > 0 ? [`No pattern reached ${min_source_kinds} source kinds; treat as weak signal`] : []),
      ];
      const md = `# Swift pattern find: ${query}\n\n${patterns.map((pattern) => {
        const lines = pattern.evidence.slice(0, 6).map((hit) => `  - [${hit.kind}] ${hit.title}${hit.year ? ` — WWDC ${hit.year}` : ""}\n    ${hit.url}`);
        return `## ${pattern.term}\n- strength: ${pattern.strength}\n- sources: ${pattern.sourceKinds.join(", ")}\n- next tools: ${pattern.suggested_next_tools.join(", ") || "none"}\n${lines.join("\n")}`;
      }).join("\n\n")}\n\n## Judgment\n- strong patterns: ${strong.length}\n- caveats: ${caveats.join("; ") || "none"}`;
      return {
        content: [{
          type: "text",
          text: formatResponse(format, md, {
            query,
            platforms,
            frameworks,
            year_min,
            min_source_kinds,
            source_coverage: coverage,
            patterns,
            judgment: {
              confidence: strong.length > 0 ? "high" : patterns.length > 0 ? "medium" : "low",
              strong_patterns: strong.length,
              caveats,
            },
          }),
        }],
      };
    },
  );

  // ---------- swift_app_audit ----------
  server.registerTool(
    "swift_app_audit",
    {
      title: "Swift app audit context",
      description:
        "Build an audit-grade Swift/SwiftUI/macOS/iOS research bundle from local WWDC, HIG, tutorials, and Swift Evolution data. Use before code changes to map feature/platform/symptom to evidence and validation steps.",
      inputSchema: {
        focus: swiftAuditFocusArg.describe("Audit focus area."),
        platforms: z.array(platformArg).default([]).describe("Target Apple platforms."),
        frameworks: z.array(z.string().min(1)).default([]).describe("Frameworks or APIs, e.g. SwiftUI, SwiftData, AppKit, StoreKit."),
        feature: z.string().optional().describe("Feature/screen/workflow being audited."),
        symptom: z.string().optional().describe("Observed bug, performance issue, warning, or failure mode."),
        year_min: z.number().int().default(2023).describe("Prefer WWDC sessions from this year or newer."),
        include_evolution: z.boolean().default(true),
        limit: limitArg,
        format: formatArg,
      },
      annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
    },
    async ({ focus, platforms, frameworks, feature, symptom, year_min, include_evolution, limit, format }) => {
      const profile = SWIFT_AUDIT_FOCUS_TERMS[focus];
      const archetypeTerms = auditArchetypeTerms({ focus, platforms, frameworks, feature, symptom });
      const featureTerms = uniqueTerms([
        feature,
        symptom,
        ...splitAuditTerms(feature),
        ...splitAuditTerms(symptom),
      ]);
      const frameworkTerms = uniqueTerms([
        ...frameworks,
        ...archetypeTerms,
      ]);
      const sessionQueries = uniqueTerms([
        ...featureTerms,
        ...frameworkTerms,
        ...platforms,
        ...profile.session,
      ]);
      const higQueries = uniqueTerms([
        ...featureTerms,
        ...archetypeTerms,
        ...platforms,
        ...profile.hig,
      ]);
      const evolutionQueries = uniqueTerms([
        ...frameworkTerms,
        ...profile.evolution,
      ]);

      const priorityFor = (query: string) => {
        if (featureTerms.includes(query)) return 0;
        if (frameworkTerms.includes(query)) return 1;
        if (platforms.includes(query as z.infer<typeof platformArg>)) return 3;
        return 2;
      };

      const sessionSearches = sessionQueries.slice(0, 14).map((query) => {
        const filtered = searchSessionsFts(db, ftsQuote(query), Math.min(limit, 5), 0, {
          yearMin: year_min,
          platforms,
          requireTranscript: false,
        });
        return { query, priority: priorityFor(query), ...filtered, usedPlatformFallback: false };
      });
      const tutorialSearches = sessionQueries.slice(0, 12).map((query) => ({
        query,
        priority: priorityFor(query),
        ...searchTutorialsFts(db, ftsQuote(query), Math.min(limit, 3), 0),
      }));
      const docSearches = sessionQueries.slice(0, 14).map((query) => ({
        query,
        priority: priorityFor(query),
        ...searchAppleDocsFts(db, ftsQuote(query), Math.min(limit, 5), 0),
      }));
      const higSearches = higQueries.slice(0, 12).map((query) => ({
        query,
        priority: priorityFor(query),
        ...searchHigFts(db, ftsQuote(query), Math.min(limit, 4), 0),
      }));
      const evolutionSearches = include_evolution
        ? evolutionQueries.slice(0, 12).map((query) => ({
          query,
          priority: priorityFor(query),
          ...searchEvolutionFts(db, ftsQuote(query), Math.min(limit, 4), 0),
        }))
        : [];

      const sessions = pickRankedAuditHits(sessionSearches, limit).map((hit) => ({ ...hit, judgment: judgeHit(sessionQueries[0] ?? focus, hit) }));
      const docs = pickRankedAuditHits(docSearches, Math.min(limit, 6));
      const tutorials = pickRankedAuditHits(tutorialSearches, Math.min(limit, 4));
      const hig = pickRankedAuditHits(higSearches, Math.min(limit, 5));
      const evolution = pickRankedAuditHits(evolutionSearches, Math.min(limit, 5));
      // App Store Guidelines — especially useful for app-store focus and all audits
      const guidelineTerms = featureTerms.slice(0, 6);
      const guidelineHits = guidelineTerms.flatMap((q) =>
        searchAppStoreGuidelinesFts(db, ftsQuote(q), 3, 0)
      );
      const seenGuidelineIds = new Set<string>();
      const appstoreGuidelines = guidelineHits.filter((h) => {
        if (seenGuidelineIds.has(h.id)) return false;
        seenGuidelineIds.add(h.id);
        return true;
      }).slice(0, focus === "app-store" ? 8 : 4);
      // Swift book — especially useful for concurrency / state / data focus
      const swiftBookTerms = featureTerms.slice(0, 4);
      const swiftBookHits = swiftBookTerms.flatMap((q) =>
        searchSwiftBookFts(db, ftsQuote(q), 2, 0)
      );
      const seenBookIds = new Set<string>();
      const swiftBook = swiftBookHits.filter((h) => {
        if (seenBookIds.has(h.id)) return false;
        seenBookIds.add(h.id);
        return true;
      }).slice(0, ["concurrency", "state", "data", "general"].includes(focus) ? 4 : 2);
      const totalMatches = sessions.length + docs.length + tutorials.length + hig.length + evolution.length + appstoreGuidelines.length + swiftBook.length;
      const ingestStatus = listIngestStatus(db);
      const indexedItems = ingestStatus.reduce((sum, row) => sum + row.itemsIngested, 0);
      const sourceCoverage = auditSourceCoverage(db);
      const docHints = auditDocHints({ focus, platforms, frameworks, feature, symptom, archetypeTerms });
      const pathwayHints = auditPathwayHints({ focus, platforms, frameworks, feature, symptom });
      const diagnostics = diagnoseWeakHits({ focus, platforms, frameworks, featureTerms, archetypeTerms, hig });
      const summary = buildSwiftAuditSummary({
        focus,
        platforms,
        frameworks,
        feature,
        symptom,
        totalMatches,
        indexedItems,
        sourceCoverage,
      });
      if (sessionSearches.some((search) => search.usedPlatformFallback)) {
        summary.caveats.push("session platform metadata unavailable for one or more queries; session results include unfiltered WWDC matches");
        if (summary.readiness === "ready_for_code_review") summary.readiness = "seed_context_only";
      }

      const validation = uniqueTerms([
        ...profile.validation,
        ...auditArchetypeValidationTerms({ focus, platforms, frameworks, feature, symptom }),
        focus === "macos" || platforms.includes("macOS") ? "Use SwiftPM/Xcode macOS build-run path; do not apply simulator-only assumptions" : undefined,
        focus === "performance" ? "Capture before/after Instruments or OSLog evidence for same interaction" : undefined,
      ]);
      const md = renderSwiftAuditMd({
        focus,
        platforms,
        frameworks,
        feature,
        symptom,
        sessions,
        docs,
        tutorials,
        hig,
        evolution,
        appstoreGuidelines,
        swiftBook,
        validation,
        docHints,
        pathwayHints,
        diagnostics,
        summary,
      });
      return {
        content: [{
          type: "text",
          text: formatResponse(format, md, {
            focus,
            platforms,
            frameworks,
            feature,
            symptom,
            year_min,
            summary,
            queries: { sessions: sessionQueries, docs: sessionQueries, tutorials: sessionQueries, hig: higQueries, evolution: evolutionQueries },
            platform_fallback_used: sessionSearches.some((search) => search.usedPlatformFallback),
            source_coverage: sourceCoverage,
            doc_hints: docHints,
            pathway_hints: pathwayHints,
            diagnostics,
            results: { sessions, docs, tutorials, hig, evolution },
            validation,
            ingest_status: ingestStatus,
          }),
        }],
      };
    },
  );

  // ---------- apple_swift_book_get ----------
  server.registerTool(
    "apple_swift_book_get",
    {
      title: "Swift Language Reference chapter",
      description: "Retrieve a chapter from The Swift Programming Language book (docs.swift.org). Covers Language Guide (closures, concurrency, generics…) and Language Reference (grammar, declarations, attributes). Search with wwdc_search first to find the slug.",
      inputSchema: {
        chapter: z.string().describe("Chapter slug, e.g. 'concurrency', 'generics', 'closures'. Use wwdc_search to discover slugs."),
        format: formatArg,
      },
      annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
    },
    async ({ chapter, format }) => {
      const row = getSwiftBookChapter(db, chapter.toLowerCase().replace(/\s+/g, "-"));
      if (!row) {
        return { content: [{ type: "text", text: `No Swift book chapter found for '${chapter}'. Run 'npm run ingest:swiftbook' first, or search with wwdc_search.` }] };
      }
      const md = `# [Swift Book] ${row.title}\n**Section:** ${row.section}\n${row.url}\n\n${row.body}`;
      return { content: [{ type: "text", text: formatResponse(format, md, row) }] };
    },
  );

  // ---------- appstore_guidelines_search ----------
  server.registerTool(
    "appstore_guidelines_search",
    {
      title: "Search App Store Review Guidelines",
      description: "Full-text search across all App Store Review Guidelines sections (Safety, Performance, Business, Design, Legal). Returns matching sections with text excerpts. Use before submitting an app or when auditing for policy compliance.",
      inputSchema: {
        query: z.string().describe("Search query, e.g. 'privacy tracking', 'in-app purchase', 'advertising', 'kids category'."),
        limit: limitArg,
        offset: offsetArg,
        format: formatArg,
      },
      annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
    },
    async ({ query, limit, offset, format }) => {
      const safeFts = ftsQuote(query);
      const hits = searchAppStoreGuidelinesFts(db, safeFts, limit, offset);
      if (hits.length === 0) {
        return { content: [{ type: "text", text: `No App Store guideline sections matched '${query}'. Run 'npm run ingest:appstore' to populate the index.` }] };
      }
      const md = `# App Store Review Guidelines: ${query}\n\n${hits.map((h) => `- **${h.title}**\n  ${h.url}${h.snippet ? `\n  _${h.snippet}_` : ""}`).join("\n")}\n\n_${hits.length} sections shown_`;
      return { content: [{ type: "text", text: formatResponse(format, md, { hits, query }) }] };
    },
  );

  // ---------- wwdc_find_api_introduction ----------
  server.registerTool(
    "wwdc_find_api_introduction",
    {
      title: "Find when an Apple API was introduced",
      description:
        "Given a Swift symbol, framework, or feature name (e.g. 'SystemLanguageModel', 'SwiftData', '@Observable', 'LiquidGlass'), searches WWDC sessions to determine which year it was first announced or introduced. Returns sessions sorted by year ascending so the earliest hit is listed first.",
      inputSchema: {
        symbol: z.string().min(1).describe("Swift symbol, API name, framework, or feature to find (e.g. 'SystemLanguageModel', 'SwiftData', 'LiquidGlass', '@Observable')."),
        limit: z.number().int().min(1).max(20).default(5),
        format: formatArg,
      },
      annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
    },
    async ({ symbol, limit, format }) => {
      const fts = ftsQuote(symbol);
      const { hits, earliestYear } = findApiIntroduction(db, fts, limit);
      if (hits.length === 0) {
        const md = `No WWDC sessions found mentioning **${symbol}**. The symbol may not be indexed, or it may predate the indexed sessions. Try \`wwdc_search\` with a broader term.`;
        return { content: [{ type: "text", text: formatResponse(format, md, { symbol, hits: [], earliestYear: null }) }] };
      }
      const introLine = earliestYear
        ? `**Likely introduced:** WWDC ${earliestYear} (earliest session match)`
        : "";
      const sessionList = hits
        .map((h) => `- **WWDC ${h.year ?? "?"}** — ${h.title}\n  ${h.url}${h.snippet ? `\n  _${h.snippet}_` : ""}`)
        .join("\n");
      const md = `# API Introduction: ${symbol}\n\n${introLine}\n\n## Sessions (oldest first)\n\n${sessionList}\n\n_${hits.length} session(s) shown_`;
      return { content: [{ type: "text", text: formatResponse(format, md, { symbol, hits, earliestYear }) }] };
    },
  );

  // ---------- wwdc_what_changed ----------
  server.registerTool(
    "wwdc_what_changed",
    {
      title: "Compare WWDC topic coverage across two years",
      description:
        "Compares WWDC session coverage of a topic (framework, feature, or API area) between two years. Useful for 'What's new in SwiftUI between 2024 and 2025?' Returns sessions for each year so you can see what was added.",
      inputSchema: {
        topic: z.string().min(1).describe("Framework, feature, or API area to compare (e.g. 'SwiftUI', 'Foundation Models', 'StoreKit', 'Swift concurrency')."),
        year_a: z.number().int().describe("Earlier year (e.g. 2024)."),
        year_b: z.number().int().describe("Later year (e.g. 2025)."),
        limit: z.number().int().min(1).max(10).default(5).describe("Number of sessions to return per year."),
        format: formatArg,
      },
      annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
    },
    async ({ topic, year_a, year_b, limit, format }) => {
      const fts = ftsQuote(topic);
      const { hits: hitsA } = getSessionsByYearAndTopic(db, fts, year_a, limit);
      const { hits: hitsB } = getSessionsByYearAndTopic(db, fts, year_b, limit);
      const renderList = (hits: SearchHit[]) =>
        hits.length
          ? hits.map((h) => `- **${h.title}**\n  ${h.url}${h.snippet ? `\n  _${h.snippet}_` : ""}`).join("\n")
          : "_No sessions indexed for this year/topic._";
      const titlesA = new Set(hitsA.map((h) => h.title));
      const newInB = hitsB.filter((h) => !titlesA.has(h.title));
      const newNote = newInB.length
        ? `\n\n> **Likely new in WWDC ${year_b}:** ${newInB.map((h) => h.title).join(", ")}`
        : `\n\n> All sessions in WWDC ${year_b} also appear in WWDC ${year_a} results.`;
      const md = `# What changed: ${topic} (WWDC ${year_a} vs ${year_b})\n\n## WWDC ${year_a}\n\n${renderList(hitsA)}\n\n## WWDC ${year_b}\n\n${renderList(hitsB)}${newNote}\n\n_Sessions from WWDC ${year_b} that don't appear in WWDC ${year_a} are likely new additions._`;
      return { content: [{ type: "text", text: formatResponse(format, md, { topic, year_a, year_b, hitsA, hitsB }) }] };
    },
  );

  // ---------- wwdc_related_sessions ----------
  server.registerTool(
    "wwdc_related_sessions",
    {
      title: "Find related WWDC sessions",
      description:
        "Given a session ID, returns related sessions by topic overlap and FTS similarity on the title. Useful for discovering companion sessions, follow-up content, or sessions covering the same framework from a different angle.",
      inputSchema: {
        session_id: z.string().min(1).describe("WWDC session ID, e.g. 'wwdc2025-111'."),
        limit: z.number().int().min(1).max(20).default(8),
        format: formatArg,
      },
      annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
    },
    async ({ session_id, limit, format }) => {
      const result = findRelatedSessions(db, session_id, limit);
      if (!result) {
        return { isError: true, content: [{ type: "text", text: errorText(`session not found: ${session_id}`, "Use wwdc_search or wwdc_list_years to find valid session IDs.") }] };
      }
      const { seedTitle, seedYear, hits } = result;
      if (hits.length === 0) {
        const md = `No related sessions found for **${seedTitle}** (WWDC ${seedYear}). Try \`wwdc_search\` with the same topic for broader results.`;
        return { content: [{ type: "text", text: formatResponse(format, md, { session_id, seedTitle, seedYear, hits: [] }) }] };
      }
      const sessionList = hits
        .map((h) => `- **WWDC ${h.year ?? "?"}** — ${h.title}\n  ${h.url}${h.snippet ? `\n  _${h.snippet}_` : ""}`)
        .join("\n");
      const md = `## Related sessions for ${seedTitle} (WWDC ${seedYear})\n\n${sessionList}\n\n_${hits.length} related session(s) found_`;
      return { content: [{ type: "text", text: formatResponse(format, md, { session_id, seedTitle, seedYear, hits }) }] };
    },
  );

  // ---------- apple_hig_list ----------
  server.registerTool(
    "apple_hig_list",
    {
      title: "Browse Human Interface Guidelines entries",
      description: "List HIG entries with optional category and keyword filters. Groups results by category. Use apple_hig_search for full-text FTS search; use this to browse by category (e.g. 'Foundations', 'Components', 'Inputs').",
      inputSchema: {
        section: z.string().optional().describe("HIG category substring filter, e.g. 'Foundations', 'Components', 'Inputs'."),
        keyword: z.string().optional().describe("Keyword filter applied to title and body."),
        limit: limitArg,
        offset: offsetArg,
        format: formatArg,
      },
      annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
    },
    async ({ section, keyword, limit, offset, format }) => {
      const { rows, total } = listHigEntries(db, { category: section, keyword, limit, offset });
      // Group by category
      const grouped = new Map<string, typeof rows>();
      for (const r of rows) {
        const cat = r.category ?? "(uncategorized)";
        if (!grouped.has(cat)) grouped.set(cat, []);
        grouped.get(cat)!.push(r);
      }
      const mdLines: string[] = [`# HIG entries (${total} total, showing ${rows.length})\n`];
      for (const [cat, entries] of grouped.entries()) {
        mdLines.push(`## ${cat}`);
        for (const e of entries) {
          mdLines.push(`- [${e.title}](${e.url ?? "#"})`);
        }
      }
      const md = mdLines.join("\n");
      return { content: [{ type: "text", text: formatResponse(format, md, { total, count: rows.length, rows: rows.map((r) => ({ ...r, category: r.category ?? null })) }) }] };
    },
  );

  // ---------- apple_swift_evolution_filter ----------
  server.registerTool(
    "apple_swift_evolution_filter",
    {
      title: "Filter Swift Evolution proposals",
      description: "List Swift Evolution proposals with rich filters: Swift version, status, author, keyword FTS. Returns a markdown table. Use apple_swift_evolution_get for the full body of a specific proposal.",
      inputSchema: {
        swift_version: z.string().optional().describe("Swift version prefix, e.g. '5.9', '6.0', '6.1'."),
        status: z.string().optional().describe("Status substring, e.g. 'Implemented', 'Accepted', 'Rejected', 'Active review', 'Withdrawn'."),
        author: z.string().optional().describe("Author name substring."),
        keyword: z.string().optional().describe("Full-text keyword search on title and body."),
        limit: limitArg,
        offset: offsetArg,
        format: formatArg,
      },
      annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
    },
    async ({ swift_version, status, author, keyword, limit, offset, format }) => {
      const { rows, total } = filterEvolutionProposals(db, { swiftVersion: swift_version, status, author, keyword, limit, offset });
      const tableHeader = "| Number | Title | Status | Swift | Authors | Link |\n|--------|-------|--------|-------|---------|------|";
      const tableRows = (rows as any[]).map((r) => {
        const authorsArr = (() => { try { return JSON.parse(r.authors) as string[]; } catch { return [r.authors ?? "?"]; } })();
        return `| SE-${String(r.number).padStart(4, "0")} | ${r.title} | ${r.status ?? "?"} | ${r.swift_version ?? "?"} | ${authorsArr.join(", ")} | [link](${r.url}) |`;
      });
      const md = `# Swift Evolution proposals (${total} total, showing ${rows.length})\n\n${tableHeader}\n${tableRows.join("\n")}`;
      return { content: [{ type: "text", text: formatResponse(format, md, { total, count: rows.length, rows }) }] };
    },
  );

  // ---------- wwdc_session_transcript_full ----------
  server.registerTool(
    "wwdc_session_transcript_full",
    {
      title: "Read full WWDC session transcript in chunks",
      description: "Retrieve the complete transcript of a WWDC session in paginated chunks. Use chunk_index=0 to start, then increment until chunk_index >= totalChunks. Useful for sessions where the excerpt in wwdc_get_session is insufficient.",
      inputSchema: {
        id: z.string().min(1).describe("Session ID, e.g. wwdc2024-10150."),
        chunk_index: z.number().int().min(0).default(0).describe("0-based chunk index."),
        chunk_size: z.number().int().min(1000).max(20000).default(8000).describe("Characters per chunk (default 8000, max 20000)."),
        format: formatArg,
      },
      annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
    },
    async ({ id, chunk_index, chunk_size, format }) => {
      const result = getSessionTranscriptChunk(db, id, chunk_index, chunk_size);
      if (!result) {
        return { isError: true, content: [{ type: "text", text: errorText(`session not found: ${id}`, "Use wwdc_search or wwdc_list_years to find valid session IDs.") }] };
      }
      const { title, year, url, chunk, chunkIndex, totalChunks, transcriptLength } = result;
      if (transcriptLength === 0) {
        return { content: [{ type: "text", text: `No transcript available for **${title}** (WWDC ${year}).` }] };
      }
      if (chunkIndex >= totalChunks) {
        return { content: [{ type: "text", text: `Chunk index ${chunkIndex} is out of range (${totalChunks} total chunks for this transcript).` }] };
      }
      const start = chunkIndex * chunk_size;
      const end = Math.min(start + chunk_size, transcriptLength);
      const header = `# ${title} — WWDC ${year}\nChunk ${chunkIndex + 1}/${totalChunks} (chars ${start + 1}–${end} of ${transcriptLength})\n${url}\n\n`;
      const md = `${header}${chunk}`;
      return { content: [{ type: "text", text: formatResponse(format, md, { id, title, year, url, chunkIndex, totalChunks, transcriptLength, chunk }) }] };
    },
  );

  // ---------- wwdc_topics_by_year ----------
  server.registerTool(
    "wwdc_topics_by_year",
    {
      title: "WWDC topics by year",
      description: "Show the most popular WWDC session topics for a given year, or a cross-year comparison table. Useful for 'what was hot at WWDC 2024?' or comparing topic frequency trends.",
      inputSchema: {
        year: z.number().int().optional().describe("WWDC year (e.g. 2024). Omit for a cross-year comparison table."),
        limit: z.number().int().min(1).max(50).default(15).describe("Top N topics to return per year."),
        format: formatArg,
      },
      annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
    },
    async ({ year, limit, format }) => {
      const result = getTopicsByYear(db, year, limit);
      if ("year" in result && result.year !== undefined) {
        const { topics } = result;
        if (topics.length === 0) {
          return { content: [{ type: "text", text: `No topics found for WWDC ${year}. Make sure sessions are indexed with \`npm run ingest:wwdc\`.` }] };
        }
        const md = `# Top topics — WWDC ${year}\n\n${topics.map((t, i) => `${i + 1}. **${t.topic}** — ${t.count} session${t.count === 1 ? "" : "s"}`).join("\n")}`;
        return { content: [{ type: "text", text: formatResponse(format, md, { year, topics }) }] };
      }
      // Cross-year comparison
      const { years } = result as { years: Record<number, Array<{ topic: string; count: number }>> };
      const yearKeys = Object.keys(years).map(Number).sort((a, b) => a - b);
      if (yearKeys.length === 0) {
        return { content: [{ type: "text", text: "No session data found. Run `npm run ingest:wwdc` to populate the index." }] };
      }
      // Collect all topics across years
      const allTopics = new Set<string>();
      for (const yr of yearKeys) for (const t of years[yr] ?? []) allTopics.add(t.topic);
      // Build cross-year count map
      const topicTotals = new Map<string, number>();
      for (const yr of yearKeys) for (const t of years[yr] ?? []) topicTotals.set(t.topic, (topicTotals.get(t.topic) ?? 0) + t.count);
      const sortedTopics = [...allTopics].sort((a, b) => (topicTotals.get(b) ?? 0) - (topicTotals.get(a) ?? 0)).slice(0, limit);
      const header = `| Topic | ${yearKeys.join(" | ")} |\n|-------|${yearKeys.map(() => "------").join("|")}|`;
      const dataRows = sortedTopics.map((topic) => {
        const cells = yearKeys.map((yr) => {
          const entry = (years[yr] ?? []).find((t) => t.topic === topic);
          return entry ? String(entry.count) : "—";
        });
        return `| ${topic} | ${cells.join(" | ")} |`;
      });
      const md = `# WWDC topics by year (top ${sortedTopics.length})\n\n${header}\n${dataRows.join("\n")}`;
      return { content: [{ type: "text", text: formatResponse(format, md, { years }) }] };
    },
  );

  // ---------- wwdc_sample_code_list ----------
  server.registerTool(
    "wwdc_sample_code_list",
    {
      title: "List WWDC sample code projects",
      description: "Browse all indexed sample code projects with optional year and topic filters. Returns title, URL, kind (zip/github/snippet), and the linked session. Grouped by year.",
      inputSchema: {
        year: z.number().int().optional().describe("Filter to a specific WWDC year."),
        topic: z.string().optional().describe("Session topic substring filter, e.g. 'SwiftUI', 'Swift', 'visionOS'."),
        tag: z.string().optional().describe("Sample code kind filter, e.g. 'zip', 'github'."),
        limit: limitArg,
        offset: offsetArg,
        format: formatArg,
      },
      annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
    },
    async ({ year, topic, tag, limit, offset, format }) => {
      const { rows, total } = listSampleCode(db, { year, topic, tag, limit, offset });
      if (rows.length === 0) {
        return { content: [{ type: "text", text: `No sample code found${year ? ` for WWDC ${year}` : ""}. Run \`npm run ingest:wwdc\` to populate the index.` }] };
      }
      // Group by year
      const grouped = new Map<string, typeof rows>();
      for (const r of rows) {
        const key = r.year !== null ? String(r.year) : "Unknown year";
        if (!grouped.has(key)) grouped.set(key, []);
        grouped.get(key)!.push(r);
      }
      const mdLines: string[] = [`# Sample code projects (${total} total, showing ${rows.length})\n`];
      for (const [yr, entries] of [...grouped.entries()].sort((a, b) => Number(b[0]) - Number(a[0]))) {
        mdLines.push(`## WWDC ${yr}`);
        for (const e of entries) {
          const sessionLink = e.session_id ? ` ([${e.session_title ?? e.session_id}](https://developer.apple.com/wwdc${e.year}/${e.session_number}))` : "";
          mdLines.push(`- [${e.title}](${e.url}) \`${e.kind}\`${sessionLink}`);
        }
      }
      const md = mdLines.join("\n");
      return { content: [{ type: "text", text: formatResponse(format, md, { total, count: rows.length, rows }) }] };
    },
  );

  // ---------- wwdc_list_sessions ----------
  server.registerTool(
    "wwdc_list_sessions",
    {
      title: "List WWDC sessions for a year",
      description: "Browse all sessions for a given WWDC year with optional topic, transcript, and sample-code filters. Returns session number, title, duration, and flags for transcript/sample-code availability.",
      inputSchema: {
        year: z.number().int().describe("WWDC year, e.g. 2024."),
        sort_by: z.enum(["session_number", "duration", "title"]).default("session_number").describe("Sort column."),
        sort_dir: z.enum(["asc", "desc"]).default("asc").describe("Sort direction."),
        topic: z.string().optional().describe("Topic substring filter, e.g. 'SwiftUI', 'Swift Concurrency'."),
        has_transcript: z.boolean().optional().describe("Only return sessions with an indexed transcript."),
        has_sample_code: z.boolean().optional().describe("Only return sessions with sample code URLs."),
        limit: z.number().int().min(1).max(100).default(20),
        offset: offsetArg,
        format: formatArg,
      },
      annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
    },
    async ({ year, sort_by, sort_dir, topic, has_transcript, has_sample_code, limit, offset, format }) => {
      const { rows, total } = listSessionsByYearFull(db, year, {
        sortBy: sort_by,
        topic,
        hasTranscript: has_transcript,
        hasSampleCode: has_sample_code,
        limit,
        offset,
      });
      if (rows.length === 0) {
        return { content: [{ type: "text", text: `No sessions found for WWDC ${year}${topic ? ` with topic '${topic}'` : ""}. Run \`npm run ingest:wwdc\` to populate the index.` }] };
      }
      const lines = rows.map((r) => {
        const flags = [r.has_transcript ? "📝" : "", r.has_sample_code ? "💻" : ""].filter(Boolean).join(" ");
        return `- [${r.session_number}] [${r.title}](${r.url}) — ${r.duration ?? "?"}min${flags ? " " + flags : ""}`;
      });
      const md = `## WWDC ${year} Sessions (${total} total)\n\n${lines.join("\n")}\n\n_${rows.length} shown / ${total} matched_`;
      return { content: [{ type: "text", text: formatResponse(format, md, { year, total, count: rows.length, rows }) }] };
    },
  );

  // ---------- wwdc_speaker_search ----------
  server.registerTool(
    "wwdc_speaker_search",
    {
      title: "Search sessions by speaker",
      description: "Find all WWDC sessions featuring a speaker. Case-insensitive substring match against the speakers field.",
      inputSchema: {
        speaker: z.string().describe("Speaker name (or partial name), e.g. 'Tim Cook', 'Quinn'."),
        year: z.number().int().optional().describe("Restrict to a specific WWDC year."),
        limit: z.number().int().min(1).max(50).default(20),
        format: formatArg,
      },
      annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
    },
    async ({ speaker, year, limit, format }) => {
      const hits = findSessionsBySpeaker(db, speaker, year, limit);
      if (hits.length === 0) {
        return { content: [{ type: "text", text: `No sessions found for speaker matching '${speaker}'${year ? ` in WWDC ${year}` : ""}.` }] };
      }
      // Group by year
      const grouped = new Map<number, typeof hits>();
      for (const h of hits) {
        const yr = h.year ?? 0;
        if (!grouped.has(yr)) grouped.set(yr, []);
        grouped.get(yr)!.push(h);
      }
      const mdLines: string[] = [`# Speaker search: "${speaker}"\n`];
      for (const [yr, sessions] of [...grouped.entries()].sort((a, b) => b[0] - a[0])) {
        mdLines.push(`## WWDC ${yr}`);
        for (const s of sessions) {
          const speakersStr = s.speakers?.join(", ") ?? "";
          mdLines.push(`- [${s.title}](${s.url})${speakersStr ? ` — ${speakersStr}` : ""}`);
        }
      }
      return { content: [{ type: "text", text: formatResponse(format, mdLines.join("\n"), { speaker, year, count: hits.length, hits }) }] };
    },
  );

  // ---------- wwdc_transcript_search ----------
  server.registerTool(
    "wwdc_transcript_search",
    {
      title: "Full-text search inside WWDC transcripts",
      description: "Search the full text of indexed WWDC transcripts using FTS5. Returns matching sessions with a snippet showing the matched text in context.",
      inputSchema: {
        query: z.string().describe("Search phrase, e.g. 'Swift concurrency structured' or 'observable macro'."),
        year: z.number().int().optional().describe("Restrict to a specific WWDC year."),
        year_min: z.number().int().optional().describe("Minimum WWDC year (inclusive), e.g. 2022."),
        year_max: z.number().int().optional().describe("Maximum WWDC year (inclusive), e.g. 2024."),
        limit: z.number().int().min(1).max(30).default(10),
        offset: offsetArg,
        format: formatArg,
      },
      annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
    },
    async ({ query, year, year_min, year_max, limit, offset, format }) => {
      const { hits, total } = searchTranscripts(db, query, { year, yearMin: year_min, yearMax: year_max, limit, offset });
      if (hits.length === 0) {
        return { content: [{ type: "text", text: `No transcript matches for **${query}**. Try broader terms or check \`wwdc_ingest_status\` to confirm transcripts are indexed.` }] };
      }
      const lines = hits.map((h) => {
        const snippet = h.snippet ? `\n  _${h.snippet}_` : "";
        return `- **${h.title}**${h.year ? ` — WWDC ${h.year}` : ""}\n  ${h.url}${snippet}`;
      });
      const md = `# Transcript search: "${query}"\n\n${lines.join("\n")}\n\n_${hits.length} shown / ${total} matched_`;
      return { content: [{ type: "text", text: formatResponse(format, md, { query, total, count: hits.length, hits }) }] };
    },
  );

  // ---------- apple_doc_list_framework ----------
  server.registerTool(
    "apple_doc_list_framework",
    {
      title: "List Apple docs by framework",
      description: "Browse all indexed Apple documentation symbols and articles for a framework or module. Matches against the modules JSON array and the doc path prefix.",
      inputSchema: {
        framework: z.string().describe("Framework or module name, e.g. 'SwiftUI', 'StoreKit', 'AVFoundation'."),
        type: z.string().optional().describe("Filter by symbol kind or role, e.g. 'protocol', 'struct', 'article'."),
        limit: z.number().int().min(1).max(200).default(50),
        offset: offsetArg,
        format: formatArg,
      },
      annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
    },
    async ({ framework, type, limit, offset, format }) => {
      const { rows, total } = listDocsByFramework(db, framework, { type, limit, offset });
      if (rows.length === 0) {
        return { content: [{ type: "text", text: `No docs indexed for framework '${framework}'${type ? ` with type '${type}'` : ""}. Run \`npm run ingest:appledocs\` to populate the index.` }] };
      }
      // Group by role
      const grouped = new Map<string, typeof rows>();
      for (const r of rows) {
        const key = r.type ?? r.role ?? "other";
        if (!grouped.has(key)) grouped.set(key, []);
        grouped.get(key)!.push(r);
      }
      const mdLines: string[] = [`## ${framework} — ${total} symbols indexed\n`];
      for (const [role, entries] of [...grouped.entries()].sort()) {
        mdLines.push(`### ${role}`);
        for (const e of entries) {
          mdLines.push(`- [${e.title}](${e.url})`);
        }
      }
      mdLines.push(`\n_${rows.length} shown / ${total} total_`);
      return { content: [{ type: "text", text: formatResponse(format, mdLines.join("\n"), { framework, total, count: rows.length, rows }) }] };
    },
  );

  // ---------- appstore_guideline_get ----------
  server.registerTool(
    "appstore_guideline_get",
    {
      title: "Get App Store guideline by ID or section number",
      description: "Retrieve the full text of a specific App Store Review Guideline section. Accepts the anchor slug (e.g. 'safety-1-1') or section number (e.g. '1.1'). Falls back to prefix-matching when no exact match is found.",
      inputSchema: {
        id: z.string().describe("Guideline anchor slug (e.g. 'safety-1-1') or section number (e.g. '1.1', '3.1.1')."),
        format: formatArg,
      },
      annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
    },
    async ({ id, format }) => {
      const { exact, partialMatches } = getAppStoreGuidelineById(db, id);
      if (exact) {
        const md = `## App Store Guideline ${exact.sectionNumber || exact.id}: ${exact.title}\n\n${exact.body}\n\n[View on developer.apple.com](${exact.url})`;
        return { content: [{ type: "text", text: formatResponse(format, md, exact) }] };
      }
      if (partialMatches.length > 0) {
        const md = `No exact match for '${id}'. Closest matches:\n\n${partialMatches.map((g) => `- **${g.sectionNumber || g.id}** — [${g.title}](${g.url})`).join("\n")}`;
        return { content: [{ type: "text", text: formatResponse(format, md, { query: id, partialMatches }) }] };
      }
      return { content: [{ type: "text", text: `No guideline found for '${id}'. Use \`appstore_guidelines_search\` to browse by keyword.` }] };
    },
  );

  // ---------- wwdc_ingest_status ----------
  server.registerTool(
    "wwdc_ingest_status",
    {
      title: "Ingest status + what's new",
      description: "Shows per-source last-run metadata and the most recent sessions added. Use to confirm the index is fresh before querying.",
      inputSchema: {
        since: z.string().optional().describe("ISO timestamp; defaults to 7 days ago."),
        limit: limitArg,
        format: formatArg,
      },
      annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
    },
    async ({ since, limit, format }) => {
      const sinceIso = since ?? new Date(Date.now() - 7 * 24 * 3600_000).toISOString();
      const status = listIngestStatus(db);
      const recent = listSessionsAddedSince(db, sinceIso, limit);
      const md = `# Ingest status\n\n${status.map((s) => `- **${s.source}** — last run: ${s.lastRunAt}, items: ${s.itemsIngested}, errors: ${s.errors}${s.notes ? ` (${s.notes})` : ""}`).join("\n")}\n\n## Added since ${sinceIso}\n${recent.map((r) => `- [${r.year}] ${r.title} (${r.id})`).join("\n")}`;
      return { content: [{ type: "text", text: formatResponse(format, md, { status, recent, since: sinceIso }) }] };
    },
  );

  // ---------- apple_api_deprecation ----------
  server.registerTool(
    "apple_api_deprecation",
    {
      title: "Apple API deprecation status",
      description: "Check whether an Apple API symbol is deprecated, when it was deprecated, and what replaced it. Looks up by symbol name (e.g. UIWebView, UIAlertView).",
      inputSchema: {
        api_name: z.string().min(1).describe("Symbol name to look up, e.g. \"UIWebView\", \"UIAlertView\""),
        format: formatArg,
      },
      annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
    },
    async ({ api_name, format }) => {
      const { rows, fallback } = getApiDeprecation(db, api_name);
      let md: string;
      if (fallback) {
        if (rows.length === 0) {
          md = `# ${api_name} — deprecation unknown\n\nDeprecation metadata not yet populated (schema migration may not have run). Re-run ingest to populate.\n\nNo matching API found in index.`;
        } else {
          const found = rows.map((r: any) => `- **${r.title}** — ${r.url}`).join("\n");
          md = `# ${api_name} — deprecation metadata not yet populated\n\nSchema migration may not have run. Re-run ingest with \`--source apple-docs\` to populate deprecation columns.\n\n## Matching docs\n${found}`;
        }
      } else if (rows.length === 0) {
        md = `# ${api_name} — not deprecated\n\nNo deprecated entries found in the index for **${api_name}**. The symbol may not be deprecated, not yet indexed, or the name may differ.\n\nTip: try \`apple_doc_lookup\` for availability info.`;
      } else {
        const items = rows.map((r: any) => {
          const dep = r.deprecated_at ? ` (deprecated ${r.deprecated_at})` : "";
          const intro = r.introduced_at ? `\n- **Introduced:** ${r.introduced_at}` : "";
          const msg = r.deprecated_message ? `\n- **Replacement:** ${r.deprecated_message}` : "";
          return `## ${r.title}${dep}\n- **ID:** ${r.id}\n- **URL:** ${r.url}${intro}${msg}`;
        }).join("\n\n");
        md = `# ${api_name} — deprecated\n\n${items}`;
      }
      return { content: [{ type: "text", text: formatResponse(format, md, { api_name, rows, fallback }) }] };
    },
  );

  // ---------- apple_api_availability ----------
  server.registerTool(
    "apple_api_availability",
    {
      title: "Apple API availability (min OS version)",
      description: "Look up the minimum OS version an Apple API was introduced in, and whether it has been deprecated. Uses the apple_docs index.",
      inputSchema: {
        api_name: z.string().min(1).describe("Symbol name, e.g. \"SwiftUI.View\", \"UITableView\""),
        format: formatArg,
      },
      annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
    },
    async ({ api_name, format }) => {
      const rows = getApiAvailability(db, api_name);
      let md: string;
      if (rows.length === 0) {
        md = `# ${api_name} — not found\n\nNo entries found in the index. The symbol may not be indexed yet. Try \`wwdc_search\` or \`apple_doc_lookup\`.`;
      } else {
        const items = rows.map((r: any) => {
          const intro = r.introduced_at ? `\n- **Introduced:** ${r.introduced_at}` : "\n- **Introduced:** unknown";
          const dep = r.deprecated === 1 ? `\n- **Deprecated:** ${r.deprecated_at ?? "yes (version unknown)"}` : "\n- **Deprecated:** no";
          return `## ${r.title}\n- **ID:** ${r.id}\n- **URL:** ${r.url}${intro}${dep}`;
        }).join("\n\n");
        md = `# ${api_name} — availability\n\n${items}`;
      }
      return { content: [{ type: "text", text: formatResponse(format, md, { api_name, rows }) }] };
    },
  );

  // ---------- apple_release_notes_search ----------
  server.registerTool(
    "apple_release_notes_search",
    {
      title: "Search Apple release notes",
      description: "Full-text search across Apple OS/SDK release notes (iOS, macOS, Xcode, watchOS, tvOS, visionOS). Returns matching entries with snippets.",
      inputSchema: {
        query: z.string().min(1).describe("Search query, e.g. \"SwiftUI deprecation\", \"StoreKit 2\""),
        os: z.enum(["iOS", "macOS", "Xcode", "watchOS", "tvOS", "visionOS"]).optional().describe("Filter by OS/platform"),
        limit: z.number().int().min(1).max(30).default(10),
        offset: offsetArg,
        format: formatArg,
      },
      annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
    },
    async ({ query, os, limit, offset, format }) => {
      const fts = ftsQuote(query);
      const { rows, tableExists } = searchReleaseNotes(db, fts, { os, limit, offset });
      let md: string;
      if (!tableExists) {
        md = `# Release notes — not yet ingested\n\nThe \`release_notes\` table does not exist. Run ingest with \`--source release-notes\` to populate.`;
      } else if (rows.length === 0) {
        md = `# Release notes search: ${query}\n\nNo matches found${os ? ` for ${os}` : ""}.`;
      } else {
        const items = rows.map((r: any) =>
          `- **[${r.os} ${r.version}]** ${r.title}\n  ${r.url}${r.snip ? `\n  _${r.snip}_` : ""}`,
        ).join("\n");
        md = `# Release notes: ${query}${os ? ` (${os})` : ""}\n\n${items}\n\n_${rows.length} results shown_`;
      }
      return { content: [{ type: "text", text: formatResponse(format, md, { query, os, rows, tableExists }) }] };
    },
  );

  // ---------- apple_what_replaced ----------
  server.registerTool(
    "apple_what_replaced",
    {
      title: "What replaced a deprecated Apple API",
      description: "Given a deprecated Apple API symbol, finds what replaced it (from the deprecated_message field) and lists WWDC sessions introducing the replacement.",
      inputSchema: {
        api_name: z.string().min(1).describe("Deprecated API name, e.g. \"UIWebView\", \"UIAlertView\""),
        format: formatArg,
      },
      annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
    },
    async ({ api_name, format }) => {
      const { deprecation, sessions } = findApiReplacement(db, api_name);
      let md: string;
      if (deprecation.length === 0) {
        md = `# ${api_name} — no replacement info found\n\nNo deprecated entry found in the index for **${api_name}**. The symbol may not be deprecated or not yet indexed.\n\nTry \`apple_api_deprecation\` to check deprecation status.`;
      } else {
        const depMd = deprecation.map((r: any) => {
          const at = r.deprecated_at ? ` (deprecated ${r.deprecated_at})` : "";
          const msg = r.deprecated_message ? `\n\n**Replacement:** ${r.deprecated_message}` : "\n\n**Replacement:** not specified in metadata.";
          return `## ${r.title}${at}\n${r.url}${msg}`;
        }).join("\n\n");
        const sessMd = sessions.length > 0
          ? `\n\n## WWDC sessions for replacement\n${sessions.map((s: any) => `- **WWDC ${s.year}** — ${s.title}\n  ${s.url}`).join("\n")}`
          : "\n\n## WWDC sessions\nNo sessions matched the replacement symbol.";
        md = `# What replaced ${api_name}?\n\n${depMd}${sessMd}`;
      }
      return { content: [{ type: "text", text: formatResponse(format, md, { api_name, deprecation, sessions }) }] };
    },
  );

  // ---------- apple_search_all ----------
  server.registerTool(
    "apple_search_all",
    {
      title: "Federated search across all Apple content",
      description: "Search all indexed Apple content at once: WWDC sessions, Apple docs, HIG, and Swift Evolution. Results are merged and ranked by relevance.",
      inputSchema: {
        query: z.string().min(1).describe("Search query"),
        types: z.array(z.enum(["session", "doc", "hig", "evolution"])).default(["session", "doc", "hig", "evolution"]).describe("Content types to include"),
        limit: z.number().int().min(1).max(40).default(15),
        format: formatArg,
      },
      annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
    },
    async ({ query, types, limit, format }) => {
      const fts = ftsQuote(query);
      const rows = searchAll(db, fts, { types, limit });
      let md: string;
      if (rows.length === 0) {
        md = `# Search all: ${query}\n\nNo matches found across ${types.join(", ")}.`;
      } else {
        // Group by type
        const grouped: Record<string, any[]> = {};
        for (const r of rows) {
          if (!grouped[r.type]) grouped[r.type] = [];
          grouped[r.type].push(r);
        }
        const sections = Object.entries(grouped).map(([type, hits]) => {
          const label = { session: "WWDC Sessions", doc: "Apple Docs", hig: "Human Interface Guidelines", evolution: "Swift Evolution" }[type] ?? type;
          const items = hits.map((h: any) =>
            `- **${h.title}**${h.year ? ` — WWDC ${h.year}` : ""}\n  ${h.url}${h.snip ? `\n  _${h.snip}_` : ""}`,
          ).join("\n");
          return `## ${label}\n${items}`;
        }).join("\n\n");
        md = `# Search all: ${query}\n\n_${rows.length} results across ${types.join(", ")}_\n\n${sections}`;
      }
      return { content: [{ type: "text", text: formatResponse(format, md, { query, types, rows }) }] };
    },
  );

  // ---------- wwdc_sessions_for_api ----------
  server.registerTool(
    "wwdc_sessions_for_api",
    {
      title: "WWDC sessions mentioning an API symbol",
      description: "Find all WWDC sessions that mention a specific API symbol in title, description, or transcript. Ranked by relevance. Shows year prominently.",
      inputSchema: {
        symbol: z.string().min(1).describe("API symbol to search for, e.g. \"SwiftData\", \"Observable\", \"SwiftUI.View\""),
        year: z.number().int().optional().describe("Restrict to a specific WWDC year"),
        include_transcript: z.boolean().default(false).describe("If true, include transcript snippet in results"),
        format: formatArg,
      },
      annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
    },
    async ({ symbol, year, include_transcript, format }) => {
      const fts = ftsQuote(symbol);
      const rows = findSessionsForApi(db, fts, year);
      let md: string;
      if (rows.length === 0) {
        md = `# Sessions for: ${symbol}\n\nNo sessions found${year ? ` in WWDC ${year}` : ""}. The symbol may not appear in indexed transcripts or session metadata.`;
      } else {
        const items = rows.map((r: any) => {
          const snip = include_transcript && r.transcript_snip ? `\n  _${r.transcript_snip}_` : "";
          return `- **WWDC ${r.year}** — ${r.title}\n  ${r.url}${snip}`;
        }).join("\n");
        md = `# Sessions mentioning: ${symbol}${year ? ` (WWDC ${year})` : ""}\n\n${items}\n\n_${rows.length} sessions found_`;
      }
      return { content: [{ type: "text", text: formatResponse(format, md, { symbol, year, rows }) }] };
    },
  );

  // ---------- swift_forum_search ----------
  server.registerTool(
    "swift_forum_search",
    {
      title: "Search Swift Forums",
      description:
        "Full-text search across forums.swift.org discussions, including Swift Evolution proposals discussion, using-swift questions, and development topics. Returns ranked forum posts with title, category, URL, and a content snippet. Useful for finding community discussion around Swift proposals, language behavior, compiler questions, and API usage.",
      inputSchema: {
        query: z.string().min(1).describe("Search query, e.g. 'sendable', 'actor isolation', 'async sequence', 'SE-0400'."),
        category: z
          .enum(["swift-evolution", "using-swift", "development"])
          .optional()
          .describe("Filter to a specific category. Omit to search all categories."),
        limit: limitArg,
        offset: offsetArg,
        format: formatArg,
      },
      annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
    },
    async ({ query, category, limit, offset, format }) => {
      const safeFts = ftsQuote(query);
      const rows = searchSwiftForums(db, safeFts, { category, limit, offset });
      if (rows.length === 0) {
        const catNote = category ? ` in category '${category}'` : "";
        const md = `No Swift Forum posts matched '${query}'${catNote}. Run \`npm run ingest -- --source swift-forums\` to populate the index.`;
        return { content: [{ type: "text", text: formatResponse(format, md, { query, rows: [] }) }] };
      }
      const items = rows.map((r: any) =>
        `- **${r.title}** [${r.category ?? ""}]\n  ${r.url}${r.snip ? `\n  _${r.snip}_` : ""}`,
      ).join("\n");
      const md = `# Swift Forums: ${query}\n\n${items}\n\n_${rows.length} posts shown_`;
      return { content: [{ type: "text", text: formatResponse(format, md, { query, category, rows }) }] };
    },
  );

  // ---------- apple_forum_search ----------
  server.registerTool(
    "apple_forum_search",
    {
      title: "Search Apple Developer Forums",
      description:
        "Full-text search across Apple Developer Forums posts ingested from RSS feeds. Covers SwiftUI, Swift, Combine, and other recent developer discussions. Returns ranked posts with title, URL, and content snippet.",
      inputSchema: {
        query: z.string().min(1).describe("Search query, e.g. 'SwiftUI list performance', 'NavigationStack', 'Combine publisher'."),
        limit: limitArg,
        offset: offsetArg,
        format: formatArg,
      },
      annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
    },
    async ({ query, limit, offset, format }) => {
      const safeFts = ftsQuote(query);
      const rows = searchAppleDevForums(db, safeFts, { limit, offset });
      if (rows.length === 0) {
        const md = `No Apple Developer Forum posts matched '${query}'. Run \`npm run ingest -- --source apple-dev-forums\` to populate the index.`;
        return { content: [{ type: "text", text: formatResponse(format, md, { query, rows: [] }) }] };
      }
      const items = rows.map((r: any) =>
        `- **${r.title}**${r.author ? ` — ${r.author}` : ""}${r.published_at ? ` (${r.published_at})` : ""}\n  ${r.url}${r.snip ? `\n  _${r.snip}_` : ""}`,
      ).join("\n");
      const md = `# Apple Developer Forums: ${query}\n\n${items}\n\n_${rows.length} posts shown_`;
      return { content: [{ type: "text", text: formatResponse(format, md, { query, rows }) }] };
    },
  );

  // ---------- wwdc_session_summary ----------
  server.registerTool(
    "wwdc_session_summary",
    {
      title: "LLM-generated session summary",
      description:
        "Returns the AI-generated structured summary for a WWDC session: 2-3 sentence overview, key APIs, topics, code patterns, and difficulty level. Falls back to the session description if no summary has been generated yet. Run `npm run ingest -- --source session-summaries` to populate.",
      inputSchema: {
        session_id: z.string().min(1).describe("Session ID, e.g. 'wwdc2024-10016'. Use wwdc_search or wwdc_get_session to find IDs."),
        format: formatArg,
      },
      annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
    },
    async ({ session_id, format }) => {
      const summary = getSessionSummary(db, session_id);
      if (!summary) {
        // Fallback: return session description if exists
        const session = db.prepare(
          `SELECT id, title, year, url, description, topics FROM sessions WHERE id = ?`,
        ).get(session_id) as any;
        if (!session) {
          return { content: [{ type: "text", text: `Session '${session_id}' not found. Use wwdc_search or wwdc_list_years to find valid session IDs.` }] };
        }
        let topics: string[] = [];
        try { topics = JSON.parse(session.topics ?? "[]") as string[]; } catch { /* ignore */ }
        const md = `# ${session.title} — WWDC ${session.year}\n\n${session.url}\n\n## Description (no LLM summary yet)\n${session.description ?? "No description available."}\n\n**Topics:** ${topics.join(", ") || "None"}\n\n_Run \`npm run ingest -- --source session-summaries\` to generate structured summaries._`;
        return { content: [{ type: "text", text: formatResponse(format, md, { session_id, summary: null, session }) }] };
      }
      const md = [
        `# ${summary.title} — WWDC ${summary.year}`,
        `${summary.url}`,
        ``,
        `## Summary`,
        summary.summary,
        ``,
        summary.key_apis.length ? `**Key APIs:** ${summary.key_apis.join(", ")}` : "",
        summary.key_topics.length ? `**Key Topics:** ${summary.key_topics.join(", ")}` : "",
        summary.difficulty ? `**Difficulty:** ${summary.difficulty}` : "",
        summary.code_patterns.length ? `\n## Code Patterns\n${summary.code_patterns.map((p) => `- ${p}`).join("\n")}` : "",
        ``,
        `_Generated by ${summary.model_used ?? "unknown"} at ${summary.generated_at ?? "unknown"}_`,
      ].filter((l) => l !== "").join("\n");
      return { content: [{ type: "text", text: formatResponse(format, md, summary) }] };
    },
  );

  // ---------- apple_cross_references ----------
  server.registerTool(
    "apple_cross_references",
    {
      title: "Apple entity cross-references",
      description:
        "Returns outgoing and/or incoming edges from the cross-reference graph for a given entity. Use to find: which sessions mention an API, which proposals a session implements, which APIs a session covers, related sessions. Build the graph with `npm run ingest -- --source cross-reference`.",
      inputSchema: {
        entity_type: z.enum(["session", "doc", "hig", "evolution", "sample_code"]).describe("Type of the entity."),
        entity_id: z.string().min(1).describe("Entity ID, e.g. 'wwdc2024-10016' for a session, 'swiftui/view' for a doc, 'SE-0428' for a proposal."),
        direction: z.enum(["out", "in", "both"]).default("both").describe("'out' = edges FROM this entity, 'in' = edges TO this entity, 'both' = all."),
        format: formatArg,
      },
      annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
    },
    async ({ entity_type, entity_id, direction, format }) => {
      const { outgoing, incoming } = getCrossReferences(db, entity_type, entity_id, direction);
      if (outgoing.length === 0 && incoming.length === 0) {
        return { content: [{ type: "text", text: `No cross-references found for ${entity_type}:${entity_id} (direction=${direction}). The graph may not be built yet — run \`npm run ingest -- --source cross-reference\`.` }] };
      }
      const lines: string[] = [`# Cross-references: ${entity_type}:${entity_id}\n`];
      if (outgoing.length > 0) {
        lines.push(`## Outgoing (${outgoing.length})`);
        for (const edge of outgoing) {
          lines.push(`- **${edge.relationship}** → ${edge.to_type}:${edge.to_id} (weight=${edge.weight})`);
        }
      }
      if (incoming.length > 0) {
        lines.push(`\n## Incoming (${incoming.length})`);
        for (const edge of incoming) {
          lines.push(`- **${edge.relationship}** ← ${edge.from_type}:${edge.from_id} (weight=${edge.weight})`);
        }
      }
      const md = lines.join("\n");
      return { content: [{ type: "text", text: formatResponse(format, md, { entity_type, entity_id, direction, outgoing, incoming }) }] };
    },
  );

  // ---------- wwdc_export_status ----------
  server.registerTool(
    "wwdc_export_status",
    {
      title: "Database table counts (health check)",
      description:
        "Returns row counts for all indexed tables. Use to quickly verify the state of the index — how many sessions, docs, summaries, cross-reference edges, etc. are available.",
      inputSchema: {
        format: formatArg,
      },
      annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
    },
    async ({ format }) => {
      const rows = getExportStatus(db);
      const total = rows.reduce((sum, r) => sum + r.count, 0);
      const md = [
        `# Database export status`,
        ``,
        ...rows.map((r) => `- **${r.table_name}**: ${r.count.toLocaleString()} rows`),
        ``,
        `_Total: ${total.toLocaleString()} rows across ${rows.length} tables_`,
      ].join("\n");
      return { content: [{ type: "text", text: formatResponse(format, md, { tables: rows, total }) }] };
    },
  );

  // ---------- wwdc_security_manifest ----------
  server.registerTool(
    "wwdc_security_manifest",
    {
      title: "WWDC MCP security manifest",
      description:
        "Returns the canonical tool list, manifest hash, read-only posture, prompt-injection handling notes, and threat-model summary. Use this to detect tool-surface drift and to remind agents that retrieved content is untrusted evidence.",
      inputSchema: { format: formatArg },
      annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
    },
    async ({ format }) => {
      const manifest = getSecurityManifest();
      const md = [
        `# WWDC MCP security manifest`,
        ``,
        `- tools: ${manifest.tool_count}`,
        `- manifest hash: \`${manifest.tool_manifest_hash}\``,
        `- posture: ${manifest.controls.default_posture}`,
        `- transport: ${manifest.controls.transport}`,
        ``,
        `## Controls`,
        ...Object.entries(manifest.controls).map(([key, value]) => `- **${key}:** ${Array.isArray(value) ? value.join(", ") || "none" : value}`),
        ``,
        `## Threat model`,
        ...manifest.threat_model.map((item) => `- ${item}`),
      ].join("\n");
      return { content: [{ type: "text", text: formatResponse(format, md, manifest) }] };
    },
  );
}

// ---------- helpers ----------

function renderSearchMd(
  query: string,
  hits: SearchHitWithJudgment[],
  total: number,
  judgment?: ReturnType<typeof judgeSearch>,
  detail: "compact" | "standard" | "detailed" = "standard",
): string {
  if (hits.length === 0) return `No matches for **${query}** (total=${total}).`;
  const lines = hits.map((h) => {
    const basics = `- **[${h.kind}]** ${h.title}${h.year ? ` — WWDC ${h.year}` : ""}\n  ${h.url}`;
    if (detail === "compact") return basics;
    const snippet = h.snippet ? `\n  _${h.snippet}_` : "";
    const reasons = detail === "detailed" && h.judgment?.reasons.length
      ? `\n  Judgment: ${h.judgment.confidence}; ${h.judgment.reasons.join("; ")}`
      : "";
    return `${basics}${snippet}${reasons}`;
  });
  const judgmentMd = judgment
    ? `\n\n## Search judgment\n- confidence: ${judgment.confidence}\n- answer readiness: ${judgment.answer_readiness}${judgment.caveats.length ? `\n- caveats: ${judgment.caveats.join("; ")}` : ""}${judgment.suggested_next_tools.length ? `\n- next tools: ${judgment.suggested_next_tools.join(", ")}` : ""}`
    : "";
  return `# Search: ${query}\n\n${lines.join("\n")}\n\n_${hits.length} shown / ${total} matched_${judgmentMd}`;
}

function renderSessionMd(s: {
  id: string; title: string; year: number; url: string; description: string;
  topics: string[]; platforms: string[]; speakers?: string[]; duration?: number;
  transcript?: string; sampleCodeUrls: string[]; relatedDocs: string[];
  deepLinks?: { label: string; seconds: number; url: string }[];
}, judgment?: {
  confidence: string;
  coverage: { has_transcript: boolean; chapter_count: number; sample_code_count: number; related_doc_count: number };
  caveats: string[];
  suggested_next_tools: string[];
}): string {
  const dur = s.duration ? ` — ${Math.round(s.duration / 60)} min` : "";
  const topics = s.topics.length ? `**Topics:** ${s.topics.join(", ")}\n` : "";
  const plats = s.platforms.length ? `**Platforms:** ${s.platforms.join(", ")}\n` : "";
  const speakers = s.speakers?.length ? `**Speakers:** ${s.speakers.join(", ")}\n` : "";
  const chaps = s.deepLinks && s.deepLinks.length
    ? `\n## Chapters\n${s.deepLinks.map((c) => `- ${c.label} — ${c.url}`).join("\n")}\n`
    : "";
  const sample = s.sampleCodeUrls.length ? `\n## Sample code\n${s.sampleCodeUrls.map((u) => `- ${u}`).join("\n")}\n` : "";
  const docs = s.relatedDocs.length ? `\n## Related docs\n${s.relatedDocs.slice(0, 15).map((u) => `- ${u}`).join("\n")}\n` : "";
  const transcript = s.transcript ? `\n## Transcript (excerpt)\n${s.transcript}\n` : "";
  const judgmentMd = judgment
    ? `\n## Session judgment\n- confidence: ${judgment.confidence}\n- coverage: transcript=${judgment.coverage.has_transcript}, chapters=${judgment.coverage.chapter_count}, sample_code=${judgment.coverage.sample_code_count}, related_docs=${judgment.coverage.related_doc_count}${judgment.caveats.length ? `\n- caveats: ${judgment.caveats.join("; ")}` : ""}\n- next tools: ${judgment.suggested_next_tools.join(", ")}\n`
    : "";
  return `# ${s.title}\nWWDC ${s.year}${dur}\n${topics}${plats}${speakers}\n${s.description}\n\n${s.url}\n${judgmentMd}${chaps}${sample}${docs}${transcript}`;
}

function renderSwiftAuditMd(args: {
  focus: string;
  platforms: string[];
  frameworks: string[];
  feature?: string;
  symptom?: string;
  sessions: SearchHitWithJudgment[];
  docs: SearchHitWithJudgment[];
  tutorials: SearchHitWithJudgment[];
  hig: SearchHitWithJudgment[];
  evolution: SearchHitWithJudgment[];
  appstoreGuidelines?: SearchHit[];
  swiftBook?: SearchHit[];
  validation: string[];
  docHints: AppleDocHint[];
  pathwayHints: Array<{ id: string; title: string; reason: string }>;
  diagnostics: ReturnType<typeof diagnoseWeakHits>;
  summary: {
    confidence: string;
    readiness: string;
    caveats: string[];
    next_tools: string[];
  };
}): string {
  const target = [
    `focus=${args.focus}`,
    args.platforms.length ? `platforms=${args.platforms.join(", ")}` : undefined,
    args.frameworks.length ? `frameworks=${args.frameworks.join(", ")}` : undefined,
    args.feature ? `feature=${args.feature}` : undefined,
    args.symptom ? `symptom=${args.symptom}` : undefined,
  ].filter(Boolean).join("; ");
  const renderHits = (hits: SearchHitWithJudgment[]) => hits.length
    ? hits.map((hit) => `- **${hit.title}**${hit.year ? ` — WWDC ${hit.year}` : ""}\n  ${hit.url}${hit.snippet ? `\n  _${hit.snippet}_` : ""}`).join("\n")
    : "- No local matches.";
  const docHints = args.docHints.length
    ? args.docHints.map((hint) => `- **${hint.title}** — ${hint.url}`).join("\n")
    : "- No direct doc hints matched.";
  const pathways = args.pathwayHints.length
    ? args.pathwayHints.map((pathway) => `- **${pathway.title}** (${pathway.id}) — ${pathway.reason}`).join("\n")
    : "- No archetype pathway matched.";
  const weakHits = args.diagnostics.weak_hig_hits.length
    ? args.diagnostics.weak_hig_hits.map((hit) => `- **${hit.title}** (${hit.id}) — ${hit.reason}`).join("\n")
    : "- No weak HIG hits detected.";
  const guidelinesSection = args.appstoreGuidelines?.length
    ? `\n\n## App Store Review Guidelines\n${args.appstoreGuidelines.map((h) => `- **${h.title}**\n  ${h.url}${h.snippet ? `\n  _${h.snippet}_` : ""}`).join("\n")}`
    : "";
  const swiftBookSection = args.swiftBook?.length
    ? `\n\n## Swift Language Reference\n${args.swiftBook.map((h) => `- **${h.title}**\n  ${h.url}${h.snippet ? `\n  _${h.snippet}_` : ""}`).join("\n")}`
    : "";
  return `# Swift app audit\n\n${target}\n\n## Judgment\n- confidence: ${args.summary.confidence}\n- readiness: ${args.summary.readiness}${args.summary.caveats.length ? `\n- caveats: ${args.summary.caveats.join("; ")}` : ""}\n- next tools: ${args.summary.next_tools.join(", ")}\n\n## Indexed Apple docs\n${renderHits(args.docs)}\n\n## Direct Apple doc hints\n${docHints}\n\n## Archetype pathways\n${pathways}\n\n## WWDC sessions\n${renderHits(args.sessions)}\n\n## Apple tutorials\n${renderHits(args.tutorials)}\n\n## Human Interface Guidelines\n${renderHits(args.hig)}\n\n## Weak-hit diagnostics\n${weakHits}\n\n## Swift Evolution\n${renderHits(args.evolution)}${guidelinesSection}${swiftBookSection}\n\n## Validation checklist\n${args.validation.map((step) => `- ${step}`).join("\n")}`;
}
