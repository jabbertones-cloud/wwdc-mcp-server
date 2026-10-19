#!/usr/bin/env tsx
/**
 * B2 anti-extraction regressions (STD-OUT-1):
 * swift_app_audit must not return a raw `confidence` field — internally
 * computed confidence may only leave the server as a coarse readiness
 * band (high / medium / low). Covers both output formats (JSON payload
 * and markdown) and the per-hit judgment objects embedded in the
 * audit's session results.
 */
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import assert from "node:assert/strict";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";

import { openDb, migrate, rebuildFts } from "../src/db/schema.js";
import { recordCorpusVersion } from "../src/db/corpus.js";
import {
  upsertSession, upsertHig, upsertAppleDoc, recordIngest,
} from "../src/db/queries.js";
import { createWwdcServer } from "../src/server.js";
import type { WwdcSession, HigEntry, AppleDocPage } from "../src/types.js";

function seedDb(dbPath: string) {
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
    sampleCodeUrls: [],
    relatedDocs: ["https://developer.apple.com/documentation/swiftui"],
    videoUrl: undefined,
    deepLinks: [],
    updatedAt: now,
  };
  upsertSession(db, s1);
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
    topicSections: ["Essentials"],
    references: [],
    rawJson: "{}",
    updatedAt: now,
  };
  upsertAppleDoc(db, doc);
  recordIngest(db, "wwdc", 1, 0, "seeded");
  recordIngest(db, "docs", 1, 0, "seeded");
  recordIngest(db, "hig", 1, 0, "seeded");
  rebuildFts(db);
  recordCorpusVersion(db, "all", "anti-extraction-seed");
  return db;
}

function textOf(r: { content?: Array<{ text?: string }> }): string {
  return (r.content ?? []).map((c) => c.text ?? "").join("\n");
}

