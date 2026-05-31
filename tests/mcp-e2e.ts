#!/usr/bin/env tsx
/**
 * MCP end-to-end test — spawns the built server over stdio, speaks the
 * real MCP protocol via @modelcontextprotocol/sdk Client, exercises every
 * one of the 15 registered tools, asserts on results.
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
  upsertSampleCode, upsertPathway, recordIngest,
} from "../src/db/queries.js";
import type {
  WwdcSession, HigEntry, SwiftEvolutionProposal, Pathway,
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
    transcript: "SwiftUI gives you a declarative syntax to describe your UI. Views, state, and bindings.",
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
  upsertSession(db, s1);
  upsertSession(db, s2);

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

  recordIngest(db, "wwdc", 2, 0, "seeded");
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
    // 0) listTools must return all 15
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
      "apple_tutorial_get",
      "apple_hig_search",
      "apple_swift_evolution_get",
      "apple_swift_evolution_list",
      "wwdc_ingest_status",
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
    // 7d) invalid timestamp
    {
      const r = await call("wwdc_session_deep_link", { id: "wwdc2024-10150", timestamp: "not-a-time", format: "markdown" });
      assert.ok(r.isError, "invalid timestamp → isError");
    }
    // 7e) error when neither
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

    // 15) wwdc_ingest_status
    {
      const r = await call("wwdc_ingest_status", { format: "json" });
      const data = JSON.parse(textOf(r));
      assert.ok(data.status.find((s: any) => s.source === "wwdc"));
    }

    console.log("[mcp-e2e] all 15 tools exercised; assertions pass");
  } finally {
    await client.close();
    if (fs.existsSync(dbPath)) fs.unlinkSync(dbPath);
  }
}

main().catch((e) => { console.error("[mcp-e2e] FAIL", e); process.exit(1); });
