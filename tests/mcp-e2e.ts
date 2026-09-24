#!/usr/bin/env tsx
/**
 * MCP end-to-end test — spawns the built server over stdio, speaks the
 * real MCP protocol via @modelcontextprotocol/sdk Client, exercises every
 * one of the registered tools, asserts on results.
 *
 * Runs against a seeded SQLite DB at /tmp so WAL/SMB limitations never apply.
 */

import fs from "node:fs";
import path from "node:path";
import assert from "node:assert/strict";
import { fileURLToPath } from "node:url";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";

import { openDb, migrate, rebuildFts } from "../src/db/schema.js";
import {
  upsertSession, upsertTutorial, upsertHig, upsertEvolution,
  upsertSampleCode, upsertPathway, upsertAppleDoc, upsertSwiftBookChapter,
  upsertAppStoreGuideline, recordIngest,
} from "../src/db/queries.js";
import type {
  WwdcSession, HigEntry, SwiftEvolutionProposal, Pathway, AppleDocPage,
  SwiftBookChapter, AppStoreGuidelineEntry,
} from "../src/types.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT = path.resolve(__dirname, "..");

function seedDb(dbPath: string): void {
  if (fs.existsSync(dbPath)) fs.unlinkSync(dbPath);
  const db = openDb(dbPath);
  migrate(db);

  const now = new Date().toISOString();
  const s1: WwdcSession = {
    id: "wwdc2024-10150",
    year: 2024, sessionNumber: "10150",
    title: "SwiftUI essentials",
    description: "Learn the fundamentals of SwiftUI for building great apps across Apple platforms.",
    url: "https://developer.apple.com/videos/play/wwdc2024/10150/",
    duration: 1700,
    topics: ["SwiftUI", "Swift"],
    platforms: ["iOS", "macOS", "watchOS", "visionOS"],
    speakers: ["Taylor Kelly"],
    transcript: "SwiftUI gives you a declarative syntax to describe your UI. Views, state, and bindings. ".repeat(30),
    sampleCodeUrls: ["https://developer.apple.com/tutorials/sample-code/swiftui-essentials.zip"],
    relatedDocs: ["https://developer.apple.com/documentation/swiftui"],
    videoUrl: undefined,
    deepLinks: [{ label: "Intro", seconds: 0, url: "https://developer.apple.com/videos/play/wwdc2024/10150/?time=0" }],
    updatedAt: now,
  };
  const s2: WwdcSession = {
    ...s1, id: "wwdc2025-286", year: 2025, sessionNumber: "286",
    title: "Meet Foundation Models",
    description: "Apple Intelligence on-device language models.",
    url: "https://developer.apple.com/videos/play/wwdc2025/286/",
    duration: 1200,
    topics: ["AI", "Foundation Models", "Apple Intelligence"],
    transcript: "Foundation Models provide on-device language model capabilities with LanguageModelSession.",
    sampleCodeUrls: [],
    relatedDocs: ["https://developer.apple.com/documentation/foundationmodels"],
    deepLinks: [],
  };
  const s3: WwdcSession = {
    ...s1, id: "wwdc2024-99999", sessionNumber: "99999",
    title: "Query string deep links",
    description: "Regression fixture for sessions whose URLs already have query parameters.",
    url: "https://developer.apple.com/videos/play/wwdc2024/99999/?foo=bar",
    transcript: "Deep links should preserve existing query parameters.",
    sampleCodeUrls: [],
    deepLinks: [],
  };
  upsertSession(db, s1);
  upsertSession(db, s2);
  upsertSession(db, s3);

  // Sample-code ref (used by wwdc_list_session_code + wwdc_sample_code_grep)
  upsertSampleCode(db, {
    id: "wwdc2024-10150::sc1",
    sessionId: "wwdc2024-10150",
    title: "SwiftUI essentials sample",
    url: "https://developer.apple.com/tutorials/sample-code/swiftui-essentials.zip",
    kind: "zip",
  });

  // HIG
  const hig: HigEntry = {
    id: "buttons",
    title: "Buttons",
    platform: ["iOS", "macOS"],
    category: "components",
    summary: "A button initiates an instantaneous action.",
    body: "Buttons should clearly communicate their action.",
    url: "https://developer.apple.com/design/human-interface-guidelines/buttons",
    updatedAt: now,
  };
  upsertHig(db, hig);

  // Swift Evolution
  const ev: SwiftEvolutionProposal = {
    id: "SE-0428",
    number: 428,
    title: "Resolve DistributedActor protocols",
    status: "Implemented",
    authors: ["Konrad Malawski"],
    reviewManager: "John Doe",
    implementation: ["https://github.com/apple/swift/pull/70727"],
    swiftVersion: "6.0",
    body: "This proposal clarifies how DistributedActor protocols are resolved across actor systems.",
    url: "https://github.com/apple/swift-evolution/blob/main/proposals/0428.md",
    updatedAt: now,
  };
  upsertEvolution(db, ev);

  const doc: AppleDocPage = {
    id: "swiftui/view",
    title: "View",
    role: "protocol",
    symbolKind: "protocol",
    modules: ["SwiftUI"],
    platforms: ["iOS", "macOS", "watchOS", "visionOS"],
    url: "https://developer.apple.com/documentation/swiftui/view",
    abstract: "A type that represents part of your app's user interface.",
    body: "Use views to compose declarative interfaces with state, modifiers, accessibility, buttons, and navigation.",
    topicSections: ["Essentials", "Modifiers"],
    references: ["swiftui/button", "swiftui/navigationstack"],
    rawJson: "{}",
    updatedAt: now,
  };
  upsertAppleDoc(db, doc);

  // Tutorial
  upsertTutorial(
    db, "swiftui",
    { identifier: { url: "doc://com.apple.SwiftUI/tutorials/SwiftUI", interfaceLanguage: "swift" },
      schemaVersion: { major: 0, minor: 3, patch: 0 },
      metadata: { title: "Introducing SwiftUI", category: "SwiftUI", role: "overview", estimatedTime: "4hr 25min" },
      sections: [], references: {} },
    "Introducing SwiftUI. A declarative framework.",
    "https://developer.apple.com/tutorials/swiftui",
  );

  // Pathway
  const pw: Pathway = {
    id: "swiftui-fundamentals",
    title: "SwiftUI Fundamentals",
    description: "Intro track",
    category: "SwiftUI",
    steps: [{ order: 1, title: "SwiftUI essentials", kind: "session", url: s1.url }],
    sourceUrl: "internal",
    updatedAt: now,
  };
  upsertPathway(db, pw);

  const swiftBook: SwiftBookChapter = {
    id: "concurrency",
    title: "Concurrency",
    section: "Language Guide",
    body: "Swift concurrency uses async functions, tasks, actors, and Sendable checking.",
    url: "https://docs.swift.org/swift-book/documentation/the-swift-programming-language/concurrency/",
    updatedAt: now,
  };
  upsertSwiftBookChapter(db, swiftBook);

  const guideline: AppStoreGuidelineEntry = {
    id: "business-3-1-1",
    sectionNumber: "3.1.1",
    title: "In-App Purchase",
    body: "If you want to unlock features or functionality within your app, you must use in-app purchase.",
    url: "https://developer.apple.com/app-store/review/guidelines/#in-app-purchase",
    updatedAt: now,
  };
  upsertAppStoreGuideline(db, guideline);

  recordIngest(db, "wwdc", 2, 0, "seeded");
  recordIngest(db, "docs", 1, 0, "seeded");
  recordIngest(db, "swiftbook", 1, 0, "seeded");
  recordIngest(db, "appstore", 1, 0, "seeded");
  rebuildFts(db);
  db.close();
}

