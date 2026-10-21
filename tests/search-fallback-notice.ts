#!/usr/bin/env tsx
/**
 * wwdc_search any-term fallback disclosure tests (TestLabs Job 6, GAP-01):
 * when the strict all-terms search matches nothing and the labeled any-term
 * fallback returns partial hits, the no-hit must be stated FIRST and in the
 * answer itself — a top-level `notice` in JSON and a visible notice line
 * above the hits in markdown — not only in the machine `fallback` field or
 * a caveat nested under judgment. A query naming a session that does not
 * exist must never present partial matches as if they answered it.
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
import { upsertSession } from "../src/db/queries.js";
import type { WwdcSession } from "../src/types.js";

const __filename = fileURLToPath(import.meta.url);
const ROOT = path.resolve(path.dirname(__filename), "..");

const now = new Date().toISOString();

function session(
  id: string,
  year: number,
  title: string,
  topics: string[],
  transcript: string,
): WwdcSession {
  return {
    id,
    year,
    sessionNumber: id.split("-")[1] ?? "101",
    title,
    description: "Seeded session for fallback-notice tests.",
    url: `https://developer.apple.com/videos/play/wwdc${year}/${id.split("-")[1] ?? "101"}/`,
    duration: 60,
    topics,
    platforms: ["iOS"],
    speakers: [],
    transcript,
    sampleCodeUrls: [],
    relatedDocs: [],
    videoUrl: undefined,
    deepLinks: [],
    updatedAt: now,
  };
}

async function callSearch(
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
    { name: "search-fallback-notice", version: "0.0.1" },
    { capabilities: {} },
  );
  await client.connect(transport);
  try {
    const r: any = await client.callTool({
      name: "wwdc_search",
      arguments: args,
    });
    assert.ok(!r.isError, "wwdc_search errored");
    const text = r.content[0].text as string;
    let json: any = null;
    try {
      json = JSON.parse(text);
    } catch {
      /* markdown: not JSON */
    }
    return { json, text };
  } finally {
    await client.close();
  }
}

async function main(): Promise<void> {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "wwdc-fallback-notice-"));
  try {
    const dbPath = path.join(dir, "seeded.db");
    const db = openDb(dbPath);
    migrate(db);
    upsertSession(
      db,
      session(
        "wwdc2025-286",
        2025,
        "Meet Foundation Models",
        ["Foundation Models"],
        "Foundation Models on-device fixture text.",
      ),
    );
    upsertSession(
      db,
      session(
        "wwdc2024-101",
        2024,
        "SwiftUI essentials",
        ["SwiftUI"],
        "SwiftUI essentials fixture text.",
      ),
    );
    db.close();

    // A) Named, nonexistent session: fallback hits carry a first-class notice.
    const a = await callSearch(dbPath, {
      query: "Meet the new SiriKit design language",
      kinds: ["session"],
      format: "json",
    });
    assert.equal(a.json.fallback, "or_relaxed");
    assert.ok(a.json.total >= 1, "fallback should return partial hits");
    assert.equal(typeof a.json.notice, "string", "JSON must carry a top-level notice");
    assert.match(a.json.notice, /No result matched the full query/);
    assert.match(a.json.notice, /partial matches/i);
    console.log("  ok  JSON: top-level notice states the no-hit before partial hits");

    // B) Markdown: the notice line appears BEFORE the first hit.
    const b = await callSearch(dbPath, {
      query: "Meet the new SiriKit design language",
      kinds: ["session"],
    });
    const noticeAt = b.text.indexOf("No full match.");
    const hitAt = b.text.indexOf("Meet Foundation Models");
    assert.ok(noticeAt >= 0, "markdown must carry the notice line");
    assert.ok(hitAt > noticeAt, "notice must precede the hits it qualifies");
    console.log("  ok  markdown: notice line precedes the partial hits");

    // C) A fully matching query: no fallback, no notice noise.
    const c = await callSearch(dbPath, {
      query: "Foundation Models",
      kinds: ["session"],
      format: "json",
    });
    assert.ok(c.json.total >= 1);
    assert.equal(c.json.fallback, undefined);
    assert.equal(c.json.notice, undefined);
    console.log("  ok  matching query gets no fallback notice");

    console.log("[search-fallback-notice] all assertions pass");
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
}

main().catch((err) => {
  console.error("[search-fallback-notice] FAILED:", err);
  process.exit(1);
});
