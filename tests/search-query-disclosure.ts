#!/usr/bin/env tsx
/**
 * wwdc_search query-narrowing disclosure tests: ftsQuote dedupes repeated
 * terms and caps execution at MAX_QUERY_TOKENS unique terms, but the
 * response used to echo the raw query as if that exact query had run. When
 * the executed query differs, the response must now disclose it
 * (query_normalization + a judgment caveat). Ordinary queries are
 * byte-identical to before.
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

function session(id: string, year: number): WwdcSession {
  return {
    id,
    year,
    sessionNumber: id.split("-")[1] ?? "101",
    title: `SwiftUI session ${id}`,
    description: "Seeded session for query-disclosure tests.",
    url: `https://developer.apple.com/videos/play/wwdc${year}/${id.split("-")[1] ?? "101"}/`,
    duration: 60,
    topics: ["SwiftUI"],
    platforms: ["iOS"],
    speakers: [],
    transcript: "SwiftUI lists and navigation fixture text.",
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
): Promise<any> {
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
    { name: "search-query-disclosure", version: "0.0.1" },
    { capabilities: {} },
  );
  await client.connect(transport);
  try {
    const r: any = await client.callTool({
      name: "wwdc_search",
      arguments: { format: "json", ...args },
    });
    assert.ok(!r.isError, "wwdc_search errored");
    return JSON.parse(r.content[0].text);
  } finally {
    await client.close();
  }
}

async function main(): Promise<void> {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "wwdc-query-test-"));
  try {
    const dbPath = path.join(dir, "seeded.db");
    const db = openDb(dbPath);
    migrate(db);
    upsertSession(db, session("wwdc2024-101", 2024));
    upsertSession(db, session("wwdc2025-101", 2025));
    db.close();

    // A) 40 distinct terms: execution caps at 32; the response must say so.
    const forty = Array.from({ length: 40 }, (_, i) => `term${String(i + 1).padStart(2, "0")}`).join(" ");
    const a = await callSearch(dbPath, { query: forty, kinds: ["session"] });
    assert.equal(a.query, forty, "raw query stays echoed verbatim");
    assert.equal(a.query_normalization.rawTokens, 40);
    assert.equal(a.query_normalization.executedTokens, 32);
    assert.equal(a.query_normalization.capped, true);
    assert.ok(
      (a.judgment?.caveats ?? []).some((c: string) =>
        c.includes("limited to the first 32 unique terms"),
      ),
      "caveat discloses the token cap",
    );
    console.log("  ok  over-long query discloses the 32-term execution cap");

    // B) Duplicate terms: dedupe disclosed, counts shown.
    const b = await callSearch(dbPath, {
      query: "SwiftUI SwiftUI navigation",
      kinds: ["session"],
    });
    assert.equal(b.total, 2);
    assert.equal(b.query_normalization.rawTokens, 3);
    assert.equal(b.query_normalization.executedTokens, 2);
    assert.equal(b.query_normalization.deduped, 1);
    assert.equal(b.query_normalization.capped, false);
    assert.ok(
      (b.judgment?.caveats ?? []).some((c: string) =>
        c.includes("removed 1 duplicate term"),
      ),
      "caveat discloses the dedupe",
    );
    console.log("  ok  duplicate-term query discloses the dedupe");

    // C) Ordinary query: no normalization block, shape unchanged.
    const c = await callSearch(dbPath, {
      query: "SwiftUI navigation",
      kinds: ["session"],
    });
    assert.equal(c.query_normalization, undefined);
    assert.ok(
      !(c.judgment?.caveats ?? []).some((s: string) =>
        s.includes("Query narrowed"),
      ),
    );
    console.log("  ok  ordinary query response shape unchanged");

    console.log("[search-query-disclosure] all assertions pass");
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
}

main().catch((err) => {
  console.error("[search-query-disclosure] FAILED:", err);
  process.exit(1);
});
