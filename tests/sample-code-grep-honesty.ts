#!/usr/bin/env tsx
/**
 * wwdc_sample_code_grep honesty tests: matching used to be URL-only even
 * though the tool's own example ("find sessions with SwiftData") implies
 * content search, and a zero-hit result came back with no explanation of
 * what was searched. Matching now covers title + URL, and an empty result
 * names the searched corpus and suggests the browse tool.
 * Offline: spawns the built server against a temp DB.
 */

import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import assert from "node:assert/strict";
import { fileURLToPath } from "node:url";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";

import { openDb, migrate } from "../src/db/schema.js";
import { upsertSampleCode, upsertSession } from "../src/db/queries.js";
import type { WwdcSession } from "../src/types.js";

const __filename = fileURLToPath(import.meta.url);
const ROOT = path.resolve(path.dirname(__filename), "..");

const now = new Date().toISOString();

function session(id: string, year: number, title: string): WwdcSession {
  return {
    id,
    year,
    sessionNumber: id.split("-")[1] ?? "101",
    title,
    description: "Seeded session for sample-code grep tests.",
    url: `https://developer.apple.com/videos/play/wwdc${year}/${id.split("-")[1] ?? "101"}/`,
    duration: 60,
    topics: ["SwiftUI"],
    platforms: ["iOS"],
    speakers: [],
    transcript: "Session transcript fixture.",
    sampleCodeUrls: [],
    relatedDocs: [],
    videoUrl: undefined,
    deepLinks: [],
    updatedAt: now,
  };
}

function seedDb(dbPath: string): void {
  const db = openDb(dbPath);
  migrate(db);
  upsertSession(db, session("wwdc2024-10150", 2024, "SwiftUI essentials"));
  upsertSession(db, session("wwdc2025-286", 2025, "Meet Foundation Models"));
  upsertSampleCode(db, {
    id: "wwdc2024-10150::sc1",
    sessionId: "wwdc2024-10150",
    title: "SwiftUI essentials sample",
    url: "https://developer.apple.com/tutorials/sample-code/swiftui-essentials.zip",
    kind: "zip",
  });
  upsertSampleCode(db, {
    id: "wwdc2025-286::sc1",
    sessionId: "wwdc2025-286",
    title: "Meet Foundation Models sample",
    url: "https://developer.apple.com/tutorials/sample-code/meet-foundation-models.zip",
    kind: "zip",
  });
  db.close();
}

async function callGrep(
  dbPath: string,
  args: Record<string, unknown>,
): Promise<{ json: any; text: string }> {
  const transport = new StdioClientTransport({
    command: "node",
    args: [path.join(ROOT, "dist", "index.js")],
    env: {
      ...(process.env as Record<string, string>),
      WWDC_MCP_DB: dbPath,
      WWDC_SKIP_EMBEDDINGS: "1",
    },
    stderr: "ignore",
  });
  const client = new Client(
    { name: "sample-code-grep-honesty", version: "0.0.1" },
    { capabilities: {} },
  );
  await client.connect(transport);
  try {
    const r: any = await client.callTool({
      name: "wwdc_sample_code_grep",
      arguments: args,
    });
    assert.ok(!r.isError, "wwdc_sample_code_grep errored");
    const text = r.content[0].text as string;
    let json: any = null;
    try {
      json = JSON.parse(text);
    } catch {
      /* markdown format: text is not JSON, and that's expected */
    }
    return { json, text };
  } finally {
    await client.close();
  }
}

async function main(): Promise<void> {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "wwdc-grep-test-"));
  try {
    const dbPath = path.join(dir, "seeded.db");
    seedDb(dbPath);

    // A) No match: the empty result explains what was searched.
    const a = await callGrep(dbPath, {
      pattern: "zzz_no_match_zzz",
      format: "json",
    });
    assert.equal(a.json.count, 0);
    assert.equal(a.json.searched.refs, 2);
    assert.deepEqual(a.json.searched.fields, ["title", "url"]);
    const aMd = await callGrep(dbPath, {
      pattern: "zzz_no_match_zzz",
      format: "markdown",
    });
    assert.match(aMd.text, /No sample-code refs match/);
    assert.match(aMd.text, /wwdc_sample_code_list/);
    console.log("  ok  zero-hit grep explains the searched corpus and next step");

    // B) Title-only match (previously invisible: URLs carry no spaces).
    const b = await callGrep(dbPath, {
      pattern: "Foundation Models sample",
      format: "json",
    });
    assert.equal(b.json.count, 1);
    assert.equal(b.json.hits[0].session_id, "wwdc2025-286");
    console.log("  ok  title-only match now found");

    // C) URL match unchanged.
    const c = await callGrep(dbPath, {
      pattern: "swiftui-essentials",
      format: "json",
    });
    assert.equal(c.json.count, 1);
    console.log("  ok  URL matching unchanged");

    // D) Regex matches titles too.
    const d = await callGrep(dbPath, {
      pattern: "^Meet",
      is_regex: true,
      format: "json",
    });
    assert.equal(d.json.count, 1);
    assert.equal(d.json.searched.mode, "regex");
    console.log("  ok  regex covers titles as well as URLs");

    console.log("[sample-code-grep-honesty] all assertions pass");
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
}

main().catch((err) => {
  console.error("[sample-code-grep-honesty] FAILED:", err);
  process.exit(1);
});