async function main(): Promise<void> {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "wwdc-b2-"));
  const db = seedDb(path.join(dir, "wwdc.db"));
  const server = createWwdcServer(db);
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
  const client = new Client({ name: "wwdc-b2-test", version: "0.0.1" }, { capabilities: {} });
  await server.connect(serverTransport);
  await client.connect(clientTransport);
  try {
    // JSON format: summary carries a coarse band, never a confidence field.
    const r = (await client.callTool({
      name: "swift_app_audit",
      arguments: {
        focus: "navigation",
        platforms: ["macOS"],
        frameworks: ["SwiftUI"],
        feature: "buttons",
        year_min: 2024,
        format: "json",
      },
    })) as { content?: Array<{ text?: string }>; isError?: boolean };
    assert.ok(!r.isError, "swift_app_audit errored");
    const raw = textOf(r);
    const data = JSON.parse(raw);
    assert.ok(data.summary, "audit returns a summary");
    assert.ok(
      !("confidence" in data.summary),
      `summary must not expose raw confidence (got keys: ${Object.keys(data.summary).join(",")})`,
    );
    assert.ok(
      ["high", "medium", "low"].includes(data.summary.readiness_band),
      `summary.readiness_band must be a high/medium/low band (got ${String(data.summary.readiness_band)})`,
    );
    assert.ok(
      !raw.includes('"confidence"'),
      "no confidence field anywhere in the audit JSON payload (incl. per-hit judgments)",
    );
    for (const hit of data.results?.sessions ?? []) {
      assert.ok(!("judgment" in hit) || !("confidence" in (hit.judgment ?? {})),
        "per-hit audit judgments must not expose confidence");
    }
    assert.ok(["ready_for_code_review", "seed_context_only", "insufficient_context"].includes(data.summary.readiness),
      "existing coarse readiness verdict is preserved");

    // Markdown format: band line, no confidence line.
    const md = (await client.callTool({
      name: "swift_app_audit",
      arguments: {
        focus: "navigation",
        platforms: ["macOS"],
        frameworks: ["SwiftUI"],
        feature: "buttons",
        year_min: 2024,
        format: "markdown",
      },
    })) as { content?: Array<{ text?: string }>; isError?: boolean };
    assert.ok(!md.isError, "swift_app_audit (markdown) errored");
    const mdText = textOf(md);
    assert.ok(mdText.includes("readiness band:"), "markdown reports the readiness band");
    assert.ok(!mdText.includes("confidence:"), "markdown must not report confidence");

    console.log("[anti-extraction] swift_app_audit exposes readiness_band only, no confidence (json + markdown)");

    // ---- W3: the same STD-OUT-1 rule for every other judgment surface ----
    // wwdc_search: per-hit + overall judgment must ship as relevance_band,
    // and no hit may carry a raw numeric BM25/vector `score`.
    const search = (await client.callTool({
      name: "wwdc_search",
      arguments: { query: "SwiftUI", format: "json", detail: "detailed" },
    })) as { content?: Array<{ text?: string }>; isError?: boolean };
    assert.ok(!search.isError, "wwdc_search errored");
    const searchRaw = textOf(search);
    const searchData = JSON.parse(searchRaw);
    assert.ok(!searchRaw.includes('"confidence"'), "wwdc_search JSON must not contain a confidence field");
    assert.ok(!searchRaw.includes('"score"'), "wwdc_search JSON must not contain a raw score field");
    assert.ok(
      ["high", "medium", "low"].includes(searchData.judgment?.relevance_band),
      `wwdc_search judgment must carry relevance_band (got ${JSON.stringify(searchData.judgment)})`,
    );
    for (const hit of searchData.hits ?? []) {
      assert.ok(!("score" in hit), "search hits must not expose a raw score");
      if (hit.judgment) {
        assert.ok(["high", "medium", "low"].includes(hit.judgment.relevance_band),
          "per-hit judgment must carry relevance_band, not confidence");
      }
    }
    const searchMd = (await client.callTool({
      name: "wwdc_search",
      arguments: { query: "SwiftUI", format: "markdown", detail: "detailed" },
    })) as { content?: Array<{ text?: string }>; isError?: boolean };
    assert.ok(!searchMd.isError, "wwdc_search (markdown) errored");
    assert.ok(!textOf(searchMd).includes("confidence:"), "wwdc_search markdown must not report confidence");
    assert.ok(textOf(searchMd).includes("relevance band:"), "wwdc_search markdown reports the relevance band");

    // wwdc_get_session: session judgment must ship as coverage_band.
    const session = (await client.callTool({
      name: "wwdc_get_session",
      arguments: { id: "wwdc2024-10150", format: "json" },
    })) as { content?: Array<{ text?: string }>; isError?: boolean };
    assert.ok(!session.isError, "wwdc_get_session errored");
    const sessionRaw = textOf(session);
    const sessionData = JSON.parse(sessionRaw);
    assert.ok(!sessionRaw.includes('"confidence"'), "wwdc_get_session JSON must not contain a confidence field");
    assert.ok(
      ["high", "medium", "low"].includes(sessionData.judgment?.coverage_band),
      `wwdc_get_session judgment must carry coverage_band (got ${JSON.stringify(sessionData.judgment)})`,
    );

    // apple_swift_pattern_find: pattern judgment must ship as evidence_band,
    // and its evidence hits must not carry raw scores.
    const pattern = (await client.callTool({
      name: "apple_swift_pattern_find",
      arguments: { query: "buttons", format: "json" },
    })) as { content?: Array<{ text?: string }>; isError?: boolean };
    assert.ok(!pattern.isError, "apple_swift_pattern_find errored");
    const patternRaw = textOf(pattern);
    const patternData = JSON.parse(patternRaw);
    assert.ok(!patternRaw.includes('"confidence"'), "apple_swift_pattern_find JSON must not contain a confidence field");
    assert.ok(!patternRaw.includes('"score"'), "apple_swift_pattern_find JSON must not contain a raw score field");
    assert.ok(
      ["high", "medium", "low"].includes(patternData.judgment?.evidence_band),
      `apple_swift_pattern_find judgment must carry evidence_band (got ${JSON.stringify(patternData.judgment)})`,
    );

    // apple_hig_search: plain corpus hits must not carry raw scores either.
    const higSearch = (await client.callTool({
      name: "apple_hig_search",
      arguments: { query: "buttons", format: "json" },
    })) as { content?: Array<{ text?: string }>; isError?: boolean };
    assert.ok(!higSearch.isError, "apple_hig_search errored");
    const higRaw = textOf(higSearch);
    assert.ok(!higRaw.includes('"score"'), "apple_hig_search JSON must not contain a raw score field");

    console.log("[anti-extraction] W3: search/session/pattern judgments expose bands only; no confidence, no raw score (json + markdown)");
  } finally {
    await client.close().catch(() => undefined);
    await server.close().catch(() => undefined);
    db.close();
    fs.rmSync(dir, { recursive: true, force: true });
  }
}

main().catch((error) => {
  console.error("[anti-extraction] FAIL", error);
  process.exit(1);
});