interface CallResult {
  content?: Array<{ type: string; text?: string }>;
  isError?: boolean;
}

function textOf(r: CallResult): string {
  return (r.content ?? []).map((c) => c.text ?? "").join("\n");
}

async function main(): Promise<void> {
  const dbPath = path.join(process.env.TMPDIR ?? "/tmp", `wwdc-e2e-${process.pid}.db`);
  seedDb(dbPath);

  const transport = new StdioClientTransport({
    command: "node",
    args: [path.join(ROOT, "dist", "index.js")],
    env: {
      ...process.env as Record<string, string>,
      WWDC_MCP_DB: dbPath,
      // Force Ollama off so the test is deterministic and network-free.
      OLLAMA_BASE: "http://127.0.0.1:1", // unreachable
    },
    stderr: "ignore",
  });

  const client = new Client({ name: "wwdc-e2e", version: "0.0.1" }, { capabilities: {} });
  await client.connect(transport);

  try {
    // 0) listTools must return all tools
    const listed = await client.listTools();
    const names = new Set(listed.tools.map((t) => t.name));
    const expected = [
      "wwdc_search",
      "wwdc_list_years",
      "wwdc_list_topics",
      "wwdc_list_pathways",
      "wwdc_get_pathway",
      "wwdc_get_session",
      "wwdc_session_deep_link",
      "wwdc_list_session_code",
      "wwdc_sample_code_grep",
      "apple_doc_lookup",
      "apple_doc_get",
      "apple_tutorial_get",
      "apple_hig_search",
      "apple_swift_evolution_get",
      "apple_swift_evolution_list",
      "apple_swift_pattern_find",
      "swift_app_audit",
      "apple_swift_book_get",
      "appstore_guidelines_search",
      "wwdc_find_api_introduction",
      "wwdc_what_changed",
      "wwdc_related_sessions",
      "apple_hig_list",
      "apple_swift_evolution_filter",
      "wwdc_session_transcript_full",
      "wwdc_topics_by_year",
      "wwdc_sample_code_list",
      "wwdc_list_sessions",
      "wwdc_speaker_search",
      "wwdc_transcript_search",
      "apple_doc_list_framework",
      "appstore_guideline_get",
      "wwdc_ingest_status",
      "apple_api_deprecation",
      "apple_api_availability",
      "apple_release_notes_search",
      "apple_what_replaced",
      "apple_search_all",
      "wwdc_sessions_for_api",
      "swift_forum_search",
      "apple_forum_search",
      "wwdc_session_summary",
      "apple_cross_references",
      "wwdc_export_status",
      "wwdc_security_manifest",
    ];
    for (const name of expected) assert.ok(names.has(name), `missing tool: ${name}`);
    assert.equal(names.size, expected.length, `unexpected tool count: ${names.size}`);

    // Helper
    const call = async (name: string, args: Record<string, unknown>): Promise<CallResult> =>
      (await client.callTool({ name, arguments: args })) as CallResult;

    // 1) wwdc_search — session
    {
      const r = await call("wwdc_search", { query: "SwiftUI", kinds: ["session"], format: "json" });
      assert.ok(!r.isError, "wwdc_search errored");
      const data = JSON.parse(textOf(r));
      assert.ok(Array.isArray(data.hits), "hits array");
      assert.ok(data.hits.length >= 1, "session hit");
      assert.ok(data.hits.find((h: any) => h.id === "wwdc2024-10150"), "SwiftUI session present");
    }
    // 1b) wwdc_search — year filter applies in SQL, including total
    {
      const r = await call("wwdc_search", { query: "LanguageModelSession", kinds: ["session"], year: 2024, format: "json" });
      assert.ok(!r.isError, "wwdc_search year filter errored");
      const data = JSON.parse(textOf(r));
      assert.equal(data.total, 0);
      assert.equal(data.count, 0);
      assert.deepEqual(data.hits, []);
    }
    // 1c) wwdc_search — expanded session filters and judgment metadata
    {
      const r = await call("wwdc_search", {
        query: "declarative",
        kinds: ["session"],
        year_min: 2024,
        year_max: 2024,
        topics: ["SwiftUI"],
        platforms: ["visionOS"],
        require_transcript: true,
        detail: "detailed",
        judgment: true,
        format: "json",
      });
      assert.ok(!r.isError, "wwdc_search expanded filters errored");
      const data = JSON.parse(textOf(r));
      assert.equal(data.filters.year_min, 2024);
      assert.equal(data.filters.year_max, 2024);
      assert.deepEqual(data.filters.topics, ["SwiftUI"]);
      assert.deepEqual(data.filters.platforms, ["visionOS"]);
      assert.equal(data.filters.require_transcript, true);
      assert.ok(data.hits.find((h: any) => h.id === "wwdc2024-10150"), "filtered SwiftUI session present");
      assert.ok(data.hits.every((h: any) => h.year === 2024), "year range applied");
      assert.ok(data.hits[0].judgment.reasons.length >= 1, "per-hit judgment reasons");
      assert.ok(data.judgment.suggested_next_tools.includes("wwdc_get_session"), "overall judgment next tool");
    }
    // 1d) wwdc_search — no-hit judgment is explicit
    {
      const r = await call("wwdc_search", { query: "SwiftUI", kinds: ["session"], platforms: ["tvOS"], format: "json" });
      assert.ok(!r.isError, "wwdc_search no-hit filter errored");
      const data = JSON.parse(textOf(r));
      assert.equal(data.total, 0);
      assert.equal(data.count, 0);
      assert.equal(data.judgment.answer_readiness, "insufficient_context");
      assert.ok(data.judgment.suggested_next_tools.includes("wwdc_ingest_status"));
    }
    // 1e) wwdc_search — platform-only judgment stays cautious
    {
      const r = await call("wwdc_search", { query: "macOS", kinds: ["session"], format: "json" });
      assert.ok(!r.isError, "wwdc_search platform-only query errored");
      const data = JSON.parse(textOf(r));
      assert.ok(data.hits[0].platforms.includes("macOS"), "session platforms included");
      assert.equal(data.judgment.answer_readiness, "needs_follow_up");
      assert.ok(data.judgment.caveats.some((c: string) => c.includes("platform-only query")));
      assert.ok(data.hits[0].judgment.reasons.includes("query appears in platform metadata"));
    }
    // 1f) wwdc_search — indexed Apple docs
    {
      const r = await call("wwdc_search", { query: "declarative interfaces", kinds: ["doc"], format: "json" });
      assert.ok(!r.isError, "wwdc_search doc query errored");
      const data = JSON.parse(textOf(r));
      assert.ok(data.hits.find((h: any) => h.id === "swiftui/view"), "SwiftUI View doc present");
    }

    // 2) wwdc_list_years
    {
      const r = await call("wwdc_list_years", { format: "json" });
      const data = JSON.parse(textOf(r));
      assert.ok(data.years.find((y: any) => y.year === 2024));
      assert.ok(data.years.find((y: any) => y.year === 2025));
    }

    // 3) wwdc_list_topics
    {
      const r = await call("wwdc_list_topics", { format: "json", limit: 20 });
      const data = JSON.parse(textOf(r));
      assert.ok(data.topics.find((t: any) => t.topic === "SwiftUI"));
    }

    // 4) wwdc_list_pathways
    {
      const r = await call("wwdc_list_pathways", { format: "json" });
      const data = JSON.parse(textOf(r));
      assert.ok(data.pathways.find((p: any) => p.id === "swiftui-fundamentals"));
    }

    // 5) wwdc_get_pathway
    {
      const r = await call("wwdc_get_pathway", { id: "swiftui-fundamentals", format: "json" });
      const data = JSON.parse(textOf(r));
      assert.equal(data.id, "swiftui-fundamentals");
      assert.equal(data.steps.length, 1);
    }

    // 6) wwdc_get_session
    {
      const r = await call("wwdc_get_session", { id: "wwdc2024-10150", format: "json" });
      const data = JSON.parse(textOf(r));
      assert.equal(data.title, "SwiftUI essentials");
      assert.ok(data.transcript);
      assert.equal(data.judgment.coverage.has_transcript, true);
    }
    // 6a) wwdc_get_session — output controls
    {
      const r = await call("wwdc_get_session", {
        id: "wwdc2024-10150",
        include_chapters: false,
        include_sample_code: false,
        include_related_docs: false,
        transcript_chars: 500,
        format: "json",
      });
      const data = JSON.parse(textOf(r));
      assert.equal(data.deepLinks.length, 0);
      assert.equal(data.sampleCodeUrls.length, 0);
      assert.equal(data.relatedDocs.length, 0);
      assert.equal(data.judgment.coverage.chapter_count, 0);
      assert.equal(data.judgment.coverage.sample_code_count, 0);
      assert.equal(data.judgment.coverage.related_doc_count, 0);
      assert.ok(data.transcript.includes("truncated"), "transcript was truncated");
    }
    // 6b) not found
    {
      const r = await call("wwdc_get_session", { id: "nonexistent-9999", format: "markdown" });
      assert.ok(r.isError, "missing session → isError");
    }

    // 7) wwdc_session_deep_link — seconds
    {
      const r = await call("wwdc_session_deep_link", { id: "wwdc2024-10150", seconds: 125, format: "json" });
      const data = JSON.parse(textOf(r));
      assert.equal(data.seconds, 125);
      assert.ok(data.url.endsWith("?time=125"));
    }
    // 7b) timestamp
    {
      const r = await call("wwdc_session_deep_link", { id: "wwdc2024-10150", timestamp: "00:02:10", format: "json" });
      const data = JSON.parse(textOf(r));
      assert.equal(data.seconds, 130);
    }
    // 7c) MM:SS timestamp
    {
      const r = await call("wwdc_session_deep_link", { id: "wwdc2024-10150", timestamp: "02:10", format: "json" });
      const data = JSON.parse(textOf(r));
      assert.equal(data.seconds, 130);
    }
    // 7d) preserves existing query strings
    {
      const r = await call("wwdc_session_deep_link", { id: "wwdc2024-99999", seconds: 42, format: "json" });
      const data = JSON.parse(textOf(r));
      assert.ok(data.url.includes("foo=bar"));
      assert.ok(data.url.includes("time=42"));
      assert.ok(!data.url.includes("?foo=bar?time="));
    }
    // 7e) invalid timestamp
    {
      const r = await call("wwdc_session_deep_link", { id: "wwdc2024-10150", timestamp: "not-a-time", format: "markdown" });
      assert.ok(r.isError, "invalid timestamp → isError");
    }
    // 7f) error when neither
    {
      const r = await call("wwdc_session_deep_link", { id: "wwdc2024-10150", format: "markdown" });
      assert.ok(r.isError, "deep_link w/o seconds → isError");
    }

    // 8) wwdc_list_session_code
    {
      const r = await call("wwdc_list_session_code", { id: "wwdc2024-10150", format: "json" });
      const data = JSON.parse(textOf(r));
      assert.equal(data.count, 1);
      assert.equal(data.refs[0].kind, "zip");
    }

    // 9) wwdc_sample_code_grep
    {
      const r = await call("wwdc_sample_code_grep", { pattern: "swiftui-essentials", format: "json" });
      const data = JSON.parse(textOf(r));
      assert.equal(data.count, 1);
      assert.ok(data.hits[0].url.includes("swiftui-essentials"));
    }
    // 9b) regex
    {
      const r = await call("wwdc_sample_code_grep", { pattern: "\\.zip$", is_regex: true, format: "json" });
      const data = JSON.parse(textOf(r));
      assert.ok(data.count >= 1);
    }
    // 9c) invalid regex returns a tool error, not a protocol crash
    {
      const r = await call("wwdc_sample_code_grep", { pattern: "[", is_regex: true, format: "markdown" });
      assert.ok(r.isError, "invalid regex → isError");
      assert.match(textOf(r), /Invalid regex/);
    }

    // 10) apple_doc_lookup — offline (Ollama/network disabled). Accept either success or error, but should return a tool response (no protocol crash).
    {
      const r = await call("apple_doc_lookup", { path: "swiftui/view", format: "markdown" });
      // In offline CI the network call to developer.apple.com may fail; what matters is it degrades gracefully rather than crashing.
      assert.ok(r.content && r.content.length > 0, "apple_doc_lookup returns content");
    }
    // 10b) apple_doc_lookup rejects non-Apple URLs before fetch
    {
      const r = await call("apple_doc_lookup", { path: "https://example.com/documentation/swiftui/view", format: "markdown" });
      assert.ok(r.isError, "non-Apple doc URL → isError");
      assert.match(textOf(r), /developer\.apple\.com/);
    }

    // 10c) apple_doc_get — local indexed docs
    {
      const r = await call("apple_doc_get", { path: "swiftui/view", format: "json" });
      assert.ok(!r.isError, "apple_doc_get errored");
      const data = JSON.parse(textOf(r));
      assert.equal(data.id, "swiftui/view");
      assert.equal(data.title, "View");
      assert.ok(data.modules.includes("SwiftUI"));
    }

    // 11) apple_tutorial_get
    {
      const r = await call("apple_tutorial_get", { id: "swiftui", format: "json" });
      const data = JSON.parse(textOf(r));
      assert.equal(data.title, "Introducing SwiftUI");
    }
    // 11b) not found
    {
      const r = await call("apple_tutorial_get", { id: "does-not-exist", format: "markdown" });
      assert.ok(r.isError);
    }

    // 12) apple_hig_search
    {
      const r = await call("apple_hig_search", { query: "button", format: "json" });
      const data = JSON.parse(textOf(r));
      assert.ok(data.hits.length >= 1);
    }

    // 13) apple_swift_evolution_get
    {
      const r = await call("apple_swift_evolution_get", { id: "SE-0428", format: "json" });
      const data = JSON.parse(textOf(r));
      assert.equal(data.number, 428);
      assert.equal(data.status, "Implemented");
    }
    // 13b) not found
    {
      const r = await call("apple_swift_evolution_get", { id: "SE-9999", format: "markdown" });
      assert.ok(r.isError);
    }

    // 14) apple_swift_evolution_list
    {
      const r = await call("apple_swift_evolution_list", { format: "json", limit: 10 });
      const data = JSON.parse(textOf(r));
      assert.ok(data.rows.length >= 1);
      assert.equal(data.rows[0].id, "SE-0428");
    }
    // 14b) filter by status
    {
      const r = await call("apple_swift_evolution_list", { status: "Implemented", format: "json" });
      const data = JSON.parse(textOf(r));
      assert.ok(data.rows.every((r: any) => r.status === "Implemented"));
    }

    // 14c) apple_swift_pattern_find
    {
      const r = await call("apple_swift_pattern_find", {
        query: "SwiftUI declarative interfaces",
        platforms: ["macOS"],
        frameworks: ["SwiftUI"],
        year_min: 2024,
        format: "json",
      });
      assert.ok(!r.isError, "apple_swift_pattern_find errored");
      const data = JSON.parse(textOf(r));
      assert.ok(data.patterns.length >= 1, "pattern results exist");
      assert.ok(data.patterns.some((p: any) => p.sourceKinds.includes("session") || p.sourceKinds.includes("doc")), "pattern has source evidence");
      assert.ok(data.source_coverage.docs >= 1, "pattern includes docs coverage");
    }

    // 14d) apple_swift_book_get
    {
      const r = await call("apple_swift_book_get", { chapter: "concurrency", format: "json" });
      assert.ok(!r.isError, "apple_swift_book_get errored");
      const data = JSON.parse(textOf(r));
      assert.equal(data.id, "concurrency");
      assert.ok(data.body.includes("async functions"), "Swift book body returned");
    }

    // 14e) appstore_guidelines_search
    {
      const r = await call("appstore_guidelines_search", { query: "in-app purchase", format: "json" });
      assert.ok(!r.isError, "appstore_guidelines_search errored");
      const data = JSON.parse(textOf(r));
      assert.ok(data.hits.some((h: any) => h.id === "business-3-1-1"), "App Store guideline hit returned");
    }

    // 14f) apple_search_all should query joined FTS tables without ambiguous columns
    {
      const r = await call("apple_search_all", { query: "SwiftUI", format: "json" });
      assert.ok(!r.isError, "apple_search_all errored");
      const data = JSON.parse(textOf(r));
      assert.ok(Array.isArray(data.rows), "apple_search_all returns rows array");
      assert.ok(!textOf(r).includes("ambiguous column name"), "apple_search_all does not expose SQL ambiguity");
    }

    // 15) swift_app_audit
    {
      const r = await call("swift_app_audit", {
        focus: "navigation",
        platforms: ["macOS"],
        frameworks: ["SwiftUI"],
        feature: "buttons",
        year_min: 2024,
        format: "json",
      });
      assert.ok(!r.isError, "swift_app_audit errored");
      const data = JSON.parse(textOf(r));
      assert.equal(data.focus, "navigation");
      assert.ok(data.results.sessions.find((h: any) => h.id === "wwdc2024-10150"), "audit includes SwiftUI session");
      assert.ok(data.results.hig.find((h: any) => h.id === "buttons"), "audit includes HIG button guidance");
      assert.ok(data.results.docs.find((h: any) => h.id === "swiftui/view"), "audit includes indexed docs");
      assert.ok(data.validation.some((step: string) => step.includes("HIG")), "audit includes validation checklist");
      assert.ok(data.source_coverage.sessions >= 1, "audit includes source coverage");
      assert.ok(Array.isArray(data.doc_hints), "audit includes direct doc hints");
      assert.ok(Array.isArray(data.pathway_hints), "audit includes archetype pathway hints");
      assert.ok(Array.isArray(data.diagnostics.weak_hig_hits), "audit includes weak-hit diagnostics");
      assert.ok(["ready_for_code_review", "seed_context_only"].includes(data.summary.readiness));
    }

    // 15b) swift_app_audit surfaces concrete macOS archetype docs/pathways
    {
      const r = await call("swift_app_audit", {
        focus: "macos",
        platforms: ["macOS"],
        frameworks: ["AppKit", "NSScreen"],
        feature: "display brightness external monitors",
        year_min: 2024,
        format: "json",
      });
      assert.ok(!r.isError, "swift_app_audit display archetype errored");
      const data = JSON.parse(textOf(r));
      assert.ok(data.doc_hints.some((h: any) => h.id === "nsscreen"), "display archetype hints NSScreen docs");
      assert.ok(data.pathway_hints.some((p: any) => p.id === "macos-display-monitor-tools"), "display archetype hints pathway");
      assert.ok(data.validation.some((step: string) => step.includes("display")), "display archetype adds validation");
    }

    // 15c) swift_app_audit surfaces LocalizeShots/App Store screenshot archetype validation
    {
      const r = await call("swift_app_audit", {
        focus: "app-store",
        platforms: ["macOS"],
        frameworks: ["SwiftUI", "ScreenCaptureKit", "StoreKit"],
        feature: "LocalizeShots localized App Store screenshot capture and subscription review screenshots",
        year_min: 2024,
        format: "json",
      });
      assert.ok(!r.isError, "swift_app_audit LocalizeShots archetype errored");
      const data = JSON.parse(textOf(r));
      assert.ok(data.pathway_hints.some((p: any) => p.id === "app-store-localized-screenshot-workflows"), "LocalizeShots archetype hints pathway");
      assert.ok(data.doc_hints.some((h: any) => h.id === "screencapturekit"), "LocalizeShots archetype hints ScreenCaptureKit docs");
      assert.ok(data.validation.some((step: string) => step.includes("subscription review screenshots")), "LocalizeShots archetype adds subscription screenshot validation");
    }

    // 16) wwdc_ingest_status
    {
      const r = await call("wwdc_ingest_status", { format: "json" });
      const data = JSON.parse(textOf(r));
      assert.ok(data.status.find((s: any) => s.source === "wwdc"));
    }

    // 17) wwdc_security_manifest
    {
      const r = await call("wwdc_security_manifest", { format: "json" });
      assert.ok(!r.isError, "wwdc_security_manifest errored");
      const data = JSON.parse(textOf(r));
      assert.equal(data.tool_count, expected.length);
      assert.ok(data.tools.includes("wwdc_security_manifest"), "manifest includes itself");
      assert.match(data.tool_manifest_hash, /^[a-f0-9]{64}$/);
      assert.deepEqual(data.controls.destructive_tools, []);
    }

    console.log(`[mcp-e2e] all ${expected.length} tools exercised; assertions pass`);
  } finally {
    await client.close();
    if (fs.existsSync(dbPath)) fs.unlinkSync(dbPath);
  }
}

main().catch((e) => { console.error("[mcp-e2e] FAIL", e); process.exit(1); });
